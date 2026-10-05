import { Routes } from '@angular/router';

export const RBAC_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/user-access-matrix/user-access-matrix.component').then(
        (m) => m.UserAccessMatrixComponent,
      ),
    data: { title: 'User Access Matrix' },
  },
];
