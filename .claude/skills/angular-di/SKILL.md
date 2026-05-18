---
name: angular-di
description: Dependency injection conventions for the PortfolioAI frontend (Angular 21). Use when adding a repository (port + adapter), creating a service, wiring providers in `app.config.ts`, injecting in a component, or handling SSR-safe browser-only dependencies. Skips general Angular DI tutorial content.
---

# Angular Dependency Injection

Project-specific Angular DI choices. Pair with [`folders-structure-frontend`](../folders-structure-frontend/SKILL.md) for *where* files live; this skill is *how* to wire them.

The frontend is signal-first and zoneless. DI is the only state-management framework the project uses. Two patterns dominate: `inject()` everywhere, and abstract-class ports wired in a `provideRepositories()` factory.

## `inject()` over constructor parameters

```typescript
@Injectable({ providedIn: 'root' })
export class LlmTimeoutService {
  private readonly repo = inject(ConfigRepository);
}

@Component({ /* … */ })
export class TickerView {
  private readonly market = inject(MarketRepository);
  private readonly route = inject(ActivatedRoute);
}
```

`inject()` is the default. Constructor parameters are reserved for the rare component that wires an `effect()` at construction — and even then, the dependency itself is grabbed with `inject()` at field declaration; the constructor body just sets up the effect.

Don't mix the two styles in one file. Don't reach for `@Inject(TOKEN)` decorator syntax — `inject(TOKEN)` covers the same cases.

## Repositories: port + adapter via `provideRepositories()`

The central DI pattern. Each repository ships as:

- **Port** — `core/api/<bucket>/<name>.repository.ts`: `abstract class XxxRepository` declaring the contract. Doubles as the type and the DI token — **no `InjectionToken` needed**.
- **Adapter** — `core/api/<bucket>/adapters/<name>.http.ts` (or `.local.ts`): `HttpXxxRepository extends XxxRepository`, decorated `@Injectable()` **without** `providedIn: 'root'`.
- **Wiring** — added to `provideRepositories()` in `core/providers.ts`.

```typescript
// core/providers.ts
export function provideRepositories(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: PortfolioRepository, useClass: HttpPortfolioRepository },
    { provide: WatchlistRepository, useClass: HttpWatchlistRepository },
    { provide: AnnotationRepository, useClass: LocalStorageAnnotationRepository },
    /* … 15 ports total */
  ]);
}
```

`makeEnvironmentProviders` wraps the list so `app.config.ts` stays a clean list of `provideX()` calls — same shape as `provideRouter()` and `provideHttpClient()`. **Don't** flatten providers into `app.config.ts` directly; the indirection is the point.

Components inject the **port**, never the adapter:

```typescript
private readonly portfolio = inject(PortfolioRepository);  // gets HttpPortfolioRepository
```

Tests mock the port via `{ provide: PortfolioRepository, useClass: MockPortfolioRepository }` (use `useClass extends` when the port carries inherited builders — see [`angular-signals > Resource builders`](../angular-signals/SKILL.md#resource-builders-live-on-the-port-itself)).

**Adding a new repository**: create the abstract port, the adapter, and add one line to `provideRepositories()`. Don't slap `providedIn: 'root'` on the adapter — that bypasses the binding and makes the port→adapter swap harder.

## `providedIn: 'root'` for stateful services that aren't repositories

```typescript
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<Theme>('dark');
  readonly theme = this._theme.asReadonly();
}
```

Today: `ThemeService`, `LanguageService`, `AuthService`, `JobStreamService`, `LlmTimeoutService`, `OllamaStatusService`. All carry signal state, not a swappable contract, so port+adapter overhead isn't justified.

**Rule of thumb**: if the implementation could plausibly have an HTTP variant *and* a local/mock variant, it's a repository (port + adapter). One implementation forever → `providedIn: 'root'`.

## SSR-safe pattern — `PLATFORM_ID` + `isPlatformBrowser`

Services touching browser globals (`document`, `localStorage`, `navigator`) must gate every access on the platform check, even though the app doesn't ship SSR — Vitest runs in jsdom which has some of these but not all.

```typescript
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  set(theme: Theme): void {
    this._theme.set(theme);
    if (!this.isBrowser) return;
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // localStorage unavailable (private mode, quota exceeded); silently ignore
    }
  }
}
```

The `try { … } catch` around `localStorage` handles private mode / quota exceeded — don't crash the app on a write that doesn't matter.

## `provideAppInitializer` for boot-time priming

When a service's initial value depends on an async fetch, prime it before first render:

```typescript
// app.config.ts
provideAppInitializer(() => inject(LlmTimeoutService).refresh()),
provideAppInitializer(() => inject(AuthService).refresh()),
```

The initializer returns `Observable | Promise | void`; Angular waits for completion before bootstrapping routed components. Without this, the LLM timeout label would show the hardcoded 400s default and only flip to the user's saved value after a reload.

**Don't** chain initializer calls when one can be split inside the service. The initializer is a single line that delegates; logic lives in the service.

## Provider scopes — when to scope below root

Default to `providedIn: 'root'` (or the global `provideRepositories()`). Component-scoped providers earn their keep for a stateful helper logically owned by one feature that shouldn't leak across.

```typescript
@Component({
  selector: 'app-narrative-editor',
  providers: [NarrativeDraftStore],  // fresh instance per editor mount
})
```

No instances in the codebase today. Route-level providers (`{ path: 'foo', providers: [...] }`) similarly absent — flag if tempted; the wiring is non-obvious.

## Injection tokens — rare

Custom `InjectionToken<T>` is for **non-class values**: config objects, primitives, factory results. None today. Canonical shape if needed:

```typescript
export const ENVIRONMENT_NAME = new InjectionToken<string>('ENVIRONMENT_NAME', {
  providedIn: 'root',
  factory: () => (typeof window !== 'undefined' ? 'browser' : 'node'),
});
```

Self-providing factory (option 2 of `InjectionToken`'s constructor) means no extra `app.config.ts` entry.

**Don't** reach for a token when a class would do: `inject(ConfigRepository)` beats `inject(CONFIG_REPOSITORY_TOKEN)`. The abstract-class trick (port = abstract class = DI token) means almost nothing here needs a separate token.

## `DestroyRef` + `takeUntilDestroyed` for RxJS cleanup

```typescript
ngOnInit() {
  this.searchControl.valueChanges
    .pipe(
      debounceTime(300),
      takeUntilDestroyed(this.destroyRef),
      switchMap(q => this.market.searchSymbols(q ?? '')),
    )
    .subscribe(/* … */);
}
```

Without an explicit `DestroyRef`, `takeUntilDestroyed()` uses the *current injection context* — works at field declaration but **not** in lifecycle hooks. Pass the ref explicitly when subscribing inside `ngOnInit`.

## When NOT to follow these patterns

- **Tests** — `provideTranslateService({ lang: 'en' })` and `{ provide: PortfolioRepository, useClass: MockPortfolioRepository }` are standard.
- **One-shot utility functions** — pure functions don't need DI. Put them in `shared/<concept>/` (see [`folders-structure-frontend`](../folders-structure-frontend/SKILL.md)), not as an injectable.
- **Cross-feature state that's signals all the way down** — if a piece of state can be a `signal()` exported from a `core/app-state/<name>.service.ts`, it doesn't need its own port. Reserve port+adapter for things with a swappable implementation contract.
