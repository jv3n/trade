import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/router/auth.guards';

/**
 * v1.0 pivot — pre-pivot feature routes (dashboard, ticker, suivi, radar, observability, import)
 * are intentionally removed here while the corresponding feature folders stay in `features/`
 * untouched. `/settings/*` is **kept** because (a) the providers configuration UI is on the
 * keep-list per `docs/projet/roadmap.md` (runtime rotation of API keys / providers stays useful
 * for the journal feature too), (b) prompts / access-control sub-routes ride along until we
 * trim them explicitly. Old features will be either rewired or deleted in upcoming sessions.
 *
 * **Admin gating** is per sub-route now, not on `/settings` itself, so USER role can reach
 * `/settings/preferences` (theme + language) while ADMIN-only sub-routes (ops-links,
 * configuration, prompts, access-control) keep their `adminGuard`.
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
  { path: '', redirectTo: 'journal', pathMatch: 'full' },
  {
    path: 'journal',
    canActivate: [authGuard],
    loadComponent: () => import('./features/journal/journal-page').then((m) => m.JournalPage),
  },
  {
    path: 'journal-io',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/journal-io/journal-io-page').then((m) => m.JournalIoPage),
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
        path: 'configuration',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/settings/configuration/configuration').then((m) => m.Configuration),
      },
      {
        path: 'prompts',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/settings/prompts/prompts').then((m) => m.PromptsPage),
      },
      {
        path: 'prompts/:id/stats',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/settings/prompts/prompt-stats/prompt-stats').then(
            (m) => m.PromptStatsPage,
          ),
      },
      {
        path: 'access-control',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/settings/access-control/access-control').then(
            (m) => m.AccessControlPage,
          ),
      },
    ],
  },
  // 404 fallback — any unknown URL routes to `/journal`. The authGuard will catch
  // unauthenticated users on the next hop and bounce them to `/login`, so the redirect target
  // works whether the user is logged in or not.
  { path: '**', redirectTo: 'journal' },
];
