# Guide de développement

> Référence quotidienne pour qui développe sur PortfolioAI au jour le jour. Si tu débarques sur le repo et veux faire tourner l'app pour la première fois, lis plutôt [`developper.md`](./developper.md) — onboarding narratif qui couvre les prérequis, la première configuration `application-local.yml` (Claude vs Ollama), le premier test guidé, et le « quand ça merde ». Ce fichier-ci suppose que tu as déjà installé Docker / Java 21 / Node 24 / Tilt et que ton `application-local.yml` existe.

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

### Conflit de port (`tilt up` échoue sur « port already allocated »)

Les quatre ports hôte sont configurables via un fichier `.env` à la racine du repo. Procédure :

```bash
cp .env.example .env
# Édite uniquement le port qui pose problème (p.ex. POSTGRES_HOST_PORT=5433)
tilt up
```

| Variable | Défaut | Note |
|---|---|---|
| `POSTGRES_HOST_PORT` | `5432` | Conflit le plus courant (Postgres déjà installé localement) |
| `OLLAMA_HOST_PORT` | `11434` | |
| `BACKEND_HOST_PORT` | `8080` | Spring Boot natif (pas en container) |
| `FRONTEND_HOST_PORT` | `4200` | Angular dev server |

Le `.env` est gitignored — tes ports locaux ne sortent pas du repo. Le `docker-compose.yml`, le `Tiltfile`, `application.yml`, `backend/build.gradle.kts` et `frontend/proxy.conf.js` retombent sur les défauts si la variable n'est pas définie. Seul le port côté **hôte** change ; les services dans les containers (Postgres, Ollama) gardent leur port natif en interne, et le backend Spring est automatiquement reconfiguré pour s'y connecter via les env vars injectées dans le `serve_cmd` du Tiltfile.

> **`./gradlew test` lit aussi `.env`** — `backend/build.gradle.kts` mirroir le `load_env_file()` du `Tiltfile` et injecte chaque clé dans l'environnement du `tasks.withType<Test>`. Conséquence : si tu as `POSTGRES_HOST_PORT=5444` dans ton `.env`, les tests d'intégration `@SpringBootTest` (Flyway, JDBC) tapent automatiquement sur le bon port — pas besoin de préfixer chaque appel. Si `.env` n'existe pas (CI, fresh clone), les tests retombent sur les défauts d'`application.yml` exactement comme avant.

> **Le proxy frontend (`/api` → backend) lit aussi `.env`** — `frontend/proxy.conf.js` (en remplacement du `.json` historique) mirroir le même parser et résout `BACKEND_HOST_PORT` dans cet ordre : `process.env` (Tilt-injecté) > fichier `.env` > défaut `8080`. Si tu changes `BACKEND_HOST_PORT=8081` dans `.env`, l'Angular dev server proxy `/api/**` vers `localhost:8081` automatiquement, sans toucher à `angular.json`.

## Commandes Tilt utiles

| Bouton Tilt | Action |
|-------------|--------|
| **Purge** (sur le panel `postgres`) | Drop schema + redémarrage backend (Flyway rejoue toutes les migrations). Bouton attaché au panel `postgres` via `cmd_button` |

Pour alimenter un portefeuille démo, importer un CSV Wealthsimple depuis l'onglet **Import** (le portefeuille est read-only, il n'y a pas de seed SQL).

### Swagger UI — explorer la surface REST

Le panel `backend` dans Tilt expose un lien **Swagger UI** vers `http://localhost:8080/swagger-ui.html` (ou le port défini par `BACKEND_HOST_PORT`). L'UI est auto-générée par `springdoc-openapi` à partir des controllers Spring + DTO Jackson, regroupée par tag (`Market`, `News`, `Analyst`, `Earnings`, `Watchlist`, `Portfolio`, `Snapshot`, `CSV Import`, `Ticker Narrative`, `Symbol Search`, `Config`). Le bouton **Try it out** envoie de vrais appels au backend local — pratique pour tester un endpoint sans `curl`.

L'UI et le schéma JSON (`/v3/api-docs`) sont **désactivés par défaut** dans `application.yml` et activés uniquement via le profil `local` (`application-local.yml`). Aucun environnement qui n'opte pas in explicitement n'expose la surface.

## Configuration locale

Le fichier `application-local.yml` (gitignored) contient les secrets et surcharges. Le **setup initial** (création du fichier, choix Claude vs Ollama, exemples YAML) est documenté dans [`developper.md > Configurer le LLM`](./developper.md#configurer-le-llm) — single-source pour éviter le drift. Cette section couvre uniquement les usages courants après ce setup.

> **Performance Ollama sur Mac** — Ollama tourne **dans un container Docker Desktop**, qui est lui-même une VM Linux virtualisée par macOS. Apple n'expose pas Metal dans cette VM, donc l'inférence est en **CPU pur** : un narratif `qwen2.5:3b` peut saturer 9 cores ~918 % `docker stats` pendant 60–180 s, là où le même modèle sur Ollama natif (Metal activé) répond en 5-10 s. **Décision projet** (cf. [`docs/devops/decision-ollama-deploiement.md`](../devops/decision-ollama-deploiement.md), tranchée 2026-05-09) : statu quo Claude-first, Ollama containerisé reste utilisable comme outil de dev/backup mais n'est pas le chemin quotidien. Si tu vois ton fan hurler, c'est attendu — bascule sur Claude (`/settings/configuration > LLM > Provider = claude`) ou laisse mouliner. Re-trigger : machine dédiée, usage Ollama > 20 % des sessions, ou distribution du repo.

Ne jamais committer `application-local.yml`. Ne jamais mettre de clé API dans `application.yml`.

> **Alternative runtime — édition sans reboot** : la page `/settings/configuration` (icône `tune` dans le sidenav `/settings`) édite en direct **douze clés** sans reboot, réparties sur deux sub-sections (Providers de données / LLM) : (1) **secrets** — `market.twelvedata.api-key`, `market.finnhub.api-key`, `anthropic.api.key` (masqués + bouton Tester) ; (2) **toggles** — `market.provider`, `news.provider`, `analyst.provider`, `earnings.provider` (mock ↔ live), `llm.provider` (claude ↔ ollama) ; (3) **strings** — `ollama.model`, `anthropic.api.model` (autocomplete suggestions, valeurs libres) ; (4) **slider INT** — `market.cache.ttl-minutes` (5–60 min) et `llm.timeout-seconds` (60–900 s). Les overrides BDD prennent le pas sur les défauts YAML — pratique pour rotater une clé ou switcher de provider sans toucher à `application-local.yml`.

## Conventions de commit

Conventional Commits en anglais. Format : `type(scope): description`

| Type | Usage |
|------|-------|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `chore` | Tâche technique sans impact fonctionnel (config, deps, CI) |
| `refactor` | Refactoring sans changement de comportement |
| `docs` | Documentation uniquement |
| `test` | Ajout ou modification de tests |
| `perf` | Amélioration de performance |
| `audit` | Archive d'une revue de code dans `docs/projet/audits/` |
| `revert` | Annulation d'un commit précédent |

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
│       ├── core/              # Ports + adapters (14 repositories)
│       │   ├── *.repository.ts        # ports (Portfolio, Snapshot, Market, Watchlist, News, Config, Annotation, Analyst, Earnings, OllamaStatus, Prompt, NarrativeFeedback, NarrativeObservability, NarrativeBias)
│       │   ├── adapters/*.http.ts     # HTTP impls (défaut)
│       │   ├── adapters/*.local.ts    # localStorage impls (annotation v3)
│       │   ├── providers.ts           # `provideRepositories()` — wires les 14 ports → adapters
│       │   ├── job-stream.service.ts  # SSE EventSource → Observable<JobEvent> (Phase 2.5)
│       │   ├── theme.service.ts       # signal + persist localStorage (SSR-safe via isPlatformBrowser)
│       │   └── language.service.ts    # signal + persist localStorage (i18n, SSR-safe)
│       └── features/          # Pages UI (primary adapters)
│           ├── dashboard/             # Portefeuille + lien dossiers ticker
│           ├── ticker/                # Dossier par symbole (graphe, indicateurs, narratif IA + thumbs)
│           ├── import/                # Drag & drop CSV Wealthsimple
│           ├── suivi/                 # Timeline snapshots
│           ├── observability/         # Phase 3 — index symbols, timeline narratif vs prix par ticker (#1) + chip cohérence (#2), bias dashboard (#3)
│           └── settings/              # Sidenav : configuration runtime / prompt-preview / prompts (liste + éditeur) / prompts/:id/stats (Phase 3)
├── backend/                   # Kotlin + Spring Boot
│   └── src/main/kotlin/com/portfolioai/
│       ├── market/            # TwelveData client + mock + indicateurs
│       ├── analysis/          # Phase 1 narratif ticker + LLM dispatch (Routing/Claude/Ollama)
│       ├── portfolio/         # Import CSV, snapshots, lecture
│       ├── watchlist/         # Phase 2 — tickers suivis hors portefeuille
│       ├── news/              # Phase 2 — Finnhub + mock, news par ticker
│       ├── analyst/           # Phase 2 — Finnhub + mock, recommandations analystes
│       ├── earnings/          # Phase 2 — Finnhub + mock, earnings trimestriels + next-date
│       ├── config/            # Phase 2 — runtime-editable settings (app_config V4)
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

## Lint et formatage

- Backend : **Spotless ktfmt** (Google style) — `./gradlew spotlessApply` reformate, `./gradlew spotlessCheck` vérifie. Spotless porte aussi un custom step `no-wildcard-imports` qui casse le build sur tout import en `package.*` hors allowlist (14 packages tolérés temporairement, à shrinker progressivement — cf. dette technique `backlog.md`). Le `.editorconfig` racine bloque IntelliJ d'introduire des wildcards via "Optimize Imports" — défense en profondeur côté éditeur + côté pipeline. **Detekt** pour le reste de l'analyse statique Kotlin (`./gradlew detekt`, rapport HTML + SARIF — voir [`ops.md`](./ops.md) section Detekt).
- Frontend : **ESLint flat config** (`frontend/eslint.config.js`, Angular ESLint 21) pour l'analyse statique TS + a11y des templates. **Prettier** reste seul responsable du formatage (`eslint-config-prettier` désactive les règles formatage qui chevauchent). `npm run lint` en local et en CI (avant le build) ; `npm run lint -- --fix` pour auto-fixer les violations triviales. Détails ruleset dans [`ops.md`](./ops.md) section ESLint.
