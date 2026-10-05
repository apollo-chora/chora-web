import { Routes } from '@angular/router';

export const INVESTIGATION_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/investigation-workspace/investigation-workspace.component').then(
        (m) => m.InvestigationWorkspaceComponent,
      ),
    data: { title: 'Investigation Workspace' },
  },
  {
    path: 'incidents',
    loadComponent: () =>
      import('./components/incident-dashboard/incident-dashboard.component').then(
        (m) => m.IncidentDashboardComponent,
      ),
    data: { title: 'Incident Dashboard' },
  },
  {
    path: 'alerts',
    loadComponent: () =>
      import('./components/alert-threshold-editor/alert-threshold-editor.component').then(
        (m) => m.AlertThresholdEditorComponent,
      ),
    data: { title: 'Alert Thresholds' },
  },
  {
    path: 'circuit-breaker',
    loadComponent: () =>
      import('./components/circuit-breaker-controls/circuit-breaker-controls.component').then(
        (m) => m.CircuitBreakerControlsComponent,
      ),
    data: { title: 'Circuit Breaker Controls' },
  },
];
