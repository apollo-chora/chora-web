import { Routes } from '@angular/router';

export const PARENT_ROUTES: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./components/guardian-dashboard/guardian-dashboard.component').then(
        (m) => m.GuardianDashboardComponent,
      ),
    data: { title: 'Guardian Dashboard' },
  },
  {
    path: 'activity/:learnerId',
    loadComponent: () =>
      import('./components/activity-digest/activity-digest.component').then(
        (m) => m.ActivityDigestComponent,
      ),
    data: { title: 'Activity Digest' },
  },
  {
    path: 'progress/:learnerId',
    loadComponent: () =>
      import('./components/progress-report/progress-report.component').then(
        (m) => m.ProgressReportComponent,
      ),
    data: { title: 'Progress Report' },
  },
  {
    path: 'consent',
    loadComponent: () =>
      import('./components/consent-manager/consent-manager.component').then(
        (m) => m.ConsentManagerComponent,
      ),
    data: { title: 'Consent Management' },
  },
];
