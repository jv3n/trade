---
name: angular-signals
description: Signal-based reactive state conventions for the PortfolioAI frontend (Angular 21, zoneless). Use when adding state to a service or component, deriving values with `computed()`, wiring side effects with `effect()`, or designing signal-based component I/O via `input()`/`output()`. Skips general Angular signals tutorial content.
---

# Angular Signals

The frontend is **zoneless** (`provideZonelessChangeDetection()` in `app.config.ts`). There is no `zone.js` dependency. Change detection is driven entirely by signal reads in templates — the framework re-renders a component when the signals its template reads change, and nothing else.

That makes signals the load-bearing primitive, not an optional state library. Every piece of UI state in this project is a `signal()` ; every derived value is a `computed()`. This skill is about the project's opinionated choices, not the API surface.

Pair with [`angular-di`](../angular-di/SKILL.md) for service wiring and [`angular-component`](../angular-component/SKILL.md) for the component shell.

## The canonical service shape

```typescript
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<Theme>(this.loadInitial());
  readonly theme = this._theme.asReadonly();

  set(theme: Theme): void { this._theme.set(theme); }
  toggle(): void { this._theme.update(t => t === 'dark' ? 'light' : 'dark'); }
}
```

**The pattern, line by line :**
- `private readonly _foo = signal<T>(initial)` — leading underscore marks the writable handle as internal.
- `readonly foo = this._foo.asReadonly()` — public read-only view. Components consume `foo()`, never see `_foo`.
- Mutations go through named methods (`set`, `toggle`, `update`) that own the validation / side-effect / persistence concerns.

Verbatim shape in `ThemeService`, `LanguageService`, `LlmTimeoutService`. Follow it for any new stateful root service — the internal/external split is the only thing the consumer ever needs to remember.

**Don't** expose `WritableSignal<T>` to component templates. The compiler can't tell `set()` from `update()` in a `(click)` handler, and the convention is what keeps mutation paths greppable.

## `computed()` — derived state, free updates

```typescript
@Component({ /* … */ })
export class Dashboard {
  private readonly portfolio = inject(PortfolioRepository);
  readonly portfolios = signal<Portfolio[]>([]);
  readonly query = signal('');

  readonly filtered = computed(() => {
    const q = this.query().toLowerCase();
    if (!q) return this.portfolios();
    return this.portfolios().filter(p => p.name.toLowerCase().includes(q));
  });

  readonly count = computed(() => this.filtered().length);
}
```

Every derived value should be a `computed`, not a method called from the template. Templates can call `filtered()` and `count()` ; the framework memoises the result and recomputes only when an upstream signal changes. A method `getFiltered()` re-runs on every change detection pass.

`computed()` callbacks should be **pure** — read signals, return a value, no side effects. If a derivation needs to write somewhere, that's an `effect()`.

## Side effects — at the mutation site, not in an `effect()`

`effect()` is **the last resort**, not the first. The project's convention for "when this signal changes, do X" is to put X in the method that mutates the signal — typically `set()` — and have all other writers go through that method (`toggle()` delegates to `set()`).

```typescript
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<Theme>(this.loadInitial());
  readonly theme = this._theme.asReadonly();

  constructor() {
    // Initial DOM sync — the `<html data-theme>` attribute must reflect the loaded value at boot,
    // even before any user action. No localStorage write here : the value already came from there.
    this.applyDom(this._theme());
  }

  set(theme: Theme): void {
    this._theme.set(theme);
    this.applyDom(theme);
    this.persist(theme);
  }

  toggle(): void { this.set(this._theme() === 'dark' ? 'light' : 'dark'); }

  private applyDom(theme: Theme): void { /* … */ }
  private persist(theme: Theme): void { /* … */ }
}
```

**Why not `effect()` here :**
1. **Redundant initial write** — `effect()` fires on construction with the loaded value, so the service writes `localStorage` echoing what it just read. Bénin, but it's a side effect that wasn't asked for.
2. **No composition** — `effect()` can't `debounceTime` or `distinctUntilChanged` a stream of changes. Set-site can call a debounced helper.
3. **Test pain** — asserting an `effect()` ran requires `TestBed.tick()` or microtask awaiting. Set-site side effects run synchronously, the test reads the result one line later.
4. **Implicit dependency tracking** — every signal read inside an `effect()` re-fires it. Easy to leak an unintended dependency by reading a sibling signal "just to compose the payload".

The codebase enforces this in `ThemeService`, `LanguageService`, `Dashboard` (sidebar accordion). All mutations route through a single method that writes the signal and any external state in the same call. **No `effect()` in `frontend/src/app/` main code today.**

### When `effect()` *is* justified

Three cases where set-site doesn't fit and `effect()` earns its keep :

1. **Reacting to signals you don't own** — input signals from a parent (`input.required<Foo>()`), or read-only signals from another service. You can't add the side effect inside the upstream's `set()` because you don't control it.
2. **Coordinating multiple signals** — when the side effect depends on N signals jointly and the mutation can come from any of them. Putting the same call at N set-sites is worse than centralising in one `effect()`.
3. **DOM imperative bridging** that genuinely needs to re-run on every change — focus management, third-party DOM library calls, canvas redraws.

Even there, prefer `toObservable() + takeUntilDestroyed()` when you need operators :

```typescript
// Debounced persist on a fast-changing signal (drag handlers, etc.)
constructor() {
  toObservable(this.sidebarState)
    .pipe(debounceTime(200), takeUntilDestroyed())
    .subscribe((state) => this.persist(state));
}
```

`toObservable()` gives you the full RxJS toolkit (debounce, distinct, switchMap) and an explicit subscription lifecycle — closer to "I subscribed, I'll be notified" than `effect()`'s magic re-firing.

### Rules if you do reach for `effect()`

1. **Justify it in a `// effect-because: …` comment** so a future reader doesn't assume set-site was tried and rejected by accident.
2. Created in an injection context — field initialiser, `constructor()`, or via an explicit injector. Never from inside an event handler.
3. **Read** every signal you want to track. Never write a signal the effect reads (feedback loop). Angular catches direct cycles at runtime but not indirect ones.
4. Browser-global side effects must gate on `isBrowser` from `PLATFORM_ID` — see [`angular-di > SSR-safe pattern`](../angular-di/SKILL.md#ssr-safe-pattern--platform_id--isplatformbrowser).

## Component-level signals — same pattern, narrower scope

```typescript
@Component({ /* … */ })
export class CsvImport {
  step = signal<ImportStep>('idle');
  preview = signal<CsvImportPreview | null>(null);
  error = signal<string | null>(null);

  readonly canConfirm = computed(() => this.step() === 'preview' && this.preview() !== null);
}
```

Components don't need the `private _foo / readonly foo` split — the template *is* the only consumer. Direct `public` signals are fine. The split matters when state crosses a public API (service exposing to many consumers).

For state that's structurally complex (an object with 5+ fields), prefer one signal of the object over five separate signals — the consumer can destructure but the source-of-truth stays atomic. Update with `.update(prev => ({ ...prev, field: v }))`.

## `input()` / `output()` — signal-based component I/O (Angular 21)

```typescript
@Component({ /* … */ })
export class CsvImport {
  imported = output<void>();      // replaces @Output() imported = new EventEmitter<void>()
  /* … */
  private confirm() {
    /* … */
    this.imported.emit();
  }
}

@Component({ /* … */ })
export class TickerChart {
  symbol = input.required<string>();           // typed, required
  benchmark = input<Benchmark | null>(null);   // optional with default

  readonly title = computed(() => `${this.symbol()} chart`);
}
```

Use `input()` / `output()` for all new components — the legacy `@Input()` / `@Output()` decorator syntax is deprecated in modern Angular and not part of the project's conventions.

**`input.required<T>()`** when the parent must provide a value — the compiler verifies at the call site. **`input<T>(default)`** when the input is optional. Inputs are *signals* on read : `this.symbol()`, not `this.symbol`. Combines naturally with `computed()` — derived state from inputs is the same shape as state derived from local signals.

## `computed()` vs method — when to use what

```typescript
// CORRECT — derivation is a computed
readonly canSubmit = computed(() => this.draft().trim().length > 0 && !this.saving());

// WRONG — method called from template, re-runs every change detection
canSubmit(): boolean { return this.draft().trim().length > 0 && !this.saving(); }
```

**Rule** : if the template reads it (`{{ canSubmit() }}`, `@if (canSubmit())`, `[disabled]="!canSubmit()"`), it's a `computed`. Methods are for actions, not for derivation.

**Exception** : a method called from an event handler (`(click)="save()"`) — that's an action, not derivation. Use a method.

## Signal equality — default reference, custom when shallow matters

```typescript
const user = signal<User>(
  { id: 1, name: 'Alice' },
  { equal: (a, b) => a.id === b.id }
);
```

Default `equal` is `Object.is`, which means a new object literal is always "different" even with identical fields. Pass a custom `equal` when you want to skip downstream recomputation on logically-equal updates (rare, but useful for object signals that get reassigned often from HTTP responses).

For arrays, the default is fine — array signals almost always change identity when mutated, and `equal` on arrays is too expensive to be the default.

## APIs the project doesn't use today (but are available)

- **`linkedSignal()`** — dependent state with auto-reset on source change. No current usage. Reach for it when a piece of UI state depends on a list and needs to "snap" to a sensible default when the list changes (e.g. "selected portfolio resets when the portfolios list reloads").
- **`toSignal()` / `toObservable()`** — RxJS interop. No current usage in main code (the `Dashboard` debounced search uses RxJS directly via `takeUntilDestroyed`, not via `toSignal`). **Recommended path** for the rare cases where set-site side-effects don't fit (see [Side effects](#side-effects--at-the-mutation-site-not-in-an-effect)) — `toObservable()` gives the RxJS toolkit (`debounceTime`, `distinctUntilChanged`, `switchMap`) with explicit subscription lifecycle, both of which `effect()` lacks. `toSignal()` is the other direction : bridge an existing observable source into a signal a template can consume.
- **`untracked()`** — read a signal inside a `computed`/`effect` without subscribing to it. Niche. Useful when a derivation needs the *current* value but shouldn't re-fire on its updates. Avoid until a specific case demands it ; misuse silently breaks reactivity.

If you reach for any of these, this skill should grow a real section citing the first project usage.

## When NOT to use signals

- **Constants and module-level config** — `const STORAGE_KEY = 'portfolioai.theme'` doesn't need to be a signal. Plain constants stay plain.
- **RxJS streams from HTTP repositories** — repositories return `Observable<T>`, and feature code typically `firstValueFrom(...)`s into a `Promise<T>` then `set()`s into a signal. Don't expose `Observable<T>` from your service signature unless the consumer genuinely benefits from operators ; signals are the consumer-facing type.
- **Form state with reactive forms** — `FormControl`, `FormGroup` already implement their own reactive model with `valueChanges`. Don't duplicate into a signal ; subscribe (with `takeUntilDestroyed`) or use `toSignal` to bridge.
