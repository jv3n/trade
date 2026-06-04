import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/app-state/auth.service';
import { StbButtonModule, StbIconModule } from '@portfolioai/ui';

/**
 * `/error` — global "something went wrong" page reached by the auth interceptor on a 5xx from
 * `/api/**` or by manual navigation when the SPA enters an unrecoverable state.
 *
 * Two action buttons :
 * - **Logout** — POST `/logout`, clears Spring's session + the SPA's [AuthService.currentUser],
 *   then navigates to `/login`. The recovery path for "authenticated session but DB user is
 *   missing" — clearing the session lets the next OAuth login re-create the row.
 * - **Back to login** — direct navigate without server-side logout, for cases where the user
 *   knows they want to retry without clearing the session (rare but worth offering).
 *
 * The query params `status` and `url` (set by the interceptor) are surfaced in the error
 * details so the user can report a useful trace. Both are optional ; the page degrades to a
 * generic message when navigated without them.
 */
@Component({
  selector: 'app-error-page',
  imports: [StbButtonModule, StbIconModule, TranslatePipe],
  templateUrl: './error-page.html',
  styleUrl: './error-page.scss',
})
export class ErrorPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly status = computed(() => this.queryParams()?.get('status') ?? null);
  readonly url = computed(() => this.queryParams()?.get('url') ?? null);
  readonly authError = this.auth.lastError;

  signOut(): void {
    this.auth.logout().subscribe({
      next: () => this.navigateToLogin(),
      error: () => this.navigateToLogin(),
    });
  }

  backToLogin(): void {
    this.auth.clearError();
    this.navigateToLogin();
  }

  private navigateToLogin(): void {
    void this.router.navigate(['/login']);
  }
}
