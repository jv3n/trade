---
name: folders-structure-frontend
description: Folder conventions for the PortfolioAI frontend (Angular 22 CLI workspace with `apps/web` consumer app + `libs/ui` design-system lib under `projects/frontend/`). Use when creating new modules, services, components, lib wrappers, or design-system directives — or when reviewing where new files should live.
---

# Frontend Folder Structure

The frontend is an **Angular CLI workspace** under `projects/frontend/` with two projects:

- **`apps/web`** — the consumer app. Light hexagonal split at the top of `app/`.
- **`libs/ui`** — the `@portfolioai/ui` design-system library. ng-packagr build, Storybook 10.4 playground. Every Material module gets wrapped here as a `Stb*Module` with co-located M3 token overrides.

TypeScript path mapping (`@portfolioai/ui` → `libs/ui/src/public-api.ts`) lets the app import the lib without relative paths.

```
projects/frontend/
├── angular.json                              # 2 projects : web, ui
├── eslint.config.js                          # flat config, selector prefixes per project
├── package.json                              # workspace scripts
├── .npmrc                                    # legacy-peer-deps shim for Storybook ↔ Angular 22
├── apps/web/                                 # ─────────── CONSUMER APP ───────────
│   ├── proxy.conf.js                         # dev proxy to backend
│   ├── public/                               # static assets : i18n/{en,fr}.json, img/, favicon.svg
│   └── src/
│       ├── main.ts
│       ├── styles.scss                       # @use '../../../libs/ui/styles';
│       └── app/
│           ├── app.{ts,html,scss,config,routes}.ts
│           ├── core/
│           │   ├── api/<bucket>/             # account, auth, candidates, config, forex,
│           │   │   │                         # journal, lexicon, stats
│           │   │   ├── <name>.repository.ts  # PORT : abstract class
│           │   │   ├── <name>.model.ts       # domain types (optional)
│           │   │   └── adapters/<name>.http.ts (+ spec)
│           │   ├── app-state/                # root UI services : auth, theme, language, sidenav-collapse, confirm
│           │   ├── http/                     # functional interceptors (auth.interceptor.ts)
│           │   ├── router/                   # functional guards (auth.guards.ts)
│           │   └── providers.ts              # provideRepositories()
│           ├── shared/                       # pure helpers / standalone directives, one folder per concept
│           │                                 # image, number-mask, period-preset, toggle-set
│           └── features/                     # one folder per top-level route
│               └── account, candidates, error, journal, journal-io,
│                   lexicon, login, settings, stats
└── libs/ui/                                  # ──────── DESIGN-SYSTEM LIB ────────
    ├── ng-package.json                       # ng-packagr build config
    ├── src/
    │   ├── public-api.ts                     # barrel — re-exports every lib folder
    │   └── lib/<component>/                  # one folder per wrapped Material primitive
    │       ├── <component>.module.ts         # @NgModule that imports + re-exports Mat<X>Module
    │       ├── <component>.scss              # exhaustive M3 token overrides (commented defaults)
    │       ├── <component>.directives.ts     # design-system directives when needed (StbSize, StbCol…)
    │       ├── <component>.stories.ts        # Storybook story (single `Default` with Controls)
    │       ├── <component>.mdx               # Storybook docs page
    │       ├── public-api.ts                 # barrel for this component
    │       └── index.ts                      # re-exports public-api + module (+ directives)
    ├── styles/
    │   ├── index.scss                        # aggregator — @forward partials + every component scss
    │   ├── main.scss
    │   ├── _fonts.scss                       # Geist / Geist Mono + Material Symbols Rounded
    │   ├── _sizes.scss                       # SCSS vars (button-height, sidenav-width…)
    │   ├── _theme.scss                       # mat.theme(...) + Geist typography, sys colours → tokens
    │   ├── _tokens.scss                      # CSS custom properties (dark + light)
    │   ├── _base.scss                        # box-sizing, body, toolbar sticky
    │   ├── _scrollbars.scss
    │   ├── _shell.scss                       # ui-shell + ui-sidenav layout
    │   └── components/{_page,_banners,_badges}.scss  # global utility classes
    └── .storybook/                           # main.ts, preview.ts (theme toggle), sb.css
```

## `apps/web` conventions

### `features/`

- One folder per top-level route; the folder name matches the route segment (`journal-io` ↔ `/journal-io`). Routes lazy-load the page component via `loadComponent: () => import('./features/<name>/<name>-page')` in `app.routes.ts` (`Settings` is the exception: `features/settings/settings.ts`).
- Page component = `<name>-page.{ts,html,scss}` at the feature root.
- Internal components, dialogs and sub-views live in one sub-folder each, one level deep: `journal/add-trade-dialog/`, `journal/journal-detail-page/`, `account/movement-dialog/`, `lexicon/lexicon-table/`, `settings/preferences/`.
- Feature-local pure logic sits next to the page (`candidates/candidates.math.ts`), not in `shared/`, until a second feature needs it.
- Imports from `core/` use relative paths; imports from the design system use `@portfolioai/ui`.

### `core/api/<bucket>/`

- **Port** = `<bucket>/<name>.repository.ts` — `abstract class XxxRepository`. **The abstract class doubles as the type and the DI token** — no `InjectionToken` needed.
- **Adapter** = `<bucket>/adapters/<name>.http.ts` — `HttpXxxRepository extends XxxRepository`, decorated `@Injectable()` (no `providedIn: 'root'`). Wire DTOs and mapping stay private to the adapter file.
- **Domain types** = `<name>.model.ts` (`account.model.ts`, `trade-entry.model.ts`, `stat-entry.model.ts`), or inline in the port when small (`auth.repository.ts`).
- **Bucket-local pure helpers** at the root of the bucket (`core/api/journal/position-aggregates.ts`). The `adapters/` subfolder only contains adapters.
- **Tests** = HTTP behaviour tested in `adapters/<name>.http.spec.ts` against the adapter (`provideHttpClientTesting()`).
- For **Spring `Page<T>`** responses, the adapter unwraps to a `PagedResult<T>` (`{ content, pageIndex, pageSize, totalElements, totalPages }`) declared in the port — Spring's `number` becomes `pageIndex`. See `journal.repository.ts` / `account.repository.ts` and `fromPageWire` in `adapters/account.http.ts`.

### `core/app-state/`

`AuthService`, `ThemeService`, `LanguageService`, `SidenavCollapseService`. **No port/adapter** — concrete `providedIn: 'root'` signal services. They aren't bounded contexts; they're shared UI state. `ConfirmService` sits here too : a stateless facade that resolves i18n texts and opens the design-system `StbConfirm` modal. Backend access goes through a port (`AuthService` → `AuthRepository`).

### Cross-axis

- **Wiring**: `core/providers.ts` → `provideRepositories()` called from `app.config.ts`. See [`angular-di`](../angular-di/SKILL.md).
- No UI components in `core/`.

## `libs/ui` conventions

### `lib/<component>/` — Material module wrapper

Every Material primitive used by the app gets a wrapper here. Folder name matches the Material module name without the `Mat`/`Module` parts (`button`, `card`, `table`, `chips`, `snack-bar`, …). The `sort-header` folder is named after the visible directive `mat-sort-header`, not `MatSortModule`.

**Files**:

- `<name>.module.ts` — `@NgModule({ imports: [MatXxxModule], exports: [MatXxxModule] })` exporting `StbXxxModule`, with a doc comment on intent + design-system specifics.
- `<name>.scss` — the **exhaustive M3 token override**, forwarded from `styles/index.scss`. See [`material-overrides`](../material-overrides/SKILL.md).
- `<name>.stories.ts` + `<name>.mdx` — a single `Default` story with `args` / `argTypes` (the controls do the variants) and its docs page (`<Canvas>`, `<Controls>`, a "How to use" `<Source>`). Not every wrapper has one yet (`sort-header` doesn't).
- `public-api.ts` + `index.ts` — barrels; `index.ts` re-exports the module and the directives (see `button/index.ts`).

Lib-owned standalone components (not Material wrappers) follow the same folder shape with a `<name>.component.ts`: `area-chart/` ships `StbAreaChart` (selector `ui-area-chart`). Docs-only folders (`introduction/`, `palette/`) hold Storybook pages only.

### `lib/<component>/<name>.directives.ts` — design-system variants

When a wrapped Material primitive needs lib-specific variants (size, semantic flavour, position…), it ships standalone directives in this file:

```typescript
// libs/ui/src/lib/button/button.directives.ts
@Directive({
  selector: `
    button[mat-button][stbSize], a[mat-button][stbSize],
    button[mat-flat-button][stbSize], a[mat-flat-button][stbSize],
    /* … every other button flavour */
  `,
  host: {
    '[class]': 'hostClass()',
  },
})
export class StbSize {
  readonly stbSize = input.required<StbButtonSize>();

  protected readonly hostClass = computed(() => `stb-size--${this.stbSize()}`);
}
```

Selectors in `libs/ui` **always** start with `stb` or `ui` (ESLint rule; `apps/web` uses `app`) — design-system directives use `stb`. Input bindings use the same name as the selector attribute to avoid `no-input-rename`.

Existing: `StbSize` + `StbTone` + `StbDanger` (button), `StbTable` + `StbCol` (table), `StbChip` (chips — `stbChip="ticker"` is the mandatory ticker rendering).

### `styles/`

- `styles/index.scss` aggregates everything: `@forward` the `_<name>.scss` partials (fonts first — their CSS `@import`s must lead), then `components/*`, then every `lib/<component>/<component>.scss`.
- New M3 override: add `lib/<component>/<component>.scss`, then append `@forward '../src/lib/<component>/<component>';` to `styles/index.scss`.
- The app consumes it via `@use '../../../libs/ui/styles';` in `apps/web/src/styles.scss`. New global rules go in `libs/ui/styles/`, not in the app.

### Storybook

- One project (`ui` in `angular.json`). Toolbar global `theme` (`dark` / `light`) toggles `document.documentElement.dataset.theme` via the `withDataTheme` decorator in `.storybook/preview.ts`.
- One `Default` playground story per component — don't ship `Variants` / `Disabled` / `WithIcons` story explosions.
- `npm run storybook` / `npm run storybook:build`.

## Tests

Vitest, `*.spec.ts` next to the source. See [`angular-testing`](../angular-testing/SKILL.md).

## When NOT to use this layout

- Pure helpers (no state, no DI) shared across features → `apps/web/src/app/shared/<concept>/`, not `core/`. Avoid `utils/` — give the concept a real name (`toggle-set`, `period-preset`, `number-mask`).
- Don't create `domain/`, `usecases/`, or `views/` folders.
- Don't put HTTP details in components or features — go through a port from `core/api/`.
- Don't import `Mat*Module` directly in app code — go through the matching `Stb*Module` from `@portfolioai/ui`.
