/**
 * SubmissionGradingDetailComponent — R+ grading-review panel (ADR-172 HITL).
 *
 * Renders a single submission's GradingReviewDetail for the instructor:
 *   - per-question rows: MCQ = read-only deterministic outcome; OE = editable
 *     score (number) + points_possible + per-criterion scores + editable
 *     comment (textarea) + editable model_answer + AI/Human provenance badges
 *     per artifact (score / comment / model_answer) + quality-flag indicator +
 *     the learner's oe_response_text.
 *   - an editable overall comment with its own provenance badge.
 *
 * Edits are buffered in local signals and committed via:
 *   - "Save edits" → editGrades (per-question diffs) + editOverallComment.
 *     Provenance flips AI→HUMAN on the refreshed detail the BE returns.
 *   - "Approve"    → approveSubmission (review_status → APPROVED).
 *
 * Receives assessmentId + submissionId as signal inputs (parent binds them);
 * loads the detail on input change via a constructor effect. Emits `approved`
 * so the parent queue can refresh its row gating.
 *
 * Fail-loud per `feedback_no_stubs_real_wiring`. No `any` (chora-web CLAUDE.md §2).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { GradingReviewService } from './grading-review.service';
import {
  isHumanProvenance,
  provenanceBadgeKey,
  reviewGateLabelKey,
  reviewGateStateOf,
  type GradingReviewDetail,
  type GradingReviewQuestion,
  type Provenance,
  type QuestionGradeEdit,
} from './grading-review.model';

/** Local editable buffer for one OE question row. */
interface QuestionEditBuffer {
  /** Stringified score (textbox-friendly); empty string = untouched-null. */
  points_earned: string;
  comment: string;
  model_answer: string;
}

@Component({
  selector: 'chora-rplus-submission-grading-detail',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './submission-grading-detail.component.html',
  styleUrl: './submission-grading-detail.component.scss',
})
export class SubmissionGradingDetailComponent {
  private readonly gradingService = inject(GradingReviewService);
  private readonly toast = inject(ToastService);

  // ── Inputs / outputs ──────────────────────────────────────────────
  readonly assessmentId = input.required<string>();
  readonly submissionId = input.required<string>();

  /** Emitted after a per-candidate approve succeeds. */
  readonly approved = output<void>();
  /** Emitted when the instructor closes the panel. */
  readonly closed = output<void>();

  // ── Service state ──────────────────────────────────────────────────
  readonly detailState = this.gradingService.detailState;
  readonly detail = this.gradingService.detail;
  readonly editGradesState = this.gradingService.editGradesState;
  readonly editOverallCommentState =
    this.gradingService.editOverallCommentState;
  readonly approveState = this.gradingService.approveState;

  // ── Editable buffers (keyed by test_set_question_id) ───────────────
  private readonly _questionEdits = signal<
    Record<string, QuestionEditBuffer>
  >({});
  readonly questionEdits = this._questionEdits.asReadonly();

  private readonly _overallCommentEdit = signal<string>('');
  readonly overallCommentEdit = this._overallCommentEdit.asReadonly();

  // ── Derived state ──────────────────────────────────────────────────
  readonly isLoading = computed<boolean>(
    () => this.detailState().status === 'loading',
  );
  readonly isError = computed<boolean>(
    () => this.detailState().status === 'error',
  );
  readonly errorKey = computed<string>(() => {
    const s = this.detailState();
    return s.status === 'error' ? s.error : '';
  });

  readonly oeQuestions = computed<readonly GradingReviewQuestion[]>(() =>
    (this.detail()?.questions ?? []).filter((q) => q.question_type === 'oe'),
  );

  readonly isApproved = computed<boolean>(
    () => this.detail()?.review_status === 'APPROVED',
  );

  /**
   * Approval is only meaningful for a PENDING_REVIEW submission that is not yet
   * released. MCQ-only NotRequired ("") submissions + already-RELEASED ones
   * auto-release with NO human gate — the BE approve is a no-op there, so we
   * must not offer the affordance (CHO-2343 bug #2).
   */
  readonly approvalRequired = computed<boolean>(() => {
    const d = this.detail();
    if (!d) return false;
    return d.review_status === 'PENDING_REVIEW' && d.state !== 'RELEASED';
  });

  /** NotRequired-aware i18n key for the summary review-status pill. */
  readonly reviewStatusKey = computed<string>(() =>
    reviewGateLabelKey(reviewGateStateOf(this.detail()?.review_status)),
  );

  readonly saving = computed<boolean>(
    () =>
      this.editGradesState().status === 'submitting' ||
      this.editOverallCommentState().status === 'submitting',
  );

  readonly approving = computed<boolean>(
    () => this.approveState().status === 'submitting',
  );

  readonly saveErrorKey = computed<string>(() => {
    const g = this.editGradesState();
    if (g.status === 'error') return g.error;
    const o = this.editOverallCommentState();
    if (o.status === 'error') return o.error;
    return '';
  });

  readonly approveErrorKey = computed<string>(() => {
    const s = this.approveState();
    return s.status === 'error' ? s.error : '';
  });

  /** Editing locked once approved (re-open via a future endpoint per spec). */
  readonly editingLocked = computed<boolean>(() => this.isApproved());

  constructor() {
    // Load detail whenever the bound submission id resolves / changes.
    effect(() => {
      const aid = this.assessmentId();
      const sid = this.submissionId();
      if (aid && sid) {
        this.gradingService.loadGradingDetail(aid, sid);
      }
    });

    // Seed editable buffers from the freshly-loaded detail.
    effect(() => {
      const d = this.detail();
      if (d) {
        this.seedBuffers(d);
      }
    });

    // Toast + re-seed on a successful grades save (provenance now flipped).
    effect(() => {
      if (this.editGradesState().status === 'success') {
        this.toast.show('rplus.grading_queue.toast_saved', 'success');
      }
    });
    effect(() => {
      if (this.editOverallCommentState().status === 'success') {
        this.toast.show('rplus.grading_queue.toast_saved', 'success');
      }
    });

    // Bubble approve + toast — exactly once per approve. Reset the shared
    // singleton latch FIRST (canonical "consume-once" pattern): the write to
    // the same signal this effect depends on schedules one more flush in which
    // the guard is now false, so the toast + (approved) emit cannot re-fire on
    // later change-detection flushes. Without this the latch stayed `success`
    // and the effect re-emitted ~5× → /submissions+/grading flood → Cloud Armor
    // rate-limit (grading bug #1, 2026-06-03).
    effect(() => {
      const s = this.approveState();
      if (s.status === 'success') {
        this.gradingService.clearApproveState();
        // Only claim success when the approve ACTUALLY flipped the gate to
        // APPROVED. An MCQ-only NotRequired / already-RELEASED submission
        // returns unchanged (review_status "") — a 200 that changed nothing
        // must not toast "approved" (CHO-2343 bug #2). Still bubble (approved)
        // so the queue refreshes its gating either way.
        if (s.reviewStatus === 'APPROVED') {
          this.toast.show('rplus.grading_queue.toast_approved', 'success');
        }
        this.approved.emit();
      }
    });
  }

  // ── Buffer mutation (called from template input events) ────────────

  onScoreInput(tsqid: string, value: string): void {
    this.patchBuffer(tsqid, { points_earned: value });
  }

  onCommentInput(tsqid: string, value: string): void {
    this.patchBuffer(tsqid, { comment: value });
  }

  onModelAnswerInput(tsqid: string, value: string): void {
    this.patchBuffer(tsqid, { model_answer: value });
  }

  onOverallCommentInput(value: string): void {
    this._overallCommentEdit.set(value);
  }

  // ── CTAs ────────────────────────────────────────────────────────────

  /**
   * Persist all edits. Builds the per-question diff (only changed artifacts)
   * and dispatches editGrades when non-empty, then editOverallComment when the
   * overall comment changed. Both refresh the detail (provenance flips).
   */
  save(): void {
    const d = this.detail();
    if (!d || this.editingLocked()) return;
    const aid = this.assessmentId();
    const sid = this.submissionId();

    const edits = this.buildQuestionEdits(d);
    if (edits.length > 0) {
      this.gradingService.editGrades(aid, sid, { question_edits: edits });
    }

    const overall = this._overallCommentEdit();
    const original = d.overall_comment ?? '';
    if (overall !== original) {
      this.gradingService.editOverallComment(aid, sid, {
        overall_comment: overall,
      });
    }
  }

  approve(): void {
    const d = this.detail();
    if (!d || this.isApproved()) return;
    this.gradingService.approveSubmission(
      this.assessmentId(),
      this.submissionId(),
    );
  }

  retry(): void {
    this.gradingService.loadGradingDetail(
      this.assessmentId(),
      this.submissionId(),
    );
  }

  close(): void {
    this.gradingService.clearDetail();
    this.closed.emit();
  }

  // ── Per-row view helpers ──────────────────────────────────────────

  bufferFor(tsqid: string): QuestionEditBuffer {
    return (
      this._questionEdits()[tsqid] ?? {
        points_earned: '',
        comment: '',
        model_answer: '',
      }
    );
  }

  /** i18n key for an artifact provenance badge (ai | human). */
  provenanceKey(p: Provenance | undefined): string {
    return 'rplus.grading_queue.provenance_' + provenanceBadgeKey(p);
  }

  isHuman(p: Provenance | undefined): boolean {
    return isHumanProvenance(p);
  }

  trackByTsqid(_i: number, q: GradingReviewQuestion): string {
    return q.test_set_question_id;
  }

  trackByCriterion(i: number, _c: unknown): number {
    return i;
  }

  // ── Internal ──────────────────────────────────────────────────────

  private patchBuffer(tsqid: string, patch: Partial<QuestionEditBuffer>): void {
    this._questionEdits.update((all) => {
      const current = all[tsqid] ?? {
        points_earned: '',
        comment: '',
        model_answer: '',
      };
      return { ...all, [tsqid]: { ...current, ...patch } };
    });
  }

  private seedBuffers(d: GradingReviewDetail): void {
    const next: Record<string, QuestionEditBuffer> = {};
    for (const q of d.questions) {
      if (q.question_type !== 'oe') continue;
      next[q.test_set_question_id] = {
        points_earned:
          q.points_earned === undefined || q.points_earned === null
            ? ''
            : String(q.points_earned),
        comment: q.comment ?? '',
        model_answer: q.model_answer ?? '',
      };
    }
    this._questionEdits.set(next);
    this._overallCommentEdit.set(d.overall_comment ?? '');
  }

  /**
   * Diff each OE question's buffer against the loaded detail; emit only the
   * artifacts that actually changed (so provenance flips precisely).
   */
  private buildQuestionEdits(
    d: GradingReviewDetail,
  ): readonly QuestionGradeEdit[] {
    const edits: QuestionGradeEdit[] = [];
    const buffers = this._questionEdits();
    for (const q of d.questions) {
      if (q.question_type !== 'oe') continue;
      const buf = buffers[q.test_set_question_id];
      if (!buf) continue;

      const edit: { -readonly [K in keyof QuestionGradeEdit]?: QuestionGradeEdit[K] } =
        {
          test_set_question_id: q.test_set_question_id,
        };
      let changed = false;

      const originalScore =
        q.points_earned === undefined || q.points_earned === null
          ? ''
          : String(q.points_earned);
      if (buf.points_earned !== originalScore && buf.points_earned !== '') {
        const parsed = Number(buf.points_earned);
        if (!Number.isNaN(parsed)) {
          edit.points_earned = parsed;
          changed = true;
        }
      }

      const originalComment = q.comment ?? '';
      if (buf.comment !== originalComment) {
        edit.comment = buf.comment;
        changed = true;
      }

      const originalModelAnswer = q.model_answer ?? '';
      if (buf.model_answer !== originalModelAnswer) {
        edit.model_answer = buf.model_answer;
        changed = true;
      }

      if (changed) {
        edits.push(edit as QuestionGradeEdit);
      }
    }
    return edits;
  }
}
