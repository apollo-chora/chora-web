import { Routes } from '@angular/router';

export const DEVELOPER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/developer-console/developer-console.component').then(
        (m) => m.DeveloperConsoleComponent,
      ),
    data: { title: 'Developer Console' },
  },
  {
    path: 'api-inspector',
    loadComponent: () =>
      import('./components/api-inspector/api-inspector.component').then(
        (m) => m.APIInspectorComponent,
      ),
    data: { title: 'API Inspector' },
  },
  {
    path: 'feature-flags',
    loadComponent: () =>
      import('./components/feature-flag-override/feature-flag-override.component').then(
        (m) => m.FeatureFlagOverrideComponent,
      ),
    data: { title: 'Feature Flag Overrides' },
  },
  {
    path: 'event-bus',
    loadComponent: () =>
      import('./components/event-bus-monitor/event-bus-monitor.component').then(
        (m) => m.EventBusMonitorComponent,
      ),
    data: { title: 'Event Bus Monitor' },
  },
  {
    path: 'rls-context',
    loadComponent: () =>
      import('./components/rls-context-viewer/rls-context-viewer.component').then(
        (m) => m.RlsContextViewerComponent,
      ),
    data: { title: 'RLS Context Viewer' },
  },
];
