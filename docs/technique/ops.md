# Ops — CI / CD, caching, tooling

Référence sur tout ce qui tourne autour du code lui-même : workflows GitHub Actions, stratégie de cache, analyse statique, code scanning, dépendances. Différent des autres docs technique :

- [`architecture.md`](./architecture.md) — modules backend / frontend, schéma BDD, décisions techniques
- [`developpement.md`](./developpement.md) — commandes locales (Tilt, gradle, npm), structure projet
- [`developper.md`](./developper.md) — onboarding pas à pas, premier lancement, debug
- [`providers.md`](./providers.md) — providers externes (Twelve Data, Finnhub, Anthropic, Ollama)
- **`ops.md`** *(ce fichier)* — pipeline CI, caching, sécurité, tooling

## Workflows GitHub Actions

Quatre workflows, chacun déclenché sur des paths différents pour ne pas relancer toute la chaîne à chaque commit :

| Workflow | Trigger | Job principal | Durée typique |
|---|---|---|---|
| **Backend CI** (`backend.yml`) | `push master` / `pull_request` sur `backend/**` | `./gradlew build` (compile + test + Spotless + Detekt) avec PostgreSQL en service Docker | 1-2 min |
| **Frontend CI** (`frontend.yml`) | `push master` / `pull_request` sur `frontend/**` | `npm ci` + `npm run lint` + `npm run build` + `npm test` | 30-60 s |
| **CodeQL** (`codeql.yml`) | `push master` / `pull_request` / weekly `cron 06:00 UTC lundi` | Matrix `java-kotlin` (build-mode `manual`) + `javascript-typescript` (build-mode `none`) | 2-3 min |
| **Deploy docs** (`docs.yml`) | `push master` sur `docs/**` ou `mkdocs.yml` | `mkdocs gh-deploy` | <1 min |

## Stratégie de cache

Chaque workflow a son cache calibré pour minimiser le temps de feedback sans gonfler le storage GitHub Actions.

### Backend (`backend.yml`)

Géré par **`gradle/actions/setup-gradle@v6`** — action officielle Gradle qui orchestre **trois caches** :

1. **Dependency cache** — `~/.gradle/caches` : tous les JAR de dépendances Maven Central / Spring. Invalidé par `gradle.lockfile` ou changement de version dans `build.gradle.kts`.
2. **Build cache** — résultats incrémentaux des tâches : `compileKotlin`, `test`, `detekt`, `spotlessCheck`. Si une tâche a déjà tourné avec les mêmes inputs, son output est réutilisé sans re-exécution. **C'est le gros gain** sur les runs incrémentaux.
3. **Configuration cache** — skip la phase de configuration de Gradle (~5-10 s par run).

Mode **read-only sur les PRs** (`cache-read-only: ${{ github.ref != 'refs/heads/master' }}`) — évite que deux PRs concurrentes ne s'écrasent leurs caches mutuellement. La branche `master` reste l'autorité d'écriture.

Flag `--build-cache` explicite sur `./gradlew build` pour activer le 2nd niveau.

### Frontend (`frontend.yml`)

Un seul cache, géré par `actions/setup-node@v6` avec `cache: 'npm'` et `cache-dependency-path: frontend/package-lock.json` — couvre les deps installées par `npm ci`. Un cache Angular incremental (`frontend/.angular/cache`) avait été tenté en parallèle mais retiré : `ng build` en mode production ne génère pas le répertoire (`Path Validation Error: Path(s) specified in the action for caching do(es) not exist`), donc le cache n'était jamais alimenté et le step n'apportait que de l'overhead. Le coût de redémarrage à froid sur le frontend reste sous les 60 s, suffisant.

### CodeQL (`codeql.yml`)

Trois caches, **mais le build cache Gradle est explicitement bypassé** sur ce workflow :

1. **Gradle dependency cache uniquement** (matrix `java-kotlin`) — même `gradle/actions/setup-gradle@v6` que `backend.yml`, mais la step `Compile Kotlin` passe `--rerun-tasks` (et **pas** `--build-cache`). Pourquoi : CodeQL extrait l'AST Java/Kotlin via un agent JVM injecté pendant la compilation. Si `compileKotlin` ressort `FROM-CACHE` ou `UP-TO-DATE`, l'agent ne voit rien → erreur fatale `database finalize` exit 32 (« No source code seen during build »). Le dep cache (JARs Maven) est OK car c'est juste du download. Le build cache (outputs incrémentaux) est interdit ici par construction.
2. **TRAP cache** (`trap-caching: true` sur `github/codeql-action/init@v3`) — cache la BDD CodeQL extraite par langage. C'est le seul cache de "résultats" qui marche pour CodeQL parce qu'il vit côté outil (pas côté Gradle), donc indépendant des up-to-date checks Gradle. Sur Java/Kotlin l'extraction est le bottleneck (~2 min cold) ; le TRAP cache la fait tomber sous 30 s sur runs incrémentaux.
3. **CodeQL DB serveur** — auto-géré par GitHub Code Scanning, pas à configurer.

> **Gotcha à connaître** : tout ajout futur de `--build-cache` ou `cache-from-task-outputs` à la step `Compile Kotlin` recasse l'analyse en silence (le job vert pendant des semaines puis rouge dès qu'un PR effleure du Kotlin déjà compilé). Voir [docs GitHub : "No source code seen during build"](https://gh.io/troubleshooting-code-scanning/no-source-code-seen-during-build).

### Diagnostiquer un cache miss

`gradle/actions/setup-gradle@v6` ajoute un summary lisible à chaque run avec le récap **cache hits / misses** par layer. Si un run est plus lent que prévu, regarde dedans avant tout. Causes fréquentes :

- Premier run après merge sur master : warmup attendu, pas grave
- Lockfile changé : invalidation normale du dependency cache
- Branche feature avec `cache-read-only: true` qui ne peut pas écrire : c'est voulu (anti-thrash), accepter le warmup

## Permissions GITHUB_TOKEN

Principe : **chaque workflow déclare un bloc `permissions:` au niveau workflow** (baseline `contents: read`) et **override au niveau job** quand un job a besoin de plus. Le défaut GitHub est trop permissif (read/write sur tout le repo).

Pourquoi le bloc workflow-level est obligatoire en plus du job-level : la règle CodeQL `actions/missing-workflow-permissions` (et la règle Sonar équivalente) ne reconnaît que la déclaration au scope workflow. Un job-level seul laisse tout futur job ajouté retomber sur le token permissif par défaut — la règle protège contre cette dérive.

| Workflow | Workflow-level | Job-level (override) | Pourquoi |
|---|---|---|---|
| `backend.yml` | `contents: read` | `+ security-events: write` | Upload SARIF Detekt vers Code Scanning |
| `frontend.yml` | `contents: read` | `contents: read` (redondant, exigé par Sonar) | Build + tests, pas de write nécessaire ; la redondance fige l'intention par job |
| `codeql.yml` | `contents: read` | `+ security-events: write` `+ packages: read` `+ actions: read` | Standard CodeQL — upload findings + lecture deps + lecture workflows |
| `docs.yml` | `contents: read` | `contents: write` (override) | `gh-deploy` push sur la branche `gh-pages` |

## Code Scanning (Security tab)

Deux sources alimentent l'onglet **Security → Code scanning** du repo :

- **CodeQL** (deux catégories : `java-kotlin`, `javascript-typescript`) — analyse statique vulnérabilités + anti-patterns, couverture native par GitHub. Findings classés par gravité.
- **Detekt SARIF** (catégorie `detekt`) — uploadé par `backend.yml` après chaque `./gradlew build`. Détecte les complexités cyclomatiques, code smells Kotlin spécifiques. Voir [`detekt.yml` config](https://github.com/jv3n/trade/blob/master/backend/config/detekt/detekt.yml) pour les règles tunées.

Les findings des deux outils cohabitent dans la même UI, dédupliqués par règle + emplacement. Si tu remontes un faux positif, **dismissable** depuis l'UI sur un finding individuel ou via la config (Detekt) pour la règle entière.

## Detekt — analyse statique Kotlin

Configuration : [`backend/config/detekt/detekt.yml`](https://github.com/jv3n/trade/blob/master/backend/config/detekt/detekt.yml).

Tuning pragmatique pour Kotlin/Spring/JPA :
- `LongParameterList` exclu sur `@Entity` / `@Embeddable` (les entités JPA ont légitimement 8-14 params constructeur)
- `WildcardImport` autorise `jakarta.persistence.*`, `org.springframework.web.bind.annotation.*`, `Assertions.*`, `MockMvcResultMatchers.*` (idiomes universels)
- `MagicNumber` ignore une whitelist large (HTTP codes, percent, timeouts standard) + exclut tests + `MockMarketChartClient` + `IndicatorCalculator`
- `TooGenericExceptionCaught` exclut adapters HTTP / parsers / runners (catches larges légitimes)
- `SwallowedException` accepte `_` / `ignored*` / `expected*` comme noms de variables (idiome Kotlin)

Lancer en local :

```bash
cd backend
./gradlew detekt              # rapport HTML + SARIF
open build/reports/detekt/detekt.html
```

Le `ignoreFailures = true` actuel signifie que Detekt n'échoue pas le build, juste génère le rapport. Le jour où on flippe à `false`, soit on fix les findings, soit on génère un baseline (`./gradlew detektBaseline`) pour grandfather la dette existante.

## ESLint — analyse statique TypeScript / Angular

Configuration : [`frontend/eslint.config.js`](https://github.com/jv3n/trade/blob/master/frontend/eslint.config.js) (flat config, Angular ESLint 21).

Extends posés par le schematic `ng add @angular-eslint/schematics` :
- TS : `eslint:recommended` + `tseslint:recommended` + `tseslint:stylistic` + `angular-eslint:tsRecommended`
- HTML : `angular-eslint:templateRecommended` + `angular-eslint:templateAccessibility` (a11y)
- `eslint-config-prettier` appliqué en dernier pour désactiver les règles formatage qui chevauchent Prettier (qui reste seul format)

**Pas** de `recommended-type-checked` côté TS — 5-10× plus lent (résolution complète des types) ; à activer plus tard en session dédiée si on veut serrer.

Step CI dédiée dans `frontend.yml` **avant le build** (un linter qui pète tôt évite de cramer ~10 s de build pour rien). Échec sur erreur → CI rouge, pas de tolérance aux warnings (zéro warning aujourd'hui, on garde la règle binaire).

Lancer en local :

```bash
cd frontend
npm run lint        # rapport stdout
npm run lint -- --fix   # auto-fix ce qui est fixable (formatage, array-type, …)
```

## Dependabot — auto-PRs deps obsolètes

Configuration : [`.github/dependabot.yml`](https://github.com/jv3n/trade/blob/master/.github/dependabot.yml).

- **Scan quotidien 06:00 America/Toronto** sur trois écosystèmes : `gradle` (backend), `npm` (frontend), `github-actions`. Le bruit reste maîtrisé par le filtre patch-only ci-dessous.
- **Patch only** sur tous les écosystèmes (`update-types: [patch]`) — 1 PR par eco par semaine, le bruit reste dans le couloir des bug-fixes upstream. Les minors et majors restent **manuels** : ils peuvent embarquer des breaking changes silencieux (Kotlin 2.1 → 2.3 a cassé le `resolutionStrategy` Detekt en routine), pas envie de checker des PRs qui plantent.
- **Ignore list** (belt-and-suspenders au cas où la policy bouge — déjà bloqués par le patch-only) :
  - `typescript` major bumps (Angular 21 borne à `>=5.9 <6.0`)
  - `io.gitlab.arturbosch.detekt` major bumps (refactor manuel demandé pour 2.0)
  - `com.diffplug.spotless` major bumps (peut reformater toute la codebase)
  - `zone.js` (zoneless explicite, garde-fou si transitif)
- **Groups** (tous filtrés sur `update-types: [patch]`) :
  - `angular` : tous `@angular/*`, `@angular-*/*`, `@ngtools/*` ensemble (peer-deps internes)
  - `ngx-translate` : `core` + `http-loader`
  - `spring-boot` : starter + plugin + dependency-management

## Quand un workflow casse

### Premier réflexe : regarder le summary

GitHub affiche un résumé en haut de chaque run. Pour les workflows avec setup-gradle / setup-node, le summary inclut un récap cache → identifier instantanément un cache miss inattendu.

### Erreurs courantes

| Erreur | Cause probable | Fix |
|---|---|---|
| `Property 'X' is misspelled` (Detekt) | Règle YAML dans le mauvais ruleset (style vs naming vs exceptions) | Cf. doc Detekt 1.23 — chaque rule a son ruleset |
| `Run failed with N invalid config properties` (Detekt) | Same | Same |
| `No source code seen during build` (CodeQL, exit 32 sur `database finalize`) | `compileKotlin` est sorti `FROM-CACHE` ou `UP-TO-DATE` → l'agent JVM CodeQL n'a vu aucune compilation. Symptôme typique après une PR qui touche à peine le Kotlin et où le build cache est restauré tel quel | Vérifier que la step `Compile Kotlin` de `codeql.yml` passe bien `--rerun-tasks` et **pas** `--build-cache`. Voir section "Stratégie de cache > CodeQL" plus haut |
| `Postgres connection refused` (backend) | Service `postgres` pas encore healthy | Augmenter `--health-retries` dans `backend.yml` ou ajouter un retry au boot Spring |
| `npm error ERESOLVE` (frontend Dependabot PR) | Conflit peer-dep — souvent une majeure de dep liée (TS / Angular) | Fermer la PR, attendre que la dep amont accepte. Penser à ajouter à l'`ignore` Dependabot si récurrent |
| `Property 'X' cannot be resolved` (Spring config) | Warning IDE bénin sur les props lues via `@Value` | Ignorer — ça ne casse pas le build |

### Re-run d'un workflow

Onglet Actions → cliquer sur le run → bouton "Re-run failed jobs" ou "Re-run all jobs". Les caches sont préservés, le re-run profite de tout ce qui a déjà tourné.

## Roadmap CI / ops

À venir (cf. [`backlog.md`](../projet/backlog.md)) :

- **Merge queue** — possible quand on aura plusieurs contributeurs ou des PRs concurrentes (gardé en backlog, pas urgent solo)
- **Cache Vitest en CI** — à mesurer avant de coder. La transform TS→JS de Vitest vit dans `node_modules/.vite/` donc wipée à chaque `npm ci` ; déplacer le cache dans un dossier persistable + `actions/cache@v5` dédié peut couper la part Vitest si elle dépasse les 30 s. Trigger d'arbitrage : mesurer la durée Vitest brute en CI sur 5-10 runs avant de décider
