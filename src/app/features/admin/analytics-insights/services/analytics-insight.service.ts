/**
 * AnalyticsInsightService — REST adapter for the analytics insight agent.
 *
 * Source of truth: chora-contracts/openapi/analytics.yaml
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InsightPeriod = '7d' | '30d' | '90d';
export type FocusArea = 'engagement' | 'content' | 'retention';
export type TrendDirection = 'up' | 'down' | 'flat';

export interface InsightRequest {
  period: InsightPeriod;
  focus_area: FocusArea;
}

export interface Insight {
  title: string;
  narrative: string;
  metric_references: string[];
  trend_direction: TrendDirection;
  confidence: number;
}

export interface InsightResponse {
  insights: Insight[];
  summary: string;
  governance: Record<string, unknown>;
}

export type InsightState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: InsightResponse }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const INSIGHT_PERIODS: { value: InsightPeriod; label: string }[] = [
  { value: '7d', label: 'admin.insights.period_7d' },
  { value: '30d', label: 'admin.insights.period_30d' },
  { value: '90d', label: 'admin.insights.period_90d' },
];

export const FOCUS_AREAS: { value: FocusArea; label: string }[] = [
  { value: 'engagement', label: 'admin.insights.focus_engagement' },
  { value: 'content', label: 'admin.insights.focus_content' },
  { value: 'retention', label: 'admin.insights.focus_retention' },
];

// ---------------------------------------------------------------------------
// Endpoint Path
// ---------------------------------------------------------------------------

const INSIGHT_PATH = '/api/v1/analytics/agents/insight';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class AnalyticsInsightService {
  private readonly bff = inject(BffClientService);

  // --- State ---
  private readonly _insightState = signal<InsightState>({ status: 'idle' });
  readonly insightState = this._insightState.asReadonly();

  // --- Computed ---
  readonly insights = computed(() => {
    const s = this._insightState();
    return s.status === 'success' ? s.data.insights : [];
  });

  readonly summary = computed(() => {
    const s = this._insightState();
    return s.status === 'success' ? s.data.summary : '';
  });

  // ---------------------------------------------------------------------------
  // Generate Insights
  // ---------------------------------------------------------------------------

  generateInsights(request: InsightRequest): Observable<InsightResponse | null> {
    this._insightState.set({ status: 'loading' });

    return this.bff.post<InsightResponse>(INSIGHT_PATH, request).pipe(
      tap((data) => {
        this._insightState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._insightState.set({
          status: 'error',
          error: { code: 'INSIGHT_GENERATION_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  reset(): void {
    this._insightState.set({ status: 'idle' });
  }
}
