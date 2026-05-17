import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../app-state/auth.service';

/**
 * Route guards driven by [AuthService] signals.
 *
 * **`authGuard`** — every route except `/login` should declare this. Reads
 * [AuthService.isAuthenticated] synchronously (signal-based, no async wait) ; redirects to
 * `/login` when no session is attached. The guard runs **after** the boot initializer has primed
 * the signal, so a fresh page load with no cookie correctly redirects on first navigation.
 *
 * **`adminGuard`** — stacked on top of `authGuard` for back-office routes
 * (`/settings/**`, `/observability/**`). Reads [AuthService.isAdmin] ; redirects a USER who
 * stumbles onto an admin URL back to `/dashboard`. We deliberately don't show a "403 forbidden"
 * page in v1 — silently redirecting matches the navbar gating (USER never sees the link in the
 * first place), so the only way to land here is a typed URL or a stale bookmark.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/login']);
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAdmin()) return true;
  return router.createUrlTree(['/dashboard']);
};
