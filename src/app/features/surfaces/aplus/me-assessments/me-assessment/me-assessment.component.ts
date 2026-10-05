/**
 * MeAssessmentComponent — `/a/me/assessments/:assessmentId`.
 *
 * Phase X.3.2 — assessment cover + per-question working canvas (Phyllis's
 * dogfood through the test-set authored on A+ + delivered via R+).
 *
 * Lifecycle:
 *   1. Mount → service.loadAssessment(assessmentId)
 *   2. Cover renders title + "Start" CTA when state=OPEN
 *   3. Start CTA → service.startSubmission(assessmentId) → 201 (or 200
 *      idempotent-replay if a draft submission already exists, in which
 *      case we follow up with service.loadSubmission(...) to rehydrate
 *      the answers[])
 *   4. Working canvas renders per question with debounced (~500ms) +
 *      5s heartbeat keep-alive autosave
 *   5. Submit CTA → service.submitFinal(assessmentId, submissionId)
 *      → 202 → "go to result" link
 *
 * Autosave pill is fail-loud — "saving…" / "saved at …" / "save failed".
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ChoraStatCardComponent } from '../../../../../shared/components/chora-stat-card/chora-stat-card.component';
import { ChoraMcqOptionComponent } from '../../../../../shared/components/chora-mcq-option/chora-mcq-option.component';
import { ChoraQuestionImageComponent } from '../../../../../shared/components/chora-question-image/chora-question-image.component';
import { MeAssessmentsService } from '../me-assessments.service';
import type {
  AutosaveAnswerInput,
  LearnerMcqOption,
  LearnerQuestion,
  Submission,
} from '../me-assessments.model';

const AUTOSAVE_DEBOUNCE_MS = 500;
const HEARTBEAT_MS = 5000;

@Component({
  selector: 'chora-aplus-me-assessment',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    TranslatePipe,
    ChoraStatCardComponent,
    ChoraMcqOptionComponent,
    ChoraQuestionImageComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './me-assessment.component.html',
  styleUrl: './me-assessment.component.scss',
})
export class MeAssessmentComponent implements OnDestroy {
  private readonly service = inject(MeAssessmentsService);
  private readonly route = inject(ActivatedRoute);

  readonly assessmentId =
    this.route.snapshot.paramMap.get('assessmentId') ?? '';

  // ── Service-backed state ──────────────────────────────────────────
  readonly detailState = this.service.detailState;
  readonly startState = this.service.startState;
  readonly submissionState = this.service.submissionState;
  readonly autosaveState = this.service.autosaveState;
  readonly submitFinalState = this.service.submitFinalState;

  readonly detail = this.service.detail;
  readonly started = this.service.started;
  readonly submission = this.service.submission;

  // ── Derived render flags ──────────────────────────────────────────
  readonly isLoading = computed<boolean>(
    () => this.detailState().status === 'loading',
  );
  readonly isLoadError = computed<boolean>(
    () => this.detailState().status === 'error',
  );
  readonly loadErrorKey = computed<string>(() => {
    const s = this.detailState();
    return s.status === 'error' ? s.error : '';
  });

  readonly isStarting = computed<boolean>(
    () => this.startState().status === 'starting',
  );
  readonly isStarted = computed<boolean>(
    () => this.startState().status === 'started',
  );
  readonly isStartError = computed<boolean>(
    () => this.startState().status === 'error',
  );
  readonly startErrorKey = computed<string>(() => {
    const s = this.startState();
    return s.status === 'error' ? s.error : '';
  });

  readonly isSubmitting = computed<boolean>(
    () => this.submitFinalState().status === 'submitting',
  );
  readonly isSubmitted = computed<boolean>(
    () => this.submitFinalState().status === 'submitted',
  );
  readonly isSubmitError = computed<boolean>(
    () => this.submitFinalState().status === 'error',
  );
  readonly submitErrorKey = computed<string>(() => {
    const s = this.submitFinalState();
    return s.status === 'error' ? s.error : '';
  });

  /**
   * True once the learner has dispatched (or completed) the final submit. The
   * submission is locked server-side at that point, so any further autosave
   * PATCH returns 409. Gates the autosave loop so the 5s heartbeat / trailing
   * debounce stop firing post-submit (was: ~2 benign 409s — bug #4, 2026-06-03).
   * A submit *error* re-opens the window (status → 'error'), so this returns
   * false again and autosave can resume on the next edit.
   */
  readonly assessmentLocked = computed<boolean>(() => {
    const s = this.submitFinalState().status;
    return s === 'submitting' || s === 'submitted';
  });

  readonly submissionId = computed<string | null>(() => {
    const s = this.startState();
    if (s.status === 'started') return s.started.submission_id;
    const sub = this.submission();
    if (sub) return sub.submission_id;
    // BE shipped learner_latest_submission_id on the detail payload
    // 2026-05-17 (e2e09d9d). Allows the cover to deep-link to the
    // result page without a separate fetch when state=RELEASED.
    const d = this.detail();
    return d?.learner_latest_submission_id ?? null;
  });

  readonly inCanvas = computed<boolean>(() => this.isStarted());
  readonly resultHref = computed<string>(() => {
    const sid = this.submissionId();
    return sid
      ? `/a/me/assessments/${this.assessmentId}/result/${sid}`
      : `/a/me/assessments/${this.assessmentId}/result`;
  });

  /**
   * Whether the cover should render the "View your result" CTA instead
   * of "Start". True when the assessment is RELEASED AND the learner
   * has a known prior submission. Covers the case where a learner
   * arrives via the list "View result" link (or returns to the cover
   * URL directly after submitting) — instead of seeing a broken Start
   * flow that errors with "window not open", they get a working link
   * to their released result. Per user feedback 2026-05-17.
   */
  readonly showViewResultCta = computed<boolean>(() => {
    const d = this.detail();
    return (
      d?.state === 'RELEASED' &&
      this.submissionId() !== null
    );
  });

  /**
   * Hide the Start CTA when the learner has exhausted their attempts
   * OR when a released submission is already available — both cases
   * supersede starting a new attempt. Avoids the broken "Start →
   * window not open" path the user hit 2026-05-17.
   */
  readonly showStartCta = computed<boolean>(() => {
    const d = this.detail();
    if (!d) return false;
    if (this.showViewResultCta()) return false;
    if (d.learner_remaining_attempts <= 0) return false;
    // CHO-2182: only an OPEN window accepts a START. A SCHEDULED (not-yet-open)
    // or CLOSED assessment 409s server-side (NOT_YET_OPEN / WINDOW_CLOSED) and
    // burns no attempt, so never hand the learner a Start that can only fail.
    if (d.state !== 'OPEN') return false;
    return true;
  });

  /**
   * CHO-2182: the assessment is not yet open (SCHEDULED). The cover shows the
   * scheduled-open state — the open time — in place of a dead Start button.
   */
  readonly showScheduledState = computed<boolean>(
    () => this.detail()?.state === 'SCHEDULED',
  );

  /**
   * CHO-2182: a terminal / non-actionable window (closed, grading in flight, or
   * released without a viewable result of ours). The cover surfaces the state —
   * as the list card already does — instead of a Start that can only 409.
   */
  readonly showClosedState = computed<boolean>(() => {
    const d = this.detail();
    if (!d) return false;
    if (this.showViewResultCta()) return false;
    return (
      d.state === 'CLOSED' ||
      d.state === 'GRADING' ||
      d.state === 'GRADED' ||
      d.state === 'RELEASED' ||
      d.state === 'ARCHIVED'
    );
  });

  /** i18n key for the cover state chip, mirroring the list card's status_* keys. */
  readonly coverStateKey = computed<string>(() => {
    const d = this.detail();
    return d ? `aplus.me_assessments.detail.state_${d.state.toLowerCase()}` : '';
  });

  readonly autosavePillState = computed<string>(
    () => this.autosaveState().status,
  );
  readonly autosavePillSavedAt = computed<string>(() => {
    const s = this.autosaveState();
    return s.status === 'saved' ? s.saved_at : '';
  });
  readonly autosavePillErrorKey = computed<string>(() => {
    const s = this.autosaveState();
    return s.status === 'error' ? s.error : '';
  });

  // ── Answer-map signals ────────────────────────────────────────────
  private readonly mcqChoiceMap = signal<Map<string, string>>(new Map());
  private readonly mcqChoicesMap = signal<Map<string, readonly string[]>>(
    new Map(),
  );
  private readonly oeMap = signal<Map<string, string>>(new Map());

  // ── Debounce + heartbeat timers ──────────────────────────────────
  private readonly debouncedQuestions = new Set<string>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (this.assessmentId) {
      this.service.loadAssessment(this.assessmentId);
    }

    effect(() => {
      const s = this.startState();
      if (s.status === 'started') {
        if (s.started.idempotent_replay) {
          this.service.loadSubmission(
            this.assessmentId,
            s.started.submission_id,
          );
        }
        this.startHeartbeat();
      } else {
        this.stopHeartbeat();
      }
    });

    effect(() => {
      const sub = this.submission();
      if (sub) this.seedAnswerMaps(sub);
    });
  }

  ngOnDestroy(): void {
    this.stopHeartbeat();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  // ── Public actions ────────────────────────────────────────────────

  retryLoad(): void {
    this.service.loadAssessment(this.assessmentId);
  }

  startSession(): void {
    this.service.startSubmission(this.assessmentId);
  }

  submitFinal(): void {
    const sid = this.submissionId();
    if (!sid) return;
    // Stop the autosave loop at the source: cancel any armed debounce and halt
    // the 5s heartbeat so no PATCH races the POST /submit (would 409). bug #4.
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.debouncedQuestions.clear();
    this.stopHeartbeat();
    this.service.submitFinal(this.assessmentId, sid);
  }

  // ── MCQ + OE input handlers ───────────────────────────────────────

  // ── Prompt accessors — handle nested + legacy flat shape ─────────

  /**
   * Display string for the question stem. Per LEG3-D R5 the BE ships
   * `prompt: { stem, options?, ... }`; older payloads shipped a flat
   * `prompt: string`. Coerce both safely without surfacing
   * `[object Object]` in the template.
   */
  promptStem(question: LearnerQuestion): string {
    const p = question.prompt;
    if (typeof p === 'string') return p;
    return p?.stem ?? '';
  }

  /**
   * W8 image-gen: stem illustration URL for a question, when present. The
   * BE surfaces it on `prompt.image_url` (learner-safe — it's the question's
   * accompanying picture, not the answer key). `prompt` may be the legacy
   * flat `string` shape, which never carries an image — return null there.
   * Empty/whitespace coerced to null so the template @if guard is honest.
   */
  questionImageUrl(question: LearnerQuestion): string | null {
    const p = question.prompt;
    if (typeof p === 'string') return null;
    const url = p?.image_url ?? null;
    return url && url.trim() !== '' ? url : null;
  }

  /**
   * MCQ options for a question. New BE: `prompt.options`. Legacy:
   * `mcq.options`. Returns `[]` if neither is present (template
   * conditionally renders the MCQ block, so an empty options list still
   * fails loud via the FE no-stub guard rather than silently rendering
   * a hollow question).
   */
  mcqOptions(question: LearnerQuestion): readonly LearnerMcqOption[] {
    const p = question.prompt;
    if (typeof p !== 'string' && p?.options?.length) return p.options;
    return question.mcq?.options ?? [];
  }

  /** Per-question point value. Prefers BE-canonical `points`. */
  questionPoints(question: LearnerQuestion): number {
    return question.points ?? question.points_possible ?? 0;
  }

  /** Scoring mode resolution — `prompt.scoring_mode` → legacy `mcq.scoring_mode` → single. */
  private scoringMode(
    question: LearnerQuestion,
  ): 'single_correct' | 'multi_correct' | 'all_or_nothing' {
    const p = question.prompt;
    if (typeof p !== 'string' && p?.scoring_mode) return p.scoring_mode;
    return question.mcq?.scoring_mode ?? 'single_correct';
  }

  hasMcqOptions(question: LearnerQuestion): boolean {
    return this.mcqOptions(question).length > 0;
  }

  /**
   * Display text for an MCQ option. Prefers `text` when populated and
   * distinct from `label`; otherwise falls back to `label`. The earlier
   * template rendered both ("Saturn Saturn" when label === text from the
   * snapshot shape) which read as a duplication bug.
   */
  optionDisplay(opt: LearnerMcqOption): string {
    if (opt.text && opt.text.trim() !== opt.label.trim()) return opt.text;
    return opt.label;
  }

  /**
   * Per-option marker letter A / B / C / D ... matching the legacy
   * paper MCQ convention. Independent of the BE-supplied label so the
   * marker stays consistent even when label === text.
   */
  optionLetter(index: number): string {
    return String.fromCharCode(65 + (index % 26));
  }

  isMcqQuestion(question: LearnerQuestion): boolean {
    return question.question_type === 'mcq';
  }

  isOeQuestion(question: LearnerQuestion): boolean {
    return question.question_type === 'oe';
  }

  selectMcq(question: LearnerQuestion, optionId: string): void {
    const isMulti = this.scoringMode(question) === 'multi_correct';
    if (isMulti) {
      const next = new Map(this.mcqChoicesMap());
      const existing = next.get(question.test_set_question_id) ?? [];
      const set = new Set<string>(existing);
      if (set.has(optionId)) set.delete(optionId);
      else set.add(optionId);
      next.set(question.test_set_question_id, [...set]);
      this.mcqChoicesMap.set(next);
    } else {
      const next = new Map(this.mcqChoiceMap());
      next.set(question.test_set_question_id, optionId);
      this.mcqChoiceMap.set(next);
    }
    this.debouncedQuestions.add(question.test_set_question_id);
    this.scheduleDebouncedAutosave();
  }

  isMcqSelected(question: LearnerQuestion, optionId: string): boolean {
    const isMulti = this.scoringMode(question) === 'multi_correct';
    if (isMulti) {
      const selected = this.mcqChoicesMap().get(question.test_set_question_id);
      return !!selected?.includes(optionId);
    }
    return this.mcqChoiceMap().get(question.test_set_question_id) === optionId;
  }

  updateOe(question: LearnerQuestion, text: string): void {
    const next = new Map(this.oeMap());
    next.set(question.test_set_question_id, text);
    this.oeMap.set(next);
    this.debouncedQuestions.add(question.test_set_question_id);
    this.scheduleDebouncedAutosave();
  }

  oeValue(question: LearnerQuestion): string {
    return this.oeMap().get(question.test_set_question_id) ?? '';
  }

  // ── Autosave scheduling ───────────────────────────────────────────

  private scheduleDebouncedAutosave(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(
      () => this.flushAutosave(),
      AUTOSAVE_DEBOUNCE_MS,
    );
  }

  private flushAutosave(): void {
    // Submission is locked once submit is dispatched — any PATCH now 409s. bug #4.
    if (this.assessmentLocked()) return;
    const sid = this.submissionId();
    if (!sid) return;
    const detail = this.detail();
    if (!detail) return;
    const questions = detail.questions;
    const dirty = [...this.debouncedQuestions];
    if (dirty.length === 0) {
      // Heartbeat keep-alive — send first-question no-op so server extends
      // session lease (per Phase X.3 brief: 5s heartbeat fires regardless).
      if (questions.length > 0) {
        const first = questions[0];
        const body = this.buildAutosaveBody(
          [first.test_set_question_id],
          detail.questions,
        );
        if (body.answers.length > 0) {
          this.service.autosave(this.assessmentId, sid, body);
        } else {
          // No answer cached yet — still fire a minimal keep-alive against
          // the first question.
          this.service.autosave(this.assessmentId, sid, {
            answers: [
              {
                test_set_question_id: first.test_set_question_id,
                question_id: first.question_id,
              },
            ],
          });
        }
      }
      return;
    }
    const body = this.buildAutosaveBody(dirty, questions);
    this.debouncedQuestions.clear();
    this.service.autosave(this.assessmentId, sid, body);
  }

  private buildAutosaveBody(
    questionIds: string[],
    questions: readonly LearnerQuestion[],
  ): { answers: AutosaveAnswerInput[] } {
    const answers: AutosaveAnswerInput[] = [];
    const mcqChoice = this.mcqChoiceMap();
    const mcqChoices = this.mcqChoicesMap();
    const oe = this.oeMap();
    for (const qid of questionIds) {
      const q = questions.find((it) => it.test_set_question_id === qid);
      if (!q) continue;
      if (q.question_type === 'mcq') {
        const isMulti = this.scoringMode(q) === 'multi_correct';
        if (isMulti) {
          const sel = mcqChoices.get(qid);
          if (sel) {
            answers.push({
              test_set_question_id: qid,
              question_id: q.question_id,
              mcq_choice_ids: sel,
            });
          }
        } else {
          const sel = mcqChoice.get(qid);
          if (sel !== undefined) {
            answers.push({
              test_set_question_id: qid,
              question_id: q.question_id,
              mcq_choice_id: sel,
            });
          }
        }
      } else {
        const text = oe.get(qid);
        if (text !== undefined) {
          answers.push({
            test_set_question_id: qid,
            question_id: q.question_id,
            oe_response_text: text,
          });
        }
      }
    }
    return { answers };
  }

  // ── Heartbeat (public for spec) ────────────────────────────────────

  startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => this.fireHeartbeat(), HEARTBEAT_MS);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  fireHeartbeat(): void {
    this.flushAutosave();
  }

  // ── Seed-from-submission ──────────────────────────────────────────

  private seedAnswerMaps(submission: Submission): void {
    const mcq = new Map<string, string>();
    const mcqs = new Map<string, readonly string[]>();
    const oe = new Map<string, string>();
    for (const a of submission.answers) {
      if (a.mcq_choice_id !== undefined && a.mcq_choice_id !== null) {
        mcq.set(a.test_set_question_id, a.mcq_choice_id);
      } else if (
        a.mcq_choice_ids !== undefined &&
        a.mcq_choice_ids !== null
      ) {
        mcqs.set(a.test_set_question_id, a.mcq_choice_ids);
      } else if (
        a.oe_response_text !== undefined &&
        a.oe_response_text !== null
      ) {
        oe.set(a.test_set_question_id, a.oe_response_text);
      }
    }
    this.mcqChoiceMap.set(mcq);
    this.mcqChoicesMap.set(mcqs);
    this.oeMap.set(oe);
  }

  // ── Helpers for template ──────────────────────────────────────────

  trackQuestion(_: number, q: LearnerQuestion): string {
    return q.test_set_question_id;
  }

  trackOption(_: number, o: { option_id: string }): string {
    return o.option_id;
  }
}
