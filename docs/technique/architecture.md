# Architecture

## Stack

| Couche | Technologie | Pourquoi |
|--------|-------------|----------|
| Frontend | Angular 21 + Angular Material | Standalone components, signals, framework robuste pour dashboards |
| Backend | Kotlin + Spring Boot | Typage fort, null-safety, excellent écosystème JVM |
| Build | Gradle (Kotlin DSL) | Standard Kotlin/Spring, scripts typés |
| IA (défaut) | Claude API — Anthropic | Compréhension du langage naturel financier, JSON structuré fiable, raisonnement nettement supérieur à un 7B local |
| IA (backup local) | Ollama + `qwen2.5:3b` (3B Instruct) | Développement offline / sans clé API. Pas le défaut depuis la Phase 1. Mistral 7B était l'ancien défaut local mais trop lent sur M1 (timeouts) |
| Data marché | Twelve Data (REST + apikey) | Source primaire Phase 1+. Free tier 800 credits/jour, TSX natif, JSON documenté |
| Data marché (dev / CI) | `MockMarketChartClient` (synthétique) | Défaut sans clé : 260 bars OHLC déterministes par symbole. Onboarding et CI |
| News par ticker | Finnhub (REST + apikey) | Phase 2. Twelve Data ne couvre pas les news. Free tier 60 calls/min, agrégation Reuters / Bloomberg / CNBC. Voir [`providers.md`](./providers.md) |
| News (dev / CI) | `MockNewsClient` (synthétique) | Défaut sans clé, sélectionné par `news.provider: mock`. Headlines déterministes par symbole, économise le quota Finnhub en itération |
| Base de données | PostgreSQL | Schéma relationnel, snapshots historiques, Flyway pour les migrations |
| Infra locale | Tilt + Docker Compose | Hot reload backend/frontend, reset BDD en un clic |
| CI | GitHub Actions | Workflows backend (Gradle + PostgreSQL), frontend (Vitest), CodeQL, déploiement docs. Détails : [`ops.md`](./ops.md) |

## Vue d'ensemble

```
┌────────────────────────────────────────────┐
│         Sources de données                  │
│  Twelve Data (REST + apikey, défaut prod)   │
│  Finnhub (news + analyst recos, Phase 2)    │
│  Mock local (synthétique, défaut CI / sans clé) │
└──────────────────┬─────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────┐
│         Backend  (Kotlin + Spring)          │
│                                             │
│  market/      → 3 ports : chart + symb.search│
│                 + sector + indicateurs       │
│  analysis/    → narratif LLM par ticker     │
│  portfolio/   → import CSV, snapshots       │
│  watchlist/   → tickers suivis (Phase 2)    │
│  news/        → Finnhub + mock (Phase 2)    │
│  analyst/     → recos analystes Finnhub +   │
│                 mock (Phase 2)              │
│  earnings/    → résultats trimestriels +    │
│                 next-date (Phase 2)         │
│  config/      → runtime overrides (Phase 2) │
│  shared/      → utilitaires transverses     │
└──────────────────┬─────────────────────────┘
                   │ REST API
                   ▼
┌────────────────────────────────────────────┐
│         Frontend  (Angular 21)              │
│                                             │
│  features/                                  │
│    dashboard/    → portefeuille + lien      │
│                    vers dossiers ticker     │
│    ticker/       → dossier par symbole      │
│    import/       → drag & drop CSV          │
│    suivi/        → timeline snapshots       │
│    settings/     → configuration runtime +  │
│                    prompt preview           │
│  core/                                      │
│    *.repository.ts (ports)                  │
│    adapters/*.http.ts                       │
└────────────────────────────────────────────┘
```

## Modules backend

### `market/` — Phase 1, étendu Phase 2

Source primaire des données ticker. Trois ports outbound cohabitent dans le module — `MarketChartClient` et `SymbolSearchClient` ont chacun un triplet `TwelveData* + Mock* + Routing*` (`@Primary`) sélectionné par `market.provider` ; le port `SectorClassifier` dévie côté live vers `FinnhubSectorClassifier` (Twelve Data `/profile` est paid-tier only) avec son propre `Routing*` qui route mock vs Finnhub. Détails des trois familles ci-dessous.

#### Ports + adapters

- **`MarketChartClient`** (port, Phase 1) — interface qui retourne un `MarketChart` (quote + bars OHLC) en types domaine. La `TickerQuote` porte un champ `instrumentType: InstrumentType?` (enum `STOCK | ETF | INDEX | OTHER`, depuis 2026-05-06) consommé par le front pour gater **trois affordances** réservées aux actions individuelles : (1) le toggle « Sector » du chart benchmark, (2) la section « Fondamentaux » entière du dossier (recommandations analystes + earnings), (3) les fetches `loadAnalyst` / `loadEarnings` qui ne sont plus lancés à l'init mais depuis le success callback de `load()` quand `instrumentType === 'STOCK'`. **Dégrade fermé** : null/undefined/ETF/INDEX/OTHER → tout est masqué et aucune Finnhub API call n'est consommée pour rien. Le choix initial (degrade-open, 2026-05-06) a été inversé le 2026-05-07 après observation que le toggle leakait sur des ETFs dont le type n'arrivait pas dans le `null` window initial. **Source du type** côté Twelve Data : `quote.type` quand non-blank, sinon fallback sur `seriesResponse.meta?.type` du `/time_series` — observé que `/quote` ne renvoie pas `type` sur le free tier (NVDA → null) alors que `/time_series.meta.type` carry « Common Stock » de façon fiable. Le mock tag les ~17 ETFs courants (SPDR + broad market) et défaut STOCK ailleurs.
  - `TwelveDataClient` (`twelvedata`) — REST + apikey, défaut prod. Deux appels par dossier (`/time_series` + `/quote`), parsing tolérant aux quirks (numériques en strings, erreurs renvoyées en HTTP 200 avec `status: error`).
  - `MockMarketChartClient` (`mock`, défaut sans clé) — série OHLC synthétique déterministe par symbole. Symboles réservés `UNKNOWN` (404) et `RATELIMIT` (503) pour les chemins d'erreur UI.
  - `RoutingMarketChartClient` (`@Primary`, Phase 2) — délègue à l'adapter actif lu via `appConfig.getString(market.provider)` à chaque appel.
- **`SymbolSearchClient`** (port, Phase 2 watchlist v2) — autocomplete des tickers existants pour valider la saisie watchlist.
  - `TwelveDataSymbolSearchClient` — REST `/symbol_search` (1 credit/call).
  - `MockSymbolSearchClient` — ~30 symbols US/TSX seedés (prefix match symbol + substring match name), paths réservés `RATELIMIT` et `UNKNOWN`.
  - `RoutingSymbolSearchClient` (`@Primary`).
- **`SectorClassifier`** (port, Phase 2 benchmark v2) — résout un ticker à un `SectorBenchmark` (sector GICS canonique + SPDR ETF + nom complet). Backe l'overlay « Sector » du chart dossier ticker.
  - `FinnhubSectorClassifier` — REST `/stock/profile2` (free tier 60 calls/min), parse le champ `finnhubIndustry`, route via `SpdrSectorEtfs` pour le mapping GICS → SPDR. **Remplace `TwelveDataSectorClassifier`** depuis 2026-05-06 — Twelve Data `/profile` est paid-tier only sur les comptes free, ce qui rendait la feature inutilisable. Finnhub `/stock/profile2` couvre le même besoin sur le free tier et partage la clé déjà câblée pour news / analyst / earnings.
  - `MockSectorClassifier` — table hand-curée ~25 tickers populaires US/TSX (AAPL→Tech, JPM→Financials, RY.TO→Financials, etc.), paths réservés `UNKNOWN` (404) et `RATELIMIT` (503).
  - `RoutingSectorClassifier` (`@Primary`) — route `mock` → mock, `twelvedata` (live mode) → Finnhub. Le toggle reste binaire mock/live et `market.provider` continue de driver les autres routes (chart, symbol-search) vers Twelve Data ; seul le sector dévie vers Finnhub côté implémentation. Détail caché derrière le `RoutingSectorClassifier`, pas de nouveau runtime key (pas de `sector.provider`).

#### Domain helpers

- **`IndicatorCalculator`** — Kotlin pur, sans dépendance Spring. Calcule RSI(14), MA50/MA200, momentum 30j/90j, perf 1m/3m/1y/YTD, drawdown 52w, volume relatif, position vs MA. Testable unit, sans BDD.
- **`SpdrSectorEtfs`** (`internal object`, Phase 2) — table qui mappe les 11 GICS sectors couverts par SPDR Select Sector (Technology→XLK, Financials→XLF, Healthcare→XLV, Energy→XLE, Consumer Discretionary→XLY, Consumer Staples→XLP, Communication Services→XLC, Industrials→XLI, Materials→XLB, Real Estate→XLRE, Utilities→XLU) + table de synonymes pour les variations provider (« Information Technology » → « Technology », « Health Care » → « Healthcare », « Consumer Cyclical » → « Consumer Discretionary »…). Sector hors mapping → `null` → 404 inline côté front (« no sector benchmark available »).

#### Services applicatifs

- **`SymbolSearchService`** (Phase 2) — wrap `SymbolSearchClient` avec `@Cacheable("symbol-search")` ; expose aussi `validate(symbol)` (match exact case-insensitive) consommé par `WatchlistService.add`.
- **`SectorClassifierService`** (Phase 2) — wrap `SectorClassifier` avec `@Cacheable("sector-by-symbol")`. SpEL key `#symbol.trim().toUpperCase()` (méthode Java, idem que les autres caches du module — SpEL ne voit pas l'extension Kotlin `uppercase()`).

#### Endpoints REST

- `GET /api/market/ticker/{symbol}` — dossier complet (quote + indicateurs + bars 1Y daily).
- `GET /api/market/ticker/{symbol}/chart?timeframe={1d|5d|1mo|3mo|1y|5y}` — bars seuls pour le toggle multi-timeframe du graphe ; ne recalcule pas les indicateurs ni ne re-prompte le LLM, qui restent ancrés sur la 1Y daily du dossier. Whitelist côté serveur via l'enum `Timeframe` du domain — codes inconnus → 400 (défense de la clé Caffeine contre les valeurs non bornées).
- `GET /api/market/ticker/{symbol}/sector-benchmark` — Phase 2 benchmark v2. Résout le SPDR sector ETF du ticker. Réponse `{tickerSymbol, sector, etfSymbol, etfName}`. 404 si symbol unknown OU sector hors SPDR mapping. Le front re-utilise ensuite `GET .../chart?timeframe=` avec l'`etfSymbol` pour fetch les bars de l'overlay.
- `GET /api/market/symbols/search?q={query}&limit={n}` — Phase 2 watchlist v2. Autocomplete des tickers, réponse `[{symbol, name, exchange}]`.

#### Caches Caffeine

`MarketConfig` déclare 6 caches partagés : `market-chart` (chart endpoint), `news-by-symbol` (module `news/`), `symbol-search` (autocomplete watchlist), `sector-by-symbol` (sector classifier), `analyst-recommendations` (module `analyst/`) et `earnings` (module `earnings/`). Tous partagent le TTL piloté par `market.cache.ttl-minutes` (5–60 min, runtime-éditable depuis `/settings/configuration`).

### `analysis/` — Phase 1 réécrite

Le pipeline d'analyse en Phase 1 produit un **narratif LLM par ticker**, pas une recommandation portefeuille.

- `TickerNarrativeService` — point d'entrée : dedup d'un job pending sur le même symbole, réutilisation d'un snapshot frais (< 30 min), sinon kick async.
- `TickerNarrativeRunner` (`@Async` séparé pour respecter le proxy Spring) — exécute hors thread HTTP.
- `TickerNarrativeExecutor` — orchestrate : `MarketChartClient.fetchChart` → `IndicatorCalculator` → `buildNarrativeUserMessage` → `LlmClient.complete` → `TickerNarrativeParser` → `TickerNarrativeValidator` → `TickerNarrativePersister`. Parse + validate + 1 retry avec les erreurs en feedback.
- `TickerNarrativeParser` — parse `{summary, sentiment, keyPoints[]}` tolérant aux fences markdown, prose alentour, sentiment mixed-case.
- `TickerNarrativeValidator` — règles strictes : 3-5 keyPoints, ≤15 mots/bullet, summary 2-3 phrases, sentiment ∈ enum.
- Persistance dans `TickerNarrativeSnapshot` : `{symbol, generatedAt, price, indicatorsJson, summary, sentiment, keyPointsJson, modelUsed, promptVersion, promptTemplateId}` — append-only, permet la relecture a posteriori. `promptTemplateId` (FK `prompt_template`, V8) ajouté en Phase 3 prompt-management pour le lookup des stats agrégées ; `promptVersion` (string) reste pour la trace historique.
- Job tracking dans `TickerNarrativeJob` (status BDD `PENDING / DONE / ERROR`) pour le suivi du job côté front. Transport SSE depuis Phase 2.5 — voir le bloc `Server-Sent Events` ci-dessous pour la granularité par phase.
- **Server-Sent Events (Phase 2.5)** — quatre nouveaux artefacts pour streamer la progression du pipeline narratif au front en push : `domain/JobPhase` (enum 9 valeurs `LOADING_CONTEXT / CALLING_LLM / RECEIVED_RAW / PARSING / VALIDATING / RETRY_PROMPT / PERSISTING / DONE / ERROR`), `domain/JobEvent` (data class `{phase, attempt, elapsedMs, error?, payload?}`), `application/JobEventPublisher` (singleton `ConcurrentHashMap<UUID, JobBucket>` thread-safe avec replay-on-reconnect — chaque événement publié est retenu et rejoué à un client qui se connecte tardivement, buckets prunés 60 s après une phase terminale). Le `Runner` émet `LOADING_CONTEXT` au start + `DONE/ERROR` au catch, l'`Executor` émet les phases intermédiaires (`CALLING_LLM` → `RECEIVED_RAW` → `PARSING` → `VALIDATING` → `RETRY_PROMPT?` → `PERSISTING`) à chaque transition.
- **Prompt management (Phase 3, livré 2026-05-10)** — `TickerNarrativePromptService` lit le prompt actif depuis la table `prompt_template` (un seul `is_active = TRUE` par `name` via index unique partiel) avec cache `@Cacheable` 1 min + fallback hardcodé sur la constante `NARRATIVE_SYSTEM_PROMPT` si BDD vide (bootstrap zéro-downtime). Switch live de prompt sans reboot via `POST /api/prompts/{id}/activate`. `PromptScoreRecorder` persiste un row `prompt_score` (`latency_ms, retry_count, parse_failed, validator_failed, user_thumbs, llm_judge_score?`) à chaque run du `TickerNarrativeExecutor`, succès ou échec définitif. Feedback `PATCH /api/narrative/snapshots/{id}/thumbs {value: -1|0|1}` met à jour la dernière ligne `prompt_score` du snapshot. Détail dans [`journal-livraisons.md > Phase 3`](../projet/journal-livraisons.md#phase-3--observabilité-narrative).
- **Page observabilité narrative (Phase 3 #1, livré 2026-05-13)** — `NarrativeObservabilityQuery` exécute une native SQL avec LEFT JOIN sur `prompt_template` + LATERAL sur `prompt_score` (un seul round-trip, plafonné à 500 rows par symbol) ; `NarrativeObservabilityService` enrichit chaque ligne avec les deltas prix 1d/1w/1m calculés à partir du chart 1Y cached (**one** `MarketChartClient.fetchChart` per request, base = `snapshot.price`, lookup `at or after` pour tolérer weekends/jours fériés). Dégradation gracieuse sur `MarketUnavailableException` : les narratifs reviennent avec deltas null plutôt qu'un 503 qui cacherait l'historique. Endpoints `GET /api/narrative/observability/tickers` (index des symbols avec ≥1 snapshot) et `GET /api/narrative/observability/{symbol}?from=&to=&promptId=` (timeline filtrée). Le filtre **thumbs reste client-side** (asymétrie pinnée dans le KDoc) : la timeline est borne et un re-fetch à chaque chip click serait gaspilleur. Détail dans [`journal-livraisons.md > Phase 3`](../projet/journal-livraisons.md#phase-3--observabilité-narrative).
- **Score de cohérence cross-runs (Phase 3 #2, livré 2026-05-14)** — `CoherenceScorer` (pure function, `@Component` sans dépendance Spring runtime, fully unit-tested) compare chaque snapshot à son chronologiquement-précédent et produit un `CoherenceScore { verdict ∈ {OK, WARN, HIGH}, sentimentChange ∈ {SAME, PARTIAL, FLIPPED}, keyPointsJaccard, summaryLengthRatio, priceMoveBetween }`. Divergence pondérée (sentiment 0.55 / key_points 0.30 / length 0.15) discountée par le price move entre les deux snapshots — un swing 5 % excuse fully un sentiment flip. Verdict surface comme chip colorisée sur chaque card de la timeline via le champ optionnel `coherence` ajouté à `NarrativeObservationDto` ; la row la plus ancienne (sans précédent) a `coherence = null`. **Pas de LLM-as-judge** : choisi gratuit + déterministe + transparent, le user peut re-dériver le verdict en lisant les 3 sous-mesures du tooltip.
- **Détection de biais (Phase 3 #3, livré 2026-05-14)** — `NarrativeBiasQuery` exécute 3 round-trips natifs (sentiment counts, thumbs by sentiment via LATERAL sur le dernier `prompt_score`, raw snapshot rows plafonné à 2 000) ; `NarrativeBiasService` compose 4 sections : (a) **sentiment distribution** zero-padded sur les 3 buckets avec bias flag à >= 60 % (« zero BEARISH » est lui-même un signal), (b) **calibration** : group snapshots par symbol → `MarketChartClient.fetchChart` une fois par unique symbol (cache-friendly Caffeine), moyenne du delta1d/1w/1m par sentiment bucket en filtrant les nulls, dégradation gracieuse per-symbol sur `MarketUnavailableException` (les autres sections tiennent), (c) **topic coverage** via regex `[a-z][a-z0-9]*` + ~80 stopwords + count-by-snapshot-not-by-occurrence (un narratif verbeux qui répète « rsi » 5× ne pèse qu'1 vote), top-15, (d) **thumbs distribution** par sentiment (auto-check biais côté humain). Endpoint `GET /api/narrative/observability/bias?from=&to=&promptId=` déclaré **avant** `/{symbol}` dans le controller pour la précédence routing — sinon Spring lierait `bias` comme path-variable. Backs la page `/observability/bias`.
- Endpoints REST narrative + prompt management + observabilité :
  - `/api/market/ticker/{symbol}/narrative` : `POST /` (kick async), `GET /jobs/{jobId}` (statut courant — toujours là pour debug), `GET /jobs/pending` (404 si aucun, sinon le job pending courant — utilisé par le front pour reattacher la SSE après un navigate-away → return-to-page), `GET /jobs/{jobId}/stream` (`text/event-stream` — l'`SseEmitter` enregistré dans le publisher), `GET /latest` (snapshot actuel), `GET /preview` (system + user prompt sans LLM call, backs `/settings/prompt-preview`).
  - `/api/prompts` (Phase 3) : `GET ?name=narrative-default` (liste reverse-chronological), `GET /{id}`, `POST` (nouvelle version, défaut `is_active = FALSE`), `POST /{id}/activate` (idempotent), `GET /{id}/stats?window=30d` (agrégats globaux + série quotidienne pour la page stats).
  - `/api/narrative/snapshots/{id}/thumbs` (Phase 3) : `PATCH` idempotent, body `{value: -1|0|1}`.
  - `/api/narrative/observability` (Phase 3 #1 livré 2026-05-13, étendu Phase 3 #3 livré 2026-05-14) : `GET /tickers` (index des symbols avec ≥1 snapshot, ordonné `MAX(generated_at) DESC`, cap 200), `GET /bias?from=&to=&promptId=` (4 sections agrégées corpus-wide : sentiment distribution + bias flag, calibration sentiment vs prix, topic coverage top-15, thumbs distribution), `GET /{symbol}?from=&to=&promptId=` (timeline avec deltas 1d/1w/1m enrichis depuis le chart 1Y cached + chip cohérence vs précédent). `/tickers` et `/bias` déclarés avant `/{symbol}` pour la précédence routing.

> Le LLM **digère** des indicateurs déjà calculés. Il **ne calcule jamais** RSI, MA, etc. — sinon il hallucine les chiffres.

### `portfolio/`

Inchangé. Le portefeuille est **read-only depuis l'UI** — il reflète l'état réel du courtier Wealthsimple.

- **Import CSV** (`CsvImportService`) : parse l'export Wealthsimple (21 colonnes, FR, NFD, BOM UTF-8), upsert des positions par compte.
- **Snapshots** : `PortfolioSnapshot` + `SnapshotPosition` créés à chaque import, groupés par `batch_id`.

Sa nouvelle utilité Phase 1 : fournir la **liste des tickers détenus** au `market/` pour pré-charger les dossiers ticker pertinents.

### `watchlist/` — nouveau, Phase 2

Liste plate de tickers à surveiller hors portefeuille. Single-table feature, pas de rattachement à un user (l'app reste single-user pour l'instant).

- `WatchlistEntry` (entity) → table `watchlist_entry` (V3, étendue par V7 avec `instrument_type VARCHAR(20)` nullable) `id UUID / symbol VARCHAR(20) UNIQUE / added_at / instrument_type`.
- `WatchlistService` : list (oldest first), add (idempotent — POST sur un symbole existant retourne la ligne existante), remove (404 si absent — non-idempotent volontairement pour que l'UI optimiste détecte une dérive d'état). Symbole normalisé en uppercase + trim côté service. `add` n'est délibérément **pas `@Transactional`** : il déclenche deux appels réseau (`SymbolSearchService.validate` + `TickerService.load` pour capturer l'`instrumentType`) avant l'écriture, et le pattern projet « pas d'I/O distant sous Hikari » (cf. plus bas) interdit de tenir une connexion 1-3 s pour une cache miss. La persistence est isolée dans le helper privé `persistNew` qui re-vérifie `findBySymbol` post-network pour absorber la fenêtre TOCTOU ; la contrainte UNIQUE sur `symbol` reste le filet de sécurité côté BDD.
- 3 endpoints REST : `GET / POST / DELETE /api/watchlist[/symbol]`.

### `news/` — nouveau, Phase 2

Section actualité par ticker sur le dossier. Backend wrapper d'un provider externe (Finnhub aujourd'hui, le provider de marché Twelve Data n'expose pas de news endpoint).

- Domain `NewsItem` provider-neutre (`headline`, `summary`, `source`, `url`, `publishedAt`…).
- Port `NewsClient`. Deux adapters cohabitent, sélectionnés par `news.provider` :
  - `FinnhubClient` (`finnhub`) — appelle `/company-news?symbol=…&from=…&to=…&token=…` avec une fenêtre roulante de 30 jours. `FinnhubMappers` convertit le JSON Finnhub vers le domaine (Unix seconds → `Instant`, `image: ""` → `null`, etc.).
  - `MockNewsClient` (`mock`, défaut) — feed synthétique déterministe par symbole (seed = hash). ~10 % de symboles "quiet" qui renvoient une liste vide pour exercer l'empty-state UI, ~25 % d'items sans summary pour exercer la null-handling path. Active sans clé, recommandé en dev pour ne pas chauffer le quota Finnhub.
- `NewsService` avec `@Cacheable("news-by-symbol", 15 min)` au-dessus du port — clé `#symbol.toUpperCase() + '|' + #limit`, économise le quota sur les re-clics.
- 1 endpoint REST : `GET /api/market/ticker/{symbol}/news?limit=10`.
- Erreurs upstream (401/403 → auth-failed, 429 → rate-limited, 5xx → upstream) mappées sur `MarketUnavailableException` partagée — surface en HTTP 503 sur l'API publique, identique à Twelve Data.

> Note SpEL : la clé du cache utilise `toUpperCase()` (méthode Java) plutôt que `uppercase()` (extension Kotlin). SpEL n'a accès qu'aux types JVM, pas aux extensions Kotlin — confondre les deux casse l'évaluation de la clé au runtime.

### `analyst/` — nouveau, Phase 2

Recommandations d'analystes (consensus monthly + price target 12 mois) sur le Dossier ticker, sous-bloc « Recommandations analystes » de la section « Fondamentaux ». Même pattern hexagonal que `news/` : un port + deux adapters + dispatcher `@Primary` + service applicatif cache-bearing.

- Domain `AnalystSnapshot` provider-neutre (`{symbol, asOf, strongBuy, buy, hold, sell, strongSell, totalAnalysts, consensus, priceTarget?, history[]}`), enum `AnalystConsensus` (`BUY` / `HOLD` / `SELL` / `MIXED`), helper pur `deriveConsensus(...)` (seuils 60 % bullish/bearish, 50 % hold ; `MIXED` sinon — choix conservateur, on préfère MIXED à un BUY trompeur sur 55/45).
- Port `AnalystRecommendationClient`. Deux adapters cohabitent, sélectionnés par `analyst.provider` :
  - `FinnhubAnalystClient` (`finnhub`) — appelle `/stock/recommendation?symbol=...&token=...` (requis) **et** `/stock/price-target?symbol=...&token=...` (optionnel — fail-soft à `null` sur 401/403/5xx/network parce que le price-target est derrière un paid tier sur certains comptes ; le snapshot reste utile sans). Mappers purs (`FinnhubAnalystMappers`) : tri défensif `period` ASC (Finnhub documente newest-first mais on ne fait pas confiance), cap history à 6 mois, all-zero target → `null` (Finnhub renvoie le shell zéro pour les symbols sans target — afficher « $0 » serait trompeur).
  - `MockAnalystClient` (`mock`, défaut) — feed synthétique déterministe par symbole (seed = hash) avec biais réaliste (~50 % bullish, ~30 % mixed, ~20 % bearish) et drift mois-sur-mois pour que la trend line ne soit pas plate. Symboles réservés : `UNKNOWN` (404), `RATELIMIT` (503), `NOTARGET` (snapshot avec `priceTarget = null`, pour reproduire la dégradation Finnhub sans flipper de provider).
- `RoutingAnalystClient` (`@Primary`) — délègue per-call à l'adapter actif lu via `appConfig.getString(analyst.provider)`. Cache-key prefix volontairement absent (la clé dans le service applicatif n'inclut pas le provider) → un switch s'applique au prochain dossier ouvert sans rétention d'entrée stale.
- `AnalystRecommendationService` avec `@Cacheable("analyst-recommendations", key = "#symbol.toUpperCase()")` (méthode Java SpEL). Finnhub stamp les snapshots mensuellement → 15 min de staleness sont invisibles au user, mais ça épargne le quota free tier sur les re-clics.
- 1 endpoint REST : `GET /api/market/ticker/{symbol}/analyst-recommendations`. Erreurs `NoSuchElementException` (404 « no analyst coverage ») et `MarketUnavailableException` (503) partagées avec le reste de la stack market.

### `earnings/` — nouveau, Phase 2

Earnings trimestriels (4 derniers Q estimate / actual / surprise %) + prochaine date d'annonce attendue sur le Dossier ticker, 2ᵉ sous-bloc « Résultats » de la section « Fondamentaux » sous le sous-bloc analyste. Même pattern hexagonal que `news/` et `analyst/` : un port + deux adapters + dispatcher `@Primary` + service applicatif cache-bearing.

- Domain `EarningsSnapshot` provider-neutre (`{symbol, nextEarningsDate?, nextEarningsTime?, lastReports[]}`), `EarningsReport` (`{period, epsEstimate?, epsActual?, surprisePercent?}`), enum `EarningsTime` (BEFORE_MARKET / AFTER_MARKET / UNSPECIFIED), helper pur `computeSurprisePercent` qui gère `null` + zero estimate (évite la div-by-zero) + estimate négatif via `abs()` au dénominateur (un beat sur loss-making garde un sign positif).
- Port `EarningsClient`. Deux adapters cohabitent, sélectionnés par `earnings.provider` :
  - `FinnhubEarningsClient` (`finnhub`) — appelle `/stock/earnings?symbol=...&token=...` (requis) **et** `/calendar/earnings?from=...&to=...&symbol=...&token=...` (optionnel — fail-soft à `null` sur 401/403/5xx/network parce que le calendrier sit derrière un paid tier sur certains comptes Finnhub ; le snapshot reste utile sans la prochaine date). Fenêtre 90 j en avant — la prochaine annonce trimestrielle est ~3 mois max, querier plus burnerait du quota sur du stale future-future. Mappers purs (`FinnhubEarningsMappers`) : tri défensif `period` ASC, cap reports à 4 trimestres, recalcul `surprisePercent` côté code (Finnhub round inconsistemment sur small caps), filtre calendar par symbol + `epsActual == null` (cleanest "did it happen yet" signal vs un date >= today qui race avec la matinée du print), pick the earliest, mapping `bmo`/`amc`/`""`/`dmh` → enum (collapse les inconnus à UNSPECIFIED).
  - `MockEarningsClient` (`mock`, défaut) — feed synthétique déterministe par symbole (seed = hash) avec EPS dans la bande $0.30–$3.50, surprise ±15 % autour de l'estimé pour produire un mix réaliste beat/miss, drift ±8 % d'un trimestre à l'autre pour une time-series stable mais pas plate, next-date 1–60 j en avant pour que le countdown reste lisible. Symboles réservés : `UNKNOWN` (404), `RATELIMIT` (503), `NOCALENDAR` (snapshot avec `nextEarningsDate = null`, pour reproduire la dégradation Finnhub sans flipper de provider).
- `RoutingEarningsClient` (`@Primary`) — délègue per-call à l'adapter actif lu via `appConfig.getString(earnings.provider)`. Cache-key prefix volontairement absent (la clé dans le service applicatif n'inclut pas le provider) → un switch s'applique au prochain dossier ouvert sans rétention d'entrée stale.
- `EarningsService` avec `@Cacheable("earnings", key = "#symbol.toUpperCase()")` (méthode Java SpEL). Reports changent au plus une fois par trimestre, calendar move daily mais lentement → 15 min de staleness sont invisibles au user, mais ça épargne le quota free tier sur les re-clics.
- 1 endpoint REST : `GET /api/market/ticker/{symbol}/earnings`. Erreurs `NoSuchElementException` (404 « no earnings data » quand reports ET calendar sont vides) et `MarketUnavailableException` (503) partagées avec le reste de la stack market.

### `config/` — Phase 2

Configuration éditable en runtime, sans redémarrage backend. Couvre **douze clés** (Phase 2 → Phase 2.5) : `market.twelvedata.api-key`, `market.finnhub.api-key`, `anthropic.api.key` (les trois SECRETs masqués côté DTO), `market.cache.ttl-minutes`, `market.provider` (mock ↔ twelvedata), `news.provider` (mock ↔ finnhub), `analyst.provider` (mock ↔ finnhub), `earnings.provider` (mock ↔ finnhub), `llm.provider` (claude ↔ ollama), `ollama.model`, `anthropic.api.model` et `llm.timeout-seconds` (INT 60..900, défaut 400 — slider unique côté UI qui pilote `OllamaClient.readTimeout` et la fenêtre de dedup du `TickerNarrativeJobStore` côté backend ; côté front il alimente l'affichage « estimation max » sur la card LLM via `LlmTimeoutService`).

- **`AppConfigService`** — service singleton qui lit les défauts YAML via `@Value` et les surcharge avec ce qui est en BDD (`app_config`, V4). Cache mémoire `ConcurrentHashMap` primé au boot via `@PostConstruct` puis maintenu en write-through sur chaque `set` / `reset`. Émet un `ConfigChangedEvent` sur changement effectif.
- **`ConfigController`** — `GET /api/config` (liste avec masquage des secrets), `PUT /api/config/{key}` (set), `DELETE /api/config/{key}` (reset au défaut), `POST /api/config/test/{provider}` (probe live d'une clé candidate sans la sauver, `provider` = `twelvedata` / `finnhub` / `anthropic`), `POST /api/config/test/llm` (probe d'un couple `(provider, model)` candidate avec le prompt fixe « Reply with exactly the word OK. » — retourne latence + correctness).
- **`ConfigTestClient`** — RestClient dédié qui appelle `/quote?symbol=AAPL` côté Twelve Data ou Finnhub pour valider une clé en cours d'édition, et `/v1/messages` (Claude) ou `/api/chat` (Ollama) pour valider un nom de modèle. Pour la clé Anthropic, `testAnthropicKey(candidate)` round-trip Claude avec la clé candidate et le modèle courant. Découplé des adapters de production parce que le test doit fonctionner même quand le provider actif est `mock` ou que le modèle/clé candidate n'a pas encore été sauvé.
- **Lecture per-call dans les adapters** — `TwelveDataClient`, `FinnhubClient` et `ClaudeClient` ne stockent plus leur clé en `@Value` figée à la construction du bean ; tous lisent `appConfig.getString(...)` à chaque appel. Pour Claude, le header `x-api-key` est posé per-request (`request.header(...)`) plutôt que via `defaultHeader()` builder-side, sinon le RestClient capturerait la clé à la construction. Le YAML reste injecté comme défaut au niveau de `AppConfigService`.
- **TTL cache dynamique** — `MarketConfig.cacheManager` lit le TTL initial via `AppConfigService` au boot. `CacheTtlListener` (composant séparé) écoute `ConfigChangedEvent` et appelle `setCaffeine(...)` sur le `CaffeineCacheManager` quand `market.cache.ttl-minutes` bouge. Trade-off accepté : le rebuild **invalide les entrées en cours** — coût marginal sur un TTL qu'on change rarement.
- **Switch provider à chaud** — sept beans `@Primary` au total (`RoutingMarketChartClient`, `RoutingSymbolSearchClient`, `RoutingSectorClassifier` dans `market/`, plus `RoutingNewsClient`, `RoutingAnalystClient`, `RoutingEarningsClient`, et `RoutingLlmClient` dans `analysis/infrastructure/llm/`) délèguent à l'adapter sélectionné par `market.provider` / `news.provider` / `analyst.provider` / `earnings.provider` / `llm.provider` au moment de chaque appel. `RoutingSectorClassifier` route le mode live `twelvedata` vers Finnhub plutôt que Twelve Data — `/profile` côté Twelve Data est paid-tier only, le routing absorbe la disparité côté client sans exposer le détail au reste de l'app. Les anciens `@ConditionalOnProperty` sur les adapters concrets et les HttpConfig sont retirés ; les deux `RestClient` (Twelve Data et Finnhub) cohabitent et sont qualifiés par `@Qualifier("twelveDataRestClient")` / `@Qualifier("finnhubRestClient")` côté clients. Coût : deux RestClients en mémoire au lieu d'un (négligeable). Bénéfice : rotation provider depuis `/settings/configuration` sans reboot, le bascule s'applique au prochain dossier ouvert. **Stratégie de cache hétérogène à connaître** : seul `MARKET_CHART_CACHE` côté `TwelveDataClient` préfixe sa clé par adapter (`twelvedata|…`, `mock|…`). Les quatre autres caches (`news-by-symbol`, `analyst-recommendations`, `earnings`, `sector-by-symbol`) cachent au niveau service applicatif sans préfixe — un toggle `mock → finnhub` continue de servir la valeur du provider précédent jusqu'à expiration TTL (~15 min). C'est un compromis assumé : un dossier ouvert dans la fenêtre post-switch peut afficher des news mock juste après le passage en live ; corrigé soit en attendant le TTL, soit en homogénéisant les six caches sur un même modèle (ticket dette technique 🟡 ouvert).
- **LLM provider + model runtime (Phase 2.5)** — `RoutingLlmClient` (`@Primary`) délègue à `ClaudeClient` ou `OllamaClient` selon `appConfig.getString(llm.provider)`. Les deux beans sont toujours instanciés (les `@ConditionalOnProperty` historiques sont retirés). Le nom de modèle est lu per-call via `appConfig.getString(anthropic.api.model)` / `appConfig.getString(ollama.model)` ; la clé Anthropic suit le même pattern depuis Phase 2.5 v2 (2026-05-08, cf. SECRET ci-dessus) ; l'URL base Ollama reste en YAML (rotation très rare, valeur stable sur la durée de vie du process). `modelId()` route lui aussi pour que le snapshot narratif capture l'identifiant exact du modèle qui a répondu — switcher de provider au runtime garde l'historique honnête.
- **LLM timeout runtime (Phase 2.5 v1.5)** — `llm.timeout-seconds` (INT 60..900, défaut 400) pilote en une seule clé : `OllamaClient` reconstruit son `RestClient` per-call avec le read timeout courant (cost négligeable, le `SimpleClientHttpRequestFactory` ne supporte pas la mutation in-place du timeout) ; `TickerNarrativeJobStore.pendingFor` lit la valeur au moment du dedup. Côté frontend, `LlmTimeoutService` (`providedIn: 'root'`) primé via `provideAppInitializer` au boot expose un `signal<number>` consommé par les surfaces UI qui affichent l'estimation max (card LLM dans `/settings/configuration`) ; depuis la migration SSE (Phase 2.5), il ne pilote plus d'abort de poller — la SSE qui se ferme suffit côté transport. Refresh explicite quand l'utilisateur sauve la nouvelle valeur via le slider sur `/settings/configuration`. Bénéfice : un user qui passe de qwen2.5:3b à qwen2.5:7b (cold-start plus long) tune le timeout sans code change ; un debug session peut le baisser à 60 s pour échouer plus vite. Hors scope : `ClaudeClient.readTimeout` reste à 60 s hardcoded — l'API Anthropic résout en 1-3 s, le slider serait du bruit pour ce chemin.

### `shared/`

Utilitaires transverses : `GlobalExceptionHandler` (mapping uniforme des erreurs en JSON).

## Modules frontend

Hexagonal léger sous `frontend/src/app/` :

- **`core/`** — ports + adapters (HTTP par défaut, localStorage pour les états client-only)
  - `*.repository.ts` (abstract class — port). 14 repositories : Portfolio, Snapshot, Market, Watchlist, News, Config, **Annotation** (chart user annotations, single-user mono-machine), **Analyst** (recommandations analystes par ticker, Phase 2), **Earnings** (résultats trimestriels + next-date par ticker, Phase 2), **OllamaStatus** (santé daemon Ollama : modèles loaded/available, latence ; backs le panneau État Ollama de `/settings/configuration`, Phase 2.5), **Prompt** (CRUD prompts narratifs : liste / activate / new version / stats agrégées, backs `/settings/prompts` et `/settings/prompts/:id/stats`, Phase 3), **NarrativeFeedback** (PATCH thumbs 👍/👎 sur le dernier `prompt_score` d'un snapshot, Phase 3), **NarrativeObservability** (timeline narratif vs prix par symbol + index des tickers avec ≥1 snapshot + chip cohérence vs précédent par card, backs `/observability` et `/observability/:symbol`, Phase 3 #1 livré 2026-05-13 étendu Phase 3 #2 livré 2026-05-14), **NarrativeBias** (agrégats corpus narratif en 4 sections : sentiment distribution + bias flag, calibration sentiment vs prix, topic coverage top-15, thumbs distribution ; backs `/observability/bias`, Phase 3 #3 livré 2026-05-14).
  - Plus `JobStreamService` (Phase 2.5 SSE) — pas un repository parce qu'il n'a pas de DTO BDD à exposer ; il wrappe `EventSource` sur `/api/market/ticker/{symbol}/narrative/jobs/{id}/stream` et expose un `Observable<JobEvent>` qui complète sur `DONE` / `ERROR`.
  - `adapters/*.http.ts` (HttpXxxRepository — HTTP adapter, défaut) ; `adapters/*.local.ts` pour les adapters client-only (`LocalStorageAnnotationRepository` v3 chart, swap futur vers backend-backed sans rewrite UI).
  - Wiring : `core/providers.ts` exporte `provideRepositories(): EnvironmentProviders` (regroupe les 14 bindings `{ provide, useClass }`), appelé depuis `app.config.ts` au même titre que `provideRouter()` / `provideHttpClient()`.
  - `theme.service.ts` + `language.service.ts` — couples symétriques (signal + persist localStorage), drivés par le toolbar header
- **`public/i18n/`** — fichiers de traduction `<lang>.json` (FR + EN), servis comme assets statiques par le HTTP loader de `ngx-translate`
- **`features/`** — *primary adapters*
  - `dashboard/` — portefeuille, tickers détenus, watchlist (sidebar 3 sections collapsables)
  - `ticker/` — dossier par symbole en layout 2-col : **sidenav outils chart** à gauche (Amazon-style, foldable via chevron, sticky, état localStorage `ticker-sidenav-open`) qui héberge timeframe / benchmark / overlays / outils (annotation arm, clear anchor, reset zoom) / liste « Annotations posées » avec bouton supprimer par item ; colonne droite avec le graphe multi-timeframe + axes + crosshair + **overlay benchmark opt-in** (SPY/QQQ/IWM/Sector/Custom, Y-axis bi-mode prix/% return, 2ᵉ polyline dashed, `MatTooltipModule`) + **chart analyse interactive** (zoom drag-select avec brush mini-chart en bas, overlays MA50/MA200/Bollinger/52w hi-lo en multi-select, annotations h-line persistées localStorage par symbole, measure tools delta % + delta time entre deux clics), indicateurs, section Fondamentaux (analyst recommandations + earnings), news, narratif IA, bouton watchlist
  - `import/` — drag & drop CSV
  - `suivi/` — timeline snapshots
  - `settings/` — back-office avec sidenav : `configuration/` (runtime config Phase 2 — sub-sidenav interne « Providers de données » / « LLM »), `prompt-preview/` (aperçu du prompt narratif Phase 1), `prompts/` (Phase 3 — liste des versions du prompt `narrative-default` avec activation + éditeur inline + diff side-by-side pour proposer une nouvelle version), `prompts/:id/stats` (Phase 3 — stats agrégées par prompt sur 30 jours : sparkline latence p50 + tableau quotidien runs / latence p50-p95 / taux retry / taux parse-validator failed / distribution thumbs)
  - `observability/` — Phase 3 #1 (livré 2026-05-13) + #2 + #3 (livrés 2026-05-14) : `index/` rend `/observability` (liste des symbols avec ≥1 snapshot et lien vers chaque page per-symbol + chip vers le bias dashboard) ; la page racine `/observability/:symbol` rend la timeline reverse-chronologique de cartes expandables avec filter bar (date range côté serveur + prompt dropdown côté serveur + chips thumbs client-side + reset) et **chip cohérence OK/WARN/HIGH** sur chaque card avec tooltip natif 5 lignes (sentiment / shared keypoints % / length ratio / price move signé) ; la page racine `/observability/bias` rend l'agrégat corpus-wide en 4 sections cards (sentiment bars horizontales avec chip biais suspecté, calibration table sentiment × delta1d/1w/1m, topic pills monospace top-15, thumbs stacked bars cross-sentiment scaling). Entrée navbar « Observabilité » ajoutée après Dashboard, lien d'entrée depuis le footer de la card narrative du dossier ticker (icône `history`)

## Schéma de base de données

Huit migrations Flyway : `V1__init.sql` (schéma Phase 0 historique — les tables RSS / recommandations / jobs analysis sont droppées par V6), `V2__ticker_narrative.sql` (Phase 1 narratif), `V3__watchlist.sql` (Phase 2 watchlist), `V4__app_config.sql` (Phase 2 — table key/value des surcharges runtime), `V5__asset_lifecycle.sql` (Phase 2 — lifecycle de position OPEN/CLOSED), `V6__drop_phase0.sql` (Phase 2.5 — drop des 6 tables Phase 0 décommissionnées : `recommendation`, `recommendation_action`, `recommendation_score`, `analysis_job`, `feed_article`, `feed_source`), `V7__watchlist_instrument_type.sql` (Phase 2.5 — ajoute `instrument_type VARCHAR(20)` nullable sur `watchlist_entry` pour persister le type capturé au POST add et nourrir le chip dashboard sans burst Twelve Data au mount), `V8__prompt_template.sql` (Phase 3 — crée `prompt_template` + `prompt_score` pour le prompt management livré 2026-05-10, ajoute `prompt_template_id UUID NULL` sur `ticker_narrative_snapshot` avec backfill `WHERE prompt_version = 'v2'`, seed du prompt v2 actif copié verbatim depuis le `NARRATIVE_SYSTEM_PROMPT` Kotlin).

| Section | Tables | Statut |
|---------|--------|--------|
| Portefeuille & actifs | `portfolio`, `asset` | Actif |
| Snapshots historiques | `portfolio_snapshot`, `snapshot_position` | Actif |
| Narratifs ticker | `ticker_narrative_snapshot`, `ticker_narrative_job` | Actif Phase 1 |
| Watchlist | `watchlist_entry` | Actif Phase 2 |
| Config runtime | `app_config` | Actif Phase 2 |
| Prompt management & scoring | `prompt_template`, `prompt_score` | Actif Phase 3 |

## Décisions techniques notables

### Phase 1 — pivot ticker

**LLM = rédacteur, pas décideur** — le LLM digère des indicateurs **déjà calculés** (RSI, MA, momentum) et écrit un narratif. Il ne calcule jamais d'indicateurs (il les hallucine systématiquement) et ne produit pas de signal d'achat/vente. Cette séparation rend l'output testable (le code des indicateurs l'est) et l'IA productive sur ce qu'elle sait faire (écrire).

**Twelve Data en source primaire** — Yahoo Finance avait été choisi initialement (gratuit, sans clé, couverture mondiale) mais rate-limite agressivement les IPs résidentielles : ban observé sur résidentiel + VPN + cellulaire en validation Phase 1, malgré le cookie+crumb dance complet. Trop instable pour un projet perso à IP unique. Twelve Data prend le relais Phase 1 : REST documenté, free tier 800 credits/jour (largement suffisant avec un cache 15 min), TSX natif (XTSE), interface stable. Le code Yahoo a été supprimé — l'implémentation cookie+crumb reste consultable dans l'historique git (commit `b993440`) si on doit la rejouer pour un autre provider.

**Caching côté serveur** — un dossier ticker peut être consulté plusieurs fois par jour. On cache les fetchs market (15 min) en Caffeine en mémoire. Le cache key préfixe par adapter (`twelvedata|`) pour qu'un provider futur puisse cohabiter sans collision. Pas besoin de Redis à cette échelle.

**Provider de marché abstrait + mock local** — `MarketChartClient` est un port qui retourne un `MarketChart` (types domaine `TickerQuote` + `List<OhlcBar>`). Deux implémentations cohabitent, sélectionnées par `market.provider` :
- `twelvedata` — défaut prod, requiert `market.twelvedata.api-key` (env `TWELVEDATA_API_KEY`).
- `mock` — défaut sans clé, génère une série OHLC déterministe par symbole (seed = hash). Symboles réservés `UNKNOWN` (404) et `RATELIMIT` (503) pour exercer les chemins d'erreur.

**Twelve Data — quirks à absorber** — l'API a deux pièges qui justifient un parser tolérant : (1) **les nombres sont des strings JSON** (`"open": "180.00"`) — on désérialise en `String` et convertit avec `toBigDecimalOrNull`/`toLongOrNull` ce qui tolère naturellement `""` et `"NaN"` observés sur tickers illiquides ; (2) **les erreurs reviennent en HTTP 200** avec `{status: "error", code: 404}` dans le body — il faut inspecter le body et pas juste le code HTTP. Mapping : `code 404` → `NoSuchElementException`, `429` → `MarketUnavailableException("rate-limited")`, `401`/`403` → `auth-failed`. Bonus : la clé API absente est détectée *avant* l'appel HTTP et lève `MarketUnavailableException` avec un message actionnable — pas de credit gaspillé sur une mauvaise config.

**Claude API par défaut** — sur les premiers itérations Phase 1, Mistral 7B sortait des narratifs grammaticalement corrects mais financièrement creux. Le saut de qualité Claude est largement supérieur au coût (~quelques cents par dossier). Ollama (`qwen2.5:3b` par défaut, sélectionnable au runtime) reste activable pour le dev offline (`llm.provider: ollama`).

**Snapshot du narratif systématique** — chaque consultation d'un ticker persiste `{prix_du_jour, indicateurs, narrative}`. Sans ça, l'observabilité Phase 3 (relire ce que disait l'IA il y a 1 mois) est aveugle.

**Cache snapshot 30 min + dedup job 5 min** — un re-clic sur un dossier ticker ne doit ni rappeler le LLM (cher en Claude, lent en Ollama) ni créer de jobs concurrents. Le service réutilise le snapshot existant si âge < 30 min, sinon réutilise le job pending si âge < 5 min, sinon kick un nouveau job. Front toujours uniforme : POST puis poll.

**Configuration runtime éditable** (Phase 2) — clés API et TTL de cache vivaient en `@Value` injectées à la construction du bean, donc figées jusqu'au prochain reboot. Pour permettre la rotation d'une clé sans redémarrer le backend, on a introduit `AppConfigService` (table `app_config`, surcharge BDD au-dessus du défaut YAML) et bascule les adapters (`TwelveDataClient`, `FinnhubClient`) sur une lecture per-call. Pour le TTL Caffeine, le builder est figé au moment du `setCaffeine` ; on écoute un `ConfigChangedEvent` et on rebuild le spec via `CaffeineCacheManager.setCaffeine(...)` — accepte d'invalider les entrées en cours, négligeable sur un changement rare. Pas de chiffrement BDD v1 (projet local) — à durcir si on déploie un jour.

**Pas de wildcard imports en Kotlin** (Phase 2.5 outillage) — pour éviter qu'IntelliJ consolide les imports en `*` (défaut "Optimize Imports" au-delà de 5 imports/package), deux couches de défense : (1) `.editorconfig` racine avec `ij_kotlin_name_count_to_use_star_import = MAX` qui bloque la consolidation à la source ; (2) custom step Spotless `no-wildcard-imports` (cf. `backend/build.gradle.kts`) qui scanne et lance `GradleException` sur tout wildcard hors allowlist (14 packages encore tolérés, à shrinker progressivement). Volontairement pas de ktlint — ktlint avec `ij_kotlin_packages_to_use_import_on_demand` listant des packages applique la sémantique IntelliJ et **force** les wildcards sur ces packages, comportement inverse au but recherché (vérifié douloureusement, 152 fichiers reformatés en consolidation `*` avant rollback). Custom step en pure-check pour cette raison. Detekt rule `WildcardImport` désactivée — Spotless casse le build, Detekt ne ferait que rapporter en double.

**Ollama containerisé même sur Mac, malgré la dégradation CPU** (Phase 2.5, décision tranchée 2026-05-09) — Docker Desktop sur Mac est une VM Linux virtualisée qui n'expose pas Metal, donc Ollama tourne en CPU pur dans le container : un narratif `qwen2.5:3b` peut saturer 9 cores ~918 % pendant 60–180 s, là où le même modèle sur Ollama natif macOS (Metal activé) répond en 5-10 s. Trois options analysées (cf. [`docs/devops/decision-ollama-deploiement.md`](../devops/decision-ollama-deploiement.md)) : (1) sortir Ollama de Compose et installer en natif via `brew`, (2) override Compose Mac vs cible Linux GPU, (3) statu quo. **Option 3 retenue** : depuis l'arrivée de Claude API comme défaut Phase 1, Ollama est devenu un outil de dev (exercer parsing/validation/SSE sans cramer des appels Claude) et un fallback offline, pas le chemin produit principal. Le coût onboarding de l'option 1 (un service de plus à gérer hors Tilt, perte du « clone + `tilt up` = tout marche ») ne se justifie pas tant que l'usage Ollama reste occasionnel. L'option 2 paie une dette infrastructurelle pour une cible Linux GPU hypothétique — Phase 5 hosting (OVH / Hetzner / Scaleway / Lightsail dans la fourchette 5-15 €/mois) n'a pas de GPU dans cette gamme. Re-trigger pour réévaluer : machine dédiée, usage Ollama > 20 % des sessions, ou distribution du repo à des contributeurs Linux/Windows.

**Tracking du modèle LLM par snapshot** — chaque snapshot stocke `LlmClient.modelId()` (`ollama:qwen2.5:3b` ou `claude:claude-opus-4-6`) au moment de la génération. Indispensable Phase 3 pour comparer la qualité narrative entre versions de modèle ou entre providers, et pour filtrer après coup les snapshots produits par un modèle plus faible sans relire le contenu.

### Patterns transverses backend

**`@Async` sur bean séparé** — Spring AOP ne proxifie pas les appels internes (`this.method()`). Le pattern `Service → Runner (@Async) → Executor (@Transactional)` reste valide et est repris pour `TickerNarrativeService → TickerNarrativeRunner`.

**LLM call hors transaction** — l'appel LLM (1-15 s en Claude, plus long en Ollama) ne doit pas tenir de connexion Hikari. Le pipeline est éclaté pour respecter ça.

**Validation de schéma** — `ddl-auto: validate`. Hibernate valide le schéma au démarrage. Toute modification d'entité = migration Flyway.

**Tests d'intégration sur vrai PostgreSQL** — pas de mocks BDD, pas de H2. Le CI démarre un service PostgreSQL.

**Portefeuille CSV-driven, pas de CRUD manuel** — le portefeuille reflète la réalité du courtier. L'import CSV Wealthsimple reste la seule source de vérité des positions.

**Snapshot avec `batch_id`** — un import CSV peut couvrir plusieurs comptes. Le `batch_id` UUID commun regroupe tous les snapshots d'un même import pour l'affichage en timeline.

### Phase 1+ — frontend

**Ports & adapters léger** — `core/<name>.repository.ts` (port = abstract class) + `core/adapters/<name>.http.ts` (adapter HTTP). Composants injectent l'abstraction. Tests : on mock le port, l'adapter a son propre spec HTTP.

**Tokens de thème** — variables CSS sur `:root`, override sur `[data-theme='light']`. Material 3 wired en dual-theme. Default = sombre. Toggle dans le header, persistance localStorage, anti-FOUC via script inline dans `index.html`.

**Zoneless explicite** — `provideZonelessChangeDetection()` dans `app.config.ts`, pas de `zone.js` installé. La state est 100 % signal-based : un template re-rend automatiquement quand un signal qu'il lit change, plus une intercepte sur les events handlers et l'`async` pipe. Pas besoin d'`OnPush` puisque le rebuild est déjà opt-in par construction. La config est rendue lisible plutôt que devinée.

**i18n runtime via `ngx-translate`** — fichiers `public/i18n/<lang>.json` chargés via le HTTP loader (assets statiques). Composants importent `TranslatePipe` (granulaire, pas tout `TranslateModule`). `LanguageService` est le miroir signal-based de `ThemeService` : signal + localStorage + fallback navigateur (`fr-*` → `fr`, sinon `en`). Le switcher header utilise un `mat-menu` avec drapeaux unicode. Aucune string utilisateur en dur dans le code — uniquement des clés. Les erreurs dynamiques côté TS passent par `TranslateService.instant('key', { params })`.

---

## Modèle pipeline d'analyse (vision Phase 3 + Phase 4)

> **Statut** : design cible, non encore implémenté. Documenté ici pour cadrer les prochains tickets backlog (« Page Jobs » Phase 3 + « Réintégration Phase 0 » Phase 4). Voir `docs/metier/vision.md > Le pipeline d'analyse` pour la framing produit.

### Concept central

L'application est un **DAG de jobs** dont les **feuilles** sont les analyses ticker individuelles et les **parents** sont des compositions au-dessus (analyse portefeuille, vue cross-watchlist, etc.). Chaque nœud est cache-aware : il consulte la persistence avant de firer un calcul lourd. Les feuilles partagent leur cache entre toutes les origines de trigger (ouverture manuelle de dossier, parent de pipeline, cron).

```
PortfolioAnalysis(today, portfolioId)
├── TickerAnalysis(VOO, today)      [cache hit  → DONE_CACHED, 0 LLM]
├── TickerAnalysis(NVDA, today)     [cache miss → RUNNING → DONE]
├── TickerAnalysis(MSFT, today)     [cache hit  → DONE_CACHED]
└── PortfolioAggregation(today)     [waits-for-all-leaves → DONE]
```

### Modèle de données — table `job` unifiée

Migration cible — rebuild greenfield au-dessus de la table existante `ticker_narrative_job` (Phase 1, seule survivante après le décommissionnement Phase 0 / V6) :

| Colonne | Type | Rôle |
|---|---|---|
| `id` | UUID | PK |
| `kind` | VARCHAR | `TICKER_ANALYSIS` / `PORTFOLIO_AGGREGATION` / `MARKET_REFRESH` / … (extensible) |
| `parent_id` | UUID? | FK self pour la relation DAG ; null pour les nœuds racine |
| `status` | VARCHAR | `PENDING` / `RUNNING` / `DONE` / `DONE_CACHED` / `ERROR` / `CANCELLED` |
| `origin` | VARCHAR | `dashboard` / `cron` / `api` / `parent` (déclenché par un job parent) |
| `cache_key` | VARCHAR | clé déterministe (e.g. `TickerAnalysis:NVDA:2026-05-07`) — sert à la dedup et au lookup cache |
| `target_id` | UUID? | FK vers la ressource produite (`ticker_narrative_snapshot` pour une feuille, future `portfolio_analysis_snapshot` pour un parent) |
| `payload` | JSONB | input du job (symbol + date pour une feuille, portfolio_id + date pour un parent) |
| `result_summary` | TEXT? | message court pour l'UI (« cached snapshot from 09:32 » / « LLM call 8.4s, retry 0 ») |
| `error` | TEXT? | trace résumée si `status = ERROR` |
| `created_at` / `started_at` / `ended_at` | TIMESTAMP | timing |

### Machine à états

```
                ┌───────────────┐
                │   PENDING     │  (créé, en attente de slot)
                └───────┬───────┘
                        │ leaf : lookup cache
                        ▼
        ┌───────────────────────────────┐
        │  cache hit ?                  │
        │  ───────                      │
        │  oui : DONE_CACHED (terminal) │
        │  non : RUNNING                │
        └───────┬───────────────────────┘
                │
                ▼
        ┌───────────────┐       ┌───────────────┐
        │   RUNNING     │ ────► │     DONE      │  (terminal)
        └───────┬───────┘       └───────────────┘
                │       \
                │        \─►   ┌───────────────┐
                │              │     ERROR     │  (terminal, retryable)
                │              └───────────────┘
                │
                └─►   ┌───────────────┐
                      │   CANCELLED   │  (terminal, parent-cancelled)
                      └───────────────┘
```

Un parent `PortfolioAggregation` reste en `PENDING` tant que **toutes** ses feuilles ne sont pas dans un état terminal (`DONE` / `DONE_CACHED` / `ERROR` / `CANCELLED`). Le parent peut donc démarrer même si une feuille a `ERROR` — l'agrégation décide d'inclure ou pas la position selon sa propre logique métier (e.g. « si > 50 % des feuilles ratent, le parent passe en ERROR sans agrégation »).

### Cache-aware leaves

Le `TickerAnalysis(symbol, day)` consulte avant tout `ticker_narrative_snapshot` :

```kotlin
fun executeLeaf(symbol: String, day: LocalDate): Job {
  val key = cacheKey(symbol, day)
  val existing = snapshotRepo.findFreshFor(symbol, day)  // <30 min, ou même-jour selon politique
  if (existing != null) {
    return job.markCached(existing.id, "snapshot from ${existing.generatedAt}")
  }
  job.markRunning()
  val snapshot = tickerNarrativeService.generate(symbol)
  return job.markDone(snapshot.id, "LLM call ${snapshot.latencyMs}ms")
}
```

La politique de fraîcheur du cache est un point d'arbitrage : 30 min (cohérent avec la dedup actuelle Phase 1) vs même-jour calendaire vs séance de marché (jour de bourse). Le choix oriente l'économie LLM et la prévisibilité de l'UX.

### Origines de trigger

Le **même** primitif `TickerAnalysis(symbol, day)` est invoqué depuis trois entry points distincts, chacun annoté `origin = ?` :

1. **`origin = dashboard`** — l'utilisateur ouvre un dossier ticker (Phase 1) ou clique « Analyser le portefeuille » (parent qui crée des enfants `origin = parent`).
2. **`origin = cron`** — un scheduler quotidien hors heures de bureau crée des feuilles pour toutes les positions OPEN d'un user (`portfolio.assets.filter { OPEN }.map { TickerAnalysis(it.ticker, today) }`). L'utilisateur arrive le matin sur un dashboard pré-chauffé.
3. **`origin = api`** — un endpoint REST `POST /api/jobs/ticker-analysis` permet à un script externe (cf. workflow GitHub Releases Phase 5, ou un futur webhook broker) de déclencher des analyses.

La dedup se fait sur `cache_key` : si un job `RUNNING` existe déjà pour la même clé, le nouveau request **rejoint** ce job au lieu d'en créer un second. C'est l'extension du pattern de dedup actuel `TickerNarrativeService.dedupWindow = 5 min` vers une dedup déterministe par clé plutôt que temporelle.

### Implications côté frontend

Le composant « Pipeline » (futur, page Jobs Phase 3) devient une vue arborescente :

- Chaque parent collapse / expand pour révéler ses enfants
- Indicateur visuel par feuille : `⚡ cache` / `⏱ running` / `✅ done` / `⚠ error` / `⏸ cancelled`
- Click sur une feuille → ouvre la ressource produite (`ticker_narrative_snapshot` → page dossier ticker à la date du snapshot, lecture-seule pour l'observabilité)
- Click sur un parent ERROR → bouton « Retry failed leaves only » qui re-PENDING uniquement les enfants en ERROR
- Stream live via SSE tant qu'un job du DAG est non-terminal ; arrêt automatique quand tout est terminal. L'infrastructure de transport est déjà en place pour les jobs ticker (Phase 2.5 — cf. `JobEventPublisher` côté backend, `JobStreamService` côté frontend) ; la page Jobs n'aura qu'à consommer les mêmes événements à l'échelle d'un DAG plutôt que d'un seul nœud.

### Pourquoi pas un orchestrateur externe (Temporal, Airflow, etc.)

Tentation de réflexe : « un DAG de jobs, c'est ce que fait Temporal/Airflow nativement ». Volontairement écarté en v1 pour le projet :

- **Single-user, low concurrency** — un user, ~10 positions max, ~1 portfolio analysis par jour. Le surcoût opérationnel d'un orchestrateur externe (cluster, schéma BDD séparé, déploiement, monitoring) dépasse largement le bénéfice.
- **Pas de retry distribué** — on tourne sur une seule JVM. Spring `@Async` + une `BlockingQueue` ou un `ThreadPoolTaskExecutor` suffisent largement.
- **Pas de workflows multi-step à compenser** — chaque job est court (~10 s LLM), idempotent au cache-key, et sans side-effect distribué qui demanderait de la compensation transactionnelle.

Si un jour on bascule en multi-user à fort trafic (Phase 5+ : SaaS), Temporal devient pertinent. D'ici là, un schéma BDD `job` + un thread pool Spring + un poll côté frontend = 95 % du bénéfice à 5 % de la complexité.
