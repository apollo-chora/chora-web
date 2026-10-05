import { Routes } from '@angular/router';

export const AGENT_MONITORING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/agent-monitor-dashboard/agent-monitor-dashboard.component').then(
        (m) => m.AgentMonitorDashboardComponent,
      ),
    data: { title: 'Agent Monitoring' },
  },
];
