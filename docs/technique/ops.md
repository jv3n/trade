# Ops — CI / CD, caching, tooling

Référence sur tout ce qui tourne autour du code lui-même : workflows GitHub Actions, stratégie de cache, analyse statique, code scanning, dépendances. Différent des autres docs technique :

- [`architecture.md`](./architecture.md) — modules backend / frontend, schéma BDD, décisions techniques
- [`developpement.md`](./developpement.md) — commandes locales (Tilt, gradle, npm), structure projet
- [`developper.md`](./developper.md) — onboarding pas à pas, premier lancement, debug
- [`providers.md`](./providers.md) — providers externes (Twelve Data, Finnhub, Anthropic, Ollama)
- **`ops.md`** *(ce fichier)* — pipeline CI, caching, sécurité, tooling

## Workflows GitHub Actions

Sept workflows, chacun déclenché sur des paths différents pour ne pas relancer toute la chaîne à chaque commit :

| Workflow | Trigger | Job principal | Durée typique |
|---|---|---|---|
| **Backend CI** (`backend.yml`) | `push master` / `pull_request` sur `backend/**` | `./gradlew build` (compile + test + Spotless + Detekt). Les tests d'intégration `@SpringBootTest` bootent leur propre Postgres via **Testcontainers** (singleton `testsupport/PostgresContainer.kt` + SPI `LauncherSessionListener`), donc plus de bloc `services:` dans le workflow — Docker est dispo sur les runners `ubuntu-latest`. Suivi de Kover (couverture) + sticky PR comment | 1-2 min |
| **Frontend CI** (`frontend.yml`) | `push master` / `pull_request` sur `frontend/**` | `npm ci` + `npm run lint` + `npm run build` + `npm run test:coverage` + sticky PR comment | 30-60 s |
| **CodeQL** (`codeql.yml`) | `push master` / `pull_request` / weekly `cron 06:00 UTC lundi` | Matrix `java-kotlin` (build-mode `manual`) + `javascript-typescript` (build-mode `none`) | 2-3 min |
| **Deploy docs** (`docs.yml`) | `push master` sur `docs/**` ou `mkdocs.yml` | `mkdocs gh-deploy` | <1 min |
| **WIF Smoke Test** (`smoke-wif.yml`) | `workflow_dispatch` manuel uniquement | Exerce Workload Identity Federation (OIDC GitHub → access token GCP via SA `github-deploy@`) + `gcloud run services list` + `gcloud artifacts repositories describe backend` pour valider que `run.admin` + `artifactregistry.writer` marchent. Utilise `environment: production` donc exige une required reviewer approval avant exécution. Outil de diagnostic quand on doute du pipeline GCP ; pas câblé sur un événement push pour ne pas spam. | 30-60 s |
| **Deploy to Cloud Run** (`deploy.yml`) | `on: release: published` (Phase 5a) | WIF → `docker buildx build linux/amd64 --push` vers Artifact Registry tag = `release.tag_name` → `gcloud run deploy portfolioai` avec 4 secrets mountés depuis Secret Manager + profil `prod` → smoke `/actuator/health`. Gated par `environment: production` (required reviewer = self-approve). Détail dans [`docs/devops/release-process.md`](../devops/release-process.md). | 3-5 min |
| **Backup Supabase Postgres** (`backup-postgres.yml`) | `cron '0 4 * * 0'` (dimanche 4 AM UTC, weekly) + `workflow_dispatch` manuel | WIF → install `postgresql-client-16` → fetch `supabase-db-url` depuis Secret Manager → `pg_dump --no-owner --no-acl \| gzip > backup-<ISO>.sql.gz` → `aws s3 cp` vers Cloudflare R2 bucket `portfolioai-backups` → prune au-delà des 30 plus récents. Détail dans [`docs/devops/backup-process.md`](../devops/backup-process.md). | 1-2 min |

## Couverture de code

Deux générateurs distincts, deux **commentaires PR « sticky »** distincts dans la conversation de la PR (édités sur chaque push, pas spammés). Aucun service externe — tout reste dans GitHub Actions.

| Côté | Générateur | Format consommé | Action commentaire | Préfixe du sticky comment |
|---|---|---|---|---|
| Backend | `kover` (Gradle plugin, `./gradlew koverHtmlReport koverXmlReport`) | XML JaCoCo-compatible (`backend/build/reports/kover/report.xml`) | [`madrapps/jacoco-report@v1.8.0`](https://github.com/madrapps/jacoco-report) | `Backend coverage` (via `title`) |
| Frontend | Vitest reporters `json-summary` + `json` (configurés dans `angular.json > test > configurations > coverage`) | `coverage-summary.json` + `coverage-final.json` sous `frontend/coverage/frontend/` | [`davelosert/vitest-coverage-report-action@v2`](https://github.com/davelosert/vitest-coverage-report-action) | `Frontend` (via `name`) |

> **Pourquoi un pin précis (`@v1.8.0`) et pas le tag major `@v1`** : le tag flottant `@v1` de `madrapps/jacoco-report` est sticky à un commit ancien (`be8ba5e9`) dont l'`action.yml` n'expose que 4 inputs (`path` singulier, `token`, `min-coverage-overall`, `min-coverage-changed-files`). Les inputs `paths` (pluriel, support multi-fichiers + glob), `title` et `update-comment` ont été introduits en v1.7.0 (2024-08) mais le mainteneur n'a jamais re-pointé le tag major. Sans le pin explicite, l'action plante avec `ENOENT: no such file or directory, open ''` parce que notre `paths:` est silencieusement ignoré (input inconnu) et l'action retombe sur un chemin vide. Le bump 1.7.2 → 1.8.0 (Dependabot, commit `0f5ac10`) reste minor donc sûr ; vérifier le changelog upstream avant un futur bump.

**Pourquoi 2 commentaires séparés et pas 1 unifié** : (a) les actions de chaque side lisent leur propre format natif (XML JaCoCo pour Kover, JSON Istanbul pour Vitest) — pas de format pivot intermédiaire à maintenir, (b) chaque workflow ne s'exécute que sur les changes pertinents (`paths:` filter), donc une PR purement docs ne kicke aucun workflow et n'a aucun comment couverture (vs un service unifié type Codecov qui devrait soit fail soft, soit reposter le même comment à chaque trigger). Trade-off accepté : 2 entrées au lieu d'une dans la timeline PR.

**Permissions** : `pull-requests: write` au scope **job** (le baseline workflow-level reste `contents: read`). Les deux actions utilisent automatiquement le `GITHUB_TOKEN` déjà fourni par Actions — pas de secret à provisionner.

**Conditions de déclenchement** : `if: always() && github.event_name == 'pull_request' && hashFiles(<rapport>) != ''`. Composantes :
- `always()` — le step tourne même si un step antérieur a failed (un test rouge laisse quand même le rapport partiel utile).
- `github.event_name == 'pull_request'` — no-op sur les pushes vers master ; il n'y a pas de PR à commenter.
- `hashFiles(...)` — garde contre un crash dans la génération du rapport en amont (Kover/Vitest plante avant d'écrire le fichier). Sans ce guard, le step échouerait sur fichier manquant et empilerait une fausse erreur CI au-dessus de la vraie cause.

**Step Summary conservé en parallèle** : chaque workflow continue d'écrire la table de totaux dans `$GITHUB_STEP_SUMMARY` (pure Node côté front, pure Python côté back). C'est ce qui s'affiche sur la page du run lui-même — utile quand on est dans Actions plutôt que dans la PR. Les deux surfaces sont indépendantes : un sticky comment qui n'est pas posté (push master, ou rapport absent) n'affecte pas le step summary.

**Pas de seuil bloquant** — les deux actions sont configurées avec `min-coverage-overall: 0` côté back et aucun threshold côté front. On veut **observer la couverture évoluer dans la PR**, pas faire échouer le merge sur un drop temporaire. Si on veut un guard plus tard, c'est un changement de YAML d'une ligne par côté.

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
2. **TRAP cache** (`trap-caching: true` sur `github/codeql-action/init@v4`) — cache la BDD CodeQL extraite par langage. C'est le seul cache de "résultats" qui marche pour CodeQL parce qu'il vit côté outil (pas côté Gradle), donc indépendant des up-to-date checks Gradle. Sur Java/Kotlin l'extraction est le bottleneck (~2 min cold) ; le TRAP cache la fait tomber sous 30 s sur runs incrémentaux.
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
| `smoke-wif.yml` | `contents: read` | `+ id-token: write` | OIDC token GitHub à échanger contre access token GCP via WIF |
| `deploy.yml` | `contents: read` | `+ id-token: write` | Idem — WIF auth pour `gcloud run deploy` |
| `backup-postgres.yml` | `contents: read` | `+ id-token: write` | Idem — WIF auth pour `gcloud secrets versions access` |

## Code Scanning (Security tab)

Deux sources alimentent l'onglet **Security → Code scanning** du repo :

- **CodeQL** (deux catégories : `java-kotlin`, `javascript-typescript`) — analyse statique vulnérabilités + anti-patterns, couverture native par GitHub. Findings classés par gravité.
- **Detekt SARIF** (catégorie `detekt`) — uploadé par `backend.yml` après chaque `./gradlew build`. Détecte les complexités cyclomatiques, code smells Kotlin spécifiques. Voir [`detekt.yml` config](../../backend/config/detekt/detekt.yml) pour les règles tunées.

Les findings des deux outils cohabitent dans la même UI, dédupliqués par règle + emplacement. Si tu remontes un faux positif, **dismissable** depuis l'UI sur un finding individuel ou via la config (Detekt) pour la règle entière.

## Detekt — analyse statique Kotlin

Configuration : [`backend/config/detekt/detekt.yml`](../../backend/config/detekt/detekt.yml).

Tuning pragmatique pour Kotlin/Spring/JPA :
- `LongParameterList` exclu sur `@Entity` / `@Embeddable` (les entités JPA ont légitimement 8-14 params constructeur)
- `MagicNumber` ignore une whitelist large (HTTP codes, percent, timeouts standard) + exclut tests + `MockMarketChartClient` + `IndicatorCalculator`
- `TooGenericExceptionCaught` exclut adapters HTTP / parsers / runners (catches larges légitimes)
- `SwallowedException` accepte `_` / `ignored*` / `expected*` comme noms de variables (idiome Kotlin)

`WildcardImport` est désactivée — l'enforcement vit côté **Spotless** custom step (cf. `backend/build.gradle.kts`) plutôt que Detekt parce qu'on veut que la pipeline **casse** sur l'introduction d'un nouveau wildcard, pas seulement qu'elle rapporte. Volontairement pas de ktlint comme runner : avec `ij_kotlin_packages_to_use_import_on_demand` ktlint applique la sémantique IntelliJ et **force** les wildcards sur les packages listés, comportement inverse au but recherché (cf. `architecture.md > Décisions techniques notables` pour le rationale détaillé du rollback). Le custom step Spotless `no-wildcard-imports` scanne les imports et lance `GradleException` sur tout wildcard hors allowlist de 14 packages (`java.util.*`, `jakarta.persistence.*`, JUnit `Assertions.*`, MockMvc helpers, Mockito-kotlin, Spring web.bind.annotation, plus 7 packages internes `com.portfolioai.*` à shrinker progressivement). Garder la rule Detekt active aurait dupliqué le rapport sans valeur ajoutée.

Lancer en local :

```bash
cd backend
./gradlew detekt              # rapport HTML + SARIF
open build/reports/detekt/detekt.html
```

Le `ignoreFailures = true` actuel signifie que Detekt n'échoue pas le build, juste génère le rapport. Le jour où on flippe à `false`, soit on fix les findings, soit on génère un baseline (`./gradlew detektBaseline`) pour grandfather la dette existante.

## ESLint — analyse statique TypeScript / Angular

Configuration : [`frontend/eslint.config.js`](../../frontend/eslint.config.js) (flat config, Angular ESLint 22).

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

Configuration : [`.github/dependabot.yml`](../../.github/dependabot.yml).

- **Scan quotidien 06:00 America/Toronto** sur trois écosystèmes : `gradle` (backend), `npm` (frontend), `github-actions`. Le bruit reste maîtrisé par le filtre patch-only ci-dessous.
- **Patch only** sur tous les écosystèmes (`update-types: [patch]`) — 1 PR par eco par semaine, le bruit reste dans le couloir des bug-fixes upstream. Les minors et majors restent **manuels** : ils peuvent embarquer des breaking changes silencieux (Kotlin 2.1 → 2.3 a cassé le `resolutionStrategy` Detekt en routine), pas envie de checker des PRs qui plantent.
- **Ignore list** (belt-and-suspenders au cas où la policy bouge — déjà bloqués par le patch-only) :
  - `typescript` major bumps (Angular 22 borne à `>=5.9 <6.0`)
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
| `Cannot connect to the Docker daemon` (backend test) | Testcontainers échoue à booter son PG parce que Docker n'est pas dispo sur le runner | Vérifier que la job CI tourne sur `ubuntu-latest` (Docker pré-installé) ; sur un self-hosted runner, installer Docker + ajouter l'user runner au group `docker`. |
| `npm error ERESOLVE` (frontend Dependabot PR) | Conflit peer-dep — souvent une majeure de dep liée (TS / Angular) | Fermer la PR, attendre que la dep amont accepte. Penser à ajouter à l'`ignore` Dependabot si récurrent |
| `Property 'X' cannot be resolved` (Spring config) | Warning IDE bénin sur les props lues via `@Value` | Ignorer — ça ne casse pas le build |

### Re-run d'un workflow

Onglet Actions → cliquer sur le run → bouton "Re-run failed jobs" ou "Re-run all jobs". Les caches sont préservés, le re-run profite de tout ce qui a déjà tourné.

## Roadmap CI / ops

À venir (cf. [`backlog.md`](../projet/backlog.md)) :

- **Cache Vitest en CI** — à mesurer avant de coder. La transform TS→JS de Vitest vit dans `node_modules/.vite/` donc wipée à chaque `npm ci` ; déplacer le cache dans un dossier persistable + `actions/cache@v5` dédié peut couper la part Vitest si elle dépasse les 30 s. Trigger d'arbitrage : mesurer la durée Vitest brute en CI sur 5-10 runs avant de décider
