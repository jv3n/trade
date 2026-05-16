---
name: folders-structure-frontend
description: Folder conventions for the PortfolioAI frontend (single Angular 21 app under `frontend/`). Use when creating new modules, services or components, or when reviewing where new files should live.
---

# Frontend Folder Structure

PortfolioAI's frontend is a **single Angular app** (no monorepo). It follows a light hexagonal split at the top of `app/`:

- `core/` — cross-feature data access, split along **three axes** :
  - `core/api/` — HTTP-backed bounded contexts that mirror the backend modules (`market/`, `portfolio/`, `analysis/`, …). Each is a port + `adapters/` subfolder.
  - `core/local/` — bounded contexts persisted **in the browser** (localStorage). Same port/adapter shape ; the only inhabitant today is `annotation/`.
  - `core/app-state/` — cross-cutting **UI signal services** (theme, language). No port/adapter split — these are just services with localStorage persistence baked in.
  - `core/providers.ts` lives at the root (wires every bucket).
- `shared/` — **pure cross-cutting helpers**, no state, no DI (e.g. `shared/toggle-set/toggle-set.ts`). Sibling of `core/` and `features/`. The rule is *"things you `inject()`" go in `core/`, "things you `import` as functions" go in `shared/`*. **One folder per concept** (mirrors `features/`) — kebab-case folder name + same-name file + sibling spec ; group related helpers under the same folder rather than dumping everything in a single `utils.ts`.
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
        ├── core/
        │   ├── api/                                # HTTP-backed bounded contexts (mirror backend modules)
        │   │   ├── market/
        │   │   │   ├── market.repository.ts        # PORT: abstract class + types
        │   │   │   └── adapters/
        │   │   │       ├── market.http.ts          # ADAPTER: HTTP impl
        │   │   │       └── market.http.spec.ts
        │   │   ├── portfolio/                      # portfolio + snapshot (snapshot = portfolio history)
        │   │   │   ├── portfolio.repository.ts
        │   │   │   ├── snapshot.repository.ts
        │   │   │   └── adapters/
        │   │   │       ├── portfolio.http.ts (+ spec)
        │   │   │       └── snapshot.http.ts (+ spec)
        │   │   ├── watchlist/
        │   │   ├── news/
        │   │   ├── analyst/
        │   │   ├── earnings/
        │   │   ├── config/
        │   │   └── analysis/                       # narrative pipeline + LLM infra (mirrors backend `analysis/`)
        │   │       ├── narrative-bias.repository.ts
        │   │       ├── narrative-feedback.repository.ts
        │   │       ├── narrative-observability.repository.ts
        │   │       ├── prompt.repository.ts        # Phase 3 — prompt management
        │   │       ├── ollama-status.repository.ts
        │   │       ├── ollama-status.service.ts (+ spec)
        │   │       ├── job-stream.service.ts (+ spec)  # SSE EventSource wrapper (Phase 2.5)
        │   │       ├── llm-timeout.service.ts (+ spec)
        │   │       └── adapters/
        │   │           ├── narrative-bias.http.ts (+ spec)
        │   │           ├── narrative-feedback.http.ts
        │   │           ├── narrative-observability.http.ts (+ spec)
        │   │           ├── prompt.http.ts
        │   │           └── ollama-status.http.ts (+ spec)
        │   ├── local/                              # browser-persisted bounded contexts (localStorage adapters, no backend)
        │   │   └── annotation/
        │   │       ├── annotation.repository.ts
        │   │       └── adapters/
        │   │           └── annotation.local.ts
        │   ├── app-state/                          # cross-cutting UI signal services (no port/adapter split)
        │   │   ├── theme.service.ts (+ spec)
        │   │   └── language.service.ts (+ spec)
        │   └── providers.ts                        # provideRepositories() — wires every bucket
        ├── shared/                                 # pure cross-cutting helpers, no state, no DI ; one folder per concept
        │   └── toggle-set/
        │       ├── toggle-set.ts                   # immutable Set toggle used by signal-driven UI
        │       └── toggle-set.spec.ts
        └── features/                               # primary adapters — one folder per top-level route
            ├── dashboard/                          # portfolio view + sidebar (portfolios / held tickers / watchlist)
            │   ├── dashboard.ts
            │   ├── dashboard.html
            │   ├── dashboard.scss
            │   └── dashboard.spec.ts
            ├── ticker/                             # dossier ticker — chart, indicators, narratif, thumbs, fondamentaux (Phase 1, étendu Phase 2 + 3)
            ├── import/                             # drag & drop CSV Wealthsimple
            ├── suivi/                              # timeline snapshots
            ├── observability/                      # Phase 3 — index + per-symbol timeline + bias dashboard
            └── settings/                           # back-office : configuration / prompts / prompts/:id/stats (Phase 3)
```

## Conventions

### `features/`

- One folder per top-level feature, all under `features/`
- Folder name matches the route segment when possible (`dashboard`, `import`, `settings`, …)
- Each feature owns its components, templates, styles and tests
- A feature may contain sub-folders for its own internal components — keep nesting shallow
- Routes load components via `./features/<name>/<name>` (see `app.routes.ts`)
- Imports from `core/` use relative paths: `../../core/...` from a feature root, `../../../core/...` from a feature sub-folder

### `core/` — three axes : `api/`, `local/`, `app-state/`

Cross-feature concerns split along three axes :

#### `core/api/<bucket>/` — HTTP-backed bounded contexts

Each bucket mirrors a backend module (`market/`, `portfolio/`, `watchlist/`, `news/`, `analyst/`, `earnings/`, `config/`, `analysis/`). The `analysis/` bucket also owns LLM infra (`ollama-status.*`, `llm-timeout.service`, `job-stream.service`, `prompt.repository`) because the backend keeps LLM dispatch under `analysis/infrastructure/llm/`.

Inside each bucket :

- **Port** = `core/api/<bucket>/<name>.repository.ts` — `abstract class XxxRepository` declaring the contract, plus shared interfaces/types. Components depend on this abstraction.
- **Adapter** = `core/api/<bucket>/adapters/<name>.http.ts` — `HttpXxxRepository extends XxxRepository`, uses `HttpClient`. Decorated `@Injectable()` (no `providedIn: 'root'`).
- **Bucket-local services** sit at the **root** of the bucket next to the port (e.g. `core/api/analysis/ollama-status.service.ts`). The `adapters/` subfolder only contains HTTP adapters.
- **Tests** = HTTP behaviour tested in `core/api/<bucket>/adapters/<name>.http.spec.ts` against the adapter. Adapter ↔ port stays relative within the same bucket (`../<name>.repository`).

#### `core/local/<bucket>/` — browser-persisted bounded contexts

Same port + `adapters/` shape, but the adapter is a `*.local.ts` (localStorage) implementation rather than HTTP. Today only `annotation/` lives here (chart h-line annotations on the dossier ticker, persisted per symbol).

#### `core/app-state/` — cross-cutting UI signal services

Theme + language. **No port/adapter split** — these are concrete signal-based services with localStorage persistence baked in (`theme.service.ts`, `language.service.ts` + their specs). They aren't bounded contexts ; they're shared UI state with no remote counterpart and no expectation of swapping adapters.

#### Cross-axis rules

- **Wiring** = `core/providers.ts` → `provideRepositories()` (called from `app.config.ts`). It depends on every bucket, so it sits at the root of `core/`.
- Components mock a port via `{ provide: XxxRepository, useValue: mock }`. The abstract class doubles as the type and the DI token — no `InjectionToken` needed.
- When real domain orchestration appears (workflows that span repositories, business rules), introduce a use-case service inside the relevant bucket (or at the root of `core/` if it spans buckets). Until then, components inject the repository directly.

No UI components in `core/`.

### File naming

- Component file: `<feature>.ts` + `.html` + `.scss` + `.spec.ts` (kebab-case if multiple words)
- Port file: `api/<bucket>/<name>.repository.ts` (or `local/<bucket>/<name>.repository.ts`)
- HTTP adapter file: `api/<bucket>/adapters/<name>.http.ts`
- localStorage adapter file: `local/<bucket>/adapters/<name>.local.ts`
- Bucket-local service: `api/<bucket>/<name>.service.ts` (next to the ports, not inside `adapters/`)
- Cross-cutting UI signal service: `app-state/<name>.service.ts` (no `adapters/` subfolder)
- Standalone model / interface file (rare — most types live next to their port): `api/<bucket>/<name>.model.ts`

### Tests

- Test files live next to the source: `dashboard.spec.ts` next to `dashboard.ts`, `portfolio.http.spec.ts` next to `portfolio.http.ts` in the bucket's `adapters/`
- Use **Vitest** — see the `angular-testing` skill

## When NOT to use this layout

- For pure helper code (no state, no DI, just functions), use `shared/<concept>/<concept>.ts` at the app root — not `core/` (which is reserved for things you `inject()`). One folder per concept, mirroring `features/`. Avoid the name `utils/` for this drawer — it reads as "infra plumbing" whereas the inhabitants are domain-flavoured helpers (e.g. `toggle-set`, `filter-window`).
- Do not create `domain/`, `usecases/` or `views/` folders. Use-cases (when justified) live as services in `core/`, not in a dedicated folder
- Do not put HTTP details in components or in feature folders — go through a port from `core/`
