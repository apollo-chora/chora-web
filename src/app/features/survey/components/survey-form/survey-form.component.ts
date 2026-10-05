/**
 * SurveyFormComponent — Dynamic survey form renderer supporting multiple question types.
 *
 * Route: /survey/:surveyId/respond
 *
 * Features:
 *   - Renders rating, text, multiple-choice, and scale question types
 *   - Progress indicator showing current question position
 *   - Required question validation
 *   - Anonymous mode banner when applicable
 *   - Submit with confirmation
 *   - Navigates to completion screen on success
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SurveyService } from '../../services/survey.service';
import type { SurveyQuestion } from '../../models/survey.model';

@Component({
  selector: 'chora-survey-form',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './survey-form.component.html',
  styleUrl: './survey-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SurveyFormComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly surveyService = inject(SurveyService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly surveyDetailState = this.surveyService.surveyDetailState;
  readonly surveyDetail = this.surveyService.surveyDetail;
  readonly responseState = this.surveyService.responseState;

  // --- Local state ---
  readonly answers = signal<Record<string, unknown>>({});
  readonly submitting = signal(false);
  readonly validationErrors = signal<Record<string, string>>({});
  /** True after a Submit attempt with nothing answered at all (CHO-2353). */
  readonly blankSubmission = signal(false);

  // --- Computed ---
  readonly questions = computed(() => {
    const detail = this.surveyDetail();
    return detail?.questions ?? [];
  });

  readonly totalQuestions = computed(() => this.questions().length);

  readonly answeredCount = computed(() => {
    const currentAnswers = this.answers();
    return Object.keys(currentAnswers).filter((key) => {
      const value = currentAnswers[key];
      return value !== null && value !== undefined && value !== '';
    }).length;
  });

  readonly progressPercent = computed(() => {
    const total = this.totalQuestions();
    if (total === 0) return 0;
    return Math.round((this.answeredCount() / total) * 100);
  });

  readonly canSubmit = computed(() => {
    const detail = this.surveyDetail();
    if (!detail) return false;
    // CHO-2353 - the delivery contract marks no survey question as required, so
    // `every()` over an empty required-set is vacuously true. Demand at least
    // one answer, otherwise Submit is live on a completely blank survey and the
    // tenant collects empty feedback rows.
    if (this.answeredCount() === 0) return false;
    const currentAnswers = this.answers();
    const requiredQuestions = detail.questions.filter((q) => q.required);
    return requiredQuestions.every((q) => {
      const answer = currentAnswers[q.id];
      return answer !== null && answer !== undefined && answer !== '';
    });
  });

  readonly hasValidationErrors = computed(() =>
    Object.keys(this.validationErrors()).length > 0,
  );

  private subscriptions = new Subscription();
  private surveyId = '';

  ngOnInit(): void {
    this.surveyId = this.route.snapshot.paramMap.get('surveyId') ?? '';
    if (this.surveyId) {
      this.subscriptions.add(
        this.surveyService.loadSurveyDetail(this.surveyId).subscribe(),
      );
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Answer Handlers
  // -------------------------------------------------------------------------

  setRatingAnswer(questionId: string, value: number): void {
    this.answers.update((prev) => ({ ...prev, [questionId]: value }));
    this.clearValidationError(questionId);
  }

  setTextAnswer(questionId: string, event: Event): void {
    const input = event.target as HTMLTextAreaElement;
    this.answers.update((prev) => ({ ...prev, [questionId]: input.value }));
    this.clearValidationError(questionId);
  }

  setMultipleChoiceAnswer(questionId: string, value: string): void {
    this.answers.update((prev) => ({ ...prev, [questionId]: value }));
    this.clearValidationError(questionId);
  }

  setScaleAnswer(questionId: string, value: number): void {
    this.answers.update((prev) => ({ ...prev, [questionId]: value }));
    this.clearValidationError(questionId);
  }

  // -------------------------------------------------------------------------
  // Submission
  // -------------------------------------------------------------------------

  submitSurvey(): void {
    if (!this.validate()) return;

    this.submitting.set(true);

    this.subscriptions.add(
      this.surveyService.submitResponse(this.surveyId, { answers: this.answers() }).subscribe({
        next: (result) => {
          this.submitting.set(false);
          if (result) {
            this.toast.show('survey.submit_success', 'success');
            this.router.navigate(['/survey', this.surveyId, 'complete']);
          }
        },
        error: () => {
          this.submitting.set(false);
          this.toast.show('survey.submit_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  getAnswer(questionId: string): unknown {
    return this.answers()[questionId] ?? null;
  }

  getRatingValue(questionId: string): number {
    const value = this.answers()[questionId];
    return typeof value === 'number' ? value : 0;
  }

  getTextValue(questionId: string): string {
    const value = this.answers()[questionId];
    return typeof value === 'string' ? value : '';
  }

  getChoiceValue(questionId: string): string {
    const value = this.answers()[questionId];
    return typeof value === 'string' ? value : '';
  }

  getScaleValue(questionId: string): number {
    const value = this.answers()[questionId];
    return typeof value === 'number' ? value : 0;
  }

  getChoices(question: SurveyQuestion): string[] {
    const options = question.options;
    if (options && Array.isArray(options['choices'])) {
      return options['choices'] as string[];
    }
    return [];
  }

  getScaleMin(question: SurveyQuestion): number {
    const options = question.options;
    return typeof options?.['min'] === 'number' ? options['min'] as number : 1;
  }

  getScaleMax(question: SurveyQuestion): number {
    const options = question.options;
    return typeof options?.['max'] === 'number' ? options['max'] as number : 10;
  }

  getScaleRange(question: SurveyQuestion): number[] {
    const min = this.getScaleMin(question);
    const max = this.getScaleMax(question);
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }

  getRatingRange(): number[] {
    return [1, 2, 3, 4, 5];
  }

  trackByQuestionId(_index: number, question: SurveyQuestion): string {
    return question.id;
  }

  trackByValue(_index: number, value: number | string): number | string {
    return value;
  }

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  private validate(): boolean {
    const errors: Record<string, string> = {};
    const detail = this.surveyDetail();
    if (!detail) return false;

    const currentAnswers = this.answers();

    for (const question of detail.questions) {
      if (question.required) {
        const answer = currentAnswers[question.id];
        if (answer === null || answer === undefined || answer === '') {
          errors[question.id] = 'survey.validation_required';
        }
      }
    }

    // Refuse a wholly blank submission. No question is contractually required,
    // so without this a learner can POST an empty answer set (CHO-2353).
    if (Object.keys(errors).length === 0 && this.answeredCount() === 0) {
      this.blankSubmission.set(true);
      return false;
    }
    this.blankSubmission.set(false);

    this.validationErrors.set(errors);
    return Object.keys(errors).length === 0;
  }

  private clearValidationError(questionId: string): void {
    this.validationErrors.update((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  }
}
