import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../app-state/auth.service';

/**
 * HTTP error handler — two distinct failure modes, two distinct routes :
 *
 * - **401 from `/api/**`** (session expired mid-session) → clear [AuthService.currentUser] and
 *   navigate to `/login`. The user re-triggers the OAuth dance from there.
 * - **5xx from `/api/**`** (backend broken / inconsistent state — e.g. authenticated session but
 *   the DB user row is missing) → navigate to `/error`. The page shows the message and offers a
 *   logout button to clear Spring's session before re-attempting login. Without this route, the
 *   user would see the SPA's empty page or a stuck spinner with no path forward.
 *
 * Three skip conditions, identical for both branches :
 * - **Non-`/api/**` URLs** — OAuth dance + static assets must NOT trigger any redirect.
 * - **`/api/me`** — already handled by [AuthService.refresh] which records errors into the
 *   `lastError` signal. The login page surfaces them ; no global redirect.
 * - **`/api/config`** — admin-only endpoint that the `LlmTimeoutService` boot initializer hits.
 *   Its 401 races [AuthService.refresh] under valid USER sessions ; its 5xx isn't user-fixable
 *   either. The service swallows both internally.
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
      if (!isInterestingApiCall) return throwError(() => err);
      if (err.status === 401) {
        auth.clear();
        void router.navigate(['/login']);
      } else if (err.status >= 500 && err.status < 600) {
        void router.navigate(['/error'], {
          queryParams: { status: err.status, url: req.url },
        });
      }
      return throwError(() => err);
    }),
  );
};
