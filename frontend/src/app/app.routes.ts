import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', loadComponent: () => import('./dashboard/dashboard').then(m => m.Dashboard) },
  { path: 'recommendations', loadComponent: () => import('./recommendations/recommendations').then(m => m.Recommendations) },
  { path: 'history', loadComponent: () => import('./history/history').then(m => m.History) },
  { path: 'settings', loadComponent: () => import('./settings/settings').then(m => m.Settings) },
];
