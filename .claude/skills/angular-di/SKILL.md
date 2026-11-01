---
name: angular-di
description: Dependency injection conventions for the PortfolioAI frontend (Angular 22, zoneless, standalone). Use when adding a repository (port + adapter), creating a service or a feature store, wiring providers in `app.config.ts`, or adding a boot-time initializer.
---

# Angular Dependency Injection

Where files live is in [`folders-structure-frontend`](../folders-structure-frontend/SKILL.md) ; this skill is how they are wired. Paths are relative to `projects/frontend/apps/web/src/app/`.

## `inject()`, always

Field declarations, in components, services, functional guards and interceptors. A `constructor()` takes no parameters. No `@Inject(TOKEN)`. Toasts go through `StbToast`, never `MatSnackBar`.

## Repositories : port + adapter

- **Port** — `core/api/<bucket>/<name>.repository.ts` : `abstract class XxxRepository`, in domain types. It is both the type and the DI token.
- **Adapter** — `core/api/<bucket>/adapters/<name>.http.ts` : `HttpXxxRepository extends XxxRepository`, `@Injectable()` **without** `providedIn: 'root'`, which would bypass the binding. It owns the wire DTOs and their mapping.
- **Wiring** — one line in `provideRepositories()` (`core/providers.ts`), not in `app.config.ts` :

  ```typescript
  { provide: AccountRepository, useClass: HttpAccountRepository },
  ```

Components inject the port, never the adapter. Test doubles are in [`angular-testing`](../angular-testing/SKILL.md#doubles).

## Services without a port

If the implementation could plausibly have an HTTP variant and another one, it is a repository. One implementation forever is `providedIn: 'root'`.

- **`core/app-state/`** — root services shared across features : they carry signals, not a swappable contract, and reach the backend through a port (`AuthService` → `AuthRepository`), never through `HttpClient`.
- **A feature's own store** — `features/notes/notes.store.ts`, `features/calculator/calculator.store.ts` : a root service next to its feature, for state that lives in the browser and needs no port.
- **Pure functions** need no DI : `features/candidates/candidates.math.ts`, or `shared/<concept>/` once a second feature uses them.

**Eager construction** — a root service is built when something injects it. `ThemeService` / `LanguageService` apply their value from their constructor, so `App` injects them for that effect alone (`private readonly _theme = inject(ThemeService)`, `_`-prefixed for the unused-vars rule).

**Browser storage** — the app has no SSR target, so no platform gate. A `localStorage` write stays in a `try` / `catch` : private mode or a quota must not crash the app (`features/notes/notes.store.ts`).

## `app.config.ts`

A flat list of `provideX()` calls. A new app-wide Material default goes in `provideStbMaterial()` in the lib, not here and not in a component (see [`material-overrides`](../material-overrides/SKILL.md)).

Boot-time work goes through `provideAppInitializer`, a thin delegation to a service. `AuthService.refresh()` primes the user before the first route renders, and must never error : a failed initializer stops the bootstrap.

`LOCALE_ID` comes from `LanguageService.lang()` and is read once, which is why changing the language reloads the page.

## Provider scopes and tokens

Default to root and `provideRepositories()`. Below root is the exception, for a helper one feature must not leak. A custom `InjectionToken` is for a non-class value : `CALCULATOR_DETACHED` (`features/calculator/widgets/calculator-widgets.ts`), provided by a component and injected optionally.

## Cleanup

`toSignal(...)` unsubscribes on its own, `takeUntilDestroyed()` covers the other long streams (outside an injection context it needs a `DestroyRef`), and `inject(DestroyRef).onDestroy(...)` the rest. A one-shot HTTP call completes on its own.
