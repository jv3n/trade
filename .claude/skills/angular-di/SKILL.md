---
name: angular-di
description: Dependency injection conventions for the PortfolioAI frontend (Angular 21). Use when adding a repository (port + adapter), creating a service, wiring providers in `app.config.ts`, injecting in a component, or handling SSR-safe browser-only dependencies. Skips general Angular DI tutorial content.
---

# Angular Dependency Injection

Project-specific Angular DI choices. Pair with [`folders-structure-frontend`](../folders-structure-frontend/SKILL.md) for *where* the files live ; this skill is about *how* to wire them.

The frontend is signal-first and zoneless (`provideZonelessChangeDetection()` in `app.config.ts`), so DI is the only state-management framework the project uses. Two patterns dominate : `inject()` everywhere, and abstract-class ports wired in a `provideRepositories()` factory.

## `inject()` over constructor parameters

```typescript
// CORRECT
@Injectable({ providedIn: 'root' })
export class LlmTimeoutService {
  private readonly repo = inject(ConfigRepository);
  /* … */
}

// CORRECT for components — constructor stays empty unless side-effects are needed
@Component({ /* … */ })
export class TickerView {
  private readonly market = inject(MarketRepository);
  private readonly route = inject(ActivatedRoute);
}
```

`inject()` is the project's default everywhere. Constructor parameters are reserved for the rare component that needs to wire an `effect()` at construction (see [`angular-signals`](../angular-signals/SKILL.md)) — and even there, the dependency itself is grabbed with `inject()` at field declaration, the constructor body just sets up the effect.

Don't mix the two styles in one file. Don't reach for `@Inject(TOKEN)` decorator syntax — `inject(TOKEN)` covers the same cases and reads better.

## Repositories : port + adapter via `provideRepositories()`

The frontend's central DI pattern is the hexagonal split documented in `folders-structure-frontend`. Each repository ships as :

- **Port** — `core/<name>.repository.ts` : `abstract class XxxRepository` declaring the contract. Doubles as the type and the DI token — no `InjectionToken` needed.
- **Adapter** — `core/adapters/<name>.http.ts` (or `.local.ts`) : `HttpXxxRepository extends XxxRepository`, decorated `@Injectable()` **without** `providedIn: 'root'`.
- **Wiring** — added to `provideRepositories()` in `core/providers.ts`.

```typescript
// core/providers.ts
export function provideRepositories(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: PortfolioRepository, useClass: HttpPortfolioRepository },
    { provide: WatchlistRepository, useClass: HttpWatchlistRepository },
    { provide: AnnotationRepository, useClass: LocalStorageAnnotationRepository },
    /* … 14 ports total today */
  ]);
}
```

`makeEnvironmentProviders` wraps the list in an `EnvironmentProviders` so `app.config.ts` stays a clean list of `provideX()` calls — same shape as `provideRouter()` and `provideHttpClient()`. **Don't** flatten the providers into `app.config.ts` directly ; the indirection is the point.

Components inject the **port**, never the adapter :

```typescript
@Component({ /* … */ })
export class Dashboard {
  private readonly portfolio = inject(PortfolioRepository);  // gets HttpPortfolioRepository
}
```

Tests mock the port via `{ provide: PortfolioRepository, useValue: mockRepo }`. Never reach for the adapter type in test setup.

**Adding a new repository** : create the abstract port file, the HTTP (or local) adapter, and add one line to `provideRepositories()`. Don't slap `providedIn: 'root'` on the adapter — that bypasses the binding and makes the port→adapter swap harder.

## `providedIn: 'root'` for stateful services that aren't repositories

Services that hold app-wide state and aren't behind a port use the simpler tree-shakable form :

```typescript
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<Theme>('dark');
  readonly theme = this._theme.asReadonly();
  /* … */
}
```

In the codebase today : `ThemeService`, `LanguageService`, `JobStreamService`, `LlmTimeoutService`, `OllamaStatusService`. All of them carry signal state, not a swappable contract, so the port+adapter overhead isn't justified.

Rule of thumb : if the implementation could plausibly have an HTTP variant *and* a local/mock variant, it's a repository (port + adapter). If there's exactly one implementation forever, `providedIn: 'root'` is fine.

## SSR-safe pattern — `PLATFORM_ID` + `isPlatformBrowser`

Services that touch browser-only globals (`document`, `localStorage`, `navigator`) must gate every access on the platform check, even though the app doesn't ship SSR today — the test suite would break otherwise (Vitest runs in jsdom, which has *some* of these but not always).

```typescript
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly _theme = signal<Theme>(this.loadInitial());

  constructor() {
    effect(() => {
      const t = this._theme();
      if (!this.isBrowser) return;
      document.documentElement.setAttribute('data-theme', t);
      try {
        localStorage.setItem(STORAGE_KEY, t);
      } catch {
        // localStorage unavailable (private mode, quota exceeded); silently ignore
      }
    });
  }
}
```

Same pattern in `LanguageService`. The `try { … } catch` around `localStorage` calls handles private mode / quota exceeded — don't crash the app on a write that doesn't matter.

## `provideAppInitializer` for boot-time priming

When a service's initial value depends on an async fetch, prime it before the first render via `provideAppInitializer`. The project uses it once today, for `LlmTimeoutService` :

```typescript
// app.config.ts
provideAppInitializer(() => inject(LlmTimeoutService).refresh()),
```

The initializer returns an `Observable<void>` (the project's RxJS-only rule — see [`angular-signals > RxJS-only`](../angular-signals/SKILL.md#rxjs-only--no-promise-no-firstvaluefrom)) ; Angular accepts `Observable | Promise | void` natively and waits for completion before bootstrapping the routed components. Without this, the configuration page would render the LLM timeout label with the hardcoded default (400 s) and only flip to the user's saved value after a manual reload.

**Don't** chain `provideAppInitializer` calls when one can be split inside the service. The initializer should be a single line that delegates ; logic lives in the service.

## Provider scopes — when to scope below root

Default to `providedIn: 'root'` (or the global `provideRepositories()`). Component-scoped providers earn their keep in one case : a stateful helper that's logically owned by one feature and shouldn't leak across.

```typescript
@Component({
  selector: 'app-narrative-editor',
  providers: [NarrativeDraftStore],  // fresh instance per editor mount
  /* … */
})
export class NarrativeEditor {
  private readonly draft = inject(NarrativeDraftStore);
}
```

No instances of this pattern in the codebase today — every service is either a repository or a root singleton. If a feature evolves to need scoped state, prefer this over a sibling signal that the parent passes down.

Route-level providers (`{ path: 'foo', providers: [...] }`) are similarly absent — flag if you're tempted to introduce one, the wiring is non-obvious and the tradeoff against `providedIn: 'root'` should be explicit.

## Injection tokens — rare, but real

Custom `InjectionToken<T>` is reserved for **non-class values** that need DI : config objects, primitives, factory results. The project doesn't use any today, but the canonical shape if one becomes necessary :

```typescript
export const ENVIRONMENT_NAME = new InjectionToken<string>('ENVIRONMENT_NAME', {
  providedIn: 'root',
  factory: () => (typeof window !== 'undefined' ? 'browser' : 'node'),
});
```

Self-providing factory (option 2 of `InjectionToken`'s constructor) means no extra `app.config.ts` entry. Use this over `{ provide: TOKEN, useValue: ... }` unless the value needs to be different per environment.

**Don't** reach for a token when a class would do : `inject(ConfigRepository)` is preferable to `inject(CONFIG_REPOSITORY_TOKEN)`. The abstract-class trick (port = abstract class = DI token) means almost nothing in this codebase needs a separate token.

## `DestroyRef` + `takeUntilDestroyed` for RxJS cleanup

Components that subscribe to RxJS streams use `takeUntilDestroyed()` instead of manual `ngOnDestroy` + `Subject.next()` :

```typescript
@Component({ /* … */ })
export class Dashboard {
  private readonly destroyRef = inject(DestroyRef);
  private readonly market = inject(MarketRepository);

  ngOnInit() {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        takeUntilDestroyed(this.destroyRef),
        switchMap(q => this.market.searchSymbols(q ?? '')),
      )
      .subscribe(/* … */);
  }
}
```

Without an explicit `DestroyRef`, `takeUntilDestroyed()` uses the *current injection context* — which works at field declaration time but **not** in lifecycle hooks. Pass the ref explicitly when subscribing inside `ngOnInit`.

## When NOT to follow these patterns

- **Tests** — `provideTranslateService({ lang: 'en' })` and `{ provide: PortfolioRepository, useValue: mockRepo }` are standard. The `core/adapters/*.http.ts` real adapter is replaced by a mock implementing the same port abstract class.
- **One-shot utility functions** — pure functions don't need DI. A `formatPercent(value: number): string` belongs in a `core/utils.ts` module, not as an injectable.
- **Cross-feature state that's signals all the way down** — if a piece of state can be a `signal()` exported from a `core/<name>.service.ts` (or even a top-level module-level const), it doesn't need its own port. Reserve port+adapter for things that have a swappable implementation contract.
