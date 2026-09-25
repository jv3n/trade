import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/router/auth.guards';
import { unsavedChangesGuard } from './core/router/unsaved-changes.guard';

/**
 * Trading-tracking app : today (home), candidates, stats sheet, journal, account, calculator,
 * lexicon and settings.
 *
 * **Admin gating** is per sub-route, not on `/settings` itself, so USER role can reach
 * `/settings/preferences` (theme + language) while ADMIN-only sub-routes (ops-links,
 * access-control, data, lexicon) keep their `adminGuard`.
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
  // The home page since #199 : the day's walk-through, not the ledger.
  { path: '', redirectTo: 'today', pathMatch: 'full' },
  {
    path: 'today',
    canActivate: [authGuard],
    loadComponent: () => import('./features/today/today-page').then((m) => m.TodayPage),
  },
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
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () =>
      import('./features/journal/journal-detail-page/journal-detail-page').then(
        (m) => m.JournalDetailPage,
      ),
  },
  {
    path: 'calculator',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/calculator/calculator-page').then((m) => m.CalculatorPage),
  },
  {
    path: 'patterns',
    canActivate: [authGuard],
    loadComponent: () => import('./features/patterns/patterns-page').then((m) => m.PatternsPage),
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
        path: 'data',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/settings/data/data').then((m) => m.DataPage),
      },
      {
        path: 'lexicon',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/settings/lexicon/lexicon-admin').then((m) => m.LexiconAdminPage),
      },
    ],
  },
  // Unknown URL (#316) — sent to the home page, **and the address bar follows** : landing on
  // `/account` under a wrong URL made a bookmarked typo look like a working page. `today` is the
  // day's starting point, so a mistyped link drops the user where the day begins rather than in
  // the ledger. The authGuard on `/today` still bounces an anonymous visitor to `/login`.
  { path: '**', redirectTo: 'today' },
];
