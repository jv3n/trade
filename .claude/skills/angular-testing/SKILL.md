---
name: angular-testing
description: Write unit and integration tests for Angular v21+ in the PortfolioAI frontend using Vitest with TestBed and modern testing patterns. Use for testing components with signals, services with inject(), and HTTP interactions. Triggers on test creation, testing signal-based components, mocking dependencies, or setting up test infrastructure.
---

# Angular Testing

Test with **Vitest**, focused on signal-based components. Tests live next to source (`*.spec.ts`).

## Commands

From `frontend/`:

```bash
npm run test                                          # full suite
npx vitest run src/app/dashboard/dashboard.spec.ts    # single file
npx vitest                                            # watch mode
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
