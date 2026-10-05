import {
  Component, ChangeDetectionStrategy, input, computed,
} from '@angular/core';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import type { ExamReadiness } from '../../models/engagement.models';

@Component({
  selector: 'chora-exam-summary-widget',
  imports: [TranslatePipe],
  templateUrl: './exam-summary-widget.component.html',
  styleUrl: './exam-summary-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamSummaryWidgetComponent {
  readonly readiness = input.required<ExamReadiness>();

  readonly readinessLevel = computed<'high' | 'medium' | 'low'>(() => {
    const r = this.readiness().overall_readiness;
    if (r >= 75) return 'high';
    if (r >= 50) return 'medium';
    return 'low';
  });

  readonly formattedDate = computed(() => {
    return new Date(this.readiness().exam_date).toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  });

  readonly formattedTimeToday = computed(() => {
    const ms = this.readiness().revision_stats.time_spent_today_ms;
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return `${hours}h ${remaining}m`;
  });

  readonly aboveThreshold = computed(() => {
    const r = this.readiness();
    return r.predicted_score >= r.pass_threshold;
  });

  readonly topTopics = computed(() => {
    return [...this.readiness().topic_readiness]
      .sort((a, b) => a.readiness - b.readiness);
  });
}
