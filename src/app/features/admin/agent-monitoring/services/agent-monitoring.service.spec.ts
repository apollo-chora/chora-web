import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AgentMonitoringService } from './agent-monitoring.service';
import type { AgentHealth, AgentHealthResponse, AgentMetrics } from './agent-monitoring.service';
import { environment } from '../../../../../environments/environment';

// ---------------------------------------------------------------------------
// Test data builders
// ---------------------------------------------------------------------------

function buildAgentHealth(overrides: Partial<AgentHealth> = {}): AgentHealth {
  return {
    agent_id: 'agent-recommender',
    agent_name: 'Recommender',
    status: 'healthy',
    p99_latency_ms: 120,
    token_usage_24h: 15000,
    error_rate: 0.002,
    fallback_triggers: 0,
    last_active: '2026-03-15T10:00:00Z',
    ...overrides,
  };
}

function buildAgentHealthResponse(): AgentHealthResponse {
  return {
    agents: [
      buildAgentHealth(),
      buildAgentHealth({
        agent_id: 'agent-nudger',
        agent_name: 'Nudger',
        status: 'degraded',
        p99_latency_ms: 850,
        token_usage_24h: 8000,
        error_rate: 0.05,
        fallback_triggers: 3,
      }),
      buildAgentHealth({
        agent_id: 'agent-gatekeeper',
        agent_name: 'Gatekeeper',
        status: 'down',
        p99_latency_ms: 0,
        token_usage_24h: 0,
        error_rate: 1.0,
        fallback_triggers: 100,
      }),
    ],
  };
}

function buildAgentMetrics(): AgentMetrics {
  return {
    token_usage: [
      { timestamp: '2026-03-15T00:00:00Z', value: 5000 },
      { timestamp: '2026-03-15T06:00:00Z', value: 8000 },
    ],
    latency_history: [
      { timestamp: '2026-03-15T00:00:00Z', value: 90 },
      { timestamp: '2026-03-15T06:00:00Z', value: 120 },
    ],
    error_history: [
      { timestamp: '2026-03-15T00:00:00Z', value: 0 },
      { timestamp: '2026-03-15T06:00:00Z', value: 2 },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentMonitoringService', () => {
  let service: AgentMonitoringService;
  let httpMock: HttpTestingController;
  const healthUrl = `${environment.bffBaseUrl}/api/v1/familiar/agents/health`;
  const metricsUrl = `${environment.bffBaseUrl}/api/v1/familiar/agents/metrics`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AgentMonitoringService,
      ],
    });
    service = TestBed.inject(AgentMonitoringService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it('starts with idle state', () => {
    expect(service.agentListState().status).toBe('idle');
    expect(service.metricsState().status).toBe('idle');
    expect(service.agents()).toEqual([]);
    expect(service.healthyCount()).toBe(0);
    expect(service.degradedCount()).toBe(0);
    expect(service.downCount()).toBe(0);
    expect(service.totalTokens24h()).toBe(0);
    expect(service.avgErrorRate()).toBe(0);
  });

  // -----------------------------------------------------------------------
  // loadAgentHealth
  // -----------------------------------------------------------------------

  it('sets loading state when loadAgentHealth is called', () => {
    service.loadAgentHealth().subscribe();
    expect(service.agentListState().status).toBe('loading');
    httpMock.expectOne(healthUrl).flush(buildAgentHealthResponse());
  });

  it('maps agent health data on success', () => {
    service.loadAgentHealth().subscribe();
    httpMock.expectOne(healthUrl).flush(buildAgentHealthResponse());

    expect(service.agentListState().status).toBe('success');
    expect(service.agents().length).toBe(3);
  });

  it('computes healthyCount correctly', () => {
    service.loadAgentHealth().subscribe();
    httpMock.expectOne(healthUrl).flush(buildAgentHealthResponse());

    expect(service.healthyCount()).toBe(1);
  });

  it('computes degradedCount correctly', () => {
    service.loadAgentHealth().subscribe();
    httpMock.expectOne(healthUrl).flush(buildAgentHealthResponse());

    expect(service.degradedCount()).toBe(1);
  });

  it('computes downCount correctly', () => {
    service.loadAgentHealth().subscribe();
    httpMock.expectOne(healthUrl).flush(buildAgentHealthResponse());

    expect(service.downCount()).toBe(1);
  });

  it('computes totalTokens24h correctly', () => {
    service.loadAgentHealth().subscribe();
    httpMock.expectOne(healthUrl).flush(buildAgentHealthResponse());

    expect(service.totalTokens24h()).toBe(23000); // 15000 + 8000 + 0
  });

  it('computes avgErrorRate correctly', () => {
    service.loadAgentHealth().subscribe();
    httpMock.expectOne(healthUrl).flush(buildAgentHealthResponse());

    const expected = (0.002 + 0.05 + 1.0) / 3;
    expect(service.avgErrorRate()).toBeCloseTo(expected, 5);
  });

  it('sets error state on health load failure', () => {
    service.loadAgentHealth().subscribe();
    httpMock.expectOne(healthUrl).error(new ProgressEvent('error'));

    expect(service.agentListState().status).toBe('error');
    const state = service.agentListState();
    if (state.status === 'error') {
      expect(state.error.code).toBe('AGENT_HEALTH_LOAD_FAILED');
    }
  });

  // -----------------------------------------------------------------------
  // loadAgentMetrics
  // -----------------------------------------------------------------------

  it('sets loading state when loadAgentMetrics is called', () => {
    service.loadAgentMetrics('agent-recommender', '24h').subscribe();
    expect(service.metricsState().status).toBe('loading');
    httpMock.expectOne((req) => req.url === metricsUrl).flush(buildAgentMetrics());
  });

  it('passes agent_id and period params', () => {
    service.loadAgentMetrics('agent-recommender', '7d').subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === metricsUrl && r.params.get('agent_id') === 'agent-recommender' && r.params.get('period') === '7d',
    );
    req.flush(buildAgentMetrics());
  });

  it('maps metrics data on success', () => {
    service.loadAgentMetrics('agent-recommender', '24h').subscribe();
    httpMock.expectOne((req) => req.url === metricsUrl).flush(buildAgentMetrics());

    expect(service.metricsState().status).toBe('success');
    const state = service.metricsState();
    if (state.status === 'success') {
      expect(state.data.token_usage.length).toBe(2);
      expect(state.data.latency_history.length).toBe(2);
      expect(state.data.error_history.length).toBe(2);
    }
  });

  it('sets error state on metrics load failure', () => {
    service.loadAgentMetrics('agent-recommender', '24h').subscribe();
    httpMock.expectOne((req) => req.url === metricsUrl).error(new ProgressEvent('error'));

    expect(service.metricsState().status).toBe('error');
    const state = service.metricsState();
    if (state.status === 'error') {
      expect(state.error.code).toBe('AGENT_METRICS_LOAD_FAILED');
    }
  });
});
