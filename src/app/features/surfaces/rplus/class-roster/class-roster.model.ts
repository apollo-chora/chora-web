/**
 * Class roster model — R+ /r/roster single-course learner roster (real wiring).
 *
 * Domain vocabulary anchors (per `domain-vocabulary` + `domain-content-delivery`):
 *   - `Cohort`/`Course` — a deliverable `Course/Class` aggregate. The screen
 *     scopes to ONE course (the instructor's first live course) and lists its
 *     enrolled learners.
 *   - `LearningAtom` — smallest content unit (aggregate root)
 *   - `AtomAttempt` - a learner's interaction with a `LearningAtom` (NOT
 *     "test attempt"). Progress is `progressPct` in [0, 100].
 *   - `GCID` — Global Chora ID, cross-tenant portable learner identity
 *   - `Certification` — issued from the Content Delivery domain on cohort
 *     completion (see Certification aggregate)
 *
 * Sourced live from two chora-delivery endpoints via the BFF (no fixtures, per
 * `feedback_no_stubs_real_wiring`):
 *   1. GET /api/v1/instructors/{gcid}/courses  — resolves the course context
 *      (id / title / enrolled_count). LIVE today.
 *   2. GET /api/v1/rosters/{courseId}          — the per-course learner list.
 *      The handler exists in chora-delivery (roster_handler.go) but is NOT yet
 *      wired in production (the pg EnrollmentRepo does not implement
 *      ListByCourse / EnrollmentListByCoursePort, so wireRosters() returns nil
 *      and the route 404s). Until it ships, the screen renders an honest
 *      empty/error state — NEVER a fabricated cohort.
 *
 * The `displayName` + `progressPct` fields are projection placeholders today:
 *   - displayName falls back to the GCID until the chora-identity projection
 *     lands (mirrors roster-by-course.model.ts).
 *   - progressPct defaults to 0 until the chora-consumption projection lands.
 * Both are rendered visibly so the unwired-projection state is observable.
 */

export type EnrolmentStatus =
  | 'Active'
  | 'At-risk'
  | 'Completed'
  | 'Waitlist'
  | 'Withdrawn';

export interface RosterLearner {
  /** Global Chora ID — opaque UUIDv7. */
  readonly gcid: string;
  /** Display name; falls back to gcid when the chora-identity projection is unwired. */
  readonly displayName: string;
  /** Optional avatar (initials fallback when null). */
  readonly avatarUrl: string | null;
  /** Enrolment status badge. Defaults to `Active` until a status projection lands. */
  readonly status: EnrolmentStatus;
  /**
   * AtomAttempt proxy in [0, 100]; 0 until the chora-consumption projection
   * lands. Optional so the shared CertPreviewModal can build a learner literal
   * without it (the modal renders counts, not the percent).
   */
  readonly progressPct?: number;
  /**
   * Completed AtomAttempt count. The roster endpoint exposes no per-atom
   * count yet, so this stays 0 — retained because the shared CertPreviewModal
   * renders an "atoms mastered" figure.
   */
  readonly atomicSessionsCompleted: number;
  /** Total AtomAttempt count for the course. 0 until the count projection lands. */
  readonly atomicSessionsTotal: number;
  /**
   * Human-readable last-activity proxy. The roster endpoint exposes no
   * activity timestamp yet, so this defaults to the enrolment date until the
   * chora-consumption activity projection lands (kept for the shared
   * CertPreviewModal + the roster row).
   */
  readonly lastActivity: string;
  /**
   * RFC3339 enrolment timestamp from the backend (kept as-is for FE locale
   * formatting). Optional so the shared CertPreviewModal can build a learner
   * literal without it.
   */
  readonly enrolledAt?: string;
  /** Whether the per-row Cert Preview CTA is enabled (100% complete). */
  readonly certPreviewEnabled: boolean;
}

export interface CohortRoster {
  /** Course identifier (UUIDv7) the roster is scoped to. */
  readonly courseId: string;
  /** Course display name (real title from the instructor-courses endpoint). */
  readonly cohortName: string;
  /** Short code derived from the course title for the breadcrumb. */
  readonly courseCode: string;
  /** Instructor display name (resolved off AuthService — never a hardcoded name). */
  readonly instructorName: string;
  /** Tenant id echoed by the roster endpoint (for FE audit display). */
  readonly tenantId: string;
  /** Roster size — number of enrolled learners. */
  readonly rosterSize: number;
  /** Roster rows. */
  readonly learners: readonly RosterLearner[];
}

/**
 * Empty roster sentinel for the initial-render / no-course branch. Kept as a
 * named export so the template renders a stable empty-state without null-guards
 * on every field access.
 */
export const EMPTY_COHORT_ROSTER: CohortRoster = {
  courseId: '',
  cohortName: '',
  courseCode: '',
  instructorName: '',
  tenantId: '',
  rosterSize: 0,
  learners: [],
};

export type RosterSortKey = 'name' | 'progress' | 'status' | 'enrolled-at';

export type SortDirection = 'asc' | 'desc';

/**
 * Clamp a progress percent into [0, 100] for the meter rendering. Defensive —
 * the backend validates the range, but we guard the CSS width binding so a
 * stray value from a future projection doesn't overflow the bar.
 */
export function clampProgress(p: number): number {
  if (!Number.isFinite(p)) return 0;
  if (p < 0) return 0;
  if (p > 100) return 100;
  return Math.round(p);
}
