---
name: angular-signals
description: Signal-based reactive state conventions for the PortfolioAI frontend (Angular 21, zoneless). Use when adding state to a service or component, deriving values with `computed()`, wiring side effects with `effect()`, or designing signal-based component I/O via `input()`/`output()`. Skips general Angular signals tutorial content.
---

# Angular Signals

The frontend is **zoneless** (`provideZonelessChangeDetection()`). No `zone.js`. Change detection is driven by signal reads in templates — components re-render when the signals their template reads change, and nothing else.

That makes signals the load-bearing primitive. Every piece of UI state is a `signal()`; every derived value is a `computed()`. This skill is about the project's opinionated choices, not the API surface.

Pair with [`angular-di`](../angular-di/SKILL.md) (service wiring) and [`angular-component`](../angular-component/SKILL.md) (component shell).

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

- `private readonly _foo = signal<T>(initial)` — underscore marks the writable handle as internal.
- `readonly foo = this._foo.asReadonly()` — public read-only view. Consumers call `foo()`, never see `_foo`.
- Mutations go through named methods (`set`, `toggle`, `update`) that own validation / side-effects / persistence.

Verbatim shape in `ThemeService`, `LanguageService`, `LlmTimeoutService`. Follow it for any new stateful root service.

**Don't expose `WritableSignal<T>` to component templates.** The compiler can't tell `set()` from `update()` in a `(click)` handler, and the convention keeps mutation paths greppable.

## Resource builders live on the port itself

For HTTP-backed `core/api/<bucket>/` ports, **don't expose `Observable<T>` raw to components**. The component would then have to wire `rxResource` + a trigger signal + an accumulator effect by hand — boilerplate easy to get wrong (a `.pipe(...)` without `.subscribe()` is silent — the bug we hit in `Suivi` before the 2026-05-16 fix).

**Convention** — the abstract class port carries two flavours of concrete builders inherited by every adapter:

```typescript
export abstract class SnapshotRepository {
  abstract getAll(): Observable<SnapshotSummary[]>;
  abstract getPositions(snapshotId: string): Observable<SnapshotPosition[]>;

  // Flavour 1 — eager fetch on subscribe.
  allResource() {
    return rxResource({ stream: () => this.getAll() });
  }

  // Flavour 2 — per-id cache. Returns a Signal<Map<id, T[]>> that grows as the trigger fires.
  positionsCache(trigger: Signal<string | undefined>) {
    const cache = signal(new Map<string, SnapshotPosition[]>());
    const resource = rxResource({
      params: () => trigger(),
      stream: ({ params }) =>
        this.getPositions(params).pipe(map((positions) => ({ id: params, positions }))),
    });
    effect(() => {
      const emit = resource.value();
      if (!emit) return;
      cache.update((m) => new Map(m).set(emit.id, emit.positions));
    });
    return cache.asReadonly();
  }
}
```

Component side stays minimal — no `.subscribe()`, no `ngOnInit`, no manual loading/error signals.

**Mock convention** — because the builders are concrete on the abstract class, doubles MUST extend the class via `useClass`, not provide a plain object via `useValue` (which loses the inherited builders):

```typescript
class MockSnapshotRepository extends SnapshotRepository {
  allSource = () => of<SnapshotSummary[]>([]);
  positionsSource = (id: string) => of<SnapshotPosition[]>([]);
  getAll() { return this.allSource(); }
  getPositions(id: string) { return this.positionsSource(id); }
}
```

Tests swap `allSource` / `positionsSource` on the instance; inherited `allResource()` / `positionsCache()` close over the mocks naturally.

**Why not `.subscribe()` in the component, or `rxMethod`?** Source and sink are both signals (`resource.value` → `Signal<Map<id, T[]>>`), so the natural primitive is `effect()` — auto-cleanup with the injection context, no RxJS round-trip. `rxMethod` is right when the source IS an observable and you want a method orchestrating a pipeline — not when both ends are signals.

**Adoption status** — pilot shipped on `SnapshotRepository` (2026-05-16). The 13 other repositories are tracked in `docs/projet/backlog.md > Dette technique` (🟡 Moyenne).

## `computed()` — derived state, free updates

```typescript
readonly filtered = computed(() => {
  const q = this.query().toLowerCase();
  return q ? this.portfolios().filter(p => p.name.toLowerCase().includes(q)) : this.portfolios();
});
readonly count = computed(() => this.filtered().length);
```

Every derived value is a `computed`, not a method called from the template. The framework memoises and recomputes only when an upstream signal changes. A method `getFiltered()` re-runs on every change-detection pass.

`computed()` callbacks must be **pure** — read signals, return a value, no side effects. If a derivation needs to write somewhere, that's an `effect()`.

## Side effects — at the mutation site, not in an `effect()`

`effect()` is **the last resort**, not the first. The project's convention for "when this signal changes, do X" is to put X in the method that mutates the signal — typically `set()` — and have all other writers go through it.

```typescript
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<Theme>(this.loadInitial());
  readonly theme = this._theme.asReadonly();

  constructor() {
    // Initial DOM sync. No localStorage write here — the value already came from there.
    this.applyDom(this._theme());
  }

  set(theme: Theme): void {
    this._theme.set(theme);
    this.applyDom(theme);
    this.persist(theme);
  }

  toggle(): void { this.set(this._theme() === 'dark' ? 'light' : 'dark'); }
}
```

**Why not `effect()` here:**
1. **Redundant initial write** — `effect()` fires on construction with the loaded value, so the service writes localStorage echoing what it just read.
2. **No composition** — `effect()` can't `debounceTime` / `distinctUntilChanged` a stream. Set-site can call a debounced helper.
3. **Test pain** — asserting an `effect()` ran requires `TestBed.tick()` or microtask awaiting. Set-site runs synchronously.
4. **Implicit dependency tracking** — every signal read inside `effect()` re-fires it. Easy to leak an unintended dependency.

The codebase enforces this in `ThemeService`, `LanguageService`, `Dashboard` sidebar. **No `effect()` in `frontend/src/app/` main code today.**

### When `effect()` *is* justified

1. **Reacting to signals you don't own** — input signals from a parent (`input.required<Foo>()`), or read-only signals from another service. You can't put the side-effect inside the upstream's `set()`.
2. **Coordinating multiple signals** — when the side-effect depends on N signals jointly and mutation can come from any.
3. **DOM imperative bridging** that needs to re-run on every change — focus management, third-party DOM library calls, canvas redraws.

Even then, prefer `toObservable() + takeUntilDestroyed()` when you need operators:

```typescript
constructor() {
  toObservable(this.sidebarState)
    .pipe(debounceTime(200), takeUntilDestroyed())
    .subscribe((state) => this.persist(state));
}
```

`toObservable()` gives the full RxJS toolkit and an explicit subscription lifecycle — closer to "I subscribed, I'll be notified" than `effect()`'s magic re-firing.

### Rules if you do reach for `effect()`

1. **Justify it in a `// effect-because: …` comment**.
2. Create in an injection context — field initialiser, `constructor()`, or via an explicit injector. Never from inside an event handler.
3. **Read** every signal you want to track. Never write a signal the effect reads (feedback loop).
4. Browser-global side effects must gate on `isBrowser` — see [`angular-di > SSR-safe pattern`](../angular-di/SKILL.md#ssr-safe-pattern--platform_id--isplatformbrowser).

## Component-level signals — same pattern, narrower scope

```typescript
export class CsvImport {
  step = signal<ImportStep>('idle');
  preview = signal<CsvImportPreview | null>(null);
  readonly canConfirm = computed(() => this.step() === 'preview' && this.preview() !== null);
}
```

Components don't need the `private _foo / readonly foo` split — the template is the only consumer. Direct `public` signals are fine. The split matters when state crosses a public API (service exposing to many consumers).

For state with 5+ fields, prefer one signal of the object over five separate signals — source-of-truth stays atomic. Update with `.update(prev => ({ ...prev, field: v }))`.

## `input()` / `output()` — signal-based component I/O

```typescript
export class TickerChart {
  symbol = input.required<string>();
  benchmark = input<Benchmark | null>(null);
  readonly title = computed(() => `${this.symbol()} chart`);
}

export class CsvImport {
  imported = output<void>();
  private confirm() { /* … */ this.imported.emit(); }
}
```

Use `input()` / `output()` for all new components — legacy `@Input()` / `@Output()` decorators are not the project convention. **`input.required<T>()`** when the parent must provide; **`input<T>(default)`** otherwise. Reads are signal calls: `this.symbol()`, not `this.symbol`.

## `computed()` vs method — when to use what

If the template reads it (`{{ x() }}`, `@if (x())`, `[disabled]="!x()"`), it's a `computed`. Methods are for actions, not derivation.

Exception: a method called from an event handler (`(click)="save()"`) — that's an action.

## APIs the project doesn't use today

- **`linkedSignal()`** — dependent state with auto-reset on source change. Reach for it when UI state depends on a list and needs to "snap" to a sensible default when the list reloads.
- **`toSignal()` / `toObservable()`** — RxJS interop. `toObservable()` is the recommended path for rare cases where set-site side-effects don't fit (see [Side effects](#side-effects--at-the-mutation-site-not-in-an-effect)).
- **`untracked()`** — read a signal inside a `computed`/`effect` without subscribing. Niche; avoid until a specific case demands it.

If you reach for any of these, this skill should grow a section citing the first project usage.

## When NOT to use signals

- **Constants and module-level config** — plain consts stay plain.
- **RxJS streams from HTTP repositories** — return `Observable<T>`; feature code typically `firstValueFrom(...)`s into a `Promise<T>` then `set()`s into a signal. Don't expose `Observable<T>` from your service signature unless the consumer benefits from operators.
- **Form state with reactive forms** — `FormControl` / `FormGroup` already implement their own reactive model. Don't duplicate; bridge with `toSignal` if needed.
