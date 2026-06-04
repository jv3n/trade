import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../app-state/auth.service';

/**
 * Auth-related HTTP error handler. Scope deliberately **narrow** : the only routing decision the
 * interceptor makes is "session expired → bounce to /login". Everything else propagates to the
 * caller, who decides whether to show an inline error, a banner, a retry button, or anything else
 * that fits the surface.
 *
 * - **401 from `/api/**`** (session expired mid-session) → clear [AuthService.currentUser] and
 *   navigate to `/login`. The user re-triggers the OAuth dance from there. This is the only
 *   case where global routing is correct : without an authenticated session, no other UI is
 *   reachable anyway.
 *
 * What this interceptor **deliberately does NOT do** :
 * - **No `/error` redirect on 5xx**. A 503 on a widget endpoint (news, analyst, earnings,
 *   narrative) is a fail-soft transient — the component shows "data unavailable" inline, the
 *   rest of the page keeps working. Bouncing the whole user to `/error` would be hostile UX. A
 *   500 from a mutation needs an inline snackbar / banner near the action button, not a
 *   full-page redirect. The `/error` route stays available for explicit navigation (e.g. from a
 *   future fatal error boundary) but the interceptor doesn't trigger it.
 * - **No retry logic**. Components own their retry strategy (snackbar with "Réessayer" button,
 *   etc.). Centralising retry here would race with caller-level intent.
 *
 * Three skip conditions for the 401 branch :
 * - **Non-`/api/**` URLs** — OAuth dance + static assets must NOT trigger any redirect.
 * - **`/api/me`** — already handled by [AuthService.refresh] which records errors into the
 *   `lastError` signal. The login page surfaces them ; no global redirect.
 * - **`/api/config`** — admin-only endpoint that the `LlmTimeoutService` boot initializer hits.
 *   Its 401 races [AuthService.refresh] under valid USER sessions ; the service swallows it.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isInterestingApiCall =
    req.url.startsWith('/api/') &&
    !req.url.startsWith('/api/me') &&
    !req.url.startsWith('/api/config');

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (isInterestingApiCall && err.status === 401) {
        auth.clear();
        void router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
