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
| **Mode → OAuth** (sur le panel `backend`, Phase 4) | Édite `.env` pour mettre `BACKEND_AUTH_MODE=oauth` + touche `application.yml` → backend redémarre en mode auth réel (Spring Security + OAuth Google). Pré-requis : `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_{CLIENT_ID,CLIENT_SECRET}` + `APP_ADMIN_EMAILS` dans `.env`, redirect URI `http://localhost:<FRONTEND_HOST_PORT>/login/oauth2/code/google` enregistrée dans Google Cloud Console |
| **Mode → no-auth** (sur le panel `backend`, Phase 4) | Édite `.env` pour mettre `BACKEND_AUTH_MODE=no-auth` + touche `application.yml` → backend redémarre avec Spring Security bypassed, user fake ADMIN (`dev@local.test`) seedé au boot. Mode par défaut pour le dev solo |

Pour alimenter un portefeuille démo, importer un CSV Wealthsimple depuis l'onglet **Import** (le portefeuille est read-only, il n'y a pas de seed SQL).

### Swagger UI — explorer la surface REST

Le panel `backend` dans Tilt expose un lien **Swagger UI** vers `http://localhost:8080/swagger-ui.html` (ou le port défini par `BACKEND_HOST_PORT`). L'UI est auto-générée par `springdoc-openapi` à partir des controllers Spring + DTO Jackson, regroupée par tag (`Market`, `News`, `Analyst`, `Earnings`, `Watchlist`, `Portfolio`, `Snapshot`, `CSV Import`, `Ticker Narrative`, `Symbol Search`, `Config`). Le bouton **Try it out** envoie de vrais appels au backend local — pratique pour tester un endpoint sans `curl`.

L'UI et le schéma JSON (`/v3/api-docs`) sont **désactivés par défaut** dans `application.yml` et activés uniquement via le profil `local` (`application-local.yml`). Aucun environnement qui n'opte pas in explicitement n'expose la surface.

## Configuration locale

Le fichier `application-local.yml` (committé depuis 2026-05-18, sans secrets) contient les **overrides de comportement dev** (JPA verbose, `llm.provider=ollama`, providers en `mock` par défaut, `springdoc` activé, `flyway.repair-on-migrate=true`). Le **setup initial** (création du fichier, choix Claude vs Ollama, exemples YAML) est documenté dans [`developper.md > Configurer le LLM`](./developper.md#configurer-le-llm) — single-source pour éviter le drift. Cette section couvre uniquement les usages courants après ce setup.

**Aucun secret en YAML.** Tous les credentials boot-time (creds OAuth Google, `APP_ADMIN_EMAILS`, `APP_FRONTEND_URL`) vivent dans `.env` à la racine du repo (gitignored). Le Tiltfile source `.env` dans le `serve_cmd` du backend → exporte au sous-process gradle → Spring lit via relaxed binding (`SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID` mappe vers la property correspondante). Voir `.env.example` pour la liste complète + la doc inline. Les clés API runtime-editable (Anthropic, Twelve Data, Finnhub) **ne sont pas** dans `.env` — elles passent par l'UI runtime config (voir paragraphe « Alternative runtime » ci-dessous).

> **Performance Ollama sur Mac** — Ollama tourne **dans un container Docker Desktop**, qui est lui-même une VM Linux virtualisée par macOS. Apple n'expose pas Metal dans cette VM, donc l'inférence est en **CPU pur** : un narratif `qwen2.5:3b` peut saturer 9 cores ~918 % `docker stats` pendant 60–180 s, là où le même modèle sur Ollama natif (Metal activé) répond en 5-10 s. **Décision projet** (cf. [`docs/devops/decision-ollama-deploiement.md`](../devops/decision-ollama-deploiement.md), tranchée 2026-05-09) : statu quo Claude-first, Ollama containerisé reste utilisable comme outil de dev/backup mais n'est pas le chemin quotidien. Si tu vois ton fan hurler, c'est attendu — bascule sur Claude (`/settings/configuration > LLM > Provider = claude`) ou laisse mouliner. Re-trigger : machine dédiée, usage Ollama > 20 % des sessions, ou distribution du repo.

Ne jamais committer `.env` (contient les vrais OAuth + URLs de dev). `application-local.yml` est désormais committé mais doit **rester strictement secret-free** — aucune clé API, aucun OAuth secret. Ne jamais mettre de clé API dans `application.yml` non plus.

> **Alternative runtime — édition sans reboot** : la page `/settings/configuration` (icône `tune` dans le sidenav `/settings`) édite en direct **douze clés** sans reboot, réparties sur deux sub-sections (Providers de données / LLM) : (1) **secrets** — `market.twelvedata.api-key`, `market.finnhub.api-key`, `anthropic.api.key` (masqués + bouton Tester) ; (2) **toggles** — `market.provider`, `news.provider`, `analyst.provider`, `earnings.provider` (mock ↔ live), `llm.provider` (claude ↔ ollama) ; (3) **strings** — `ollama.model`, `anthropic.api.model` (autocomplete suggestions, valeurs libres) ; (4) **slider INT** — `market.cache.ttl-minutes` (5–60 min) et `llm.timeout-seconds` (60–900 s). Les overrides BDD prennent le pas sur les défauts YAML — pratique pour rotater une clé ou switcher de provider sans toucher à `application-local.yml`. **Note Phase 4** : la page `/settings/configuration` est gated ADMIN ; en mode `BACKEND_AUTH_MODE=no-auth` le dev user (`dev@local.test`) est ADMIN par défaut, l'accès est trivial. En mode `oauth`, ton email doit être dans `APP_ADMIN_EMAILS` au premier login pour atterrir en role ADMIN.

## Modes d'authentification (Phase 4)

Le backend supporte deux modes d'auth, switchables sans toucher au code :

### Mode `no-auth` (défaut, dev solo)

Spring Security bypassed via le profile `local-no-auth`. Au boot, `LocalNoAuthUserInitializer` seed un user `dev@local.test` ADMIN ; à chaque request, `LocalNoAuthFilter` injecte ce user dans le `SecurityContext`. Aucun OAuth dance, aucun login flow. `tilt up` 0-friction.

- **Activation** : valeur par défaut dans `.env` (`BACKEND_AUTH_MODE=no-auth`, ou variable absente) ou bouton Tilt **« Mode → no-auth »** sur la ressource `backend`.
- **Profile actif** : `--spring.profiles.active=local,local-no-auth` (calculé dans le `serve_cmd` shell).
- **Behavior** : la SPA voit toujours un user authentifié ADMIN, toutes les routes accessibles, la navbar montre user menu + logout (qui no-op effectivement — le filtre re-injecte le user au prochain request).

### Mode `oauth` (test du vrai flow Google contre localhost)

Spring Security actif, OAuth2 Login Google OIDC, sessions backed par cookie `JSESSIONID`. Le SPA passe par la page `/login`, déclenche le redirect dance Google, et atterrit sur `/dashboard` une fois la session établie.

**Pré-requis** (à faire une fois) :

1. **Google Cloud Console** → APIs & Services → Credentials → Create OAuth Client ID → Web application.
2. **Authorized redirect URIs** : ajouter exactement `http://localhost:<FRONTEND_HOST_PORT>/login/oauth2/code/google` (le **port front**, pas backend — grâce à `xfwd` + `forward-headers-strategy: framework`, Spring construit son `redirect_uri` sur le port SPA).
3. **`.env` à la racine** :
   ```
   SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID=...
   SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET=...
   APP_ADMIN_EMAILS=ton.email@gmail.com    # ton email pour atterrir en ADMIN au 1er login
   APP_FRONTEND_URL=http://localhost:4201/  # cible du redirect post-OAuth, match FRONTEND_HOST_PORT
   ```
4. **Activation** : bouton Tilt **« Mode → OAuth »** sur la ressource `backend`, **ou** mettre `BACKEND_AUTH_MODE=oauth` dans `.env` manuellement.
5. **OAuth consent screen** dans Google Cloud Console : en mode `Testing`, ajouter ton email comme test user. Sinon Google bloque le login (« Access blocked »).

Le flow complet :

```
SPA `/login` → bouton « Sign in with Google »
  → window.location = `/oauth2/authorization/google`
  → proxy CLI forward au backend avec X-Forwarded-Host: localhost:<FRONTEND_HOST_PORT>
  → Spring 302 → Google (avec redirect_uri = localhost:<FRONTEND_HOST_PORT>/login/oauth2/code/google)
  → tu autorises
  → Google 302 → localhost:<FRONTEND_HOST_PORT>/login/oauth2/code/google
  → proxy forward au backend, Spring exchange le code, crée la session
  → Spring 302 → APP_FRONTEND_URL (= `http://localhost:4201/`)
  → SPA reload, AuthService.refresh() call `/api/me`, user résolu, dashboard rendu
```

**Pour basculer en cours de session** : clique le bouton Tilt **« Mode → ... »** opposé sur la ressource `backend`. Le bouton édite `.env`, touche `application.yml`, le backend redémarre dans le nouveau mode. Aucun restart Tilt complet n'est nécessaire.

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
│       ├── core/              # split sur 5 sous-dossiers — api/ (HTTP) + local/ (browser) + app-state/ (UI services) + http/ (interceptors, Phase 4) + router/ (guards, Phase 4)
│       │   ├── api/<bucket>/          # 9 bounded contexts miroirs du backend : market/, portfolio/, watchlist/, news/, analyst/, earnings/, config/, analysis/, auth/
│       │   │   ├── *.repository.ts            # ports (abstract class) à la racine du bucket
│       │   │   ├── *.service.ts               # services bucket-locaux (ex. analysis/ollama-status.service.ts, analysis/job-stream.service.ts SSE, analysis/llm-timeout.service.ts)
│       │   │   └── adapters/*.http.ts         # HttpXxxRepository (défaut)
│       │   ├── local/<bucket>/        # ports persistés navigateur (annotation/ seul aujourd'hui) + adapters/*.local.ts
│       │   ├── app-state/             # services UI signal cross-cutting (theme.service.ts, language.service.ts, auth.service.ts), sans port/adapter
│       │   ├── http/                  # HTTP interceptors (Phase 4 — auth.interceptor.ts catch 401 → /login)
│       │   ├── router/                # Route guards (Phase 4 — authGuard, adminGuard)
│       │   └── providers.ts           # `provideRepositories()` — wires les 15 ports (api/ + local/) → adapters
│       └── features/          # Pages UI (primary adapters)
│           ├── dashboard/             # Portefeuille + lien dossiers ticker
│           ├── ticker/                # Dossier par symbole (graphe, indicateurs, narratif IA + thumbs)
│           ├── import/                # Drag & drop CSV Wealthsimple
│           ├── suivi/                 # Timeline snapshots
│           ├── observability/         # Phase 3 — index symbols, timeline narratif vs prix par ticker (#1) + chip cohérence (#2), bias dashboard (#3)
│           └── settings/              # Sidenav : configuration runtime / prompts (liste + éditeur) / prompts/:id/stats (Phase 3)
├── backend/                   # Kotlin + Spring Boot
│   └── src/main/kotlin/com/portfolioai/
│       ├── auth/              # Phase 4 — OAuth2 Google OIDC + ADMIN/USER + profile dev local-no-auth
│       ├── market/            # TwelveData client + mock + indicateurs
│       ├── analysis/          # Phase 1 narratif ticker + LLM dispatch (Routing/Claude/Ollama)
│       ├── portfolio/         # Import CSV, snapshots, lecture (multi-tenant via user_id FK depuis Phase 4)
│       ├── watchlist/         # Phase 2 — tickers suivis hors portefeuille (multi-tenant via user_id FK depuis Phase 4)
│       ├── news/              # Phase 2 — Finnhub + mock, news par ticker
│       ├── analyst/           # Phase 2 — Finnhub + mock, recommandations analystes
│       ├── earnings/          # Phase 2 — Finnhub + mock, earnings trimestriels + next-date
│       ├── config/            # Phase 2 — runtime-editable settings (app_config)
│       └── shared/            # Utilitaires transverses
├── docs/                      # Documentation (mkdocs-material)
├── .claude/                   # Skills, hooks et instructions Claude Code
├── .github/workflows/         # CI backend + frontend + CodeQL + docs (cf. technique/ops.md) + WIF smoke test
├── devops/
│   └── prod/                  # Dockerfile + service.yaml + README check-list (Phase 5 deploy)
├── Tiltfile                   # local infra — boot Postgres + Ollama + backend + frontend
└── docker-compose.yml         # services Docker managés par Tilt
```

## Thème et UI

- Tokens CSS dans `frontend/src/styles.scss` (`:root` = sombre, `[data-theme='light']` = override clair)
- `ThemeService` (`frontend/src/app/core/app-state/theme.service.ts`) — signal, persist localStorage, applique `data-theme` sur `documentElement`
- Anti-FOUC : script inline dans `frontend/src/index.html` qui lit `localStorage` et pose `data-theme` avant le bootstrap Angular
- Composants : `class="btn-primary"`, `.error-banner`, `.content-header`, `.empty-state`, `.confidence-badge`, `.action-badge`, etc. — patterns globaux dans `styles.scss`, à utiliser plutôt que de redéfinir localement

## Tests

- Backend : JUnit 5 + Spring Boot Test. Intégration sur **vrai PostgreSQL** (le CI démarre un service Postgres — détails workflow + cache dans [`ops.md`](./ops.md)). `./gradlew test`
- Frontend : **Vitest** + TestBed. Tests `*.spec.ts` co-localisés avec la source. `npm run test`
- Lancer un seul test Vitest : `cd frontend && npx vitest run src/path/to/file.spec.ts`

## Lint et formatage

- Backend : **Spotless ktfmt** (Google style) — `./gradlew spotlessApply` reformate, `./gradlew spotlessCheck` vérifie. Spotless porte aussi un custom step `no-wildcard-imports` qui casse le build sur tout import en `package.*` hors allowlist (14 packages tolérés temporairement, à shrinker progressivement — cf. dette technique `backlog.md`). Le `.editorconfig` racine bloque IntelliJ d'introduire des wildcards via "Optimize Imports" — défense en profondeur côté éditeur + côté pipeline. **Detekt** pour le reste de l'analyse statique Kotlin (`./gradlew detekt`, rapport HTML + SARIF — voir [`ops.md`](./ops.md) section Detekt).
- Frontend : **ESLint flat config** (`frontend/eslint.config.js`, Angular ESLint 21) pour l'analyse statique TS + a11y des templates. **Prettier** reste seul responsable du formatage (`eslint-config-prettier` désactive les règles formatage qui chevauchent). `npm run lint` en local et en CI (avant le build) ; `npm run lint -- --fix` pour auto-fixer les violations triviales. Détails ruleset dans [`ops.md`](./ops.md) section ESLint.
