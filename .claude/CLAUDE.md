# CLAUDE.md

Source of truth for project conventions and Claude-specific configuration. Read this first when working on PortfolioAI.

## Project

Per-ticker market intelligence app. For each ticker (held in the user's portfolio or watched), the backend fetches Yahoo Finance data, computes technical indicators server-side (RSI, MA, momentum, drawdown…), and the LLM produces a short narrative summary. **The LLM is a writer, not a decider** — it does not predict prices and does not output BUY/SELL signals; it digests indicators that the code computed and writes a short readable summary.

> Phase 0 (rebalance recommendations from RSS news + portfolio-wide LLM prompt) is **frozen** — the code remains in place but is no longer in the user flow. See `docs/metier/fonctionnalites.md` for the full phasing.

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
│       ├── core/            # ports + HTTP adapters (theme service)
│       │   ├── *.repository.ts        # abstract class = port
│       │   └── adapters/*.http.ts     # HttpXxxRepository
│       └── features/        # UI pages (primary adapters)
├── backend/                 # Kotlin + Spring Boot
│   └── src/main/kotlin/com/portfolioai/
│       ├── market/          # 🚧 Phase 1 — Yahoo client + IndicatorCalculator
│       ├── analysis/        # Phase 1 ticker narrative (legacy reco pipeline frozen)
│       ├── portfolio/       # CSV imports, snapshots, read-only portfolios
│       ├── ingestion/       # 🧊 legacy Phase 0 — RSS scheduler
│       └── shared/          # cross-cutting utilities
├── docs/
│   ├── metier/              # vision.md, fonctionnalites.md
│   ├── technique/           # architecture.md, developpement.md, ddd.md
│   ├── projet/              # backlog.md, sources.md, commit-conventions.md
│   └── data-input/          # local CSVs (gitignored)
├── .github/workflows/       # CI: backend.yml, frontend.yml, docs.yml
├── .claude/                 # this folder — Claude Code skills, hooks, instructions
├── Tiltfile
├── docker-compose.yml
└── README.md
```

## Backend modules

- `market/` — 🚧 Phase 1 — `YahooClient` (quote, OHLC, fundamentals) + `IndicatorCalculator` (RSI, MA50/MA200, momentum, drawdown — Kotlin pur, sans Spring). Source primaire des dossiers ticker.
- `analysis/` — Phase 1 ticker narrative pipeline (`TickerNarrativeService`, `TickerNarrativeRunner`, `LlmNarrativeParser`). Legacy portfolio-wide pipeline (`AnalysisExecutor`, `RecommendationValidator`, etc.) is **frozen in place** — code remains but no longer in the user flow.
- `portfolio/` — read-only portfolios, Wealthsimple CSV import, historical snapshots
- `ingestion/` — 🧊 legacy Phase 0 — RSS scheduler. Conservé en place, plus consommé en Phase 1.
- `shared/` — cross-cutting utilities (e.g. `GlobalExceptionHandler`)

> The LLM never computes indicators — they live in `IndicatorCalculator` (pure Kotlin, unit-tested). The LLM only produces the narrative summary from already-computed values.

## Frontend modules

Light hexagonal split under `frontend/src/app/` :

- `core/` — cross-feature data access split into ports + HTTP adapters : `<name>.repository.ts` (abstract class) + `adapters/<name>.http.ts` (`HttpXxxRepository`). Wired in `app.config.ts`. Currently 4 repositories : Portfolio, Analysis, Settings, Snapshot. Also `theme.service.ts` (signal + persist localStorage).
- `features/` — UI feature folders (one per top-level route, *primary adapters* en vocabulaire hexagonal) :
  - `dashboard/` — portfolio view (read-only positions) + link to ticker dossiers
  - `ticker/` — 🚧 Phase 1 — per-symbol dossier (price chart, indicators, LLM narrative)
  - `import/` — Wealthsimple CSV drag-and-drop page
  - `suivi/` — import history (snapshots by date, market values, P&L)
  - `recommendations/` — 🧊 legacy Phase 0 — filterable list of recommendations
  - `history/` — 🧊 legacy Phase 0 — chronological recommendation history
  - `settings/` — back-office avec sidenav : `sources/` (activer/désactiver), `test-sources/` (tester un flux), `prompt-preview/` (aperçu du prompt LLM)

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
- Spring Boot config in **YAML** (`application.yml` / `application-local.yml`)
- Angular standalone components (Angular 21)
- Angular Material for all UI components
- Integration tests on real PostgreSQL (no DB mocks)
- Frontend tested with **Vitest** (not Karma, not Jest)
- `@Async` Spring: always on a separate bean — never `this.asyncMethod()` (bypasses AOP)
- LLM provider: **Claude API is the Phase 1 default** (`llm.provider: claude`). Ollama + `mistral` (7B Instruct) is kept as an offline backup but produces noticeably weaker narratives. Legacy Phase 0 timeouts (frontend abort + dedup window) are aligned at **400 s** to absorb Mistral latency on M1; Claude is much faster and may let us shrink that later.
- Commits in **English**, Conventional Commits — see `docs/projet/commit-conventions.md`
- Commit message proposals are always in **English**
- Never commit API keys. `application-local.yml` is gitignored
- `docs/data-input/` is gitignored — contains local Wealthsimple CSVs

## Instructions for Claude

### Builds and tests

Do not run builds (`./gradlew`, `npm run build`) or tests (`./gradlew test`, `npm run test`) unless explicitly asked. CI handles it. Running these wastes tokens.

### Portfolio philosophy

The portfolio is **read-only** in the UI — it mirrors the broker's reality. The only way to feed data is the Wealthsimple CSV import. No manual portfolio creation, no asset add/remove.

### Backlog

`docs/projet/backlog.md` is the source of truth for feature tracking. After implementing a feature:

1. Move the line from "À faire" to "Terminé"
2. Add concise technical notes in the Notes column

### Documentation

Files under `docs/` describe the actual state of the project. Keep them in sync as the code evolves:

| File                              | Update when…                                                              |
| --------------------------------- | ------------------------------------------------------------------------- |
| `docs/metier/vision.md`           | The product framing or the LLM's role in the app changes                  |
| `docs/metier/fonctionnalites.md`  | A feature changes status, or a phase advances                             |
| `docs/technique/architecture.md`  | A new module, an important technical decision, or a new pattern is added |
| `docs/technique/developpement.md` | Local config changes, a Tilt command is added                             |
| `docs/projet/sources.md`          | A data source is added or removed                                         |
| `docs/projet/backlog.md`          | A Phase 1+ feature is implemented, frozen, or its priority changes        |

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
