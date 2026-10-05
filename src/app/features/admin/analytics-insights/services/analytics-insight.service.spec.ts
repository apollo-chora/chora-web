import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AnalyticsInsightService } from './analytics-insight.service';
import type { InsightRequest, InsightResponse } from './analytics-insight.service';
import { environment } from '../../../../../environments/environment';

// ---------------------------------------------------------------------------
// Test data builders
// ---------------------------------------------------------------------------

function buildInsightRequest(): InsightRequest {
  return {
    period: '30d',
    focus_area: 'engagement',
  };
}

function buildInsightResponse(): InsightResponse {
  return {
    insights: [
      {
        title: 'Engagement Drop',
        narrative: 'Engagement dropped 15% in the last 30 days, primarily among new learners.',
        metric_references: ['daily_active_users', 'session_duration'],
        trend_direction: 'down',
        confidence: 0.87,
      },
      {
        title: 'Content Completion Up',
        narrative: 'Atom completion rates improved by 8% after path restructuring.',
        metric_references: ['atom_completion_rate'],
        trend_direction: 'up',
        confidence: 0.93,
      },
      {
        title: 'Retention Flat',
        narrative: 'Retention metrics remain stable across all cohorts.',
        metric_references: ['retention_7d', 'retention_30d'],
        trend_direction: 'flat',
        confidence: 0.75,
      },
    ],
    summary: 'Overall engagement is declining but content quality metrics are improving.',
    governance: { model: 'gpt-4o', audit_id: 'audit-insight-001' },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnalyticsInsightService', () => {
  let service: AnalyticsInsightService;
  let httpMock: HttpTestingController;
  const insightUrl = `${environment.bffBaseUrl}/api/v1/analytics/agents/insight`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AnalyticsInsightService,
      ],
    });
    service = TestBed.inject(AnalyticsInsightService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it('starts with idle state', () => {
    expect(service.insightState().status).toBe('idle');
    expect(service.insights()).toEqual([]);
    expect(service.summary()).toBe('');
  });

  // -----------------------------------------------------------------------
  // generateInsights
  // -----------------------------------------------------------------------

  it('sets loading state when generateInsights is called', () => {
    service.generateInsights(buildInsightRequest()).subscribe();
    expect(service.insightState().status).toBe('loading');
    httpMock.expectOne(insightUrl).flush(buildInsightResponse());
  });

  it('sends POST with correct body', () => {
    const request = buildInsightRequest();
    service.generateInsights(request).subscribe();

    const req = httpMock.expectOne(insightUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(buildInsightResponse());
  });

  it('maps insights on success', () => {
    service.generateInsights(buildInsightRequest()).subscribe();
    httpMock.expectOne(insightUrl).flush(buildInsightResponse());

    expect(service.insightState().status).toBe('success');
    expect(service.insights().length).toBe(3);
  });

  it('maps first insight correctly', () => {
    service.generateInsights(buildInsightRequest()).subscribe();
    httpMock.expectOne(insightUrl).flush(buildInsightResponse());

    const first = service.insights()[0];
    expect(first.title).toBe('Engagement Drop');
    expect(first.trend_direction).toBe('down');
    expect(first.confidence).toBe(0.87);
    expect(first.metric_references).toContain('daily_active_users');
  });

  it('maps summary correctly', () => {
    service.generateInsights(buildInsightRequest()).subscribe();
    httpMock.expectOne(insightUrl).flush(buildInsightResponse());

    expect(service.summary()).toBe('Overall engagement is declining but content quality metrics are improving.');
  });

  it('sets error state on failure', () => {
    service.generateInsights(buildInsightRequest()).subscribe();
    httpMock.expectOne(insightUrl).error(new ProgressEvent('error'));

    expect(service.insightState().status).toBe('error');
    const state = service.insightState();
    if (state.status === 'error') {
      expect(state.error.code).toBe('INSIGHT_GENERATION_FAILED');
    }
  });

  it('returns null on error', () => {
    let result: InsightResponse | null | undefined;
    service.generateInsights(buildInsightRequest()).subscribe((r) => {
      result = r;
    });
    httpMock.expectOne(insightUrl).error(new ProgressEvent('error'));

    expect(result).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------

  it('reset returns to idle', () => {
    service.generateInsights(buildInsightRequest()).subscribe();
    httpMock.expectOne(insightUrl).flush(buildInsightResponse());
    expect(service.insightState().status).toBe('success');

    service.reset();
    expect(service.insightState().status).toBe('idle');
    expect(service.insights()).toEqual([]);
    expect(service.summary()).toBe('');
  });
});
