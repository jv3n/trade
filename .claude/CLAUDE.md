# CLAUDE.md

Source of truth for project conventions and Claude-specific configuration. Read this first when working on PortfolioAI.

## Project

Per-ticker market intelligence app. For each ticker (held in the user's portfolio or watched), the backend fetches market data from Twelve Data, computes technical indicators server-side (RSI, MA, momentum, drawdown…), and the LLM produces a short narrative summary. **The LLM is a writer, not a decider** — it does not predict prices and does not output BUY/SELL signals; it digests indicators that the code computed and writes a short readable summary.

**Architecture cible — pipeline d'analyse composable** : the per-ticker dossier is the **atomic unit** of computation. Portfolio-level analyses (and future watchlist digests, cross-position alerts, etc.) are **compositions** built on top — a DAG of jobs where the leaves are `TickerAnalysis(symbol, day)` (cache-aware via `ticker_narrative_snapshot`) and parents are aggregators (`PortfolioAggregation`, …) that consume already-persisted leaf narratives instead of re-prompting on raw indicators. The cache makes portfolio analyses cheap (~M LLM calls where M = uncached tickers, often 0). Visible to the user as a GitHub-Actions-style pipeline view. Vision details in `docs/metier/vision.md > Le pipeline d'analyse` ; technical model in `docs/technique/architecture.md > Modèle pipeline d'analyse`.

> Phase 0 (rebalance recommendations from RSS news + portfolio-wide LLM prompt) was **decommissioned** in Phase 2.5 — the RSS ingestion module, the legacy portfolio-analysis pipeline, and the underlying tables (`feed_article`, `feed_source`, `recommendation*`, `analysis_job`) were removed. The replacement is the arrival of `PortfolioAggregation` as a parent job over the existing per-ticker infrastructure (cf. backlog Phase 6 « Réintégration Phase 0 »). See `docs/metier/fonctionnalites.md` for the full phasing.

## Stack

| Layer       | Tech                                  |
| ----------- | ------------------------------------- |
| Frontend    | Angular 21 + Angular Material         |
| Backend     | Kotlin + Spring Boot                  |
| Build       | Gradle (Kotlin DSL)                   |
| AI          | Claude API (Anthropic) — Ollama local |
| DB          | PostgreSQL + Flyway                   |
| Local infra | Tilt + Docker Compose                 |
| CI          | GitHub Actions                        |

## Repository Structure

```
trade/
├── frontend/                # Angular 21 (single app, standalone components)
│   └── src/app/
│       ├── core/            # split on 3 axes : api/ (HTTP buckets) + local/ (browser buckets) + app-state/ (UI services) + http/ + router/
│       │   ├── api/<bucket>/           # market/, portfolio/, watchlist/, news/, analyst/, earnings/, config/, analysis/, auth/ (P4)
│       │   │   ├── *.repository.ts     # abstract class = port (+ bucket-local services next to the port)
│       │   │   └── adapters/*.http.ts  # HttpXxxRepository (default)
│       │   ├── local/<bucket>/         # browser-persisted ports (today: annotation/ only) + adapters/*.local.ts
│       │   ├── app-state/              # cross-cutting UI signal services : theme.service.ts, language.service.ts, auth.service.ts (P4)
│       │   ├── http/                   # HTTP interceptors (Phase 4 — auth.interceptor.ts)
│       │   ├── router/                 # Route guards (Phase 4 — auth.guards.ts)
│       │   └── providers.ts            # provideRepositories() — wires every bucket
│       ├── shared/          # pure cross-cutting helpers (no state, no DI) — one folder per concept, e.g. shared/toggle-set/toggle-set.ts
│       └── features/        # UI pages (primary adapters) — login/ + error/ (P4), dashboard/, ticker/, …
├── backend/                 # Kotlin + Spring Boot
│   └── src/main/kotlin/com/portfolioai/
│       ├── auth/            # Phase 4 — User entity + OAuth2/OIDC services + SecurityConfig + local-no-auth bypass
│       ├── market/          # MarketChartClient port + TwelveData/Mock adapters + IndicatorCalculator
│       ├── analysis/        # Phase 1 ticker narrative pipeline + LLM dispatch
│       ├── portfolio/       # CSV imports, snapshots, read-only portfolios
│       ├── watchlist/       # Phase 2 — manual list of tickers tracked outside the portfolio
│       ├── news/            # Phase 2 — Finnhub-backed news headlines per ticker
│       ├── analyst/         # Phase 2 — Finnhub-backed analyst recommendations per ticker
│       ├── earnings/        # Phase 2 — Finnhub-backed earnings (4 last Q + next date) per ticker
│       ├── config/          # Phase 2 — runtime-editable settings (app_config V4) + routing clients
│       └── shared/          # cross-cutting utilities
├── docs/
│   ├── metier/              # vision.md, fonctionnalites.md
│   ├── technique/           # architecture.md, developpement.md, ddd.md
│   ├── projet/              # backlog.md (open work), journal-livraisons.md (shipped), sources.md, commit-conventions.md
│   ├── data-input/          # fake sample CSVs (versioned)
│   └── data-input-local/    # real Wealthsimple exports (gitignored)
├── .github/workflows/       # CI: backend.yml, frontend.yml, docs.yml
├── .claude/                 # this folder — Claude Code skills, hooks, instructions
├── Tiltfile
├── docker-compose.yml
└── README.md
```

## Backend modules

- `auth/` — Phase 4 v1 (livré 2026-05-17, itéré sur la même session). Hexagonal split sous `auth/domain/` (`User` JPA entity, `Role { ADMIN, USER }` enum), `auth/application/` (`AuthService.getCurrentUser/isAdmin` lit `SecurityContextHolder` + relit le user en BDD via `userId` — cast au principal type via l'interface marker `AppUserPrincipal`), `auth/infrastructure/persistence/` (`UserRepository` Spring Data) et `auth/infrastructure/security/` :
  - **`SecurityConfig` `@Profile("!local-no-auth")`** : wire `oauth2Login()` **conditionnellement** sur la présence du bean `ClientRegistrationRepository` (via `ObjectProvider.ifAvailable` — sans ça le smoke test sans creds OAuth casserait). Inclut **CSRF cookie-based** (`CookieCsrfTokenRepository.withHttpOnlyFalse()` + plain `CsrfTokenRequestAttributeHandler`) + `CsrfTokenResponseFilter` qui force l'écriture du cookie XSRF-TOKEN sur chaque réponse (Spring 6 résout le token lazy par défaut). `defaultSuccessUrl` lit `app.frontend-url` (env `APP_FRONTEND_URL`) pour atterrir sur le SPA en dev même quand backend et SPA tournent sur des ports différents.
  - **Deux user services parallèles** : `CustomOAuth2UserService` (hypothétique futur GitHub OAuth2 non-OIDC) + `CustomOidcUserService` (Google OIDC, le chemin v1). Google utilise OIDC dès qu'on demande le scope `openid` → Spring traite OIDC via `OidcUserService` séparément de `OAuth2UserService`. Câbler les deux via `userInfoEndpoint { ep -> ep.userService(...) ; ep.oidcUserService(...) }`. Logique de find-or-create extraite en `CustomOAuth2UserService.findOrCreateUser(...)`, réutilisée par le service OIDC.
  - **Deux principal types** convergent sur l'interface `AppUserPrincipal { val userId: UUID }` : `AppOAuth2User` (OAuth2 + local-no-auth, expose `email` direct) et `AppOidcUser extends DefaultOidcUser` (OIDC Google, hérite `getEmail()` des claims). `email` volontairement absent de l'interface pour éviter le clash JVM signature avec `DefaultOidcUser.getEmail()`.
  - **`LocalNoAuthSecurityConfig` + `LocalNoAuthFilter` + `LocalNoAuthUserInitializer`** activés sous le profile `local-no-auth` : injectent un user fake ADMIN (`dev@local.test`) sur chaque request, idempotent. CSRF reste **enabled** ici aussi pour matcher le shape de production.
  - **`auth/infrastructure/http/AuthController`** expose `GET /api/me` ; logout via le handler natif Spring `POST /logout`.
  - **Trust forwarded headers** : `server.forward-headers-strategy: framework` dans `application.yml` + `xfwd: true` dans `frontend/proxy.conf.js`. En dev, l'OAuth dance entier traverse `localhost:<FRONTEND_HOST_PORT>` du point de vue du browser (et de Google) — sans ça la redirect_uri envoyée à Google serait sur le port backend, et le cookie de session serait stocké sur la mauvaise origine. La redirect URI à enregistrer dans Google Cloud Console est `http://localhost:<FRONTEND_HOST_PORT>/login/oauth2/code/google`.
  - **Routes ADMIN-only** : `/api/config/**`, `/api/prompts/**`, `/api/narrative/observability/**`.
  - **Whitelist** : `app.admin.emails` (env `APP_ADMIN_EMAILS`) — comma-separated, case-insensitive ; assignée **une seule fois à la création** du user (la BDD est l'autorité ensuite).
  - **Migration unique `V1__init.sql`** (fusion V1→V10 livrée 2026-05-17) crée les 11 tables dans l'ordre des FK, dont `app_user` (id, email UNIQUE, display_name, provider, provider_id, role CHECK ADMIN|USER, created_at, last_login_at) en racine du graphe multi-tenant. `portfolio` et `watchlist_entry` portent une FK `user_id NOT NULL ON DELETE CASCADE` vers `app_user(id)` + UNIQUE `(user_id, symbol)` sur watchlist. `baseline-on-migrate: true` + `baseline-version: 0` dans `application.yml` — sur DB greenfield, baseline à V0 puis V1 appliqué normalement.
  - **Auth mode toggle** : `BACKEND_AUTH_MODE=no-auth|oauth` dans `.env` (lu **à l'exécution** dans le `serve_cmd` shell du Tiltfile, pas au parse Starlark) + 2 boutons Tilt « Mode → … » sur la ressource `backend` qui flippent la valeur et touchent `application.yml` pour redémarrer en mode opposé.
  - **Secrets** : tous les secrets (`SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_*`, `APP_ADMIN_EMAILS`, `APP_FRONTEND_URL`) sont dans `.env` (gitignored) et **sourced** par le serve_cmd Tilt — exportés au sous-process gradle, lus par Spring via relaxed binding. `application-local.yml` est volontairement vide de credentials. En prod, même pattern (env vars injectées par le secret manager du provider).
- `market/` — `MarketChartClient` port (returns domain `MarketChart` = `TickerQuote` + `List<OhlcBar>`) with two adapters selected by `market.provider` : `TwelveDataClient` (REST + apikey, default prod) and `MockMarketChartClient` (deterministic synthetic data, default without key). Two HTTP endpoints : `GET /{symbol}` (full dossier, 1Y daily) and `GET /{symbol}/chart?timeframe=` (bars only, multi-timeframe toggle). `IndicatorCalculator` is Kotlin pur, sans Spring : RSI, MA50/MA200, momentum, drawdown.
- `analysis/` — Phase 1 ticker narrative pipeline (`TickerNarrativeService`, `TickerNarrativeRunner`, `TickerNarrativeParser`, `TickerNarrativeValidator`). LLM dispatch lives in `infrastructure/llm/` : `LlmClient` port with three adapters — `ClaudeClient` (Phase 1 default), `OllamaClient`, and `MockLlmClient` (`llm.provider: mock`, deterministic JSON narrative per symbol for keyless onboarding / CI smoke tests — completes parity with `MockNewsClient` / `MockMarketChartClient` / `MockAnalystClient` / `MockEarningsClient`) — all always instantiated (no `@ConditionalOnProperty`), and `RoutingLlmClient` (`@Primary`) routes per-call based on `appConfig.getString(llm.provider)`. Model name (`anthropic.api.model` / `ollama.model`) is also read per-call so a runtime switch in `/settings/configuration` lands without a reboot. Boot-time `OrphanedJobCleanupListener` flips dangling `PENDING` rows in `ticker_narrative_job` to `ERROR` so a hot-reload mid-LLM doesn't leave the frontend SSE waiting indefinitely. Per-phase progress is broadcast via `JobEventPublisher` (in-memory pub/sub with replay-on-reconnect) on `GET /jobs/{id}/stream` (`text/event-stream`) so the dossier ticker can show "Calling LLM (38s)…" instead of a muted spinner. **Prompt management (Phase 3, livré 2026-05-10)** lives here too : `TickerNarrativePromptService` reads the active row from `prompt_template` (V8, one `is_active = TRUE` per `name` via partial unique index) with a 1-min `@Cacheable` + hardcoded fallback on the `NARRATIVE_SYSTEM_PROMPT` constant if the DB is empty. `PromptScoreRecorder` persists a `prompt_score` row (`latency_ms`, `retry_count`, `parse_failed`, `validator_failed`, `user_thumbs`, `llm_judge_score?`) on every executor run, success or definitive failure. Endpoints `/api/prompts` (list/get/create/activate/stats) and `PATCH /api/narrative/snapshots/{id}/thumbs` (idempotent feedback `{value: -1|0|1}`) back the `/settings/prompts` UI. **Narrative observability (Phase 3 #1, livré 2026-05-13)** also lives here : `NarrativeObservabilityQuery` (native SQL with LEFT JOIN on `prompt_template` + LATERAL on `prompt_score` for per-snapshot thumbs) and `NarrativeObservabilityService` (one `MarketChartClient.fetchChart` per request, computes 1d/1w/1m deltas vs `snapshot.price` with at-or-after bar lookup, graceful degradation on `UpstreamUnavailableException`). Endpoints `GET /api/narrative/observability/tickers` (index of symbols with ≥1 snapshot) and `GET /api/narrative/observability/{symbol}?from=&to=&promptId=` (per-symbol timeline). Thumbs filter is client-side on purpose — the timeline caps at 500 rows so the asymmetry (server-side date/prompt vs client-side thumbs) avoids a re-fetch on every chip click. **Coherence score (Phase 3 #2, livré 2026-05-14)** stacks on top : `CoherenceScorer` (pure function, no LLM call) compares each row to the chronologically-previous one and produces a `CoherenceScore { verdict ∈ {OK, WARN, HIGH}, sentimentChange ∈ {SAME, PARTIAL, FLIPPED}, keyPointsJaccard, summaryLengthRatio, priceMoveBetween }`. Weighted divergence (sentiment 0.55 / key_points 0.30 / length 0.15) discounted by the price move between the two snapshots (a 5 % swing fully excuses a sentiment flip). Threshold-based verdict surfaced as a colored chip on each timeline card via the optional `coherence` field on `NarrativeObservationDto` ; oldest row in the timeline has `coherence = null`. **Bias dashboard (Phase 3 #3, livré 2026-05-14)** aggregates the corpus across symbols : `NarrativeBiasQuery` (3 native SQL round-trips — sentiment counts, thumbs by sentiment via LATERAL on latest `prompt_score`, raw snapshot rows capped 2 000) + `NarrativeBiasService` (computes 4 sections : sentiment distribution with bias flag at 60 %, calibration of sentiment vs avg delta1d/1w/1m fetched once per unique symbol with graceful degradation, topic coverage via regex `[a-z][a-z0-9]*` + ~80 stopwords + count-by-snapshot-not-by-occurrence, thumbs distribution by sentiment). Endpoint `GET /api/narrative/observability/bias?from=&to=&promptId=` declared **before** `/{symbol}` for routing precedence. Backs the page `/observability/bias` reachable from the index.
- `portfolio/` — read-only portfolios, Wealthsimple CSV import, historical snapshots
- `watchlist/` — Phase 2 manual watchlist (single-table, no user_id). `WatchlistService` with uppercase+trim normalisation, idempotent add (POST returns existing on duplicate), non-idempotent remove (404 if absent so the optimistic UI can detect drift).
- `news/` — Phase 2 per-ticker headlines. Port `NewsClient` with two adapters selected by `news.provider` : `FinnhubClient` (`finnhub`, REST + apikey via `market.finnhub.api-key`, 30-day rolling window on `/company-news`) and `MockNewsClient` (`mock`, default without key — deterministic synthetic feed per symbol, ~10 % quiet symbols and ~25 % null-summary items to exercise the UI's empty / null-handling paths). Cache 15 min on `(symbol, limit)`. Errors raise `UpstreamUnavailableException` (lives in `shared/`) for unified 503 surface across all external providers.
- `analyst/` — Phase 2 per-ticker analyst recommendations (Fondamentaux panel). Port `AnalystRecommendationClient` with two adapters selected by `analyst.provider` : `FinnhubAnalystClient` (`finnhub`, REST + apikey via `market.finnhub.api-key`, hits `/stock/recommendation` required + `/stock/price-target` optional — fail-soft to `null` on 401/403/5xx because the price-target endpoint sits behind a paid tier on some accounts) and `MockAnalystClient` (`mock`, default — deterministic synthetic per symbol, reserved symbols `UNKNOWN` / `RATELIMIT` / `NOTARGET`). `RoutingAnalystClient` (`@Primary`) routes per call. Cache 15 min on `symbol` via `AnalystRecommendationService`. Endpoint `GET /api/market/ticker/{symbol}/analyst-recommendations`. Errors raise `UpstreamUnavailableException` (lives in `shared/`) for unified 503.
- `earnings/` — Phase 2 per-ticker earnings (Fondamentaux panel, 2nd sub-block under analyst). Port `EarningsClient` with two adapters selected by `earnings.provider` : `FinnhubEarningsClient` (`finnhub`, REST + apikey via `market.finnhub.api-key`, hits `/stock/earnings` required for the last 4 quarters + `/calendar/earnings` optional for the next date — fail-soft to `null` on 401/403/5xx because the calendar endpoint sits behind a paid tier on some accounts ; 90-day forward window) and `MockEarningsClient` (`mock`, default — deterministic synthetic per symbol with EPS in $0.30–$3.50 band and surprise ±15 %, reserved symbols `UNKNOWN` / `RATELIMIT` / `NOCALENDAR`). `RoutingEarningsClient` (`@Primary`) routes per call. Cache 15 min on `symbol` via `EarningsService`. Endpoint `GET /api/market/ticker/{symbol}/earnings`. Domain helper `computeSurprisePercent` handles null + zero estimate + negative estimate via `abs()`. Errors raise `UpstreamUnavailableException` (lives in `shared/`) for unified 503.
- `config/` — Phase 2 runtime-editable settings. `AppConfigService` (layered read YAML + BDD overrides via `app_config` table V4, write-through with `ConfigChangedEvent`), `ConfigController` (CRUD + `/test/{provider}` endpoints for `twelvedata` / `finnhub`, `/test/llm` for the LLM probe), `RoutingMarketChartClient` / `RoutingNewsClient` / `RoutingAnalystClient` / `RoutingEarningsClient` / `RoutingLlmClient` (all `@Primary`, the LLM router living in `analysis/infrastructure/llm/`) which delegate per-call to the adapter selected by `market.provider` / `news.provider` / `analyst.provider` / `earnings.provider` / `llm.provider` — provider switch hits at the next dossier opened, no reboot. `CacheTtlListener` rebuilds the Caffeine spec on TTL change events.
- `shared/` — cross-cutting utilities (e.g. `GlobalExceptionHandler`, `UpstreamUnavailableException` shared across all external providers)

> The LLM never computes indicators — they live in `IndicatorCalculator` (pure Kotlin, unit-tested). The LLM only produces the narrative summary from already-computed values.

## Frontend modules

Light hexagonal split under `frontend/src/app/` :

- `core/` — cross-feature data access split sur **3 axes** : (1) `core/api/<bucket>/` pour les bounded contexts HTTP qui miroitent les modules backend, (2) `core/local/<bucket>/` pour les bounded contexts persistés navigateur (localStorage), (3) `core/app-state/` pour les services UI signal cross-cutting (pas de split port/adapter). `core/providers.ts` reste à la racine et wire chaque bucket.
  - **`core/api/`** — chaque bucket contient son port (`<name>.repository.ts` = abstract class) + ses adapters dans `<bucket>/adapters/<name>.http.ts` (`HttpXxxRepository`) + ses services bucket-locaux à la racine du bucket. Buckets : **`market/`**, **`portfolio/`** (Portfolio + Snapshot — snapshot = portfolio history), **`watchlist/`**, **`news/`**, **`analyst/`**, **`earnings/`**, **`config/`**, **`analysis/`** (Phase 3 narrative pipeline + LLM infra — `prompt.repository`, `narrative-feedback.repository`, `narrative-observability.repository`, `narrative-bias.repository`, `ollama-status.repository` + `ollama-status.service` polling, `job-stream.service` SSE wrapper Phase 2.5, `llm-timeout.service` signal primé via `provideAppInitializer`), **`auth/`** (Phase 4 — `auth.repository` port avec `getCurrentUser()` → `/api/me` et `logout()` → `POST /logout` + adapter `HttpAuthRepository`).
  - **`core/local/`** — même forme port + `adapters/` mais l'adapter est `*.local.ts` (localStorage). Seul habitant aujourd'hui : `annotation/` (h-line annotations du chart sur le dossier ticker, persistées par symbol).
  - **`core/app-state/`** — `theme.service.ts` + `language.service.ts` (signal + persist localStorage, parallel shape) + **`auth.service.ts`** (Phase 4 — signal `currentUser` + computeds `isAuthenticated` / `isAdmin`, primé au boot via `provideAppInitializer(() => inject(AuthService).refresh())`, swallow 401 + non-401 errors et expose `lastError` signal pour /error page + `clearError()` ; `logout()` POST `/logout` + nullifie pessimistiquement le signal ; `clear()` sync utilisé par l'interceptor). Pas de port/adapter — ce sont des services concrets sans counterpart distant.
  - **`core/http/auth.interceptor.ts`** (Phase 4) — `HttpInterceptorFn` qui catch les erreurs `/api/**` : 401 → `clear()` + redirect `/login`. **Les 5xx ne sont pas interceptés** — les composants gèrent leurs erreurs en local (fail-soft, banners inline), `/error` reste atteignable par navigation manuelle. Skip explicitement `/api/me` (déjà géré par `AuthService.refresh`) et `/api/config` (admin-only — un USER non-ADMIN reçoit 403 sur cet endpoint, et `LlmTimeoutService.refresh` peut le hitter au boot avant la résolution OAuth).
  - **`core/router/auth.guards.ts`** (Phase 4) — `authGuard` (CanActivateFn → redirect `/login` si non authentifié) + `adminGuard` (CanActivateFn → redirect `/dashboard` si pas ADMIN, défense en profondeur sur les routes settings/observability).
- `features/` — UI feature folders (one per top-level route, *primary adapters* en vocabulaire hexagonal) :
  - `login/` — Phase 4 — page `/login` standalone (toolbar masquée via `isStandaloneRoute` côté `App` component). Carte centrée avec bouton « Se connecter avec Google » qui set `window.location.href = '/oauth2/authorization/google'` (déclenche le redirect dance Spring Security). `effect()` qui redirige automatiquement vers `/dashboard` si `auth.isAuthenticated()` est déjà true (cas bookmark `/login` ou navigation Back post-login).
  - `error/` — Phase 4 — page `/error` standalone (toolbar masquée idem `/login`). Surface manuelle pour les états bloqués (session authentifiée mais user manquant en BDD, erreur HTTP propagée depuis un composant). Lit `auth.lastError` signal pour afficher le détail (status + URL + message). Deux actions : « Se déconnecter et réessayer » (POST `/logout` puis `/login`) et « Retour à la connexion » (navigate direct + `auth.clearError()`).
  - `dashboard/` — portfolio view (read-only positions) + sidebar with 3 collapsible sections (Portefeuilles / Tickers détenus / Watchlist) + link to ticker dossiers
  - `ticker/` — per-symbol dossier with a 2-col layout : left foldable **chart-tools sidenav** (Amazon-style filter panel, sticky, persisted localStorage) holding timeframe / benchmark / overlays / tools (annotation arm, clear anchor, reset zoom) / annotations-posées list with delete-per-item ; right column with price chart + multi-timeframe toggle + axes + hover crosshair, **chart analyse interactive** (zoom drag-select, brush mini-chart navigator, multi-select overlays MA50 / MA200 / Bollinger / 52w hi-lo, h-line annotations persisted to localStorage by symbol, measure tools delta % + delta time), benchmark overlay (SPY/QQQ/IWM/Sector/Custom — the Sector toggle is hidden when `quote.instrumentType !== 'STOCK'`, same gating drives the Fondamentaux section and skips the analyst+earnings fetches), indicators chips, watchlist toggle button, **Fondamentaux** section (only rendered for stocks) with analyst recommendations sub-block (consensus chip, segmented breakdown bar, price target, trend arrow) + earnings sub-block (next-date countdown with BMO/AMC tag, last 4 quarters EPS estimate vs actual + surprise %), LLM narrative
  - `import/` — Wealthsimple CSV drag-and-drop page
  - `suivi/` — import history (snapshots by date, market values, P&L)
  - `settings/` — back-office avec sidenav : `configuration/` (config runtime — sub-sidenav interne « Providers de données » / « LLM », signal `activeSection` persistée localStorage `runtime-config-section`), `prompts/` (Phase 3 — liste reverse-chronological des versions du prompt `narrative-default` avec bouton activer + éditeur inline textarea + diff side-by-side ligne-à-ligne pour proposer une nouvelle version), `prompts/:id/stats` (Phase 3 — stats agrégées par prompt sur 30 jours : sparkline latence p50 + tableau quotidien runs / latence p50-p95 / taux retry / taux parse-validator failed / distribution thumbs)
  - `observability/` — Phase 3 #1 (livré 2026-05-13) + #2 + #3 (livrés 2026-05-14) : `index/` rend `/observability` (liste des symbols ayant ≥1 snapshot avec compteur + lien vers chaque per-symbol page + chip vers le bias dashboard) ; `/observability/:symbol` rend la timeline reverse-chronologique de cartes expandables (date + sentiment + prompt chip + thumbs + 3 deltas colorisés 1d/1w/1m + **chip cohérence vs précédent OK/WARN/HIGH** avec tooltip natif 5 lignes) avec filter bar (date range + prompt dropdown + chips thumbs client-side + reset) ; `bias/` rend `/observability/bias` avec 4 sections cards agrégées corpus-wide (sentiment bars horizontales avec chip biais suspecté à 60 %, calibration table sentiment × delta1d/1w/1m, topic pills monospace top-15, thumbs stacked bars cross-sentiment scaling). Entrée navbar « Observabilité » ajoutée après Dashboard ; lien depuis le footer de la card narrative du dossier ticker (icône `history`).

## Local Development

Full stack runs via Tilt + Docker Compose. See `docs/technique/developpement.md` for the full guide.

```bash
# Start everything: PostgreSQL, Ollama, backend, frontend
tilt up
```

Tilt UI: http://localhost:10350/

The backend boots with the `local` profile (`application-local.yml`, gitignored).

## Frontend Commands

All commands run from `frontend/`. Single Angular app, no monorepo.

```bash
npm run start    # dev server
npm run build    # build
npm run test     # tests (Vitest)
npm run lint     # ESLint (flat config, Angular ESLint 21)
npm run format   # Prettier
```

To run a single test file with Vitest directly:

```bash
cd frontend
npx vitest run src/path/to/file.spec.ts
```

## Backend Commands

Run from `backend/`. Spring Boot + Kotlin DSL Gradle.

```bash
./gradlew bootRun        # start API locally
./gradlew test           # run tests
./gradlew spotlessApply  # ktfmt (Google style)
```

## Conventions

- Idiomatic Kotlin (data classes, sealed classes, extension functions)
- **No wildcard imports in Kotlin** — always write explicit imports (`import org.junit.jupiter.api.Assertions.assertEquals`, not `import org.junit.jupiter.api.Assertions.*`). IntelliJ's "Optimize Imports" defaults to consolidating into `*` past 5 imports of the same package — that default is wrong for this project. When writing or editing a Kotlin file, list each import on its own line. The whitelist in `backend/config/detekt/detekt.yml` (`WildcardImport.excludeImports`) covers a few historical idioms (`java.util.*`, JUnit `Assertions.*`, MockMvc helpers) but is being phased out — don't add new entries, expand any wildcard you touch into explicit imports.
- Spring Boot config in **YAML** (`application.yml` / `application-local.yml`)
- Angular standalone components (Angular 21)
- **Zoneless change detection** explicit — `provideZonelessChangeDetection()` in `app.config.ts`, no `zone.js` dependency. State is signal-based ; Default change detection strategy is fine, no need to add `OnPush` everywhere.
- **i18n via `ngx-translate`** — translation files in `frontend/public/i18n/<lang>.json` (FR + EN). Components import the `TranslatePipe` (not `TranslateModule`) ; templates use `'key' | translate`. Dynamic strings (errors set in TS) go through `TranslateService.instant('key', { params })`. Active locale lives in `LanguageService` (signal). **Never hard-code a user-facing string** — always pass through a translation key.
- Angular Material for all UI components
- **ESLint flat config** (`frontend/eslint.config.js`, Angular ESLint 21) is the static analysis ; Prettier remains the only formatter (`eslint-config-prettier` applied last to disable overlapping rules). `npm run lint` runs in CI before the build, blocking on errors. Don't introduce `recommended-type-checked` casually — 5-10× slower, deserves a dedicated session
- Integration tests on real PostgreSQL (no DB mocks)
- Frontend tested with **Vitest** (not Karma, not Jest). Test specs that boot a component with templates using `translate` need `provideTranslateService({ lang: 'en' })` in their TestBed providers — without translations loaded, `instant('foo.bar')` returns the key as fallback (acceptable for assertions).
- `@Async` Spring: always on a separate bean — never `this.asyncMethod()` (bypasses AOP)
- LLM provider: **Claude API is the Phase 1 default** (`llm.provider: claude`). Ollama + `qwen2.5:3b` (3B Instruct) is kept as an offline backup — rapid (~5-10 s on M1) and reliable on JSON output, weaker narratives than Claude but usable. Mistral 7B was the original local default but too slow on M1 (30-60 s/narrative → timeouts). LLM timeouts (frontend abort + dedup window + `OllamaClient` HTTP read) are unified under the runtime key `llm.timeout-seconds` (default **400 s**, slider 60..900 in `/settings/configuration > LLM`). The frontend reads it via `LlmTimeoutService` (primed at boot via `provideAppInitializer`).
- Commits in **English**, Conventional Commits — see `docs/projet/commit-conventions.md`
- Commit message proposals are always in **English**
- Never commit API keys. `application-local.yml` is gitignored
- `docs/data-input/` contains **fake** sample CSVs (versioned, used for smoke tests / demo / CI). Real Wealthsimple exports go in `docs/data-input-local/` which is gitignored — never move real exports into `data-input/`
- **Never log user emails** — always log the `User.id` UUID. The email is PII ; in prod logs (and especially log aggregators that may retain longer than the DB), the UUID is enough to correlate with `app_user` via SQL. Same rule for any other PII (display_name, provider_id). When adding a log statement in the auth path (`CustomOAuth2UserService`, `CustomOidcUserService`, `LocalNoAuthFilter`, `AuthService`) or downstream services that capture user context (`CsvImportService` etc.), include `userId={}` with the UUID, not `email={}`. The existing `OAuth login (...) — id=… provider=…` pattern in `CustomOAuth2UserService.findOrCreateUser` is the reference.

## Instructions for Claude

### Fichiers que l'utilisateur veut te montrer

Le dossier **`docs/tmp-files/`** (gitignored) est l'endroit où l'utilisateur dépose les fichiers qu'il veut te montrer dans une conversation : captures d'écran d'un bug ou d'une UI, sortie de console tronquée, brouillon collé, image de référence, etc. Quand l'utilisateur dit « regarde le screenshot » / « j'ai mis le fichier dans tmp-files », c'est là qu'il faut chercher (`Read` direct ou `ls docs/tmp-files/`). Le contenu est éphémère et jetable — ne le commit jamais, ne le lis pas spontanément si l'utilisateur ne l'évoque pas, et n'écris jamais dedans.

### Builds and tests

Builds (`./gradlew`, `npm run build`) and tests (`./gradlew test`, `npm run test`) can be run when it helps tighten a feedback loop — e.g. validating a refactor, debugging a runtime error, confirming a fix. Use Tilt logs (UI on http://localhost:10350/, or `docker compose logs backend`) to inspect the running stack rather than re-running the whole build. CI is still authoritative for the full matrix.

### Git

The `master` branch is protected. The user manages git themselves (staging, committing, branching, pushing, opening PRs). **Default behavior : never run `git add`, `git commit`, `git push`, `git branch`, `git tag`, `git rebase`, or `gh pr` / `gh issue` write operations** — suggest, don't execute. When asked for a commit, **propose a Conventional Commits message in English** as a one-liner the user can paste, but do not stage and do not commit.

The narrow exception : the user explicitly asks you in the current turn to actually run the command ("commit ça", "fais le push", "create the PR"…). These cases are rare and stay narrow — do exactly what was asked, nothing extra. **Authorization granted in one turn does not carry forward** to later turns ; treat each new request fresh.

**Commit messages are one line, no body.** When asked for a commit name, output the single subject line in Conventional Commits format and stop. Don't follow up with a body, bullet list, or rationale block — the user pastes the line as-is. Keep the subject under ~72 characters. If the change really needs a body, raise that with the user instead of writing one preemptively.

### Tests as documentation

The user reads tests as the spec of the code under test. A test file should feel like a narrative — open it, read top to bottom, walk away understanding what the code does and why each scenario matters. Apply this when writing or modifying tests.

Concretely :

- **Class-level docstring** — one short paragraph naming the area under test, the failure modes the tests protect against, and the design intent (e.g. "parser must tolerate prose padding from local models, but reject malformed structure so the executor's retry loop has a precise error to feed back"). Skip only when the class has a single trivial test.
- **Test names are full sentences** (Kotlin backtick names, Vitest `it('…')` strings). Describe the *behavior*, not the mechanic : `rejects unknown sentiment` ✓, `test parser 5` ✗. Mirror real-world phrasing : `tolerates prose around the JSON object` reads like a spec line.
- **Inline comments** when the *why* is non-obvious : a real failure we observed, an edge case that surprised us, a regression we don't want to repeat. Comments explain motivation, not mechanics — `// Mistral 7B sometimes pads with "Sure! Here is..."` beats `// parses string`.
- **Setup factories with sensible defaults** (`parsed()`, `quote()`, `indicators()`) — each test then overrides only the field that matters, so the diff between scenarios is visible at a glance.
- **One scenario per test**, but multiple assertions are fine when they all describe the same scenario. `parses a clean JSON object` legitimately asserts `summary`, `sentiment` and `keyPoints` together.
- **Realistic fixtures over synthetic ones** when the cost is similar. `"Price above MA200, RSI 62"` reads better than `"x"`. The reader should recognize the domain even in a unit test.

### Portfolio philosophy

The portfolio is **read-only** in the UI — it mirrors the broker's reality. The only way to feed data is the Wealthsimple CSV import. No manual portfolio creation, no asset add/remove.

### Backlog

Feature tracking is split across two files :

- **`docs/projet/backlog.md`** — only what's still open : `⏳ À faire`, `🚧 En cours`, `🧊 Gelé`, `❌ Décommissionné`, plus the **Dette technique** section. Lookup-friendly: a planning session opens this file and reads only what's left.
- **`docs/projet/journal-livraisons.md`** — the historical record of shipped features (`✅`), grouped by phase, reverse-chronological within each phase. Detailed implementation notes live here so the backlog stays scannable.

**After implementing a feature** :

1. Add the new entry to `journal-livraisons.md` under the right phase section, at the **top** of that phase (most recent first). Include a `Livré YYYY-MM-DD` lead so the chronology is unambiguous when entries pile up.
2. Remove the corresponding `⏳` row from `backlog.md` (or, if the ticket only became ✅ partially, narrow its description to what remains).
3. Don't write the same content in both files — backlog only points to the journal when needed (e.g. closed phase headers).

**Ordering convention** — whenever you modify `backlog.md`, take the opportunity to reorder the affected list (the section you just touched, not the whole file) so the reading flow goes from "what to attack next" to "less urgent" :

1. **⏳ À faire — sorted by priority descending** : 🔴 Critique on top, then 🟡 Moyenne, then 🟢 Basse. Within the same priority, ordering is free (recent items can stay near the top).
2. **🚧 En cours** (rare) : right after the last 🔴 if any.

This applies per-section (Phase 2.5, Phase 3, Phase 4, Phase 5, Phase 6, Dette technique…). Don't shuffle entries you didn't touch — reorder only the section you're editing in the same pass.

### Documentation

Files under `docs/` describe the actual state of the project. Keep them in sync as the code evolves:

| File                              | Update when…                                                              |
| --------------------------------- | ------------------------------------------------------------------------- |
| `docs/metier/vision.md`           | The product framing or the LLM's role in the app changes                  |
| `docs/metier/fonctionnalites.md`  | A feature changes status, or a phase advances                             |
| `docs/technique/architecture.md`  | A new module, an important technical decision, or a new pattern is added |
| `docs/technique/developpement.md` | Local config changes, a Tilt command is added                             |
| `docs/technique/developper.md`    | Newcomer onboarding flow changes (new prerequisite, install step, common failure mode worth flagging) |
| `docs/projet/sources.md`          | A data source is added or removed                                         |
| `docs/projet/backlog.md`          | Holds **only** ⏳/🚧/❌/🧊 + Dette technique. A new ticket is filed, a priority shifts, or a feature is frozen/decommissioned. When a ✅ entry would normally be added, write it in `journal-livraisons.md` instead and leave only a pointer (or nothing) in the backlog. |
| `docs/projet/journal-livraisons.md` | A feature is **shipped** (the ✅ entry that used to live in `backlog.md`). Reverse-chronological by phase. Detailed implementation notes live here ; the backlog stays scannable. |
| `docs/projet/audits/`             | A code review is performed — archive the full report as `YYYY-MM-DD-titre-court.md` and append a line to `audits/index.md`. Don't auto-promote findings to the backlog ; the user decides which become actions. |
| `docs/CHANGELOG.md`               | At the **end of every `/doc-maintainer` patch session**, append/extend a dated entry summarising the doc files modified and why. See `.claude/skills/doc-maintainer/SKILL.md` for the format and the per-area grouping. The doc-maintainer subagent itself stays read-only ; the main thread writes the entry. |

### Technical decisions

Whenever a technical decision is made (lib choice, dropped approach, architectural bug fix), record it in `docs/technique/architecture.md` under "Décisions techniques notables". This file is the memory of the *why*, not just the *what*.

## Skills and hooks (this folder)

| Path                                         | Purpose                                            |
| -------------------------------------------- | -------------------------------------------------- |
| `skills/angular-component/`                  | Standalone components, signal I/O, host bindings   |
| `skills/angular-di/`                         | `inject()`, providers, injection tokens            |
| `skills/angular-signals/`                    | `signal`, `computed`, `linkedSignal`, RxJS interop |
| `skills/angular-testing/`                    | Vitest + TestBed patterns                          |
| `skills/code-review/`                        | `/code-review` — spawns `agents/code-reviewer.md` for read-only pre-commit review (diff vs `master` or uncommitted) |
| `skills/code-review-excellence/`             | PR review process and checklists                   |
| `skills/doc-maintainer/`                     | `/doc-maintainer` — spawns `agents/doc-maintainer.md` for read-only doc-set audit (factual drift, tone, cross-links) |
| `skills/folders-structure-backend/`          | Backend folder conventions (Kotlin + Spring)       |
| `skills/folders-structure-frontend/`         | Frontend folder conventions for this app           |
| `skills/git-commit/`                         | Conventional Commits workflow                      |
| `skills/github-create-pull-request/`         | `gh pr create` workflow                            |
| `skills/hexagonal-ddd/`                      | Port/adapter, routing, fail-soft, cache placement  |
| `skills/kotlin-idioms/`                      | Project-opinionated Kotlin conventions             |
| `skills/spring-boot/`                        | Spring Boot conventions (AOP proxies, cache, tx)   |
| `instructions/frontend/best-practices.md`    | TypeScript / Angular best practices                |
| `hooks/post-tool-call.py`                    | Provenance hook for file modifications             |
