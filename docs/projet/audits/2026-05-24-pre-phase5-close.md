# Revue de code globale — pré-clôture Phase 5 (2026-05-24)

**Scope** : audit de la delta `v0.6.0..HEAD` (44 commits, 138 fichiers, ~+6 971 / −4 962 lignes). Couvre la **Phase 5 entière** (Cloud Run + Supabase Postgres deploy, Workload Identity Federation, GitHub Secrets vault, secret rotation, deploy workflow + release process, backup pipeline Postgres → R2, Sentry/GlitchTip wiring backend + frontend, custom domain Cloudflare `tickerstory.org`, `/actuator/info` app version) **et la session polish du 2026-05-24** : migration Testcontainers (tests d'intégration backend autosuffisants, fin couplage Tilt), gating Ollama en prod (`app.ollama.enabled` flag), closure formelle Provider gating + fix bug stale-rendering `save SECRET`, renumérotation Phase 6 ↔ Phase 7 + ajout Phase 8 (e2e non-régression), bumps CI (CodeQL v3→v4, google-github-actions v2→v3), 3 polish bundles dette technique (Bundle A — 5 Important pré-v0.5.1, Bundle B — Phase 3 résidus #3 #4, Bundle C — analyst residuals #2 #3 #4), onboarding `testeur.md`, extraction `shared/filter-window/`.

**Méthode** : 3 subagents `code-reviewer` lancés **en parallèle** sur trois lentilles complémentaires — **sécurité & opérabilité** (Cloud Run secrets, WIF, forward-headers, Sentry/GlitchTip, custom domain, Ollama prod gating, backup pipeline), **qualité backend** (Kotlin idioms, Spring conventions, hexagonal DDD, Testcontainers pattern, refacto `AppConfigService`, tests-as-documentation, KDoc accuracy), **qualité frontend** (Angular 21 signals + zoneless, `assertInInjectionContext` pattern, configuration.spec après refacto save SECRET, snapshot.repository.spec dédié, `shared/filter-window` extraction, testeur.md). Chacun briefé sur les conventions ground truth (`CLAUDE.md`, `architecture.md`, `ddd.md`, skills `kotlin-idioms`, `spring-boot`, `hexagonal-ddd`, `folders-structure-backend`, `angular-component`, `angular-di`, `angular-signals`, `angular-testing`, `folders-structure-frontend`) et sur l'audit précédent (`2026-05-17-pre-v0.6.0-phase4.md`) comme format de référence. Sortie : punch-list structurée Bloquants / À discuter / Mineurs avec extrait + suggestion + verdict per-tranche. Synthèse + dédup par le main thread.

**État du commit au moment de la revue** : branche `master`, dernier commit committé `5ce49fd chore(analyst): polish residuals (enum contract + SCSS phantoms + KDoc honesty)`. Working tree clean. La revue couvre l'ensemble du delta depuis le tag `v0.6.0` (Phase 4 close), incluant les 44 commits qui forment l'arc Phase 5 + session polish.

---

## Résumé exécutif

Phase 5 livre proprement l'arc deploy : Cloud Run + Supabase free tier $0/mo durable (région `northamerica-northeast1`), Workload Identity Federation **sans** SA key (`attribute_condition repository_owner == 'jv3n'` + binding `principalSet://.../attribute.repository/jv3n/trade`), secret management Secret Manager avec mount `--update-secrets` au runtime, GitOps strict via `on: release: published` (pas de push auto), backup hebdomadaire `pg_dump → R2` (30 jours rétention, restore drill documenté), Sentry/GlitchTip avec `traces-sample-rate: 0.0` (errors only, $0 ingestion) et redaction stricte (log pattern `[%X{userId:-}]`, jamais l'email), custom domain Cloudflare avec Cache Rules + Worker SPA fallback. La session polish du 2026-05-24 a fermé 8+ tickets en cumul : migration Testcontainers (zéro dépendance Tilt sur les tests d'intégration backend), gating Ollama en prod (DTO field + flag + prune au boot pour les overrides stale d'un éventuel DB clone local→prod), audit du Provider gating qui s'est révélé déjà 95 % livré (bug stale-rendering trouvé + patché en passant), 3 polish bundles défensifs sur la dette technique, et phase 8 « Tests e2e non-régression auto » filed avec une décision tech différée volontairement.

**3 Bloquants identifiés — patches courts, à appliquer avant tag Phase 5 close** :

1. **Contradiction doc IAM `secretmanager.secretAccessor`** — `docs/devops/deploiement.md §6.1 step 3` prescrit un grant **project-level** au SA `github-deploy@`, tandis que `docs/devops/backup-process.md §3` documente le pattern **per-secret** (moindre privilège). Si le setup a suivi `deploiement.md`, `github-deploy@` a actuellement accès aux 4 secrets dont `google-oauth-client-secret` et `app-admin-emails` qui devraient être réservés au SA runtime. À vérifier dans GCP Console + corriger la doc principale pour aligner sur le pattern per-secret.

2. **Commentaire trompeur dans `SecurityConfig.kt:97-99` sur la protection actuator** — le commentaire affirme que les endpoints actuator non-health sont protégés par « l'auth Spring Boot par défaut », mais le code suivant (`anyRequest().permitAll()` ligne 99) les laisse tous publics. Le fait que `/actuator/info` soit public est intentionnel et documenté dans `deploiement.md §6.4`, mais le commentaire dit le contraire et constitue une bombe à retard pour un futur dev qui activerait `/actuator/env` dans `application-prod.yml` sans réaliser qu'il l'expose.

3. **`AnalysisConfig.kt` placé à la racine du bounded context** (`com.portfolioai.analysis`) au lieu de `analysis/infrastructure/` — diverge de la convention `folders-structure-backend` qui place les `@Configuration` beans dans `infrastructure/`. Pas de risque runtime (Spring discover via component scan), mais établit une nouvelle convention de placement non documentée. Soit déplacer en `analysis/infrastructure/AnalysisConfig.kt`, soit documenter l'exception « root-level `@Configuration` quand le bean est partagé cross-layer » dans le skill.

**Verdict global** : `needs-fix`. Les trois Bloquants sont des patches de quelques minutes chacun, sans risque.

**11 À discuter** : 4 sécurité (logging `set()` ne log que la clé — clean today mais préventif ; Dockerfile copie `.git/` ~70 MB en build context ; `PostgresContainer` pas de `launcherSessionClosed()` ; `/actuator/metrics` public en profil non-prod), 4 backend (`Sentry.configureScope` deprecated v8 → v9 migration à anticiper ; mock de `AppConfigService` concret via kotlin-allopen dans `CustomOAuth2UserServiceTest` — pattern question ; V2 Flyway sans test d'intégration assertif sur l'état post-migration ; `PostgresContainer.bootstrap()` re-set des system properties à chaque appel — harmless mais non-idempotent au sens strict), 3 frontend (`provideZonelessChangeDetection()` absent de plusieurs specs settings — project-wide gap pré-existant ; `testeur.md` mentionne « Analyser » au lieu du label réel « Générer le narratif » ; `testeur.md` `<repo-url>` placeholder non résolu).

**8 Mineurs** : Cloudflare Account ID hardcodé dans `backup-process.md` (low risk, public par construction), GlitchTip DSN frontend hardcodé en clair dans `main.ts` (idiome Sentry standard, public par design), `service.yaml` documentaire désaligné de `deploy.yml` sur `sentry-dsn-backend`, `backup-postgres.yml` convention lowercase `$file` inhabituelle, commentaire test rounding `5999/9999` correct mais qui pourrait être plus explicite sur la dérivation du dénominateur, doublon commits `c13484c` et `f210bde` (rebase off-limits, archéologie pure), 2 SCSS/test cleanup (snapshot.repository.spec.ts idle test sans commentaire `no await`, filter-window.spec.ts redondance promptId).

**Faux positifs / non actionnables filtrés** : 8 — (a) `forward-headers-strategy: framework` en profil base (couvert par les commentaires + safety net dev), (b) `Sentry.configureScope` deprecation v8 (fonctionne, pas removed avant v9), (c) `kotlin-allopen` mock de `AppConfigService` (intentionnel + commenté), (d) `PostgresContainer.bootstrap()` re-set system properties (harmless, container fournit valeurs stables post-`start()`), (e) `app.allowed.emails` mode laxiste fresh deploy (décision documentée backward-compat), (f) `effect()` dans `positionsCache` (référence implémentation skill `angular-signals`), (g) `useValue: repo` dans access-control.spec.ts (`ConfigRepository` n'a pas de concrete builders à hériter), (h) GlitchTip DSN frontend public par design.

---

## Forces

- **Workload Identity Federation propre, sans SA key** — `attribute_condition assertion.repository_owner == 'jv3n'` rejette tout OIDC token d'un autre owner. Binding `roles/iam.workloadIdentityUser` sur `github-deploy@` scopé via `principalSet://.../attribute.repository/jv3n/trade` (repo-scope, pas owner-scope). Aucune clé JSON émise ou stockée, conformément aux best practices Google 2024+. Smoke test `smoke-wif.yml` exercise les permissions `run.admin` + `artifactregistry.writer` au moindre privilège.

- **Secret Management end-to-end mounté via Cloud Run `--update-secrets`** — 5 secrets (`google-oauth-client-id`, `google-oauth-client-secret`, `app-admin-emails`, `supabase-db-url`, `sentry-dsn-backend`) résolus runtime par Cloud Run depuis GCP Secret Manager, exposés comme env vars au container. Pas de secret en clair dans le repo, pas de SA key, pas de manifest YAML committed avec des valeurs. `secret-rotation.md` documente la procédure rotation par secret avec smoke après deploy.

- **Sentry/GlitchTip wiring défensif** — `dsn: ${SENTRY_DSN:}` avec fallback empty → SDK no-op silencieusement si le secret est absent (pas de crash boot). `traces-sample-rate: 0.0` (errors-only, optimise le quota free tier GlitchTip 5K events/mo). `in-app-includes: com.portfolioai` (les frames Spring/Hibernate apparaissent en gris collapsable). `release: ${SENTRY_RELEASE:}` propagé via `deploy.yml --set-env-vars=SENTRY_RELEASE=${tag}` permet de filter le dashboard par tag de release. Frontend DSN public par design (idiome Sentry standard, no auth credentials).

- **Backup pipeline robuste** — `pg_dump --no-owner --no-acl --format=plain | gzip > backup-<ISO-timestamp>.sql.gz` weekly cron `0 4 * * 0` + `workflow_dispatch` manuel, upload R2 (S3-compatible, free tier 10 GB), prune les objets au-delà des 30 plus récents. Restore drill trimestriel documenté avec procédure pas-à-pas (download → gunzip → psql sur Neon free temporaire). PostgreSQL 16 client (forward-compat avec PG 15 Supabase, +1 majeur de buffer). WIF auth avec grant per-secret `secretmanager.secretAccessor` sur `supabase-db-url`.

- **Testcontainers migration propre** — `testsupport/PostgresContainer.kt` singleton `object` héritant `PostgreSQLContainer<postgres:16>` avec `withReuse(true)`. `bootstrap()` idempotent (`if (!isRunning) start()`) publie les coordinates en system properties qui outrank `application.yml`. SPI auto-discovery via `TestcontainersBootstrap` (`LauncherSessionListener` dans `META-INF/services/`) — zéro annotation sur les 3 tests `@SpringBootTest` existants. La promotion `junit-platform-launcher` de `testRuntimeOnly` à `testImplementation` est nécessaire et correcte (le SPI nécessite l'API visible au compile).

- **Ollama gating en prod défense en profondeur** — flag `app.ollama.enabled` injecté via `@Value` dans `AppConfigService` ; méthodes `isOllamaEnabled()` + `listedKeys()` (drop OLLAMA_MODEL quand off) + `allowedValuesFor(key)` (drop ollama de `LLM_PROVIDER.allowedValues` quand off). `validate()` rejette `set(LLM_PROVIDER, ollama)` ET `set(OLLAMA_MODEL, ...)` avec messages clairs. `pruneStaleOllamaOverrides()` au `@PostConstruct` couvre le cas DB clone local→prod en supprimant l'override stale **en mémoire** (DB row laissée intacte pour archéologie). `ConfigController.list()` itère `service.listedKeys()` et `entryFor()` lit `service.allowedValuesFor(key)` — zéro contournement. 8 tests backend + 1 test frontend pinnent le contrat dans les deux directions (flag on / off).

- **Provider gating closure post-mortem** — audit révèle que le ticket dette était déjà délivré à 95 % pendant la Phase 4 secrets refacto (backend `ConfigKeys.PROVIDER_REQUIRED_KEY` + `AllowedValueDto.disabledReason` + `ConfigController.annotateAllowedValue` + frontend `[disabled]` + `matTooltip` + i18n key + 3 tests backend, sans clôture du backlog). Le vrai travail du jour était un **bug de rendering stale** signalé par le user en cours de session : `save()` patchait uniquement l'entry sauvée, laissant les `disabledReason` des entries dépendantes (e.g. 3 toggles provider qui dépendent de la finnhub key) stuck en `disabled` jusqu'à un refresh manuel. Fix : branche dédiée pour le path SECRET qui refetch la liste complète (mirror du pattern `reset()` qui faisait déjà la refetch). 3 tests ajoutés dont la régression du bug + le pattern défensif « non-SECRET ne refetch pas » + le rendering disabled via `.mat-button-toggle-disabled` (robuste vs traduction i18n du label).

- **`assertInInjectionContext` guard sur les Resource builders** — `snapshot.repository.ts` `allResource()` et `positionsCache(trigger)` ouvrent par `assertInInjectionContext(this.allResource)` / `assertInInjectionContext(this.positionsCache)`. Fail-fast au runtime si appelé hors DI context (le `effect()` + `rxResource` capturent le `DestroyRef` du caller — un call hors injection context leakerait silencieusement). KDoc des deux builders étendue pour expliciter la mécanique. Section `angular-signals/SKILL.md > Resource builders` étend d'un paragraphe « `assertInInjectionContext` guard » pour pin l'invariant avant la généralisation aux 13 autres repos.

- **`snapshot.repository.spec.ts` dédié** — nouveau fichier 165 lignes, 7 tests pinent le contrat des builders contre une `FakeSnapshotRepository extends SnapshotRepository` (pas un `useValue` plat qui perdrait les builders hérités). Tests : (a) `allResource` subscribe + surface via `value()`, (b) `allResource` throw hors DI, (c) `positionsCache` idle quand trigger undefined, (d) `positionsCache` populate map sur emit, (e) `positionsCache` accumule sur ids distincts, (f) pas de re-fetch sur même valeur trigger (rxResource params equality), (g) `positionsCache` throw hors DI. Pattern d'async signal-based testing rodé après itération (passage à `await TestBed.inject(ApplicationRef).whenStable()` au lieu du `TestBed.tick()` initial qui ne flushait pas correctement les effects).

- **Polish bundles dette technique systématiques** — Bundle A (5 Important pré-v0.5.1) ferme entièrement le ticket parent : `@Bean Clock` explicite dans `AnalysisConfig` (défense in depth contre un futur 2e `@Bean Clock`), `OllamaStatusService.pullModel` branche 404 défensive (forward-compat upstream API) + 1 test, `WatchlistService.lookupInstrumentType` TODO inline pointant vers la dette « Gestion d'erreur transverse Volet 3 », `assertInInjectionContext` sur `SnapshotRepository`, spec dédié. Bundle B (Phase 3 résidus #3 #4) — test rounding HALF_UP scale 4 sur boundary fractionnaire `5999/9999`, sous-item #4 obsolète (V8 squashée pendant Phase 4 V1→V10 fusion). Bundle C (analyst residuals) — enum contract test `AnalystConsensus.entries.map { it.name }.toSet() == setOf("BUY","HOLD","SELL","MIXED")`, TODO inline Clock sur `MockAnalystClient`, KDoc honesty sur `fetchPriceTargetOrNull` (les 3 catches logguent distinctement, gap UI est v2), SCSS `[hidden]` sur les 5 segments + `border-radius` tokenisé.

- **Renumérotation Phase 6 ↔ Phase 7 + ajout Phase 8** propre — 3-step token swap pour éviter collisions textuelles dans backlog.md (`Phase 6 → PHASE_TMP_SWAP → Phase 6 ← Phase 7 ← PHASE_TMP_SWAP`), reorder physique des blocs, ajout Phase 8 stub e2e avec scope explicitement différé (1er ticket = cataloguer les golden paths, choix tech après). Renaming du fichier memory `project_phase7_radar.md` → `project_phase6_radar.md` + content updaté, patches `vision.md` + `fonctionnalites.md` + `architecture.md` + `sources.md` (4 fichiers forward-looking, replace_all). Historical docs intacts (CHANGELOG, journal-livraisons antérieur, audits) — convention « les phases closes gardent leur numéro forever » posée dans le journal.

- **Bumps CI préventifs** — CodeQL v3 → v4 (deadline déc 2026), `google-github-actions/auth` + `setup-gcloud` v2 → v3 (Node 20 default-disabled le 2 juin 2026, à 9 jours). Patches forwards-compat sur 3-4 workflows, doc actualisée.

- **Tests-as-documentation respecté** — nouveaux specs `snapshot.repository.spec.ts` (class-level docstring + scenarios full sentences), `NarrativeBiasServiceTest > bias flag fires on a fractional ratio that rounds UP...`, `AnalystSnapshotTest > enum surface stays exactly the four values...`, `PostgresContainer.kt` KDoc 12+ lignes expliquant le mécanisme, `TestcontainersBootstrap.kt` KDoc qui justifie le choix `LauncherSessionListener` vs `BeforeAllCallback`.

---

## Punch-list détaillée

### Bloquants

**B1. Contradiction doc IAM `secretmanager.secretAccessor` — `deploiement.md` vs `backup-process.md`** *(Lens A)*

`docs/devops/deploiement.md §6.1 step 3` prescrit d'ajouter `roles/secretmanager.secretAccessor` **au niveau projet** au SA `github-deploy@` :

```
3. Créer un service account `github-deploy@...` avec rôles `roles/run.admin` +
   `roles/iam.serviceAccountUser` + `roles/artifactregistry.writer` +
   `roles/secretmanager.secretAccessor`.
```

`docs/devops/backup-process.md §3` affirme, en revanche, le pattern per-secret (moindre privilège) :

```
Principe du moindre privilège respecté : le binding est **per-secret**, pas
project-level. `github-deploy@` n'a accès qu'à `supabase-db-url`, pas aux 3 autres
secrets (google-oauth-client-id, google-oauth-client-secret, app-admin-emails).
```

Si le setup a suivi `deploiement.md step 3`, le SA `github-deploy@` dispose actuellement d'un accès project-wide en lecture sur tous les secrets — y compris `google-oauth-client-secret` et `app-admin-emails` qui sont censés être réservés au SA runtime `portfolioai-runtime@`. Si le setup a suivi `backup-process.md §3`, le doc principal est trompeur pour toute future rotation / reproductibilité.

**Suggestion** : (a) vérifier dans GCP Console l'IAM réel de `github-deploy@` sur Secret Manager. (b) Si le binding est project-wide, le rétrécir per-secret (`gcloud secrets add-iam-policy-binding supabase-db-url --member=serviceAccount:github-deploy@... --role=roles/secretmanager.secretAccessor`). (c) Corriger `deploiement.md §6.1 step 3` pour indiquer le binding per-secret + référencer `backup-process.md §3` comme contrat de moindre privilège.

**B2. `SecurityConfig.kt:97-99` — commentaire trompeur sur la protection de `/actuator/info`** *(Lens A)*

Le commentaire lignes 97-98 affirme que les endpoints actuator (autres que `/actuator/health`) sont protégés par « l'auth Spring Boot par défaut ». Ce n'est pas ce que fait le code : la règle `anyRequest().permitAll()` à la ligne 99 est la règle de dernier recours qui s'applique à toute requête non interceptée par les matchers précédents — incluant `/actuator/info`, `/actuator/metrics` (exposé en local par `application.yml`), `/actuator/env` si jamais activé accidentellement.

```kotlin
it.requestMatchers("/actuator/health", "/login/**", "/oauth2/**").permitAll()
// ...
it.requestMatchers("/api/**").authenticated()
// Aucun matcher pour /actuator/** ici
it.anyRequest().permitAll()   // ← couvre /actuator/info, /actuator/metrics, etc.
```

`/actuator/info` est public **par design** (documenté dans `deploiement.md §6.4`, contient seulement build version + git commit). La situation actuelle est acceptable mais le commentaire claim le contraire. Bombe à retard pour un futur dev qui activerait `/actuator/env` dans `application-prod.yml` sans réaliser qu'il l'expose.

**Suggestion** : remplacer les lignes 97-99 par :

```kotlin
// Tout le reste — incluant les routes Angular (SPA) et /actuator/info (public by design,
// cf. deploiement.md §6.4) — est permitAll. /actuator/env et /actuator/configprops ne sont
// pas exposés en prod (application-prod.yml include: health, info) ; si jamais activés,
// ajouter un requestMatchers("/actuator/**").authenticated() avant cette règle.
it.anyRequest().permitAll()
```

**B3. `AnalysisConfig.kt:1` placé à la racine du bounded context au lieu de `infrastructure/`** *(Lens B)*

```kotlin
package com.portfolioai.analysis
// …
@Configuration
class AnalysisConfig { @Bean fun clock(): Clock = Clock.systemUTC() }
```

Le skill `folders-structure-backend/SKILL.md` place les `@Configuration` beans dans `<context>/infrastructure/`. Les 3 `@Configuration` existants (`MarketConfig`, `TwelveDataHttpConfig`, `FinnhubHttpConfig`) suivent ce pattern. Dropper `AnalysisConfig` au niveau `com.portfolioai.analysis` (à côté de `domain/`, `application/`, `infrastructure/`) introduit une convention non documentée. Pas de risque runtime (Spring discover via component scan), mais drift de convention.

**Suggestion** : déplacer vers `backend/src/main/kotlin/com/portfolioai/analysis/infrastructure/AnalysisConfig.kt`. Aucun import à mettre à jour (`JobEventPublisher` reste dans `analysis/application/`, le bean est résolu par type). Ou alternative : documenter l'exception « root-level `@Configuration` quand le bean est partagé cross-layer » dans `folders-structure-backend/SKILL.md` et `spring-boot/SKILL.md` (qui liste les `@Configuration` files — `AnalysisConfig` est le 4ᵉ, doc gap aussi).

---

### À discuter

**A1. `application.yml:104` + `application-prod.yml:91-92` — `metrics` exposé en profil non-prod** *(Lens A)*

Le profil base expose `health, info, metrics`. Le profil prod surcharge à `health, info` seulement (correct). En local dev, `/actuator/metrics` est public via `anyRequest().permitAll()`. Acceptable pour un solo dev sur localhost, mais risque de surface si un day un tunnel ngrok ou similaire partage la session.

**Suggestion** : pas pré-tag. Ajouter un commentaire dans `application.yml` qui explicite que `metrics` est dev-only et **devrait** être protégé si on partage la session via tunnel.

**A2. `devops/prod/Dockerfile` — `COPY .git/ ./.git/` ~70 MB de build context** *(Lens A)*

Documenté dans `deploiement.md > §6.4 Notes pratiques`. La justification est correcte : `gradle-git-properties` a besoin du `.git`. Acceptable tant que le repo reste petit. Alternative si le build devient lent : `git clone --filter=blob:none --depth 1` (partial clone) ou passer `git.commit.id` directement comme build-arg plutôt que copier `.git/`. Pas pré-tag.

**A3. `testsupport/PostgresContainer.kt` — pas de `launcherSessionClosed()` dans `TestcontainersBootstrap`** *(Lens A + Lens B partagés)*

`withReuse(true)` délègue le cleanup à Ryuk. Si le reuse n'est pas opt-in (`testcontainers.reuse.enable=false`, défaut), un nouveau container est créé à chaque run ; l'ancien reste vivant jusqu'à ce que Ryuk le tue (~10 s post-JVM exit). Sur un CI runner éphémère pas de problème. En dev local sans reuse opt-in, des containers s'accumulent si on lance les tests rapidement en boucle.

**Suggestion** : implémenter `override fun launcherSessionClosed(session: LauncherSession) { if (!PostgresContainer.isReuseEnabled) PostgresContainer.stop() }` dans `TestcontainersBootstrap`. Pas urgent — Ryuk gère le cas standard. Cosmétique.

**A4. `AppConfigService` logs `set()` ne log que la clé** *(Lens A — préventif)*

Aujourd'hui `log.info("Config override set : key={}", key)` est clean : aucune valeur loggée. La clé `ALLOWED_EMAILS` passe par `set()` ; si un futur dev ajoute `value={}` pour debug, la liste d'emails finirait dans les logs Cloud Logging GCP.

**Suggestion** : ajouter un commentaire au-dessus du `log.info` qui justifie l'absence intentionnelle du `value=` placeholder + référence à la convention `CLAUDE.md > Backend > Never log user emails`.

**A5. `SentryUserContextFilter.kt:43` — `Sentry.configureScope` deprecated dans SDK v8** *(Lens B)*

```kotlin
Sentry.configureScope { scope -> scope.user = User().apply { id = userId } }
// …
Sentry.configureScope { it.user = null }
```

Le projet ship `io.sentry:sentry-spring-boot-starter-jakarta:8.10.0`. `Sentry.configureScope(callback)` est `@Deprecated` dans v8, replacement = `Sentry.withScope { scope -> … }` ou `getCurrentHub().configureScope()`. Le pattern actuel (mutation scope + reset en `finally`) est correct ; le deprecation n'est pas removal jusqu'à v9.

**Suggestion** : pas pré-tag. À grouper avec un futur bump SDK v9.

**A6. `CustomOAuth2UserServiceTest` mocks `AppConfigService` via `kotlin-allopen`** *(Lens B)*

Le test commente lui-même la fragilité : « if the allopen scope is ever narrowed, this mock() call will fail ». Le test n'a besoin que de `getAllowedEmails()`. Question de pattern : doit-on institutionnaliser le mock de `@Service` concrets via allopen, ou refacto vers un stub hand-rolled qui implémente l'interface réduite ?

**Suggestion** : pas pré-tag. À arbitrer si un autre test similaire émerge.

**A7. `V2__reset_narrative_prompt_to_body.sql` — pas de test d'intégration assertif sur l'état post-migration** *(Lens B)*

Le skill `spring-boot/SKILL.md` dit « A new `V<N>__*.sql` deserves at minimum an integration test that boots Flyway ». `BackendApplicationTests.contextLoads()` couvre le boot, pas l'état (e.g. `version = 'v3-body-only'` sur la row active).

**Suggestion** : ajouter un `@SpringBootTest` qui query `prompt_template` post-migration et asserte sur les invariants attendus. À filer dans le backlog si non patché pré-tag.

**A8. `provideZonelessChangeDetection()` absent de `access-control.spec.ts` + `configuration.spec.ts`** *(Lens C)*

L'app utilise zoneless (`app.config.ts:46`). `snapshot.repository.spec.ts` ajoute `provideZonelessChangeDetection()` parce que le `whenStable()` zoneless a une sémantique différente du zone-based. Les 2 specs settings utilisent `fixture.detectChanges()` + `of()` mocks sync, donc passent aujourd'hui — mais une scenario async ajouté plus tard pourrait silencieusement diverger.

**Suggestion** : ajouter `provideZonelessChangeDetection()` aux 2 TestBed concernés. C'est un project-wide gap pré-existant (la majorité des specs n'en ont pas), pas une régression Phase 5.

**A9. `testeur.md:54` — label « Analyser » au lieu de « Générer le narratif »** *(Lens C)*

Le doc instruit de cliquer sur le « bouton **Analyser** » alors que la clé i18n `ticker.narrative.generate` résout sur « Générer le narratif » (`fr.json:249`). Drift doc↔code qui confondrait un testeur novice.

**Suggestion** : remplacer « **Analyser** » par « **Générer le narratif** » ligne 54 (ou aligner le label UI si on veut changer).

**A10. `testeur.md:37` — placeholder `<repo-url>` non résolu** *(Lens C)*

```
git clone <repo-url>
```

Un testeur non-dev ne saura pas quoi substituer. Si le repo est public ou sharable, remplacer par l'URL réelle ; sinon ajouter une note « URL fournie via invitation ».

**A11. `configuration.spec.ts:312` — test « save on a secret key clears the typed input » under-décrit après le refacto** *(Lens C)*

Après le refacto `save()` SECRET refetch list, le test ligne 312 fait `component.save('market.twelvedata.api-key')` puis asserte uniquement que l'input est vidé. Le test ligne 322 (`saving a SECRET refetches the list...`) couvre le nouveau comportement, mais le test ligne 312 ne reflète plus la totalité de ce que `save()` fait.

**Suggestion** : soit ajouter `expect(repo.list).toHaveBeenCalledTimes(2);` au test ligne 312, soit renommer en « save on a secret key refetches the list and clears the typed input ». État actuel n'est pas faux — juste under-described.

---

### Mineurs

**M1. `backup-process.md:9,17` — Cloudflare Account ID hardcodé dans les URLs** *(Lens A)*

L'Account ID `8f2780696b5e520f85b5fc80413c4c3f` est public (la note ligne 19 le confirme) mais permet l'enumeration de patterns d'attaque (bucket, Worker introspection). Considérer un placeholder + référence à `vars.CLOUDFLARE_ACCOUNT_ID`. Niveau cosmétique pour un usage solo.

**M2. `devops/prod/service.yaml` documentaire désaligné de `deploy.yml`** *(Lens A)*

`service.yaml` est marqué `STUB` mais ne liste pas `sentry-dsn-backend` dans `spec.containers.env`. Un `gcloud run services replace service.yaml` omettrait ce secret. Ajouter une note `# NOTE: sentry-dsn-backend not listed here — injected by deploy.yml --update-secrets` éviterait la confusion.

**M3. `backup-postgres.yml:104` — convention lowercase `$file` inhabituelle** *(Lens A)*

`echo "file=$FILE" >> "$GITHUB_ENV"` (uppercase RHS) puis usage `$file` lowercase. Fonctionne (GitHub Actions injecte en lowercase), mais inhabituel à lire. Préférer `BACKUP_FILE` partout.

**M4. `NarrativeBiasServiceTest.kt:110` — comment rounding test pourrait être plus explicite** *(Lens B)*

```kotlin
// Concretely : 5999 / 9999 = 0.59995999... → HALF_UP at scale 4 → 0.6000
.willReturn(listOf(SentimentCountRow("BULLISH", 5999L), SentimentCountRow("NEUTRAL", 4000L)))
```

Le total est `5999 + 4000 = 9999`, le math est correct. Mais le commentaire ne fait pas explicite la dérivation du dénominateur. Préférer « `5999 / (5999 + 4000) = 5999 / 9999 = 0.59995999…` » pour le prochain lecteur.

**M5. `spring-boot/SKILL.md` — liste `@Configuration` files désynchronisée** *(Lens B)*

Le skill section « Stereotypes » dit « Three exist: `MarketConfig`, `TwelveDataHttpConfig`, `FinnhubHttpConfig` ». `AnalysisConfig` est le 4ᵉ. Doc gap qui s'ajoute à B3.

**M6. Doublon commits `c13484c` + `f210bde`** *(Lens B)*

Même message « feat: Phase 5a wrap — Cloud Run + Supabase live + SPA fallback + doc sync ». Artefact rebase / double-push, dans `master` donc no action (rebase off-limits).

**M7. `snapshot.repository.spec.ts:108` — idle test sans commentaire « no await »** *(Lens C)*

Le test « stays idle while the trigger is undefined » asserte sans `await TestBed.inject(ApplicationRef).whenStable()`. C'est correct (rxResource ne fire pas si trigger undefined), mais un futur lecteur pourrait réflexivement ajouter un `whenStable()` redondant. Ajouter `// no await — trigger is undefined, rxResource never subscribes`.

**M8. `filter-window.spec.ts:52` — test « collapses empty promptId » redondant avec ligne 25** *(Lens C)*

Les deux tests appellent `buildFilterWindow('2026-04-03', '', '')` avec exactement la même signature et asserent `result?.promptId === undefined`. 7 unique scenarios suffisent au lieu de 8.

---

## Faux positifs filtrés

8 suggestions des subagents écartées après vérification :

1. **`forward-headers-strategy: framework`** en profil base — risque de spoofing nul tant que le backend n'est pas exposé directement à internet sans proxy devant. Invariant tenu en prod (Cloud Run + Cloudflare devant), en local pas exposé.
2. **`Sentry.configureScope` deprecation v8** — fonctionne, pas removed. Migration à anticiper sur v9. Documentée en A5 comme follow-up.
3. **`kotlin-allopen` mock de `AppConfigService`** — intentionnel, commenté explicitement dans le test, idiome du projet pour mocker les `@Service` concrets quand le besoin est ponctuel. Documenté en A6 comme question de pattern.
4. **`PostgresContainer.bootstrap()` re-set system properties à chaque appel** — harmless (container fournit valeurs stables post-`start()`, propriétés réécrites avec les mêmes valeurs). Pas un bug.
5. **`app.allowed.emails` mode laxiste fresh deploy** — décision documentée backward-compat (window vulnérabilité minimale, l'admin pose la liste dans les minutes suivant le deploy). `app.admin.emails` reste un secret boot-time protecteur.
6. **`effect()` dans `positionsCache`** — c'est la référence implémentation du pattern « réagir à un signal qu'on ne possède pas » documentée dans skill `angular-signals`. Pas une violation.
7. **`useValue: repo` dans `access-control.spec.ts`** — `ConfigRepository` n'a pas de concrete builders à hériter, `useValue` reste valide. La forward-référence à `useClass` migration dans le commentaire du spec est correcte.
8. **GlitchTip DSN frontend hardcodé** — standard Sentry pattern, public par design (visible DevTools à chaque pageload), pas un secret. Documentation rotation dans `secret-rotation.md`.

---

## Référence

- Audit précédent : [`2026-05-17-pre-v0.6.0-phase4.md`](./2026-05-17-pre-v0.6.0-phase4.md) (delta Phase 4 Authentification + multi-tenant + Flyway V1 squash).
- Méthode : 3 subagents `code-reviewer` en parallèle, lentilles **Sécurité & opérabilité** + **Backend Kotlin/Spring** + **Frontend Angular 21**. Output : 1 verdict per-tranche (`needs-fix` + `needs-fix` + `mergeable`), synthèse + dédup main thread. Verdict global : `needs-fix` (3 Bloquants courts).
- Patches post-audit attendus : à arbitrer item par item avec l'utilisateur. Les 3 Bloquants (B1 IAM doc, B2 SecurityConfig commentaire, B3 AnalysisConfig placement) sont des patches de quelques minutes chacun, sans risque. Les 11 À discuter et 8 Mineurs sont du polish à filer en backlog dette technique ou patcher dans le même pass selon arbitrage.
