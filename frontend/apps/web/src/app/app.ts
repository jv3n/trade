import { Component, computed, effect, inject, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { MatSidenavContainer } from '@angular/material/sidenav';

import { TranslatePipe } from '@ngx-translate/core';
import { ThemeService } from './core/app-state/theme.service';
import { LanguageService } from './core/app-state/language.service';
import { AuthService } from './core/app-state/auth.service';
import { SidenavCollapseService } from './core/app-state/sidenav-collapse.service';
import {
  StbButtonModule,
  StbDividerModule,
  StbIconModule,
  StbListModule,
  StbMenuModule,
  StbSidenavModule,
  StbToolbarModule,
  StbTooltipModule,
} from '@portfolioai/ui';

/**
 * Application shell — top toolbar + left sidenav + router outlet (v1.0 pivot layout, cf.
 * `docs/projet/roadmap.md`). The toolbar carries only the brand + the user menu now — theme
 * toggle, language switcher and the admin settings shortcut all moved into `/settings`
 * (Preferences sub-tab for theme + language, available to every role ; admin items gated by
 * `auth.isAdmin()` in the settings sidenav). The journal sidenav hosts the primary navigation
 * and grows as new features land. The toolbar + sidenav are **hidden** on `/login` and
 * `/error` so those pages render as full-height standalone layouts.
 *
 * **ThemeService and LanguageService are injected here even though the template no longer
 * reads them directly** — both services apply their saved value (`<html data-theme>` /
 * `translate.use()`) in their constructor, and they only run that boot-time side effect if
 * someone *injects* them. Keeping the injections in the root component guarantees the
 * persisted theme + language are applied before the first paint, even if the user never opens
 * the Preferences page.
 */
@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    StbToolbarModule,
    StbButtonModule,
    StbIconModule,
    StbTooltipModule,
    StbMenuModule,
    StbDividerModule,
    StbSidenavModule,
    StbListModule,
    TranslatePipe,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly auth = inject(AuthService);
  readonly sidenavCollapse = inject(SidenavCollapseService);
  private readonly router = inject(Router);

  // Side-effect-only injections — see class-level docstring. The services' constructors apply
  // the persisted theme / language before the first paint ; without these references they'd
  // never be constructed because no other code path injects them at boot. `_`-prefixed so the
  // unused-vars rule (configured to ignore that prefix) lets them through without a directive.
  private readonly _theme = inject(ThemeService);
  private readonly _language = inject(LanguageService);

  // `<mat-sidenav-container>` query — needed to manually trigger Material's content-margin
  // recomputation when the sidenav width changes. Without this, toggling `collapsed` shrinks
  // the sidenav's CSS width but leaves the content panel offset by the original 240 px.
  private readonly sidenavContainer = viewChild<MatSidenavContainer>('sidenavContainer');

  constructor() {
    // Re-runs whenever `collapsed()` flips. The microtask defers the call until after the
    // CSS variable change has propagated to layout — calling `updateContentMargins()` while
    // the DOM still reports the old width would just compute the same margin again.
    effect(() => {
      this.sidenavCollapse.collapsed();
      queueMicrotask(() => this.sidenavContainer()?.updateContentMargins());
    });
  }

  /**
   * True when the current URL is `/login` or `/error` — used to hide the toolbar so those pages
   * render as standalone full-height layouts. We derive it from `router.events` rather than
   * reading `router.url` directly because the URL is mutable and not reactive ; `toSignal` on
   * the filtered event stream gives us a clean reactive primitive that matches
   * `auth.isAuthenticated` in style.
   *
   * `startWith(router.url)` seeds the signal with the initial URL — without it, the toolbar
   * would briefly flash on `/login` before the first NavigationEnd fires.
   */
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly isStandaloneRoute = computed(() => {
    const url = this.currentUrl();
    return url.startsWith('/login') || url.startsWith('/error');
  });

  /**
   * True when the current URL is under `/settings`. Settings provides its **own** left sidenav
   * with its sub-routes (preferences / ops-links / configuration / prompts / access-control),
   * so the global app sidenav is hidden to avoid stacking two nav columns side-by-side. The
   * toolbar stays visible so the user menu stays reachable.
   */
  readonly isInSettings = computed(() => this.currentUrl().startsWith('/settings'));

  /** Displayed in the user menu trigger ; falls back to email if Google didn't return a name. */
  readonly userDisplay = computed(() => {
    const user = this.auth.currentUser();
    return user?.displayName ?? user?.email ?? '';
  });

  signOut(): void {
    this.auth.logout().subscribe({
      // Always navigate to /login regardless of backend success/failure — the local signal is
      // already cleared in AuthService.logout's tap, so the toolbar reflects the new state
      // before the navigation completes.
      next: () => void this.router.navigate(['/login']),
      error: () => void this.router.navigate(['/login']),
    });
  }
}
