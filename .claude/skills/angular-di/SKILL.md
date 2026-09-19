---
name: angular-di
description: Dependency injection conventions for the PortfolioAI frontend (Angular 22, zoneless, standalone). Use when adding a repository (port + adapter), creating a service, wiring providers in `app.config.ts`, injecting in a component, or handling SSR-safe browser-only dependencies. Skips general Angular DI tutorial content.
---

# Angular Dependency Injection

Project-specific Angular DI choices. Pair with [`folders-structure-frontend`](../folders-structure-frontend/SKILL.md) for *where* files live; this skill is *how* to wire them. Paths below are relative to `projects/frontend/apps/web/src/app/`.

The frontend is signal-first and zoneless. DI is the only state-management framework the project uses. Two patterns dominate: `inject()` everywhere, and abstract-class ports wired in a `provideRepositories()` factory.

## `inject()` over constructor parameters

```typescript
// core/app-state/auth.service.ts
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly repo = inject(AuthRepository);
}

// features/account/account-page.ts
export class AccountPage {
  private readonly repo = inject(AccountRepository);
  private readonly forex = inject(ForexRepository);
}
```

`inject()` is the default — field declarations for services, repositories, `ActivatedRoute`, `Router`, `MatDialog`, `MatSnackBar`, `TranslateService`. The `constructor()` exists only to set up an `effect()` or run initial loading; it takes no parameters. Functional guards and interceptors (`core/router/auth.guards.ts`, `core/http/auth.interceptor.ts`) call `inject()` in their body too.

Don't reach for `@Inject(TOKEN)` decorator syntax — `inject(TOKEN)` covers the same cases.

## Repositories: port + adapter via `provideRepositories()`

The central DI pattern. Each repository ships as:

- **Port** — `core/api/<bucket>/<name>.repository.ts`: `abstract class XxxRepository` declaring the contract in domain types (native `Date`, domain models). Doubles as the type and the DI token — **no `InjectionToken` needed**.
- **Adapter** — `core/api/<bucket>/adapters/<name>.http.ts`: `HttpXxxRepository extends XxxRepository`, decorated `@Injectable()` **without** `providedIn: 'root'`. Owns the wire DTOs and the wire ↔ domain mapping (see `HttpAccountRepository`).
- **Wiring** — one line in `provideRepositories()` in `core/providers.ts`.

```typescript
// core/providers.ts
export function provideRepositories(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: AccountRepository, useClass: HttpAccountRepository },
    { provide: ForexRepository, useClass: HttpForexRepository },
    { provide: ConfigRepository, useClass: HttpConfigRepository },
    { provide: AuthRepository, useClass: HttpAuthRepository },
    { provide: JournalRepository, useClass: HttpJournalRepository },
    { provide: CandidatesRepository, useClass: HttpCandidatesRepository },
    { provide: StatsRepository, useClass: HttpStatsRepository },
    { provide: LexiconRepository, useClass: HttpLexiconRepository },
  ]);
}
```

`makeEnvironmentProviders` wraps the list so `app.config.ts` stays a list of `provideX()` calls — same shape as `provideRouter()` and `provideHttpClient()`. **Don't** flatten repository bindings into `app.config.ts`; the indirection is the point.

Components inject the **port**, never the adapter:

```typescript
private readonly repo = inject(JournalRepository); // gets HttpJournalRepository
```

**Adding a new repository**: create the abstract port, the adapter, and add one line to `provideRepositories()`. Don't put `providedIn: 'root'` on the adapter — that bypasses the binding and makes the port→adapter swap harder.

**Test doubles** bind the port:

- `useClass` with a class that `extends` the port — `MockCandidatesRepository extends CandidatesRepository` in `features/candidates/candidates-page.spec.ts`, `StubRepository extends AuthRepository` in `core/app-state/auth.service.spec.ts`. The compiler flags a missing method when the port grows.
- `useValue` with a partial object when the test only touches one or two methods — `{ provide: StatsRepository, useValue: { create: vi.fn(() => of(undefined)) } }`.
- Adapter specs bind the real adapter: `{ provide: AccountRepository, useClass: HttpAccountRepository }` + `provideHttpClientTesting()`.

## `providedIn: 'root'` for app-state services

```typescript
// core/app-state/sidenav-collapse.service.ts
@Injectable({ providedIn: 'root' })
export class SidenavCollapseService {
  private readonly _collapsed = signal<boolean>(this.loadInitial());
  readonly collapsed = this._collapsed.asReadonly();
}
```

Today: `AuthService`, `ThemeService`, `LanguageService`, `SidenavCollapseService` in `core/app-state/`. They carry signal state, not a swappable contract, so port+adapter overhead isn't justified. They talk to the backend **through** a port (`AuthService` → `AuthRepository`), never through `HttpClient` directly.

**Rule of thumb**: if the implementation could plausibly have an HTTP variant *and* a mock/local variant, it's a repository (port + adapter). One implementation forever → `providedIn: 'root'`.

**Eager construction** — a root service is only built when something injects it. `ThemeService` / `LanguageService` apply their value to the DOM / ngx-translate from their constructor, so `App` injects them purely for that side effect (`private readonly _theme = inject(ThemeService);` in `app.ts`, `_`-prefixed so the unused-vars lint rule lets it through).

## SSR-safe pattern — `PLATFORM_ID` + `isPlatformBrowser`

Services touching browser globals (`document`, `localStorage`, `navigator`, `window`) gate every access on the platform check, even though the app doesn't ship SSR.

```typescript
// core/app-state/sidenav-collapse.service.ts
private readonly platformId = inject(PLATFORM_ID);
private readonly isBrowser = isPlatformBrowser(this.platformId);

private persist(value: boolean): void {
  if (!this.isBrowser) return;
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // localStorage unavailable (private mode, quota exceeded); silently ignore
  }
}
```

Same guard in `ThemeService.applyDom` (`<html data-theme>`), `LanguageService` (`<html lang>`, `navigator.language`) and `LoginPage.signInWithGoogle` (`window.location`). The `try { … } catch` around `localStorage` handles private mode / quota exceeded — don't crash the app on a write that doesn't matter.

## `app.config.ts` — what lives there

A flat list of `provideX()` calls plus a few global Material options:

- `provideZonelessChangeDetection()`, `provideBrowserGlobalErrorListeners()`, `provideRouter(routes)`, `provideHttpClient(withInterceptors([authInterceptor]))`.
- `provideNativeDateAdapter()` at app level — `<mat-datepicker>` looks up the `DateAdapter` in the environment injector, a component-level import is too narrow (NG0201).
- **Global Material options** via DI tokens: `MAT_RIPPLE_GLOBAL_OPTIONS` (`{ disabled: true }` — no click ripples) and `MAT_FORM_FIELD_DEFAULT_OPTIONS` (`appearance: 'outline'`, `subscriptSizing: 'dynamic'`). Use `useValue: { … } satisfies XxxOptions`. A new app-wide Material default goes here, not in each component.
- `provideTranslateService({ lang: 'fr', fallbackLang: 'en' })` + `provideTranslateHttpLoader(...)`.
- `provideRepositories()`.
- A `GlitchtipErrorHandler` bound to `ErrorHandler` only when `!isDevMode()`.

## `provideAppInitializer` for boot-time work

```typescript
// app.config.ts
provideAppInitializer(() => inject(AuthService).refresh()),
provideAppInitializer(() => {
  const icons = inject(MatIconRegistry);
  icons.setDefaultFontSetClass('material-symbols-rounded', 'mat-ligature-font');
  icons.addSvgIcon(
    'portfolioai',
    inject(DomSanitizer).bypassSecurityTrustResourceUrl('img/logo/logo.svg'),
  );
}),
```

The initializer returns `Observable | Promise | void`; Angular waits for completion before bootstrapping. `AuthService.refresh()` primes `currentUser` so the route guards and the toolbar see the real session on the first paint — it must never error (it catches and completes). The icon initializer makes `<mat-icon>` ligatures render with Material Symbols Rounded (font loaded by `libs/ui/styles/_fonts.scss`) and registers the brand SVG.

Keep each initializer a thin delegation; logic lives in the service.

## Provider scopes and injection tokens — not used today

- No component-scoped (`@Component({ providers: [...] })`) or route-level (`{ path, providers }`) providers in app code. Default to root / `provideRepositories()`; scope below root only for a stateful helper owned by one feature that must not leak — and flag it, the wiring is non-obvious.
- No custom `InjectionToken`. Reserve one for **non-class values** (config objects, primitives); the abstract-class port already serves as the token for everything else. `inject(ConfigRepository)` beats `inject(CONFIG_REPOSITORY_TOKEN)`.

## Cleanup — `DestroyRef`

```typescript
// features/journal/journal-detail-page/journal-detail-page.ts
constructor() {
  // Revoke the object URL when the view is torn down — otherwise the blob leaks.
  inject(DestroyRef).onDestroy(() => this.clearObjectUrl());
  this.load();
}
```

For RxJS subscriptions that outlive a single HTTP call, prefer `toSignal(...)` (auto-unsubscribes with the injection context — see `journal-page.ts` `searchTerm`) or `takeUntilDestroyed()`. Called outside a field initialiser / constructor, `takeUntilDestroyed` needs an explicit `DestroyRef` argument. One-shot HTTP calls (`this.repo.delete(id).subscribe(...)`) complete on their own and need neither.

## When NOT to follow these patterns

- **Pure functions** don't need DI. Put them in `shared/<concept>/` or next to the feature (`features/candidates/candidates.math.ts`), not as an injectable.
- **Cross-feature UI state** that is signals all the way down belongs in a `core/app-state/<name>.service.ts`, not behind a port. Reserve port+adapter for things with a swappable implementation contract.
