import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { InsightNarrativeComponent } from './insight-narrative.component';
import { AnalyticsInsightService } from '../../services/analytics-insight.service';
import type {
  InsightState,
  Insight,
  InsightResponse,
} from '../../services/analytics-insight.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function buildInsights(): Insight[] {
  return [
    {
      title: 'Engagement Drop',
      narrative: 'Daily active users dropped 15% this month.',
      metric_references: ['dau', 'session_duration'],
      trend_direction: 'down',
      confidence: 0.87,
    },
    {
      title: 'Content Quality Up',
      narrative: 'Atom completion rates improved by 8%.',
      metric_references: ['completion_rate'],
      trend_direction: 'up',
      confidence: 0.93,
    },
  ];
}

function buildInsightResponse(): InsightResponse {
  return {
    insights: buildInsights(),
    summary: 'Mixed signals across engagement and content metrics.',
    governance: {},
  };
}

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

const insightState = signal<InsightState>({ status: 'idle' });
const insightsSignal = signal<Insight[]>([]);
const summarySignal = signal('');

const mockInsightService = {
  insightState: insightState.asReadonly(),
  insights: insightsSignal.asReadonly(),
  summary: summarySignal.asReadonly(),
  generateInsights: vi.fn().mockReturnValue(of(buildInsightResponse())),
  reset: vi.fn(),
};

const mockToast = { show: vi.fn() };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InsightNarrativeComponent', () => {
  let fixture: ComponentFixture<InsightNarrativeComponent>;
  let component: InsightNarrativeComponent;


  beforeEach(async () => {
    vi.clearAllMocks();
    insightState.set({ status: 'success', data: buildInsightResponse() });
    insightsSignal.set(buildInsights());
    summarySignal.set('Mixed signals across engagement and content metrics.');

    await TestBed.configureTestingModule({
      imports: [InsightNarrativeComponent],
      providers: [
        { provide: AnalyticsInsightService, useValue: mockInsightService },
        { provide: ToastService, useValue: mockToast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InsightNarrativeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it('defaults period to 30d', () => {
    expect(component.selectedPeriod()).toBe('30d');
  });

  it('defaults focus area to engagement', () => {
    expect(component.selectedFocusArea()).toBe('engagement');
  });

  it('starts with no selected insight', () => {
    expect(component.selectedInsight()).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Filter interaction
  // -----------------------------------------------------------------------

  it('updates period on change', () => {
    const event = { target: { value: '7d' } } as unknown as Event;
    component.onPeriodChange(event);
    expect(component.selectedPeriod()).toBe('7d');
  });

  it('updates focus area on change', () => {
    const event = { target: { value: 'retention' } } as unknown as Event;
    component.onFocusAreaChange(event);
    expect(component.selectedFocusArea()).toBe('retention');
  });

  // -----------------------------------------------------------------------
  // Generate insights
  // -----------------------------------------------------------------------

  it('calls generateInsights with selected period and focus', () => {
    component.selectedPeriod.set('90d');
    component.selectedFocusArea.set('content');
    component.generateInsights();
    expect(mockInsightService.generateInsights).toHaveBeenCalledWith({
      period: '90d',
      focus_area: 'content',
    });
  });

  it('clears selected insight on generate', () => {
    component.selectedInsight.set(buildInsights()[0]);
    component.generateInsights();
    expect(component.selectedInsight()).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Select / Close insight
  // -----------------------------------------------------------------------

  it('selects an insight', () => {
    const insight = buildInsights()[0];
    component.selectInsight(insight);
    expect(component.selectedInsight()).toBe(insight);
  });

  it('clears selected insight on closeDetail', () => {
    component.selectInsight(buildInsights()[0]);
    component.closeDetail();
    expect(component.selectedInsight()).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  it('trendIcon returns up arrow for up', () => {
    expect(component.trendIcon('up')).toBe('\u2191');
  });

  it('trendIcon returns down arrow for down', () => {
    expect(component.trendIcon('down')).toBe('\u2193');
  });

  it('trendIcon returns right arrow for flat', () => {
    expect(component.trendIcon('flat')).toBe('\u2192');
  });

  it('trendClass returns correct class', () => {
    expect(component.trendClass('up')).toBe('insight-narrative__trend-icon--up');
    expect(component.trendClass('down')).toBe('insight-narrative__trend-icon--down');
  });

  it('confidenceBadgeClass returns high for >= 0.8', () => {
    expect(component.confidenceBadgeClass(0.87)).toBe('insight-narrative__confidence--high');
  });

  it('confidenceBadgeClass returns medium for >= 0.5', () => {
    expect(component.confidenceBadgeClass(0.65)).toBe('insight-narrative__confidence--medium');
  });

  it('confidenceBadgeClass returns low for < 0.5', () => {
    expect(component.confidenceBadgeClass(0.3)).toBe('insight-narrative__confidence--low');
  });

  it('formatConfidence converts to percentage', () => {
    expect(component.formatConfidence(0.87)).toBe('87%');
    expect(component.formatConfidence(0.5)).toBe('50%');
  });

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  it('unsubscribes on destroy', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});
