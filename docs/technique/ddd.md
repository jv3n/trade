# Architecture DDD — PortfolioAI

## Principes

Architecture hexagonale (Ports & Adapters) organisée en Bounded Contexts DDD.
Chaque contexte est autonome et possède ses propres couches.

## Bounded Contexts

| Contexte | Responsabilité |
|----------|----------------|
| `portfolio` | Portefeuilles, actifs, import CSV, snapshots historiques |
| `analysis` | Recommandations IA, orchestration LLM, suivi des jobs |
| `ingestion` | Sources RSS, articles, scheduler de collecte |

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

shared/                 # Composants transverses (ex : GlobalExceptionHandler)
```

## Règles par couche

### `domain/`
- Entités JPA et leurs relations
- Enums métier (`AssetType`, `RecommendationStatus`…)
- **Pas d'import** depuis `application/` ou `infrastructure/`
- **Pas de logique Spring** (pas de `@Service`, `@Repository`, etc.)

### `application/`
- Services orchestrant le domaine (`@Service`)
- Un service = un cas d'usage ou une famille de requêtes cohérente
- Peut importer depuis `domain/`, `dto/`, et `infrastructure/persistence/`
- **Pas d'import** depuis `infrastructure/http/`
- Les DTOs (`dto/`) sont des data classes pures sans annotations JPA

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

## Dépendances cross-contextes autorisées

Les services d'`analysis` peuvent dépendre des repositories de `portfolio` et `ingestion`
(ex : `AnalysisRunner` lit les portfolios et articles). Ce couplage léger est acceptable
à cette échelle — ne pas sur-abstraire avec des ports supplémentaires.

```
analysis.application → portfolio.infrastructure.persistence  ✓
analysis.application → ingestion.infrastructure.persistence  ✓
analysis.domain      → portfolio.domain                      ✓ (relation JPA)
```

## Conventions de nommage

| Type | Convention | Exemples |
|------|-----------|---------|
| Service query-only | `{Context}QueryService` | `PortfolioQueryService` |
| Service avec write | `{Action}Service` | `CsvImportService`, `RssFetcherService` |
| DTO entrée | `{Action}Request` | `UpdateSourceEnabledRequest` |
| DTO sortie | `{Entity}Dto` | `PortfolioDto`, `AssetDto` |
| Repository | `{Entity}Repository` | `PortfolioRepository` |
| Controller | `{Context}Controller` | `PortfolioController` |

## Ce qu'on évite

- DTOs définis dans les controllers ou les services → toujours dans `application/dto/`
- Logique métier dans les controllers
- Repositories injectés directement dans les controllers
- Entités JPA exposées directement en réponse HTTP
