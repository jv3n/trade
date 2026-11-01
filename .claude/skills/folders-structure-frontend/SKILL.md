---
name: folders-structure-frontend
description: Folder conventions for the PortfolioAI frontend (Angular CLI workspace, `apps/web` + `libs/ui` under `projects/frontend/`). Use when creating a feature, a repository, a service, a helper, or when reviewing where a new file should live.
---

# Frontend Folder Structure

An Angular CLI workspace with two projects : **`apps/web`**, the consumer app, and **`libs/ui`**, the `@portfolioai/ui` design system (aliased to `libs/ui/src/public-api.ts`). The lists below show the shapes, not every member : `ls` the folder for the current ones.

```
projects/frontend/
├── angular.json                 # 2 projects : web, ui
├── eslint.config.js             # flat config, selector prefixes per project
├── test-setup.ts                # jsdom polyfills
├── apps/web/
│   ├── public/                  # static assets, i18n/{en,fr}.json
│   ├── tools/                   # build and check scripts
│   └── src/
│       ├── styles.scss          # @use '../../../libs/ui/styles';
│       └── app/
│           ├── app.{ts,html,scss,config,routes}.ts
│           ├── core/
│           │   ├── api/<bucket>/
│           │   │   ├── <name>.repository.ts       # PORT : abstract class
│           │   │   ├── <name>.model.ts            # domain types (optional, may be several)
│           │   │   └── adapters/<name>.http.ts    # + spec
│           │   ├── app-state/   # root UI services
│           │   ├── http/        # functional interceptors
│           │   ├── router/      # functional guards, navigation helpers
│           │   └── providers.ts # provideRepositories()
│           ├── shared/          # pure helpers and standalone directives, one folder per concept
│           └── features/        # one folder per feature
├── apps/web-e2e/                # Playwright
└── libs/ui/
    ├── src/lib/<name>/          # see material-overrides
    ├── styles/                  # tokens, sizes, theme, base, components/ — see css
    └── .storybook/
```

## `features/`

- A routed feature's folder matches its route ; routes lazy-load the page through `loadComponent` in `app.routes.ts`. `calculator`, `notes` and `locates` have no route : they are launchers and layers mounted in `app.ts`, or dialogs other pages open.
- Page component = `<name>-page.{ts,html,scss}` at the feature root (`Settings` is the exception : `features/settings/settings.ts`). A feature whose routes are children may keep them at its root (`reports/`).
- Internal components, dialogs and sub-views live in one sub-folder each, one level deep : `journal/new-trade-dialog/`, `stats/stat-chart/`, `lexicon/lexicon-table/`. A feature with many small parts groups them by role (`calculator/parts/`, `cards/`, `widgets/`).
- Beside the page : pure logic in `<feature>.math.ts`, browser-kept state in `<feature>.store.ts`, a feature pipe in `*.pipe.ts`, SCSS shared by its dialogs in `_<feature>.scss`. They stay here until a second feature needs them.
- Imports from `core/` use relative paths ; imports from the design system use `@portfolioai/ui`.

## `core/api/<bucket>/`

Port and adapter wiring are in [`angular-di`](../angular-di/SKILL.md#repositories--port--adapter). Here :

- **Domain types** in `<name>.model.ts`, or inline in the port when small. Types two buckets share live in `core/api/shared/`.
- **Bucket-local pure helpers** at the root of the bucket (`core/api/journal/position-aggregates.ts`) : `adapters/` only holds adapters.
- **HTTP behaviour** is tested in `adapters/<name>.http.spec.ts`.
- **Paged responses** — the adapter unwraps the backend's `PageResponse` to a `PagedResult<T>` declared in the port, the wire `number` becoming `pageIndex` (`fromPageWire` in `adapters/account.http.ts`).

No UI component in `core/`.

## `shared/`

Pure helpers with no state and no DI, in a folder named after the concept. Avoid `utils/`.

## `libs/ui`

See [`material-overrides`](../material-overrides/SKILL.md) for a wrapper's files and the lib's components, [`css`](../css/SKILL.md) for `styles/`.

## What not to do

- No `domain/`, `usecases/` or `views/` folders.
- No HTTP details in components or features : go through a port from `core/api/`.
