import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { MatIconRegistry } from '@portfolioai/ui';
import { BehaviorSubject, map } from 'rxjs';
import { App } from './app';
import { CurrentUser } from './core/api/auth/auth.repository';
import { AuthService } from './core/app-state/auth.service';

/**
 * Smoke tests on [App] — the application shell.
 *
 * Phase 4 added [AuthService] as a dependency of the shell ; we stub it with a signal-backed
 * fake (no HTTP, no real repository) so the shell renders deterministically. The two assertions
 * here are the regressions that matter : the component constructs cleanly and the brand mark
 * paints on a route other than `/login`. Detailed gating logic (admin-only nav, user menu)
 * lives in dedicated tests on the AuthService + guards ; this file is the shell smoke.
 *
 * It also pins the menu on a narrow screen (#456) : docked on a desktop, a drawer on a phone —
 * opened by the toolbar's button and closed once a page is picked, since it sits over that page.
 */
@Component({ template: '' })
class BlankPage {}

/** Drives the viewport width the shell sees, instead of the test runner's window. */
const narrow = new BehaviorSubject(false);
const breakpointStub = {
  provide: BreakpointObserver,
  useValue: {
    observe: () => narrow.pipe(map((matches): BreakpointState => ({ matches, breakpoints: {} }))),
  },
};

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
    narrow.next(false);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: 'journal', component: BlankPage }]),
        breakpointStub,
        provideTranslateService({ lang: 'en' }),
        provideAuthStub({ email: 'admin@example.com', displayName: 'Admin', role: 'ADMIN' }),
      ],
    }).compileComponents();
    // Stub the `portfolioai` brand-mark icon so `<mat-icon svgIcon="portfolioai">` in the toolbar
    // doesn't log a "Unable to find icon" error during the test run. The production registration
    // lives in `app.config.ts > provideAppInitializer` ; the unit-test harness doesn't fire app
    // initializers, so we mirror it here with an empty SVG.
    TestBed.inject(MatIconRegistry).addSvgIconLiteral(
      'portfolioai',
      TestBed.inject(DomSanitizer).bypassSecurityTrustHtml('<svg></svg>'),
    );
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the toolbar brand mark on a non-login route', async () => {
    // The brand is visual-only since the wordmark was dropped — we assert on the mark element's
    // presence inside `.toolbar-brand` rather than on any text content. The actual SVG content is
    // resolved at runtime by `MatIconRegistry` (registered in `app.config.ts > provideAppInitializer`),
    // which the unit test setup does not load — the icon host renders empty, but the element is
    // still in the DOM, which is what we pin.
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const brandMark = compiled.querySelector('.toolbar-brand .brand-mark');
    expect(brandMark).toBeTruthy();
    expect(brandMark?.tagName.toLowerCase()).toBe('mat-icon');
  });

  describe('the menu on a narrow screen', () => {
    async function render() {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      return { fixture, el, drawer: () => el.querySelector('mat-sidenav')! };
    }

    it('stays docked and open, with no menu button, on a desktop', async () => {
      const { el, drawer } = await render();

      expect(el.querySelector('.menu-trigger')).toBeNull();
      expect(drawer().classList).toContain('mat-drawer-side');
      expect(drawer().classList).toContain('mat-drawer-opened');
    });

    it('becomes a closed drawer that the toolbar button opens', async () => {
      narrow.next(true);
      const { fixture, el, drawer } = await render();
      expect(drawer().classList).toContain('mat-drawer-over');
      expect(drawer().classList).not.toContain('mat-drawer-opened');

      (el.querySelector('.menu-trigger') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.componentInstance.menuOpen()).toBe(true);
      expect(drawer().classList).toContain('mat-drawer-opened');
    });

    // The drawer sits over the page it just opened : left open, it would hide that page.
    it('closes once a page is picked', async () => {
      narrow.next(true);
      const { fixture } = await render();
      fixture.componentInstance.menuOpen.set(true);

      await TestBed.inject(Router).navigateByUrl('/journal');
      await fixture.whenStable();

      expect(fixture.componentInstance.menuOpen()).toBe(false);
    });
  });
});
