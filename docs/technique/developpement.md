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
| `llm:pull-mistral` | Télécharge le modèle `mistral` (7B Instruct) dans Ollama (~4 GB) |

Pour alimenter un portefeuille démo, importer un CSV Wealthsimple depuis l'onglet **Import** (le portefeuille est read-only, il n'y a pas de seed SQL).

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
  model: mistral   # Mistral 7B Instruct ; qwen2:1.5b est plus rapide mais hallucine sur prompt enrichi
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
├── frontend/                  # Angular 21 (single app, standalone)
│   └── src/app/
│       ├── core/              # Services (PortfolioService, AnalysisService,
│       │                      #            SnapshotService, SettingsService)
│       ├── dashboard/         # Portefeuille + lancement d'analyse IA
│       ├── import/            # Drag & drop CSV Wealthsimple
│       ├── suivi/             # Timeline des snapshots / imports
│       ├── recommendations/   # Liste filtrable des recommandations
│       ├── history/           # Historique des recommandations IA
│       └── settings/          # Configuration des sources d'ingestion
├── backend/                   # Kotlin + Spring Boot
│   └── src/main/kotlin/com/portfolioai/
│       ├── ingestion/         # Collecte RSS
│       ├── analysis/          # Orchestration LLM, recommandations, jobs
│       ├── portfolio/         # Import CSV, snapshots, lecture
│       └── shared/            # Utilitaires transverses
├── docs/                      # Documentation (mkdocs-material)
├── .claude/                   # Skills, hooks et instructions Claude Code
├── .github/workflows/         # CI backend + frontend + docs
├── Tiltfile
└── docker-compose.yml
```
