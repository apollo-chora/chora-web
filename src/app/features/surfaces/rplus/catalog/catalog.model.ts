/**
 * Catalog model — R+ Stage 3 wave 2.
 *
 * Domain vocabulary anchors:
 *   - `Course` — a deliverable curriculum (Content Delivery aggregate)
 *   - `Cohort` — instance of a Course (e.g., DSA-101-2026-A)
 *   - `LearningAtom` — smallest content unit (Content Creation root,
 *     queried by Courses but never owned).
 *
 * Wave 2 ports `rplus-course-catalog-admin.html` into a typed mock.
 * The Stitch HTML uses a magenta accent (`#ec4899`) inherited from C+;
 * this surface is R+ Rhythm+ so all accent classes route through the
 * amber `surface-rplus` accent (`#b45309` / `#ea580c`).
 */

export type CatalogStatus =
  | 'Draft'
  | 'Awaiting Review'
  | 'Published'
  | 'Archived';

/**
 * Backend `state` values the catalog list can be filtered by. Distinct from
 * `CatalogStatus` (the FE display label) — these are the raw CJ#2 wire states
 * the `GET /api/v1/courses?state=` param accepts. The catalog defaults to
 * PUBLISHED but the admin can switch to view DRAFT / AWAITING_REVIEW /
 * ARCHIVED courses (J1 / CHO-1829 draft-visibility fix).
 */
export type CourseStateFilter =
  | 'PUBLISHED'
  | 'DRAFT'
  | 'AWAITING_REVIEW'
  | 'ARCHIVED';

/** Ordered status-filter options for the catalog header control. */
export const CATALOG_STATE_FILTERS: readonly CourseStateFilter[] = [
  'PUBLISHED',
  'DRAFT',
  'AWAITING_REVIEW',
  'ARCHIVED',
];

export interface CatalogCourse {
  /** Stable course id (e.g., `cspo-2026`). */
  readonly courseId: string;
  /** Course title (e.g., `Certified Scrum Product Owner`). */
  readonly title: string;
  /** Short course code (e.g., `CSPO`). */
  readonly code: string;
  /** Short marketing description for the card body. */
  readonly summary: string;
  /** Publication status badge. */
  readonly status: CatalogStatus;
  /** Number of cohorts queried under this course. */

  /** Number of `LearningAtom`s referenced by this course. */
  readonly atomCount: number;

  /** Owning instructor display name (e.g., `Mr. Chen`). */
  readonly owner: string;
  /** Last update timestamp string (e.g., `2h ago`). */
  readonly lastUpdated: string;
}

export interface CatalogList {
  /** Tenant display name (header pill). */
  readonly tenantName: string;
  /** Total course count for the badge. */
  readonly totalCourses: number;
  /** Catalog rows. */
  readonly courses: readonly CatalogCourse[];
}

export function statusBadgeVariant(
  status: CatalogStatus,
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
