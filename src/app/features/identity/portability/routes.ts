import { Routes } from '@angular/router';

export const PORTABILITY_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/merge-wizard/merge-wizard.component').then(
        (m) => m.MergeWizardComponent,
      ),
    data: { title: 'Merge GCIDs' },
  },
  {
    path: 'data',
    loadComponent: () =>
      import('./components/portable-data-dashboard/portable-data-dashboard.component').then(
        (m) => m.PortableDataDashboardComponent,
      ),
    data: { title: 'My Data' },
  },
  {
    path: 'migration',
    loadComponent: () =>
      import('./components/migration-flow/migration-flow.component').then(
        (m) => m.MigrationFlowComponent,
      ),
    data: { title: 'Tenant Migration' },
  },
  {
    path: 'merge-request',
    loadComponent: () =>
      import('../settings/merge-request/merge-request.component').then(
        (m) => m.MergeRequestComponent,
      ),
    data: { title: 'Request Account Merge' },
  },
];
