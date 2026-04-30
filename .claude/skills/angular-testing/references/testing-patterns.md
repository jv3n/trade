# Angular Testing Patterns

## Table of Contents
- [Vitest Advanced Patterns](#vitest-advanced-patterns)
- [Component Harnesses](#component-harnesses)
- [Testing Router](#testing-router)
- [Testing Forms](#testing-forms)
- [Testing Directives](#testing-directives)
- [Testing Pipes](#testing-pipes)
- [E2E Testing Setup](#e2e-testing-setup)

## Vitest Advanced Patterns

### Parameterized Tests

```typescript
import { describe, it, expect } from 'vitest';

describe('Validator', () => {
  it.each([
    { input: '', expected: false },
    { input: 'test', expected: false },
    { input: 'test@example.com', expected: true },
    { input: 'invalid@', expected: false },
  ])('should validate email "$input" as $expected', ({ input, expected }) => {
    expect(isValidEmail(input)).toBe(expected);
  });
});
```

### Fake Timers

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

### Async/Await with HTTP

```typescript
import { describe, it, expect } from 'vitest';

describe('UserService', () => {
  it('should load user data', async () => {
    const mockUser = { id: '1', name: 'Test' };
    const httpMock = TestBed.inject(HttpTestingController);
    const service = TestBed.inject(UserService);

    const userPromise = service.loadUser('1');

    httpMock.expectOne('/api/users/1').flush(mockUser);

    const user = await userPromise;
    expect(user).toEqual(mockUser);
  });
});
```

### Test Fixtures

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

const createTestUser = (overrides = {}) => ({
  id: '1',
  name: 'Test User',
  email: 'test@example.com',
  ...overrides,
});

const createTestProduct = (overrides = {}) => ({
  id: '1',
  name: 'Test Product',
  price: 99.99,
  ...overrides,
});

describe('Order', () => {
  it('should calculate total', () => {
    const fixture = TestBed.createComponent(Order);
    fixture.componentRef.setInput('user', createTestUser());
    fixture.componentRef.setInput('products', [
      createTestProduct({ price: 10 }),
      createTestProduct({ id: '2', price: 20 }),
    ]);
    fixture.detectChanges();

    expect(fixture.componentInstance.total()).toBe(30);
  });
});
```

## Component Harnesses

Use Angular CDK component harnesses for more maintainable tests.

### Creating a Harness

```typescript
import { ComponentHarness, HarnessPredicate } from '@angular/cdk/testing';

export class CounterHarness extends ComponentHarness {
  static hostSelector = 'app-counter';

  private getIncrementButton = this.locatorFor('button.increment');
  private getDecrementButton = this.locatorFor('button.decrement');
  private getCountDisplay = this.locatorFor('.count');

  async increment(): Promise<void> {
    const button = await this.getIncrementButton();
    await button.click();
  }

  async decrement(): Promise<void> {
    const button = await this.getDecrementButton();
    await button.click();
  }

  async getCount(): Promise<number> {
    const display = await this.getCountDisplay();
    const text = await display.text();
    return parseInt(text, 10);
  }

  static with(options: { count?: number } = {}): HarnessPredicate<CounterHarness> {
    return new HarnessPredicate(CounterHarness, options).addOption(
      'count',
      options.count,
      async (harness, count) => (await harness.getCount()) === count,
    );
  }
}
```

### Using Harnesses in Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';

describe('Counter with Harness', () => {
  let loader: HarnessLoader;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Counter],
    }).compileComponents();

    const fixture = TestBed.createComponent(Counter);
    loader = TestbedHarnessEnvironment.loader(fixture);
  });

  it('should increment count', async () => {
    const counter = await loader.getHarness(CounterHarness);

    expect(await counter.getCount()).toBe(0);

    await counter.increment();
    expect(await counter.getCount()).toBe(1);
  });
});
```

## Testing Router

### RouterTestingHarness

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideRouter } from '@angular/router';

describe('Router Navigation', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Home },
          { path: 'users/:id', component: UserCmp },
        ]),
      ],
    }).compileComponents();

    harness = await RouterTestingHarness.create();
  });

  it('should navigate to user page', async () => {
    const component = await harness.navigateByUrl('/users/123', UserCmp);
    expect(component.id()).toBe('123');
  });
});
```

### Testing Guards

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('AuthGuard', () => {
  const authMock = {
    isAuthenticated: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authMock },
        provideRouter([
          { path: 'login', component: Login },
          { path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
        ]),
      ],
    });
  });

  it('should allow access when authenticated', async () => {
    authMock.isAuthenticated.mockReturnValue(true);

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/dashboard');

    expect(harness.routeNativeElement?.textContent).toContain('Dashboard');
  });

  it('should redirect to login when not authenticated', async () => {
    authMock.isAuthenticated.mockReturnValue(false);

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/dashboard');

    expect(TestBed.inject(Router).url).toBe('/login');
  });
});
```

## Testing Forms

### Testing Reactive Forms

```typescript
import { describe, it, expect } from 'vitest';

describe('ProfileForm', () => {
  it('should validate form', () => {
    const fixture = TestBed.createComponent(ProfileForm);
    const component = fixture.componentInstance;

    expect(component.form.valid).toBe(false);

    component.form.patchValue({
      name: 'John',
      email: 'john@example.com',
    });

    expect(component.form.valid).toBe(true);
  });

  it('should show validation errors', () => {
    const fixture = TestBed.createComponent(ProfileForm);
    fixture.detectChanges();

    const emailControl = fixture.componentInstance.form.controls.email;
    emailControl.setValue('invalid');
    emailControl.markAsTouched();
    fixture.detectChanges();

    const errorElement = fixture.nativeElement.querySelector('.error');
    expect(errorElement.textContent).toContain('Invalid email');
  });
});
```

## Testing Directives

### Attribute Directive

```typescript
@Directive({
  selector: '[appHighlight]',
  host: {
    '[style.backgroundColor]': 'color()',
  },
})
export class Highlight {
  color = input('yellow', { alias: 'appHighlight' });
}

describe('Highlight', () => {
  @Component({
    imports: [Highlight],
    template: `<p appHighlight="lightblue">Test</p>`,
  })
  class TestHost {}

  it('should apply background color', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();

    const p = fixture.nativeElement.querySelector('p');
    expect(p.style.backgroundColor).toBe('lightblue');
  });
});
```

### Structural Directive

```typescript
@Directive({ selector: '[appIf]' })
export class IfDirective {
  private templateRef = inject(TemplateRef);
  private viewContainer = inject(ViewContainerRef);

  condition = input.required<boolean>({ alias: 'appIf' });

  constructor() {
    effect(() => {
      if (this.condition()) {
        this.viewContainer.createEmbeddedView(this.templateRef);
      } else {
        this.viewContainer.clear();
      }
    });
  }
}

describe('IfDirective', () => {
  @Component({
    imports: [IfDirective],
    template: `<p *appIf="show()">Visible</p>`,
  })
  class TestHost {
    show = signal(false);
  }

  it('should show content when condition is true', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('p')).toBeNull();

    fixture.componentInstance.show.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('p')).toBeTruthy();
  });
});
```

## Testing Pipes

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

@Pipe({ name: 'truncate' })
export class TruncatePipe implements PipeTransform {
  transform(value: string, length: number = 50): string {
    if (value.length <= length) return value;
    return value.substring(0, length) + '...';
  }
}

describe('TruncatePipe', () => {
  let pipe: TruncatePipe;

  beforeEach(() => {
    pipe = new TruncatePipe();
  });

  it('should not truncate short strings', () => {
    expect(pipe.transform('Hello', 10)).toBe('Hello');
  });

  it('should truncate long strings', () => {
    expect(pipe.transform('Hello World', 5)).toBe('Hello...');
  });

  it('should use default length', () => {
    const longString = 'a'.repeat(60);
    const result = pipe.transform(longString);
    expect(result.length).toBe(53); // 50 + '...'
  });
});
```

## E2E Testing Setup

PortfolioAI does not currently ship with a dedicated E2E suite. If you add one, prefer **Playwright** (lighter than Cypress, no separate runner config needed alongside Vitest).

### Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env.CI,
  },
});
```

### E2E Test Example

```typescript
import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('should display imported portfolio', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('[data-testid="portfolioName"]')).toBeVisible();
    await expect(page.locator('[data-testid="positionsTable"]')).toBeVisible();
  });
});
```

## Test Utilities

### Custom Test Helpers

```typescript
import type { ComponentFixture } from '@angular/core/testing';

export function setSignalInput<T>(
  fixture: ComponentFixture<unknown>,
  inputName: string,
  value: T,
): void {
  fixture.componentRef.setInput(inputName, value);
  fixture.detectChanges();
}

export async function waitForSignal<T>(
  signal: () => T,
  predicate: (value: T) => boolean,
  timeout = 5000,
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = signal();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timeout waiting for signal');
}
```
