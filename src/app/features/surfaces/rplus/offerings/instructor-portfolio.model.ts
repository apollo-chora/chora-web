/**
 * Instructor portfolio model - the honest header behind the R+ landing (R4,
 * CHO-2269).
 *
 * When the Offerings finder became the R+ in-surface landing, it absorbed the
 * retired Rostering dashboard as a portfolio header. That dashboard rendered
 * at-risk / completion / attendance figures that the backend never returned
 * (publicCourseDTO carries none) - they were hardcoded zeros. This model
 * deliberately carries ONLY the fields the GET /api/v1/instructors/{gcid}/
 * courses read actually provides, so there is no fabricated metric to promote
 * to the landing.
 *
 * `learnerCount` sums enrolled counts over the courses that loaded. When the
 * backend reports more courses than one page returned, the sum is a floor, not
 * the truth, and `learnerCountIsLowerBound` says so - a paged undercount is
 * never presented as an exact fact.
 */
export interface InstructorPortfolio {
  /** Display name of the signed-in instructor whose portfolio this is. */
  readonly instructorName: string;
  /** Total courses the instructor owns (the backend total, across all pages). */
  readonly courseCount: number;
  /** Sum of enrolled learners across the loaded courses. */
  readonly learnerCount: number;
  /**
   * True when fewer courses loaded than `courseCount`, so `learnerCount` is a
   * lower bound (the loaded page undercounts the full portfolio).
   */
  readonly learnerCountIsLowerBound: boolean;
}
