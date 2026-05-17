import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { signal } from '@angular/core';
import { App } from './app';
import { AuthService } from './core/app-state/auth.service';
import { CurrentUser } from './core/api/auth/auth.repository';

/**
 * Smoke tests on [App] — the application shell.
 *
 * Phase 4 added [AuthService] as a dependency of the shell ; we stub it with a signal-backed
 * fake (no HTTP, no real repository) so the shell renders deterministically. The two assertions
 * here are the regressions that matter : the component constructs cleanly and the brand text
 * paints on a route other than `/login`. Detailed gating logic (admin-only nav, user menu)
 * lives in dedicated tests on the AuthService + guards ; this file is the shell smoke.
 */
function provideAuthStub(currentUser: CurrentUser | null) {
  const _currentUser = signal<CurrentUser | null>(currentUser);
  const stub = {
    currentUser: _currentUser.asReadonly(),
    isAuthenticated: () => _currentUser() !== null,
    isAdmin: () => _currentUser()?.role === 'ADMIN',
    refresh: () => ({ subscribe: () => ({ unsubscribe: () => undefined }) }),
    logout: () => ({ subscribe: () => ({ unsubscribe: () => undefined }) }),
    clear: () => undefined,
  };
  return { provide: AuthService, useValue: stub };
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideTranslateService({ lang: 'en' }),
        provideAuthStub({ email: 'admin@example.com', displayName: 'Admin', role: 'ADMIN' }),
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the toolbar brand on a non-login route', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand-name')?.textContent).toContain('PortfolioAI');
  });
});
