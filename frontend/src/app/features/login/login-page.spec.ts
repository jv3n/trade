/**
 * Tests on [LoginPage] — the one job is "redirect the browser to the OAuth dance".
 *
 * What we pin :
 *
 * - **Button click triggers the OAuth redirect** — sets `window.location.href` to
 *   `/oauth2/authorization/google`. The proxy forwards that to the backend which redirects to
 *   Google. We assert on the `href` write directly via a stub on `window.location`.
 * - **Already-authenticated users get redirected to /dashboard** — the `effect()` reads
 *   [AuthService.isAuthenticated] and routes away from `/login` when true. Covers the
 *   "user bookmarked /login and came back logged in" case.
 * - **SSR safety** — `window` access is gated on `isPlatformBrowser` ; we don't test this branch
 *   explicitly because the production code path is "click on a button", which only runs in a
 *   browser. The guard exists for defensive depth, not as a tested code path.
 */
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/app-state/auth.service';
import { CurrentUser } from '../../core/api/auth/auth.repository';
import { LoginPage } from './login-page';

function setup(currentUser: CurrentUser | null) {
  const _currentUser = signal<CurrentUser | null>(currentUser);
  const stub = {
    currentUser: _currentUser.asReadonly(),
    isAuthenticated: () => _currentUser() !== null,
    isAdmin: () => _currentUser()?.role === 'ADMIN',
  };
  TestBed.configureTestingModule({
    imports: [LoginPage],
    providers: [
      provideRouter([{ path: 'dashboard', loadComponent: () => Promise.resolve(LoginPage) }]),
      provideTranslateService({ lang: 'en' }),
      { provide: AuthService, useValue: stub },
    ],
  });
}

describe('LoginPage', () => {
  // We mutate `window.location.href` in the production code to trigger the OAuth dance.
  // jsdom's default `window.location` is non-writable ; we replace it with a plain object for
  // the duration of the test and restore the original afterwards. Tests run in a single jsdom
  // window, so leakage between tests is prevented by the afterEach restore.
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: '' } as Partial<Location>,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it('writes /oauth2/authorization/google to window.location.href when the button is clicked', () => {
    setup(null);
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.login-google-btn') as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();

    expect(window.location.href).toBe('/oauth2/authorization/google');
  });

  it('redirects already-authenticated users to /dashboard on mount', async () => {
    setup({ email: 'admin@example.com', displayName: 'Admin', role: 'ADMIN' });
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    // Effects flush on the next microtask in the test fixture. `await whenStable()` is enough to
    // let the constructor's effect() run its first iteration.
    await fixture.whenStable();

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard']);
  });

  it('renders the title, subtitle and disclaimer i18n keys when not authenticated', () => {
    // Tests run with `provideTranslateService({ lang: 'en' })` but no actual translation file
    // loaded — `TranslatePipe` falls back to the key string. We assert on the key presence in
    // the rendered DOM, which proves the template wired the pipe to the right keys.
    setup(null);
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('auth.login.title');
    expect(el.textContent).toContain('auth.login.subtitle');
    expect(el.textContent).toContain('auth.login.signInWithGoogle');
    expect(el.textContent).toContain('auth.login.disclaimer');
  });
});
