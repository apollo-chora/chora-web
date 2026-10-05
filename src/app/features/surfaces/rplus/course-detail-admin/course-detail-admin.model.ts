/**
 * Course Detail Admin model — R+ Stage 3 wave 3.
 *
 * Per-course admin view at `/r/catalog/:courseId` — instructor drills
 * down from `/r/catalog` or `/r/rostering` to inspect a single course.
 *
 * Used during Phyllis Step 10 cert-preview workflow when Mr. Chen
 * checks the CSPO atom list before issuing the certificate.
 *
 * Domain vocabulary anchors:
 *   - `Course` (Content Delivery aggregate — queries `LearningAtom`s)
 *   - `LearningAtom` (Content Creation primary aggregate root)
 *   - `Cohort` (instance of a Course)
 *   - `Certification` (issued on completion)
 */

export type CourseStatus =
  | 'Draft'
  | 'Awaiting Review'
  | 'Published'
  | 'Archived';

export type AtomStatus = 'Draft' | 'Published';

export interface CourseAtom {
  /** Stable LearningAtom id. */
  readonly atomId: string;
  /** Author-facing title. */
  readonly title: string;
  /** Display position in the published course order (1-based). */
  readonly position: number;
  /** Atom publication status. */
  readonly status: AtomStatus;
  /** Tag chips for the course outline (e.g., `Sprint Events`). */
  readonly topic: string;
  /** Estimated time-to-complete in minutes. */
  readonly estimatedMinutes: number;
}


export interface CourseKpis {
  /**
   * Enrolled learners. The ONLY KPI this screen can honestly show:
   * `GET /api/v1/rosters/{courseId}` serves it and 3b wires it. The
   * former `completed` and `avgScorePercent` are gone (R1 slice 3a):
   * both were hardcoded 0 and nothing on the wire answers either, the
   * only completion figures being learner-scoped and enrolment-gated.
   */
  readonly enrolled: number;
}

export interface CourseDetailAdmin {
  readonly courseId: string;
  readonly title: string;
  readonly code: string;
  readonly version: string;
  readonly status: CourseStatus;
  readonly author: string;
  readonly summary: string;
  readonly kpis: CourseKpis;
  /**
   * Enrolled learner sample (Phyllis appears here when viewing CSPO).
   * Drives the cohort-roster preview at the bottom of the page.
   */
  readonly enrolledLearners: readonly EnrolledLearnerSummary[];
}

export interface EnrolledLearnerSummary {
  /** GCID — opaque UUIDv7 displayed truncated. */
  readonly gcid: string;
  readonly displayName: string;
  /** Progress percent across the course's atoms (0..100). */
  readonly progressPercent: number;
  readonly cohortName: string;
}



/**
 * Reorder helper for drag-or-keyboard atom list moves.
 *
 * Pure function; immutable input. Returns a new array with `atomId`
 * relocated `delta` positions from its current index (negative = up).
 * Out-of-range deltas clamp to the array bounds. If `atomId` is
 * absent, returns the input unchanged.
 */
export function reorderAtoms(
  atoms: readonly CourseAtom[],
  atomId: string,
  delta: number,
): readonly CourseAtom[] {
  const idx = atoms.findIndex((a) => a.atomId === atomId);
  if (idx < 0) return atoms;
  const target = Math.max(0, Math.min(atoms.length - 1, idx + delta));
  if (target === idx) return atoms;
  const copy = atoms.slice();
  const [moved] = copy.splice(idx, 1);
  copy.splice(target, 0, moved);
  // Re-stamp 1-based positions
  return copy.map((a, i) => ({ ...a, position: i + 1 }));
}

export function courseStatusBadgeVariant(
  status: CourseStatus,
): 'badge-success' | 'badge-warning' | 'badge-neutral' | 'badge-info' {
  switch (status) {
    case 'Published':
      return 'badge-success';
    case 'Draft':
      return 'badge-warning';
    case 'Awaiting Review':
      return 'badge-info';
    case 'Archived':
      return 'badge-neutral';
  }
}
