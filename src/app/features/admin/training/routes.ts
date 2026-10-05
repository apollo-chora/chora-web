import { Routes } from '@angular/router';

export const TRAINING_ADMIN_ROUTES: Routes = [
  { path: '', redirectTo: 'compliance', pathMatch: 'full' },
  {
    path: 'create',
    loadComponent: () =>
      import('./components/session-creation/session-creation.component').then(
        (m) => m.SessionCreationComponent,
      ),
    data: { title: 'Create Training Session' },
  },
  {
    path: 'session/:sessionId/live',
    loadComponent: () =>
      import('./components/live-session-dashboard/live-session-dashboard.component').then(
        (m) => m.LiveSessionDashboardComponent,
      ),
    data: { title: 'Live Session' },
  },
  {
    path: 'compliance',
    loadComponent: () =>
      import('./components/compliance-dashboard/compliance-dashboard.component').then(
        (m) => m.ComplianceDashboardComponent,
      ),
    data: { title: 'Training Compliance' },
  },
];
