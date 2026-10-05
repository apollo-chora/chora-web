import { Routes } from '@angular/router';

export const ANALYTICS_INSIGHTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/insight-narrative/insight-narrative.component').then(
        (m) => m.InsightNarrativeComponent,
      ),
    data: { title: 'Analytics Insights' },
  },
];
