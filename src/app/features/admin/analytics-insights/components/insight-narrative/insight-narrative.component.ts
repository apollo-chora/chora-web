/**
 * InsightNarrativeComponent — Main panel for AI-generated analytics insights.
 * Time range picker, focus area filter, insight cards with trend and confidence.
 *
 * Route: /admin/analytics/insights
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import {
  AnalyticsInsightService,
  INSIGHT_PERIODS,
  FOCUS_AREAS,
} from '../../services/analytics-insight.service';
import type {
  InsightPeriod,
  FocusArea,
  Insight,
} from '../../services/analytics-insight.service';
import { TrendExplanationComponent } from '../trend-explanation/trend-explanation.component';

@Component({
  selector: 'chora-insight-narrative',
  standalone: true,
  imports: [TranslatePipe, TrendExplanationComponent],
  templateUrl: './insight-narrative.component.html',
  styleUrl: './insight-narrative.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InsightNarrativeComponent implements OnDestroy {
  private readonly insightService = inject(AnalyticsInsightService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly selectedPeriod = signal<InsightPeriod>('30d');
  readonly selectedFocusArea = signal<FocusArea>('engagement');
  readonly selectedInsight = signal<Insight | null>(null);

  // --- Delegate to service ---
  readonly insightState = this.insightService.insightState;
  readonly insights = this.insightService.insights;
  readonly summary = this.insightService.summary;

  // --- Constants ---
  readonly periods = INSIGHT_PERIODS;
  readonly focusAreas = FOCUS_AREAS;

  private subscriptions = new Subscription();

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Interaction
  // -------------------------------------------------------------------------

  onPeriodChange(event: Event): void {
    this.selectedPeriod.set((event.target as HTMLSelectElement).value as InsightPeriod);
  }

  onFocusAreaChange(event: Event): void {
    this.selectedFocusArea.set((event.target as HTMLSelectElement).value as FocusArea);
  }

  generateInsights(): void {
    this.selectedInsight.set(null);
    this.subscriptions.add(
      this.insightService
        .generateInsights({
          period: this.selectedPeriod(),
          focus_area: this.selectedFocusArea(),
        })
        .subscribe({
          error: () => this.toast.show('admin.insights.generate_error', 'error'),
        }),
    );
  }

  selectInsight(insight: Insight): void {
    this.selectedInsight.set(insight);
  }

  closeDetail(): void {
    this.selectedInsight.set(null);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  trendIcon(direction: string): string {
    switch (direction) {
      case 'up':
        return '\u2191';
      case 'down':
        return '\u2193';
      default:
        return '\u2192';
    }
  }

  trendClass(direction: string): string {
    return `insight-narrative__trend-icon--${direction}`;
  }

  confidenceBadgeClass(confidence: number): string {
    if (confidence >= 0.8) return 'insight-narrative__confidence--high';
    if (confidence >= 0.5) return 'insight-narrative__confidence--medium';
    return 'insight-narrative__confidence--low';
  }

  formatConfidence(confidence: number): string {
    return `${(confidence * 100).toFixed(0)}%`;
  }
}
