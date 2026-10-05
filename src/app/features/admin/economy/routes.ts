import { Routes } from '@angular/router';

export const ECONOMY_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/economy-dashboard/economy-dashboard.component').then(
        (m) => m.EconomyDashboardComponent,
      ),
    data: { title: 'Economy Configuration' },
  },
];
