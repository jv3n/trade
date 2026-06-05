---
name: angular-testing
description: Write unit and integration tests for Angular v22+ in the PortfolioAI frontend using Vitest with TestBed and modern testing patterns. Use for testing components with signals, services with inject(), HTTP interactions, and DOM-related side-effects (datepickers, file inputs, blob downloads). Triggers on test creation, testing signal-based components, mocking dependencies, or setting up test infrastructure.
---

# Angular Testing

Test with **Vitest** (`@angular/build:unit-test` builder, jsdom environment), focused on signal-based components. Tests live next to source (`*.spec.ts`).

## Commands

From `frontend/`:

```bash
npm run test                                                    # full suite (ng test web)
npx vitest run apps/web/src/app/.../some.spec.ts                # single file
npx vitest                                                      # watch mode
```

Use `vi.fn()` from Vitest (not `jest.fn()`). HTTP testing uses `HttpTestingController` + `provideHttpClient()` + `provideHttpClientTesting()`.

## Required patterns

### `setTestData` factory per `describe` block

Each nested `describe` block defines a local `setTestData` factory; tests call it with overrides. Reduces duplication, keeps the diff between scenarios visible:

```typescript
describe('Container', () => {
  let fixture: ComponentFixture<Container>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Container] }).compileComponents();
    fixture = TestBed.createComponent(Container);
  });

  describe('View', () => {
    describe('Table', () => {
      const tableEl = () => fixture.debugElement.query(By.css('[data-testid="table"]'));

      const setTestData = ({
        loading = false,
        positions = [{ ticker: 'AAPL' }],
      }: { loading?: boolean; positions?: { ticker: string }[] } = {}) => {
        fixture.componentRef.setInput('loading', loading);
        fixture.componentRef.setInput('positions', positions);
      };

      it('shows the table when not loading AND there is at least one position', () => {
        setTestData({ loading: false, positions: [{ ticker: 'AAPL' }] });
        fixture.detectChanges();
        expect(tableEl()).not.toBeNull();
      });

      it("doesn't show the table when loading", () => {
        setTestData({ loading: true });
        fixture.detectChanges();
        expect(tableEl()).toBeNull();
      });
    });
  });
});
```

### `data-testid` selector (camelCase)

```html
<button data-testid="submitButton">Submit</button>
```

```typescript
const submitButtonEl = () => fixture.debugElement.query(By.css('[data-testid="submitButton"]'));
```

### Organising component tests

Nested `describe` blocks: one `View` block for template assertions, plus one block per public method.

```typescript
describe('ComponentName', () => {
  describe('View', () => {
    describe('Some Element', () => { /* … */ });
  });

  describe('someMethod', () => { /* … */ });
});
```

## Testing signals

Components testing a signal-based component set the signal directly or via `componentRef.setInput()` for inputs, then call `fixture.detectChanges()`:

```typescript
component.todos.set([
  { id: '1', text: 'Task 1', done: false },
  { id: '2', text: 'Task 2', done: true },
]);
component.filter.set('active');
expect(component.filteredTodos().length).toBe(1);
```

For pure signal-logic tests (no template), instantiate the component class directly with `new ComponentClass()` — no TestBed needed.

## Testing services

### Plain service

```typescript
beforeEach(() => {
  TestBed.configureTestingModule({});
  service = TestBed.inject(CounterSvc);
});
```

### Service with HTTP

```typescript
beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  service = TestBed.inject(UserService);
  httpMock = TestBed.inject(HttpTestingController);
});

afterEach(() => httpMock.verify());

it('fetches user by id', () => {
  service.getUser('1').subscribe((user) => expect(user).toEqual(mockUser));
  const req = httpMock.expectOne('/api/users/1');
  expect(req.request.method).toBe('GET');
  req.flush(mockUser);
});
```

## Mocking dependencies

### `useValue` mock for plain services

```typescript
const userServiceMock = {
  getUser: vi.fn().mockReturnValue(of({ id: '1', name: 'Test' })),
  updateUser: vi.fn(),
};

await TestBed.configureTestingModule({
  imports: [UserProfile],
  providers: [{ provide: UserService, useValue: userServiceMock }],
}).compileComponents();
```

### `useClass` mock for abstract-class ports with inherited builders

When the port carries Resource builders (`allResource()`, `positionsCache()` etc. — see [`angular-signals > Resource builders`](../angular-signals/SKILL.md#resource-builders-live-on-the-port-itself)), `useValue` flattens the class and loses the builders. Use `useClass extends`:

```typescript
class MockSnapshotRepository extends SnapshotRepository {
  allSource = () => of<SnapshotSummary[]>([]);
  getAll() { return this.allSource(); }
  getPositions(id: string) { return of<SnapshotPosition[]>([]); }
}

providers: [{ provide: SnapshotRepository, useClass: MockSnapshotRepository }];
```

### Mocking signal-based services

```typescript
const authMock = {
  user: signal<User | null>(null),
  isAuthenticated: computed(() => authMock.user() !== null),
  login: vi.fn(),
  logout: vi.fn(),
};
authMock.user.set({ id: '1', name: 'Test User' });
```

### Translated templates

Components whose templates use `'key' | translate` need `provideTranslateService({ lang: 'en' })` in the TestBed providers. Without it, `instant('foo.bar')` returns the key as fallback (acceptable for assertions).

### Datepicker templates — required `provideNativeDateAdapter()`

Any component whose template contains `<mat-datepicker>` (typically a filter drawer) needs `provideNativeDateAdapter()` in the TestBed providers, even when no test exercises the picker directly. `MatDatepickerInput` reaches for a `DateAdapter` at construction time ; without one, every test in the file fails with the same "No provider found for DateAdapter" trace rather than the actual regression you're trying to pin.

```typescript
import { provideNativeDateAdapter } from '@angular/material/core';

providers: [
  provideZonelessChangeDetection(),
  provideRouter([]),
  provideTranslateService({ lang: 'en' }),
  provideNativeDateAdapter(),               // ← required for any datepicker in the template
  /* ... */
],
```

Bit us on the journal-page spec — the filter drawer hosts two `<mat-datepicker>` for the date range. Without `provideNativeDateAdapter()`, the 5 delete-pipeline tests we wanted to pin all reported NG0201 instead of the logic they cover.

## jsdom limitations — file/drag/blob workarounds

jsdom (the DOM Vitest uses) does **not** implement a few browser APIs the UI relies on. The workarounds, all already used in the codebase :

### `DataTransfer` is undefined

`new DataTransfer()` throws `ReferenceError: DataTransfer is not defined`. Drag-and-drop tests can't construct a `DragEvent` with a populated `dataTransfer.files`.

**Workaround** — route the test through the **file-input** handler instead of `onDrop`. Both `onFileChange` and `onDrop` in our journal-io page funnel into the same private `uploadFile` ; testing one exercises the same pipeline as the other.

```typescript
const file = new File(['header\nrow'], 'demo.csv', { type: 'text/csv' });
page.onFileChange({
  target: { files: [file], value: '' } as unknown as HTMLInputElement,
} as unknown as Event);
```

The `files: [file]` array is enough — Angular's template binding reads it via `input.files`, which accepts an array-like object in jsdom.

### `URL.createObjectURL` is undefined

The blob-download trick (`URL.createObjectURL(blob)` + anchor `.click()` + `URL.revokeObjectURL(url)`) is the cross-browser way to trigger a "Save as" without the File System Access API. jsdom doesn't ship it.

**Workaround** — stub both URL methods in `beforeEach`, restore in `afterEach`:

```typescript
beforeEach(() => {
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:mock-url'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
```

The `triggerBlobDownload` helper then runs through its `appendChild → click → removeChild → revokeObjectURL` sequence without throwing, and you can assert on the snackbar fired in the `tap` body.

### `window.confirm` — stub it explicitly

`vi.spyOn(window, 'confirm').mockReturnValue(true)` (or `false`) for tests that exercise `delete()` or any other native-confirm-gated flow.

## RxJS pipelines — test via `Subject` emissions

For components that use `repo.method().pipe(tap, catchError).subscribe()`, control the emission side via a `Subject<T>` returned by the mock repo. The test pushes `next(value)` or `error(...)` to drive each branch :

```typescript
let deleteSubject: Subject<void>;

beforeEach(() => {
  deleteSubject = new Subject<void>();
  /* provide: JournalRepository → { delete: () => deleteSubject.asObservable(), … } */
});

it('delete error fires an error snackbar', () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const fixture = TestBed.createComponent(JournalPage);
  fixture.detectChanges();

  fixture.componentInstance.delete(makeTrade());
  deleteSubject.error(new Error('500 from server'));
  fixture.detectChanges();

  expect(snackBarOpen).toHaveBeenCalledWith(
    expect.any(String),
    undefined,
    expect.objectContaining({ panelClass: 'stb-snack-bar--error' }),
  );
});
```

The `tap` runs on `next`, `catchError` runs on `error` — both are exercised cleanly with two separate test cases.

## Testing inputs and outputs

```typescript
fixture.componentRef.setInput('item', item);
fixture.detectChanges();

let emitted: Item | undefined;
fixture.componentInstance.selected.subscribe((i) => (emitted = i));
fixture.nativeElement.querySelector('div').click();
expect(emitted).toEqual(item);
```

## Async timing

### `fakeAsync` + `tick` for Angular-aware timing

```typescript
it('debounces search', fakeAsync(() => {
  fixture.componentInstance.query.set('test');
  tick(300);
  fixture.detectChanges();
  expect(fixture.componentInstance.results().length).toBeGreaterThan(0);
  flush();
}));
```

### `vi.useFakeTimers()` for non-Angular timing

```typescript
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('debounces search input', async () => {
  fixture.componentInstance.query.set('test');
  vi.advanceTimersByTime(300);
  await fixture.whenStable();
  fixture.detectChanges();
  expect(fixture.componentInstance.results().length).toBeGreaterThan(0);
});
```
