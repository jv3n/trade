# Architecture

## Stack

| Couche | Technologie | Pourquoi |
|--------|-------------|----------|
| Frontend | Angular 21 + Angular Material | Standalone components, signals, framework robuste pour dashboards |
| Backend | Kotlin + Spring Boot | Typage fort, null-safety, excellent écosystème JVM |
| Build | Gradle (Kotlin DSL) | Standard Kotlin/Spring, scripts typés |
| IA (prod) | Claude API — Anthropic | Compréhension du langage naturel financier, JSON structuré fiable |
| IA (local) | Ollama + qwen2:1.5b | Développement sans clé API, fonctionne sur M1 |
| Base de données | PostgreSQL | Schéma relationnel, historique des recommandations, Flyway pour les migrations |
| Infra locale | Tilt + Docker Compose | Hot reload backend/frontend, reset BDD en un clic |
| CI | GitHub Actions | Workflows backend (Gradle + PostgreSQL) et frontend (Vitest) |

## Vue d'ensemble

```
┌─────────────────────────────────────────┐
│            Sources de données            │
│  Presse RSS · APIs marché · Macro · Crypto │
└──────────────────┬──────────────────────┘
                   │ ingestion toutes les 15 min
                   ▼
┌─────────────────────────────────────────┐
│         Backend  (Kotlin + Spring)       │
│                                          │
│  ingestion/     → collecte RSS/APIs      │
│  analysis/      → orchestration LLM      │
│  portfolio/     → import CSV, snapshots  │
│  recommendations/ → stockage & scoring  │
│  observability/   → comparaison (Phase 2)│
└──────────────────┬──────────────────────┘
                   │ REST API
                   ▼
┌─────────────────────────────────────────┐
│         Frontend  (Angular 21)           │
│                                          │
│  dashboard/  → positions read-only + IA │
│  import/     → drag & drop CSV          │
│  suivi/      → timeline snapshots       │
│  history/    → recommandations IA       │
│  settings/   → gestion des sources      │
└─────────────────────────────────────────┘
```

## Modules backend

### `ingestion/`

Collecte les flux RSS via la librairie Rome. Chaque source est configurée en base (`feed_source`) avec son URL, sa catégorie et son état activé/désactivé. Les articles sont dédupliqués par `guid`. Scheduler : toutes les 15 min en prod, 5 min en local.

### `analysis/`

Orchestration des appels LLM. L'analyse est asynchrone (`@Async` sur un bean séparé pour éviter le bypass AOP Spring). Le job d'analyse est suivi via un `AnalysisJobStore` (ConcurrentHashMap) qui expose son statut au frontend via polling.

Deux implémentations de `LlmClient` :

- `ClaudeClient` — production, activé avec `llm.provider: claude`
- `OllamaClient` — local, activé avec `llm.provider: ollama`, fusionne system + user en un seul message (qwen2:1.5b ignore le role system), utilise `format: json` et `num_predict` pour contraindre la sortie

### `portfolio/`

Le portefeuille est **read-only depuis l'UI** — il reflète l'état réel du courtier Wealthsimple. Pas de CRUD manuel.

**Import CSV** (`CsvImportService`) : parse l'export « Positions » Wealthsimple (21 colonnes, français, délimiteur auto-détecté, BOM UTF-8). Pour chaque `Nom du compte` du CSV, crée ou met à jour un `Portfolio` et upsert les positions (`Asset`). Colonnes utilisées : `Symbole`, `Nom`, `Type`, `Quantité`, `Valeur comptable (CAD)`, `Valeur comptable (Marché)`, `Valeur marchande`, `Rendements non réalisés du marché`.

**Snapshots** : à chaque import, un `PortfolioSnapshot` est créé par compte (avec un `batch_id` commun pour grouper les snapshots d'un même import). Chaque `SnapshotPosition` stocke la valeur comptable en CAD, la valeur de marché en devise native, et le P&L non réalisé. Permet le suivi historique de l'évolution du portefeuille.

### `recommendations/`

Stockage des recommandations avec leurs actions (ticker, BUY/SELL/HOLD/REDUCE, poids cible, rationale). Statut : PENDING → APPLIED / IGNORED / EVALUATED.

## Schéma de base de données

Migrations Flyway dans `backend/src/main/resources/db/migration/` :

| Migration | Contenu |
|-----------|---------|
| V1 | Portfolio, Asset, Recommendation, RecommendationAction |
| V2 | FeedSource, FeedArticle |
| V3 | Enrichissement FeedSource (slug, description, free, requires_api_key) + seed 22 sources |
| V4 | PortfolioSnapshot (batch_id, portfolio_id, imported_at), SnapshotPosition (valeurs CAD + marché + P&L) |

## Décisions techniques notables

**`@Async` sur bean séparé** — Spring AOP ne proxifie pas les appels internes (`this.method()`). Tout le code async est dans `AnalysisRunner`, `AnalysisService` délègue.

**LLM local avec qwen2:1.5b** — Mistral 7B et phi3:mini sont trop lents sur M1 pour un usage interactif. qwen2:1.5b répond en ~60s avec `format:json`. Le role `system` est ignoré par ce modèle — system et user sont fusionnés en un seul message.

**Validation du schéma** — `ddl-auto: validate`. Hibernate valide le schéma au démarrage contre les entités. Toute modification des entités nécessite une migration Flyway.

**Tests d'intégration sur vrai PostgreSQL** — pas de mocks BDD ni H2. Le CI démarre un service PostgreSQL.

**Portefeuille CSV-driven, pas de CRUD manuel** — le portefeuille reflète la réalité du courtier. L'import CSV Wealthsimple est la seule source de vérité des positions. Ce choix simplifie l'UI, élimine les désynchronisations, et rend l'historique automatique (chaque import = snapshot).

**Snapshot avec `batch_id`** — un import CSV peut couvrir plusieurs comptes (CELI, REER, Broker…). Le `batch_id` UUID commun regroupe tous les snapshots d'un même import pour l'affichage en timeline. Pas de table `CsvImportBatch` séparée — le batch_id suffit.

**Normalisation des headers CSV** — les headers Wealthsimple contiennent des accents (`Quantité`, `Marché`…). Normalisation NFD + suppression diacritiques + lowercase pour des lookups robustes indépendants de l'encodage.
