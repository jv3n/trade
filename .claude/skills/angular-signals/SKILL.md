---
name: angular-signals
description: Signal-based reactive state conventions for the PortfolioAI frontend (Angular 22, zoneless). Use when adding state to a service or component, deriving values with `computed()`, wiring side effects with `effect()`, designing signal-based component I/O via `input()`/`output()`, bridging RxJS with `toSignal()`/`toObservable()`, or forcing an effect to re-fire when no dependency changed. Skips general Angular signals tutorial content.
---

# Angular Signals

The frontend is **zoneless** (`provideZonelessChangeDetection()`). No `zone.js`. Change detection is driven by signal reads in templates — components re-render when the signals their template reads change, and nothing else.

That makes signals the load-bearing primitive. Every piece of UI state is a `signal()`; every derived value is a `computed()`. This skill is about the project's opinionated choices, not the API surface. Paths below are relative to `projects/frontend/apps/web/src/app/`.

Pair with [`angular-di`](../angular-di/SKILL.md) (service wiring) and [`angular-component`](../angular-component/SKILL.md) (component shell).

## The canonical service shape

```typescript
// core/app-state/sidenav-collapse.service.ts
@Injectable({ providedIn: 'root' })
export class SidenavCollapseService {
  private readonly _collapsed = signal<boolean>(this.loadInitial());
  readonly collapsed = this._collapsed.asReadonly();

  toggle(): void { this.set(!this._collapsed()); }

  set(value: boolean): void {
    this._collapsed.set(value);
    this.persist(value);
  }
}
```

- `private readonly _foo = signal<T>(initial)` — underscore marks the writable handle as internal.
- `readonly foo = this._foo.asReadonly()` — public read-only view. Consumers call `foo()`, never see `_foo`.
- Mutations go through named methods (`set`, `toggle`, `clear`) that own validation / side effects / persistence.
- Derived public state is a `computed()` — `AuthService.isAuthenticated`, `AuthService.isAdmin`.

Same shape in `AuthService` (`_currentUser` / `currentUser`, `_lastError` / `lastError`). Follow it for any new stateful root service. **Don't expose a `WritableSignal<T>` from a service** — mutation paths stay greppable through the named methods.

### Derived services — `computed()` over another service's signal

When the value is owned elsewhere, don't mirror it into a local signal — derive it. `ThemeService` and `LanguageService` hold no state of their own: the theme / language is a user preference served by `/api/me`.

```typescript
// core/app-state/theme.service.ts
readonly theme = computed<Theme>(() => this.auth.currentUser()?.theme ?? DEFAULT_THEME);

set(theme: Theme): void {
  this.auth.updatePreferences({ theme }).subscribe(); // currentUser update re-drives `theme`
}
```

One source of truth (`AuthService.currentUser`), no local mirror to keep in sync.

## `computed()` — derived state, free updates

```typescript
// features/journal/journal-page.ts
readonly activeFilterCount = computed(() => {
  const f = this.appliedFilter();
  let n = 0;
  if (f.dateFrom || f.dateTo) n += 1;
  if (f.plays.length > 0) n += 1;
  // …
  return n;
});

// features/candidates/candidates-page.ts
readonly gus = computed(() => gusPercent(this.model().previousClose, this.model().openPrice));
```

Every value the template reads (`{{ x() }}`, `@if (x())`, `[disabled]="!x()"`) is a `computed`, not a method — the framework memoises and recomputes only when an upstream signal changes. Methods are for actions (`(click)="save()"`). Heavy derivations delegate to pure functions (`features/candidates/candidates.math.ts`) called from the `computed`.

`computed()` callbacks must be **pure** — read signals, return a value, no side effects.

## Side effects — at the mutation site first

The default for "when this signal changes, do X" is to put X in the method that mutates the signal and have every writer go through it — `SidenavCollapseService.set()` writes localStorage right there, no `effect()` watching `_collapsed`.

Why not `effect()` when you own the signal:
1. **Redundant initial run** — `effect()` fires on construction, e.g. re-writing to localStorage the value just read from it.
2. **No composition** — no `debounceTime` / `distinctUntilChanged`.
3. **Test pain** — asserting an effect ran needs `TestBed.tick()`; a set-site runs synchronously.
4. **Implicit tracking** — every signal read inside re-fires it; easy to leak a dependency.

### When `effect()` is justified — real usages

1. **Reacting to signals you don't own.** `ThemeService` / `LanguageService` apply `theme()` / `lang()` to the DOM / `TranslateService.use()` via `effect()`, because the change comes from `AuthService.currentUser`. `LoginPage` redirects to `/account` when `auth.isAuthenticated()` flips. `NumberMaskDirective` (`shared/number-mask/`) re-syncs the input text when its `value` input changes.
2. **Coordinating several signals into one side effect** — the fetch effect of `journal-page.ts` / `stats-page.ts` (search, filter, sort, page, `refetchTrigger`), see below.
3. **Imperative DOM / third-party bridging** — `App` and `Settings` call `MatSidenavContainer.updateContentMargins()` when `sidenavCollapse.collapsed()` flips.

Rules when you reach for it:
- Create it in an injection context — field initialiser or `constructor()`. Never from an event handler.
- **Read** every signal you want to track; never write a signal the effect reads (feedback loop).
- If the effect must run before first paint, also apply once synchronously in the constructor (`this.applyDom(this.theme())` then `effect(...)` in `ThemeService`) — keep the applied write idempotent.
- Browser-global side effects gate on `isBrowser` — see [`angular-di > SSR-safe pattern`](../angular-di/SKILL.md#ssr-safe-pattern--platform_id--isplatformbrowser).
- Say *why* in a comment when the reason isn't obvious from the code.

## `refetchTrigger` — force the fetch effect to re-fire

List pages drive their backend query from one `effect()` over every query input. After a CRUD op the data on the server moved but none of those inputs changed — bump a dedicated counter:

```typescript
// features/journal/journal-page.ts
private readonly refetchTrigger = signal(0);

constructor() {
  effect(() => {
    const q = this.searchTerm();
    const f = this.appliedFilter();
    const sort = this.sort();
    const pageIndex = this.pageIndex();
    const pageSize = this.pageSize();
    this.refetchTrigger(); // read so the effect re-fires when the CRUD path bumps it
    this.fetch(/* filter + page built from the values above */);
  });
}

private refetch(): void {
  this.refetchTrigger.update((n) => n + 1);
}
```

Why a dedicated signal rather than re-pushing a current value:
- The search pipe ends with `distinctUntilChanged()` — pushing the same string back after a delete is swallowed and the table shows stale data (real bug hit on the journal CRUD).
- `n + 1` always changes identity, so the signal always notifies.
- Some paths don't need it: deleting the last row of a page decrements `pageIndex`, which already re-fires the effect.

Same pattern in `stats-page.ts`. Apply it to any page where one effect serves both "user changed a filter" and "data on the server moved".

## RxJS interop — `toSignal()` / `toObservable()`

Repositories return `Observable<T>`; components subscribe for one-shot calls and `set()` the result into signals (`fetch()` in `journal-page.ts`, CRUD ops with `tap` / `catchError` → snackbar). When a stream needs operators, bridge explicitly:

```typescript
// features/journal/journal-page.ts — debounced search
private readonly searchInput$ = new Subject<string>();
readonly searchTerm = toSignal(
  this.searchInput$.pipe(debounceTime(250), distinctUntilChanged()),
  { initialValue: '' },
);

// features/journal/add-trade-dialog/add-trade-dialog.ts — signal → debounced HTTP → signal
readonly statCandidates = toSignal(
  toObservable(this.statQuery).pipe(
    debounceTime(200),
    distinctUntilChanged((a, b) => a.ticker === b.ticker && a.dateMs === b.dateMs),
    switchMap((q) => /* statsRepo.findAll(...) */),
  ),
  { initialValue: [] as StatEntry[] },
);
```

`toSignal` on router streams gives reactive route state: `App.currentUrl` (from `router.events`), `queryParams` in `LoginPage` / `ErrorPage` (seeded with `route.snapshot.queryParamMap`). Always pass an `initialValue` so the signal is never `undefined`.

Not used today: `rxResource` / `resource()`, `linkedSignal()`, `untracked()`. If you introduce one, add a section here citing the first usage.

## Component-level signals

```typescript
// features/candidates/candidates-page.ts
readonly selectedId = signal<string | null>(null);
readonly model = signal<CandidateFormModel>(blankModel());
readonly entries = signal<CandidateEntry[]>([]);
```

Components don't need the `private _foo / readonly foo` split — the template is the only consumer; `readonly` public signals are fine.

Forms are a **single signal of the form model** (`model` in `candidates-page.ts`, `correction-dialog.ts`, `movement-dialog.ts`, `add-trade-dialog.ts`, `lexicon-dialog.ts`, `add-stat-dialog.ts`), updated with `.update((prev) => ({ ...prev, field: v }))`, with validation and derived values as `computed()` over it (`CorrectionDialog.targetInvalid`). Source of truth stays atomic.

## `input()` / `output()` — signal-based I/O

```typescript
// features/lexicon/lexicon-table/lexicon-table.ts
readonly entries = input.required<LexiconEntry[]>();
readonly editable = input(false);
readonly editEntry = output<LexiconEntry>();
readonly deleteEntry = output<LexiconEntry>();

// shared/number-mask/number-mask.directive.ts
readonly decimals = input(2, { transform: numberAttribute });
readonly numberChange = output<number | null>();
```

Use `input()` / `output()` for all components and directives — no `@Input()` / `@Output()` decorators. `input.required<T>()` when the parent must provide, `input<T>(default)` otherwise. Reads are signal calls: `this.entries()`. Lib directives follow the same rule (`StbSize.stbSize = input.required<StbButtonSize>()` + `computed` host class).

## When NOT to use signals

- **Constants** — plain `readonly` fields (`readonly pageSizeOptions = [10, 25, 50, 100]`, `readonly plays = TRADE_PLAYS`).
- **Repository signatures** — ports return `Observable<T>`; don't wrap them in signals at the port level.
