import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ReviewStatus } from '../../services/content-quality.service';

@Component({
  selector: 'chora-review-status',
  imports: [TranslatePipe],
  templateUrl: './review-status.component.html',
  styleUrl: './review-status.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewStatusComponent {
  /** Review status from content quality analysis */
  status = input.required<ReviewStatus>();

  /** Confidence level 0-1 for the review assessment */
  confidence = input<number | null>(null);

  readonly statusLabel = computed(() => {
    switch (this.status()) {
      case 'reviewed':
        return 'atomic.review.reviewed';
      case 'pending_review':
        return 'atomic.review.pending';
      case 'needs_revision':
        return 'atomic.review.needs-revision';
      default:
        return 'atomic.review.pending';
    }
  });

  readonly statusIcon = computed(() => {
    switch (this.status()) {
      case 'reviewed':
        return 'check_circle';
      case 'pending_review':
        return 'schedule';
      case 'needs_revision':
        return 'warning';
      default:
        return 'schedule';
    }
  });

  readonly confidencePercent = computed(() => {
    const c = this.confidence();
    return c !== null ? Math.round(c * 100) : null;
  });
}
