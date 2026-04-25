import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard').then((m) => m.Dashboard),
  },
  { path: 'import', loadComponent: () => import('./import/import').then((m) => m.Import) },
  { path: 'suivi', loadComponent: () => import('./suivi/suivi').then((m) => m.Suivi) },
  {
    path: 'recommendations',
    loadComponent: () => import('./recommendations/recommendations').then((m) => m.Recommendations),
  },
  { path: 'history', loadComponent: () => import('./history/history').then((m) => m.History) },
  { path: 'settings', loadComponent: () => import('./settings/settings').then((m) => m.Settings) },
];
