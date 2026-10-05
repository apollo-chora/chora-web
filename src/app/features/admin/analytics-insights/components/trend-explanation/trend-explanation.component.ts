/**
 * TrendExplanationComponent — Detail view with metric bar chart (CSS)
 * and AI explanation text for a single insight.
 *
 * Route: /admin/analytics/insights (child of InsightNarrativeComponent)
 */
import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
} from '@angular/core';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import type { Insight } from '../../services/analytics-insight.service';

@Component({
  selector: 'chora-trend-explanation',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './trend-explanation.component.html',
  styleUrl: './trend-explanation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrendExplanationComponent {
  readonly insight = input.required<Insight>();
  readonly closed = output<void>();

  onClose(): void {
    this.closed.emit();
  }

  trendIcon(): string {
    switch (this.insight().trend_direction) {
      case 'up':
        return '\u2191';
      case 'down':
        return '\u2193';
      default:
        return '\u2192';
    }
  }

  trendClass(): string {
    return `trend-explanation__trend-icon--${this.insight().trend_direction}`;
  }

  confidenceClass(): string {
    const c = this.insight().confidence;
    if (c >= 0.8) return 'trend-explanation__confidence-bar--high';
    if (c >= 0.5) return 'trend-explanation__confidence-bar--medium';
    return 'trend-explanation__confidence-bar--low';
  }

  confidencePercent(): number {
    return Math.round(this.insight().confidence * 100);
  }
}
