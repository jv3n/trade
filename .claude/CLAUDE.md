# CLAUDE.md

Source of truth for project conventions and Claude-specific configuration. Read this first when working on PortfolioAI.

## Project

AI-powered stock-portfolio optimiser. The app ingests economic feeds (RSS, financial APIs), generates investment recommendations through the Claude API (or a local LLM via Ollama), and tracks the quality of those recommendations over time.

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
├── backend/                 # Kotlin + Spring Boot
│   └── src/main/kotlin/com/portfolioai/
│       ├── analysis/        # LLM orchestration, recommendations, jobs
│       ├── ingestion/       # RSS / financial feeds
│       ├── portfolio/       # CSV imports, snapshots, read-only portfolios
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

- `ingestion/` — RSS feeds and financial APIs collection
- `analysis/` — LLM orchestration (`AnalysisService`, `AnalysisRunner`, `AnalysisExecutor`, `AnalysisContextLoader`, `LlmResponseParser`, `RecommendationValidator`, `RecommendationPersister`, `AnalysisJobStore`); also owns the `Recommendation` entity and its actions
- `portfolio/` — read-only portfolios, Wealthsimple CSV import, historical snapshots
- `shared/` — cross-cutting utilities (e.g. `GlobalExceptionHandler`)

> Note: there is no separate `recommendations/` package — recommendations live inside `analysis/`. Phase 2's observability work will likely live there too.

## Frontend modules

- `dashboard/` — portfolio view (read-only positions) + AI analysis trigger
- `import/` — Wealthsimple CSV drag-and-drop page
- `suivi/` — import history (snapshots by date, market values, P&L)
- `recommendations/` — filterable list of all recommendations
- `history/` — chronological recommendation history
- `settings/` — back-office avec sidenav : `sources/` (activer/désactiver), `test-sources/` (tester un flux)
- `core/` — shared services (`PortfolioService`, `AnalysisService`, `SettingsService`, `SnapshotService`)

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
- Local LLM: Ollama + **`mistral`** (7B Instruct). On enriched prompts qwen2:1.5b hallucinated; Mistral is slower (~1-2 min on M1) but coherent. Timeouts (frontend abort, dedup window) are aligned at 300 s to absorb that latency
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
| `docs/metier/fonctionnalites.md`  | An MVP feature changes status, or a phase advances                        |
| `docs/technique/architecture.md`  | A new module, an important technical decision, or a new pattern is added |
| `docs/technique/developpement.md` | Local config changes, a Tilt command is added                             |
| `docs/projet/sources.md`          | A data source is added or removed                                         |

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
