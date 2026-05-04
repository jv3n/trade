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
    path: 'recommendations',
    loadComponent: () =>
      import('./features/recommendations/recommendations').then((m) => m.Recommendations),
  },
  {
    path: 'history',
    loadComponent: () => import('./features/history/history').then((m) => m.History),
  },
  {
    path: 'ticker/:symbol',
    loadComponent: () => import('./features/ticker/ticker').then((m) => m.TickerPage),
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
    children: [
      { path: '', redirectTo: 'sources', pathMatch: 'full' },
      {
        path: 'sources',
        loadComponent: () => import('./features/settings/sources/sources').then((m) => m.Sources),
      },
      {
        path: 'test-sources',
        loadComponent: () =>
          import('./features/settings/test-sources/test-sources').then((m) => m.TestSources),
      },
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
    ],
  },
];
