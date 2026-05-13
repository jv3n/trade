import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'import',
    loadComponent: () => import('./features/import/import').then((m) => m.Import),
  },
  {
    path: 'suivi',
    loadComponent: () => import('./features/suivi/suivi').then((m) => m.Suivi),
  },
  {
    path: 'ticker/:symbol',
    loadComponent: () => import('./features/ticker/ticker').then((m) => m.TickerPage),
  },
  {
    path: 'observability/:symbol',
    loadComponent: () =>
      import('./features/observability/observability').then((m) => m.ObservabilityPage),
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
    children: [
      { path: '', redirectTo: 'configuration', pathMatch: 'full' },
      {
        path: 'prompt-preview',
        loadComponent: () =>
          import('./features/settings/prompt-preview/prompt-preview').then(
            (m) => m.PromptPreviewPage,
          ),
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
    ],
  },
];
