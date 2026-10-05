/**
 * CourseLearn types — response shape for
 *   GET /api/v1/me/learning-paths?course_id={id}
 *
 * The BE handler lives at
 *   services/chora-consumption/internal/adapter/http/me_handlers.go
 * and was shipped in commit `a9677d44` (per
 * `docs/RESUME_PROMPT_HPLUS_TXHISTORY_AND_OPEN_COURSE_2026-05-26.md` §4).
 *
 * Bootstrap semantics:
 *   - 404 PATH_NOT_BOOTSTRAPPED   → poll continues (5-15s typical Pub/Sub
 *                                    round-trip; up to ~30s under cold-start)
 *   - 200 hydrated detail         → render the atoms list
 *
 * Per-atom state is derived from `current_index` on the LearningPath row:
 *   - atom.order < current_index   → 'completed'
 *   - atom.order === current_index → 'in_progress'
 *   - atom.order > current_index   → 'not_started'
 *
 * Atom titles are denormalised at bootstrap time from `AtomIndex` (local
 * skinny projection in chora_consumption, hydrated from
 * `chora.creation.atom.created.v1` events) — NO cross-DB query happens at
 * request time. See `feedback_no_stubs_real_wiring` + ddd-enforcement.
 */

export type CourseLearnAtomState =
  | 'completed'
  | 'in_progress'
  | 'not_started';

export type CourseLearnMode = 'straight_up';

export interface CourseLearnAtom {
  readonly atom_id: string;
  readonly title: string;
  readonly order: number;
  readonly state: CourseLearnAtomState;
  readonly completed_at: string | null;
}

export interface CourseLearnResponse {
  readonly learning_path_id: string;
  readonly course_id: string;
  readonly title: string;
  readonly mode: CourseLearnMode;
  readonly bootstrapped_at: string;
  readonly current_index: number;
  readonly total_atoms: number;
  /**
   * How MANY atoms are finished. 🔴 CHO-2169: this was declared `completed:
   * number` and read the wire's `completed`, which is the path-level BOOLEAN
   * below. TypeScript cannot type-check a JSON body at runtime, so the learner
   * was shown a literal "false / 5 completed" and the progress bar computed
   * `false / 5`.
   *
   * The two fields answer different questions and must never be confused again:
   * `completed_atoms` = how many are done; `completed` = is the whole path done.
   */
  readonly completed_atoms: number;
  /** Is the WHOLE path finished. Not a count — see completed_atoms. */
  readonly completed: boolean;
  readonly atoms: readonly CourseLearnAtom[];
}

/**
 * Minimal shape of GET /api/v1/me/enrolments?course_id={id}. We only need to
 * know whether an enrolment row exists for the displayed course — the full
 * payload (Stripe session, certificate, etc.) is irrelevant here. Mirrors the
 * load-time check in course-detail.service.ts.
 */
export interface CourseLearnEnrolmentSummary {
  readonly course_id: string;
}

export interface MyEnrolmentsResponse {
  readonly items: readonly CourseLearnEnrolmentSummary[];
}

/**
 * Minimal shape of GET /api/courses/{id} — the chora-delivery catalog row the
 * sibling course-detail page reads (see course-detail.service.ts). The
 * course-learn heading only needs the authoritative human-readable `title`; the
 * rest of the CourseDetail payload (price, tags, instructor, …) is irrelevant.
 * Used to resolve the real course name when the learning-path DTO carries the
 * "Course <uuid>" bootstrap placeholder (course_directory projection unresolved).
 */
export interface CourseTitleSummary {
  readonly title: string;
}

/**
 * Discriminated load state for the polling component.
 *
 *   polling      → 404 not-yet-ready, keep retrying (capped by
 *                  MAX_POLL_ATTEMPTS)
 *   ready        → 200 hydrated, render the atom list
 *   provisioning → 404 the entire window BUT /me/enrolments confirms an
 *                  enrolment exists — the LearningPath bootstrap is just slow
 *                  (eventual Pub/Sub round-trip). Encouraging "enrolment
 *                  confirmed — setting up" copy + a "check again" CTA. This is
 *                  the OPEN-4 fix: never accuse a genuinely-enrolled learner
 *                  of "not enrolled" just because bootstrap outran the window.
 *   not_enrolled → 404 the entire window AND /me/enrolments has no row for
 *                  this course — a genuinely-unenrolled learner.
 *   timeout      → polling window expired without a 200 from a non-404 cause
 *                  (transient 5xx the whole window), OR the /me/enrolments
 *                  disambiguation call itself failed (can't confirm enrolment
 *                  — show neutral "taking longer", never a false accusation)
 *   error        → unrecoverable error (401/403/4xx ≠ 404 / contract drift)
 */
export type CourseLearnLoadState =
  | { status: 'polling'; tickIndex: number }
  | { status: 'ready'; data: CourseLearnResponse }
  | { status: 'provisioning' }
  | { status: 'not_enrolled' }
  | { status: 'timeout' }
  | { status: 'error'; error: string };
