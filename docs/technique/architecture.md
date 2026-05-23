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
│                    prompts (CRUD + stats)   │
│  core/                                      │
│    api/<bucket>/    *.repository (ports)    │
│                     adapters/*.http.ts      │
│    local/<bucket>/  *.local.ts (browser)    │
│    app-state/       theme + language signal │
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

- **`SymbolSearchService`** (Phase 2) — wrap `SymbolSearchClient` avec `@Cacheable("symbol-search")`. **Validation séparée dans `SymbolValidator`** (`@Component` distinct qui dépend du service, 2026-05-16) : un appel intra-bean `this.search()` bypasse le proxy AOP Spring et brûlerait un credit Twelve Data par `watchlist.add()`. Router la validation à travers un deuxième bean force Spring à injecter le proxy par construction (pas de hack `@Lazy self`).
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
- `TickerNarrativeValidator` — règles strictes : 3-5 keyPoints, ≤15 mots/bullet, summary non vide, sentiment ∈ enum. Le compte de phrases (`MAX_SENTENCE_TERMINATORS = 100`) est un pur garde-fou anti-runaway depuis le 2026-05-22 — `max_tokens=600` sur l'appel LLM coupe bien avant ; le steering de longueur est délégué à l'enveloppe technique du prompt (`5-12 phrases typiques`).
- Persistance dans `TickerNarrativeSnapshot` : `{symbol, generatedAt, price, indicatorsJson, summary, sentiment, keyPointsJson, modelUsed, promptVersion, promptTemplateId}` — append-only, permet la relecture a posteriori. `promptTemplateId` (FK `prompt_template`) ajouté en Phase 3 prompt-management pour le lookup des stats agrégées ; `promptVersion` (string) reste pour la trace historique.
- Job tracking dans `TickerNarrativeJob` (status BDD `PENDING / DONE / ERROR`) pour le suivi du job côté front. Transport SSE depuis Phase 2.5 — voir le bloc `Server-Sent Events` ci-dessous pour la granularité par phase.
- **Server-Sent Events (Phase 2.5)** — quatre nouveaux artefacts pour streamer la progression du pipeline narratif au front en push : `domain/JobPhase` (enum 9 valeurs `LOADING_CONTEXT / CALLING_LLM / RECEIVED_RAW / PARSING / VALIDATING / RETRY_PROMPT / PERSISTING / DONE / ERROR`), `domain/JobEvent` (data class `{phase, attempt, elapsedMs, error?, payload?}`), `application/JobEventPublisher` (singleton `ConcurrentHashMap<UUID, JobBucket>` thread-safe avec replay-on-reconnect — chaque événement publié est retenu et rejoué à un client qui se connecte tardivement, buckets prunés 60 s après une phase terminale). Le `Runner` émet `LOADING_CONTEXT` au start + `DONE/ERROR` au catch, l'`Executor` émet les phases intermédiaires (`CALLING_LLM` → `RECEIVED_RAW` → `PARSING` → `VALIDATING` → `RETRY_PROMPT?` → `PERSISTING`) à chaque transition.
- **Prompt management (Phase 3, livré 2026-05-10, refondu 2026-05-22)** — `TickerNarrativePromptService` lit le prompt actif depuis la table `prompt_template` (un seul `is_active = TRUE` par `name` via index unique partiel) avec cache `@Cacheable` 1 min + fallback hardcodé sur la constante `NARRATIVE_DEFAULT_BODY` si BDD vide (bootstrap zéro-downtime). **Depuis 2026-05-22, la colonne `system_prompt` stocke uniquement le *corps* éditable (persona / ton)** — l'enveloppe technique (contrat JSON, règle sentiment, règle null-skip) vit en code (`NARRATIVE_TECHNICAL_ENVELOPE_SUFFIX` dans `TickerNarrativePrompt.kt`) et est ajoutée à la volée par `assembleNarrativeSystemPrompt(body)` appelé par `TickerNarrativeExecutor` avant l'appel LLM. Voir `Décisions techniques notables > Phase 3` pour le pourquoi. Switch live de prompt sans reboot via `POST /api/prompts/{id}/activate`. `PromptScoreRecorder` persiste un row `prompt_score` (`latency_ms, retry_count, parse_failed, validator_failed, user_thumbs, llm_judge_score?`) à chaque run du `TickerNarrativeExecutor`, succès ou échec définitif. Feedback `PATCH /api/narrative/snapshots/{id}/thumbs {value: -1|0|1}` met à jour la dernière ligne `prompt_score` du snapshot. Détail dans [`journal-livraisons.md > Phase 3`](../projet/journal-livraisons.md#phase-3--observabilité-narrative).
- **Page observabilité narrative (Phase 3 #1, livré 2026-05-13)** — `NarrativeObservabilityQuery` exécute une native SQL avec LEFT JOIN sur `prompt_template` + LATERAL sur `prompt_score` (un seul round-trip, plafonné à 500 rows par symbol) ; `NarrativeObservabilityService` enrichit chaque ligne avec les deltas prix 1d/1w/1m calculés à partir du chart 1Y cached (**one** `MarketChartClient.fetchChart` per request, base = `snapshot.price`, lookup `at or after` pour tolérer weekends/jours fériés). Dégradation gracieuse sur `UpstreamUnavailableException` : les narratifs reviennent avec deltas null plutôt qu'un 503 qui cacherait l'historique. Endpoints `GET /api/narrative/observability/tickers` (index des symbols avec ≥1 snapshot) et `GET /api/narrative/observability/{symbol}?from=&to=&promptId=` (timeline filtrée). Le filtre **thumbs reste client-side** (asymétrie pinnée dans le KDoc) : la timeline est borne et un re-fetch à chaque chip click serait gaspilleur. Détail dans [`journal-livraisons.md > Phase 3`](../projet/journal-livraisons.md#phase-3--observabilité-narrative).
- **Score de cohérence cross-runs (Phase 3 #2, livré 2026-05-14)** — `CoherenceScorer` (pure function, `@Component` sans dépendance Spring runtime, fully unit-tested) compare chaque snapshot à son chronologiquement-précédent et produit un `CoherenceScore { verdict ∈ {OK, WARN, HIGH}, sentimentChange ∈ {SAME, PARTIAL, FLIPPED}, keyPointsJaccard, summaryLengthRatio, priceMoveBetween }`. Divergence pondérée (sentiment 0.55 / key_points 0.30 / length 0.15) discountée par le price move entre les deux snapshots — un swing 5 % excuse fully un sentiment flip. Verdict surface comme chip colorisée sur chaque card de la timeline via le champ optionnel `coherence` ajouté à `NarrativeObservationDto` ; la row la plus ancienne (sans précédent) a `coherence = null`. **Pas de LLM-as-judge** : choisi gratuit + déterministe + transparent, le user peut re-dériver le verdict en lisant les 3 sous-mesures du tooltip.
- **Détection de biais (Phase 3 #3, livré 2026-05-14)** — `NarrativeBiasQuery` exécute 3 round-trips natifs (sentiment counts, thumbs by sentiment via LATERAL sur le dernier `prompt_score`, raw snapshot rows plafonné à 2 000) ; `NarrativeBiasService` compose 4 sections : (a) **sentiment distribution** zero-padded sur les 3 buckets avec bias flag à >= 60 % (« zero BEARISH » est lui-même un signal), (b) **calibration** : group snapshots par symbol → `MarketChartClient.fetchChart` une fois par unique symbol (cache-friendly Caffeine), moyenne du delta1d/1w/1m par sentiment bucket en filtrant les nulls, dégradation gracieuse per-symbol sur `UpstreamUnavailableException` (les autres sections tiennent), (c) **topic coverage** via regex `[a-z][a-z0-9]*` + ~80 stopwords + count-by-snapshot-not-by-occurrence (un narratif verbeux qui répète « rsi » 5× ne pèse qu'1 vote), top-15, (d) **thumbs distribution** par sentiment (auto-check biais côté humain). Endpoint `GET /api/narrative/observability/bias?from=&to=&promptId=` déclaré **avant** `/{symbol}` dans le controller pour la précédence routing — sinon Spring lierait `bias` comme path-variable. Backs la page `/observability/bias`.
- Endpoints REST narrative + prompt management + observabilité :
  - `/api/market/ticker/{symbol}/narrative` : `POST /` (kick async), `GET /jobs/{jobId}` (statut courant — toujours là pour debug), `GET /jobs/pending` (404 si aucun, sinon le job pending courant — utilisé par le front pour reattacher la SSE après un navigate-away → return-to-page), `GET /jobs/{jobId}/stream` (`text/event-stream` — l'`SseEmitter` enregistré dans le publisher), `GET /latest` (snapshot actuel).
  - `/api/prompts` (Phase 3) : `GET ?name=narrative-default` (liste reverse-chronological), `GET /{id}`, `POST` (nouvelle version, défaut `is_active = FALSE`), `POST /{id}/activate` (idempotent), `GET /{id}/stats?window=30d` (agrégats globaux + série quotidienne pour la page stats), `GET /envelope` (livré 2026-05-22 — retourne `{version, suffix}` statique : la version de l'enveloppe technique + le texte appendu après le corps, consommé par le panneau read-only de `/settings/prompts`).
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
- Erreurs upstream (401/403 → auth-failed, 429 → rate-limited, 5xx → upstream) mappées sur `UpstreamUnavailableException` partagée — surface en HTTP 503 sur l'API publique, identique à Twelve Data.

> Note SpEL : la clé du cache utilise `toUpperCase()` (méthode Java) plutôt que `uppercase()` (extension Kotlin). SpEL n'a accès qu'aux types JVM, pas aux extensions Kotlin — confondre les deux casse l'évaluation de la clé au runtime.

### `analyst/` — nouveau, Phase 2

Recommandations d'analystes (consensus monthly + price target 12 mois) sur le Dossier ticker, sous-bloc « Recommandations analystes » de la section « Fondamentaux ». Même pattern hexagonal que `news/` : un port + deux adapters + dispatcher `@Primary` + service applicatif cache-bearing.

- Domain `AnalystSnapshot` provider-neutre (`{symbol, asOf, strongBuy, buy, hold, sell, strongSell, totalAnalysts, consensus, priceTarget?, history[]}`), enum `AnalystConsensus` (`BUY` / `HOLD` / `SELL` / `MIXED`), helper pur `deriveConsensus(...)` (seuils 60 % bullish/bearish, 50 % hold ; `MIXED` sinon — choix conservateur, on préfère MIXED à un BUY trompeur sur 55/45).
- Port `AnalystRecommendationClient`. Deux adapters cohabitent, sélectionnés par `analyst.provider` :
  - `FinnhubAnalystClient` (`finnhub`) — appelle `/stock/recommendation?symbol=...&token=...` (requis) **et** `/stock/price-target?symbol=...&token=...` (optionnel — fail-soft à `null` sur 401/403/5xx/network parce que le price-target est derrière un paid tier sur certains comptes ; le snapshot reste utile sans). Mappers purs (`FinnhubAnalystMappers`) : tri défensif `period` ASC (Finnhub documente newest-first mais on ne fait pas confiance), cap history à 6 mois, all-zero target → `null` (Finnhub renvoie le shell zéro pour les symbols sans target — afficher « $0 » serait trompeur).
  - `MockAnalystClient` (`mock`, défaut) — feed synthétique déterministe par symbole (seed = hash) avec biais réaliste (~50 % bullish, ~30 % mixed, ~20 % bearish) et drift mois-sur-mois pour que la trend line ne soit pas plate. Symboles réservés : `UNKNOWN` (404), `RATELIMIT` (503), `NOTARGET` (snapshot avec `priceTarget = null`, pour reproduire la dégradation Finnhub sans flipper de provider).
- `RoutingAnalystClient` (`@Primary`) — délègue per-call à l'adapter actif lu via `appConfig.getString(analyst.provider)`. Cache-key prefix volontairement absent (la clé dans le service applicatif n'inclut pas le provider) → un switch s'applique au prochain dossier ouvert sans rétention d'entrée stale.
- `AnalystRecommendationService` avec `@Cacheable("analyst-recommendations", key = "#symbol.toUpperCase()")` (méthode Java SpEL). Finnhub stamp les snapshots mensuellement → 15 min de staleness sont invisibles au user, mais ça épargne le quota free tier sur les re-clics.
- 1 endpoint REST : `GET /api/market/ticker/{symbol}/analyst-recommendations`. Erreurs `NoSuchElementException` (404 « no analyst coverage ») et `UpstreamUnavailableException` (503, exception cross-context dans `shared/`) partagées avec tous les providers externes.

### `earnings/` — nouveau, Phase 2

Earnings trimestriels (4 derniers Q estimate / actual / surprise %) + prochaine date d'annonce attendue sur le Dossier ticker, 2ᵉ sous-bloc « Résultats » de la section « Fondamentaux » sous le sous-bloc analyste. Même pattern hexagonal que `news/` et `analyst/` : un port + deux adapters + dispatcher `@Primary` + service applicatif cache-bearing.

- Domain `EarningsSnapshot` provider-neutre (`{symbol, nextEarningsDate?, nextEarningsTime?, lastReports[]}`), `EarningsReport` (`{period, epsEstimate?, epsActual?, surprisePercent?}`), enum `EarningsTime` (BEFORE_MARKET / AFTER_MARKET / UNSPECIFIED), helper pur `computeSurprisePercent` qui gère `null` + zero estimate (évite la div-by-zero) + estimate négatif via `abs()` au dénominateur (un beat sur loss-making garde un sign positif).
- Port `EarningsClient`. Deux adapters cohabitent, sélectionnés par `earnings.provider` :
  - `FinnhubEarningsClient` (`finnhub`) — appelle `/stock/earnings?symbol=...&token=...` (requis) **et** `/calendar/earnings?from=...&to=...&symbol=...&token=...` (optionnel — fail-soft à `null` sur 401/403/5xx/network parce que le calendrier sit derrière un paid tier sur certains comptes Finnhub ; le snapshot reste utile sans la prochaine date). Fenêtre 90 j en avant — la prochaine annonce trimestrielle est ~3 mois max, querier plus burnerait du quota sur du stale future-future. Mappers purs (`FinnhubEarningsMappers`) : tri défensif `period` ASC, cap reports à 4 trimestres, recalcul `surprisePercent` côté code (Finnhub round inconsistemment sur small caps), filtre calendar par symbol + `epsActual == null` (cleanest "did it happen yet" signal vs un date >= today qui race avec la matinée du print), pick the earliest, mapping `bmo`/`amc`/`""`/`dmh` → enum (collapse les inconnus à UNSPECIFIED).
  - `MockEarningsClient` (`mock`, défaut) — feed synthétique déterministe par symbole (seed = hash) avec EPS dans la bande $0.30–$3.50, surprise ±15 % autour de l'estimé pour produire un mix réaliste beat/miss, drift ±8 % d'un trimestre à l'autre pour une time-series stable mais pas plate, next-date 1–60 j en avant pour que le countdown reste lisible. Symboles réservés : `UNKNOWN` (404), `RATELIMIT` (503), `NOCALENDAR` (snapshot avec `nextEarningsDate = null`, pour reproduire la dégradation Finnhub sans flipper de provider).
- `RoutingEarningsClient` (`@Primary`) — délègue per-call à l'adapter actif lu via `appConfig.getString(earnings.provider)`. Cache-key prefix volontairement absent (la clé dans le service applicatif n'inclut pas le provider) → un switch s'applique au prochain dossier ouvert sans rétention d'entrée stale.
- `EarningsService` avec `@Cacheable("earnings", key = "#symbol.toUpperCase()")` (méthode Java SpEL). Reports changent au plus une fois par trimestre, calendar move daily mais lentement → 15 min de staleness sont invisibles au user, mais ça épargne le quota free tier sur les re-clics.
- 1 endpoint REST : `GET /api/market/ticker/{symbol}/earnings`. Erreurs `NoSuchElementException` (404 « no earnings data » quand reports ET calendar sont vides) et `UpstreamUnavailableException` (503, exception cross-context dans `shared/`) partagées avec tous les providers externes.

### `config/` — Phase 2

Configuration éditable en runtime, sans redémarrage backend. Couvre **douze clés** (Phase 2 → Phase 2.5) : `market.twelvedata.api-key`, `market.finnhub.api-key`, `anthropic.api.key` (les trois SECRETs masqués côté DTO), `market.cache.ttl-minutes`, `market.provider` (mock ↔ twelvedata), `news.provider` (mock ↔ finnhub), `analyst.provider` (mock ↔ finnhub), `earnings.provider` (mock ↔ finnhub), `llm.provider` (mock ↔ claude ↔ ollama), `ollama.model`, `anthropic.api.model` et `llm.timeout-seconds` (INT 60..900, défaut 400 — slider unique côté UI qui pilote `OllamaClient.readTimeout` et la fenêtre de dedup du `TickerNarrativeJobStore` côté backend ; côté front il alimente l'affichage « estimation max » sur la card LLM via `LlmTimeoutService`).

- **`AppConfigService`** — service singleton qui lit les défauts YAML via `@Value` et les surcharge avec ce qui est en BDD (`app_config`, V4). Cache mémoire `ConcurrentHashMap` primé au boot via `@PostConstruct` puis maintenu en write-through sur chaque `set` / `reset`. Émet un `ConfigChangedEvent` sur changement effectif.
- **`ConfigController`** — `GET /api/config` (liste avec masquage des secrets), `PUT /api/config/{key}` (set), `DELETE /api/config/{key}` (reset au défaut), `POST /api/config/test/{provider}` (probe live d'une clé candidate sans la sauver, `provider` = `twelvedata` / `finnhub` / `anthropic`), `POST /api/config/test/llm` (probe d'un couple `(provider, model)` candidate avec le prompt fixe « Reply with exactly the word OK. » — retourne latence + correctness).
- **`ConfigTestClient`** — RestClient dédié qui appelle `/quote?symbol=AAPL` côté Twelve Data ou Finnhub pour valider une clé en cours d'édition, et `/v1/messages` (Claude) ou `/api/chat` (Ollama) pour valider un nom de modèle. Pour la clé Anthropic, `testAnthropicKey(candidate)` round-trip Claude avec la clé candidate et le modèle courant. Découplé des adapters de production parce que le test doit fonctionner même quand le provider actif est `mock` ou que le modèle/clé candidate n'a pas encore été sauvé.
- **Lecture per-call dans les adapters** — `TwelveDataClient`, `FinnhubClient` et `ClaudeClient` ne stockent plus leur clé en `@Value` figée à la construction du bean ; tous lisent `appConfig.getString(...)` à chaque appel. Pour Claude, le header `x-api-key` est posé per-request (`request.header(...)`) plutôt que via `defaultHeader()` builder-side, sinon le RestClient capturerait la clé à la construction. Le YAML reste injecté comme défaut au niveau de `AppConfigService`.
- **TTL cache dynamique** — `MarketConfig.cacheManager` lit le TTL initial via `AppConfigService` au boot. `CacheTtlListener` (composant séparé) écoute `ConfigChangedEvent` et appelle `setCaffeine(...)` sur le `CaffeineCacheManager` quand `market.cache.ttl-minutes` bouge. Trade-off accepté : le rebuild **invalide les entrées en cours** — coût marginal sur un TTL qu'on change rarement.
- **Switch provider à chaud** — sept beans `@Primary` au total (`RoutingMarketChartClient`, `RoutingSymbolSearchClient`, `RoutingSectorClassifier` dans `market/`, plus `RoutingNewsClient`, `RoutingAnalystClient`, `RoutingEarningsClient`, et `RoutingLlmClient` dans `analysis/infrastructure/llm/`) délèguent à l'adapter sélectionné par `market.provider` / `news.provider` / `analyst.provider` / `earnings.provider` / `llm.provider` au moment de chaque appel. `RoutingSectorClassifier` route le mode live `twelvedata` vers Finnhub plutôt que Twelve Data — `/profile` côté Twelve Data est paid-tier only, le routing absorbe la disparité côté client sans exposer le détail au reste de l'app. Les anciens `@ConditionalOnProperty` sur les adapters concrets et les HttpConfig sont retirés ; les deux `RestClient` (Twelve Data et Finnhub) cohabitent et sont qualifiés par `@Qualifier("twelveDataRestClient")` / `@Qualifier("finnhubRestClient")` côté clients. Coût : deux RestClients en mémoire au lieu d'un (négligeable). Bénéfice : rotation provider depuis `/settings/configuration` sans reboot, le bascule s'applique au prochain dossier ouvert. **Stratégie de cache hétérogène à connaître** : seul `MARKET_CHART_CACHE` côté `TwelveDataClient` préfixe sa clé par adapter (`twelvedata|…`, `mock|…`). Les quatre autres caches (`news-by-symbol`, `analyst-recommendations`, `earnings`, `sector-by-symbol`) cachent au niveau service applicatif sans préfixe — un toggle `mock → finnhub` continue de servir la valeur du provider précédent jusqu'à expiration TTL (~15 min). C'est un compromis assumé : un dossier ouvert dans la fenêtre post-switch peut afficher des news mock juste après le passage en live ; corrigé soit en attendant le TTL, soit en homogénéisant les six caches sur un même modèle (ticket dette technique 🟢 Basse — démoté 2026-05-16, cosmétique).
- **LLM provider + model runtime (Phase 2.5)** — `RoutingLlmClient` (`@Primary`) délègue à `MockLlmClient`, `ClaudeClient` ou `OllamaClient` selon `appConfig.getString(llm.provider)`. Les trois beans sont toujours instanciés (les `@ConditionalOnProperty` historiques sont retirés). Le nom de modèle est lu per-call via `appConfig.getString(anthropic.api.model)` / `appConfig.getString(ollama.model)` ; la clé Anthropic suit le même pattern depuis Phase 2.5 v2 (2026-05-08, cf. SECRET ci-dessus) ; l'URL base Ollama reste en YAML (rotation très rare, valeur stable sur la durée de vie du process). `modelId()` route lui aussi pour que le snapshot narratif capture l'identifiant exact du modèle qui a répondu (`mock:narrative-v1`, `claude:claude-opus-4-6`, `ollama:qwen2.5:3b`) — switcher de provider au runtime garde l'historique honnête. **`MockLlmClient` (livré 2026-05-15)** ferme la dette « parité Mock partout » : narratif JSON déterministe par symbole (seed = hash), sentiment distribué BULLISH/NEUTRAL/BEARISH, symbole réservé `RATELIMIT` qui lève `UpstreamUnavailableException` pour exercer le 503 sans provider réel. Permet un `tilt up` sans aucune clé API ni daemon Ollama.
- **LLM timeout runtime (Phase 2.5 v1.5)** — `llm.timeout-seconds` (INT 60..900, défaut 400) pilote en une seule clé : `OllamaClient` reconstruit son `RestClient` per-call avec le read timeout courant (cost négligeable, le `SimpleClientHttpRequestFactory` ne supporte pas la mutation in-place du timeout) ; `TickerNarrativeJobStore.pendingFor` lit la valeur au moment du dedup. Côté frontend, `LlmTimeoutService` (`providedIn: 'root'`) primé via `provideAppInitializer` au boot expose un `signal<number>` consommé par les surfaces UI qui affichent l'estimation max (card LLM dans `/settings/configuration`) ; depuis la migration SSE (Phase 2.5), il ne pilote plus d'abort de poller — la SSE qui se ferme suffit côté transport. Refresh explicite quand l'utilisateur sauve la nouvelle valeur via le slider sur `/settings/configuration`. Bénéfice : un user qui passe de qwen2.5:3b à qwen2.5:7b (cold-start plus long) tune le timeout sans code change ; un debug session peut le baisser à 60 s pour échouer plus vite. Hors scope : `ClaudeClient.readTimeout` reste à 60 s hardcoded — l'API Anthropic résout en 1-3 s, le slider serait du bruit pour ce chemin.

### `auth/` — Phase 4 v1 (livré 2026-05-17)

Authentification OAuth2 Google OIDC + rôles ADMIN/USER + profile dev `local-no-auth` qui bypasse Spring Security pour le dev solo. Phase orthogonale aux features métier ; structure hexagonale standard.

#### Domain + persistence

- **`User`** (entity JPA, table `app_user`) — `id UUID`, `email UNIQUE`, `displayName?`, `provider` (`google` / `local-dev`), `providerId?` (le `sub` claim Google), `role` (enum `ADMIN` / `USER`, CHECK constraint en BDD), `createdAt`, `lastLoginAt`. Nom de table `app_user` (pas `user`) parce que `user` est un mot réservé PostgreSQL.
- **`UserRepository`** Spring Data avec `findByEmail(email)` — la clé naturelle de lookup post-OAuth.
- **Multi-tenant `user_id` FK livrée dans le même diff Phase 4** — `portfolio.user_id` et `watchlist_entry.user_id` sont des FK `NOT NULL ON DELETE CASCADE` vers `app_user(id)`. La contrainte UNIQUE de `watchlist_entry` passe de `(symbol)` à `(user_id, symbol)` (deux users peuvent watcher AAPL en parallèle). Toutes les requêtes de lecture sur portfolio / asset / watchlist sont scopées par `authService.getCurrentUser().id` via méthodes dérivées Spring Data (`findByIdAndUserId`, `findAllByUserId`, `findByUserIdAndName`, `findByUserIdAndSymbol`) ou par JPQL `WHERE … user.id = :userId`. Les tables non-scopées (snapshots narratifs, app_config, prompt_template, prompt_score) restent globales par design — voir `architecture.md > Décisions techniques notables > Phase 4` pour la décision `@ManyToOne User` cross-bounded-context.

#### Security infrastructure

- **`SecurityConfig`** (`@Profile("!local-no-auth")`) — filter chain prod : `requestMatchers("/actuator/health", "/login/**", "/oauth2/**", "/swagger-ui/**", "/v3/api-docs/**").permitAll()`, `requestMatchers("/api/config/**", "/api/prompts/**", "/api/narrative/observability/**").hasRole("ADMIN")`, `anyRequest().authenticated()`. Entry point retourne **401** (pas 302) pour que l'interceptor SPA décide du redirect.
- **`oauth2Login()` conditionnel sur `ClientRegistrationRepository`** via `ObjectProvider.ifAvailable` — sans creds OAuth, le bean n'existe pas et le filter chain wire sans `oauth2Login`. Permet au smoke test `BackendApplicationTests.contextLoads` de booter sans aucune config OAuth.
- **Deux user services câblés en parallèle** :
  - `CustomOAuth2UserService` extends `DefaultOAuth2UserService` — pour les futurs providers OAuth2 non-OIDC (e.g. GitHub OAuth sans scope `openid`). Wire via `userService(...)`.
  - `CustomOidcUserService` extends `OidcUserService` — pour Google OIDC. Wire via `oidcUserService(...)`. **Sans ce service séparé**, Spring fallback sur `OidcUserService` par défaut qui retourne un `DefaultOidcUser` — `AuthService.getCurrentUser` crash alors sur le type principal inattendu (regression observée et fixée le 2026-05-17).
  - Les deux services partagent `CustomOAuth2UserService.findOrCreateUser(email, sub, name, provider)` qui : (a) trouve la row par email et la met à jour en place (lastLoginAt, providerId, displayName si non-blank) **sans changer le rôle** ; (b) la crée si absente, avec le rôle calculé une seule fois depuis la whitelist `app.admin.emails`.
- **Deux principal types** convergent sur `AppUserPrincipal { val userId: UUID }` (interface marker placée dans `auth/domain/` pour respecter la frontière hexagonale `application/ → domain/` ; délibérément sans `email` pour éviter le clash JVM signature avec `DefaultOidcUser.getEmail()`) : `AppOAuth2User` (pour local-no-auth et futur OAuth2 non-OIDC) et `AppOidcUser extends DefaultOidcUser` (pour Google OIDC, hérite l'accès aux claims OIDC du DefaultOidcUser).
- **`CsrfTokenResponseFilter`** (Spring 6 lazy CSRF workaround) — `OncePerRequestFilter` ajouté après `CsrfFilter` qui touch `csrfToken?.token` pour forcer l'écriture du cookie `XSRF-TOKEN` sur **chaque réponse**. Sans ça Spring 6 résout le token lazy, le cookie n'est jamais écrit, et la SPA n'a rien à forwarder.
- **`LocalNoAuthSecurityConfig`** (`@Profile("local-no-auth")`) + **`LocalNoAuthFilter`** (`OncePerRequestFilter`) + **`LocalNoAuthUserInitializer`** (`CommandLineRunner` qui seed un user `dev@local.test` ADMIN au boot, idempotent) — bypassent Spring Security en dev. CSRF reste **enabled** sous ce profile aussi pour matcher le shape de prod (pas de surprise au switch en oauth mode). `FilterRegistrationBean(filter).isEnabled = false` empêche la double-registration globale du filtre.

#### Application + HTTP

- **`AuthService`** — `getCurrentUser()` lit `SecurityContextHolder.authentication.principal as? AppUserPrincipal` puis relit la row `User` en BDD via `userId` pour servir la version **fresh** (un `UPDATE app_user SET role=...` SQL est visible à la prochaine requête, pas besoin de relog). `isAdmin()` lit `.role == ADMIN`.
- **`AuthController`** — `GET /api/me` retourne `{email, displayName, role}` via DTO. Logout via le handler natif Spring `POST /logout`, pas de controller custom.

#### Config + secret management

- **`app.frontend-url`** (env `APP_FRONTEND_URL`, défaut `/`) — cible du `defaultSuccessUrl` post-login OAuth. En prod (SPA + backend même origine derrière reverse proxy), `/` suffit. En dev, doit pointer vers le port SPA (`http://localhost:4201/`) sinon le user atterrit sur le backend après OAuth (Whitelabel 404).
- **`app.admin.emails`** (env `APP_ADMIN_EMAILS`) — comma-separated, case-insensitive. Seul effet : assignation du rôle ADMIN à la création de la row `User`. Modifications ultérieures via SQL (la BDD est l'autorité post-creation).
- **`server.forward-headers-strategy: framework`** (`application.yml`) couplé avec `xfwd: true` côté `frontend/proxy.conf.js` — fait que Spring construit ses URLs (notamment le `redirect_uri` OAuth envoyé à Google) depuis `X-Forwarded-Host`. En dev, le browser parle au SPA sur `localhost:4201` ; le proxy CLI forward au backend `localhost:8081` en injectant les forwarded headers ; Spring voit `localhost:4201` et génère un `redirect_uri` sur ce port → Google redirige le browser sur `localhost:4201/login/oauth2/code/google` → le proxy attrape via la règle `/login/oauth2` → backend traite et set le cookie de session sur `localhost:4201` → utilisable par les calls `/api/me` suivants. Sans ça, le cookie serait scopé `localhost:8081` et invisible au SPA.
- **Secrets boot-time** (`SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_{CLIENT_ID,CLIENT_SECRET}`, `APP_ADMIN_EMAILS`, `APP_FRONTEND_URL`) vivent dans `.env` (gitignored) et sont `sourced` par le `serve_cmd` Tilt → exportés au sous-process gradle → lus par Spring via relaxed binding. `application-local.yml` est volontairement vide de credentials. **Les clés API runtime-editable** (Anthropic, Twelve Data, Finnhub) restent dans la table `app_config` via `/settings/configuration` (Phase 2.5, SECRET slots) — pas en `.env`.
- **Toggle `BACKEND_AUTH_MODE`** (`no-auth` défaut / `oauth`) dans `.env`, lu **dans le shell du serve_cmd** au runtime (pas au parse Starlark). 2 boutons Tilt sur la ressource `backend` flippent la valeur en éditant `.env` et touchent `application.yml` pour relancer le backend dans le mode opposé. Le shell calcule `--spring.profiles.active=local,local-no-auth` (no-auth) ou `local` (oauth).

### `shared/`

Utilitaires transverses :

- `GlobalExceptionHandler` — mapping uniforme des erreurs en JSON (`NoSuchElementException` → 404, `IllegalArgumentException` → 400, `UpstreamUnavailableException` → 503).
- `UpstreamUnavailableException` — exception cross-context, levée par tous les adapters externes (Finnhub news / analyst / earnings, Twelve Data, Claude, Ollama) quand le provider est rate-limited / unreachable / 5xx / auth-failed. Vit ici plutôt que dans `market/domain/` parce que le contrat 503 est identique pour les six providers — pas de raison que `news/` importe une exception de `market/`.

## Modules frontend

Hexagonal léger sous `frontend/src/app/` :

- **`core/`** — split sur **5 sous-dossiers** : api/ (HTTP buckets) + local/ (browser-persisted) + app-state/ (UI signal services) + http/ (interceptors, Phase 4) + router/ (guards, Phase 4).
  - **`core/api/<bucket>/`** — bounded contexts HTTP, un bucket par module backend (`market/`, `portfolio/` qui regroupe Portfolio + Snapshot, `watchlist/`, `news/`, `analyst/`, `earnings/`, `config/`, `analysis/`, `auth/`). Chaque bucket contient son port (`<name>.repository.ts` = abstract class) + ses adapters dans `<bucket>/adapters/<name>.http.ts` (`HttpXxxRepository`) + ses services bucket-locaux à la racine du bucket. Le bucket `analysis/` regroupe l'ensemble du périmètre LLM (`prompt.repository`, `narrative-feedback.repository`, `narrative-observability.repository`, `narrative-bias.repository`, `ollama-status.repository`) **plus** trois services bucket-locaux : `ollama-status.service.ts` (polling daemon), `job-stream.service.ts` (SSE EventSource Phase 2.5 — wrappe `/api/market/ticker/{symbol}/narrative/jobs/{id}/stream`, expose un `Observable<JobEvent>` qui complète sur `DONE` / `ERROR`), `llm-timeout.service.ts` (signal primé via `provideAppInitializer`). Le bucket `auth/` (Phase 4) expose `AuthRepository` (`getCurrentUser()` → `/api/me` retournant `{email, displayName, role}`, `logout()` → `POST /logout` natif Spring).
  - **`core/local/<bucket>/`** — bounded contexts persistés navigateur, même forme port + `adapters/<name>.local.ts`. Seul habitant aujourd'hui : `annotation/` (chart h-line annotations, `LocalStorageAnnotationRepository`, swap futur vers backend-backed sans rewrite UI).
  - **`core/app-state/`** — services UI signal cross-cutting (`theme.service.ts` + `language.service.ts`, couples symétriques signal + persist localStorage, drivés par le toolbar header) + **`auth.service.ts`** (Phase 4 — signal `currentUser` + computeds `isAuthenticated` / `isAdmin`, primé au boot via `provideAppInitializer(() => inject(AuthService).refresh())`. `refresh()` swallow 401 + non-401 errors et expose un signal `lastError` consommé par la page `/error` + `clearError()`. Le boot ne crash jamais — un backend down rend une SPA bootable où le user peut au moins logout). **Pas de port/adapter** — services concrets sans counterpart distant, pas des bounded contexts.
  - **`core/http/auth.interceptor.ts`** (Phase 4) — `HttpInterceptorFn` qui catch les erreurs `/api/**` : **401 → `auth.clear()` + redirect `/login`** (session expirée mid-session). **Les 5xx ne sont pas interceptés** — les composants gèrent leurs erreurs en local (fail-soft, banners inline) ; `/error` reste atteignable par navigation manuelle (`AuthService.lastError`). Skip explicitement `/api/me` (déjà géré par `AuthService.refresh`) et `/api/config` (admin-only — un USER non-ADMIN reçoit toujours 403, et `LlmTimeoutService.refresh` peut le hitter au boot avant la résolution OAuth).
  - **`core/router/auth.guards.ts`** (Phase 4) — deux `CanActivateFn` signal-based : `authGuard` (redirect `/login` si `isAuthenticated()` false), `adminGuard` (redirect `/dashboard` si `isAdmin()` false). Stack les deux sur les routes ADMIN-only (`/settings/**`, `/observability/**`) ; `authGuard` seul sur les autres.
  - 15 repositories au total (api/ + local/) : Portfolio, Snapshot, Market, Watchlist, News, Config, **Annotation** (chart user annotations, single-user mono-machine), **Analyst** (recommandations analystes par ticker, Phase 2), **Earnings** (résultats trimestriels + next-date par ticker, Phase 2), **OllamaStatus** (santé daemon Ollama : modèles loaded/available, latence ; backs le panneau État Ollama de `/settings/configuration`, Phase 2.5), **Prompt** (CRUD prompts narratifs : liste / activate / new version / stats agrégées, backs `/settings/prompts` et `/settings/prompts/:id/stats`, Phase 3), **NarrativeFeedback** (PATCH thumbs 👍/👎 sur le dernier `prompt_score` d'un snapshot, Phase 3), **NarrativeObservability** (timeline narratif vs prix par symbol + index des tickers avec ≥1 snapshot + chip cohérence vs précédent par card, backs `/observability` et `/observability/:symbol`, Phase 3 #1 livré 2026-05-13 étendu Phase 3 #2 livré 2026-05-14), **NarrativeBias** (agrégats corpus narratif en 4 sections : sentiment distribution + bias flag, calibration sentiment vs prix, topic coverage top-15, thumbs distribution ; backs `/observability/bias`, Phase 3 #3 livré 2026-05-14), **Auth** (Phase 4 — current user + logout).
  - Wiring : `core/providers.ts` (resté à la racine, dépend de chaque bucket) exporte `provideRepositories(): EnvironmentProviders` qui regroupe les 15 bindings `{ provide, useClass }` (Phase 4 a ajouté `Auth`), appelé depuis `app.config.ts` au même titre que `provideRouter()` / `provideHttpClient()`.
- **`public/i18n/`** — fichiers de traduction `<lang>.json` (FR + EN), servis comme assets statiques par le HTTP loader de `ngx-translate`
- **`features/`** — *primary adapters*
  - `login/` — Phase 4 — page `/login` standalone (toolbar masquée par `App.isStandaloneRoute()`). Carte centrée avec bouton « Se connecter avec Google » qui set `window.location.href = '/oauth2/authorization/google'`. `effect()` qui redirige vers `/dashboard` si `auth.isAuthenticated()` est déjà true au mount.
  - `error/` — Phase 4 — page `/error` standalone, surface globale pour les 5xx sur `/api/**` (routée par `auth.interceptor.ts` avec query params `status` + `url`). Affiche les détails techniques (HTTP status, URL appelée, dernier `auth.lastError()`) + 2 actions : « Se déconnecter et réessayer » (POST `/logout` → `/login`) et « Retour à la connexion » (navigate direct + `auth.clearError()`).
  - `dashboard/` — portefeuille, tickers détenus, watchlist (sidebar 3 sections collapsables)
  - `ticker/` — dossier par symbole en layout 2-col : **sidenav outils chart** à gauche (Amazon-style, foldable via chevron, sticky, état localStorage `ticker-sidenav-open`) qui héberge timeframe / benchmark / overlays / outils (annotation arm, clear anchor, reset zoom) / liste « Annotations posées » avec bouton supprimer par item ; colonne droite avec le graphe multi-timeframe + axes + crosshair + **overlay benchmark opt-in** (SPY/QQQ/IWM/Sector/Custom, Y-axis bi-mode prix/% return, 2ᵉ polyline dashed, `MatTooltipModule`) + **chart analyse interactive** (zoom drag-select avec brush mini-chart en bas, overlays MA50/MA200/Bollinger/52w hi-lo en multi-select, annotations h-line persistées localStorage par symbole, measure tools delta % + delta time entre deux clics), indicateurs, section Fondamentaux (analyst recommandations + earnings), news, narratif IA, bouton watchlist
  - `import/` — drag & drop CSV
  - `suivi/` — timeline snapshots
  - `settings/` — back-office avec sidenav : `configuration/` (runtime config Phase 2 — sub-sidenav interne « Providers de données » / « LLM »), `prompts/` (Phase 3 — liste des versions du prompt `narrative-default` avec activation + éditeur inline + diff side-by-side pour proposer une nouvelle version), `prompts/:id/stats` (Phase 3 — stats agrégées par prompt sur 30 jours : sparkline latence p50 + tableau quotidien runs / latence p50-p95 / taux retry / taux parse-validator failed / distribution thumbs)
  - `observability/` — Phase 3 #1 (livré 2026-05-13) + #2 + #3 (livrés 2026-05-14) : `index/` rend `/observability` (liste des symbols avec ≥1 snapshot et lien vers chaque page per-symbol + chip vers le bias dashboard) ; la page racine `/observability/:symbol` rend la timeline reverse-chronologique de cartes expandables avec filter bar (date range côté serveur + prompt dropdown côté serveur + chips thumbs client-side + reset) et **chip cohérence OK/WARN/HIGH** sur chaque card avec tooltip natif 5 lignes (sentiment / shared keypoints % / length ratio / price move signé) ; la page racine `/observability/bias` rend l'agrégat corpus-wide en 4 sections cards (sentiment bars horizontales avec chip biais suspecté, calibration table sentiment × delta1d/1w/1m, topic pills monospace top-15, thumbs stacked bars cross-sentiment scaling). Entrée navbar « Observabilité » ajoutée après Dashboard, lien d'entrée depuis le footer de la card narrative du dossier ticker (icône `history`)

## Schéma de base de données

Migration unique `V1__init.sql` (fusion V1→V10 livrée 2026-05-17, cf. `journal-livraisons.md > Phase 4`). Le V1 unifié crée 11 tables dans l'ordre des dépendances FK (parent avant enfant) :

1. `app_user` — racine du graphe multi-tenant (Phase 4) ;
2. `portfolio` — Phase 1, gagne `user_id NOT NULL` + FK `app_user(id) ON DELETE CASCADE` (Phase 4) ;
3. `asset` — Phase 1, étendu Phase 2 avec `status` / `opened_at` / `closed_at` (lifecycle OPEN/CLOSED) ;
4. `portfolio_snapshot` + `snapshot_position` — Phase 1, snapshots historiques par import CSV ;
5. `watchlist_entry` — Phase 2, gagne `user_id NOT NULL` + FK + UNIQUE `(user_id, symbol)` (Phase 4) + `instrument_type` Phase 2.5 ;
6. `app_config` — Phase 2, table key/value des surcharges runtime (global, pas scopé user) ;
7. `prompt_template` — Phase 3, versionning des prompts narratifs avec partial unique index `is_active = TRUE` par `name` ;
8. `ticker_narrative_snapshot` — Phase 1 étendu Phase 3 avec `prompt_template_id` FK `ON DELETE SET NULL` ;
9. `ticker_narrative_job` — Phase 1, job table avec `idempotency_key` ;
10. `prompt_score` — Phase 3, score par run (latency, retry, parse/validator failed, thumbs, llm_judge_score).

Plus le seed du prompt `narrative-default` actif (verbatim du `NARRATIVE_DEFAULT_BODY` Kotlin via dollar-quoting depuis V2). **V2** (`V2__reset_narrative_prompt_to_body.sql`, livré 2026-05-22) reset la ligne active vers le corps seul (`version = 'v3-body-only'`) et marque les anciennes lignes inactives `deprecated_at = now()` — leur réactivation depuis l'UI doublerait l'enveloppe technique avec leur ancien contrat JSON, à éviter.

`baseline-on-migrate: true` + `baseline-version: 0` dans `application.yml` — sur DB greenfield (CI, fresh clone, prod first deploy), Flyway baseline à V0 puis applique V1 + V2 normalement. Le header du fichier `V1__init.sql` documente la procédure de migration pour les DB existantes pré-squash (`docker compose down -v && tilt up` ou drop manuel de `flyway_schema_history`). Source de vérité = le fichier lui-même, pas cette description.

| Section | Tables | Statut |
|---------|--------|--------|
| Portefeuille & actifs | `portfolio`, `asset` | Actif |
| Snapshots historiques | `portfolio_snapshot`, `snapshot_position` | Actif |
| Narratifs ticker | `ticker_narrative_snapshot`, `ticker_narrative_job` | Actif Phase 1 |
| Watchlist | `watchlist_entry` | Actif Phase 2 |
| Config runtime | `app_config` | Actif Phase 2 |
| Prompt management & scoring | `prompt_template`, `prompt_score` | Actif Phase 3 |
| Auth | `app_user` | Actif Phase 4 |

## Décisions techniques notables

### Phase 1 — pivot ticker

**LLM = rédacteur, pas décideur** — le LLM digère des indicateurs **déjà calculés** (RSI, MA, momentum) et écrit un narratif. Il ne calcule jamais d'indicateurs (il les hallucine systématiquement) et ne produit pas de signal d'achat/vente. Cette séparation rend l'output testable (le code des indicateurs l'est) et l'IA productive sur ce qu'elle sait faire (écrire).

**Twelve Data en source primaire** — Yahoo Finance avait été choisi initialement (gratuit, sans clé, couverture mondiale) mais rate-limite agressivement les IPs résidentielles : ban observé sur résidentiel + VPN + cellulaire en validation Phase 1, malgré le cookie+crumb dance complet. Trop instable pour un projet perso à IP unique. Twelve Data prend le relais Phase 1 : REST documenté, free tier 800 credits/jour (largement suffisant avec un cache 15 min), TSX natif (XTSE), interface stable. Le code Yahoo a été supprimé — l'implémentation cookie+crumb reste consultable dans l'historique git (commit `b993440`) si on doit la rejouer pour un autre provider.

**Caching côté serveur — deux modèles cohabitent** (Caffeine, TTL 15 min, en mémoire). Pas besoin de Redis à cette échelle.

- **Modèle A — clé préfixée par adapter** : `MARKET_CHART_CACHE` (`market-chart`) côté `TwelveDataClient` utilise la clé `'twelvedata|' + …` (avec un préfixe `'mock|'` symétrique). Conséquence : un toggle de provider ne sert *jamais* une valeur du provider précédent — chaque adapter a son propre namespace de cache, isolés au runtime. C'est le bon modèle quand on accepte qu'un toggle invalide l'effort de cache (le `mock` doit re-générer ses 260 bars synthétiques même si on revient à `mock` après un détour `twelvedata`).
- **Modèle B — clé sans préfixe, cache au niveau service applicatif** : les quatre autres caches (`news-by-symbol`, `analyst-recommendations`, `earnings`, `sector-by-symbol`) vivent sur le service applicatif (`NewsService`, `AnalystRecommendationService`, `EarningsService`, `SectorClassifierService`) avec `@Cacheable(key = "#symbol.toUpperCase()" + éventuel `|#limit`)` — le provider n'est pas dans la clé. Conséquence assumée : un toggle `mock → finnhub` continue de servir la valeur cachée du précédent provider jusqu'à expiration TTL (~15 min). Le `RoutingNewsClient` / `RoutingAnalystClient` / `RoutingEarningsClient` documentent explicitement ce choix dans leur KDoc.

**Pourquoi cette hétérogénéité ?** Historique : `TwelveDataClient` était le premier adapter à supporter un mock co-routé, donc il a posé le préfixe défensif avant que les autres modules adoptent le même pattern (sans le porter). Le coût d'aligner sur un modèle unique est mineur (~1-2 h refacto + un test du toggle), mais le bénéfice runtime est faible : la fenêtre de staleness 15 min sur un toggle est invisible à l'usage réel (un dossier ré-ouvert plus tard repart à neuf). Le compromis est assumé — homogénéisation tracée comme dette technique 🟢 Basse (option (a) du ticket « Stratégie de cache », démoté 2026-05-16).

**Provider de marché abstrait + mock local** — `MarketChartClient` est un port qui retourne un `MarketChart` (types domaine `TickerQuote` + `List<OhlcBar>`). Deux implémentations cohabitent, sélectionnées par `market.provider` :
- `twelvedata` — défaut prod, requiert `market.twelvedata.api-key` (env `TWELVEDATA_API_KEY`).
- `mock` — défaut sans clé, génère une série OHLC déterministe par symbole (seed = hash). Symboles réservés `UNKNOWN` (404) et `RATELIMIT` (503) pour exercer les chemins d'erreur.

**Twelve Data — quirks à absorber** — l'API a deux pièges qui justifient un parser tolérant : (1) **les nombres sont des strings JSON** (`"open": "180.00"`) — on désérialise en `String` et convertit avec `toBigDecimalOrNull`/`toLongOrNull` ce qui tolère naturellement `""` et `"NaN"` observés sur tickers illiquides ; (2) **les erreurs reviennent en HTTP 200** avec `{status: "error", code: 404}` dans le body — il faut inspecter le body et pas juste le code HTTP. Mapping : `code 404` → `NoSuchElementException`, `429` → `UpstreamUnavailableException("rate-limited")`, `401`/`403` → `auth-failed`. Bonus : la clé API absente est détectée *avant* l'appel HTTP et lève `UpstreamUnavailableException` avec un message actionnable — pas de credit gaspillé sur une mauvaise config.

**Claude API par défaut** — sur les premiers itérations Phase 1, Mistral 7B sortait des narratifs grammaticalement corrects mais financièrement creux. Le saut de qualité Claude est largement supérieur au coût (~quelques cents par dossier). Ollama (`qwen2.5:3b` par défaut, sélectionnable au runtime) reste activable pour le dev offline (`llm.provider: ollama`).

**Snapshot du narratif systématique** — chaque consultation d'un ticker persiste `{prix_du_jour, indicateurs, narrative}`. Sans ça, l'observabilité Phase 3 (relire ce que disait l'IA il y a 1 mois) est aveugle.

**Cache snapshot 30 min + dedup job 5 min** — un re-clic sur un dossier ticker ne doit ni rappeler le LLM (cher en Claude, lent en Ollama) ni créer de jobs concurrents. Le service réutilise le snapshot existant si âge < 30 min, sinon réutilise le job pending si âge < 5 min, sinon kick un nouveau job. Front toujours uniforme : POST puis poll.

**Configuration runtime éditable** (Phase 2) — clés API et TTL de cache vivaient en `@Value` injectées à la construction du bean, donc figées jusqu'au prochain reboot. Pour permettre la rotation d'une clé sans redémarrer le backend, on a introduit `AppConfigService` (table `app_config`, surcharge BDD au-dessus du défaut YAML) et bascule les adapters (`TwelveDataClient`, `FinnhubClient`) sur une lecture per-call. Les défauts YAML sont aujourd'hui groupés dans **trois `@Component` data classes** (`SecretsDefaults`, `DataProvidersDefaults`, `LlmDefaults`, 2026-05-15) injectées dans `AppConfigService` ; seul `market.cache.ttl-minutes` reste en `@Value` standalone parce qu'il ne s'agence pas naturellement avec un des trois groupes — détail du pattern (vs `@ConfigurationProperties`) dans la skill `spring-boot`. Pour le TTL Caffeine, le builder est figé au moment du `setCaffeine` ; on écoute un `ConfigChangedEvent` et on rebuild le spec via `CaffeineCacheManager.setCaffeine(...)` — accepte d'invalider les entrées en cours, négligeable sur un changement rare. Pas de chiffrement BDD v1 (projet local) — à durcir si on déploie un jour.

**Pas de wildcard imports en Kotlin** (Phase 2.5 outillage) — pour éviter qu'IntelliJ consolide les imports en `*` (défaut "Optimize Imports" au-delà de 5 imports/package), deux couches de défense : (1) `.editorconfig` racine avec `ij_kotlin_name_count_to_use_star_import = MAX` qui bloque la consolidation à la source ; (2) custom step Spotless `no-wildcard-imports` (cf. `backend/build.gradle.kts`) qui scanne et lance `GradleException` sur tout wildcard hors allowlist (14 packages encore tolérés, à shrinker progressivement). Volontairement pas de ktlint — ktlint avec `ij_kotlin_packages_to_use_import_on_demand` listant des packages applique la sémantique IntelliJ et **force** les wildcards sur ces packages, comportement inverse au but recherché (vérifié douloureusement, 152 fichiers reformatés en consolidation `*` avant rollback). Custom step en pure-check pour cette raison. Detekt rule `WildcardImport` désactivée — Spotless casse le build, Detekt ne ferait que rapporter en double.

**Ollama containerisé même sur Mac, malgré la dégradation CPU** (Phase 2.5, décision tranchée 2026-05-09) — Docker Desktop sur Mac est une VM Linux virtualisée qui n'expose pas Metal, donc Ollama tourne en CPU pur dans le container : un narratif `qwen2.5:3b` peut saturer 9 cores ~918 % pendant 60–180 s, là où le même modèle sur Ollama natif macOS (Metal activé) répond en 5-10 s. Trois options analysées (cf. [`docs/devops/decision-ollama-deploiement.md`](../devops/decision-ollama-deploiement.md)) : (1) sortir Ollama de Compose et installer en natif via `brew`, (2) override Compose Mac vs cible Linux GPU, (3) statu quo. **Option 3 retenue** : depuis l'arrivée de Claude API comme défaut Phase 1, Ollama est devenu un outil de dev (exercer parsing/validation/SSE sans cramer des appels Claude) et un fallback offline, pas le chemin produit principal. Le coût onboarding de l'option 1 (un service de plus à gérer hors Tilt, perte du « clone + `tilt up` = tout marche ») ne se justifie pas tant que l'usage Ollama reste occasionnel. L'option 2 paie une dette infrastructurelle pour une cible Linux GPU hypothétique — Phase 5 hosting (OVH / Hetzner / Scaleway / Lightsail dans la fourchette 5-15 €/mois) n'a pas de GPU dans cette gamme. Re-trigger pour réévaluer : machine dédiée, usage Ollama > 20 % des sessions, ou distribution du repo à des contributeurs Linux/Windows.

**Tracking du modèle LLM par snapshot** — chaque snapshot stocke `LlmClient.modelId()` (`mock:narrative-v1`, `ollama:qwen2.5:3b` ou `claude:claude-opus-4-6`) au moment de la génération. Indispensable Phase 3 pour comparer la qualité narrative entre versions de modèle ou entre providers, et pour filtrer après coup les snapshots produits par un modèle plus faible (ou par le mock, qui pollue les agrégats si laissé non filtré) sans relire le contenu.

### Phase 3 — observabilité narrative

**Split corps éditable / enveloppe technique du prompt narratif** (2026-05-22, commit `bec4c40`) — initialement, l'utilisateur éditait *tout* le system prompt depuis `/settings/prompts` (persona + contrat JSON + règle sentiment + règle null-skip). Risque : un édit hâtif qui casse `"sentiment": "BULLISH" | "NEUTRAL" | "BEARISH"` ou supprime « Reply with ONLY this JSON object » plante tout le pipeline narratif jusqu'au prochain rollback. **Refonte** : split du prompt en deux pièces. **(1) Corps** (`NARRATIVE_DEFAULT_BODY`, persisté dans `prompt_template.system_prompt`, éditable depuis l'UI) — la persona / ton / focus, libre. Même un mot ("bonjour") reste valide. **(2) Enveloppe technique** (`NARRATIVE_TECHNICAL_ENVELOPE_SUFFIX`, hardcodée dans `TickerNarrativePrompt.kt`, **non éditable depuis l'UI**) — contrat JSON, règle sentiment, règle null-skip, garde-fou longueur. Au runtime, `assembleNarrativeSystemPrompt(body)` concatène `body + "\n\n" + envelope_suffix` ; le résultat est ce que `TickerNarrativeExecutor` envoie à `LlmClient.complete`. **Pourquoi ce design** : (a) protège le contrat JSON de tout édit utilisateur, le pipeline ne peut plus être cassé depuis l'UI ; (b) garde l'UX d'édition vivante pour la part qui mérite vraiment d'être tunée (le ton, l'angle, l'emphase sur certains indicateurs) ; (c) garantit que Claude reçoit toujours les mêmes garde-fous indépendamment de ce que l'utilisateur tape. **Migration V2** (`V2__reset_narrative_prompt_to_body.sql`) reset la ligne active vers le corps seul et marque les anciennes inactives `deprecated_at = now()` (les réactiver doublerait l'enveloppe avec leur ancien contrat). **Surface UI** : la page `/settings/prompts` rename « System prompt » → « Prompt body (persona / tone) » + panneau read-only repliable « Voir l'enveloppe technique » qui montre exactement ce qui est appendu (chargé lazy via `GET /api/prompts/envelope`, cache une fois ouvert).

**Validateur narrative = garde-fou anti-runaway, pas policy de longueur** (2026-05-22) — `TickerNarrativeValidator.MAX_SENTENCE_TERMINATORS` initialement à 4 (strict 2-3 phrases), levé à 10 puis 100 en deux temps. La motivation est double : (a) **Claude Opus est verbeux par nature** sur les outputs structurés — un narratif tight de 5-9 phrases courtes était systématiquement rejeté alors qu'il était parfaitement lisible et factuel ; (b) **`max_tokens=600` sur l'appel LLM coupe bien avant 100 phrases**, donc le validateur ne sert que de filet de sécurité contre une sortie pathologique (paragraphe-essai qui overflow la card du dossier). Le **steering de longueur est délégué à l'enveloppe technique du prompt** : la spec du `summary` dans l'enveloppe demande explicitement « A thorough technical summary, typically 5-12 sentences, walking through each available indicator ». L'enveloppe + le prompt orientent la longueur cible ; le validateur ne sanctionne que les vrais dérapages. Trade-off : on n'a plus de garantie machine sur la longueur 2-3 phrases d'origine, mais le besoin produit a évolué vers un narratif plus complet (cf. user feedback 2026-05-22 « on veut un résumé assez complet ») — la longueur courte n'était plus la cible.

### Patterns transverses backend

**Ports outbound dans `domain/`** (B1, 2026-05-15) — les 7 interfaces de port (`MarketChartClient`, `SymbolSearchClient`, `SectorClassifier`, `NewsClient`, `AnalystRecommendationClient`, `EarningsClient`, `LlmClient`) vivent dans `<context>/domain/` aux côtés des types qu'elles retournent (`MarketChart`, `NewsItem`, etc.). Lecture hexagonale stricte : le domaine déclare ce dont il a besoin de l'extérieur, l'infrastructure le réalise. Les adapters (`Mock*`, `Finnhub*`, `Twelve*`, `Claude*`, `Ollama*`, `Routing*` `@Primary`) restent en `<context>/infrastructure/<capability>/`. Trade-off accepté : on perd la co-localisation port+adapters d'avant (un argument du compromis « pragmatique » historique) ; on gagne l'inversion de dépendance honnête (`application/` importe depuis `domain/`, pas depuis `infrastructure/`) et la possibilité de tester un service applicatif sans toucher `infrastructure/`. Les `JpaRepository` Spring Data restent en `infrastructure/persistence/` parce qu'ils sont framework-tied par construction — pas le même type de port.

**`@Async` sur bean séparé** — Spring AOP ne proxifie pas les appels internes (`this.method()`). Le pattern `Service → Runner (@Async) → Executor (@Transactional)` reste valide et est repris pour `TickerNarrativeService → TickerNarrativeRunner`.

**LLM call hors transaction** — l'appel LLM (1-15 s en Claude, plus long en Ollama) ne doit pas tenir de connexion Hikari. Le pipeline est éclaté pour respecter ça.

**Validation de schéma** — `ddl-auto: validate`. Hibernate valide le schéma au démarrage. Toute modification d'entité = migration Flyway.

**Tests d'intégration sur vrai PostgreSQL** — pas de mocks BDD, pas de H2. Le CI démarre un service PostgreSQL.

**Portefeuille CSV-driven, pas de CRUD manuel** — le portefeuille reflète la réalité du courtier. L'import CSV Wealthsimple reste la seule source de vérité des positions.

**Snapshot avec `batch_id`** — un import CSV peut couvrir plusieurs comptes. Le `batch_id` UUID commun regroupe tous les snapshots d'un même import pour l'affichage en timeline.

### Phase 1+ — frontend

**Ports & adapters léger, groupés par bounded context** — depuis le refactor 2026-05-16 étendu en Phase 4, `core/` est split sur 5 sous-dossiers : `core/api/<bucket>/<name>.repository.ts` (port = abstract class) + `core/api/<bucket>/adapters/<name>.http.ts` (adapter HTTP) pour les 9 buckets miroirs du backend (`market/`, `portfolio/`, `watchlist/`, `news/`, `analyst/`, `earnings/`, `config/`, `analysis/`, `auth/`) ; `core/local/<bucket>/` pour les ports persistés navigateur (annotation seul aujourd'hui, adapter localStorage) ; `core/app-state/` pour les services UI signal cross-cutting (theme, language, auth — pas de split port/adapter) ; `core/http/` (interceptors, Phase 4) ; `core/router/` (route guards, Phase 4). Composants injectent l'abstraction. Tests : on mock le port, l'adapter a son propre spec HTTP dans le `adapters/` du bucket.

**Resource builders sur le port** (pilote 2026-05-16 sur `SnapshotRepository`) — au lieu d'exposer `Observable<T>` à plat et de laisser chaque composant câbler `rxResource` + trigger-signal + accumulator par id, le port abstract class porte **des builders concrets hérités** : `allResource()` retourne un `rxResource` simple, `xxxCache(trigger: Signal<id>)` retourne un `Signal<Map<id, T[]>>` cooked (l'accumulator `effect()` vit dans la méthode du port). Les adapters n'implémentent que les méthodes HTTP abstract ; les builders sont hérités. Composants : `inject(Repository).allResource()` à l'init de champ, lecture directe de `.value()` / `.isLoading()` / `.error()` côté template — plus de `.subscribe()`, plus de `ngOnInit`, plus de gestion manuelle `loading`/`error` à la main. **Contrainte mocks** : les tests doivent provisionner le mock via `useClass MockXxxRepository extends XxxRepository` (un `useValue` plat perdrait les builders hérités). **Alternative écartée** : `rxMethod` de `@ngrx/signals/rxjs-interop` (NgRx Signals non installé) — `effect()` du `@angular/core` couvre déjà le cas signal-native sans aller-retour `toObservable → pipe → subscribe`. Convention détaillée dans la skill `angular-signals > Resource builders live on the port itself`. Adoption progressive aux 13 autres repositories suivie comme ticket Dette technique 🟡.

**Tokens de thème** — variables CSS sur `:root`, override sur `[data-theme='light']`. Material 3 wired en dual-theme. Default = sombre. Toggle dans le header, persistance localStorage, anti-FOUC via script inline dans `index.html`.

**Zoneless explicite** — `provideZonelessChangeDetection()` dans `app.config.ts`, pas de `zone.js` installé. La state est 100 % signal-based : un template re-rend automatiquement quand un signal qu'il lit change, plus une intercepte sur les events handlers et l'`async` pipe. Pas besoin d'`OnPush` puisque le rebuild est déjà opt-in par construction. La config est rendue lisible plutôt que devinée.

**i18n runtime via `ngx-translate`** — fichiers `public/i18n/<lang>.json` chargés via le HTTP loader (assets statiques). Composants importent `TranslatePipe` (granulaire, pas tout `TranslateModule`). `LanguageService` est le miroir signal-based de `ThemeService` : signal + localStorage + fallback navigateur (`fr-*` → `fr`, sinon `en`). Le switcher header utilise un `mat-menu` avec drapeaux unicode. Aucune string utilisateur en dur dans le code — uniquement des clés. Les erreurs dynamiques côté TS passent par `TranslateService.instant('key', { params })`.

### Phase 4 — authentification

**Google = OIDC, pas OAuth2 simple — Spring traite les deux séparément** — Google envoie systématiquement un ID token avec le code d'autorisation dès qu'on demande le scope `openid` (ce qui est notre cas). Spring Security route alors via `OidcAuthorizationCodeAuthenticationProvider` + `OidcUserService`, qui produit un `DefaultOidcUser` — pas le `OAuth2User` du chemin OAuth2 simple. Câbler **uniquement** `userService(customOAuth2UserService)` sur `userInfoEndpoint(...)` n'est jamais appelé pour Google ; il faut **aussi** câbler `oidcUserService(customOidcUserService)`. Sinon le principal stocké est le `DefaultOidcUser` Spring et le cast `as? AppUserPrincipal` dans `AuthService.getCurrentUser` crash en 500. Bug observé et fixé le 2026-05-17 — la stack trace `Unexpected principal type org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser — expected AppOAuth2User` est le smoking gun. Les deux services partagent un `findOrCreateUser` interne pour la persistance ; seul le wrapping en principal diffère.

**SPA + backend sur ports distincts en dev → trust forwarded headers** — sans config, le proxy CLI forward le `/oauth2/authorization/google` au backend avec `changeOrigin: true`, donc Spring voit `Host: localhost:8081` et envoie un `redirect_uri=http://localhost:8081/login/oauth2/code/google` à Google. Le browser fait alors la callback **directement** sur `:8081`, le cookie de session est posé sur cette origine, et le SPA tournant sur `:4201` n'y a pas accès (Chrome scope les cookies host-only par port). La solution : `xfwd: true` dans `frontend/proxy.conf.js` (ajoute `X-Forwarded-Host/Port/Proto`) + `server.forward-headers-strategy: framework` dans `application.yml` (Spring lit les forwarded headers via `ForwardedHeaderFilter`). L'OAuth dance entier passe alors par `localhost:4201` du point de vue browser + Google ; le cookie est stocké sur la bonne origine ; le SPA `/api/me` remonte la session. Conséquence : le redirect URI à enregistrer dans Google Cloud Console est `http://localhost:<FRONTEND_HOST_PORT>/login/oauth2/code/google` (le port front, pas backend).

**CSRF re-enabled avec pattern cookie-based SPA** — `CookieCsrfTokenRepository.withHttpOnlyFalse()` écrit le token dans un cookie `XSRF-TOKEN` lisible par JS (Angular's `HttpClient` le lit auto, set le header `X-XSRF-TOKEN` sur POST/PUT/PATCH/DELETE relatifs). `CsrfTokenRequestAttributeHandler` (plain, **pas** le `XorCsrfTokenRequestAttributeHandler` par défaut Spring 6) parce que la SPA forward la valeur raw du cookie sans pouvoir désobfusquer un XOR. `CsrfTokenResponseFilter` (`OncePerRequestFilter` custom, inséré après `CsrfFilter`) touch `csrfToken?.token` à chaque request pour forcer l'écriture du cookie — sans ça Spring 6 résout le token lazy et le cookie n'est jamais écrit, donc la SPA n'a rien à forwarder et tout POST 403. Activé dans **les deux** filter chains (prod via `SecurityConfig`, dev via `LocalNoAuthSecurityConfig`) pour matcher le shape — disabling en dev ferait apparaître des bugs uniquement au switch en oauth mode.

**`defaultSuccessUrl` configurable via `app.frontend-url`** — Spring's default redirect post-OAuth est `/` (résolu relativement au host). Avec `forward-headers-strategy: framework`, ce `/` résoudrait vers le SPA en dev. Mais on garde un override explicite via `@Value("\${app.frontend-url:/}")` pour deux raisons : (a) si jamais un dev oublie d'activer `xfwd`, l'override absolu sauve l'UX (atterrissage sur le SPA quand même) ; (b) en prod avec un reverse proxy, on pourra y mettre un FQDN dédié si besoin. Le défaut `/` reste correct pour la prod single-origin.

**Profile `local-no-auth` bypass complet pour le dev solo** — `LocalNoAuthSecurityConfig` `@Profile("local-no-auth")` remplace `SecurityConfig` (qui a `@Profile("!local-no-auth")`). `LocalNoAuthFilter` (`OncePerRequestFilter`) injecte un `AppOAuth2User` synthétique référençant la row `dev@local.test` seedée au boot par `LocalNoAuthUserInitializer` (`CommandLineRunner`, idempotent). **Pas de session HTTP, pas d'OAuth dance** — `tilt up` reste 0-friction sans config Google. Le toggle `BACKEND_AUTH_MODE=no-auth|oauth` (`.env`) est lu **au runtime** dans le `serve_cmd` shell du Tiltfile (pas au parse Starlark) ; 2 boutons Tilt « Mode → … » flippent la valeur en éditant `.env` et touchent `application.yml` pour redéclencher le serve_cmd, qui re-calcule les `--spring.profiles.active` sur la base de la nouvelle valeur. CSRF reste enabled même sous `local-no-auth` pour matcher le shape.

**Whitelist email = seed du rôle ADMIN, pas re-évaluation** — `CustomOAuth2UserService.findOrCreateUser` lit `app.admin.emails` (env `APP_ADMIN_EMAILS`, comma-separated, case-insensitive) **uniquement à la création** de la row `User` : un email matchant → ADMIN, sinon USER. Re-appliquer la whitelist à chaque login écraserait une rétrogradation manuelle SQL (`UPDATE app_user SET role='USER'`), ce qui est anti-intuitif. La BDD est l'autorité post-creation ; promotion / rétrogradation ultérieure via SQL ou endpoint admin futur.

**Secrets boot-time vs runtime-editable** — distinction stricte : (a) les credentials qui doivent être présentes au boot pour Spring Security wire-up (`SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_{CLIENT_ID,CLIENT_SECRET}`, `APP_ADMIN_EMAILS`, `APP_FRONTEND_URL`) vivent dans `.env` (gitignored), sont **sourced** par le `serve_cmd` Tilt → exportées au sous-process gradle → lues par Spring via relaxed binding ; (b) les clés API runtime-editable (Anthropic, Twelve Data, Finnhub) **restent** dans `app_config` via `/settings/configuration` (Phase 2.5, SECRET slots) — pas en `.env`. `application-local.yml` est volontairement vide de credentials. En prod, même pattern : env vars injectées par le secret manager du provider (Phase 5 — ticket « GitHub Secrets + Environments » du backlog formalise le pipeline CI/CD).

**Page `/error` globale + AuthService graceful-degraded** — `AuthService.refresh` swallow tous les errors HTTP (401 et 5xx) et expose `lastError` signal, pour que le boot ne crash jamais. Sans ça, un backend down rendrait la SPA inbootable (Angular's `provideAppInitializer` failure = bootstrap failure). L'interceptor route les 5xx sur `/api/**` (sauf `/api/me` + `/api/config`) vers `/error` avec query params `status` + `url` — surface globale pour les états bloqués (e.g. session authentifiée mais user manquant en BDD). Deux actions sur la page : logout + retry, ou retour à `/login`. La toolbar applicative se masque automatiquement sur `/login` et `/error` via `App.isStandaloneRoute()` pour rendre ces pages en full-screen.

**Multi-tenant FK — `@ManyToOne User` toléré cross-bounded-context** (décision 2026-05-17 lors du wrap Phase 4 + code review « À discuter B ») — `Portfolio.kt` et `WatchlistEntry.kt` (entities JPA dans leurs `domain/` respectifs) référencent `com.portfolioai.auth.domain.User` via un `@ManyToOne` strict. C'est une **dépendance cross-bounded-context au niveau du modèle** — le `domain/` de `portfolio/` et `watchlist/` importe depuis le `domain/` de `auth/`. Le pattern DDD strict (« contexts share via ID, not aggregate ref ») recommanderait un `userId: UUID` plat + JOIN explicite côté requêtes. **Choix pragmatique retenu** : `@ManyToOne` pour deux raisons. (a) **Verbosité JPQL** — sans la relation, chaque query qui lit un Portfolio ou une WatchlistEntry devrait écrire `WHERE p.userId = :userId AND p.id = :id` à plat, et chaque nouvelle méthode `findXxx` du repository peut oublier le prédicat scope, créant un leak cross-user silencieux. Avec `@ManyToOne`, le scoping passe par les méthodes derivées Spring Data (`findByIdAndUserId`, `findAllByUserId`, `findByUserIdAndName`) qui sont lisibles d'un coup d'œil et impossibles à oublier (le compilateur force le second paramètre). (b) **Invariant fort, pas un partage incident** — `Portfolio` et `WatchlistEntry` n'existent **que** dans le contexte d'un User (FK `ON DELETE CASCADE` dans `V1__init.sql`). Ce n'est pas un couplage circonstanciel qu'un futur refacto voudra rompre — c'est l'essence du modèle multi-tenant. **Alternative écartée** (UUID plat + JOIN explicite) : 30 % de boilerplate JPQL en plus pour aucun gain ; un repository Spring Data dérivé devient un `@Query` annotation manuelle. **Limite de la tolérance** : seuls les *entities JPA* peuvent traverser un bounded context de cette façon ; les *ports* (`MarketChartClient`, `LlmClient`, etc.) restent strictement isolés dans leur context — un port qui dépendrait d'un type d'un autre context signalerait un vrai problème de modélisation. **Trace dans le code** : commentaire d'intention dans `Portfolio.kt:23-28` (au-dessus du `@ManyToOne`) et `WatchlistEntry.kt:18-27` (KDoc de classe qui couvre la contrainte UNIQUE `(user_id, symbol)` + propagation `ON DELETE CASCADE`).

### Phase 5 — déploiement

**Whitelist d'accès gérée par UI runtime, pas par env var** (décision 2026-05-19, livrée même jour) — l'app Cloud Run est ouverte sur internet (`--allow-unauthenticated` + Google OAuth, par construction puisqu'une URL `*.run.app` ne peut pas être gated au niveau infrastructure pour un service public). Sans gating applicatif, n'importe quel compte Google qui découvre l'URL crée un row `app_user` USER et consomme les LLM credits. Le ticket aurait pu se résoudre via une `APP_ALLOWED_EMAILS` env var poussée à chaque deploy — solution simple mais friction quotidienne (un nouveau testeur = redeploy + nouveau Release tag). **Choix retenu** : runtime slot `app.allowed.emails` dans `app_config` (table Phase 2.5), éditable via `/settings/access-control` page ADMIN-only, prise d'effet au prochain login sans redéploiement. Mirror exact du pattern Phase 2.5 SECRET slots (clés Anthropic / Twelve Data / Finnhub déjà runtime-editable). **Trois invariants critiques** : (a) **Union effective `admins ∪ allowed_emails`** checkée au login — l'admin ne peut pas se lock out en retirant son email de la UI (les emails `APP_ADMIN_EMAILS` boot-time sont auto-inclus, le code source de vérité est `CustomOAuth2UserService.assertAuthorized`). (b) **Check en tête de `findOrCreateUser`** avant le `findByEmail` lookup — couvre NOUVEAU et EXISTANT ; un row pré-gated (créé pendant le mode laxiste post-deploy) ne peut plus relogin si l'admin pose ensuite la liste sans l'y inclure. (c) **Fallback bootstrap = mode laxiste** quand DB et env var sont vides (`getAllowedEmails().isEmpty()` → `return` court-circuit dans `assertAuthorized`) — backward compat pour un fresh deploy avant que l'admin ne pose la 1re liste. Le sacrifice : window de vulnérabilité entre le 1er deploy et la 1re save UI. Acceptable parce que cette fenêtre est courte (l'admin va dans `/settings/access-control` dans les minutes qui suivent), et la fenêtre `APP_ADMIN_EMAILS`-only existait déjà en Phase 4 (où n'importe quel Google account créait un USER row). **Rejection path** : `OAuth2AuthenticationException(OAuth2Error("not_authorized"))` jeté depuis l'userService → catché par Spring Security `OAuth2LoginAuthenticationFilter` → invoque le `failureHandler` ajouté à `SecurityConfig` qui inspecte le code d'erreur et redirige `/login?error=not_authorized` (vs `/login?error=oauth_failed` pour les autres failures OAuth). La SPA `LoginPage` lit le `?error=` queryParam via `toSignal(route.queryParamMap)` et affiche un banner i18n. **Audit log** filed comme follow-up Phase 6 si jamais multi-admin émerge (table `access_control_audit` : qui a ajouté/retiré quel email + quand).

**Google Cloud Run + Supabase Postgres retenu comme hébergement v1** (décision 2026-05-18, **révisée le même jour** après deux clarifications utilisateur — analyse complète dans [`docs/devops/deploiement.md`](../devops/deploiement.md)). L'analyse initiale du matin recommandait Fly.io sur l'hypothèse « Ollama en prod requis ». Deux clarifications l'ont retournée dans l'après-midi : (1) constraint #4 relaxée de « PaaS strict » à « tout l'état infra dans le repo, IaC bienvenu » ; (2) **LLM prod = Mock + Claude uniquement, Ollama exclu de la prod**. Cette 2e clarification a fait passer le besoin RAM de ~6 GB (avec Ollama qwen2.5:3b) à ~2 GB (backend + Postgres seuls), ce qui réouvre la fenêtre serverless type Cloud Run. **Trois arguments décisifs en faveur de Cloud Run + Supabase** : (a) **$0/mo durable** dans les free tiers Google (2M req + 360K GB-s + 180K vCPU-s + 1 GB egress N. America) et Supabase (500 MB DB + 50K MAU + auto-pause 7j inactivité). Pas un free trial 12 mois — historique stable depuis 2019 côté Cloud Run, en croissance 2020-2026 côté Supabase. (b) **Région Montréal native côté compute** — `northamerica-northeast1` (datacenter Google physiquement à Montréal) = ~5 ms TTL, identique au best-case Fly `yyz`. DB Supabase US-East par défaut (~25 ms RTT par requête) invisible à l'usage single-user. (c) **Charge ops récurrente = zéro** — Cloud Run gère scale-to-zero, OS patches, TLS, alerting natif ; Supabase gère backups PG quotidiens, patches, monitoring. Aucun cron à câbler pour la maintenance, juste un cron de backup d'exit (cf. discipline ci-dessous). **Plan phasé** : (1) **Phase 5a** $0/mo — Cloud Run service `northamerica-northeast1` + Supabase free + Angular static embarqué dans le jar + Mock/Claude LLM, Ollama UI 503. (2) **Phase 5b** $0/mo encore — Cloudflare gratuit devant Cloud Run (custom domain + TLS + cache + bypass egress quota) + monitoring Healthcheck.io + Sentry hobby tier. (3) **Phase 5c** $0-25/mo — si free tier serre : migration Supabase → Neon free en 30 min, ou upgrade Supabase Pro $25/mo, ou bascule globale Fly $10/mo. **GitOps strict avec Workload Identity Federation** : trigger `on: release: published`, GitHub Environment `production` avec `id-token: write` permission pour échanger un OIDC token court-terme contre un access token GCP via `google-github-actions/auth@v2` (**pas de service account JSON key** dans GitHub Secrets), puis `gcloud run deploy` avec `--update-secrets` qui mount les secrets depuis GCP Secret Manager. Aucun click sur `console.cloud.google.com` après le bootstrap initial. **Lock-in cosmétique** : Dockerfile standard `linux/amd64` + Postgres standard 15 sans extension Supabase-specific + Cloud Run service.yaml ~30 lignes ; effort migration sortie ~2-3 h vers Fly / Neon / Oracle / VPS. **Discipline non-négociable dès le 1er deploy** (préserve la migrabilité) : (a) zéro SDK Supabase dans `build.gradle.kts` (uniquement `DATABASE_URL` JDBC), (b) zéro dépendance Cloud Run-specific (pas d'usage de `K_SERVICE`/`K_REVISION` sauf logging), (c) backup `pg_dump` nocturne via cron GitHub Actions vers Cloudflare R2 free (10 GB) — la rétention 30j de notre backup est indépendante de Supabase. **Pourquoi pas Fly.io ($10/mo)** : single-vendor + DX excellent mais $120/an pour les mêmes capacités qu'un setup $0/mo bien câblé. La consolidation single-vendor ne joue plus maintenant qu'Ollama est hors prod (le scenario Fly Phase 5b $35/mo disparaît). Reste un **fallback légitime** documenté (Plan C de Phase 5c) si Cloud Run + Supabase déçoivent ensemble. **Pourquoi pas Oracle A1 Ampere ($0)** : sans Ollama, les 24 GB ARM deviennent overkill (~2 GB utilisés sur 24) et CPU 95p < 20 % déclenche la reclamation 7j idle — mitigeable par upgrade PAYG mais on garde une sysadmin légère récurrente (`unattended-upgrades`, Caddy TLS, restore drill). Reste un fallback si on veut garder l'option Ollama future. **Pourquoi pas VPS + IaC (Hetzner CX22 ~$5/mo)** : sans Ollama l'avantage RAM/coût ne joue plus et la latence Falkenstein ~100 ms reste pénalisante. Sortirait seulement si on voulait apprendre les Linux ops. **Pourquoi pas Railway / Render** : pas de région Canada/Toronto (latence ~25-30 ms vs ~5 ms Cloud Run Montréal), et Railway Hobby $5/mo / Render Starter $7/mo sont plus chers que Cloud Run free tier durable.

---

## Modèle pipeline d'analyse (vision Phase 3 + Phase 6)

> **Statut** : design cible, non encore implémenté. Documenté ici pour cadrer les prochains tickets backlog Phase 6 (« DAG unifié » Vague 1 #1, « Réintégration Phase 0 » Vague 1 #2, « Page Jobs » Vague 1 #3, « Cron pré-chauffe » Vague 2 #4). Voir `docs/metier/vision.md > Le pipeline d'analyse` pour la framing produit.

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
