import { Routes } from '@angular/router';

export const MODERATION_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/moderation-queue/moderation-queue.component').then(
        (m) => m.ModerationQueueComponent,
      ),
    data: { title: 'Content Moderation' },
  },
];
