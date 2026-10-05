/**
 * RosterByCourse model — R+ /r/rosters/:courseId surface (M4).
 *
 * Course-centric roster view. One row per learner enrolled in the course,
 * plus the course id + a convenience total. Sourced live from
 * GET /api/v1/rosters/{courseId} via chora-delivery's roster_handler.go.
 *
 * The DisplayName + ProgressPct fields are placeholders today:
 *   - displayName falls back to the GCID until the chora-identity
 *     projection lands.
 *   - progressPct defaults to 0 until the chora-consumption projection
 *     lands.
 *
 * Both are rendered visibly per `feedback_no_stubs_real_wiring` so the
 * unwired-projection state is observable, not hidden behind faked data.
 */

export interface RosterLearner {
  readonly gcid: string;
  /** Falls back to gcid when the chora-identity projection is unwired. */
  readonly displayName: string;
  /** AtomAttempt proxy in [0, 100]; 0 when chora-consumption projection unwired. */
  readonly progressPct: number;
  /** RFC3339 timestamp from the backend (kept as-is for FE locale formatting). */
  readonly enrolledAt: string;
}

export interface CourseRoster {
  readonly courseId: string;
  readonly tenantId: string;
  readonly learners: readonly RosterLearner[];
  readonly learnerCount: number;
}

/**
 * Empty roster constant for the initial-render branch of the BFF subscription.
 * Kept as a named export so the component template can render a stable
 * empty-state without `null`-guards on every field access.
 */
export const EMPTY_ROSTER: CourseRoster = {
  courseId: '',
  tenantId: '',
  learners: [],
  learnerCount: 0,
};
