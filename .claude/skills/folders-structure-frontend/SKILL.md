---
name: folders-structure-frontend
description: Folder conventions for the PortfolioAI frontend (single Angular 21 app under `frontend/`). Use when creating new modules, services or components, or when reviewing where new files should live.
---

# Frontend Folder Structure

PortfolioAI's frontend is a **single Angular app** (no monorepo). It follows a light hexagonal split at the top of `app/`:

- `core/` — cross-feature data access as **ports + HTTP adapters**
- `features/` — UI feature folders (one per top-level route). These are the *primary adapters* in hexagonal terms.

```
frontend/
├── public/
│   └── i18n/                     # ngx-translate JSONs (fr.json + en.json)
├── proxy.conf.json
├── angular.json
└── src/
    ├── index.html
    ├── main.ts
    └── app/
        ├── app.ts                    # root component
        ├── app.config.ts             # standalone bootstrap (providers wire ports → adapters)
        ├── app.routes.ts             # top-level routes (loadComponent → ./features/...)
        ├── app.spec.ts
        ├── core/                     # 12 ports + adapters, plus 2 stateful services (Theme, Language) and 2 cross-feature helpers (JobStream SSE, LlmTimeout)
        │   ├── portfolio.repository.ts        # PORT: abstract class + types
        │   ├── snapshot.repository.ts
        │   ├── market.repository.ts
        │   ├── watchlist.repository.ts
        │   ├── news.repository.ts
        │   ├── config.repository.ts
        │   ├── annotation.repository.ts       # client-only (localStorage)
        │   ├── analyst.repository.ts
        │   ├── earnings.repository.ts
        │   ├── ollama-status.repository.ts
        │   ├── prompt.repository.ts           # Phase 3 — prompt management
        │   ├── narrative-feedback.repository.ts # Phase 3 — thumbs PATCH
        │   ├── job-stream.service.ts          # SSE EventSource wrapper (Phase 2.5)
        │   ├── theme.service.ts
        │   ├── language.service.ts
        │   ├── providers.ts                   # provideRepositories() — wires all 12 ports
        │   └── adapters/
        │       ├── portfolio.http.ts          # ADAPTER: HTTP impl + spec
        │       ├── portfolio.http.spec.ts
        │       ├── annotation.local.ts        # client-only adapter (localStorage)
        │       └── ... (one .http.ts per port, plus *.local.ts for client-only)
        └── features/                          # primary adapters — one folder per top-level route
            ├── dashboard/            # portfolio view + sidebar (portfolios / held tickers / watchlist)
            │   ├── dashboard.ts
            │   ├── dashboard.html
            │   ├── dashboard.scss
            │   └── dashboard.spec.ts
            ├── ticker/                        # dossier ticker — chart, indicators, narratif, thumbs, fondamentaux (Phase 1, étendu Phase 2 + 3)
            ├── import/                        # drag & drop CSV Wealthsimple
            ├── suivi/                         # timeline snapshots
            └── settings/                      # back-office : configuration / prompt-preview / prompts / prompts/:id/stats (Phase 3)
```

## Conventions

### `features/`

- One folder per top-level feature, all under `features/`
- Folder name matches the route segment when possible (`dashboard`, `import`, `settings`, …)
- Each feature owns its components, templates, styles and tests
- A feature may contain sub-folders for its own internal components — keep nesting shallow
- Routes load components via `./features/<name>/<name>` (see `app.routes.ts`)
- Imports from `core/` use relative paths: `../../core/...` from a feature root, `../../../core/...` from a feature sub-folder

### `core/` — ports & adapters

Cross-feature data access uses a **port + adapter** split (light SOLID):

- **Port** = `core/<name>.repository.ts` — `abstract class XxxRepository` declaring the contract, plus shared interfaces/types. Components depend on this abstraction.
- **Adapter** = `core/adapters/<name>.http.ts` — `HttpXxxRepository extends XxxRepository`, uses `HttpClient`. Decorated `@Injectable()` (no `providedIn: 'root'`).
- **Wiring** = `app.config.ts` providers: `{ provide: XxxRepository, useClass: HttpXxxRepository }`.
- **Tests** = HTTP behaviour tested in `core/adapters/<name>.http.spec.ts` against the adapter. Components mock the port via `{ provide: XxxRepository, useValue: mock }`.

The abstract class doubles as the type and the DI token — no `InjectionToken` needed.

When real domain orchestration appears (workflows that span repositories, business rules), introduce a use-case service in `core/` that depends on the ports. Until then, components inject the repository directly.

No UI components in `core/`.

### File naming

- Component file: `<feature>.ts` + `.html` + `.scss` + `.spec.ts` (kebab-case if multiple words)
- Port file: `<name>.repository.ts`
- HTTP adapter file: `adapters/<name>.http.ts`
- Use-case service (if needed): `<name>.service.ts`
- Standalone model / interface file (rare — most types live next to their port): `<name>.model.ts`

### Tests

- Test files live next to the source: `dashboard.spec.ts` next to `dashboard.ts`, `portfolio.http.spec.ts` next to `portfolio.http.ts`
- Use **Vitest** — see the `angular-testing` skill

## When NOT to use this layout

- For utility code with no feature home, prefer `core/` over inventing a `shared/` folder
- Do not create `domain/`, `usecases/` or `views/` folders. Use-cases (when justified) live as services in `core/`, not in a dedicated folder
- Do not put HTTP details in components or in feature folders — go through a port from `core/`
