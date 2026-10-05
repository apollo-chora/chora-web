/**
 * AgentMonitorDashboardComponent — Main dashboard showing health and metrics
 * for all 24 AI agents.
 *
 * Route: /admin/agents/monitoring
 * Role: super_admin
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { AgentMonitoringService } from '../../services/agent-monitoring.service';
import type { MetricPeriod } from '../../services/agent-monitoring.service';
import { AgentMetricCardComponent } from '../agent-metric-card/agent-metric-card.component';

const METRIC_PERIODS: { value: MetricPeriod; label: string }[] = [
  { value: '24h', label: 'admin.monitoring.period_24h' },
  { value: '7d', label: 'admin.monitoring.period_7d' },
  { value: '30d', label: 'admin.monitoring.period_30d' },
];

@Component({
  selector: 'chora-agent-monitor-dashboard',
  standalone: true,
  imports: [TranslatePipe, AgentMetricCardComponent],
  templateUrl: './agent-monitor-dashboard.component.html',
  styleUrl: './agent-monitor-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentMonitorDashboardComponent implements OnInit, OnDestroy {
  private readonly monitoringService = inject(AgentMonitoringService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly loading = signal(false);
  readonly selectedAgentId = signal<string | null>(null);
  readonly selectedPeriod = signal<MetricPeriod>('24h');

  // --- Delegate to service ---
  readonly agentListState = this.monitoringService.agentListState;
  readonly agents = this.monitoringService.agents;
  readonly healthyCount = this.monitoringService.healthyCount;
  readonly degradedCount = this.monitoringService.degradedCount;
  readonly downCount = this.monitoringService.downCount;
  readonly totalTokens24h = this.monitoringService.totalTokens24h;
  readonly avgErrorRate = this.monitoringService.avgErrorRate;

  // --- Constants ---
  readonly metricPeriods = METRIC_PERIODS;

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadAgents();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data Loading
  // -------------------------------------------------------------------------

  loadAgents(): void {
    this.loading.set(true);
    this.subscriptions.add(
      this.monitoringService.loadAgentHealth().subscribe({
        next: () => this.loading.set(false),
        error: () => {
          this.toast.show('admin.monitoring.load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Interaction
  // -------------------------------------------------------------------------

  onViewAgentDetails(agentId: string): void {
    this.selectedAgentId.set(agentId);
    this.subscriptions.add(
      this.monitoringService.loadAgentMetrics(agentId, this.selectedPeriod()).subscribe({
        error: () => this.toast.show('admin.monitoring.metrics_load_error', 'error'),
      }),
    );
  }

  onPeriodChange(event: Event): void {
    const period = (event.target as HTMLSelectElement).value as MetricPeriod;
    this.selectedPeriod.set(period);
    const agentId = this.selectedAgentId();
    if (agentId) {
      this.subscriptions.add(
        this.monitoringService.loadAgentMetrics(agentId, period).subscribe(),
      );
    }
  }

  closeDetails(): void {
    this.selectedAgentId.set(null);
  }

  refresh(): void {
    this.loadAgents();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  formatTokens(count: number): string {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
  }

  formatErrorRate(rate: number): string {
    return `${(rate * 100).toFixed(2)}%`;
  }
}
