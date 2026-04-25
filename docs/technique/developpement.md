# Guide de développement

## Prérequis

- Docker Desktop
- Java 21 (Temurin recommandé)
- Node 24 + npm
- [Tilt](https://tilt.dev) (`brew install tilt`)

## Démarrage

```bash
tilt up
```

Tilt démarre tout : PostgreSQL, Ollama, backend Spring Boot, frontend Angular.

| URL | Description |
|-----|-------------|
| `http://localhost:4200` | Frontend Angular |
| `http://localhost:8080` | Backend API |
| `http://localhost:8080/actuator/health` | Health check |
| `http://localhost:11434` | Ollama (LLM local) |

Pour exposer sur le réseau local (accès depuis un autre appareil) :

```bash
tilt up -- --host=<ton-ip-locale>
```

## Commandes Tilt utiles

| Bouton Tilt | Action |
|-------------|--------|
| `db:reset` | Drop schema + redémarrage backend (Flyway rejoue toutes les migrations) |
| `db:seed` | Insère un portefeuille démo ~100k€ (VOO, QQQ, AAPL, NVDA, BTC...) |
| `llm:pull-qwen2` | Télécharge le modèle qwen2:1.5b dans Ollama |

## Configuration locale

Le fichier `application-local.yml` est gitignore. Il contient les secrets et surcharges locales. Créer à la main :

```yaml
# backend/src/main/resources/application-local.yml
anthropic:
  api:
    key: sk-ant-...   # clé Claude API (prod uniquement)

llm:
  provider: ollama    # ou "claude" pour utiliser l'API Anthropic

ollama:
  base-url: http://ollama:11434
  model: qwen2:1.5b
```

Ne jamais committer ce fichier. Ne jamais mettre de clé API dans `application.yml`.

## Conventions de commit

Conventional Commits en anglais. Format : `type(scope): description`

| Type | Usage |
|------|-------|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `chore` | Tâche technique (config, deps, docs) |
| `refactor` | Refactoring sans changement de comportement |
| `test` | Ajout ou modification de tests |

Exemples :

```
feat(analysis): add progress steps to analysis job
fix(ingestion): deduplicate articles on guid collision
chore(docs): reorganize docs folder
```

Voir le détail dans [commit-conventions.md](commit-conventions.md).

## Structure du projet

```
trade/
├── frontend/                  # Angular 21
│   └── src/app/
│       ├── core/              # Services (PortfolioService, AnalysisService, SettingsService)
│       ├── dashboard/         # Portefeuille + analyse IA
│       ├── history/           # Historique des recommandations
│       └── settings/          # Configuration des sources
├── backend/                   # Kotlin + Spring Boot
│   └── src/main/kotlin/.../
│       ├── ingestion/         # Collecte RSS
│       ├── analysis/          # Orchestration LLM
│       ├── portfolio/         # CRUD portefeuilles
│       └── recommendations/   # Stockage
├── docs/                      # Documentation
├── scripts/                   # seed.sql
├── .github/workflows/         # CI backend + frontend + docs
├── Tiltfile
└── docker-compose.yml
```
