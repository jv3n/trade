---
name: folders-structure-frontend
description: Folder conventions for the PortfolioAI frontend (Angular 22 CLI workspace with `apps/web` consumer app + `libs/ui` design-system lib under `frontend/`). Use when creating new modules, services, components, lib wrappers, or design-system directives — or when reviewing where new files should live.
---

# Frontend Folder Structure

The frontend is an **Angular CLI workspace** with two projects :

- **`apps/web`** — the consumer app. Light hexagonal split at the top of `app/`.
- **`libs/ui`** — the `@portfolioai/ui` design-system library. ng-packagr build, Storybook 10.4 playground. Every Material module gets wrapped here as a `Stb*Module` with co-located M3 token overrides.

TypeScript path mapping (`@portfolioai/ui` → `libs/ui/src/public-api.ts`) lets the app import the lib without relative paths.

```
frontend/
├── angular.json                              # 2 projects : web, ui
├── eslint.config.js                          # flat config, selector prefixes per project
├── package.json                              # workspace scripts
├── .npmrc                                    # legacy-peer-deps shim for Storybook ↔ Angular 22
├── apps/web/                                 # ─────────── CONSUMER APP ───────────
│   ├── public/i18n/{en,fr}.json              # ngx-translate
│   ├── proxy.conf.json                        # dev proxy to backend
│   └── src/
│       ├── main.ts
│       ├── styles.scss                        # @use 'libs/ui/styles' as ui;
│       └── app/
│           ├── app.{ts,html,scss,config,routes}.ts
│           ├── core/
│           │   ├── api/<bucket>/             # auth, journal, …
│           │   │   ├── <name>.repository.ts  # PORT: abstract class
│           │   │   ├── <name>-models.ts      # domain types (optional)
│           │   │   └── adapters/<name>.http.ts (+ spec)
│           │   ├── local/<bucket>/           # browser-persisted (annotation/)
│           │   ├── app-state/                # signal services (theme, language, auth)
│           │   ├── http/                     # interceptors
│           │   ├── router/                   # guards
│           │   └── providers.ts              # provideRepositories()
│           ├── shared/                       # pure helpers, one folder per concept
│           └── features/                     # primary adapters, one folder per top-level route
│               ├── journal/                  # ← live, post-pivot
│               ├── journal-io/               # ← live (CSV export + drop-zone import)
│               ├── login/, error/, settings/ # always-live
│               └── dashboard/, ticker/, suivi/, observability/, radar/, import/
│                                              # ↑ dormant — pre-pivot, not currently routed
└── libs/ui/                                  # ──────── DESIGN-SYSTEM LIB ────────
    ├── ng-package.json                       # ng-packagr build config
    ├── project.json                          # ng project metadata
    ├── src/
    │   ├── public-api.ts                     # barrel — re-exports every Stb*Module
    │   └── lib/<component>/                  # one folder per Material primitive wrapped
    │       ├── <component>.module.ts         # @NgModule that imports + re-exports Mat<X>Module
    │       ├── <component>.scss              # exhaustive M3 token overrides (commented defaults)
    │       ├── <component>.directives.ts     # design-system directives when needed (StbSize, StbCol…)
    │       ├── <component>.stories.ts        # Storybook story (single `Default` with Controls)
    │       ├── <component>.mdx               # Storybook docs page
    │       ├── public-api.ts                 # barrel for this component
    │       └── index.ts                      # re-exports public-api + the .module
    ├── styles/
    │   ├── index.scss                        # aggregator — @forward to every component scss
    │   ├── main.scss
    │   ├── _theme.scss                       # mat.theme(...) + Inter + tokens
    │   ├── _tokens.scss                      # CSS custom properties (dark + light)
    │   ├── _base.scss                        # box-sizing, body, toolbar sticky
    │   ├── _shell.scss                       # ui-shell + ui-sidenav layout
    │   ├── _sizes.scss                       # SCSS vars (button-height, sidenav-width…)
    │   ├── _scrollbars.scss
    │   └── components/{banners,badges}.scss  # global utility classes
    └── .storybook/                            # main.ts, preview.ts (theme toggle), sb.css
```

## `apps/web` conventions

### `features/`

- One folder per top-level feature. Folder name matches the route segment when possible.
- Each feature owns its components, templates, styles, tests.
- Sub-folders for internal components — keep nesting shallow.
- Routes load components via `./features/<name>/<name>` (see `app.routes.ts`).
- Imports from `core/` use relative paths ; imports from the design system use `@portfolioai/ui`.

### `core/api/<bucket>/`

- **Port** = `<bucket>/<name>.repository.ts` — `abstract class XxxRepository`. **The abstract class doubles as the type and the DI token** — no `InjectionToken` needed.
- **Adapter** = `<bucket>/adapters/<name>.http.ts` — `HttpXxxRepository extends XxxRepository`, decorated `@Injectable()` (no `providedIn: 'root'`).
- **Bucket-local services** at the **root** of the bucket (e.g. `core/api/journal/journal-period.service.ts`). The `adapters/` subfolder only contains HTTP adapters.
- **Tests** = HTTP behaviour tested in `adapters/<name>.http.spec.ts` against the adapter.
- For **Spring `Page<T>`** responses, the adapter unwraps to the lib-local `PagedResult<T>` shape (`{ content, pageIndex, pageSize, totalElements, totalPages }`). Spring's `number` field is renamed `pageIndex` on the way back — see `core/api/journal/journal.repository.ts`.

### `core/local/<bucket>/`

Same port + `adapters/` shape, but the adapter is `*.local.ts` (localStorage).

### `core/app-state/`

Theme + language + auth signal services. **No port/adapter** — concrete signal-based services with localStorage persistence baked in. They aren't bounded contexts ; they're shared UI state.

### Cross-axis

- **Wiring** : `core/providers.ts` → `provideRepositories()` called from `app.config.ts`.
- Components mock a port via `{ provide: XxxRepository, useClass: MockXxxRepository }` (or `useValue` when the port has no inherited builders).
- No UI components in `core/`.

## `libs/ui` conventions

### `lib/<component>/` — Material module wrapper

Every Material primitive used by the app gets a wrapper here. Folder name matches the Material module name without the `Mat`/`Module` parts (`button`, `card`, `table`, `chips`, `snack-bar`, etc.). The `sort-header` folder is named after the visible directive `mat-sort-header`, not the `MatSortModule`.

**Minimum files** :

- `<name>.module.ts` — `@NgModule({ imports: [MatXxxModule], exports: [MatXxxModule] })` exporting `StbXxxModule`. Constructor injection only. KDoc explains intent + design-system specifics.
- `<name>.scss` — the **exhaustive M3 token override**. Always reads node_modules `_m3-<name>.scss > get-tokens()` first, then lists every token : applied ones carry a value, deferred ones are commented with a one-line rationale. See [`material-overrides`](../material-overrides/SKILL.md).
- `<name>.stories.ts` — a single `Default` story with Storybook `args` + `argTypes` (controls panel). No `Variants` / `Disabled` / `WithIcons` story explosion ; the controls do the variants.
- `<name>.mdx` — Storybook docs : preamble, `<Canvas of={Default}/>`, `<Controls of={Default}/>`, a "How to use" `<Source>` snippet, optionally a comparison table.
- `public-api.ts` — `export * from './<name>.module'` (+ directives + types).
- `index.ts` — `export * from './public-api'; export * from './<name>.module'`.

### `lib/<component>/<name>.directives.ts` — design-system variants

When a wrapped Material primitive needs lib-specific variants (size, semantic flavour, position…), it ships standalone directives in this file. Pattern :

```typescript
@Directive({
  selector: '<base-selector>[stbSize]',
  standalone: true,
  host: { '[class]': 'hostClass()' },
})
export class StbSize {
  readonly stbSize = input.required<StbButtonSize>();
  protected readonly hostClass = computed(() => `stb-size--${this.stbSize()}`);
}
```

Selectors **always** start with `stb` (eslint rule) ; input bindings use the same name as the property to avoid the `no-input-rename` ESLint rule.

Existing examples : `StbSize` + `StbSpinnerEnd` (button), `StbTable` + `StbCol` (table), `StbChip` (chips), `StbSort` (sort-header).

### `styles/`

- `styles/index.scss` aggregates everything : `@forward` every `_<name>.scss` partial, then every `lib/<component>/<component>.scss` for the M3 overrides.
- New M3 override : add the SCSS at `lib/<component>/<component>.scss` then append `@forward '../src/lib/<component>/<component>';` to `styles/index.scss`.
- The app consumes via `@use 'libs/ui/styles' as ui;` in `apps/web/src/styles.scss`.

### Storybook

- One project (`ui` in `angular.json`). Toolbar global type `theme` (`dark` / `light`) toggles `document.documentElement.dataset.theme` via the `withDataTheme` decorator (see `.storybook/preview.ts`).
- Story titles : `Components/<Name>`. Single `Default` story per component with the playground controls. Don't ship many small stories — the user explicitly asked for one playground per component.
- Run with `npm run storybook` ; build with `npm run storybook:build`.

## Tests

Vitest, `*.spec.ts` next to source. See [`angular-testing`](../angular-testing/SKILL.md) — especially the **DateAdapter** + **jsdom gotchas** sections, both bit us recently.

## When NOT to use this layout

- Pure helpers (no state, no DI) → `apps/web/src/app/shared/<concept>/<concept>.ts`, not `core/`. Avoid `utils/` — domain-flavoured concepts get a real name (`toggle-set`, `period-preset`).
- Don't create `domain/`, `usecases/`, or `views/` folders. Use-cases (when justified) live as services in `core/`.
- Don't put HTTP details in components or features — go through a port from `core/`.
- Don't import `Mat*Module` directly in app code — go through the matching `Stb*Module` from `@portfolioai/ui`. The token overrides + variants live there.
