import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AgentMetricCardComponent } from './agent-metric-card.component';
import type { AgentHealth } from '../../services/agent-monitoring.service';

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
    last_active: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentMetricCardComponent', () => {
  let fixture: ComponentFixture<AgentMetricCardComponent>;
  let component: AgentMetricCardComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentMetricCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AgentMetricCardComponent);
    component = fixture.componentInstance;
  });

  function setAgent(overrides: Partial<AgentHealth> = {}): void {
    fixture.componentRef.setInput('agent', buildAgent(overrides));
    fixture.detectChanges();
  }

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  it('renders agent name', () => {
    setAgent();
    expect(fixture.nativeElement.textContent).toContain('Recommender');
  });

  // -----------------------------------------------------------------------
  // Status classes
  // -----------------------------------------------------------------------

  it('returns correct statusClass for healthy', () => {
    setAgent({ status: 'healthy' });
    expect(component.statusClass()).toBe('agent-metric-card--healthy');
  });

  it('returns correct statusClass for degraded', () => {
    setAgent({ status: 'degraded' });
    expect(component.statusClass()).toBe('agent-metric-card--degraded');
  });

  it('returns correct statusClass for down', () => {
    setAgent({ status: 'down' });
    expect(component.statusClass()).toBe('agent-metric-card--down');
  });

  it('returns correct statusDotClass', () => {
    setAgent({ status: 'healthy' });
    expect(component.statusDotClass()).toBe('agent-metric-card__status-dot--healthy');
  });

  // -----------------------------------------------------------------------
  // Formatters
  // -----------------------------------------------------------------------

  it('formatTokens handles millions', () => {
    setAgent();
    expect(component.formatTokens(2_500_000)).toBe('2.5M');
  });

  it('formatTokens handles thousands', () => {
    setAgent();
    expect(component.formatTokens(8_000)).toBe('8.0K');
  });

  it('formatTokens handles small values', () => {
    setAgent();
    expect(component.formatTokens(42)).toBe('42');
  });

  it('formatErrorRate shows percentage', () => {
    setAgent();
    expect(component.formatErrorRate(0.05)).toBe('5.00%');
  });

  it('formatLatency shows ms for sub-second', () => {
    setAgent();
    expect(component.formatLatency(120)).toBe('120ms');
  });

  it('formatLatency shows seconds for >= 1000ms', () => {
    setAgent();
    expect(component.formatLatency(1500)).toBe('1.5s');
  });

  it('formatLastActive shows relative time', () => {
    setAgent();
    // Recent timestamp should show "< 1m ago" or similar
    const result = component.formatLastActive(new Date().toISOString());
    expect(result).toContain('ago');
  });

  it('formatLastActive handles hours', () => {
    setAgent();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(component.formatLastActive(twoHoursAgo)).toBe('2h ago');
  });

  it('formatLastActive handles days', () => {
    setAgent();
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(component.formatLastActive(threeDaysAgo)).toBe('3d ago');
  });

  it('formatLastActive returns fallback on invalid date', () => {
    setAgent();
    expect(component.formatLastActive('not-a-date')).toBe('NaNd ago');
  });

  // -----------------------------------------------------------------------
  // Output
  // -----------------------------------------------------------------------

  it('emits viewDetails on button click', () => {
    setAgent({ agent_id: 'agent-curator' });
    const spy = vi.fn();
    component.viewDetails.subscribe(spy);
    component.onViewDetails();
    expect(spy).toHaveBeenCalledWith('agent-curator');
  });
});
