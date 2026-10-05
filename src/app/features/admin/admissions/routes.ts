import { Routes } from '@angular/router';

export const ADMISSIONS_ADMIN_ROUTES: Routes = [
  { path: '', redirectTo: 'review', pathMatch: 'full' },
  {
    path: 'templates/new',
    loadComponent: () =>
      import('./components/pipeline-builder/pipeline-builder.component').then(
        (m) => m.PipelineBuilderComponent,
      ),
    data: { title: 'New Pipeline Template' },
  },
  {
    path: 'templates/:id/edit',
    loadComponent: () =>
      import('./components/pipeline-builder/pipeline-builder.component').then(
        (m) => m.PipelineBuilderComponent,
      ),
    data: { title: 'Edit Pipeline Template' },
  },
  {
    path: 'templates/:id/publish',
    loadComponent: () =>
      import('./components/pipeline-publication/pipeline-publication.component').then(
        (m) => m.PipelinePublicationComponent,
      ),
    data: { title: 'Publish Pipeline' },
  },
  {
    path: 'review',
    loadComponent: () =>
      import('./components/decision-panel/decision-panel.component').then(
        (m) => m.DecisionPanelComponent,
      ),
    data: { title: 'Review Applications' },
  },
];
