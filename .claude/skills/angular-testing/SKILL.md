---
name: angular-testing
description: Write unit and integration tests for Angular v21+ in the PortfolioAI frontend using Vitest with TestBed and modern testing patterns. Use for testing components with signals, services with inject(), and HTTP interactions. Triggers on test creation, testing signal-based components, mocking dependencies, or setting up test infrastructure.
---

# Angular Testing

Test the PortfolioAI Angular v21+ frontend with **Vitest**, focusing on signal-based components and modern patterns. Tests live next to the source file (`*.spec.ts`).

## Setup

### Running Tests

All commands run from `frontend/`.

```bash
# Run the full suite
npm run test

# Run a single file via Vitest
npx vitest run src/app/dashboard/dashboard.spec.ts

# Watch mode
npx vitest
```

### Vitest Test Example

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Counter } from './counter';

describe('Counter', () => {
  let component: Counter;
  let fixture: ComponentFixture<Counter>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Counter],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(Counter);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should increment count', () => {
    fixture.detectChanges();
    expect(component.count()).toBe(0);

    component.increment();

    expect(component.count()).toBe(1);
  });
});
```

### Vitest Mocking

Use `vi.fn()` (not `jest.fn()`).

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '@angular/core';

describe('UserCmpt', () => {
  const userServiceMock = {
    getUser: vi.fn(),
    updateUser: vi.fn(),
    user: signal<User | null>(null),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    userServiceMock.getUser.mockReturnValue(of({ id: '1', name: 'Test' }));

    await TestBed.configureTestingModule({
      imports: [UserCmpt],
      providers: [{ provide: User, useValue: userServiceMock }],
    }).compileComponents();
  });

  it('should call getUser on init', () => {
    const fixture = TestBed.createComponent(UserCmpt);
    fixture.detectChanges();

    expect(userServiceMock.getUser).toHaveBeenCalledWith('1');
  });
});
```

### Vitest with HTTP Testing

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

describe('UserService', () => {
  let service: UserService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(UserService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should fetch user', () => {
    const mockUser = { id: '1', name: 'Test User' };

    service.getUser('1').subscribe((user) => {
      expect(user).toEqual(mockUser);
    });

    const req = httpMock.expectOne('/api/users/1');
    expect(req.request.method).toBe('GET');
    req.flush(mockUser);
  });
});
```

---

## Basic Component Test

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Counter } from './counter';

describe('Counter', () => {
  let component: Counter;
  let fixture: ComponentFixture<Counter>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Counter],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(Counter);
    component = fixture.componentInstance;
  });

  describe('View', () => {
    describe('Count', () => {
      const countEl = () =>
        fixture.debugElement.query(By.css('[data-testid="count"]'));

      const setTestData = ({ count = 0 }: { count?: number } = {}) => {
        component.count.set(count);
      };

      it('should display count in template', () => {
        setTestData({ count: 5 });
        fixture.detectChanges();

        expect(countEl().nativeElement.textContent).toContain('5');
      });
    });
  });

  describe('increment', () => {
    it('should increment count', () => {
      expect(component.count()).toBe(0);

      component.increment();

      expect(component.count()).toBe(1);
    });
  });
});
```

## Required Patterns

### Test Data Function

For test data, use a factory function called `setTestData` for each `describe` block. This makes scenarios cheap to set up and reduces duplication:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Container } from './container';

describe('Container', () => {
  let component: Container;
  let fixture: ComponentFixture<Container>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Container],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(Container);
    component = fixture.componentInstance;
  });

  describe('View', () => {
    describe('Table', () => {
      const tableEl = () =>
        fixture.debugElement.query(By.css('[data-testid="table"]'));

      const setTestData = ({
        loading = false,
        positions = [{ ticker: 'AAPL' }],
      }: {
        loading?: boolean;
        positions?: { ticker: string }[];
      } = {}) => {
        fixture.componentRef.setInput('loading', loading);
        fixture.componentRef.setInput('positions', positions);
      };

      it('should show the table when not loading AND there is at least one position', () => {
        setTestData({ loading: false, positions: [{ ticker: 'AAPL' }] });
        fixture.detectChanges();

        expect(tableEl()).not.toBeNull();
      });

      it("shouldn't show the table when loading", () => {
        setTestData({ loading: true });
        fixture.detectChanges();

        expect(tableEl()).toBeNull();
      });

      it("shouldn't show the table when there are no positions", () => {
        setTestData({ positions: [] });
        fixture.detectChanges();

        expect(tableEl()).toBeNull();
      });
    });
  });
});
```

### data-testid Selector

When querying elements in the template, use `data-testid` (ALWAYS camelCase) attributes for reliable selection:

```html
<button data-testid="submitButton">Submit</button>
```

```typescript
const submitButtonEl = () =>
  fixture.debugElement.query(By.css('[data-testid="submitButton"]'));
```

### Organising Component Tests

Group tests in nested `describe` blocks: a `View` block for template-driven assertions, plus one block per public method.

```typescript
describe('ComponentName', () => {
  describe('View', () => {
    describe('Some Element', () => {
      // tests for that element
    });
  });

  describe('someMethod', () => {
    // tests for that method
  });
});
```

## Testing Signals

### Direct Signal Testing

```typescript
import { describe, it, expect } from 'vitest';
import { signal, computed } from '@angular/core';

describe('Signal logic', () => {
  it('should update computed when signal changes', () => {
    const count = signal(0);
    const doubled = computed(() => count() * 2);

    expect(doubled()).toBe(0);

    count.set(5);
    expect(doubled()).toBe(10);

    count.update((c) => c + 1);
    expect(doubled()).toBe(12);
  });
});
```

### Testing Component Signals

```typescript
@Component({
  selector: 'app-todo-list',
  template: `
    <ul>
      @for (todo of filteredTodos(); track todo.id) {
        <li>{{ todo.text }}</li>
      }
    </ul>
    <p>{{ remaining() }} remaining</p>
  `,
})
export class TodoList {
  todos = signal<Todo[]>([]);
  filter = signal<'all' | 'active' | 'done'>('all');

  filteredTodos = computed(() => {
    const todos = this.todos();
    switch (this.filter()) {
      case 'active':
        return todos.filter((t) => !t.done);
      case 'done':
        return todos.filter((t) => t.done);
      default:
        return todos;
    }
  });

  remaining = computed(() => this.todos().filter((t) => !t.done).length);
}

describe('TodoList', () => {
  let component: TodoList;
  let fixture: ComponentFixture<TodoList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TodoList],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TodoList);
    component = fixture.componentInstance;
  });

  describe('filteredTodos', () => {
    it('should filter active todos', () => {
      component.todos.set([
        { id: '1', text: 'Task 1', done: false },
        { id: '2', text: 'Task 2', done: true },
        { id: '3', text: 'Task 3', done: false },
      ]);

      component.filter.set('active');

      expect(component.filteredTodos().length).toBe(2);
    });
  });

  describe('remaining', () => {
    it('should return the remaining todos count', () => {
      component.todos.set([
        { id: '1', text: 'Task 1', done: false },
        { id: '2', text: 'Task 2', done: true },
        { id: '3', text: 'Task 3', done: false },
      ]);

      expect(component.remaining()).toBe(2);
    });
  });
});
```

## Testing OnPush Components

> **Note** : PortfolioAI runs zoneless and **does not mandate** `OnPush` (cf. `.claude/CLAUDE.md > Conventions`). This section stays as reference for the rare case where a component opts into `OnPush` explicitly. New PortfolioAI components leave the default change detection strategy.

OnPush components require explicit change detection. Use `componentRef.setInput()` for signal inputs.

```typescript
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span>{{ data().name }}</span>`,
})
export class OnPushCmp {
  data = input.required<{ name: string }>();
}

describe('OnPushCmp', () => {
  it('should update when input signal changes', () => {
    const fixture = TestBed.createComponent(OnPushCmp);

    fixture.componentRef.setInput('data', { name: 'Initial' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Initial');

    fixture.componentRef.setInput('data', { name: 'Updated' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Updated');
  });
});
```

## Testing Services

### Basic Service Test

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';

@Injectable({ providedIn: 'root' })
export class CounterSvc {
  readonly count = signal(0);

  increment() {
    this.count.update((c) => c + 1);
  }

  reset() {
    this.count.set(0);
  }
}

describe('CounterSvc', () => {
  let service: CounterSvc;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CounterSvc);
  });

  describe('increment', () => {
    it('should increment count', () => {
      expect(service.count()).toBe(0);

      service.increment();
      expect(service.count()).toBe(1);

      service.increment();
      expect(service.count()).toBe(2);
    });
  });

  describe('reset', () => {
    it('should reset count', () => {
      service.increment();
      service.increment();

      service.reset();

      expect(service.count()).toBe(0);
    });
  });
});
```

### Service with HTTP

```typescript
@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);

  getUser(id: string) {
    return this.http.get<User>(`/api/users/${id}`);
  }
}

describe('UserService', () => {
  let service: UserService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(UserService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should fetch user by id', () => {
    const mockUser: User = { id: '1', name: 'Test User' };

    service.getUser('1').subscribe((user) => {
      expect(user).toEqual(mockUser);
    });

    const req = httpMock.expectOne('/api/users/1');
    expect(req.request.method).toBe('GET');
    req.flush(mockUser);
  });
});
```

## Mocking Dependencies

### Using Vitest Mocks

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('UserProfile', () => {
  let fixture: ComponentFixture<UserProfile>;

  const userServiceMock = {
    getUser: vi.fn().mockReturnValue(of({ id: '1', name: 'Test' })),
    updateUser: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserProfile],
      providers: [{ provide: UserService, useValue: userServiceMock }],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(UserProfile);
  });

  it('should call getUser on init', () => {
    fixture.detectChanges();
    expect(userServiceMock.getUser).toHaveBeenCalledWith('1');
  });
});
```

### Mock Signal-Based Service

```typescript
import { signal, computed } from '@angular/core';
import { vi } from 'vitest';

const authMock = {
  user: signal<User | null>(null),
  isAuthenticated: computed(() => authMock.user() !== null),
  login: vi.fn(),
  logout: vi.fn(),
};

beforeEach(async () => {
  await TestBed.configureTestingModule({
    imports: [Protected],
    providers: [{ provide: AuthService, useValue: authMock }],
  }).compileComponents();
});

it('should show content when authenticated', () => {
  authMock.user.set({ id: '1', name: 'Test User' });
  const fixture = TestBed.createComponent(Protected);
  fixture.detectChanges();

  expect(
    fixture.debugElement.query(By.css('[data-testid="protectedContent"]')),
  ).not.toBeNull();
});
```

## Testing Inputs and Outputs

```typescript
@Component({
  selector: 'app-item',
  template: `<div (click)="select()">{{ item().name }}</div>`,
})
export class ItemCmp {
  item = input.required<Item>();
  selected = output<Item>();

  select() {
    this.selected.emit(this.item());
  }
}

describe('ItemCmp', () => {
  it('should emit selected event on click', () => {
    const fixture = TestBed.createComponent(ItemCmp);
    const item: Item = { id: '1', name: 'Test Item' };

    fixture.componentRef.setInput('item', item);
    fixture.detectChanges();

    let emittedItem: Item | undefined;
    fixture.componentInstance.selected.subscribe((i) => (emittedItem = i));

    fixture.nativeElement.querySelector('div').click();

    expect(emittedItem).toEqual(item);
  });
});
```

## Testing Async Operations

### Using fakeAsync

```typescript
import { fakeAsync, tick, flush } from '@angular/core/testing';

it('should debounce search', fakeAsync(() => {
  const fixture = TestBed.createComponent(Search);
  fixture.detectChanges();

  fixture.componentInstance.query.set('test');

  tick(300);
  fixture.detectChanges();

  expect(fixture.componentInstance.results().length).toBeGreaterThan(0);

  flush();
}));
```

### Using Vitest Fake Timers

For non-Angular timing logic, prefer `vi.useFakeTimers()`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Debounced Search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should debounce search input', async () => {
    const fixture = TestBed.createComponent(Search);
    fixture.detectChanges();

    fixture.componentInstance.query.set('test');
    expect(fixture.componentInstance.results()).toEqual([]);

    vi.advanceTimersByTime(300);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.results().length).toBeGreaterThan(0);
  });
});
```

For advanced testing patterns (harnesses, router, forms, directives, pipes), see [references/testing-patterns.md](references/testing-patterns.md).
