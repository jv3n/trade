import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/router/auth.guards';

/**
 * Trading-tracking app : account, journal (+ CSV io), stats sheet, candidates, lexicon, settings.
 *
 * **Admin gating** is per sub-route, not on `/settings` itself, so USER role can reach
 * `/settings/preferences` (theme + language) while ADMIN-only sub-routes (ops-links,
 * access-control, stats-import, lexicon) keep their `adminGuard`.
 */
export const routes: Routes = [
  // `/login` and `/error` are the two routes exempt from `authGuard`. `/login` is the OAuth entry
  // point. `/error` is a manual escape hatch the user can navigate to via `AuthService.lastError`
  // (logout + retry without being stuck in an authenticated-but-broken state) — the auth
  // interceptor does **not** auto-redirect on 5xx, components handle local error UI in-band.
  {
    path: 'login',
    loadComponent: () => import('./features/login/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'error',
    loadComponent: () => import('./features/error/error-page').then((m) => m.ErrorPage),
  },
  { path: '', redirectTo: 'account', pathMatch: 'full' },
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () => import('./features/account/account-page').then((m) => m.AccountPage),
  },
  {
    path: 'candidates',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/candidates/candidates-page').then((m) => m.CandidatesPage),
  },
  {
    path: 'stats',
    canActivate: [authGuard],
    loadComponent: () => import('./features/stats/stats-page').then((m) => m.StatsPage),
  },
  {
    path: 'journal',
    canActivate: [authGuard],
    loadComponent: () => import('./features/journal/journal-page').then((m) => m.JournalPage),
  },
  {
    path: 'journal/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/journal/journal-detail-page/journal-detail-page').then(
        (m) => m.JournalDetailPage,
      ),
  },
  {
    path: 'journal-io',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/journal-io/journal-io-page').then((m) => m.JournalIoPage),
  },
  {
    path: 'lexicon',
    canActivate: [authGuard],
    loadComponent: () => import('./features/lexicon/lexicon-page').then((m) => m.LexiconPage),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
    children: [
      { path: '', redirectTo: 'preferences', pathMatch: 'full' },
      {
        path: 'preferences',
        loadComponent: () =>
          import('./features/settings/preferences/preferences').then((m) => m.PreferencesPage),
      },
      {
        path: 'ops-links',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/settings/ops-links/ops-links').then((m) => m.OpsLinksPage),
      },
      {
        path: 'access-control',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/settings/access-control/access-control').then(
            (m) => m.AccessControlPage,
          ),
      },
      {
        path: 'stats-import',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/settings/stats-import/stats-import').then((m) => m.StatsImportPage),
      },
      {
        path: 'lexicon',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/settings/lexicon/lexicon-admin').then((m) => m.LexiconAdminPage),
      },
    ],
  },
  // 404 fallback — any unknown URL routes to `/account` (the default landing). The authGuard will
  // catch unauthenticated users on the next hop and bounce them to `/login`, so the redirect target
  // works whether the user is logged in or not.
  { path: '**', redirectTo: 'account' },
];
