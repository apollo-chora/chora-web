import { Routes } from '@angular/router';

export const EXPLAINABILITY_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/explainability-viewer/explainability-viewer.component').then(
        (m) => m.ExplainabilityViewerComponent,
      ),
    data: { title: 'Agent Explainability' },
  },
];
