# CLAUDE.md

Source of truth for project conventions and Claude-specific configuration. Read this first when working on PortfolioAI.

> ## ⚠️ PIVOT EN COURS — depuis 2026-06-03
>
> The app is pivoting **180°** away from a per-ticker dossier app with LLM narratives → toward a **trading journal** where the user logs their trades each day (stats / charts / Excel export come in a phase 2).
>
> **Source of truth for the pivot** : [`docs/projet/roadmap.md`](../docs/projet/roadmap.md). Read it before every session — it carries the in/out scope, the docs to rewrite, and the 7 open questions that drive the next sessions.
>
> Context note triggering the pivot : [`docs/TTD/changement direction`](../docs/TTD/changement%20direction).
>
> **What stays vs goes** (résumé — détail dans la roadmap) :
> - **Goes** : `analysis/` (LLM narratives + prompts + observability), `portfolio/` (CSV imports + snapshots), `news/`, `analyst/`, `earnings/`, screener UI/service, most `features/*` (dashboard, ticker, suivi, observability, settings/prompts, radar, import).
> - **Stays** : every provider client (TwelveData, FMP, Polygon, Finnhub — reused later to enrich journaled trades), `auth/`, `config/`, `shared/`, the Phase 5 deployment stack.
> - **New** : table `trade_entry`, module backend `journal/`, frontend `features/journal/`.
>
> **State of this file** : everything below describes the **pre-pivot** state (PortfolioAI as a per-ticker app). Sections will be updated piecewise as the pivot lands. Treat the roadmap as authoritative when the two disagree.

## Project

Per-ticker market intelligence app. The backend fetches market data, computes indicators server-side (RSI, MA, momentum, drawdown…), the LLM writes a short narrative summary. **The LLM is a writer, not a decider** — no price predictions, no BUY/SELL signals.

Target architecture — the per-ticker dossier is the **atomic unit**. Portfolio / watchlist / cross-position analyses are **compositions** over a DAG where the leaves are `TickerAnalysis(symbol, day)` (cache-aware via `ticker_narrative_snapshot`) and the parents aggregate already-persisted narratives. Detail in `docs/metier/vision.md` + `docs/technique/architecture.md > Modèle pipeline d'analyse`.

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
├── frontend/src/app/
│   ├── core/        # api/<bucket> (HTTP ports + adapters), local/<bucket> (browser persistence),
│   │                # app-state/ (UI signal services), http/ (interceptors), router/ (guards), providers.ts
│   ├── shared/      # cross-cutting helpers (no state, no DI)
│   └── features/    # primary adapters — login, error, dashboard, ticker, import, suivi, settings, observability, radar
├── backend/src/main/kotlin/com/portfolioai/
│   ├── auth/        # Phase 4 — OAuth2/OIDC + roles ADMIN/USER + local-no-auth profile
│   ├── market/      # MarketChartClient port + TwelveData/Mock + IndicatorCalculator (pure Kotlin)
│   ├── analysis/    # Ticker narrative pipeline + LLM dispatch + prompt mgmt + observability + bias
│   ├── portfolio/   # CSV imports, snapshots, read-only portfolios
│   ├── watchlist/   # Phase 2 — manual watchlist
│   ├── news/        # Phase 2 — Finnhub-backed headlines per ticker
│   ├── analyst/     # Phase 2 — Finnhub-backed analyst recommendations
│   ├── earnings/    # Phase 2 — Finnhub-backed earnings (4 last Q + next date)
│   ├── config/      # Phase 2 — runtime-editable settings + routing clients
│   ├── screener/    # Phase 6 — market radar (Mock + Polygon/Massive adapters + Routing client)
│   └── shared/      # GlobalExceptionHandler, UpstreamUnavailableException
├── docs/
│   ├── metier/      # vision.md, fonctionnalites.md
│   ├── technique/   # architecture.md, developpement.md, developper.md, ddd.md, ops.md, providers.md
│   ├── devops/      # commandes-pratiques.md, deploiement.md (Phase 5), decision-ollama-deploiement.md
│   ├── projet/      # backlog.md, journal-livraisons.md, sources.md, commit-conventions.md, audits/
│   ├── data-input/       # fake sample CSVs (versioned)
│   └── data-input-local/ # real Wealthsimple exports (gitignored)
├── devops/
│   └── prod/        # Dockerfile + service.yaml + README check-list (Phase 5 deploy — local infra reste à la racine)
├── .github/workflows/  # backend.yml, frontend.yml, codeql.yml, docs.yml, smoke-wif.yml
├── Tiltfile            # local infra — boot Postgres + Ollama + backend + frontend
├── docker-compose.yml  # services Docker managés par Tilt
└── .claude/            # CLAUDE.md, agents/, skills/
```

> The `docs/` tree stays in French (project-wide convention for product and technical documentation). Only the `.claude/` tree is normalized to English.

**Per-module detail** : see `docs/technique/architecture.md` (sections "Modules backend", "Modules frontend", "Schéma de base de données", "Décisions techniques notables"). Always reason in terms of ports (`*.repository.ts` on the frontend, `*Client` port on the backend) + HTTP / local / Routing adapters.

## Cross-cutting patterns

- **Hexagonal + light DDD** — domain → application → infrastructure ; ports live in `domain/`, adapters in `infrastructure/`.
- **`@Primary` routing clients** on the backend — `RoutingMarketChartClient`, `RoutingNewsClient`, `RoutingAnalystClient`, `RoutingEarningsClient`, `RoutingLlmClient`, `RoutingSymbolSearchClient`, `RoutingSectorClassifier`. Delegate per-call to the adapter selected by `*.provider`, read from `AppConfigService`. Switch without reboot, hits at the next dossier opened.
- **Mock adapter for each provider** (`MockNewsClient`, `MockMarketChartClient`, `MockAnalystClient`, `MockEarningsClient`, `MockLlmClient`) — `tilt up` boots with no API keys. Reserved symbols `UNKNOWN` / `RATELIMIT` / `NOTARGET` / `NOCALENDAR` exercise the error paths.
- **Fail-soft** on optional endpoints (price-target, calendar/earnings) — fallback to `null`, the snapshot remains useful. Upstream errors map to `UpstreamUnavailableException` (lives in `shared/`) → unified 503.
- **The LLM never computes indicators** — `IndicatorCalculator` is pure Kotlin, unit-tested. The LLM digests, it doesn't compute (otherwise it hallucinates the numbers).
- **Spring `@Async`** — always on a separate bean, never `this.asyncMethod()` (bypasses AOP).

## Local Development

`tilt up` boots everything (PostgreSQL, Ollama, backend, frontend). Tilt UI: http://localhost:10350/. Backend on the `local` profile (`application-local.yml`, committed — no secrets, only behavior overrides ; cf. `Data & secrets` ci-dessous). Detail in `docs/technique/developpement.md`.

## Commands

```bash
# Frontend (from frontend/)
npm run start | build | test | lint | format
npx vitest run src/path/to/file.spec.ts   # single test

# Backend (from backend/)
./gradlew bootRun | test | spotlessApply
```

## Conventions

### Backend (Kotlin + Spring)

- Idiomatic Kotlin (data classes, sealed classes, extension functions).
- **No wildcard imports** — `import org.junit.jupiter.api.Assertions.assertEquals`, never `Assertions.*`. IntelliJ's "Optimize Imports" consolidates to `*` past 5 imports of the same package — disable that. The `WildcardImport.excludeImports` allowlist in `detekt.yml` is being phased out: don't add new entries, and expand any `*` you touch.
- Config in **YAML** (`application.yml` base + `application-local.yml` dev profile + `application-prod.yml` Cloud Run profile — tous committés, sans secrets).
- Spring `@Async` — must run on a separate bean, otherwise AOP is bypassed.
- Integration tests on a **real PostgreSQL**, no DB mocks.
- **Never log user emails** or other PII (`displayName`, `providerId`). Log `userId={}` (the UUID) — reference pattern in `CustomOAuth2UserService.findOrCreateUser`. The UUID is enough to correlate with `app_user` in the DB without exposing PII to log aggregators.

### Frontend (Angular 21)

- Standalone components, **zoneless** (`provideZonelessChangeDetection()`, no `zone.js`). State is signal-based, no need for `OnPush` everywhere.
- Angular Material for all UI components.
- **i18n via `ngx-translate`** — translation files in `frontend/public/i18n/<lang>.json` (FR + EN), templates use `'key' | translate`, TS uses `TranslateService.instant('key', { params })`. Active locale lives in `LanguageService` (signal). **Never hard-code a user-facing string** — always route through a key.
- **ESLint flat config** (`eslint.config.js`, Angular ESLint 21) — `npm run lint` blocks CI. Prettier remains the only formatter (`eslint-config-prettier` applied last). No casual `recommended-type-checked` (5–10× slower, deserves a dedicated session).
- Tests on **Vitest** (not Karma, not Jest). Specs whose templates use `translate` must add `provideTranslateService({ lang: 'en' })` to the TestBed (otherwise `instant('foo.bar')` returns the key as a fallback, which is acceptable for assertions).

### LLM

- **Claude API by default** (`llm.provider: claude`). Ollama + `qwen2.5:3b` is the offline backup (5–10s on M1, solid JSON, weaker narratives). Mistral 7B was dropped (30–60s per narrative → timeouts).
- Timeouts unified under `llm.timeout-seconds` (60..900, default 400) in `/settings/configuration > LLM`. The frontend reads it via `LlmTimeoutService`, primed at boot through `provideAppInitializer`.

### Data & secrets

- `application-local.yml` + `application-prod.yml` are **committed** since 2026-05-18 (no secrets — only behavior overrides like `spring.flyway.repair-on-migrate`, `springdoc.api-docs.enabled`, `llm.provider` selection). The dangerous-in-prod settings are isolated to the `local` profile by construction. **Never commit API keys / OAuth secrets / DB passwords** — those live in `.env` (local, gitignored) and GCP Secret Manager (prod, cf. `docs/devops/deploiement.md`).
- `docs/data-input/` holds synthetic CSVs (versioned, used for CI / demo). Real Wealthsimple exports go to `docs/data-input-local/` (gitignored). Never mix them.

### Commits

- Conventional Commits in **English** — see `docs/projet/commit-conventions.md`.
- **Default = suggest, don't execute** — never run `git add/commit/push/branch/tag/rebase` or `gh pr/issue` autonomously. `master` is protected. Narrow exception: the user explicitly asks *in the current turn* ("commit it", "go ahead and push"). Authorization does not carry forward to later turns.
- When a commit message is requested = **one line**, Conventional Commits format, <72 chars, no body, no bullet list, no rationale. The user pastes the line as-is. If a body is really needed, raise that before writing one.

## .claude/ folder — language

Every file under `.claude/` (CLAUDE.md, `agents/*.md`, `skills/**/*.md`) is written in **English**. This applies to every new file or edit in the folder. The rest of the project (notably `docs/`) follows its own language conventions.

## Instructions for Claude

### Files the user wants to show you

`docs/tmp-files/` (gitignored) is the drop spot for files the user wants to show in a conversation (screenshots, truncated console output, pasted drafts, reference images). When the user says "look at the screenshot" / "I put the file in tmp-files", that's where to look (`Read` directly or `ls`). Never commit it, don't read it unprompted, never write into it.

### Builds and tests

Run `./gradlew test` / `npm run test` when it tightens the feedback loop (refactor, runtime debug, validating a fix). To inspect the running stack, prefer Tilt logs (UI at http://localhost:10350/, or `docker compose logs backend`) over a full rebuild. CI is still authoritative for the full matrix.

### Tests as documentation

Tests serve as a top-to-bottom-readable spec. Concretely:

- **Class-level docstring** — short paragraph: area under test, failure modes protected, design intent.
- **Test names are full sentences** (Kotlin backtick names, Vitest `it('…')` strings). Describe the **behavior**, not the mechanics: `rejects unknown sentiment` ✓, `test parser 5` ✗.
- **Inline comments** when the *why* is non-obvious (real bug observed, surprising edge case, regression to protect against). Not the mechanics.
- **Setup factories with sensible defaults** (`parsed()`, `quote()`, `indicators()`) — each test only overrides the field that matters.
- **One scenario per test** (but multiple assertions on the same scenario are fine).
- **Realistic fixtures** when the cost is similar — `"Price above MA200, RSI 62"` beats `"x"`.

### Portfolio philosophy

The portfolio is **read-only** in the UI — it mirrors the broker's reality. The only input path is the Wealthsimple CSV import. No manual portfolio creation, no asset add/remove.

### Backlog

Two files:

- **`docs/projet/backlog.md`** — open items only: `⏳ À faire`, `🚧 En cours`, `🧊 Gelé`, `❌ Décommissionné`, plus the **Dette technique** section.
- **`docs/projet/journal-livraisons.md`** — history of shipped (✅) features, grouped by phase, reverse-chronological within each phase. Implementation notes live here, not in the backlog.

**After implementing a feature**:

1. Add the entry to `journal-livraisons.md` at the top of the relevant phase, with a `Livré YYYY-MM-DD` lead.
2. Remove the matching `⏳` line from `backlog.md` (or narrow its scope if only partially delivered).
3. No duplication between the two files.

**Ordering in `backlog.md`** — reorder only the section you're editing: `⏳` by priority descending 🔴 → 🟡 → 🟢 ; `🚧` right after the `🔴` items when present. Don't shuffle entries you didn't touch.

### Documentation

| File                                | Update when…                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `docs/metier/vision.md`             | Product framing or the LLM's role changes                                    |
| `docs/metier/fonctionnalites.md`    | A feature changes status, or a phase advances                                |
| `docs/technique/architecture.md`    | New module, notable technical decision, new pattern                          |
| `docs/technique/developpement.md`   | Local config changes, a Tilt command is added                                |
| `docs/technique/developper.md`      | Newcomer onboarding flow changes (prerequisite, install step, failure mode)  |
| `docs/projet/sources.md`            | A data source is added or removed                                            |
| `docs/projet/backlog.md`            | New ticket, priority shift, feature freeze/decommission                      |
| `docs/projet/journal-livraisons.md` | Feature shipped (✅) — the detailed entry that used to live in the backlog   |
| `docs/projet/audits/`               | A code review is performed — archive `YYYY-MM-DD-titre.md` + add a line to `index.md`. No auto-promotion to the backlog (the user decides). |
| `docs/CHANGELOG.md`                 | End of every `/doc-maintainer` patch session — dated entry summarising the files modified. Format in `.claude/skills/doc-maintainer/SKILL.md`. |

### Technical decisions

Every technical decision (lib choice, dropped approach, architectural fix) goes to `docs/technique/architecture.md > Décisions techniques notables`. That file is the memory of the *why*, not just the *what*.
