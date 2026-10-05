/**
 * AgentMonitoringService — REST adapter for AI agent health and metrics.
 *
 * Source of truth: chora-contracts/openapi/familiar.yaml
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { HttpParams } from '@angular/common/http';
import { BffClientService } from '../../../../core/services/bff-client.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentStatus = 'healthy' | 'degraded' | 'down';
export type MetricPeriod = '24h' | '7d' | '30d';

export interface AgentHealth {
  agent_id: string;
  agent_name: string;
  status: AgentStatus;
  p99_latency_ms: number;
  token_usage_24h: number;
  error_rate: number;
  fallback_triggers: number;
  last_active: string;
}

export interface AgentMetrics {
  token_usage: { timestamp: string; value: number }[];
  latency_history: { timestamp: string; value: number }[];
  error_history: { timestamp: string; value: number }[];
}

export interface AgentHealthResponse {
  agents: AgentHealth[];
}

export type AgentListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: AgentHealth[] }
  | { status: 'error'; error: { code: string; message: string } };

export type AgentMetricsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: AgentMetrics }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Endpoint Paths
// ---------------------------------------------------------------------------

const AGENT_HEALTH_PATH = '/api/v1/familiar/agents/health';
const AGENT_METRICS_PATH = '/api/v1/familiar/agents/metrics';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class AgentMonitoringService {
  private readonly bff = inject(BffClientService);

  // --- State ---
  private readonly _agentListState = signal<AgentListState>({ status: 'idle' });
  readonly agentListState = this._agentListState.asReadonly();

  private readonly _metricsState = signal<AgentMetricsState>({ status: 'idle' });
  readonly metricsState = this._metricsState.asReadonly();

  // --- Computed ---
  readonly agents = computed(() => {
    const s = this._agentListState();
    return s.status === 'success' ? s.data : [];
  });

  readonly healthyCount = computed(
    () => this.agents().filter((a) => a.status === 'healthy').length,
  );

  readonly degradedCount = computed(
    () => this.agents().filter((a) => a.status === 'degraded').length,
  );

  readonly downCount = computed(
    () => this.agents().filter((a) => a.status === 'down').length,
  );

  readonly totalTokens24h = computed(
    () => this.agents().reduce((sum, a) => sum + a.token_usage_24h, 0),
  );

  readonly avgErrorRate = computed(() => {
    const all = this.agents();
    if (all.length === 0) return 0;
    return all.reduce((sum, a) => sum + a.error_rate, 0) / all.length;
  });

  // ---------------------------------------------------------------------------
  // Agent Health
  // ---------------------------------------------------------------------------

  loadAgentHealth(): Observable<AgentHealthResponse | null> {
    this._agentListState.set({ status: 'loading' });

    return this.bff.get<AgentHealthResponse>(AGENT_HEALTH_PATH).pipe(
      tap((response) => {
        this._agentListState.set({ status: 'success', data: response.agents });
      }),
      catchError((err: Error) => {
        this._agentListState.set({
          status: 'error',
          error: { code: 'AGENT_HEALTH_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Agent Metrics
  // ---------------------------------------------------------------------------

  loadAgentMetrics(agentId: string, period: MetricPeriod): Observable<AgentMetrics | null> {
    this._metricsState.set({ status: 'loading' });

    const params = new HttpParams()
      .set('agent_id', agentId)
      .set('period', period);

    return this.bff.get<AgentMetrics>(AGENT_METRICS_PATH, params).pipe(
      tap((data) => {
        this._metricsState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._metricsState.set({
          status: 'error',
          error: { code: 'AGENT_METRICS_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }
}
