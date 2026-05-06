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
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│  RSS / macro / crypto      [gelé Phase 0]   │
└──────────────────┬─────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────┐
│         Backend  (Kotlin + Spring)          │
│                                             │
│  market/      → 3 ports : chart + sector +  │
│                 symb.search + indicateurs   │
│  analysis/    → narratif LLM par ticker     │
│  portfolio/   → import CSV, snapshots       │
│  watchlist/   → tickers suivis (Phase 2)    │
│  news/        → Finnhub + mock (Phase 2)    │
│  analyst/     → recos analystes Finnhub +   │
│                 mock (Phase 2)              │
│  config/      → runtime overrides (Phase 2) │
│  shared/      → utilitaires transverses     │
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│  ingestion/   → RSS scheduler  [gelé]       │
│  analysis/ (legacy) → reco portfolio [gelé] │
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
│    settings/     → sources, test, prompt    │
│  core/                                      │
│    *.repository.ts (ports)                  │
│    adapters/*.http.ts                       │
└────────────────────────────────────────────┘
```

## Modules backend

### `market/` — Phase 1, étendu Phase 2

Source primaire des données ticker. Trois ports outbound cohabitent dans le module — chacun avec un adapter `TwelveData*` et un adapter `Mock*` sélectionnés par `market.provider`, et un dispatcher `Routing*Client` (`@Primary`) qui délègue per-call.

#### Ports + adapters

- **`MarketChartClient`** (port, Phase 1) — interface qui retourne un `MarketChart` (quote + bars OHLC) en types domaine.
  - `TwelveDataClient` (`twelvedata`) — REST + apikey, défaut prod. Deux appels par dossier (`/time_series` + `/quote`), parsing tolérant aux quirks (numériques en strings, erreurs renvoyées en HTTP 200 avec `status: error`).
  - `MockMarketChartClient` (`mock`, défaut sans clé) — série OHLC synthétique déterministe par symbole. Symboles réservés `UNKNOWN` (404) et `RATELIMIT` (503) pour les chemins d'erreur UI.
  - `RoutingMarketChartClient` (`@Primary`, Phase 2) — délègue à l'adapter actif lu via `appConfig.getString(market.provider)` à chaque appel.
- **`SymbolSearchClient`** (port, Phase 2 watchlist v2) — autocomplete des tickers existants pour valider la saisie watchlist.
  - `TwelveDataSymbolSearchClient` — REST `/symbol_search` (1 credit/call).
  - `MockSymbolSearchClient` — ~30 symbols US/TSX seedés (prefix match symbol + substring match name), paths réservés `RATELIMIT` et `UNKNOWN`.
  - `RoutingSymbolSearchClient` (`@Primary`).
- **`SectorClassifier`** (port, Phase 2 benchmark v2) — résout un ticker à un `SectorBenchmark` (sector GICS canonique + SPDR ETF + nom complet). Backe l'overlay « Sector » du chart dossier ticker.
  - `TwelveDataSectorClassifier` — REST `/profile` (1 credit/call), parse le champ `sector`, route via `SpdrSectorEtfs` pour la table GICS → SPDR.
  - `MockSectorClassifier` — table hand-curée ~25 tickers populaires US/TSX (AAPL→Tech, JPM→Financials, RY.TO→Financials, etc.), paths réservés `UNKNOWN` (404) et `RATELIMIT` (503).
  - `RoutingSectorClassifier` (`@Primary`).

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

`MarketConfig` déclare 5 caches partagés : `market-chart` (chart endpoint), `news-by-symbol` (module `news/`), `symbol-search` (autocomplete watchlist), `sector-by-symbol` (sector classifier) et `analyst-recommendations` (module `analyst/`). Tous partagent le TTL piloté par `market.cache.ttl-minutes` (5–60 min, runtime-éditable depuis `/settings/configuration`).

### `analysis/` — Phase 1 réécrite

Le pipeline d'analyse en Phase 1 produit un **narratif LLM par ticker**, pas une recommandation portefeuille.

- `TickerNarrativeService` — point d'entrée : dedup d'un job pending sur le même symbole, réutilisation d'un snapshot frais (< 30 min), sinon kick async.
- `TickerNarrativeRunner` (`@Async` séparé pour respecter le proxy Spring) — exécute hors thread HTTP.
- `TickerNarrativeExecutor` — orchestrate : `MarketChartClient.fetchChart` → `IndicatorCalculator` → `buildNarrativeUserMessage` → `LlmClient.complete` → `TickerNarrativeParser` → `TickerNarrativeValidator` → `TickerNarrativePersister`. Parse + validate + 1 retry avec les erreurs en feedback.
- `TickerNarrativeParser` — parse `{summary, sentiment, keyPoints[]}` tolérant aux fences markdown, prose alentour, sentiment mixed-case.
- `TickerNarrativeValidator` — règles strictes : 3-5 keyPoints, ≤15 mots/bullet, summary 2-3 phrases, sentiment ∈ enum.
- Persistance dans `TickerNarrativeSnapshot` : `{symbol, generatedAt, price, indicatorsJson, summary, sentiment, keyPointsJson, modelUsed, promptVersion}` — append-only, permet la relecture a posteriori (Phase 3 observabilité).
- Job tracking dans `TickerNarrativeJob` (status PENDING/DONE/ERROR) pour le polling front.

> Le LLM **digère** des indicateurs déjà calculés. Il **ne calcule jamais** RSI, MA, etc. — sinon il hallucine les chiffres.

### `analysis/` (legacy) — gelé Phase 0

Pipeline historique de recommandations portefeuille — `AnalysisExecutor`, `AnalysisContextLoader`, `LlmResponseParser`, `RecommendationValidator` (8 règles : tickers ⊆ portefeuille, action ∈ enum, Σ targetWeight ∈ [95,105], etc.), `RecommendationPersister`, `AnalysisJobStore`. Le code reste en place et fonctionnel mais n'est plus exposé dans le flow utilisateur. Sera réactivé / repensé en Phase 4.

### `portfolio/`

Inchangé. Le portefeuille est **read-only depuis l'UI** — il reflète l'état réel du courtier Wealthsimple.

- **Import CSV** (`CsvImportService`) : parse l'export Wealthsimple (21 colonnes, FR, NFD, BOM UTF-8), upsert des positions par compte.
- **Snapshots** : `PortfolioSnapshot` + `SnapshotPosition` créés à chaque import, groupés par `batch_id`.

Sa nouvelle utilité Phase 1 : fournir la **liste des tickers détenus** au `market/` pour pré-charger les dossiers ticker pertinents.

### `watchlist/` — nouveau, Phase 2

Liste plate de tickers à surveiller hors portefeuille. Single-table feature, pas de rattachement à un user (l'app reste single-user pour l'instant).

- `WatchlistEntry` (entity) → table `watchlist_entry` (V3) `id UUID / symbol VARCHAR(20) UNIQUE / added_at`.
- `WatchlistService` : list (oldest first), add (idempotent — POST sur un symbole existant retourne la ligne existante), remove (404 si absent — non-idempotent volontairement pour que l'UI optimiste détecte une dérive d'état). Symbole normalisé en uppercase + trim côté service.
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

### `ingestion/` — gelé Phase 0

Module RSS complet (Rome, scheduler 15 min, déduplication par `guid`, parsing robuste DOCTYPE / `&` nus / détection HTML, 25 sources seedées). Conservé en place mais retiré du flow principal — Twelve Data remplit le rôle data marché en Phase 1.

Réutilisable plus tard pour de la macro non couverte par Twelve Data (Fed, BCE, indicateurs économiques) si besoin.

### `config/` — Phase 2

Configuration éditable en runtime, sans redémarrage backend. Couvre Phase 2 six clés : `market.twelvedata.api-key`, `market.finnhub.api-key`, `market.cache.ttl-minutes`, `market.provider` (mock ↔ twelvedata), `news.provider` (mock ↔ finnhub) et `analyst.provider` (mock ↔ finnhub).

- **`AppConfigService`** — service singleton qui lit les défauts YAML via `@Value` et les surcharge avec ce qui est en BDD (`app_config`, V4). Cache mémoire `ConcurrentHashMap` primé au boot via `@PostConstruct` puis maintenu en write-through sur chaque `set` / `reset`. Émet un `ConfigChangedEvent` sur changement effectif.
- **`ConfigController`** — `GET /api/config` (liste avec masquage des secrets), `PUT /api/config/{key}` (set), `DELETE /api/config/{key}` (reset au défaut), `POST /api/config/test/{provider}` (probe live d'une clé candidate sans la sauver).
- **`ConfigTestClient`** — RestClient dédié qui appelle `/quote?symbol=AAPL` côté Twelve Data ou Finnhub pour valider une clé en cours d'édition. Découplé des adapters de production parce que le test doit fonctionner même quand `market.provider=mock`.
- **Lecture per-call dans les adapters** — `TwelveDataClient` et `FinnhubClient` ne stockent plus la clé en `@Value` figée à la construction du bean ; ils lisent `appConfig.getString(...)` à chaque appel. Le YAML reste injecté comme défaut au niveau de `AppConfigService`.
- **TTL cache dynamique** — `MarketConfig.cacheManager` lit le TTL initial via `AppConfigService` au boot. `CacheTtlListener` (composant séparé) écoute `ConfigChangedEvent` et appelle `setCaffeine(...)` sur le `CaffeineCacheManager` quand `market.cache.ttl-minutes` bouge. Trade-off accepté : le rebuild **invalide les entrées en cours** — coût marginal sur un TTL qu'on change rarement.
- **Switch provider à chaud** — `RoutingMarketChartClient`, `RoutingNewsClient` et `RoutingAnalystClient` (tous `@Primary`) délèguent à l'adapter sélectionné par `market.provider` / `news.provider` / `analyst.provider` au moment de chaque appel. Les anciens `@ConditionalOnProperty` sur les adapters concrets et les HttpConfig sont retirés ; les deux `RestClient` (Twelve Data et Finnhub) cohabitent et sont qualifiés par `@Qualifier("twelveDataRestClient")` / `@Qualifier("finnhubRestClient")` côté clients. Coût : deux RestClients en mémoire au lieu d'un (négligeable). Bénéfice : rotation provider depuis `/settings/configuration` sans reboot, le bascule s'applique au prochain dossier ouvert. Cache key préfixée par adapter (`twelvedata|`, `mock|`) ⇒ pas de collision entre les deux espaces.

### `shared/`

Utilitaires transverses : `GlobalExceptionHandler` (mapping uniforme des erreurs en JSON).

## Modules frontend

Hexagonal léger sous `frontend/src/app/` :

- **`core/`** — ports + adapters (HTTP par défaut, localStorage pour les états client-only)
  - `*.repository.ts` (abstract class — port). 10 repositories : Portfolio, Analysis, Settings, Snapshot, Market, Watchlist, News, Config, **Annotation** (chart user annotations, single-user mono-machine), **Analyst** (recommandations analystes par ticker, Phase 2).
  - `adapters/*.http.ts` (HttpXxxRepository — HTTP adapter, défaut) ; `adapters/*.local.ts` pour les adapters client-only (`LocalStorageAnnotationRepository` v3 chart, swap futur vers backend-backed sans rewrite UI).
  - Wiring : `app.config.ts` `{ provide: XxxRepository, useClass: <impl> }`
  - `theme.service.ts` + `language.service.ts` — couples symétriques (signal + persist localStorage), drivés par le toolbar header
- **`public/i18n/`** — fichiers de traduction `<lang>.json` (FR + EN), servis comme assets statiques par le HTTP loader de `ngx-translate`
- **`features/`** — *primary adapters*
  - `dashboard/` — portefeuille, tickers détenus, watchlist (sidebar 3 sections collapsables)
  - `ticker/` — dossier par symbole : graphe multi-timeframe + axes + crosshair + **overlay benchmark opt-in** (SPY/QQQ/IWM/Sector/Custom, Y-axis bi-mode prix/% return, 2ᵉ polyline dashed, `MatTooltipModule`) + **chart analyse interactive** (zoom drag-select avec brush mini-chart en bas, overlays MA50/MA200/Bollinger/52w hi-lo en multi-select, annotations h-line persistées localStorage par symbole, measure tools delta % + delta time entre deux clics), indicateurs, narratif IA, bouton watchlist
  - `import/` — drag & drop CSV
  - `suivi/` — timeline snapshots
  - `settings/` — sources / test-sources / prompt-preview / configuration (runtime config Phase 2)
  - `recommendations/`, `history/` — *gelé Phase 0* (recommandations portefeuille)

## Schéma de base de données

Cinq migrations Flyway : `V1__init.sql` (schéma Phase 0), `V2__ticker_narrative.sql` (Phase 1 narratif), `V3__watchlist.sql` (Phase 2 watchlist), `V4__app_config.sql` (Phase 2 — table key/value des surcharges runtime), `V5__asset_lifecycle.sql` (Phase 2 — lifecycle de position OPEN/CLOSED).

| Section | Tables | Statut |
|---------|--------|--------|
| Portefeuille & actifs | `portfolio`, `asset` | Actif |
| Snapshots historiques | `portfolio_snapshot`, `snapshot_position` | Actif |
| Recommandations IA (legacy) | `recommendation`, `recommendation_action`, `recommendation_score` | Gelé |
| Jobs d'analyse (legacy) | `analysis_job` | Gelé (utilisé pour le polling Phase 0) |
| Sources d'ingestion | `feed_source`, `feed_article` | Gelé en pratique (table conservée pour les Settings UI) |
| Narratifs ticker | `ticker_narrative_snapshot`, `ticker_narrative_job` | Actif Phase 1 |
| Watchlist | `watchlist_entry` | Actif Phase 2 |
| Config runtime | `app_config` | Actif Phase 2 |

## Décisions techniques notables

### Phase 1 — pivot ticker

**LLM = rédacteur, pas décideur** — le LLM digère des indicateurs **déjà calculés** (RSI, MA, momentum) et écrit un narratif. Il ne calcule jamais d'indicateurs (il les hallucine systématiquement) et ne produit pas de signal d'achat/vente. Cette séparation rend l'output testable (le code des indicateurs l'est) et l'IA productive sur ce qu'elle sait faire (écrire).

**Twelve Data en source primaire** — Yahoo Finance avait été choisi initialement (gratuit, sans clé, couverture mondiale) mais rate-limite agressivement les IPs résidentielles : ban observé sur résidentiel + VPN + cellulaire en validation Phase 1, malgré le cookie+crumb dance complet. Trop instable pour un projet perso à IP unique. Twelve Data prend le relais Phase 1 : REST documenté, free tier 800 credits/jour (largement suffisant avec un cache 15 min), TSX natif (XTSE), interface stable. Le code Yahoo a été supprimé — l'implémentation cookie+crumb reste consultable dans l'historique git (commit `b993440`) si on doit la rejouer pour un autre provider.

**Caching côté serveur** — un dossier ticker peut être consulté plusieurs fois par jour. On cache les fetchs market (15 min) en Caffeine en mémoire. Le cache key préfixe par adapter (`twelvedata|`) pour qu'un provider futur puisse cohabiter sans collision. Pas besoin de Redis à cette échelle.

**Provider de marché abstrait + mock local** — `MarketChartClient` est un port qui retourne un `MarketChart` (types domaine `TickerQuote` + `List<OhlcBar>`). Deux implémentations cohabitent, sélectionnées par `market.provider` :
- `twelvedata` — défaut prod, requiert `market.twelvedata.api-key` (env `TWELVEDATA_API_KEY`).
- `mock` — défaut sans clé, génère une série OHLC déterministe par symbole (seed = hash). Symboles réservés `UNKNOWN` (404) et `RATELIMIT` (503) pour exercer les chemins d'erreur.

**Twelve Data — quirks à absorber** — l'API a deux pièges qui justifient un parser tolérant : (1) **les nombres sont des strings JSON** (`"open": "180.00"`) — on désérialise en `String` et convertit avec `toBigDecimalOrNull`/`toLongOrNull` ce qui tolère naturellement `""` et `"NaN"` observés sur tickers illiquides ; (2) **les erreurs reviennent en HTTP 200** avec `{status: "error", code: 404}` dans le body — il faut inspecter le body et pas juste le code HTTP. Mapping : `code 404` → `NoSuchElementException`, `429` → `MarketUnavailableException("rate-limited")`, `401`/`403` → `auth-failed`. Bonus : la clé API absente est détectée *avant* l'appel HTTP et lève `MarketUnavailableException` avec un message actionnable — pas de credit gaspillé sur une mauvaise config.

**Claude API par défaut** — la Phase 0 a montré que Mistral 7B sortait des justifications grammaticalement correctes mais financièrement creuses ("vendre pour un profit de 0.4%"). Le saut de qualité Claude est largement supérieur au coût (~quelques cents par dossier). Mistral reste activable pour le dev offline (`llm.provider: ollama`).

**Snapshot du narratif systématique** — chaque consultation d'un ticker persiste `{prix_du_jour, indicateurs, narrative}`. Sans ça, l'observabilité Phase 3 (relire ce que disait l'IA il y a 1 mois) est aveugle.

**Cache snapshot 30 min + dedup job 5 min** — un re-clic sur un dossier ticker ne doit ni rappeler le LLM (cher en Claude, lent en Ollama) ni créer de jobs concurrents. Le service réutilise le snapshot existant si âge < 30 min, sinon réutilise le job pending si âge < 5 min, sinon kick un nouveau job. Front toujours uniforme : POST puis poll.

**Configuration runtime éditable** (Phase 2) — clés API et TTL de cache vivaient en `@Value` injectées à la construction du bean, donc figées jusqu'au prochain reboot. Pour permettre la rotation d'une clé sans redémarrer le backend, on a introduit `AppConfigService` (table `app_config`, surcharge BDD au-dessus du défaut YAML) et bascule les adapters (`TwelveDataClient`, `FinnhubClient`) sur une lecture per-call. Pour le TTL Caffeine, le builder est figé au moment du `setCaffeine` ; on écoute un `ConfigChangedEvent` et on rebuild le spec via `CaffeineCacheManager.setCaffeine(...)` — accepte d'invalider les entrées en cours, négligeable sur un changement rare. Pas de chiffrement BDD v1 (projet local) — à durcir si on déploie un jour.

**Pas de wildcard imports en Kotlin** (Phase 2.5 outillage) — pour éviter qu'IntelliJ consolide les imports en `*` (défaut "Optimize Imports" au-delà de 5 imports/package), deux couches de défense : (1) `.editorconfig` racine avec `ij_kotlin_name_count_to_use_star_import = MAX` qui bloque la consolidation à la source ; (2) custom step Spotless `no-wildcard-imports` (cf. `backend/build.gradle.kts`) qui scanne et lance `GradleException` sur tout wildcard hors allowlist (14 packages encore tolérés, à shrinker progressivement). Volontairement pas de ktlint — ktlint avec `ij_kotlin_packages_to_use_import_on_demand` listant des packages applique la sémantique IntelliJ et **force** les wildcards sur ces packages, comportement inverse au but recherché (vérifié douloureusement, 152 fichiers reformatés en consolidation `*` avant rollback). Custom step en pure-check pour cette raison. Detekt rule `WildcardImport` désactivée — Spotless casse le build, Detekt ne ferait que rapporter en double.

**Tracking du modèle LLM par snapshot** — chaque snapshot stocke `LlmClient.modelId()` (`ollama:qwen2.5:3b` ou `claude:claude-opus-4-6`) au moment de la génération. Indispensable Phase 3 pour comparer la qualité narrative entre versions de modèle ou entre providers, et pour filtrer après coup les snapshots produits par un modèle plus faible sans relire le contenu.

### Conservé depuis Phase 0

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

### Gelé Phase 0 (référence)

Les décisions ci-dessous concernent du code **gelé** mais conservé. À relire si on réactive le pipeline portefeuille en Phase 4.

**Validation + auto-repair des réponses LLM (legacy)** — `RecommendationValidator` applique 8 règles strictes ; en cas d'invalide, re-prompt avec les erreurs. Au pire, `withHoldFallback` strip les hallucinations.

**Filtrage des articles par pertinence (legacy)** — `ArticleRelevanceScorer` classe les 200 derniers articles par score keyword (tickers, noms d'actifs, secteurs, mots-clés macro). Top 25 passé au LLM.

**Robustesse du parsing RSS (legacy)** — pré-traitement Rome (User-Agent, détection HTML, correction `&` nus, `isAllowDoctypes = true`).

**Fenêtres de timeout alignées (legacy, 400 s)** — invariant : `POLL_ABORT_SECONDS` (frontend) ≥ `DEDUP_WINDOW_SECONDS` (backend) ≥ 2 × `OllamaClient.readTimeout` + marge. Probablement à revoir en Phase 1 — Claude est nettement plus rapide, on pourra resserrer.
