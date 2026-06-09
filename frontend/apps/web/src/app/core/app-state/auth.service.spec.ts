/**
 * Tests on [AuthService] — the signal-based bridge between the backend's `/api/me` and the SPA.
 *
 * The service is small (~50 lines) but is the contract every guard, every interceptor and the
 * toolbar lean on. The tests pin :
 *
 * - **Initial state** : signal is null before any refresh resolves. The boot initializer is the
 *   first caller ; subscribers that read the signal before initialization see null, which the
 *   guards interpret as "not authenticated → redirect to /login".
 * - **Refresh success** : a 200 OK from `/api/me` lands the user on the signal verbatim. The
 *   derived [isAuthenticated] / [isAdmin] computeds reflect the new state synchronously (signal
 *   reads).
 * - **Refresh 401** : the expected "no session" branch nulls the signal and completes the
 *   observable without throwing. The boot initializer relies on this — a 401 must not break the
 *   bootstrap chain.
 * - **Refresh non-401 error** : nulls the signal, records the message in `lastError`, and
 *   completes the Observable without throwing. The boot initializer must complete in all cases
 *   or the SPA fails to bootstrap — the cost of letting a 500 crash the boot is a stuck spinner
 *   with no recovery path. The `lastError` signal is what surfaces the failure to the user.
 * - **Logout** : POSTs `/logout` (we don't assert the body, only the call) and clears the signal.
 * - **`clear()`** : sync local clear without HTTP. Used by the auth interceptor on a `/api/**`
 *   401 so the toolbar reflects the logged-out state before the navigation completes.
 */
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { AuthRepository, CurrentUser, PreferencesUpdate } from '../api/auth/auth.repository';
import { AuthService } from './auth.service';

class StubRepository extends AuthRepository {
  getCurrentUserQueue: (() => Observable<CurrentUser>)[] = [];
  logoutQueue: (() => Observable<void>)[] = [];
  updatePreferencesQueue: (() => Observable<CurrentUser>)[] = [];
  getCurrentUserCount = 0;
  logoutCount = 0;
  lastPreferences: PreferencesUpdate | null = null;

  getCurrentUser(): Observable<CurrentUser> {
    this.getCurrentUserCount += 1;
    const next = this.getCurrentUserQueue.shift();
    if (!next) {
      throw new Error('StubRepository: getCurrentUser queue empty — test forgot to enqueue');
    }
    return next();
  }

  logout(): Observable<void> {
    this.logoutCount += 1;
    const next = this.logoutQueue.shift();
    if (!next) {
      throw new Error('StubRepository: logout queue empty — test forgot to enqueue');
    }
    return next();
  }

  updatePreferences(prefs: PreferencesUpdate): Observable<CurrentUser> {
    this.lastPreferences = prefs;
    const next = this.updatePreferencesQueue.shift();
    if (!next) {
      throw new Error('StubRepository: updatePreferences queue empty — test forgot to enqueue');
    }
    return next();
  }
}

function setup(): { service: AuthService; repo: StubRepository } {
  const repo = new StubRepository();
  TestBed.configureTestingModule({
    providers: [AuthService, { provide: AuthRepository, useValue: repo }],
  });
  return { service: TestBed.inject(AuthService), repo };
}

function admin(): CurrentUser {
  return { email: 'admin@example.com', displayName: 'Admin User', role: 'ADMIN' };
}

function user(): CurrentUser {
  return { email: 'user@example.com', displayName: null, role: 'USER' };
}

describe('AuthService', () => {
  it('exposes null and is not authenticated before refresh resolves', () => {
    const { service } = setup();
    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(service.isAdmin()).toBe(false);
  });

  it('populates currentUser, isAuthenticated and isAdmin on successful refresh of an ADMIN', () => {
    const { service, repo } = setup();
    repo.getCurrentUserQueue.push(() => of(admin()));

    service.refresh().subscribe();

    expect(service.currentUser()).toEqual(admin());
    expect(service.isAuthenticated()).toBe(true);
    expect(service.isAdmin()).toBe(true);
  });

  it('marks isAuthenticated true but isAdmin false for a USER refresh', () => {
    const { service, repo } = setup();
    repo.getCurrentUserQueue.push(() => of(user()));

    service.refresh().subscribe();

    expect(service.isAuthenticated()).toBe(true);
    expect(service.isAdmin()).toBe(false);
  });

  it('refresh() on HTTP 401 nullifies the signal and completes without throwing', () => {
    // The "no session attached" branch — fresh page load without a cookie. The boot initializer
    // subscribes to this Observable ; if it errored, Angular's bootstrap would fail and the SPA
    // would never render. Pin the contract explicitly.
    const { service, repo } = setup();
    repo.getCurrentUserQueue.push(() => throwError(() => new HttpErrorResponse({ status: 401 })));

    let errored = false;
    let completed = false;
    service.refresh().subscribe({
      error: () => {
        errored = true;
      },
      complete: () => {
        completed = true;
      },
    });

    expect(errored).toBe(false);
    expect(completed).toBe(true);
    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('refresh() on a 500 nulls the user, records lastError, and completes without throwing', () => {
    // The boot initializer subscribes to this Observable. If a 500 propagated, Angular's
    // bootstrap would fail and the SPA would never render — the user would be stuck on a blank
    // page with no way to logout. We swallow the error here, set `lastError` so the login page
    // / error page can surface a useful message, and let the boot continue.
    const { service, repo } = setup();
    repo.getCurrentUserQueue.push(() =>
      throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' })),
    );

    let errored = false;
    let completed = false;
    service.refresh().subscribe({
      error: () => {
        errored = true;
      },
      complete: () => {
        completed = true;
      },
    });

    expect(errored).toBe(false);
    expect(completed).toBe(true);
    expect(service.currentUser()).toBeNull();
    expect(service.lastError()).not.toBeNull();
  });

  it('clearError() resets lastError to null', () => {
    // Called after the user has been shown the error and clicked through (logout or back-to-login)
    // — the next successful login should not display a stale banner.
    const { service, repo } = setup();
    repo.getCurrentUserQueue.push(() => throwError(() => new HttpErrorResponse({ status: 500 })));
    service.refresh().subscribe();
    expect(service.lastError()).not.toBeNull();

    service.clearError();

    expect(service.lastError()).toBeNull();
  });

  it('a successful refresh clears any previous lastError', () => {
    // The "transient outage" branch — backend came back, the user's session is valid, the
    // banner should disappear. Pin this so a future refactor that forgets the explicit
    // `_lastError.set(null)` on the success path doesn't leave a stale error sticking around.
    const { service, repo } = setup();
    repo.getCurrentUserQueue.push(() => throwError(() => new HttpErrorResponse({ status: 500 })));
    repo.getCurrentUserQueue.push(() => of(admin()));

    service.refresh().subscribe();
    expect(service.lastError()).not.toBeNull();

    service.refresh().subscribe();

    expect(service.lastError()).toBeNull();
    expect(service.currentUser()).toEqual(admin());
  });

  it('logout() calls the repository and clears the signal', () => {
    const { service, repo } = setup();
    repo.getCurrentUserQueue.push(() => of(admin()));
    repo.logoutQueue.push(() => of(undefined));
    service.refresh().subscribe();
    expect(service.currentUser()).toEqual(admin());

    service.logout().subscribe();

    expect(repo.logoutCount).toBe(1);
    expect(service.currentUser()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('updatePreferences() persists and lands the refreshed user on the signal', () => {
    // The theme / language services lean on this : they call updatePreferences and read the change
    // back off `currentUser`, so the signal update is what drives the DOM / ngx-translate switch.
    const { service, repo } = setup();
    repo.getCurrentUserQueue.push(() => of(admin()));
    service.refresh().subscribe();

    const updated: CurrentUser = { ...admin(), theme: 'light', language: 'en' };
    repo.updatePreferencesQueue.push(() => of(updated));

    service.updatePreferences({ theme: 'light' }).subscribe();

    expect(repo.lastPreferences).toEqual({ theme: 'light' });
    expect(service.currentUser()).toEqual(updated);
  });

  it('clear() nullifies the signal without calling the repository', () => {
    // The interceptor path : a /api/** call returned 401, the auth state is stale, we need the
    // toolbar to reflect "logged out" immediately. No HTTP — that would be wasteful (we just
    // confirmed there's no session) and would race the redirect to /login.
    const { service, repo } = setup();
    repo.getCurrentUserQueue.push(() => of(admin()));
    service.refresh().subscribe();
    expect(service.currentUser()).toEqual(admin());

    service.clear();

    expect(service.currentUser()).toBeNull();
    expect(repo.logoutCount).toBe(0);
  });
});
