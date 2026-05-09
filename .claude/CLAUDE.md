# CLAUDE.md

Source of truth for project conventions and Claude-specific configuration. Read this first when working on PortfolioAI.

## Project

Per-ticker market intelligence app. For each ticker (held in the user's portfolio or watched), the backend fetches market data from Twelve Data, computes technical indicators server-side (RSI, MA, momentum, drawdown…), and the LLM produces a short narrative summary. **The LLM is a writer, not a decider** — it does not predict prices and does not output BUY/SELL signals; it digests indicators that the code computed and writes a short readable summary.

**Architecture cible — pipeline d'analyse composable** : the per-ticker dossier is the **atomic unit** of computation. Portfolio-level analyses (and future watchlist digests, cross-position alerts, etc.) are **compositions** built on top — a DAG of jobs where the leaves are `TickerAnalysis(symbol, day)` (cache-aware via `ticker_narrative_snapshot`) and parents are aggregators (`PortfolioAggregation`, …) that consume already-persisted leaf narratives instead of re-prompting on raw indicators. The cache makes portfolio analyses cheap (~M LLM calls where M = uncached tickers, often 0). Visible to the user as a GitHub-Actions-style pipeline view. Vision details in `docs/metier/vision.md > Le pipeline d'analyse` ; technical model in `docs/technique/architecture.md > Modèle pipeline d'analyse`.

> Phase 0 (rebalance recommendations from RSS news + portfolio-wide LLM prompt) was **decommissioned** in Phase 2.5 — the RSS ingestion module, the legacy portfolio-analysis pipeline, and the underlying tables (`feed_article`, `feed_source`, `recommendation*`, `analysis_job`) were removed. The replacement is the arrival of `PortfolioAggregation` as a parent job over the existing per-ticker infrastructure (cf. backlog Phase 4 « Réintégration Phase 0 »). See `docs/metier/fonctionnalites.md` for the full phasing.

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
│       ├── core/            # ports + adapters (HTTP default, localStorage for client-only state)
│       │   ├── *.repository.ts        # abstract class = port
│       │   ├── adapters/*.http.ts     # HttpXxxRepository (default)
│       │   └── adapters/*.local.ts    # client-only adapters (e.g. annotation localStorage)
│       └── features/        # UI pages (primary adapters)
├── backend/                 # Kotlin + Spring Boot
│   └── src/main/kotlin/com/portfolioai/
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

- `market/` — `MarketChartClient` port (returns domain `MarketChart` = `TickerQuote` + `List<OhlcBar>`) with two adapters selected by `market.provider` : `TwelveDataClient` (REST + apikey, default prod) and `MockMarketChartClient` (deterministic synthetic data, default without key). Two HTTP endpoints : `GET /{symbol}` (full dossier, 1Y daily) and `GET /{symbol}/chart?timeframe=` (bars only, multi-timeframe toggle). `IndicatorCalculator` is Kotlin pur, sans Spring : RSI, MA50/MA200, momentum, drawdown.
- `analysis/` — Phase 1 ticker narrative pipeline (`TickerNarrativeService`, `TickerNarrativeRunner`, `TickerNarrativeParser`, `TickerNarrativeValidator`). LLM dispatch lives in `infrastructure/llm/` : `LlmClient` port with `ClaudeClient` and `OllamaClient` adapters, both always instantiated (no `@ConditionalOnProperty`), and `RoutingLlmClient` (`@Primary`) routes per-call based on `appConfig.getString(llm.provider)`. Model name (`anthropic.api.model` / `ollama.model`) is also read per-call so a runtime switch in `/settings/configuration` lands without a reboot. Boot-time `OrphanedJobCleanupListener` flips dangling `PENDING` rows in `ticker_narrative_job` to `ERROR` so a hot-reload mid-LLM doesn't leave the frontend SSE waiting indefinitely. Per-phase progress is broadcast via `JobEventPublisher` (in-memory pub/sub with replay-on-reconnect) on `GET /jobs/{id}/stream` (`text/event-stream`) so the dossier ticker can show "Calling LLM (38s)…" instead of a muted spinner.
- `portfolio/` — read-only portfolios, Wealthsimple CSV import, historical snapshots
- `watchlist/` — Phase 2 manual watchlist (single-table, no user_id). `WatchlistService` with uppercase+trim normalisation, idempotent add (POST returns existing on duplicate), non-idempotent remove (404 if absent so the optimistic UI can detect drift).
- `news/` — Phase 2 per-ticker headlines. Port `NewsClient` with two adapters selected by `news.provider` : `FinnhubClient` (`finnhub`, REST + apikey via `market.finnhub.api-key`, 30-day rolling window on `/company-news`) and `MockNewsClient` (`mock`, default without key — deterministic synthetic feed per symbol, ~10 % quiet symbols and ~25 % null-summary items to exercise the UI's empty / null-handling paths). Cache 15 min on `(symbol, limit)`. Errors share `MarketUnavailableException` with the market adapter for unified 503 surface.
- `analyst/` — Phase 2 per-ticker analyst recommendations (Fondamentaux panel). Port `AnalystRecommendationClient` with two adapters selected by `analyst.provider` : `FinnhubAnalystClient` (`finnhub`, REST + apikey via `market.finnhub.api-key`, hits `/stock/recommendation` required + `/stock/price-target` optional — fail-soft to `null` on 401/403/5xx because the price-target endpoint sits behind a paid tier on some accounts) and `MockAnalystClient` (`mock`, default — deterministic synthetic per symbol, reserved symbols `UNKNOWN` / `RATELIMIT` / `NOTARGET`). `RoutingAnalystClient` (`@Primary`) routes per call. Cache 15 min on `symbol` via `AnalystRecommendationService`. Endpoint `GET /api/market/ticker/{symbol}/analyst-recommendations`. Errors share `MarketUnavailableException` for unified 503.
- `earnings/` — Phase 2 per-ticker earnings (Fondamentaux panel, 2nd sub-block under analyst). Port `EarningsClient` with two adapters selected by `earnings.provider` : `FinnhubEarningsClient` (`finnhub`, REST + apikey via `market.finnhub.api-key`, hits `/stock/earnings` required for the last 4 quarters + `/calendar/earnings` optional for the next date — fail-soft to `null` on 401/403/5xx because the calendar endpoint sits behind a paid tier on some accounts ; 90-day forward window) and `MockEarningsClient` (`mock`, default — deterministic synthetic per symbol with EPS in $0.30–$3.50 band and surprise ±15 %, reserved symbols `UNKNOWN` / `RATELIMIT` / `NOCALENDAR`). `RoutingEarningsClient` (`@Primary`) routes per call. Cache 15 min on `symbol` via `EarningsService`. Endpoint `GET /api/market/ticker/{symbol}/earnings`. Domain helper `computeSurprisePercent` handles null + zero estimate + negative estimate via `abs()`. Errors share `MarketUnavailableException` for unified 503.
- `config/` — Phase 2 runtime-editable settings. `AppConfigService` (layered read YAML + BDD overrides via `app_config` table V4, write-through with `ConfigChangedEvent`), `ConfigController` (CRUD + `/test/{provider}` endpoints for `twelvedata` / `finnhub`, `/test/llm` for the LLM probe), `RoutingMarketChartClient` / `RoutingNewsClient` / `RoutingAnalystClient` / `RoutingEarningsClient` / `RoutingLlmClient` (all `@Primary`, the LLM router living in `analysis/infrastructure/llm/`) which delegate per-call to the adapter selected by `market.provider` / `news.provider` / `analyst.provider` / `earnings.provider` / `llm.provider` — provider switch hits at the next dossier opened, no reboot. `CacheTtlListener` rebuilds the Caffeine spec on TTL change events.
- `shared/` — cross-cutting utilities (e.g. `GlobalExceptionHandler`)

> The LLM never computes indicators — they live in `IndicatorCalculator` (pure Kotlin, unit-tested). The LLM only produces the narrative summary from already-computed values.

## Frontend modules

Light hexagonal split under `frontend/src/app/` :

- `core/` — cross-feature data access split into ports + adapters : `<name>.repository.ts` (abstract class) + `adapters/<name>.http.ts` (`HttpXxxRepository`, default) or `adapters/<name>.local.ts` (client-only, e.g. `LocalStorageAnnotationRepository`). Wired in `core/providers.ts` via `provideRepositories()`, called from `app.config.ts`. Currently 10 repositories : Portfolio, Snapshot, Market, Watchlist, News, Config, Annotation, Analyst, Earnings, OllamaStatus. Plus `JobStreamService` (Phase 2.5 — wraps `EventSource` on `/api/market/ticker/{symbol}/narrative/jobs/{id}/stream`, exposes an `Observable<JobEvent>` that completes on terminal phase) and `LlmTimeoutService` (signal-based, primed from `/api/config` at boot via `provideAppInitializer`, used today only for the "estimated max" label on the LLM card — the legacy poll-abort path is gone since the SSE migration). Also `theme.service.ts` and `language.service.ts` (both signal + persist localStorage, parallel shape).
- `features/` — UI feature folders (one per top-level route, *primary adapters* en vocabulaire hexagonal) :
  - `dashboard/` — portfolio view (read-only positions) + sidebar with 3 collapsible sections (Portefeuilles / Tickers détenus / Watchlist) + link to ticker dossiers
  - `ticker/` — per-symbol dossier with a 2-col layout : left foldable **chart-tools sidenav** (Amazon-style filter panel, sticky, persisted localStorage) holding timeframe / benchmark / overlays / tools (annotation arm, clear anchor, reset zoom) / annotations-posées list with delete-per-item ; right column with price chart + multi-timeframe toggle + axes + hover crosshair, **chart analyse interactive** (zoom drag-select, brush mini-chart navigator, multi-select overlays MA50 / MA200 / Bollinger / 52w hi-lo, h-line annotations persisted to localStorage by symbol, measure tools delta % + delta time), benchmark overlay (SPY/QQQ/IWM/Sector/Custom — the Sector toggle is hidden when `quote.instrumentType !== 'STOCK'`, same gating drives the Fondamentaux section and skips the analyst+earnings fetches), indicators chips, watchlist toggle button, **Fondamentaux** section (only rendered for stocks) with analyst recommendations sub-block (consensus chip, segmented breakdown bar, price target, trend arrow) + earnings sub-block (next-date countdown with BMO/AMC tag, last 4 quarters EPS estimate vs actual + surprise %), LLM narrative
  - `import/` — Wealthsimple CSV drag-and-drop page
  - `suivi/` — import history (snapshots by date, market values, P&L)
  - `settings/` — back-office avec sidenav : `configuration/` (config runtime — sub-sidenav interne « Providers de données » / « LLM », signal `activeSection` persistée localStorage `runtime-config-section`), `prompt-preview/` (aperçu du prompt narratif Phase 1)

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

This applies per-section (Phase 2.5, Phase 3, Phase 4, Phase 5, Dette technique…). Don't shuffle entries you didn't touch — reorder only the section you're editing in the same pass.

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
| `skills/code-review-excellence/`             | PR review process and checklists                   |
| `skills/folders-structure-frontend/`         | Frontend folder conventions for this app           |
| `skills/git-commit/`                         | Conventional Commits workflow                      |
| `skills/github-create-pull-request/`         | `gh pr create` workflow                            |
| `instructions/frontend/best-practices.md`    | TypeScript / Angular best practices                |
| `hooks/post-tool-call.py`                    | Provenance hook for file modifications             |
