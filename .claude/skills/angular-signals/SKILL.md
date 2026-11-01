---
name: angular-signals
description: Signal-based reactive state conventions for the PortfolioAI frontend (Angular 22, zoneless). Use when adding state to a service or component, deriving values with `computed()`, wiring side effects with `effect()`, designing signal-based component I/O via `input()`/`output()`, bridging RxJS with `toSignal()`, keeping filters in the URL, writing Signal Forms, or loading data through `rxResource()` (`keptValue`, write counters, `linkedSignal` copies). Skips general Angular signals tutorial content.
---

# Angular Signals

The frontend is **zoneless** (`provideZonelessChangeDetection()`). No `zone.js`. Change detection is driven by signal reads in templates — components re-render when the signals their template reads change, and nothing else.

That makes signals the load-bearing primitive. Every piece of UI state is a `signal()`; every derived value is a `computed()`. This skill is about the project's opinionated choices, not the API surface. Paths below are relative to `projects/frontend/apps/web/src/app/`.

Service wiring is in [`angular-di`](../angular-di/SKILL.md), the component shell in [`angular-component`](../angular-component/SKILL.md).

## The canonical service shape

```typescript
// core/app-state/auth.service.ts
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _currentUser = signal<CurrentUser | null>(null);
  readonly currentUser = this._currentUser.asReadonly();

  readonly isAuthenticated = computed(() => this._currentUser() !== null);
}
```

- `private readonly _foo = signal<T>(initial)` — underscore marks the writable handle as internal.
- `readonly foo = this._foo.asReadonly()` — public read-only view. Consumers call `foo()`, never see `_foo`.
- Mutations go through named methods (`set`, `toggle`, `clear`) that own validation / side effects / persistence.
- Derived public state is a `computed()` — `AuthService.isAuthenticated`, `AuthService.isAdmin`.

Follow it for any new stateful root service. **Don't expose a `WritableSignal<T>` from a service** — mutation paths stay greppable through the named methods.

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
// features/candidates/candidates-page.ts
readonly gapPreview = computed(() => gapPercent(this.model().previousClose, this.model().pmOpen));
```

Every value the template reads (`{{ x() }}`, `@if (x())`, `[disabled]="!x()"`) is a `computed`, not a method — the framework memoises and recomputes only when an upstream signal changes. Methods are for actions (`(click)="save()"`). Heavy derivations delegate to pure functions (`features/candidates/candidates.math.ts`) called from the `computed`.

`computed()` callbacks must be **pure** — read signals, return a value, no side effects.

## Side effects — at the mutation site first

The default for "when this signal changes, do X" is to put X in the method that mutates the signal and have every writer go through it — `features/notes/notes.store.ts` writes localStorage in its mutation, no `effect()` watching the state.

Why not `effect()` when you own the signal:
1. **Redundant initial run** — `effect()` fires on construction, e.g. re-writing to localStorage the value just read from it.
2. **No composition** — no `debounceTime` / `distinctUntilChanged`.
3. **Test pain** — asserting an effect ran needs `TestBed.tick()`; a set-site runs synchronously.
4. **Implicit tracking** — every signal read inside re-fires it; easy to leak a dependency.

### When `effect()` is justified — real usages

Only to sync with what Angular does not own (#375) :

1. **The DOM outside a template** — `ThemeService` writes `<html data-theme>` (and the detached Picture-in-Picture windows registered through `mirrorTo()`), `NumberMaskDirective` (`shared/number-mask/`) re-syncs the input's text when its `number` input changes, the account page scrolls to a fragment.
2. **A non-signal API** — `LanguageService` drives `TranslateService.use()` and `<html lang>`.
3. **Timers and third-party rendering** — `stbLoadGate` (`libs/ui`, the skeleton's delay and minimum), `StbChart` (echarts).

Not an effect : **loading data** (a resource, below), **navigating** (a route guard — `guestGuard` on `/login`), **state derived from other signals and still writable** (a `linkedSignal` — `App.menuOpen` closes on a navigation or a breakpoint crossing).

Rules when you reach for it:
- Create it in an injection context — field initialiser or `constructor()`. Never from an event handler.
- **Read** every signal you want to track; never write a signal the effect reads (feedback loop).
- If the effect must run before first paint, also apply once synchronously in the constructor (`this.applyDom(this.theme())` then `effect(...)` in `ThemeService`) — keep the applied write idempotent.
- Say *why* in a comment when the reason isn't obvious from the code — one line, and only then (cf. [`CLAUDE.md > Comments`](../../CLAUDE.md#comments--the-strict-minimum)).

## Loading data — `rxResource()`

Every page and dialog loads through `rxResource()` keyed on what it reads (#375) — never an `effect()` calling `fetch()`, never a hand-kept `Subscription`. A superseded request is cancelled by the framework.

```typescript
// features/journal/journal-page.ts
private readonly listing = rxResource({
  params: () => ({ filter: this.criteria(), page: /* index, size, sort */, writes: this.writes() }),
  stream: ({ params }) => this.repo.findDays(params.filter, params.page),
});
private readonly listed = keptValue(this.listing);
readonly loading = this.listing.isLoading;
readonly error = computed(() => this.listing.status() === 'error');
readonly days = computed(() => this.listed()?.content ?? []);
```

- **A write bumps a counter folded into the params** (`writes`, or scoped ones — `listingWrites` / `kpiWrites`, `dayWrites` / `accountWrites` / `locateWrites`), each declaration saying what bumps it. `reload()` is a **no-op while a load runs** (`ResourceImpl.reload()` returns `false` on `idle` / `loading`) — a write landing then would let the pre-write answer win. `reload()` only where the resource is known to be settled : the account page's « Retry », on a failed resource.
- **What the template shows** — `keptValue(resource)` (`shared/kept-value/`) holds the last answer while the next one loads, so a listing stays on screen, dimmed (#370). The rule : keep the stale answer while the next load answers **the same question**, drop it when the question changed. When only part of the params is the question (a write counter is not), pass it as `{ question }` — the trade sheet's locates, keyed on (day, ticker). When every change of params is a new question, read `hasValue()` raw — the new-locate dialog's PM opens of another day.
- **Failure** — `status() === 'error'`, or `lastLoadFailed(resource)` where a « Retry » can be clicked : it stays up while the retry runs.
- **A copy the user edits** — a `linkedSignal` off the loaded value : the trade sheet's draft, the access-control whitelist, the locates dialog's share price. A reload resets it ; an edit is a plain `set()`.
- **A server answer written back** — `resource.value.set()` / `.update()` (status `local`). Not while a load runs : it would cancel it — reload instead, and only once the server answered (`patchRow` on the stats sheet).
- **Reacting to a page that landed** — a `tap` in `stream` (`StatsPage.listed()`, `PatternsPage.openLinked()`) : the reaction belongs to every load, a reload after a write included. Name the method and say so in its KDoc.
- **Skeleton** — `readonly gate = stbLoadGate(this.loading)`, read as `gate.skeleton()` / `gate.content()` ; a refetch dims the rows with `[busy]="loading()"` on the `stbTable`. A resource is read as soon as the gate is created : declare the signals its params read, then the resource, then the gate.
- **Specs** — see [`angular-testing > settle()`](../angular-testing/SKILL.md#resources--settle).

## RxJS interop — `toSignal()`

Repositories return `Observable<T>`. Loads go through `rxResource()` (above) ; writes stay one-shot subscriptions (CRUD ops with `tap` / `catchError` → toast). When a stream needs operators, bridge explicitly:

```typescript
// features/journal/journal-page.ts — debounced search
private readonly searchInput$ = new Subject<string>();
readonly searchTerm = toSignal(
  this.searchInput$.pipe(debounceTime(250), distinctUntilChanged()),
  { initialValue: '' },
);
```

Pass an `initialValue` so the signal is never `undefined`, or `requireSync: true` on a stream that emits synchronously (route params).

**Filters in the URL** — a `toSignal` of `queryParamMap`, and a `linkedSignal` per control : a link sets the filter, and the user can still change it.

```typescript
// features/account/account-page.ts
private readonly query = toSignal(this.route.queryParamMap.pipe(map(movementsQueryFrom)), {
  requireSync: true,
});
readonly appliedFilter = linkedSignal<AccountFilter>(() => initialFilter(this.query()));
```

Not used today: `resource()` (promise-based), `toObservable()`, `untracked()` outside the lib. If you introduce one, add a section here citing the first usage.

## Component-level signals

Components don't need the `private _foo / readonly foo` split : the template is the only consumer, `readonly` public signals are fine.

**Forms are Signal Forms** — a single signal of the form model, `form()` from `@angular/forms/signals` over it, `FormField` in the template, and derived checks as `computed()` :

```typescript
// features/candidates/candidates-page.ts
readonly model = signal<CaptureModel>(blankCapture());
readonly captureForm = form(this.model, (path) => {
  required(path.ticker);
  maxLength(path.ticker, 20);
});
```

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

- **Constants** — plain `readonly` fields (`readonly pageSizeOptions = [10, 25, 50, 100]`).
- **Repository signatures** — ports return `Observable<T>`; don't wrap them in signals at the port level.
