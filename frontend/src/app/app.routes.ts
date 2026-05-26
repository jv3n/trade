import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/router/auth.guards';

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
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'import',
    canActivate: [authGuard],
    loadComponent: () => import('./features/import/import').then((m) => m.Import),
  },
  {
    path: 'suivi',
    canActivate: [authGuard],
    loadComponent: () => import('./features/suivi/suivi').then((m) => m.Suivi),
  },
  {
    path: 'radar',
    canActivate: [authGuard],
    loadComponent: () => import('./features/radar/radar').then((m) => m.RadarPage),
  },
  {
    path: 'ticker/:symbol',
    canActivate: [authGuard],
    loadComponent: () => import('./features/ticker/ticker').then((m) => m.TickerPage),
  },
  {
    path: 'observability',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./features/observability/index/observability-index').then(
        (m) => m.ObservabilityIndexPage,
      ),
  },
  // Literal `/observability/bias` declared **before** `/observability/:symbol` so the router
  // matches the literal segment first (otherwise `bias` would bind as a `symbol` and load the
  // per-ticker timeline with an empty corpus).
  {
    path: 'observability/bias',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/observability/bias/bias').then((m) => m.BiasPage),
  },
  {
    path: 'observability/:symbol',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./features/observability/observability').then((m) => m.ObservabilityPage),
  },
  {
    path: 'settings',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
    children: [
      { path: '', redirectTo: 'ops-links', pathMatch: 'full' },
      {
        path: 'ops-links',
        loadComponent: () =>
          import('./features/settings/ops-links/ops-links').then((m) => m.OpsLinksPage),
      },
      {
        path: 'configuration',
        loadComponent: () =>
          import('./features/settings/configuration/configuration').then((m) => m.Configuration),
      },
      {
        path: 'prompts',
        loadComponent: () =>
          import('./features/settings/prompts/prompts').then((m) => m.PromptsPage),
      },
      {
        path: 'prompts/:id/stats',
        loadComponent: () =>
          import('./features/settings/prompts/prompt-stats/prompt-stats').then(
            (m) => m.PromptStatsPage,
          ),
      },
      {
        path: 'access-control',
        loadComponent: () =>
          import('./features/settings/access-control/access-control').then(
            (m) => m.AccessControlPage,
          ),
      },
    ],
  },
  // 404 fallback — any unknown URL routes to the dashboard. The authGuard will catch
  // unauthenticated users on the next hop and bounce them to /login, so the redirect target
  // works whether the user is logged in or not.
  { path: '**', redirectTo: 'dashboard' },
];
