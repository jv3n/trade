import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, tap } from 'rxjs';
import { AuthRepository, CurrentUser } from '../api/auth/auth.repository';

/**
 * Source of truth for the authenticated user on the SPA side.
 *
 * Primed at boot via `provideAppInitializer` (cf. `app.config.ts`) — the framework subscribes
 * to [refresh] and waits for it to complete before bootstrapping the root component, so the
 * signal is populated **before** the first route guard fires and **before** the toolbar renders.
 * No race between "navbar paints USER chip on a refresh" and "AuthService has loaded the user".
 *
 * The 401 branch of [refresh] is treated as expected — fresh page load without a session sets
 * [currentUser] to null and the boot continues ; the route guards then redirect to `/login`. The
 * downstream HTTP interceptor handles the "session expired mid-session" case symmetrically by
 * also nullifying the signal and routing to `/login`.
 *
 * The service deliberately does **not** persist the user to localStorage — the session cookie is
 * the source of truth, and stale cached state on a logged-out browser would only confuse the
 * guards.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly repo = inject(AuthRepository);

  private readonly _currentUser = signal<CurrentUser | null>(null);
  readonly currentUser = this._currentUser.asReadonly();

  private readonly _lastError = signal<string | null>(null);
  /**
   * Last non-401 error encountered while talking to `/api/me`. Null on the happy path. The login
   * page reads this signal to show an inline banner "session error, please sign out and retry"
   * when the user lands back on `/login` after a forced redirect from a 5xx — typically the
   * "logged in via OAuth but the DB row doesn't exist" stuck state.
   */
  readonly lastError = this._lastError.asReadonly();

  readonly isAuthenticated = computed(() => this._currentUser() !== null);
  readonly isAdmin = computed(() => this._currentUser()?.role === 'ADMIN');

  /**
   * Re-fetches `/api/me` and updates [currentUser]. Never propagates an error — the boot
   * initializer must complete in all cases or the SPA fails to bootstrap.
   *
   * Error handling :
   * - **HTTP 401** (no session) : set [currentUser] to null, clear [lastError]. The expected
   *   "logged-out fresh load" branch.
   * - **Any other error** (5xx, network, etc.) : set [currentUser] to null AND record the
   *   message in [lastError] so downstream UI (login banner, error page) can surface it. We
   *   don't crash the boot ; a non-functional backend should still render a usable SPA shell so
   *   the user can at least logout / re-authenticate.
   */
  refresh(): Observable<void> {
    return this.repo.getCurrentUser().pipe(
      tap((user) => {
        this._currentUser.set(user);
        this._lastError.set(null);
      }),
      catchError((err: HttpErrorResponse) => {
        this._currentUser.set(null);
        if (err.status === 401) {
          this._lastError.set(null);
        } else {
          this._lastError.set(err.message || `HTTP ${err.status}`);
        }
        return of(null);
      }),
      map(() => undefined),
    );
  }

  /**
   * POSTs `/logout` and nullifies the signal regardless of the backend response. We pessimistic-clear
   * the signal so a network failure that prevents the backend from invalidating the session still
   * locks the SPA out — the user can re-attempt logout, but the UI no longer shows their
   * identity. The cookie remains until the server-side session expires anyway.
   *
   * Uses `finalize` (not `tap`) so the clear runs on success **and** error — Spring Security's
   * default logout chain returns a 302 redirect that HttpClient can't always read as a clean
   * "next", and a `tap`-only clear would leave the signal set on those paths. `login-page`
   * watches `isAuthenticated()` and bounces logged-in users back to `/journal`, so a missed
   * clear here looks like "logout doesn't work" from the user's chair.
   */
  logout(): Observable<void> {
    return this.repo.logout().pipe(finalize(() => this._currentUser.set(null)));
  }

  /**
   * Synchronous local clear of the cached user — no HTTP. Called by the auth interceptor on a 401
   * from `/api/**` so the toolbar reflects the logged-out state immediately, without waiting for
   * the redirect to `/login` (which will trigger a fresh `refresh()` and confirm the null).
   */
  clear(): void {
    this._currentUser.set(null);
  }

  /** Resets [lastError] — called after the user has been shown the error and acted on it. */
  clearError(): void {
    this._lastError.set(null);
  }
}
