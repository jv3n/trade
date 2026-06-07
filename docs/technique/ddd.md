# Architecture DDD — PortfolioAI

## Principes

Architecture hexagonale (Ports & Adapters) organisée en Bounded Contexts DDD.
Chaque contexte est autonome et possède ses propres couches.

## Bounded Contexts

> **Pivot juin 2026** — seuls `journal` (le produit) et `auth` (dont le journal dépend pour le multi-tenant) sont **live**. Les contextes `market` / `analysis` / `portfolio` / `news` / `analyst` / `earnings` / `watchlist` / `config` restent dans l'arbre en **sommeil** (providers conservés pour un éventuel enrichissement Phase 2).

| Contexte | Responsabilité | Statut |
|----------|----------------|--------|
| `journal` | **Journal de trading** — trade entries (CRUD + CSV io roundtrip + pagination / tri / filtres serveur), multi-tenant `user_id`. 4 enums Postgres natifs (play A/B, pattern GUS/FRD, open side FRONT/BACK, exit strategy SWING_20/EOD) | ✅ **Pivot v1.0 (live)** |
| `auth` | OAuth2 Google OIDC + rôles ADMIN/USER + profile dev `local-no-auth`. Source de vérité du `user_id` consommé par `journal` (et `portfolio`/`watchlist` dormants) | ✅ Phase 4 (live) |
| `portfolio` | Portefeuilles, actifs, import CSV, snapshots historiques | 💤 Dormant (pré-pivot) |
| `market` | Données ticker (Twelve Data + mock) + indicateurs techniques calculés | ✅ Phase 1 |
| `analysis` | Narratifs ticker (LLM rédacteur, pas décideur) + gestion des prompts narratifs en BDD avec scoring continu (latence / retry / parse-validator failed / thumbs user, Phase 3) | ✅ Phase 1 — étendu Phase 3 |
| `watchlist` | Liste plate de tickers suivis hors portefeuille (scopée user_id depuis Phase 4, UNIQUE `(user_id, symbol)`) | ✅ Phase 2 — multi-tenant Phase 4 |
| `news` | Headlines par ticker (Finnhub + mock), cache court | ✅ Phase 2 |
| `analyst` | Recommandations d'analystes par ticker (consensus monthly + price target 12 mois, Finnhub + mock), cache court | ✅ Phase 2 |
| `earnings` | Earnings trimestriels par ticker (4 derniers Q EPS estimate/actual/surprise % + prochaine date d'annonce, Finnhub + mock), cache court | ✅ Phase 2 |
| `config` | Surcharges runtime des défauts YAML (clés API, TTL cache, providers actifs) | ✅ Phase 2 |

> Le contexte `analysis` a vu son périmètre changer à la Phase 1 : il a été réorienté d'une orchestration de recommandations portefeuille (Phase 0 — 8 règles de validation, targetWeight, action enum) vers la génération de narratifs par ticker (`{summary, sentiment, keyPoints[]}`). Le code Phase 0 a été supprimé en Phase 2.5 ; le contexte `ingestion` (RSS) a été décommissionné dans la même opération.

## Structure de chaque contexte

```
{context}/
  domain/               # Entités JPA, enums, value objects + ports outbound (interfaces) — pas de dépendance Spring
  application/          # Services applicatifs, cas d'usage, orchestration ; consomment les ports depuis domain/
    dto/                # Objets de transfert (commandes, réponses)
  infrastructure/
    persistence/        # Spring Data repositories
    http/               # Controllers REST
    llm/                # (analysis) Adapters LLM : ClaudeClient, OllamaClient, MockLlmClient + RoutingLlmClient (@Primary) — implémentent LlmClient depuis analysis/domain/
    market/             # (market) Adapters des 3 ports outbound (chart / symbol-search / sector) — chaque port a Twelve Data + Mock + Routing (@Primary), ports eux-mêmes dans market/domain/
    news/               # (news) FinnhubClient + MockNewsClient + RoutingNewsClient (@Primary) — implémentent NewsClient depuis news/domain/
    analyst/            # (analyst) FinnhubAnalystClient + MockAnalystClient + RoutingAnalystClient (@Primary) — implémentent AnalystRecommendationClient depuis analyst/domain/
    earnings/           # (earnings) FinnhubEarningsClient + MockEarningsClient + RoutingEarningsClient (@Primary) — implémentent EarningsClient depuis earnings/domain/
    ConfigTestClient.kt # (config) RestClient dédié pour sonder une clé API candidate sans la sauver

shared/                 # Composants transverses (ex : GlobalExceptionHandler, UpstreamUnavailableException)
```

> **Note (B1, 2026-05-15)** — les interfaces de port (`*Client.kt`) ont été déplacées d'`infrastructure/<capability>/` vers `<context>/domain/` pour s'aligner sur l'hexagonal strict : le domaine déclare ce dont il a besoin de l'extérieur, l'infrastructure le réalise. Les adapters concrets (`Mock*`, `Finnhub*`, `Twelve*`, `Claude*`, `Ollama*`, `Routing*`) restent en `infrastructure/<capability>/`. Les `JpaRepository` Spring Data ne sont **pas** dans le même bucket — ils sont framework-tied par construction et restent en `infrastructure/persistence/`.

## Règles par couche

### `domain/`
- Entités JPA et leurs relations
- Enums métier (`AssetType`, `InstrumentType`, `EarningsTime`, `Sentiment`…)
- Value objects (les `Indicator` calculés peuvent vivre ici en data class pure)
- **Ports outbound** (`*Client.kt`, `*Classifier.kt` — interfaces que la couche application appelle pour parler à l'extérieur). Le domaine possède le contrat dont il dépend ; les adapters en `infrastructure/<capability>/` le réalisent.
- **Pas d'import** depuis `application/` ou `infrastructure/`
- **Pas de logique Spring** (pas de `@Service`, `@Repository`, etc.) — y compris pour les ports : aucun `@Component`, aucune annotation framework sur les interfaces

### `application/`
- Services orchestrant le domaine (`@Service`)
- Un service = un cas d'usage ou une famille de requêtes cohérente
- Peut importer depuis `domain/`, `dto/`, et `infrastructure/persistence/`
- **Pas d'import** depuis `infrastructure/http/`
- Les DTOs (`dto/`) sont des data classes pures sans annotations JPA
- **Calculs purs** (ex : `IndicatorCalculator` dans `market/application/`) sans dépendance Spring — facile à tester unit

### `infrastructure/persistence/`
- Interfaces Spring Data JPA (`JpaRepository`)
- Requêtes JPQL complexes (`@Query`)
- **Aucune logique métier**

### `infrastructure/http/`
- Controllers REST (`@RestController`)
- Délèguent aux services application, ne contiennent pas de logique
- Utilisent uniquement les DTOs de `application/dto/`
- **Pas d'accès direct** aux repositories

### `infrastructure/llm/` *(analysis uniquement)*
- Implémentations du port `LlmClient` (déclaré dans `analysis/domain/`) — `ClaudeClient`, `OllamaClient`, `MockLlmClient` toutes toujours instanciées (les `@ConditionalOnProperty` Phase 1 ont été retirés en Phase 2.5 v1)
- `RoutingLlmClient` (`@Primary`) délègue per-call à l'adapter sélectionné par `appConfig.getString(LLM_PROVIDER)` — switch claude ↔ ollama prend effet au prochain narratif sans reboot. Pattern miroir de `RoutingMarketChartClient` / `RoutingNewsClient` / `RoutingAnalystClient` / `RoutingEarningsClient`
- `ClaudeClient` lit la clé Anthropic per-call via `appConfig.getString(ANTHROPIC_API_KEY)` (Phase 2.5 v2, 2026-05-08) — header `x-api-key` posé par requête plutôt que via `defaultHeader()` builder-side, rotation immédiate sans reboot

### Prompt management & scoring *(analysis uniquement, Phase 3)*

Le contexte `analysis` héberge aussi la gestion des prompts narratifs et leur scoring continu, livrée le 2026-05-10 en 6 sous-PRs. Pas de bounded context séparé : les prompts sont **un détail d'implémentation du narratif**, et la table `prompt_score` est jointe à `ticker_narrative_snapshot` via `snapshot_id` — la cohabitation dans `analysis/` évite un cross-context call sur le chemin chaud du pipeline.

- `application/TickerNarrativePromptService` — lookup du prompt actif depuis `prompt_template` (table créée par `V1__init.sql` après le squash Phase 4 ; sa colonne `system_prompt` carrie le body-only depuis `V2__reset_narrative_prompt_to_body.sql` du 2026-05-22, l'enveloppe JSON technique vit en code dans `TickerNarrativePrompt.kt > NARRATIVE_TECHNICAL_ENVELOPE_SUFFIX`) avec `@Cacheable` 1 min + fallback hardcodé `NARRATIVE_DEFAULT_BODY` si BDD vide (bootstrap zéro-downtime). `activateVersion(id)` flippe l'ancien actif à FALSE + nouveau à TRUE dans la même transaction (atomique via l'index unique partiel `WHERE is_active = TRUE`). `createNewVersion(input)` pose `is_active = FALSE` par défaut — l'activation explicite reste un acte utilisateur séparé.
- `application/PromptScoreRecorder` — branché dans `TickerNarrativeExecutor` aux 2 issues du run (succès + échec définitif). Persiste `prompt_score` avec `snapshot_id` nullable pour les runs entièrement KO (snapshot inexistant) sans casser le `FK`.
- `infrastructure/persistence/PromptScoreStatsQuery` — query SQL native (`@Query(nativeQuery=true)`) pour les agrégats Phase 3 PR6 (`percentile_cont`, `date_trunc('day')`, fenêtre `INTERVAL`) — JPQL ne couvre pas les percentiles.
- `infrastructure/http/PromptController` + `NarrativeThumbsController` — endpoints `GET/POST /api/prompts`, `POST /{id}/activate`, `GET /{id}/stats?window=30d`, `PATCH /api/narrative/snapshots/{id}/thumbs`.

### `infrastructure/market/` *(market uniquement, Phase 1+)*

Trois familles d'adapters HTTP, une par port outbound (les ports `MarketChartClient`, `SymbolSearchClient`, `SectorClassifier` vivent dans `market/domain/`). Chaque famille suit le même triplet `TwelveData* + Mock* + Routing*` :

- **Chart** (Phase 1) — `TwelveDataClient` (REST + apikey, deux endpoints `/time_series` + `/quote`, cache 15 min, clé API lue per-call via `AppConfigService`), `MockMarketChartClient` (provider synthétique pour dev / CI sans clé), `RoutingMarketChartClient` (`@Primary`, Phase 2 — délègue à l'adapter sélectionné par `appConfig.getString(market.provider)` à chaque appel ; permet de basculer mock ↔ live runtime sans reboot).
- **Symbol search** (Phase 2 watchlist v2) — `TwelveDataSymbolSearchClient` (REST `/symbol_search`, 1 credit/call), `MockSymbolSearchClient` (~30 symbols seedés US/TSX), `RoutingSymbolSearchClient` (`@Primary`).
- **Sector classification** (Phase 2 benchmark v2) — `FinnhubSectorClassifier` (REST `/stock/profile2`, free tier, lit `finnhubIndustry` + route via `SpdrSectorEtfs` pour le mapping GICS → SPDR), `MockSectorClassifier` (~25 tickers hand-curés US/TSX), `RoutingSectorClassifier` (`@Primary`, route `twelvedata` live mode → Finnhub car Twelve Data `/profile` est paid-tier only). `SpdrSectorEtfs` (`internal object`) garde la table des 11 SPDR sectors + synonymes provider (incluant les sub-industries Finnhub : Banks → Financials, Pharmaceuticals → Healthcare, Retail → Consumer Discretionary…), vit dans le même package — pure data, pas Spring.

Pas de logique d'indicateurs ici (calculs purs en `application/IndicatorCalculator`).

### `infrastructure/analyst/` *(analyst uniquement, Phase 2)*

Mêmes triplet et mêmes conventions que `news/` : le port `AnalystRecommendationClient` vit dans `analyst/domain/`, deux adapters concrets ici (`FinnhubAnalystClient` REST + apikey, `MockAnalystClient` synthétique déterministe par symbole avec symboles réservés `UNKNOWN`/`RATELIMIT`/`NOTARGET`), et `RoutingAnalystClient` (`@Primary`) qui délègue per-call à l'adapter sélectionné par `appConfig.getString(analyst.provider)`. Les deux adapters sont qualifiés par `@Qualifier("mockAnalystClient")` / `@Qualifier("finnhubAnalystClient")` côté router. Le `FinnhubAnalystClient` réutilise le `RestClient` partagé (`@Qualifier("finnhubRestClient")`) pour ne pas dupliquer le bean côté `news/`.

Le cache vit un layer au-dessus dans `application/AnalystRecommendationService` avec `@Cacheable("analyst-recommendations", key = "#symbol.toUpperCase()")` (méthode Java SpEL — l'extension Kotlin `uppercase()` ne serait pas vue par SpEL). Le provider est volontairement absent de la clé pour qu'un switch runtime s'applique au prochain dossier ouvert sans rétention de cache stale.

Les mappers Finnhub (`FinnhubAnalystMappers`) sont colocalisés dans le même package mais pure Kotlin (pas Spring) pour rester testables sur des fixtures JSON sans `MockWebServer`. Ils encodent les invariants du domaine : tri défensif `period` ASC (Finnhub documente newest-first mais on ne trust pas la wire order), cap history à 6 mois, all-zero price target → `null` (Finnhub renvoie un shell zéro pour les symbols sans target — on préfère masquer la ligne plutôt que d'afficher « $0 »).

### `infrastructure/earnings/` *(earnings uniquement, Phase 2)*

Mêmes triplet et mêmes conventions que `news/` et `analyst/` : le port `EarningsClient` vit dans `earnings/domain/`, deux adapters concrets ici (`FinnhubEarningsClient` REST + apikey hitting `/stock/earnings` requis + `/calendar/earnings` optionnel fail-soft, `MockEarningsClient` synthétique déterministe par symbole avec symboles réservés `UNKNOWN`/`RATELIMIT`/`NOCALENDAR`), et `RoutingEarningsClient` (`@Primary`) qui délègue per-call à l'adapter sélectionné par `appConfig.getString(earnings.provider)`. Les deux adapters sont qualifiés par `@Qualifier("mockEarningsClient")` / `@Qualifier("finnhubEarningsClient")` côté router. Le `FinnhubEarningsClient` réutilise le `RestClient` partagé (`@Qualifier("finnhubRestClient")`) pour ne pas dupliquer le bean côté `news/` et `analyst/`.

Le cache vit un layer au-dessus dans `application/EarningsService` avec `@Cacheable("earnings", key = "#symbol.toUpperCase()")` (méthode Java SpEL — l'extension Kotlin `uppercase()` ne serait pas vue par SpEL). Le provider est volontairement absent de la clé pour qu'un switch runtime s'applique au prochain dossier ouvert sans rétention de cache stale.

Les mappers Finnhub (`FinnhubEarningsMappers`) sont colocalisés dans le même package mais pure Kotlin (pas Spring) pour rester testables sur des fixtures JSON sans `MockWebServer`. Ils encodent les invariants du domaine : tri défensif `period` ASC, cap reports à 4 trimestres, recalcul `surprisePercent` côté code (Finnhub round inconsistemment sur les small caps), filtre calendar par symbol + `epsActual == null` (cleanest "did it happen yet" signal), pick the earliest upcoming, mapping `bmo`/`amc`/`""`/`dmh` sur l'enum `EarningsTime` (avec collapse des valeurs inconnues à `UNSPECIFIED`).

### `config/` *(Phase 2)*
- `AppConfigService` (`application/`) — read layered (YAML default → BDD override via cache mémoire) ; émet `ConfigChangedEvent` sur changement effectif
- `ConfigController` + `ConfigTestClient` (`infrastructure/`) — `/api/config` CRUD + endpoints `/test/{provider}` qui sondent une clé candidate sans la sauver
- `CacheTtlListener` (vit dans `market/`) écoute `ConfigChangedEvent` et rebuild le `CaffeineCacheManager` quand `market.cache.ttl-minutes` bouge — pattern event-driven inter-context

## Dépendances cross-contextes autorisées

Les services d'`analysis` (Phase 1 narratif) peuvent dépendre du repository et des services de `market` (récupérer les indicateurs ticker pour bâtir le prompt).

```
analysis.application → market.application                   ✓ (Phase 1)
analysis.application → portfolio.infrastructure.persistence ✓ (récupérer la liste des tickers détenus)
portfolio.domain → auth.domain                              ✓ (Phase 4 — @ManyToOne User sur Portfolio)
watchlist.domain → auth.domain                              ✓ (Phase 4 — @ManyToOne User sur WatchlistEntry)
portfolio.application → auth.application                    ✓ (Phase 4 — AuthService.getCurrentUser pour scoper les reads)
watchlist.application → auth.application                    ✓ (Phase 4 — idem)
journal.domain → auth.domain                                ✓ (pivot — @ManyToOne User sur TradeEntry)
journal.application → auth.application                       ✓ (pivot — AuthService.getCurrentUser pour scoper les trades)
```

> **Note Phase 4** : la référence à `auth.domain.User` depuis `portfolio/` et `watchlist/` au niveau **entity JPA** (`@ManyToOne`) est une exception consciente à la règle « contexts share via ID » du DDD strict. Rationale détaillée dans `architecture.md > Décisions techniques notables > Phase 4 > Multi-tenant FK`. Limite de la tolérance : seules les *entities JPA* peuvent traverser un bounded context de cette façon — les *ports* outbound restent strictement isolés dans leur context.

## Conventions de nommage

| Type | Convention | Exemples |
|------|-----------|---------|
| Service query-only | `{Context}QueryService` | `PortfolioQueryService` |
| Service avec write | `{Action}Service` | `CsvImportService`, `TickerNarrativeService` |
| Calculator pur | `{Domain}Calculator` | `IndicatorCalculator` |
| Client externe | `{Provider}Client` | `TwelveDataClient`, `ClaudeClient` |
| DTO entrée | `{Action}Request` | `UnloadModelRequest`, `UpdateConfigRequest` |
| DTO sortie | `{Entity}Dto` | `PortfolioDto`, `TickerSnapshotDto` |
| Repository | `{Entity}Repository` | `PortfolioRepository`, `TickerNarrativeSnapshotRepository` |
| Controller | `{Context}Controller` | `MarketController`, `PortfolioController` |

## Ce qu'on évite

- DTOs définis dans les controllers ou les services → toujours dans `application/dto/`
- Logique métier dans les controllers
- Repositories injectés directement dans les controllers
- Entités JPA exposées directement en réponse HTTP
- **Calculs d'indicateurs faits par le LLM** — ils vivent toujours dans `IndicatorCalculator` (Kotlin pur), jamais dans le prompt LLM
