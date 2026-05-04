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
| **Frontend CI** (`frontend.yml`) | `push master` / `pull_request` sur `frontend/**` | `npm ci` + `npm run build` + `npm test` | 30-60 s |
| **CodeQL** (`codeql.yml`) | `push master` / `pull_request` / weekly `cron 06:00 UTC lundi` | Matrix `java-kotlin` (build-mode `manual`) + `javascript-typescript` (build-mode `none`) | 2-3 min |
| **Deploy docs** (`docs.yml`) | `push master` sur `docs/**` ou `mkdocs.yml` | `mkdocs gh-deploy` | <1 min |

## Stratégie de cache

Chaque workflow a son cache calibré pour minimiser le temps de feedback sans gonfler le storage GitHub Actions.

### Backend (`backend.yml`)

Géré par **`gradle/actions/setup-gradle@v4`** — action officielle Gradle qui orchestre **trois caches** :

1. **Dependency cache** — `~/.gradle/caches` : tous les JAR de dépendances Maven Central / Spring. Invalidé par `gradle.lockfile` ou changement de version dans `build.gradle.kts`.
2. **Build cache** — résultats incrémentaux des tâches : `compileKotlin`, `test`, `detekt`, `spotlessCheck`. Si une tâche a déjà tourné avec les mêmes inputs, son output est réutilisé sans re-exécution. **C'est le gros gain** sur les runs incrémentaux.
3. **Configuration cache** — skip la phase de configuration de Gradle (~5-10 s par run).

Mode **read-only sur les PRs** (`cache-read-only: ${{ github.ref != 'refs/heads/master' }}`) — évite que deux PRs concurrentes ne s'écrasent leurs caches mutuellement. La branche `master` reste l'autorité d'écriture.

Flag `--build-cache` explicite sur `./gradlew build` pour activer le 2nd niveau.

### Frontend (`frontend.yml`)

Deux caches en cascade :

1. **npm cache** — géré par `actions/setup-node@v6` avec `cache: 'npm'` et `cache-dependency-path: frontend/package-lock.json`. Couvre les deps installées par `npm ci`.
2. **Angular incremental cache** — `frontend/.angular/cache` cacheable séparément, contient les artefacts de compilation incrémentale (transformations TS, CSS, etc.). Coupe `npm run build` de ~30 s → ~10 s sur runs successifs. Key bicéphale `package-lock.json + angular.json` avec `restore-keys` cascade pour réutilisation partielle.

### CodeQL (`codeql.yml`)

Trois caches :

1. **Gradle cache** (matrix `java-kotlin` uniquement) — même `gradle/actions/setup-gradle@v4` que `backend.yml`. Le build cache est *partagé* sur master entre les deux workflows : un `compileKotlin` qui a tourné dans `backend.yml` est réutilisé par `codeql.yml`.
2. **TRAP cache** (`trap-caching: true` sur `github/codeql-action/init@v3`) — cache la BDD CodeQL extraite par langage. Sur Java/Kotlin l'extraction est le bottleneck (~2 min cold) ; le cache la fait tomber sous 30 s sur runs incrémentaux.
3. **CodeQL DB serveur** — auto-géré par GitHub Code Scanning, pas à configurer.

### Diagnostiquer un cache miss

`gradle/actions/setup-gradle@v4` ajoute un summary lisible à chaque run avec le récap **cache hits / misses** par layer. Si un run est plus lent que prévu, regarde dedans avant tout. Causes fréquentes :

- Premier run après merge sur master : warmup attendu, pas grave
- Lockfile changé : invalidation normale du dependency cache
- Branche feature avec `cache-read-only: true` qui ne peut pas écrire : c'est voulu (anti-thrash), accepter le warmup

## Permissions GITHUB_TOKEN

Principe : **chaque workflow déclare explicitement les scopes minimaux** dont il a besoin. Le défaut GitHub est trop permissif (read/write sur tout le repo) et la règle CodeQL "missing-explicit-permissions" remonte un warning sans déclaration.

| Workflow | `permissions` | Pourquoi |
|---|---|---|
| `backend.yml` | `contents: read` + `security-events: write` | Lecture du repo + upload SARIF Detekt vers Code Scanning |
| `frontend.yml` | `contents: read` | Build + tests, pas de write nécessaire |
| `codeql.yml` | `security-events: write` + `packages: read` + `actions: read` + `contents: read` | Standard CodeQL — upload findings vers Code Scanning + lecture deps + lecture workflows |
| `docs.yml` | `contents: write` | `gh-deploy` push sur la branche `gh-pages` |

## Code Scanning (Security tab)

Deux sources alimentent l'onglet **Security → Code scanning** du repo :

- **CodeQL** (deux catégories : `java-kotlin`, `javascript-typescript`) — analyse statique vulnérabilités + anti-patterns, couverture native par GitHub. Findings classés par gravité.
- **Detekt SARIF** (catégorie `detekt`) — uploadé par `backend.yml` après chaque `./gradlew build`. Détecte les complexités cyclomatiques, code smells Kotlin spécifiques. Voir [`detekt.yml` config](../../backend/config/detekt/detekt.yml) pour les règles tunées.

Les findings des deux outils cohabitent dans la même UI, dédupliqués par règle + emplacement. Si tu remontes un faux positif, **dismissable** depuis l'UI sur un finding individuel ou via la config (Detekt) pour la règle entière.

## Detekt — analyse statique Kotlin

Configuration : [`backend/config/detekt/detekt.yml`](../../backend/config/detekt/detekt.yml).

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

## Dependabot — auto-PRs deps obsolètes

Configuration : [`.github/dependabot.yml`](../../.github/dependabot.yml).

- **Scan hebdo lundi 06:00 Europe/Paris** sur trois écosystèmes : `gradle` (backend), `npm` (frontend), `github-actions`.
- **Groupement minor + patch** par écosystème → 1 PR par eco par semaine au lieu de 10. Majeures restent en PRs séparées (impact justifie revue isolée).
- **Ignore list** :
  - `typescript` major bumps (Angular 21 borne à `>=5.9 <6.0`)
  - `io.gitlab.arturbosch.detekt` major bumps (refactor manuel demandé pour 2.0)
  - `com.diffplug.spotless` major bumps (peut reformater toute la codebase)
  - `zone.js` (zoneless explicite, garde-fou si transitif)
- **Groups** :
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
| `Postgres connection refused` (backend) | Service `postgres` pas encore healthy | Augmenter `--health-retries` dans `backend.yml` ou ajouter un retry au boot Spring |
| `npm error ERESOLVE` (frontend Dependabot PR) | Conflit peer-dep — souvent une majeure de dep liée (TS / Angular) | Fermer la PR, attendre que la dep amont accepte. Penser à ajouter à l'`ignore` Dependabot si récurrent |
| `Property 'X' cannot be resolved` (Spring config) | Warning IDE bénin sur les props lues via `@Value` | Ignorer — ça ne casse pas le build |

### Re-run d'un workflow

Onglet Actions → cliquer sur le run → bouton "Re-run failed jobs" ou "Re-run all jobs". Les caches sont préservés, le re-run profite de tout ce qui a déjà tourné.

## Roadmap CI / ops

À venir (cf. [`backlog.md`](../projet/backlog.md)) :

- **ESLint frontend** — analyse statique TS/Angular + step CI dans `frontend.yml`
- **Settings runtime** — éditer clé API et TTL cache depuis l'UI plutôt que via `application-local.yml` (impact : la config Spring devient dynamique, peut affecter les tests CI si on n'isole pas le mode test)
- **Merge queue** — possible quand on aura plusieurs contributeurs ou des PRs concurrentes (gardé en backlog, pas urgent solo)
