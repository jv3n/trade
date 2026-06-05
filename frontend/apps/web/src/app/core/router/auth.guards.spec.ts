/**
 * Tests on [authGuard] and [adminGuard] — the canActivate functions that protect every route
 * except `/login`.
 *
 * The guards are tiny but load-bearing : they're the second line of defence behind the navbar
 * gating. The tests pin the logical contracts :
 * - [authGuard] returns `true` when [AuthService.isAuthenticated] is true ; otherwise returns a
 *   `UrlTree` pointing at `/login`.
 * - [adminGuard] returns `true` when [AuthService.isAdmin] is true ; otherwise returns a
 *   `UrlTree` pointing at `/journal` (USER stumbled onto an ADMIN URL — we don't show a 403
 *   page, we just send them home).
 *
 * We exercise the guard functions directly with a `runInInjectionContext` wrapper rather than
 * spinning up the Router — the `inject(Router)` call needs an injection context, but the actual
 * `router.createUrlTree(...)` is deterministic on its input.
 */
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { AuthService } from '../app-state/auth.service';
import { adminGuard, authGuard } from './auth.guards';

// Mocking ActivatedRouteSnapshot + RouterStateSnapshot — both are unused by our guards, so we
// pass `undefined as never`. If a future guard reads them, the test compiler error will surface
// the dependency immediately.
const unusedSnapshot = undefined as never;

function setup(currentUser: { role: 'ADMIN' | 'USER' } | null) {
  // Stand-in for AuthService — the guards only read isAuthenticated() and isAdmin(), which are
  // computed signals over currentUser. We mirror that shape with two `signal`s so the guard's
  // signal reads succeed.
  const _currentUser = signal<{ role: 'ADMIN' | 'USER' } | null>(currentUser);
  const stub = {
    currentUser: _currentUser.asReadonly(),
    isAuthenticated: () => _currentUser() !== null,
    isAdmin: () => _currentUser()?.role === 'ADMIN',
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthService, useValue: stub }],
  });
}

describe('authGuard', () => {
  it('returns true when the user is authenticated', () => {
    setup({ role: 'USER' });
    const result = TestBed.runInInjectionContext(() => authGuard(unusedSnapshot, unusedSnapshot));
    expect(result).toBe(true);
  });

  it('returns a UrlTree to /login when the user is not authenticated', () => {
    setup(null);
    const result = TestBed.runInInjectionContext(() => authGuard(unusedSnapshot, unusedSnapshot));
    expect(result).toBeInstanceOf(UrlTree);
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login');
  });
});

describe('adminGuard', () => {
  it('returns true when the user is ADMIN', () => {
    setup({ role: 'ADMIN' });
    const result = TestBed.runInInjectionContext(() => adminGuard(unusedSnapshot, unusedSnapshot));
    expect(result).toBe(true);
  });

  it('returns a UrlTree to /journal when the user is USER', () => {
    // The "USER typed an admin URL" branch. We deliberately don't show a 403 page — the navbar
    // hides the link, the guard silently sends them home. Pin the destination so a future change
    // to "/" or "/login" surfaces here.
    setup({ role: 'USER' });
    const result = TestBed.runInInjectionContext(() => adminGuard(unusedSnapshot, unusedSnapshot));
    expect(result).toBeInstanceOf(UrlTree);
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(result as UrlTree)).toBe('/journal');
  });

  it('returns a UrlTree to /journal when no user is authenticated', () => {
    // Edge case — `adminGuard` is always stacked on top of `authGuard` in routing, so this
    // branch shouldn't be reached in practice. But the guard must be safe in isolation : an
    // unauthenticated user is by definition not admin, so we send them to /journal (which the
    // authGuard would then bounce to /login). The chain converges.
    setup(null);
    const result = TestBed.runInInjectionContext(() => adminGuard(unusedSnapshot, unusedSnapshot));
    expect(result).toBeInstanceOf(UrlTree);
    const router = TestBed.inject(Router);
    expect(router.serializeUrl(result as UrlTree)).toBe('/journal');
  });
});
