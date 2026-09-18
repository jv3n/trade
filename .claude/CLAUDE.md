# CLAUDE.md

Source of truth for project conventions and Claude-specific configuration. Read this first when working on PortfolioAI.

> ## Rework in progress (since 2026-09-18)
>
> The app is being redefined from scratch as **the user's personal trading tracker — nothing else**. The scope is being re-specified with the user ; the internals of every kept module will be revisited.
>
> **Kept modules** : `account/`, `journal/`, `stats/`, `candidates/`, `lexicon/` (backend, plus the support modules `auth/`, `config/` — login whitelist only —, `forex/` — CAD display on the account page —, `shared/`) + `features/account/`, `features/journal/`, `features/journal-io/`, `features/stats/`, `features/candidates/`, `features/lexicon/`, `features/settings/`, `features/login/`, `features/error/` (frontend).
>
> **Removed on 2026-09-18** : the whole `docs/` doc set (except `docs/TTD/` and the data folders), the LLM stack (Ollama, Claude, prompts, narratives, observability), the ticker dossier, the radar, and the pre-pivot backend modules that fed them (`market/`, `analysis/`, `news/`, `analyst/`, `earnings/`, `screener/`, `watchlist/`). Their tables are dropped by `V11__drop_pre_pivot_tables.sql`. Don't reintroduce them without the user asking.

## Project

Personal trading tracker — short small-caps focused (gap-up shorts, $1-$10 price range). The user logs each trade (execution + pre-trade checklist + post-mortem), keeps a stats sheet of gap-up setups, candidate sheets, a broker account ledger and a bilingual lexicon. No LLM, no external market-data provider.

## Stack

| Layer        | Tech                                            |
| ------------ | ----------------------------------------------- |
| Frontend     | Angular 22 + Angular Material 22                |
| Design system | `libs/ui` — `@portfolioai/ui` (ng-packagr)      |
| Storybook    | Storybook 10.4 (`projects: ui`)                  |
| Backend      | Kotlin + Spring Boot 3 + Hibernate 6            |
| Build        | Gradle (Kotlin DSL) ; Angular CLI workspace     |
| DB           | PostgreSQL + Flyway                             |
| Tests        | Vitest (frontend), JUnit 5 + Testcontainers (backend) |
| Local infra  | Tilt + Docker Compose                           |
| CI           | GitHub Actions                                  |

## Repository Structure

```
trade/
├── frontend/                                       # Angular CLI workspace
│   ├── apps/web/                                   # The consumer app
│   │   └── src/app/
│   │       ├── app.{ts,html,scss,config,routes}.ts
│   │       ├── core/      # api/<bucket> (HTTP ports + adapters),
│   │       │              # app-state/ (UI signal services), http/ (interceptors),
│   │       │              # router/ (guards), providers.ts
│   │       ├── shared/    # cross-cutting helpers (no state, no DI)
│   │       └── features/  # account, journal, journal-io, stats, candidates, lexicon,
│   │                      # settings, login, error
│   ├── libs/ui/                                    # @portfolioai/ui design-system lib
│   │   ├── src/lib/<component>/                    # Stb*Module wrappers + scss overrides
│   │   ├── styles/                                 # global tokens, base, shell, scrollbars
│   │   └── .storybook/                             # Storybook config (theme toggle, etc.)
│   ├── public/i18n/<lang>.json                     # ngx-translate
│   ├── eslint.config.js                            # flat config — `ui` + `stb` selector prefixes
│   └── angular.json                                # 2 projects : web, ui
├── backend/src/main/kotlin/com/portfolioai/
│   ├── auth/        # OAuth2/OIDC + ADMIN/USER roles + local-no-auth profile
│   ├── journal/     # Trade journal (CRUD + CSV io + Pageable + executions + attachments)
│   ├── account/     # Broker cash account — movements + derived balance, fed by journal P&L (event)
│   ├── stats/       # Stats sheet (CSV import/export + per-user rows)
│   ├── candidates/  # Candidate sheets
│   ├── lexicon/     # Bilingual trading lexicon
│   ├── config/      # Runtime-editable settings (login whitelist only)
│   ├── forex/       # Frankfurter FX rate (account page CAD display)
│   └── shared/      # GlobalExceptionHandler, UpstreamUnavailableException
├── docs/
│   ├── TTD/                                        # Trading-domain references (patterns, sizing, level2, red flags)
│   ├── data-input/                                 # synthetic CSVs (versioned)
│   └── data-input-local/                           # real Wealthsimple exports (gitignored)
├── devops/prod/                                    # Dockerfile + service.yaml (Cloud Run deploy)
├── .github/workflows/                              # backend.yml, frontend.yml, codeql.yml, deploy.yml, …
├── Tiltfile                                        # local infra — Postgres + backend + frontend
├── docker-compose.yml                              # services managed by Tilt
└── .claude/                                        # CLAUDE.md, agents/, skills/
```

> The `docs/` tree stays in French. The `.claude/` tree is normalized to English.

Always reason in terms of ports (`*.repository.ts` on the frontend, `*Client` port on the backend) + adapters.

## Cross-cutting patterns

- **Hexagonal + light DDD** — domain → application → infrastructure ; ports live in `domain/`, adapters in `infrastructure/`. See [`hexagonal-ddd`](./skills/hexagonal-ddd/SKILL.md).
- **Frontend Material wrappers** — every `Mat*Module` is wrapped under `libs/ui/src/lib/<name>/` as a `Stb<Name>Module` that re-exports the Material module + ships an exhaustive M3 token-override SCSS. Consumer code imports `Stb<Name>Module` from `@portfolioai/ui`, never the raw `Mat*Module`. See [`material-overrides`](./skills/material-overrides/SKILL.md).
- **Design-system directives** — when a wrapped Material primitive needs lib-specific variants (size, variant, position), it ships a standalone directive (`StbSize`, `StbCol`, `StbChip`, `StbTable`, `StbSpinnerEnd`) under `<name>/<name>.directives.ts`. The directive posts a class via `host: { '[class]': 'hostClass()' }` + `computed`. Selectors use `stb` prefix (in addition to `ui` for component selectors).
- **Server-side pagination + sort** — the journal listing exposes Spring `Pageable` (`?page&size&sort=field,direction`). Sort default lives in the **service** (not in `@PageableDefault`) so the URL sort is honoured without resolver quirks. Frontend uses the controlled-component pattern : `[matSortActive] + [matSortDirection]` bound to a signal `{ columnName, isAscending }`. See [`spring-boot > Pageable defaults`](./skills/spring-boot/SKILL.md#pageable-defaults--sort-resolution).
- **Snackbar variants** — CRUD success/error feedback uses `MatSnackBar.open(message, undefined, { panelClass: 'stb-snack-bar--success' | 'stb-snack-bar--error', duration: 3000 | 5000 })`. The variants and the `toast(key, variant, params?)` helper convention live in [`material-overrides > Snackbar variants`](./skills/material-overrides/SKILL.md#snackbar-variants).
- **Spring `@Async`** — always on a separate bean, never `this.asyncMethod()` (bypasses AOP).

## Local Development

`tilt up` boots everything (PostgreSQL, backend, frontend). Tilt UI: http://localhost:10350/. Backend on the `local` profile (`application-local.yml`, committed — no secrets, only behavior overrides ; cf. `Data & secrets` below).
## Commands

```bash
# Frontend (from frontend/)
npm run start                                       # ng serve web
npm run build                                       # ng build web
npm run test                                        # ng test web (Vitest)
npm run lint                                        # ng lint web && ng lint ui
npm run format                                      # prettier across apps + libs
npm run storybook                                   # ng run ui:storybook (lib playground)
npm run storybook:build                             # ng run ui:build-storybook
npx vitest run apps/web/src/path/to/file.spec.ts    # single test

# Backend (from backend/)
./gradlew bootRun | test | spotlessApply
```

## Conventions

### Backend (Kotlin + Spring)

- Idiomatic Kotlin (data classes, sealed classes, extension functions).
- **No wildcard imports** — `import org.junit.jupiter.api.Assertions.assertEquals`, never `Assertions.*`. IntelliJ's "Optimize Imports" consolidates to `*` past 5 imports of the same package — disable that. The `WildcardImport.excludeImports` allowlist in `detekt.yml` is being phased out: don't add new entries, and expand any `*` you touch.
- Config in **YAML** (`application.yml` base + `application-local.yml` dev profile + `application-prod.yml` Cloud Run profile — all committed, no secrets).
- Spring `@Async` — must run on a separate bean, otherwise AOP is bypassed.
- Integration tests on a **real PostgreSQL**, no DB mocks. Testcontainers singleton via JUnit Platform listener (`testsupport/PostgresContainer.kt`).
- **Never log user emails** or other PII (`displayName`, `providerId`). Log `userId={}` (the UUID) — reference pattern in `CustomOAuth2UserService.findOrCreateUser`. The UUID is enough to correlate with `app_user` in the DB without exposing PII to log aggregators.
- **Server-side pagination** — `Page<T>` + Spring `Pageable`. Sort default belongs in the **service** (not `@PageableDefault`) ; see [`spring-boot`](./skills/spring-boot/SKILL.md).

### Frontend (Angular 22)

- Standalone components, **zoneless** (`provideZonelessChangeDetection()`, no `zone.js`). State is signal-based, no need for `OnPush` everywhere.
- **No `CommonModule`** — standalone components import only what they actually use. Pipes come from their dedicated entry points : `import { DatePipe, DecimalPipe } from '@angular/common'`, then list them in `imports: [...]`. Control flow is the `@if` / `@for` / `@else` syntax, not `*ngIf` / `*ngFor` (so `NgIf` / `NgForOf` are never needed either). Pulling `CommonModule` in drags the whole legacy directive set for no payoff.
- **Angular Material 22** wrapped through `@portfolioai/ui` (`libs/ui/`). Consumer code imports `Stb<Name>Module`, never `Mat<Name>Module` directly.
- **Ticker display always goes through the chip directive** — whenever a ticker symbol is rendered (stats, journal, candidates, future surfaces), it MUST be a `<mat-chip stbChip="ticker">` (from `StbChipsModule`), never a bare `<a>`/`<span>`/text. This keeps the trading-domain green ticker styling consistent everywhere — one directive, one source of truth.
- **Workspace** — `apps/web` is the consumer app, `libs/ui` is the design system (ng-packagr build, Storybook 10.4 playground). TypeScript alias `@portfolioai/ui` → `libs/ui/src/public-api.ts`.
- **i18n via `ngx-translate`** — translation files in `apps/web/public/i18n/<lang>.json` (FR + EN), templates use `'key' | translate`, TS uses `TranslateService.instant('key', { params })`. Active locale lives in `LanguageService` (signal). **Never hard-code a user-facing string** — always route through a key.
- **ESLint flat config** (`eslint.config.js`, Angular ESLint 22) — `npm run lint` blocks CI. Two selector-prefix rule sets : `apps/web/**` uses `app`, `libs/ui/**` uses `['ui', 'stb']`. Prettier remains the only formatter (`eslint-config-prettier` applied last).
- Tests on **Vitest** (`@angular/build:unit-test` builder, jsdom environment). Specs whose templates use `translate` must add `provideTranslateService({ lang: 'en' })` ; specs whose templates use `<mat-datepicker>` must add `provideNativeDateAdapter()`. See [`angular-testing`](./skills/angular-testing/SKILL.md).

### Data & secrets

- `application-local.yml` + `application-prod.yml` are **committed** (no secrets — only behavior overrides like `spring.flyway.repair-on-migrate`, `springdoc.api-docs.enabled`). The dangerous-in-prod settings are isolated to the `local` profile by construction. **Never commit API keys / OAuth secrets / DB passwords** — those live in `.env` (local, gitignored) and GCP Secret Manager (prod).
- `docs/data-input/` holds synthetic CSVs (versioned, used for CI / demo + the journal-import demo file `journal-demo.csv`). Real exports go to `docs/data-input-local/` (gitignored). Never mix them.

### Commits

- Conventional Commits in **English** (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`, …).
- **Issue number in the scope** — when a commit is tied to a GitHub issue, prefix the scope with it: `feat(93/journal): …`. No issue → plain scope: `chore(ci): …`.
- **Default = suggest, don't execute** — never run `git add/commit/push/branch/tag/rebase` or `gh pr/issue` autonomously. `master` is protected. Narrow exception: the user explicitly asks *in the current turn* ("commit it", "go ahead and push"). Authorization does not carry forward to later turns.
- When a commit message is requested = **one line**, Conventional Commits format, <72 chars, no body, no bullet list, no rationale. The user pastes the line as-is. If a body is really needed, raise that before writing one.

## .claude/ folder — language

Every file under `.claude/` (CLAUDE.md, `agents/*.md`, `skills/**/*.md`) is written in **English**. This applies to every new file or edit in the folder. The rest of the project (notably `docs/`) follows its own language conventions.

## Build & infra tooling — comment language

Comments in the build and local-infra orchestration config are written in **English**: `backend/build.gradle.kts`, `backend/settings.gradle.kts`, `backend/gradle.properties`, `Tiltfile`, `docker-compose.yml`. Same spirit as the `.claude/` rule — this is developer-tooling plumbing, not product/runtime documentation. The Spring runtime config (`application*.yml`) is **out of scope** and keeps its French comments (it documents product/runtime behaviour, in the `docs/`-French spirit).

## Instructions for Claude

### Line endings

Always write files with **LF** line endings, never CRLF — even when editing from the Windows side. The repo is LF-only (enforced by `.editorconfig` / `.gitattributes`); introducing CRLF produces spurious whole-file diffs and breaks the WSL toolchain. When editing an existing file, match its existing LF endings and never convert them to CRLF.

### Files the user wants to show you

`docs/tmp-files/` (gitignored) is the drop spot for files the user wants to show in a conversation (screenshots, truncated console output, pasted drafts, reference images). When the user says "look at the screenshot" / "I put the file in tmp-files", that's where to look (`Read` directly or `ls`). Never commit it, don't read it unprompted, never write into it.

### Builds and tests

Run `./gradlew test` / `npm run test` when it tightens the feedback loop — **but never run build or test commands autonomously** (`./gradlew build/test`, `npm run build/test`, `vitest`, etc.). The user runs them. Ask first, and only run one yourself when the user explicitly asks in the current turn ; otherwise just state what is worth running and let the user drive it. To inspect the running stack, prefer Tilt logs (UI at http://localhost:10350/, or `docker compose logs backend`) over a full rebuild. CI is still authoritative for the full matrix.

### Tests as documentation

Tests serve as a top-to-bottom-readable spec. Concretely:

- **Class-level docstring** — short paragraph: area under test, failure modes protected, design intent.
- **Test names are full sentences** (Kotlin backtick names, Vitest `it('…')` strings). Describe the **behavior**, not the mechanics: `rejects unknown sentiment` ✓, `test parser 5` ✗.
- **Inline comments** when the *why* is non-obvious (real bug observed, surprising edge case, regression to protect against). Not the mechanics.
- **Setup factories with sensible defaults** (`makeTrade()`, `makePage()`, `parsed()`, `quote()`) — each test only overrides the field that matters.
- **One scenario per test** (but multiple assertions on the same scenario are fine).
- **Realistic fixtures** when the cost is similar — `"Trade BAC short, GUS pattern, gap 50%"` beats `"x"`.

### Backlog

The open backlog lives in **[GitHub Issues](https://github.com/jv3n/trade/issues)**.

- Three label dimensions, combinable: **priority** (`prio:P1` 🔴 / `prio:P2` 🟡 / `prio:P3` 🟢), **module** (`module:account` / `module:journal` / `module:stats` / `module:lexicon`), **type** (`enhancement` / `bug` / `tech-debt` / `documentation` / `question`). Use `gh` from **WSL** (`wsl.exe -e bash -lc 'gh …'`) — `gh` is not on the Windows/Git-Bash PATH.
- After implementing a feature, suggest closing (or narrowing) the matching issue. Never run `gh issue close` / label edits autonomously — same rule as git: suggest, the user confirms in the current turn.

### Documentation

The former `docs/` doc set was deleted on 2026-09-18 while the app is being redefined. Don't recreate doc files unless the user asks — the new documentation structure will be decided with them.
