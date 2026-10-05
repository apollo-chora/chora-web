/**
 * ChoraQuestionReviewComponent — the answer-key reveal of one question.
 *
 * Presentational + standalone. Given a normalised `QuestionReview`, renders:
 *   - the question illustration (if any)
 *   - MCQ: every option via `<chora-mcq-option mode="reveal">` so the correct
 *     option is highlighted and each option's grounding/explainer is shown
 *   - OE: the model answer + rubric criteria
 *   - the model-answer illustration (if any)
 *
 * It deliberately does NOT render the question stem — the host (test-set
 * editor row / monitor questions panel) shows the stem in its own summary.
 *
 * AUTHOR / instructor surfaces ONLY — it exposes the answer key, so it must
 * never be placed on a learner surface pre-grade.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

import { TranslatePipe } from '../../pipes/translate.pipe';
import { ChoraMcqOptionComponent } from '../chora-mcq-option/chora-mcq-option.component';
import { ChoraQuestionImageComponent } from '../chora-question-image/chora-question-image.component';
import type {
  QuestionReview,
  QuestionReviewOption,
  QuestionReviewRubricRow,
} from './chora-question-review.model';

@Component({
  selector: 'chora-question-review',
  standalone: true,
  imports: [TranslatePipe, ChoraMcqOptionComponent, ChoraQuestionImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chora-question-review.component.html',
  styleUrl: './chora-question-review.component.scss',
})
export class ChoraQuestionReviewComponent {
  readonly review = input.required<QuestionReview>();
  /** Optional prefix for stable data-testids on the review + its options. */
  readonly testIdPrefix = input<string>('');

  readonly isMcq = computed<boolean>(() => this.review().question_type === 'mcq');
  readonly hasOptions = computed<boolean>(() => this.review().options.length > 0);
  readonly hasRubric = computed<boolean>(() => this.review().rubric.length > 0);

  /** Letter marker A/B/C/D for an option row. */
  optionLetter(index: number): string {
    return String.fromCharCode(65 + (index % 26));
  }

  optionTestId(optionId: string): string | undefined {
    const p = this.testIdPrefix();
    return p ? `${p}-option-${optionId}` : undefined;
  }

  trackOption(_: number, o: QuestionReviewOption): string {
    return o.option_id;
  }

  trackRubric(index: number, r: QuestionReviewRubricRow): string {
    return `${r.title}-${index}`;
  }

  reviewTestId(): string | null {
    const p = this.testIdPrefix();
    return p ? `${p}-review` : null;
  }
}
