---
name: folders-structure-frontend
description: Folder conventions for the PortfolioAI frontend (single Angular 21 app under `frontend/`). Use when creating new modules, services or components, or when reviewing where new files should live.
---

# Frontend Folder Structure

PortfolioAI's frontend is a **single Angular app** (no monorepo, no domain/adapter split). Code is organised by **feature folders** under `frontend/src/app/`, with shared cross-feature code in `core/`.

```
frontend/
├── public/
├── proxy.conf.json
├── angular.json
└── src/
    ├── index.html
    ├── main.ts
    └── app/
        ├── app.ts                  # root component
        ├── app.config.ts           # standalone bootstrap config (providers, routes)
        ├── app.routes.ts           # top-level routes
        ├── app.spec.ts
        ├── core/                   # cross-feature services and models
        │   ├── analysis.service.ts
        │   ├── portfolio.service.ts
        │   ├── snapshot.service.ts
        │   └── settings.service.ts
        ├── dashboard/              # one folder per feature
        │   ├── dashboard.ts
        │   ├── dashboard.html
        │   ├── dashboard.scss
        │   └── dashboard.spec.ts
        ├── history/
        ├── import/
        ├── recommendations/
        ├── settings/
        └── suivi/
```

## Conventions

### Feature folders

- One folder per top-level feature (matches a route)
- Folder name matches the route segment when possible (`dashboard`, `import`, `settings`, …)
- Each feature owns its components, templates, styles and tests
- A feature may contain sub-folders for its own internal components — keep nesting shallow

### `core/`

- Cross-feature services consumed by 2+ features
- Pure HTTP services and shared models live here
- Singletons via `@Injectable({ providedIn: 'root' })`
- No UI components in `core/`

### File naming

- Component file: `<feature>.ts` + `.html` + `.scss` + `.spec.ts` (kebab-case if multiple words)
- Service file: `<feature>.service.ts`
- Model / interface file: `<name>.model.ts`

### Tests

- Test files live next to the source: `dashboard.spec.ts` next to `dashboard.ts`
- Use **Vitest** — see the `angular-testing` skill

## When NOT to use this layout

- For utility code that has no feature home, prefer `core/` over inventing a `shared/` folder
- Do not create `adapters/`, `domain/`, `usecases/` or `views/` folders — that DDD/hexagonal split is **not** used in this repo
