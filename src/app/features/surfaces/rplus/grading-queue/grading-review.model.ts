/**
 * Grading Review model — R+ instructor grading queue (ADR-172 HITL grading).
 *
 * Mirrors the wire shapes EXACTLY from
 * `chora-contracts/openapi/delivery-assessments.yaml` (snake_case as
 * chora-delivery serialises). No fields are invented — fail-loud per
 * `feedback_no_stubs_real_wiring`.
 *
 * Routes hosted here:
 *   - `/r/assessments/:assessmentId/grading-queue` → GradingQueueComponent
 *     (lists submissions + opens SubmissionGradingDetailComponent panel)
 *
 * BFF routes hit (via BffClientService, gateway prefix `/api/`; forwarded
 * verbatim to chora-delivery per ADR-172):
 *   - GET   /api/v1/assessments/{aid}/submissions/{sid}/grading         → getGradingDetail
 *   - PATCH /api/v1/assessments/{aid}/submissions/{sid}/grades          → editGrades
 *   - PATCH /api/v1/assessments/{aid}/submissions/{sid}/overall-comment → editOverallComment
 *   - POST  /api/v1/assessments/{aid}/submissions/{sid}/approve         → approveSubmission
 *   - POST  /api/v1/assessments/{aid}/approve-all                       → approveAll
 *   - POST  /api/v1/assessments/{aid}/release-results                   → releaseResults
 *
 * Per ADR-172: each grading artifact (score / comment / model_answer /
 * overall_comment) carries a Provenance that flips AI→HUMAN on instructor
 * edit; release-results is gated on review_status=APPROVED.
 */

import type { SubmissionState } from '../assessment-monitor/assessment-monitor.model';

// ── Provenance + review-status enums (mirror OpenAPI) ──

/** Authorship of a grading artifact. Drives AI/Human badges (ADR-172). */
export type Provenance = 'AI' | 'HUMAN';

/**
 * Per-submission HITL gate state as it rides the wire (ADR-172 §D6). The
 * chora-delivery domain has a THIRD value — ReviewStatusNotRequired, serialised
 * as the empty string "" — for MCQ-only auto-graded submissions that have NO
 * human gate. That "" is deliberately NOT in this union (it is not a "status"
 * an instructor acts on); it is normalised into ReviewGateState.NOT_REQUIRED
 * via reviewGateStateOf (CHO-2343 bug #2).
 */
export type ReviewStatus = 'PENDING_REVIEW' | 'APPROVED';

/**
 * Normalised per-row review gate used by the grading queue. Distinct from the
 * wire ReviewStatus: NOT_REQUIRED is the MCQ-only / auto-graded case whose wire
 * review_status is "" (empty). It has NO human gate and must NEVER render as
 * "Pending review", must not offer an Approve affordance, and must not be
 * counted as awaiting approval (CHO-2343 bug #2).
 */
export type ReviewGateState = 'NOT_REQUIRED' | 'PENDING_REVIEW' | 'APPROVED';

/**
 * Normalise a submission's raw wire review_status into the row gate state.
 * Only an explicit "" declares NotRequired (MCQ-only, no human gate). Every
 * other value — including an ABSENT/unknown field — maps to PENDING_REVIEW so
 * we never auto-skip a human gate we cannot positively classify as NotRequired
 * (conservative; the empty-string signal is the sole NotRequired declaration).
 */
export function reviewGateStateOf(raw: unknown): ReviewGateState {
  if (raw === 'APPROVED') return 'APPROVED';
  if (raw === '') return 'NOT_REQUIRED';
  return 'PENDING_REVIEW';
}

/** Whether a normalised gate still awaits a human approval (blocks release). */
export function isReviewGatePending(gate: ReviewGateState): boolean {
  return gate === 'PENDING_REVIEW';
}

/**
 * i18n key fragment for a review gate — append to
 * `rplus.grading_queue.review_status_`. NOT_REQUIRED renders its own label
 * ("No review needed"), never the pending label.
 */
export function reviewGateLabelKey(gate: ReviewGateState): string {
  return 'rplus.grading_queue.review_status_' + gate;
}

/** Presentational badge variant for a review gate (pure; testable). */
export function reviewGateBadgeVariant(gate: ReviewGateState): string {
  switch (gate) {
    case 'APPROVED':
      return 'badge-success';
    case 'PENDING_REVIEW':
      return 'badge-warning';
    default:
      return 'badge-neutral';
  }
}

/** Question type discriminator for the review row. */
export type GradingQuestionType = 'mcq' | 'oe';

/** Per-question grading dispatch lane. */
export type GradingDispatch = 'DETERMINISTIC' | 'LLM_EVALUATOR';

// ── Nested DTO shapes ──

/** Learner-submitted answer echoed into the review row. */
export interface GradingLearnerAnswer {
  readonly mcq_choice_id?: string | null;
  readonly mcq_choice_ids?: readonly string[] | null;
  readonly oe_response_text?: string | null;
}

/** Per-criterion sub-score (LLM evaluator output for an OE answer). */
export interface GradingCriterionScore {
  readonly criterion_id?: string;
  readonly title?: string;
  readonly score?: number;
  readonly max_score?: number;
  readonly feedback?: string | null;
}

/** Rubric criterion definition (snapshot from the test-set question). */
export interface GradingRubricCriterion {
  readonly criterion_id?: string;
  readonly title?: string;
  readonly description?: string;
  readonly weight?: number;
}

/**
 * One question in the instructor review. For OE: current vs original-AI
 * score/comment/model-answer + provenance + per-criterion scores + quality
 * flag. For MCQ: deterministic outcome (read-only — not editable).
 */
export interface GradingReviewQuestion {
  readonly test_set_question_id: string;
  readonly question_id: string;
  readonly question_type: GradingQuestionType;
  readonly display_order?: number;
  readonly prompt?: string;
  readonly grading_dispatch: GradingDispatch;
  readonly points_earned: number;
  readonly points_possible: number;
  /** Original AI composite (preserved when a human overrides the score). */
  readonly ai_points_earned?: number | null;
  readonly score_provenance?: Provenance;
  /** MCQ deterministic outcome. */
  readonly correct?: boolean | null;
  readonly learner_answer?: GradingLearnerAnswer;
  /** Current per-question grader comment (ALWAYS present for graded OE). */
  readonly comment?: string | null;
  /** Original AI comment (preserved when a human edits). */
  readonly ai_comment?: string | null;
  readonly comment_provenance?: Provenance;
  /** True when the evaluator→moderator loop exhausted retries — priority review. */
  readonly quality_flagged?: boolean;
  readonly criterion_scores?: readonly GradingCriterionScore[];
  /** Current canonical model answer (snapshot or instructor-amended). */
  readonly model_answer?: string | null;
  /** Original snapshot model answer (preserved when a human amends). */
  readonly ai_model_answer?: string | null;
  readonly model_answer_provenance?: Provenance;
  readonly rubric?: readonly GradingRubricCriterion[];
}

/** Instructor grading-review view for one submission (R+ grading queue). */
export interface GradingReviewDetail {
  readonly submission_id: string;
  readonly assessment_id: string;
  readonly learner_gcid: string;
  readonly attempt_number?: number;
  readonly state: SubmissionState;
  /** "" = ReviewStatusNotRequired (MCQ-only, no human gate) — see ReviewStatus. */
  readonly review_status: ReviewStatus | '';
  readonly total_points_earned: number;
  readonly total_points_possible: number;
  readonly passing_threshold_percent: number;
  readonly passed?: boolean | null;
  readonly overall_comment?: string | null;
  /** Original AI-drafted overall comment (preserved when a human edits). */
  readonly ai_overall_comment?: string | null;
  readonly overall_comment_provenance?: Provenance;
  readonly approved_by_gcid?: string | null;
  readonly approved_at?: string | null;
  readonly questions: readonly GradingReviewQuestion[];
}

// ── Request / response payloads (mirror OpenAPI) ──

/** One per-question override in an EditGradesRequest. */
export interface QuestionGradeEdit {
  readonly test_set_question_id: string;
  /** New score (≤ points_possible). Omit to leave unchanged. */
  readonly points_earned?: number | null;
  /** New per-question comment. Omit to leave unchanged. */
  readonly comment?: string | null;
  /** Corrected canonical model answer. Present → also emits model_answer_amended.v1. */
  readonly model_answer?: string | null;
  /** Optional override rationale (recorded in the grade_overrides audit). */
  readonly reason?: string | null;
}

/** PATCH .../grades body. */
export interface EditGradesRequest {
  readonly question_edits: readonly QuestionGradeEdit[];
}

/** PATCH .../overall-comment body. */
export interface EditOverallCommentRequest {
  readonly overall_comment: string;
  readonly reason?: string | null;
}

/** POST .../approve-all body. */
export interface ApproveAllRequest {
  /** When true, chain directly to release-results (approve-and-release). */
  readonly release?: boolean;
  /** Only used when release=true. */
  readonly release_announcement?: string | null;
}

/** POST .../approve-all response. */
export interface ApproveAllResponse {
  readonly assessment_id: string;
  readonly approved_submission_count: number;
  /** Submissions skipped (still PENDING_OE_GRADING / not graded). */
  readonly skipped_submission_ids?: readonly string[];
  readonly released: boolean;
}

// ── AsyncState discriminated unions (fail-loud per chora-web CLAUDE.md §3) ──

/**
 * Grading-detail load state for one submission. Carries an `idle` arm so the
 * panel can render nothing before a row is selected (the queue list is the
 * resting view).
 */
export type GradingDetailLoadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly detail: GradingReviewDetail }
  | { readonly status: 'error'; readonly error: string };

/** Per-submission edit/approve mutation state (grades / overall-comment / approve). */
export type GradingMutationState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly detail: GradingReviewDetail }
  | { readonly status: 'error'; readonly error: string };

/**
 * Per-submission approve mutation state. The success arm carries the resulting
 * wire review_status echoed by the approve endpoint ("" | PENDING_REVIEW |
 * APPROVED) so the panel can tell a REAL approval (→ APPROVED) from a BE no-op
 * (an MCQ-only / already-RELEASED submission returns unchanged, review_status
 * "") and NOT toast a false "approved" (CHO-2343 bug #2).
 */
export type ApproveSubmissionState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly reviewStatus: ReviewStatus | '' }
  | { readonly status: 'error'; readonly error: string };

/** Assessment-wide approve-all / approve-and-release mutation state. */
export type ApproveAllState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly result: ApproveAllResponse }
  | { readonly status: 'error'; readonly error: string };

/** Release-results mutation state for the grading queue. */
export type ReleaseResultsState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success' }
  | { readonly status: 'error'; readonly error: string };

// ── Pure helper functions (testable in isolation) ──

/**
 * Whether the provenance of an artifact is a human override. Drives the
 * 'Human reviewer' badge (vs the default 'AI' badge).
 */
export function isHumanProvenance(p: Provenance | undefined): boolean {
  return p === 'HUMAN';
}

/**
 * i18n key fragment for a provenance badge — append to
 * `rplus.grading_queue.provenance_`. Defaults to AI when unset (the
 * contract default before any human edit).
 */
export function provenanceBadgeKey(p: Provenance | undefined): string {
  return isHumanProvenance(p) ? 'human' : 'ai';
}

/**
 * Whether a single submission's grading is approved (gates release per row).
 */
export function isSubmissionApproved(
  detail: GradingReviewDetail | null,
): boolean {
  return detail?.review_status === 'APPROVED';
}

/** Whether a normalised gate is an instructor-approved submission. */
export function isReviewGateApproved(gate: ReviewGateState): boolean {
  return gate === 'APPROVED';
}

/**
 * Whether the 'Release results' action is enabled for the grading queue.
 * Gate (ADR-172, CHO-2343): a graded submission blocks release ONLY while it is
 * still PENDING_REVIEW. NOT_REQUIRED (MCQ-only, auto-released) and APPROVED rows
 * are both release-ready, so they never block. A submission is "graded" when its
 * state is GRADED or RELEASED; IN_PROGRESS / SUBMITTED / GRADING are ignored.
 * Requires at least one graded submission to enable.
 */
export function isReleaseEnabledForQueue(
  rows: readonly GradingQueueRow[],
): boolean {
  const graded = rows.filter((r) => isGradedState(r.state));
  if (graded.length === 0) return false;
  return graded.every((r) => !isReviewGatePending(r.review_gate));
}

/** Whether a submission state counts as "graded" for the release gate. */
export function isGradedState(state: SubmissionState): boolean {
  return state === 'GRADED' || state === 'RELEASED';
}

/**
 * A flattened row used by the grading-queue list. Derived from a Submission
 * (from the monitor's submissions list) — captures only the fields the queue
 * row needs for display + gating.
 */
export interface GradingQueueRow {
  readonly submission_id: string;
  readonly learner_gcid: string;
  readonly learner_display_name?: string;
  readonly state: SubmissionState;
  /**
   * Normalised review gate (CHO-2343). NOT_REQUIRED distinguishes MCQ-only
   * auto-graded rows (wire review_status "") from PENDING_REVIEW so they never
   * render as pending, offer Approve, or count as awaiting approval.
   */
  readonly review_gate: ReviewGateState;
}
