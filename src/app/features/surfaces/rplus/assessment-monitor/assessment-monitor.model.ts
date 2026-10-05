/**
 * Assessment Monitor model — R+ Phase X.5 (ADR-155 D7 + D8 + D9).
 *
 * Wires the instructor-facing R+ surfaces for monitoring active assessments
 * and releasing results to learners. Mirrors the wire shape EXACTLY from
 * `chora-contracts/openapi/delivery-assessments.yaml` (snake_case as
 * chora-delivery serialises). No fields are invented — fail-loud per
 * `feedback_no_stubs_real_wiring`.
 *
 * Routes hosted here:
 *   - `/r/assessments`              → AssessmentListComponent
 *   - `/r/assessments/:id/monitor`  → AssessmentMonitorComponent
 *
 * BFF routes hit (via BffClientService, gateway prefix `/api/`):
 *   - GET  /api/v1/assessments                                  → listAssessments
 *   - GET  /api/v1/assessments/{id}                             → getAssessment
 *   - GET  /api/v1/assessments/{id}/monitor                     → getAssessmentMonitor
 *   - GET  /api/v1/assessments/{id}/submissions                 → listAssessmentSubmissions
 *   - POST /api/v1/assessments/{id}/publish                     → publishAssessment
 *   - POST /api/v1/assessments/{id}/force-close                 → forceCloseAssessment
 *   - POST /api/v1/assessments/{id}/release-results             → releaseAssessmentResults
 *   - POST /api/v1/assessments/{id}/archive                     → archiveAssessment
 *
 * Per ADR-155 D9 the release-results action flips per-submission visibility
 * ATOMICALLY for all submitted learners; non-submitters see nothing different.
 */

// ── FSM enums (mirror OpenAPI AssessmentState + SubmissionState) ──

/** Assessment lifecycle state (FSM). See ADR-155 D7. */
export type AssessmentState =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'OPEN'
  | 'CLOSED'
  | 'GRADING'
  | 'GRADED'
  | 'RELEASED'
  | 'ARCHIVED';

/** Submission lifecycle state (FSM). See ADR-155 D7. */
export type SubmissionState =
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'GRADING'
  | 'GRADED'
  | 'RELEASED'
  | 'ARCHIVED';

/** Filter chip key set for the assessment list page. */
export type AssessmentFilterChip =
  | 'ALL'
  | 'DRAFT'
  | 'OPEN'
  | 'CLOSED'
  | 'RELEASED'
  | 'ARCHIVED';

/** Ordered list of filter chips rendered on `/r/assessments`. */
export const ASSESSMENT_FILTER_CHIPS: readonly AssessmentFilterChip[] = [
  'ALL',
  'DRAFT',
  'OPEN',
  'CLOSED',
  'RELEASED',
  'ARCHIVED',
] as const;

// ── Aggregate DTO shapes (mirror OpenAPI components.schemas) ──

/** Per-assessment grading config snapshot — captured at create time. */
export interface GradingConfigSnapshot {
  readonly mcq_dispatch?: 'DETERMINISTIC';
  readonly oe_dispatch?: 'LLM_EVALUATOR_AGENT';
  readonly llm_evaluator_model_tier?: 'T1' | 'T2';
  readonly passing_threshold_percent?: number;
  readonly per_question_feedback_enabled?: boolean;
  readonly auto_release?: boolean;
}

/** Real wire DTO for an Assessment aggregate root. */
export interface Assessment {
  readonly assessment_id: string;
  readonly tenant_id: string;
  readonly instructor_gcid: string;
  readonly test_set_id: string;
  readonly test_set_revision_snapshot: number;
  readonly class_id: string | null;
  readonly invited_gcids: readonly string[] | null;
  readonly title: string;
  readonly learner_facing_name: string | null;
  readonly state: AssessmentState;
  readonly scheduled_open_at: string;
  readonly scheduled_close_at: string;
  readonly max_attempts: number;
  readonly shuffle_questions: boolean;
  readonly shuffle_mcq_options: boolean;
  readonly total_points: number;
  readonly question_count: number;
  readonly grading_config_snapshot: GradingConfigSnapshot;
  readonly deleted_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly published_at: string | null;
  readonly closed_at: string | null;
  readonly released_at: string | null;
  readonly archived_at: string | null;
}

/** Paginated list response (cursor). */
export interface AssessmentListResponse {
  readonly items: readonly Assessment[];
  readonly next_page_token: string | null;
  readonly total: number | null;
}

/** Per-question pass-rate row — empty during OPEN/CLOSED per spec. */
export interface PerQuestionPassRate {
  readonly test_set_question_id: string;
  readonly question_id: string;
  readonly pass_rate: number;
  readonly answered_count: number;
}

/** Monitor envelope (real wire shape per `getAssessmentMonitor`). */
export interface AssessmentMonitor {
  readonly assessment_id: string;
  readonly state: AssessmentState;
  readonly total_invited: number;
  readonly total_started: number;
  readonly total_submitted: number;
  readonly total_graded: number;
  readonly in_progress_count: number;
  readonly total_released: number;
  readonly average_score_percent: number | null;
  readonly median_score_percent: number | null;
  readonly passed_count: number | null;
  readonly failed_count: number | null;
  readonly per_question_pass_rate: readonly PerQuestionPassRate[];
}

/** Per-submission answer row (echoed for instructor review). */
export interface SubmissionAnswer {
  readonly test_set_question_id: string;
  readonly question_id: string;
  readonly mcq_choice_id: string | null;
  readonly mcq_choice_ids: readonly string[] | null;
  readonly oe_response_text: string | null;
  readonly answered_at: string | null;
}

/** Real wire DTO for a Submission row in the instructor review list. */
export interface Submission {
  readonly submission_id: string;
  readonly assessment_id: string;
  readonly tenant_id: string;
  readonly learner_gcid: string;
  readonly attempt_number: number;
  readonly state: SubmissionState;
  readonly opens_at?: string;
  readonly closes_at?: string;
  readonly time_limit_seconds?: number;
  readonly time_remaining_seconds?: number;
  readonly started_at: string;
  readonly submitted_at: string | null;
  readonly last_saved_at: string | null;
  readonly answers: readonly SubmissionAnswer[];
  /** Optional learner display name — projection helper from the BFF gateway. */
  readonly learner_display_name?: string;
  /** Optional total-score-earned echo (post-release only). */
  readonly score_percent?: number | null;
  /** OE HITL review gate (ADR-172). Faithfully mirrors the domain value,
   *  including "" (ReviewStatusNotRequired — MCQ-only auto-graded, no human
   *  gate). A graded OE submission stays PENDING_REVIEW until an instructor
   *  approves it, so its score is withheld even when the assessment is RELEASED. */
  readonly review_status?: 'PENDING_REVIEW' | 'APPROVED' | '';
}

/** Paginated submission list. */
export interface SubmissionListResponse {
  readonly items: readonly Submission[];
  readonly next_page_token: string | null;
}

// ── AsyncState discriminated unions (fail-loud per chora-web CLAUDE.md §3) ──

/** Assessment list-load state for `/r/assessments`. */
export type AssessmentListLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly assessments: readonly Assessment[] }
  | { readonly status: 'error'; readonly error: string };

/** Assessment metadata load state. */
export type AssessmentLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly assessment: Assessment }
  | { readonly status: 'error'; readonly error: string };

/** Monitor envelope load state. */
export type MonitorLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly monitor: AssessmentMonitor }
  | { readonly status: 'error'; readonly error: string };

/** Submissions list load state. */
export type SubmissionsLoadState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly submissions: readonly Submission[];
    }
  | { readonly status: 'error'; readonly error: string };

/** Mutation state for one-shot lifecycle CTAs (publish / force-close / release / archive). */
export type AssessmentActionState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly assessment: Assessment }
  | { readonly status: 'error'; readonly error: string };

// ── Test-set / questions panel (instructor review of the assigned content) ──

/** Minimal per-question snapshot the monitor panel reads for its listing. */
export interface MonitorQuestionSnapshot {
  readonly question_type?: 'mcq' | 'oe';
  readonly prompt_preview?: string;
  readonly atom_title?: string;
}

/** Minimal test-set question shape consumed by the monitor's questions panel. */
export interface MonitorTestSetQuestion {
  readonly test_set_question_id: string;
  readonly question_id: string;
  readonly question_atom_id: string;
  readonly question_type?: 'mcq' | 'oe';
  readonly points: number;
  readonly display_order: number;
  readonly snapshot?: MonitorQuestionSnapshot;
}

/** Minimal test-set shape (GET /api/v1/test-sets/{id}) for the monitor panel. */
export interface MonitorTestSet {
  readonly test_set_id: string;
  readonly title: string;
  readonly total_points: number;
  readonly question_count: number;
  readonly questions: readonly MonitorTestSetQuestion[];
}

/** Test-set load state for the monitor's questions panel (idle until assessment resolves its test_set_id). */
export type MonitorTestSetLoadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly testSet: MonitorTestSet }
  | { readonly status: 'error'; readonly error: string };

// ── Helper functions ──

/**
 * Filter an assessment array by chip. ALL passes everything; specific chips
 * filter on exact state match. Pure helper — testable in isolation.
 */
export function filterAssessmentsByChip(
  assessments: readonly Assessment[],
  chip: AssessmentFilterChip,
): readonly Assessment[] {
  if (chip === 'ALL') return assessments;
  return assessments.filter((a) => a.state === chip);
}

/**
 * Whether the release-results CTA is enabled. Per ADR-155 the CTA shows when
 * state=CLOSED but the brief widens to "show when CLOSED" → disabled when
 * no submissions are submitted yet (zero-submission guard).
 */
export function isReleaseEnabled(monitor: AssessmentMonitor | null): boolean {
  if (!monitor) return false;
  if (monitor.state !== 'CLOSED') return false;
  return monitor.total_submitted > 0;
}

/**
 * Map an FSM state to a presentational badge variant class fragment.
 * Pure helper; testable; UI consumes via direct string append.
 */
export function stateBadgeVariant(state: AssessmentState): string {
  switch (state) {
    case 'DRAFT':
      return 'badge-neutral';
    case 'SCHEDULED':
      return 'badge-info';
    case 'OPEN':
      return 'badge-success';
    case 'CLOSED':
      return 'badge-warning';
    case 'GRADING':
      return 'badge-info';
    case 'GRADED':
      return 'badge-info';
    case 'RELEASED':
      return 'badge-success';
    case 'ARCHIVED':
      return 'badge-neutral';
    default:
      return 'badge-neutral';
  }
}

/** Map a SubmissionState to a presentational badge variant. */
export function submissionStateBadgeVariant(state: SubmissionState): string {
  switch (state) {
    case 'IN_PROGRESS':
      return 'badge-info';
    case 'SUBMITTED':
      return 'badge-warning';
    case 'GRADING':
      return 'badge-info';
    case 'GRADED':
      return 'badge-info';
    case 'RELEASED':
      return 'badge-success';
    case 'ARCHIVED':
      return 'badge-neutral';
    default:
      return 'badge-neutral';
  }
}
