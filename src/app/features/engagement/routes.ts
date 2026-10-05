import { Routes } from '@angular/router';

export const ENGAGEMENT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent,
      ),
    data: { title: 'Dashboard' },
  },
  {
    path: 'study-plan/:examId',
    loadComponent: () =>
      import('./components/study-plan-dashboard/study-plan-dashboard.component').then(
        (m) => m.StudyPlanDashboardComponent,
      ),
    data: { title: 'Study Plan' },
  },
  {
    path: 'drill/:topicId',
    loadComponent: () =>
      import('./components/weakness-drill-launcher/weakness-drill-launcher.component').then(
        (m) => m.WeaknessDrillLauncherComponent,
      ),
    data: { title: 'Weakness Drill' },
  },
];
