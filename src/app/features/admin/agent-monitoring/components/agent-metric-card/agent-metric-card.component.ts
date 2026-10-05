/**
 * AgentMetricCardComponent — Reusable card displaying health and metrics
 * for a single AI agent.
 *
 * Route: /admin/agents/monitoring (child of AgentMonitorDashboardComponent)
 */
import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
} from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import type { AgentHealth } from '../../services/agent-monitoring.service';

@Component({
  selector: 'chora-agent-metric-card',
  standalone: true,
  imports: [UpperCasePipe, TranslatePipe],
  templateUrl: './agent-metric-card.component.html',
  styleUrl: './agent-metric-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentMetricCardComponent {
  readonly agent = input.required<AgentHealth>();
  readonly viewDetails = output<string>();

  onViewDetails(): void {
    this.viewDetails.emit(this.agent().agent_id);
  }

  statusClass(): string {
    return `agent-metric-card--${this.agent().status}`;
  }

  statusDotClass(): string {
    return `agent-metric-card__status-dot--${this.agent().status}`;
  }

  formatTokens(count: number): string {
    if (count >= 1_000_000) {
      return `${(count / 1_000_000).toFixed(1)}M`;
    }
    if (count >= 1_000) {
      return `${(count / 1_000).toFixed(1)}K`;
    }
    return count.toString();
  }

  formatErrorRate(rate: number): string {
    return `${(rate * 100).toFixed(2)}%`;
  }

  formatLatency(ms: number): string {
    if (ms >= 1000) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    return `${ms}ms`;
  }

  formatLastActive(isoString: string): string {
    try {
      const date = new Date(isoString);
      const now = Date.now();
      const diffMs = now - date.getTime();
      const diffMin = Math.floor(diffMs / 60_000);
      if (diffMin < 1) return '< 1m ago';
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      return `${Math.floor(diffHr / 24)}d ago`;
    } catch {
      return isoString;
    }
  }
}
