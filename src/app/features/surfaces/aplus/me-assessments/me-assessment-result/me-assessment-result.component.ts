/**
 * MeAssessmentResultComponent — `/a/me/assessments/:assessmentId/result/:submissionId`.
 *
 * Phase X.3.3 — result polling + render.
 *
 * Lifecycle:
 *   1. Mount → service.loadResult(assessmentId, submissionId)
 *   2. Initial GET typically returns `state=PENDING_RELEASE` (per
 *      ADR-155 D7 + D9 — instructor hasn't released yet)
 *   3. While pending, poll every 5s (configurable for tests)
 *   4. When state flips to RELEASED, render the full SubmissionResult:
 *      - total points earned / possible
 *      - passing threshold + passed badge
 *      - per-question grades with MCQ ✓/✗ + OE_BATCH_PENDING chip on
 *        OE rows (per ADR-155 D8)
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ChoraMcqOptionComponent } from '../../../../../shared/components/chora-mcq-option/chora-mcq-option.component';
import { ChoraQuestionImageComponent } from '../../../../../shared/components/chora-question-image/chora-question-image.component';
import { MeAssessmentsService } from '../me-assessments.service';
import type {
  GradeProvenance,
  LearnerQuestion,
  LearnerQuestionGrade,
  LearnerQuestionGradeMcqOption,
  LearnerQuestionGradeOeCriterion,
} from '../me-assessments.model';

const DEFAULT_POLL_MS = 5000;

@Component({
  selector: 'chora-aplus-me-assessment-result',
  imports: [RouterLink, TranslatePipe, ChoraMcqOptionComponent, ChoraQuestionImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './me-assessment-result.component.html',
  styleUrl: './me-assessment-result.component.scss',
})
export class MeAssessmentResultComponent implements OnDestroy {
  private readonly service = inject(MeAssessmentsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly assessmentId =
    this.route.snapshot.paramMap.get('assessmentId') ?? '';
  readonly submissionId =
    this.route.snapshot.paramMap.get('submissionId') ??
    this.route.snapshot.queryParamMap.get('submission_id') ??
    '';

  readonly resultState = this.service.resultState;

  readonly isLoading = computed<boolean>(
    () => this.resultState().status === 'loading',
  );
  readonly isPending = computed<boolean>(
    () => this.resultState().status === 'pending',
  );
  readonly isReleased = computed<boolean>(
    () => this.resultState().status === 'released',
  );
  readonly isError = computed<boolean>(
    () => this.resultState().status === 'error',
  );

  readonly pendingMessage = computed<string>(() => {
    const s = this.resultState();
    return s.status === 'pending' ? s.message : '';
  });

  readonly errorKey = computed<string>(() => {
    const s = this.resultState();
    return s.status === 'error' ? s.error : '';
  });

  readonly result = computed(() => {
    const s = this.resultState();
    return s.status === 'released' ? s.result : null;
  });

  readonly grades = computed<readonly LearnerQuestionGrade[]>(() => {
    const r = this.result();
    return r ? r.per_question_grades : [];
  });

  /**
   * The `/result` endpoint omits the prompt stem on per_question_grades
   * (BE returns only options + grading metadata). Load the assessment
   * detail in parallel so the released result page can carry the stem
   * over from the cover-view shape (LEG3-D R5 snapshot envelope).
   * Per [[feedback-no-stubs-real-wiring]] this is a real BFF call, not
   * a fixture — the FE merges by `test_set_question_id`.
   */
  readonly detail = this.service.detail;

  private readonly questionPrompts = computed<Map<string, string>>(() => {
    const d = this.detail();
    const map = new Map<string, string>();
    if (!d) return map;
    for (const q of d.questions) {
      map.set(q.test_set_question_id, this.stemFromQuestion(q));
    }
    return map;
  });

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (this.assessmentId && this.submissionId) {
      this.service.loadResult(this.assessmentId, this.submissionId);
      // Parallel-fetch the assessment detail so the per-question rows can
      // render the prompt stem alongside the grade breakdown.
      this.service.loadAssessment(this.assessmentId);
    } else if (this.assessmentId && !this.submissionId) {
      // FE-BUG-RESULT-NO-SUBMID — `/result` URL without submission id
      // renders nothing today. Redirect to the cover view; from there
      // the learner's "View result" CTA targets the right submId.
      this.router.navigate(['/a/me/assessments', this.assessmentId], {
        replaceUrl: true,
      });
    }
    effect(() => {
      const s = this.resultState();
      if (s.status === 'pending') {
        this.startPolling();
      } else if (s.status === 'released' || s.status === 'error') {
        this.stopPolling();
      }
    });
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  // ── Polling control (public for spec) ─────────────────────────────

  startPolling(intervalMs: number = DEFAULT_POLL_MS): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.firePollTick(), intervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  firePollTick(): void {
    if (!this.assessmentId || !this.submissionId) return;
    this.service.loadResult(this.assessmentId, this.submissionId);
  }

  retry(): void {
    this.firePollTick();
  }

  trackGrade(_: number, g: LearnerQuestionGrade): string {
    return g.test_set_question_id;
  }

  trackOption(_: number, o: LearnerQuestionGradeMcqOption): string {
    return o.option_id;
  }

  trackCriterion(_: number, c: LearnerQuestionGradeOeCriterion): string {
    return c.criterion_id;
  }

  /**
   * Resolved per-question grader comment for a graded OE row, in precedence
   * order (ADR-172): the structured OE post-grade `comment`, then the flat
   * back-compat `llm_evaluator_feedback`, then the nested one. Returns null
   * when none is present so the template suppresses the comment block.
   */
  oeComment(g: LearnerQuestionGrade): string | null {
    return (
      g.oe_post_grade?.comment ??
      g.llm_evaluator_feedback ??
      g.oe_post_grade?.llm_evaluator_feedback ??
      null
    );
  }

  /**
   * Provenance ('AI' | 'HUMAN') for the resolved OE comment. Defaults to
   * 'AI' when the BE omits it — the v1 grader path is AI-first (ADR-155 D8),
   * so an unflagged comment is an AI comment.
   */
  oeCommentProvenance(g: LearnerQuestionGrade): GradeProvenance {
    return g.oe_post_grade?.comment_provenance ?? 'AI';
  }

  /**
   * Translation key for a provenance badge label — 'AI comments' for AI,
   * 'Human reviewer' for HUMAN.
   */
  provenanceLabelKey(provenance: GradeProvenance): string {
    return provenance === 'HUMAN'
      ? `${this.i18nPrefix}.provenance_human`
      : `${this.i18nPrefix}.provenance_ai`;
  }

  oeCriterionScores(
    g: LearnerQuestionGrade,
  ): readonly LearnerQuestionGradeOeCriterion[] {
    return g.oe_post_grade?.criterion_scores ?? [];
  }

  /** Provenance for the overall (whole-assessment) comment; AI-first default. */
  overallCommentProvenance(): GradeProvenance {
    return this.result()?.overall_comment_provenance ?? 'AI';
  }

  private readonly i18nPrefix = 'aplus.me_assessments.result';

  mcqAnswerLabel(g: LearnerQuestionGrade): string {
    const choiceId = g.learner_answer?.mcq_choice_id;
    if (!choiceId) return '–';
    const opts = g.mcq_post_grade?.options ?? [];
    const opt = opts.find((o) => o.option_id === choiceId);
    return opt?.label ?? choiceId;
  }

  mcqAnswerLabels(g: LearnerQuestionGrade): string {
    const choices = g.learner_answer?.mcq_choice_ids ?? [];
    if (choices.length === 0) return '–';
    const opts = g.mcq_post_grade?.options ?? [];
    return choices
      .map((cid) => opts.find((o) => o.option_id === cid)?.label ?? cid)
      .join(', ');
  }

  /**
   * Resolved learner-answer display for an MCQ grade row. Order of
   * precedence:
   *   1. `learner_answer.mcq_choice_id` (single-correct, BE supplies it)
   *   2. `learner_answer.mcq_choice_ids[]` (multi-correct)
   *   3. null — genuinely no answer (template renders "No answer" via
   *      the @else branch). BE ack 44a097a3 (E2E-BE-RESULT-LEARNER-
   *      ANSWER, smoke 2026-05-17) guarantees `learner_answer.mcq_choice_id`
   *      is populated when the learner picked, so the previous INFERRED
   *      fallback (derive from `is_correct` + `points_earned`) is gone —
   *      surfacing an inferred pick now would lie about the BE shape.
   */
  mcqAnswerDisplay(g: LearnerQuestionGrade): string | null {
    const single = g.learner_answer?.mcq_choice_id;
    if (single) return this.mcqAnswerLabel(g);
    const multi = g.learner_answer?.mcq_choice_ids;
    if (multi && multi.length > 0) return this.mcqAnswerLabels(g);
    return null;
  }

  /**
   * Returns the prompt stem for a given grade row, looked up from the
   * parallel-loaded assessment detail by `test_set_question_id`.
   * Returns empty string until the detail load resolves; the template
   * conditionally renders the stem block only when non-empty so the
   * grade row keeps rendering even if the detail call lags.
   */
  promptStem(g: LearnerQuestionGrade): string {
    return this.questionPrompts().get(g.test_set_question_id) ?? '';
  }

  /**
   * Display text for an MCQ option in the result reveal. Prefers `text`
   * when distinct from `label` (legacy two-field shape); otherwise falls
   * back to the label. Removes the earlier visual bug where label === text
   * rendered "Saturn Saturn" / "The Sun The Sun".
   */
  optionDisplay(opt: LearnerQuestionGradeMcqOption): string {
    const label = opt.label.trim();
    const text = opt.text?.trim() ?? '';
    if (text && text !== label) return text;
    return label;
  }

  /**
   * Letter marker A/B/C/D for the option row, independent of the option
   * label so it stays consistent when label and text are the same.
   */
  optionLetter(index: number): string {
    return String.fromCharCode(65 + (index % 26));
  }

  /**
   * True when the learner picked this option, for the result reveal's
   * chosen-answer indicator. Handles both the single-correct shape
   * (`learner_answer.mcq_choice_id`) and the multi-correct shape
   * (`learner_answer.mcq_choice_ids[]`). Matched on `option_id` against the
   * SAME options the reveal renders, so the green "Correct answer" tag and
   * the learner's "Your answer" tag stay consistent.
   */
  isOptionSelected(g: LearnerQuestionGrade, optionId: string): boolean {
    const single = g.learner_answer?.mcq_choice_id;
    if (single) return single === optionId;
    const multi = g.learner_answer?.mcq_choice_ids;
    return !!multi && multi.includes(optionId);
  }

  private stemFromQuestion(q: LearnerQuestion): string {
    const p = q.prompt;
    if (typeof p === 'string') return p;
    return p?.stem ?? '';
  }
}
