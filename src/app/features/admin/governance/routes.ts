import { Routes } from '@angular/router';

export const GOVERNANCE_ROUTES: Routes = [
  { path: '', redirectTo: 'restrictions', pathMatch: 'full' },
  {
    path: 'restrictions',
    loadComponent: () =>
      import('./components/restriction-dashboard/restriction-dashboard.component').then(
        (m) => m.RestrictionDashboardComponent,
      ),
    data: { title: 'Restrictions' },
  },
  {
    path: 'appeals',
    loadComponent: () =>
      import('./components/appeal-queue/appeal-queue.component').then(
        (m) => m.AppealQueueComponent,
      ),
    data: { title: 'Appeals' },
  },
  {
    path: 'kyc',
    loadComponent: () =>
      import('./components/kyc-review/kyc-review.component').then(
        (m) => m.KycReviewComponent,
      ),
    data: { title: 'KYC Review' },
  },
  {
    path: 'moderation',
    loadComponent: () =>
      import('./components/moderation-log/moderation-log.component').then(
        (m) => m.ModerationLogComponent,
      ),
    data: { title: 'Moderation Log' },
  },
  {
    path: 'moderation/queue',
    loadComponent: () =>
      import('./components/moderation-queue/moderation-queue.component').then(
        (m) => m.ModerationQueueComponent,
      ),
    data: { title: 'Moderation Queue' },
  },
  {
    path: 'escalation',
    loadComponent: () =>
      import('./components/escalation-tracker/escalation-tracker.component').then(
        (m) => m.EscalationTrackerComponent,
      ),
    data: { title: 'Escalation Tracker' },
  },
];
