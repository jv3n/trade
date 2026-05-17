import { Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { TranslatePipe } from '@ngx-translate/core';
import { ThemeService } from './core/app-state/theme.service';
import { LanguageService, Language } from './core/app-state/language.service';
import { AuthService } from './core/app-state/auth.service';

/**
 * Application shell — top toolbar + router outlet. The toolbar is **hidden** on `/login` so the
 * login page renders as a full-height standalone layout ; everywhere else it shows the
 * navigation, the user menu, the language switcher and the settings cog.
 *
 * Role-based gating :
 * - **Observability** + **Settings** entries render only when [AuthService.isAdmin]. A USER
 *   never sees them. The `adminGuard` on the same routes is the second line of defence — if a
 *   USER types the URL manually, the guard redirects to `/dashboard`.
 * - **User menu** shows display name (fallback to email) and a logout button. Logout POSTs
 *   `/logout` then routes to `/login`.
 */
@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatMenuModule,
    TranslatePipe,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly theme = inject(ThemeService);
  readonly language = inject(LanguageService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

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

  /** Displayed in the user menu trigger ; falls back to email if Google didn't return a name. */
  readonly userDisplay = computed(() => {
    const user = this.auth.currentUser();
    return user?.displayName ?? user?.email ?? '';
  });

  setLanguage(lang: Language): void {
    this.language.set(lang);
  }

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
