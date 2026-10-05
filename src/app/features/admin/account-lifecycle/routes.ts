import { Routes } from '@angular/router';

export const ACCOUNT_LIFECYCLE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/account-dashboard/account-dashboard.component').then(
        (m) => m.AccountDashboardComponent,
      ),
    data: { title: 'Account Management' },
  },
  {
    path: ':gcid/events',
    loadComponent: () =>
      import('./components/lifecycle-event-log/lifecycle-event-log.component').then(
        (m) => m.LifecycleEventLogComponent,
      ),
    data: { title: 'Lifecycle Events' },
  },
];
