import { isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';
import { StbButtonModule, StbIconModule } from '@portfolioai/ui';
import { AuthService } from '../../core/app-state/auth.service';

/**
 * `/login` page. One job : trigger the OAuth dance.
 *
 * The "Sign in with Google" button sets `window.location.href = '/oauth2/authorization/google'`,
 * which hits the backend via the dev-server proxy. Spring Security then redirects to Google,
 * Google bounces back to `/login/oauth2/code/google`, the backend creates a session, sets the
 * `JSESSIONID` cookie, and redirects to `/` — the SPA reloads, [AuthService.refresh] picks up
 * the new session, and the user lands on the dashboard.
 *
 * If [AuthService.isAuthenticated] is already true when the page mounts, we redirect to
 * `/journal` immediately (the v1.0 landing page post-pivot) — typically happens when the user
 * bookmarks `/login` or hits Back after logging in. Done via an `effect()` so the redirect runs
 * after the signal is primed by the boot initializer.
 */
@Component({
  selector: 'app-login-page',
  imports: [StbButtonModule, StbIconModule, TranslatePipe],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /**
   * i18n key for an inline error banner above the Google CTA. Populated when the user is bounced
   * back here from a failed OAuth flow — typically with `?error=not_authorized` when their email
   * isn't in the effective whitelist (cf. `CustomOAuth2UserService.assertAuthorized` backend-side),
   * or `?error=oauth_failed` as a catch-all for any other OAuth2 failure. Unknown codes degrade
   * silently — never render an opaque error banner that the user can't act on.
   */
  readonly errorKey = computed(() => {
    const code = this.queryParams()?.get('error');
    switch (code) {
      case 'not_authorized':
        return 'auth.errors.notAuthorized';
      case 'oauth_failed':
        return 'auth.errors.oauthFailed';
      default:
        return null;
    }
  });

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.router.navigate(['/journal']);
      }
    });
  }

  signInWithGoogle(): void {
    if (!this.isBrowser) return;
    window.location.href = '/oauth2/authorization/google';
  }
}
