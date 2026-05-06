# Architecture DDD — PortfolioAI

## Principes

Architecture hexagonale (Ports & Adapters) organisée en Bounded Contexts DDD.
Chaque contexte est autonome et possède ses propres couches.

## Bounded Contexts

| Contexte | Responsabilité | Statut |
|----------|----------------|--------|
| `portfolio` | Portefeuilles, actifs, import CSV, snapshots historiques | ✅ Phase 0+ |
| `market` | Données ticker (Twelve Data + mock) + indicateurs techniques calculés | ✅ Phase 1 |
| `analysis` | Narratifs ticker (LLM rédacteur, pas décideur) | ✅ Phase 1 — réécrit |
| `watchlist` | Liste plate de tickers suivis hors portefeuille (single-table, pas de user_id) | ✅ Phase 2 |
| `news` | Headlines par ticker (Finnhub + mock), cache court | ✅ Phase 2 |
| `analyst` | Recommandations d'analystes par ticker (consensus monthly + price target 12 mois, Finnhub + mock), cache court | ✅ Phase 2 |
| `earnings` | Earnings trimestriels par ticker (4 derniers Q EPS estimate/actual/surprise % + prochaine date d'annonce, Finnhub + mock), cache court | ✅ Phase 2 |
| `config` | Surcharges runtime des défauts YAML (clés API, TTL cache, providers actifs) | ✅ Phase 2 |
| `ingestion` | Sources RSS, articles, scheduler de collecte | 🧊 Legacy gelé Phase 0 |

> Le contexte `analysis` voit son périmètre changer à la Phase 1 : il passe d'orchestration de recommandations portefeuille (8 règles de validation, targetWeight, action enum) à génération de narratifs par ticker (`{summary, sentiment, keyPoints[]}`). Le code legacy reste en place mais n'est plus exposé.

## Structure de chaque contexte

```
{context}/
  domain/               # Entités JPA, enums, value objects — pas de dépendance Spring
  application/          # Services applicatifs, cas d'usage, orchestration
    dto/                # Objets de transfert (commandes, réponses)
  infrastructure/
    persistence/        # Spring Data repositories
    http/               # Controllers REST
    llm/                # (analysis) Clients API externes (Claude, Ollama)
    market/             # (market) 3 ports outbound — chart / symbol-search / sector — chacun avec adapters Twelve Data + Mock + Routing (@Primary)
    news/               # (news) FinnhubClient + MockNewsClient + RoutingNewsClient (@Primary)
    analyst/            # (analyst) FinnhubAnalystClient + MockAnalystClient + RoutingAnalystClient (@Primary)
    earnings/           # (earnings) FinnhubEarningsClient + MockEarningsClient + RoutingEarningsClient (@Primary)
    ConfigTestClient.kt # (config) RestClient dédié pour sonder une clé API candidate sans la sauver

shared/                 # Composants transverses (ex : GlobalExceptionHandler)
```

## Règles par couche

### `domain/`
- Entités JPA et leurs relations
- Enums métier (`AssetType`, `RecommendationStatus`, `Sentiment`…)
- Value objects (les `Indicator` calculés peuvent vivre ici en data class pure)
- **Pas d'import** depuis `application/` ou `infrastructure/`
- **Pas de logique Spring** (pas de `@Service`, `@Repository`, etc.)

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
- Implémentations des clients LLM (`ClaudeClient`, `OllamaClient`)
- Sélection statique via `@ConditionalOnProperty(llm.provider)` au boot — pattern hérité Phase 1, conservé tant que le LLM n'est pas piloté par `AppConfigService`. À aligner sur le pattern Routing per-call (cf. `RoutingMarketChartClient` / `RoutingNewsClient`) le jour où l'item backlog "Config runtime v2 : LLM provider + model éditable" est traité — le `@ConditionalOnProperty` saute alors et un `RoutingLlmClient` (`@Primary`) prend le relais

### `infrastructure/market/` *(market uniquement, Phase 1+)*

Trois familles de clients HTTP, une par port outbound. Chaque famille suit le même triplet `TwelveData* + Mock* + Routing*` :

- **Chart** (Phase 1) — `TwelveDataClient` (REST + apikey, deux endpoints `/time_series` + `/quote`, cache 15 min, clé API lue per-call via `AppConfigService`), `MockMarketChartClient` (provider synthétique pour dev / CI sans clé), `RoutingMarketChartClient` (`@Primary`, Phase 2 — délègue à l'adapter sélectionné par `appConfig.getString(market.provider)` à chaque appel ; permet de basculer mock ↔ live runtime sans reboot).
- **Symbol search** (Phase 2 watchlist v2) — `TwelveDataSymbolSearchClient` (REST `/symbol_search`, 1 credit/call), `MockSymbolSearchClient` (~30 symbols seedés US/TSX), `RoutingSymbolSearchClient` (`@Primary`).
- **Sector classification** (Phase 2 benchmark v2) — `TwelveDataSectorClassifier` (REST `/profile`, 1 credit/call, route via `SpdrSectorEtfs` pour le mapping GICS → SPDR), `MockSectorClassifier` (~25 tickers hand-curés US/TSX), `RoutingSectorClassifier` (`@Primary`). `SpdrSectorEtfs` (`internal object`) garde la table des 11 SPDR sectors + synonymes provider, vit dans le même package — pure data, pas Spring.

Pas de logique d'indicateurs ici (calculs purs en `application/IndicatorCalculator`).

### `infrastructure/analyst/` *(analyst uniquement, Phase 2)*

Mêmes triplet et mêmes conventions que `news/` : un port `AnalystRecommendationClient` outbound, deux adapters concrets (`FinnhubAnalystClient` REST + apikey, `MockAnalystClient` synthétique déterministe par symbole avec symboles réservés `UNKNOWN`/`RATELIMIT`/`NOTARGET`), et `RoutingAnalystClient` (`@Primary`) qui délègue per-call à l'adapter sélectionné par `appConfig.getString(analyst.provider)`. Les deux adapters sont qualifiés par `@Qualifier("mockAnalystClient")` / `@Qualifier("finnhubAnalystClient")` côté router. Le `FinnhubAnalystClient` réutilise le `RestClient` partagé (`@Qualifier("finnhubRestClient")`) pour ne pas dupliquer le bean côté `news/`.

Le cache vit un layer au-dessus dans `application/AnalystRecommendationService` avec `@Cacheable("analyst-recommendations", key = "#symbol.toUpperCase()")` (méthode Java SpEL — l'extension Kotlin `uppercase()` ne serait pas vue par SpEL). Le provider est volontairement absent de la clé pour qu'un switch runtime s'applique au prochain dossier ouvert sans rétention de cache stale.

Les mappers Finnhub (`FinnhubAnalystMappers`) sont colocalisés dans le même package mais pure Kotlin (pas Spring) pour rester testables sur des fixtures JSON sans `MockWebServer`. Ils encodent les invariants du domaine : tri défensif `period` ASC (Finnhub documente newest-first mais on ne trust pas la wire order), cap history à 6 mois, all-zero price target → `null` (Finnhub renvoie un shell zéro pour les symbols sans target — on préfère masquer la ligne plutôt que d'afficher « $0 »).

### `infrastructure/earnings/` *(earnings uniquement, Phase 2)*

Mêmes triplet et mêmes conventions que `news/` et `analyst/` : un port `EarningsClient` outbound, deux adapters concrets (`FinnhubEarningsClient` REST + apikey hitting `/stock/earnings` requis + `/calendar/earnings` optionnel fail-soft, `MockEarningsClient` synthétique déterministe par symbole avec symboles réservés `UNKNOWN`/`RATELIMIT`/`NOCALENDAR`), et `RoutingEarningsClient` (`@Primary`) qui délègue per-call à l'adapter sélectionné par `appConfig.getString(earnings.provider)`. Les deux adapters sont qualifiés par `@Qualifier("mockEarningsClient")` / `@Qualifier("finnhubEarningsClient")` côté router. Le `FinnhubEarningsClient` réutilise le `RestClient` partagé (`@Qualifier("finnhubRestClient")`) pour ne pas dupliquer le bean côté `news/` et `analyst/`.

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
```

Les dépendances héritées de la Phase 0 restent valides pour le code gelé :

```
analysis (legacy) → portfolio.infrastructure.persistence  ✓ (gelé)
analysis (legacy) → ingestion.infrastructure.persistence  ✓ (gelé)
analysis.domain   → portfolio.domain                      ✓ (relation JPA gelée)
```

## Conventions de nommage

| Type | Convention | Exemples |
|------|-----------|---------|
| Service query-only | `{Context}QueryService` | `PortfolioQueryService` |
| Service avec write | `{Action}Service` | `CsvImportService`, `TickerNarrativeService` |
| Calculator pur | `{Domain}Calculator` | `IndicatorCalculator` |
| Client externe | `{Provider}Client` | `TwelveDataClient`, `ClaudeClient` |
| DTO entrée | `{Action}Request` | `UpdateSourceEnabledRequest` |
| DTO sortie | `{Entity}Dto` | `PortfolioDto`, `TickerSnapshotDto` |
| Repository | `{Entity}Repository` | `PortfolioRepository`, `TickerNarrativeSnapshotRepository` |
| Controller | `{Context}Controller` | `MarketController`, `PortfolioController` |

## Ce qu'on évite

- DTOs définis dans les controllers ou les services → toujours dans `application/dto/`
- Logique métier dans les controllers
- Repositories injectés directement dans les controllers
- Entités JPA exposées directement en réponse HTTP
- **Calculs d'indicateurs faits par le LLM** — ils vivent toujours dans `IndicatorCalculator` (Kotlin pur), jamais dans le prompt LLM
