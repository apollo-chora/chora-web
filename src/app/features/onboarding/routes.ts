import { Routes } from '@angular/router';

export const ENROLLMENT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./cross-tenant-enrollment/cross-tenant-enrollment.component').then(
        (m) => m.CrossTenantEnrollmentComponent,
      ),
    data: { title: 'Join Tenant' },
  },
];
