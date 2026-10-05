/**
 * SurveyCertificateGateComponent — Amber banner prompting survey completion to unlock certificate.
 *
 * Shared component embedded in certificate request pages. Displays when a learner
 * has completed a LockedPath/AssessmentSession but hasn't filled the post-course survey.
 *
 * Features:
 *   - Amber banner with clear CTA
 *   - Links to the survey page
 *   - Shows survey completion progress (e.g. "2/5 questions answered")
 *   - Dismissible (session-only)
 *   - WCAG 2.1 AA compliant (role="alert", aria-live)
 */
import {
  Component,
  ChangeDetectionStrategy,
  input,
  signal,
  computed,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'chora-survey-certificate-gate',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './survey-certificate-gate.component.html',
  styleUrl: './survey-certificate-gate.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SurveyCertificateGateComponent {
  /** The survey ID to link to */
  readonly surveyId = input.required<string>();

  /** LockedPath or AssessmentSession title for display context */
  readonly completedTitle = input<string>('');

  /** Total number of survey questions */
  readonly totalQuestions = input<number>(0);

  /** Number of questions already answered (partial progress) */
  readonly answeredQuestions = input<number>(0);

  /** Whether the survey is complete (hides the banner) */
  readonly surveyComplete = input<boolean>(false);

  // --- Local state ---
  readonly dismissed = signal(false);

  // --- Computed ---
  readonly visible = computed(() => {
    return !this.surveyComplete() && !this.dismissed();
  });

  readonly progressText = computed(() => {
    const total = this.totalQuestions();
    const answered = this.answeredQuestions();
    if (total === 0) return '';
    return `${answered}/${total}`;
  });

  readonly progressPct = computed(() => {
    const total = this.totalQuestions();
    const answered = this.answeredQuestions();
    if (total === 0) return 0;
    return Math.round((answered / total) * 100);
  });

  readonly surveyLink = computed(() => {
    return `/survey/${this.surveyId()}`;
  });

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  dismiss(): void {
    this.dismissed.set(true);
  }
}
