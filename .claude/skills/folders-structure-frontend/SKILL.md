---
name: folders-structure-frontend
description: Folder conventions for the PortfolioAI frontend (single Angular 21 app under `frontend/`). Use when creating new modules, services or components, or when reviewing where new files should live.
---

# Frontend Folder Structure

A **single Angular app** (no monorepo). Light hexagonal split at the top of `app/`:

- **`core/`** — cross-feature data access, split along **three axes**:
  - `core/api/<bucket>/` — HTTP-backed bounded contexts mirroring the backend modules. Port + `adapters/` subfolder.
  - `core/local/<bucket>/` — bounded contexts persisted in the browser (localStorage). Same port/adapter shape. Today only `annotation/`.
  - `core/app-state/` — cross-cutting UI signal services (theme, language, auth). No port/adapter split.
  - `core/http/` — HTTP interceptors (Phase 4).
  - `core/router/` — Route guards (Phase 4).
  - `core/providers.ts` — wires every bucket via `provideRepositories()`.
- **`shared/`** — pure cross-cutting helpers, no state, no DI. Rule: *"things you `inject()`" go in `core/`, "things you `import` as functions" go in `shared/`*. One folder per concept (e.g. `shared/toggle-set/`).
- **`features/`** — UI feature folders, one per top-level route. The *primary adapters*.

```
frontend/
├── public/i18n/                     # ngx-translate JSONs (fr.json + en.json)
├── proxy.conf.json
├── angular.json
└── src/
    ├── main.ts
    └── app/
        ├── app.ts                        # root component
        ├── app.config.ts                 # standalone bootstrap (providers wire ports → adapters)
        ├── app.routes.ts                 # top-level routes (loadComponent → ./features/...)
        ├── core/
        │   ├── api/<bucket>/             # market/, portfolio/, watchlist/, news/, analyst/, earnings/, config/, analysis/, auth/
        │   │   ├── <name>.repository.ts  # PORT: abstract class
        │   │   ├── <name>.service.ts     # bucket-local services next to the port (optional)
        │   │   └── adapters/<name>.http.ts (+ spec)
        │   ├── local/<bucket>/           # browser-persisted (today: annotation/)
        │   │   ├── <name>.repository.ts
        │   │   └── adapters/<name>.local.ts
        │   ├── app-state/                # UI signal services (no port/adapter)
        │   │   ├── theme.service.ts (+ spec)
        │   │   ├── language.service.ts
        │   │   └── auth.service.ts
        │   ├── http/auth.interceptor.ts
        │   ├── router/auth.guards.ts
        │   └── providers.ts              # provideRepositories()
        ├── shared/                       # pure helpers — one folder per concept
        │   └── toggle-set/
        │       ├── toggle-set.ts
        │       └── toggle-set.spec.ts
        └── features/                     # primary adapters
            ├── login/, error/, dashboard/, ticker/, import/, suivi/, settings/, observability/
            └── <name>/
                ├── <name>.ts
                ├── <name>.html
                ├── <name>.scss
                └── <name>.spec.ts
```

## Conventions

### `features/`

- One folder per top-level feature. Folder name matches the route segment when possible.
- Each feature owns its components, templates, styles, tests.
- Sub-folders for internal components — keep nesting shallow.
- Routes load components via `./features/<name>/<name>` (see `app.routes.ts`).
- Imports from `core/` use relative paths.

### `core/api/<bucket>/` — HTTP-backed bounded contexts

Each bucket mirrors a backend module. The `analysis/` bucket also owns LLM infra (`ollama-status.*`, `llm-timeout.service`, `job-stream.service`, `prompt.repository`) because the backend keeps LLM dispatch under `analysis/infrastructure/llm/`.

Inside each bucket:

- **Port** = `<bucket>/<name>.repository.ts` — `abstract class XxxRepository` declaring the contract. Components depend on this abstraction. **The abstract class doubles as the type and the DI token** — no `InjectionToken` needed.
- **Adapter** = `<bucket>/adapters/<name>.http.ts` — `HttpXxxRepository extends XxxRepository`, decorated `@Injectable()` (no `providedIn: 'root'`).
- **Bucket-local services** at the **root** of the bucket (e.g. `core/api/analysis/ollama-status.service.ts`). The `adapters/` subfolder only contains HTTP adapters.
- **Tests** = HTTP behaviour tested in `adapters/<name>.http.spec.ts` against the adapter.

### `core/local/<bucket>/`

Same port + `adapters/` shape, but the adapter is `*.local.ts` (localStorage). Today only `annotation/` (chart h-line annotations per symbol).

### `core/app-state/`

Theme + language + auth signal services. **No port/adapter** — concrete signal-based services with localStorage persistence baked in. They aren't bounded contexts; they're shared UI state with no remote counterpart and no expectation of swapping adapters.

### Cross-axis

- **Wiring**: `core/providers.ts` → `provideRepositories()` called from `app.config.ts`. Depends on every bucket, sits at root of `core/`.
- Components mock a port via `{ provide: XxxRepository, useClass: MockXxxRepository }` (or `useValue` when the port has no inherited builders — see [`angular-signals > Resource builders`](../angular-signals/SKILL.md#resource-builders-live-on-the-port-itself)).
- No UI components in `core/`.

### File naming

- Component: `<feature>.ts` + `.html` + `.scss` + `.spec.ts` (kebab-case if multiple words).
- Port: `api/<bucket>/<name>.repository.ts` (or `local/<bucket>/<name>.repository.ts`).
- HTTP adapter: `api/<bucket>/adapters/<name>.http.ts`.
- localStorage adapter: `local/<bucket>/adapters/<name>.local.ts`.
- Bucket-local service: `api/<bucket>/<name>.service.ts` (next to ports, not in `adapters/`).
- Cross-cutting UI service: `app-state/<name>.service.ts`.

### Tests

Vitest, `*.spec.ts` next to source — see [`angular-testing`](../angular-testing/SKILL.md).

## When NOT to use this layout

- Pure helpers (no state, no DI) → `shared/<concept>/<concept>.ts`, not `core/`. Avoid the name `utils/` — domain-flavoured concepts get a real name (`toggle-set`, `filter-window`).
- Don't create `domain/`, `usecases/`, or `views/` folders. Use-cases (when justified) live as services in `core/`.
- Don't put HTTP details in components or features — go through a port from `core/`.
