import { Component, PLATFORM_ID, effect, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
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
 * `/dashboard` immediately — typically happens when the user bookmarks `/login` or hits Back
 * after logging in. Done via an `effect()` so the redirect runs after the signal is primed by
 * the boot initializer.
 */
@Component({
  selector: 'app-login-page',
  imports: [MatButtonModule, MatIconModule, TranslatePipe],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.router.navigate(['/dashboard']);
      }
    });
  }

  signInWithGoogle(): void {
    if (!this.isBrowser) return;
    window.location.href = '/oauth2/authorization/google';
  }
}
