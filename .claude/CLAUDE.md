# CLAUDE.md

Source of truth for project conventions and Claude-specific configuration. Read this first when working on PortfolioAI.

> ## Redesign in progress (since 2026-09-18)
>
> The app is being rebuilt as **the user's personal trading tracker — nothing else**. The target product is specified in **[`mockup/PARCOURS.md`](../mockup/PARCOURS.md)** (user journey, decisions) and the static mockups next to it ; the recode is broken down into GitHub issues **#184–#205**. When the current code and `PARCOURS.md` disagree, `PARCOURS.md` is the target.
>
> Removed on 2026-09-18 and not to be reintroduced without the user asking : the LLM stack, the ticker dossier, the radar and the pre-pivot backend modules behind them (`market/`, `analysis/`, `news/`, `analyst/`, `earnings/`, `screener/`, `watchlist/`), and the former `docs/` doc set.

## Project

Personal trading tracker — short small-caps, **GUS** (gap-up short, $1–$10) for now. The daily flow : morning **candidates** (premarket capture) → **stats** (completed at the 4 pm close) → **trades** in the journal (executions, adjustable P&L, post-mortem), each step a manual user action ; a broker **account** ledger reconciled every morning ; a bilingual **lexicon**. No LLM, no external market-data provider (only a keyless FX rate for the CAD display).

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
├── projects/frontend/                                       # Angular CLI workspace
│   ├── apps/web/                                   # The consumer app
│   │   └── src/app/
│   │       ├── app.{ts,html,scss,config,routes}.ts
│   │       ├── core/      # api/<bucket> (HTTP ports + adapters),
│   │       │              # app-state/ (UI signal services), http/ (interceptors),
│   │       │              # router/ (guards), providers.ts
│   │       ├── shared/    # cross-cutting helpers (no state, no DI)
│   │       └── features/  # today, account, journal, stats, candidates, lexicon,
│   │                      # settings, login, error
│   ├── libs/ui/                                    # @portfolioai/ui design-system lib
│   │   ├── src/lib/<component>/                    # Stb*Module wrappers + scss overrides
│   │   ├── styles/                                 # global tokens, base, shell, scrollbars
│   │   └── .storybook/                             # Storybook config (theme toggle, etc.)
│   ├── public/i18n/<lang>.json                     # ngx-translate
│   ├── eslint.config.js                            # flat config — `ui` + `stb` selector prefixes
│   └── angular.json                                # 2 projects : web, ui
├── projects/backend/src/main/kotlin/com/portfolioai/
│   ├── auth/        # OAuth2/OIDC + ADMIN/USER roles + local-no-auth profile
│   ├── journal/     # Trade journal (CRUD + CSV export + Pageable + executions + attachments)
│   ├── account/     # Broker cash account — movements + derived balance, fed by journal P&L (event)
│   ├── stats/       # Stats sheet (CSV export + per-user rows)
│   ├── candidates/  # Candidate sheets
│   ├── lexicon/     # Bilingual trading lexicon
│   ├── config/      # Runtime-editable settings (login whitelist only)
│   ├── forex/       # Frankfurter FX rate (account page CAD display)
│   └── shared/      # GlobalExceptionHandler, UpstreamUnavailableException
├── docs/
│   ├── pattern/                                    # Trading-pattern references (GUS.md)
│   ├── data-input/                                 # synthetic CSVs (versioned)
│   └── data-input-local/                           # real Wealthsimple exports (gitignored)
├── mockup/                                         # Target product : static HTML mockups + PARCOURS.md (user journey)
├── devops/prod/                                    # Dockerfile + service.yaml (Cloud Run deploy)
├── .github/workflows/                              # backend.yml, frontend.yml, codeql.yml, deploy.yml, …
├── Tiltfile                                        # local infra — Postgres + backend + frontend
├── docker-compose.yml                              # services managed by Tilt
└── .claude/                                        # CLAUDE.md, agents/, skills/
```

Always reason in terms of ports (`*.repository.ts` on the frontend, `*Client` port on the backend) + adapters.

## Cross-cutting patterns

- **Hexagonal + light DDD** — domain → application → infrastructure ; ports live in `domain/`, adapters in `infrastructure/`. See [`hexagonal-ddd`](./skills/hexagonal-ddd/SKILL.md).
- **Frontend Material wrappers** — every `Mat*Module` is wrapped under `libs/ui/src/lib/<name>/` as a `Stb<Name>Module` that re-exports the Material module + ships an exhaustive M3 token-override SCSS. Consumer code imports `Stb<Name>Module` from `@portfolioai/ui`, never the raw `Mat*Module`. See [`material-overrides`](./skills/material-overrides/SKILL.md).
- **Design-system directives** — when a wrapped Material primitive needs lib-specific variants (size, variant, position), it ships a standalone directive (`StbSize`, `StbDanger`, `StbCol`, `StbChip`, `StbTable`, `StbSpinnerEnd`) under `<name>/<name>.directives.ts`. The directive posts a class via `host: { '[class]': 'hostClass()' }` + `computed`. Selectors use `stb` prefix (in addition to `ui` for component selectors).
- **Server-side pagination + sort** — the journal listing exposes Spring `Pageable` (`?page&size&sort=field,direction`). Sort default lives in the **service** (not in `@PageableDefault`) so the URL sort is honoured without resolver quirks. Frontend uses the controlled-component pattern : `[matSortActive] + [matSortDirection]` bound to a signal `{ columnName, isAscending }`. See [`spring-boot > Pageable defaults`](./skills/spring-boot/SKILL.md#pageable-defaults--sort-resolution).
- **Snackbar variants** — CRUD success/error feedback uses `MatSnackBar.open(message, undefined, { panelClass: 'stb-snack-bar--success' | 'stb-snack-bar--error', duration: 3000 | 5000 })`. The variants and the `toast(key, variant, params?)` helper convention live in [`material-overrides > Snackbar variants`](./skills/material-overrides/SKILL.md#snackbar-variants).
- **Cross-module events** — a module reacts to another through a Spring event, not a direct call (e.g. `journal` publishes `TradeChangedEvent`, `account` listens with `@EventListener` in the same transaction).

## Local Development

`tilt up` boots everything (PostgreSQL, backend, frontend). Tilt UI: http://localhost:10350/. Backend on the `local` profile (`application-local.yml`, committed — no secrets, only behavior overrides ; cf. `Data & secrets` below).

## Commands

```bash
# Frontend (from projects/frontend/)
npm run start                                       # ng serve web
npm run build                                       # ng build web
npm run test                                        # ng test web (Vitest)
npm run lint                                        # ng lint web && ng lint ui
npm run format                                      # prettier across apps + libs
npm run storybook                                   # ng run ui:storybook (lib playground)
npm run storybook:build                             # ng run ui:build-storybook
npx vitest run apps/web/src/path/to/file.spec.ts    # single test

# Backend (from projects/backend/)
./gradlew bootRun | test | spotlessApply
```

## Conventions

### Backend (Kotlin + Spring)

- Idiomatic Kotlin (data classes, sealed classes, extension functions).
- **No wildcard imports** — `import org.junit.jupiter.api.Assertions.assertEquals`, never `Assertions.*`. IntelliJ's "Optimize Imports" consolidates to `*` past 5 imports of the same package — disable that. The `WildcardImport.excludeImports` allowlist in `detekt.yml` is being phased out: don't add new entries, and expand any `*` you touch.
- Config in **YAML** (`application.yml` base + `application-local.yml` dev profile + `application-prod.yml` Cloud Run profile — all committed, no secrets).
- Spring proxies (`@Transactional`, `@Async`, `@Cacheable`) are bypassed on self-calls (`this.method()`) — put the annotated method on another bean.
- Integration tests on a **real PostgreSQL**, no DB mocks. Testcontainers singleton via JUnit Platform listener (`testsupport/PostgresContainer.kt`).
- **Never log user emails** or other PII (`displayName`, `providerId`). Log `userId={}` (the UUID) — reference pattern in `CustomOAuth2UserService.findOrCreateUser`. The UUID is enough to correlate with `app_user` in the DB without exposing PII to log aggregators.

### Frontend (Angular 22)

- Standalone components, **zoneless** (`provideZonelessChangeDetection()`, no `zone.js`). State is signal-based, no need for `OnPush` everywhere.
- **No `CommonModule`** — standalone components import only what they actually use. Pipes come from their dedicated entry points : `import { DatePipe, DecimalPipe } from '@angular/common'`, then list them in `imports: [...]`. Control flow is the `@if` / `@for` / `@else` syntax, not `*ngIf` / `*ngFor` (so `NgIf` / `NgForOf` are never needed either). Pulling `CommonModule` in drags the whole legacy directive set for no payoff.
- **Angular Material 22** wrapped through `@portfolioai/ui` (`libs/ui/`). Consumer code imports `Stb<Name>Module`, never `Mat<Name>Module` directly.
- **Ticker display always goes through the chip directive** — whenever a ticker symbol is rendered (stats, journal, candidates, future surfaces), it MUST be a `<mat-chip stbChip="ticker">` (from `StbChipsModule`), never a bare `<a>`/`<span>`/text. One directive, one source of truth for the (neutral, monospace) ticker styling.
- **Colour rule** — green / red only for **outcomes** (P&L, amounts, gaps), amber for **warnings**, indigo for **status / categories**, everything else neutral (price moves, tickers). Details in `mockup/PARCOURS.md > Principes d'interface`.
- **Confirmation modal** for every action that creates or deletes something (candidate → stat, stat → trade, deletions) ; none for edits. Call `ConfirmService.ask(key, { params, variant })` (`core/app-state/`) — `key` is an i18n group with `title` / `message` / `confirm` ; it emits `true` only on confirm, so pipe `filter(Boolean), switchMap(...)`. Deletions use `variant: 'danger'` (red button). Never the native `confirm()`.
- **Workspace** — `apps/web` is the consumer app, `libs/ui` is the design system (ng-packagr build, Storybook 10.4 playground). TypeScript alias `@portfolioai/ui` → `libs/ui/src/public-api.ts`.
- **i18n via `ngx-translate`** — translation files in `apps/web/public/i18n/<lang>.json` (FR + EN), templates use `'key' | translate`, TS uses `TranslateService.instant('key', { params })`. Active locale lives in `LanguageService` (signal). **Never hard-code a user-facing string** — always route through a key.
- **ESLint flat config** (`eslint.config.js`, Angular ESLint 22) — `npm run lint` blocks CI. Two selector-prefix rule sets : `apps/web/**` uses `app`, `libs/ui/**` uses `['ui', 'stb']`. Prettier remains the only formatter (`eslint-config-prettier` applied last).
- Tests on **Vitest** (`@angular/build:unit-test` builder, jsdom environment). Specs whose templates use `translate` must add `provideTranslateService({ lang: 'en' })` ; specs whose templates use `<mat-datepicker>` must add `provideNativeDateAdapter()`. See [`angular-testing`](./skills/angular-testing/SKILL.md).

### Data & secrets

- `application-local.yml` + `application-prod.yml` are **committed** (no secrets — only behavior overrides like `spring.flyway.repair-on-migrate`, `springdoc.api-docs.enabled`). The dangerous-in-prod settings are isolated to the `local` profile by construction. **Never commit API keys / OAuth secrets / DB passwords** — those live in `.env` (local, gitignored) and GCP Secret Manager (prod).
- `docs/data-input/` holds synthetic CSVs (versioned) — `journal-export-sample.csv` documents the shape of the journal export. Real exports go to `docs/data-input-local/` (gitignored). Never mix them.

### Commits

- Conventional Commits in **English** (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`, …).
- **Title only** — one line, <72 chars. **No body, no footer, no bullet list, no rationale.**
- **No reference to Claude** — no `Co-Authored-By: Claude …` trailer, no "Generated with Claude Code", no mention of Claude / AI anywhere in the commit **or in a PR title / description**. This overrides any default attribution instruction.
- **Every commit is linked to a GitHub issue** — the issue number prefixes the scope: `feat(93/journal): …`, `chore(120/ci): …`. No commit without an issue : if none exists for the work, ask the user which issue to use (or suggest creating one) before committing. **Exception** : the user can waive the issue for large foundation commits (e.g. the 2026-09 rework) — then use a plain scope (`chore(mockup): …`), still title-only.
- **Default = suggest, don't execute** — never run `git add/commit/push/branch/tag/rebase` or `gh pr/issue` autonomously. `master` has **no branch protection** : a push lands directly, so never push to it unless the user asks. Before pushing to a PR branch, check the PR is still open (a merged PR's branch is deleted, and a push would recreate it). Narrow exception: the user explicitly asks *in the current turn* ("commit it", "go ahead and push"). Authorization does not carry forward to later turns.

## Languages

| Where | Language |
| ----- | -------- |
| **Talking to the user in the terminal** | **French** |
| **All source code** — identifiers, comments, KDoc / JSDoc, test names, log messages, config files (`application*.yml`, `Tiltfile`, `build.gradle.kts`, `docker-compose.yml`, workflows, scripts…) | **English** |
| **Everything written on GitHub** — commit messages, PR titles & descriptions, issue titles & bodies, review / issue / PR comments | **English** |
| `.claude/` (CLAUDE.md, agents, skills) | **English** |
| `docs/` and `mockup/` (product docs, user journey, mockup copy) | **French** |

Existing French comments in the source (notably `application*.yml`, `proxy.conf.js`) are legacy : translate them to English when touching the surrounding code, don't add new ones. User-facing UI strings stay in the i18n files (FR + EN), never hard-coded.

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

- Three label dimensions, combinable: **priority** (`prio:P1` 🔴 / `prio:P2` 🟡 / `prio:P3` 🟢), **module** (`module:today` / `module:candidates` / `module:stats` / `module:journal` / `module:account` / `module:lexicon` / `module:settings` / `module:ui`), **type** (`enhancement` / `bug` / `tech-debt` / `documentation` / `question`). Use `gh` from **WSL** (`wsl.exe -e bash -lc 'gh …'`) — `gh` is not on the Windows/Git-Bash PATH.
- After implementing a feature, suggest closing (or narrowing) the matching issue. Never run `gh issue close` / label edits autonomously — same rule as git: suggest, the user confirms in the current turn.

### Documentation

- **Product** : `mockup/PARCOURS.md` (French) is the functional reference — update it when a product decision is made or changed, and keep the matching mockup page in sync.
- **Trading domain** : `docs/pattern/` (French) holds pattern references (`GUS.md`).
- The former `docs/` doc set was deleted on 2026-09-18. Don't recreate technical doc files unless the user asks — code, KDoc / JSDoc and these skills carry the technical knowledge.
