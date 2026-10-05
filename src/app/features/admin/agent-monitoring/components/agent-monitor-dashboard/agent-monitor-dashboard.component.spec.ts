import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { AgentMonitorDashboardComponent } from './agent-monitor-dashboard.component';
import { AgentMonitoringService } from '../../services/agent-monitoring.service';
import type {
  AgentHealth,
  AgentListState,
  AgentMetricsState,
  AgentHealthResponse,
  AgentMetrics,
} from '../../services/agent-monitoring.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function buildAgent(overrides: Partial<AgentHealth> = {}): AgentHealth {
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

const mockAgents: AgentHealth[] = [
  buildAgent(),
  buildAgent({ agent_id: 'agent-nudger', agent_name: 'Nudger', status: 'degraded', error_rate: 0.05 }),
  buildAgent({ agent_id: 'agent-gatekeeper', agent_name: 'Gatekeeper', status: 'down', error_rate: 1.0 }),
];

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

const agentListState = signal<AgentListState>({ status: 'idle' });
const metricsState = signal<AgentMetricsState>({ status: 'idle' });
const agentsSignal = signal<AgentHealth[]>([]);
const healthyCountSignal = signal(0);
const degradedCountSignal = signal(0);
const downCountSignal = signal(0);
const totalTokensSignal = signal(0);
const avgErrorRateSignal = signal(0);

const mockMonitoringService = {
  agentListState: agentListState.asReadonly(),
  metricsState: metricsState.asReadonly(),
  agents: agentsSignal.asReadonly(),
  healthyCount: healthyCountSignal.asReadonly(),
  degradedCount: degradedCountSignal.asReadonly(),
  downCount: downCountSignal.asReadonly(),
  totalTokens24h: totalTokensSignal.asReadonly(),
  avgErrorRate: avgErrorRateSignal.asReadonly(),
  loadAgentHealth: vi.fn().mockReturnValue(of({ agents: mockAgents } as AgentHealthResponse)),
  loadAgentMetrics: vi.fn().mockReturnValue(of({
    token_usage: [],
    latency_history: [],
    error_history: [],
  } as AgentMetrics)),
};

const mockToast = { show: vi.fn() };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentMonitorDashboardComponent', () => {
  let fixture: ComponentFixture<AgentMonitorDashboardComponent>;
  let component: AgentMonitorDashboardComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    vi.clearAllMocks();
    agentListState.set({ status: 'success', data: mockAgents });
    agentsSignal.set(mockAgents);
    healthyCountSignal.set(1);
    degradedCountSignal.set(1);
    downCountSignal.set(1);
    totalTokensSignal.set(30000);
    avgErrorRateSignal.set(0.35);

    await TestBed.configureTestingModule({
      imports: [AgentMonitorDashboardComponent],
      providers: [
        { provide: AgentMonitoringService, useValue: mockMonitoringService },
        { provide: ToastService, useValue: mockToast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AgentMonitorDashboardComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  it('loads agent health on init', () => {
    expect(mockMonitoringService.loadAgentHealth).toHaveBeenCalled();
  });

  it('renders dashboard container', () => {
    expect(element.querySelector('[data-testid="agent-monitor-dashboard"]')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Agent details
  // -----------------------------------------------------------------------

  it('sets selectedAgentId on viewDetails', () => {
    component.onViewAgentDetails('agent-recommender');
    expect(component.selectedAgentId()).toBe('agent-recommender');
    expect(mockMonitoringService.loadAgentMetrics).toHaveBeenCalledWith('agent-recommender', '24h');
  });

  it('clears selectedAgentId on closeDetails', () => {
    component.onViewAgentDetails('agent-recommender');
    component.closeDetails();
    expect(component.selectedAgentId()).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Period change
  // -----------------------------------------------------------------------

  it('updates period on onPeriodChange', () => {
    component.onViewAgentDetails('agent-recommender');
    vi.clearAllMocks();

    const event = { target: { value: '7d' } } as unknown as Event;
    component.onPeriodChange(event);
    expect(component.selectedPeriod()).toBe('7d');
    expect(mockMonitoringService.loadAgentMetrics).toHaveBeenCalledWith('agent-recommender', '7d');
  });

  it('does not load metrics if no agent selected on period change', () => {
    vi.clearAllMocks();
    const event = { target: { value: '30d' } } as unknown as Event;
    component.onPeriodChange(event);
    expect(component.selectedPeriod()).toBe('30d');
    expect(mockMonitoringService.loadAgentMetrics).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Refresh
  // -----------------------------------------------------------------------

  it('calls loadAgentHealth on refresh', () => {
    vi.clearAllMocks();
    component.refresh();
    expect(mockMonitoringService.loadAgentHealth).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  it('formatTokens handles millions', () => {
    expect(component.formatTokens(1_500_000)).toBe('1.5M');
  });

  it('formatTokens handles thousands', () => {
    expect(component.formatTokens(15_000)).toBe('15.0K');
  });

  it('formatTokens handles small numbers', () => {
    expect(component.formatTokens(500)).toBe('500');
  });

  it('formatErrorRate converts to percentage', () => {
    expect(component.formatErrorRate(0.0523)).toBe('5.23%');
  });

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  it('unsubscribes on destroy', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});
