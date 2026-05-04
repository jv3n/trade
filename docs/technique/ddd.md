# Architecture DDD — PortfolioAI

## Principes

Architecture hexagonale (Ports & Adapters) organisée en Bounded Contexts DDD.
Chaque contexte est autonome et possède ses propres couches.

## Bounded Contexts

| Contexte | Responsabilité | Statut |
|----------|----------------|--------|
| `portfolio` | Portefeuilles, actifs, import CSV, snapshots historiques | Actif |
| `market` | Données ticker (Twelve Data + mock) + indicateurs techniques calculés | ✅ Phase 1 |
| `analysis` | Narratifs ticker (LLM rédacteur, pas décideur) | ✅ Phase 1 — réécrit |
| `watchlist` | Liste plate de tickers suivis hors portefeuille (single-table, pas de user_id) | ✅ Phase 2 |
| `news` | Headlines par ticker (Finnhub + mock), cache court | ✅ Phase 2 |
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
    market/             # (market) TwelveDataClient + MockMarketChartClient — adapters pour le port
    news/               # (news) FinnhubClient + MockNewsClient — adapters pour le port NewsClient

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
- Activées via `@ConditionalOnProperty`

### `infrastructure/market/` *(market uniquement, Phase 1)*
- `TwelveDataClient` — appel API externe (HTTP + apikey) avec cache court
- `MockMarketChartClient` — provider synthétique pour dev / CI sans clé
- Pas de logique d'indicateurs ici (calculs purs en `application/`)

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
