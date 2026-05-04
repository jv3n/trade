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

Tilt démarre tout : PostgreSQL, Ollama (backup local), backend Spring Boot, frontend Angular.

| URL | Description |
|-----|-------------|
| `http://localhost:4200` | Frontend Angular |
| `http://localhost:8080` | Backend API |
| `http://localhost:8080/actuator/health` | Health check |
| `http://localhost:11434` | Ollama (LLM local, backup) |

Pour exposer sur le réseau local (accès depuis un autre appareil) :

```bash
tilt up -- --host=<ton-ip-locale>
```

## Commandes Tilt utiles

| Bouton Tilt | Action |
|-------------|--------|
| `db:reset` | Drop schema + redémarrage backend (Flyway rejoue toutes les migrations) |
| `llm:pull-qwen` | Télécharge le modèle `qwen2.5:3b` (~2 GB) dans Ollama — utile uniquement si tu travailles offline avec `llm.provider: ollama`. Bon compromis vitesse/qualité sur M1 (~5-10 s par narratif) |

Pour alimenter un portefeuille démo, importer un CSV Wealthsimple depuis l'onglet **Import** (le portefeuille est read-only, il n'y a pas de seed SQL).

## Configuration locale

Le fichier `application-local.yml` est gitignore. Il contient les secrets et surcharges locales. Créer à la main :

```yaml
# backend/src/main/resources/application-local.yml
anthropic:
  api:
    key: sk-ant-...   # clé Claude API (le défaut Phase 1)

llm:
  provider: claude    # défaut Phase 1. Bascule sur "ollama" pour offline

ollama:
  base-url: http://ollama:11434
  model: qwen2.5:3b   # défaut local — rapide (~5-10 s) et fiable sur le JSON structuré
```

> **Phase 1** : `llm.provider: claude` est le défaut. Le mode Ollama reste activable pour développer offline ou sans coût API, avec `qwen2.5:3b` comme modèle par défaut (rapide, ~5-10 s sur M1, qualité narrative en retrait par rapport à Claude mais utilisable). Mistral 7B était l'ancien défaut mais sa latence 30-60 s sur M1 saturait les timeouts — à éviter.

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
feat(market): add TwelveDataClient with quote and time_series endpoints
fix(indicators): correct RSI computation on flat series
chore(docs): refresh roadmap for Phase 1 ticker pivot
```

Voir le détail dans [`commit-conventions.md`](../projet/commit-conventions.md).

## Structure du projet

```
trade/
├── frontend/                  # Angular 21 (single app, standalone, zoneless)
│   ├── public/
│   │   └── i18n/              # Fichiers de traduction `<lang>.json` (FR + EN)
│   └── src/app/
│       ├── core/              # Ports + HTTP adapters
│       │   ├── *.repository.ts        # ports (abstract class)
│       │   ├── adapters/*.http.ts     # HTTP impls
│       │   ├── theme.service.ts       # signal + persist localStorage
│       │   └── language.service.ts    # signal + persist localStorage (i18n)
│       └── features/          # Pages UI (primary adapters)
│           ├── dashboard/             # Portefeuille + lien dossiers ticker
│           ├── ticker/                # Dossier par symbole (graphe, indicateurs, narratif IA)
│           ├── import/                # Drag & drop CSV Wealthsimple
│           ├── suivi/                 # Timeline snapshots
│           ├── settings/              # Sources / test / prompt-preview
│           ├── recommendations/       # 🧊 legacy Phase 0
│           └── history/               # 🧊 legacy Phase 0
├── backend/                   # Kotlin + Spring Boot
│   └── src/main/kotlin/com/portfolioai/
│       ├── market/            # TwelveData client + mock + indicateurs
│       ├── analysis/          # Phase 1 narratif ticker (legacy reco portfolio gelé)
│       ├── portfolio/         # Import CSV, snapshots, lecture
│       ├── watchlist/         # Phase 2 — tickers suivis hors portefeuille
│       ├── news/              # Phase 2 — Finnhub + mock, news par ticker
│       ├── ingestion/         # 🧊 legacy Phase 0 — RSS scheduler
│       └── shared/            # Utilitaires transverses
├── docs/                      # Documentation (mkdocs-material)
├── .claude/                   # Skills, hooks et instructions Claude Code
├── .github/workflows/         # CI backend + frontend + CodeQL + docs (cf. technique/ops.md)
├── Tiltfile
└── docker-compose.yml
```

## Thème et UI

- Tokens CSS dans `frontend/src/styles.scss` (`:root` = sombre, `[data-theme='light']` = override clair)
- `ThemeService` (`frontend/src/app/core/theme.service.ts`) — signal, persist localStorage, applique `data-theme` sur `documentElement`
- Anti-FOUC : script inline dans `frontend/src/index.html` qui lit `localStorage` et pose `data-theme` avant le bootstrap Angular
- Composants : `class="btn-primary"`, `.error-banner`, `.content-header`, `.empty-state`, `.confidence-badge`, `.action-badge`, etc. — patterns globaux dans `styles.scss`, à utiliser plutôt que de redéfinir localement

## Tests

- Backend : JUnit 5 + Spring Boot Test. Intégration sur **vrai PostgreSQL** (le CI démarre un service Postgres — détails workflow + cache dans [`ops.md`](./ops.md)). `./gradlew test`
- Frontend : **Vitest** + TestBed. Tests `*.spec.ts` co-localisés avec la source. `npm run test`
- Lancer un seul test Vitest : `cd frontend && npx vitest run src/path/to/file.spec.ts`
