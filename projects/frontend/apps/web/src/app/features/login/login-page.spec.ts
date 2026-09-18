/**
 * Tests on [LoginPage] — the one job is "redirect the browser to the OAuth dance".
 *
 * What we pin :
 *
 * - **Button click triggers the OAuth redirect** — sets `window.location.href` to
 *   `/oauth2/authorization/google`. The proxy forwards that to the backend which redirects to
 *   Google. We assert on the `href` write directly via a stub on `window.location`.
 * - **Already-authenticated users get redirected to /journal** — the `effect()` reads
 *   [AuthService.isAuthenticated] and routes away from `/login` when true. Covers the
 *   "user bookmarked /login and came back logged in" case.
 * - **SSR safety** — `window` access is gated on `isPlatformBrowser` ; we don't test this branch
 *   explicitly because the production code path is "click on a button", which only runs in a
 *   browser. The guard exists for defensive depth, not as a tested code path.
 */
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { CurrentUser } from '../../core/api/auth/auth.repository';
import { AuthService } from '../../core/app-state/auth.service';
import { LoginPage } from './login-page';

function setup(currentUser: CurrentUser | null, queryParams: Record<string, string> = {}) {
  const _currentUser = signal<CurrentUser | null>(currentUser);
  const stub = {
    currentUser: _currentUser.asReadonly(),
    isAuthenticated: () => _currentUser() !== null,
    isAdmin: () => _currentUser()?.role === 'ADMIN',
  };
  const paramMap = convertToParamMap(queryParams);
  const routeStub = {
    queryParamMap: of(paramMap),
    snapshot: { queryParamMap: paramMap },
  };
  TestBed.configureTestingModule({
    imports: [LoginPage],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: 'journal', loadComponent: () => Promise.resolve(LoginPage) }]),
      provideTranslateService({ lang: 'en' }),
      { provide: AuthService, useValue: stub },
      { provide: ActivatedRoute, useValue: routeStub },
    ],
  });
  // Stubs the `portfolioai` brand-mark icon so `<mat-icon svgIcon="portfolioai">` (rendered in
  // both the toolbar and the login hero) doesn't log a "Unable to find icon" error during the
  // test run. The production registration lives in `app.config.ts > provideAppInitializer` ; the
  // unit-test harness doesn't fire app initializers, so we mirror it here with an empty SVG.
  TestBed.inject(MatIconRegistry).addSvgIconLiteral(
    'portfolioai',
    TestBed.inject(DomSanitizer).bypassSecurityTrustHtml('<svg></svg>'),
  );
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

  it('redirects already-authenticated users to /account on mount', async () => {
    setup({ email: 'admin@example.com', displayName: 'Admin', role: 'ADMIN' });
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    // Effects flush on the next microtask in the test fixture. `await whenStable()` is enough to
    // let the constructor's effect() run its first iteration.
    await fixture.whenStable();

    expect(navigateSpy).toHaveBeenCalledWith(['/account']);
  });

  it('renders the title, tagline, feature copy and disclaimer i18n keys when not authenticated', () => {
    // Tests run with `provideTranslateService({ lang: 'en' })` but no actual translation file
    // loaded — `TranslatePipe` falls back to the key string. We assert on the key presence in
    // the rendered DOM, which proves the template wired the pipe to the right keys.
    setup(null);
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('auth.login.title');
    expect(el.textContent).toContain('auth.login.tagline');
    expect(el.textContent).toContain('auth.login.features.indicators.title');
    expect(el.textContent).toContain('auth.login.features.narrative.title');
    expect(el.textContent).toContain('auth.login.features.portfolio.title');
    expect(el.textContent).toContain('auth.login.signInWithGoogle');
    expect(el.textContent).toContain('auth.login.disclaimer');
  });

  it('renders the not_authorized banner when the error query param signals a whitelist rejection', () => {
    // The backend `SecurityConfig` failure handler redirects to `/login?error=not_authorized`
    // when `CustomOAuth2UserService.assertAuthorized` throws — we want the user to see a clear
    // inline message rather than wonder why the OAuth dance silently dropped them on /login.
    setup(null, { error: 'not_authorized' });
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('auth.errors.notAuthorized');
    // The generic oauth_failed key must NOT also appear — picking the right branch matters
    expect(el.textContent).not.toContain('auth.errors.oauthFailed');
  });

  it('renders the oauth_failed banner as a fallback for any non-whitelist OAuth failure', () => {
    setup(null, { error: 'oauth_failed' });
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('auth.errors.oauthFailed');
    expect(el.textContent).not.toContain('auth.errors.notAuthorized');
  });

  it('renders no error banner when the error query param is missing (fresh /login visit)', () => {
    // Happy path : the admin lands on /login without coming from a failed OAuth bounce. The
    // template must not render the inline error block at all (no `auth.errors.*` key in the DOM).
    setup(null);
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('auth.errors.');
  });

  it('degrades silently when the error query param carries an unknown code', () => {
    // Defensive : a future code we haven't wired up yet (or a user pasting a hand-typed URL with
    // a typo) must not render an opaque banner. `errorKey()` returns null on the `default` switch
    // branch — pin that the @if degrades cleanly without a "missing translation" artefact.
    setup(null, { error: 'something_unexpected' });
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('auth.errors.');
  });
});
