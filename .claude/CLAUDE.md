# CLAUDE.md

Source of truth for project conventions and Claude-specific configuration. Read this first when working on PortfolioAI.

> ## Post-pivot focus
>
> The app pivoted in June 2026 from a per-ticker dossier app with LLM narratives → toward a **trading journal**. The user logs their trades each day ; stats / charts / Excel export come in phase 2.
>
> **Live modules** : `journal/` (backend) + `features/journal/` + `features/journal-io/` (frontend). Pre-pivot modules (`analysis/`, `portfolio/`, `news/`, `analyst/`, `earnings/`, `screener/`, plus the matching frontend features `dashboard`, `ticker`, `suivi`, `observability`, `radar`, `import`) remain in the tree in dormant state until phase 2 decides what gets re-wired vs. deleted.
>
> Treat `docs/projet/roadmap.md` as authoritative for in/out scope when this file and the roadmap disagree.

## Project

Trading journal app — short small-caps focused (gap-up shorts, $1-$10 price range). The user logs each trade with execution + pre-trade checklist + post-mortem fields ; the table is the atomic unit and the export/import is roundtrip-safe CSV. No LLM in the live path today ; the provider clients (TwelveData, FMP, Polygon, Finnhub) are kept for phase 2 enrichment but not wired to any UI route.

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
│   │       ├── core/      # api/<bucket> (HTTP ports + adapters), local/<bucket>,
│   │       │              # app-state/ (UI signal services), http/ (interceptors),
│   │       │              # router/ (guards), providers.ts
│   │       ├── shared/    # cross-cutting helpers (no state, no DI)
│   │       └── features/  # journal, journal-io, settings, login, error
│   │                      # (+ dormant pre-pivot features: dashboard, ticker,
│   │                      #  suivi, observability, radar, import)
│   ├── libs/ui/                                    # @portfolioai/ui design-system lib
│   │   ├── src/lib/<component>/                    # Stb*Module wrappers + scss overrides
│   │   ├── styles/                                 # global tokens, base, shell, scrollbars
│   │   └── .storybook/                             # Storybook config (theme toggle, etc.)
│   ├── public/i18n/<lang>.json                     # ngx-translate
│   ├── eslint.config.js                            # flat config — `ui` + `stb` selector prefixes
│   └── angular.json                                # 2 projects : web, ui
├── backend/src/main/kotlin/com/portfolioai/
│   ├── auth/        # OAuth2/OIDC + ADMIN/USER roles + local-no-auth profile
│   ├── journal/     # Trade journal — primary post-pivot module (CRUD + CSV io + Pageable)
│   ├── config/      # Runtime-editable settings + routing clients
│   ├── market/, analysis/, portfolio/, news/, analyst/, earnings/, screener/, watchlist/
│   │                # Pre-pivot — dormant, provider clients kept for phase 2 enrichment
│   └── shared/      # GlobalExceptionHandler, UpstreamUnavailableException
├── docs/
│   ├── metier/, technique/, devops/                # Product + ops docs (FR)
│   ├── projet/                                     # backlog.md, journal-livraisons.md, audits/
│   ├── TTD/                                        # Trading-domain references (patterns, sizing, level2, red flags)
│   ├── data-input/                                 # synthetic CSVs (versioned)
│   └── data-input-local/                           # real Wealthsimple exports (gitignored)
├── devops/prod/                                    # Dockerfile + service.yaml (Phase 5 deploy)
├── .github/workflows/                              # backend.yml, frontend.yml, codeql.yml, docs.yml, smoke-wif.yml
├── Tiltfile                                        # local infra — Postgres + backend + frontend
├── docker-compose.yml                              # services managed by Tilt
└── .claude/                                        # CLAUDE.md, agents/, skills/
```

> The `docs/` tree stays in French (project-wide convention for product and technical documentation). The `.claude/` tree is normalized to English.

**Per-module detail** : see `docs/technique/architecture.md` (sections "Modules backend", "Modules frontend", "Schéma de base de données", "Décisions techniques notables"). Always reason in terms of ports (`*.repository.ts` on the frontend, `*Client` port on the backend) + adapters.

## Cross-cutting patterns

- **Hexagonal + light DDD** — domain → application → infrastructure ; ports live in `domain/`, adapters in `infrastructure/`. See [`hexagonal-ddd`](./skills/hexagonal-ddd/SKILL.md).
- **Frontend Material wrappers** — every `Mat*Module` is wrapped under `libs/ui/src/lib/<name>/` as a `Stb<Name>Module` that re-exports the Material module + ships an exhaustive M3 token-override SCSS. Consumer code imports `Stb<Name>Module` from `@portfolioai/ui`, never the raw `Mat*Module`. See [`material-overrides`](./skills/material-overrides/SKILL.md).
- **Design-system directives** — when a wrapped Material primitive needs lib-specific variants (size, variant, position), it ships a standalone directive (`StbSize`, `StbCol`, `StbChip`, `StbTable`, `StbSpinnerEnd`) under `<name>/<name>.directives.ts`. The directive posts a class via `host: { '[class]': 'hostClass()' }` + `computed`. Selectors use `stb` prefix (in addition to `ui` for component selectors).
- **Server-side pagination + sort** — the journal listing exposes Spring `Pageable` (`?page&size&sort=field,direction`). Sort default lives in the **service** (not in `@PageableDefault`) so the URL sort is honoured without resolver quirks. Frontend uses the controlled-component pattern : `[matSortActive] + [matSortDirection]` bound to a signal `{ columnName, isAscending }`. See [`spring-boot > Pageable defaults`](./skills/spring-boot/SKILL.md#pageable-defaults--sort-resolution).
- **Snackbar variants** — CRUD success/error feedback uses `MatSnackBar.open(message, undefined, { panelClass: 'stb-snack-bar--success' | 'stb-snack-bar--error', duration: 3000 | 5000 })`. The variants and the `toast(key, variant, params?)` helper convention live in [`material-overrides > Snackbar variants`](./skills/material-overrides/SKILL.md#snackbar-variants).
- **Spring `@Async`** — always on a separate bean, never `this.asyncMethod()` (bypasses AOP).

## Local Development

`tilt up` boots everything (PostgreSQL, backend, frontend). Tilt UI: http://localhost:10350/. Backend on the `local` profile (`application-local.yml`, committed — no secrets, only behavior overrides ; cf. `Data & secrets` below). Detail in `docs/technique/developpement.md`.

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
- **Angular Material 22** wrapped through `@portfolioai/ui` (`libs/ui/`). Consumer code imports `Stb<Name>Module`, never `Mat<Name>Module` directly.
- **Workspace** — `apps/web` is the consumer app, `libs/ui` is the design system (ng-packagr build, Storybook 10.4 playground). TypeScript alias `@portfolioai/ui` → `libs/ui/src/public-api.ts`.
- **i18n via `ngx-translate`** — translation files in `apps/web/public/i18n/<lang>.json` (FR + EN), templates use `'key' | translate`, TS uses `TranslateService.instant('key', { params })`. Active locale lives in `LanguageService` (signal). **Never hard-code a user-facing string** — always route through a key.
- **ESLint flat config** (`eslint.config.js`, Angular ESLint 22) — `npm run lint` blocks CI. Two selector-prefix rule sets : `apps/web/**` uses `app`, `libs/ui/**` uses `['ui', 'stb']`. Prettier remains the only formatter (`eslint-config-prettier` applied last).
- Tests on **Vitest** (`@angular/build:unit-test` builder, jsdom environment). Specs whose templates use `translate` must add `provideTranslateService({ lang: 'en' })` ; specs whose templates use `<mat-datepicker>` must add `provideNativeDateAdapter()`. See [`angular-testing`](./skills/angular-testing/SKILL.md).

### Data & secrets

- `application-local.yml` + `application-prod.yml` are **committed** (no secrets — only behavior overrides like `spring.flyway.repair-on-migrate`, `springdoc.api-docs.enabled`). The dangerous-in-prod settings are isolated to the `local` profile by construction. **Never commit API keys / OAuth secrets / DB passwords** — those live in `.env` (local, gitignored) and GCP Secret Manager (prod, cf. `docs/devops/deploiement.md`).
- `docs/data-input/` holds synthetic CSVs (versioned, used for CI / demo + the journal-import demo file `journal-demo.csv`). Real exports go to `docs/data-input-local/` (gitignored). Never mix them.

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
- **Setup factories with sensible defaults** (`makeTrade()`, `makePage()`, `parsed()`, `quote()`) — each test only overrides the field that matters.
- **One scenario per test** (but multiple assertions on the same scenario are fine).
- **Realistic fixtures** when the cost is similar — `"Trade BAC short, GUS pattern, gap 50%"` beats `"x"`.

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
| `docs/metier/vision.md`             | Product framing changes (post-pivot scope shift, new MVP guardrails)         |
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
