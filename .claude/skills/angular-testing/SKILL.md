---
name: angular-testing
description: How specs are written in the PortfolioAI frontend (Vitest, jsdom, zoneless TestBed) — page and service specs, port doubles, the `ConfirmService` / `StbToast` doubles, `settle()` for resources, jsdom workarounds. Use when writing or fixing a `*.spec.ts` under `apps/web` or `libs/ui`.
---

# Angular Testing

Vitest through the `@angular/build:unit-test` builder, jsdom environment, `*.spec.ts` next to the source. What a spec must read like (class docstring, sentence names, factories, one scenario per test) is in [`CLAUDE.md > Tests as documentation`](../../CLAUDE.md#tests-as-documentation).

## Commands

From `projects/frontend/`, and only when the user asks (see `CLAUDE.md > Builds and tests`) :

```bash
npm run test                                                                  # ng test web
npm run ui:test                                                               # ng test ui (the lib's specs, also in CI)
npx ng test web --watch=false --include='apps/web/src/path/to/file.spec.ts'   # one spec
```

Bare `vitest` can't resolve `@portfolioai/ui`.

## The shape of a page spec

A file-level docstring listing what is pinned, `make*` factories, a `setup()` taking options, then flat `describe` blocks — one per page, with a second one for a scoped concern (`describe('StatsPage — the scanner stats to review (#764)', …)`). Reference : `features/stats/stats-page.spec.ts`.

```typescript
function setup(options: { rows?: StatEntry[]; confirmed?: boolean } = {}) {
  const toastShown = vi.fn();
  TestBed.configureTestingModule({
    imports: [StatsPage],
    providers: [
      provideZonelessChangeDetection(),
      provideTranslateService({ lang: 'en' }),
      provideNativeDateAdapter(),
      provideRouter([]),
      { provide: StatsRepository, useClass: MockStatsRepository },
      {
        provide: StbToast,
        useValue: {
          success: (message: string) => toastShown('success', message),
          error: (message: string) => toastShown('error', message),
        },
      },
      { provide: ConfirmService, useValue: { ask: () => of(options.confirmed ?? true) } },
    ],
  });
  /* … */
}
```

- **Imports** — `vi`, `describe`, `it`, `expect` from `vitest` ; everything Material from `@portfolioai/ui`, specs included (`no-restricted-imports` covers them). `provideNativeDateAdapter`, `MATERIAL_ANIMATIONS`, `StbToast` all come from there.
- **`provideZonelessChangeDetection()`** in every TestBed that renders.
- **`provideTranslateService({ lang: 'en' })`** when the template uses `translate`.
- **`provideNativeDateAdapter()`** when the template holds a `<mat-datepicker>`, even if no test touches it : without it every test fails on the same NG0201 instead of its own assertion.
- **`{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }`** when a spec opens a real dialog (`core/app-state/confirm.service.spec.ts`).
- **Finding elements** — `fixture.nativeElement.querySelector(...)`, with kebab-case `data-testid` attributes where a class would not do (`data-testid="tab-cash-flow"`).

## Resources : `settle()`

A resource answers a microtask after its call, so a page renders through a `settle()`, and settles again after an action that reloads :

```typescript
async function settle(fixture: ComponentFixture<StatsPage>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}
```

A test holding an answer back with a `Subject` keeps a plain `detectChanges()` : `whenStable()` would wait for it forever.

## Doubles

- **A port** — a class that **extends** the abstract repository, so the compiler flags a missing method when the port grows, with `vi.fn()` members to assert on. Bind it with `useClass`, and read it back with `TestBed.inject(StatsRepository) as MockStatsRepository`. Reference : `MockCandidatesRepository` in `features/candidates/candidates-page.spec.ts`, `StubRepository` in `core/app-state/auth.service.spec.ts`.

  ```typescript
  class MockCandidatesRepository extends CandidatesRepository {
    listForDate = vi.fn((_date: Date): Observable<Candidate[]> => of([]));
    delete = vi.fn((_id: string): Observable<void> => of(undefined));
    /* … every abstract member */
  }
  ```

- **A port the test barely touches** — a partial `useValue` : `{ provide: StatsRepository, useValue: { create: vi.fn(() => of(undefined)) } }`.
- **An adapter's own spec** binds the real adapter with `provideHttpClient()` + `provideHttpClientTesting()`, and asserts through `HttpTestingController`.
- **`ConfirmService`** — `{ ask: () => of(true) }`, plus `choose: () => of({ confirmed: true, value: null, note: null })` for a dialog with a pick.
- **`StbToast`** — the double above, then `expect(toastShown.mock.calls.at(-1)?.[0]).toBe('error')`. Never `MatSnackBar`.

To drive a pipeline's error branch, have the mock return a `Subject` or `throwError(...)`, and assert the toast.

## Timing

- `vi.useFakeTimers()` + `vi.advanceTimersByTime(...)` for debounces and delays. `fakeAsync` is not available : there is no `zone.js`.
- An `effect()` runs on `TestBed.tick()` (`core/app-state/theme.service.spec.ts`).

## jsdom

- **Charts need no setup** — `test-setup.ts` provides `ResizeObserver` and an inert 2D canvas.
- **`URL.createObjectURL` / `revokeObjectURL` are missing.** Stub them on a **constructable** `URL` : the router calls `new URL(...)`, and a plain-object stub breaks it. Reference : `features/settings/data/data.spec.ts`.

  ```typescript
  const RealURL = globalThis.URL;
  const urlStub = function (...args: ConstructorParameters<typeof URL>) {
    return new RealURL(...args);
  } as unknown as typeof URL;
  urlStub.prototype = RealURL.prototype;
  urlStub.createObjectURL = vi.fn(() => 'blob:stats') as unknown as typeof URL.createObjectURL;
  urlStub.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  vi.stubGlobal('URL', urlStub);
  ```

  `vi.unstubAllGlobals()` in `afterEach`.

## End-to-end

Playwright lives in `apps/web-e2e` (`npm run e2e`, against a running stack with the backend on the `e2e` profile).
