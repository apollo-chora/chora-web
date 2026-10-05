import { Routes } from '@angular/router';

export const ADMISSIONS_ROUTES: Routes = [
  { path: '', redirectTo: 'apply', pathMatch: 'full' },
  {
    path: 'apply/:pipelineId',
    loadComponent: () =>
      import('./components/application-start/application-start.component').then(
        (m) => m.ApplicationStartComponent,
      ),
    data: { title: 'Apply' },
  },
  {
    path: 'apply/:pipelineId/stage/:stageId',
    loadComponent: () =>
      import('./components/stage-completion/stage-completion.component').then(
        (m) => m.StageCompletionComponent,
      ),
    data: { title: 'Stage Completion' },
  },
  {
    path: 'applications/:applicationId',
    loadComponent: () =>
      import('./components/decision-notification/decision-notification.component').then(
        (m) => m.DecisionNotificationComponent,
      ),
    data: { title: 'Application Status' },
  },
];
