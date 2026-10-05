/**
 * ClassRosterService — R+ /r/roster single-course learner roster (real BFF
 * wiring, no stubs per `feedback_no_stubs_real_wiring`).
 *
 * Per chora-web/CLAUDE.md §3 the only HTTP surface is BffClientService. This
 * screen renders ONE course's enrolled-learner roster. There is no Cohort
 * route param, so the service resolves the course context itself, then fetches
 * that course's roster. Both are real, live-attempted BFF round-trips:
 *
 *   1. GET /api/v1/instructors/{gcid}/courses   (LIVE — proven 200)
 *        → resolve the instructor's first course (id + title + enrolled_count).
 *          The caller GCID comes from AuthService — never a hardcoded fixture.
 *   2. GET /api/v1/rosters/{courseId}           (handler exists, NOT yet wired)
 *        → the per-course learner list. chora-delivery's roster_handler.go
 *          backs this, but the production pg EnrollmentRepo does not implement
 *          ListByCourse, so wireRosters() returns nil and the route 404s today.
 *          When the BE ships, this screen lights up with zero FE changes.
 *
 * Tenant is resolved off the validated mesh claims chora-gateway stamps
 * (RequireChoraSessionJWT); no tenant_id is sent on the wire from the FE.
 *
 * Failure contract (so the component can render honest states, never a fixture):
 *   - No GCID (unauthenticated) → NoCourseError (renders empty-state).
 *   - Instructor has zero courses → NoCourseError (renders empty-state).
 *   - Roster endpoint 404 / 5xx  → the HttpErrorResponse propagates so the
 *     component shows a fail-loud "roster unavailable" banner.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, switchMap, map, throwError } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import type {
  CohortRoster,
  EnrolmentStatus,
  RosterLearner,
} from './class-roster.model';

/** Wire row — chora-delivery instructor_courses_handler.go (PublicCourseDTO). */
interface BackendInstructorCourse {
  readonly id: string;
  readonly tenant_id?: string;
  readonly title: string;
  readonly instructor_name?: string;
  readonly enrolled_count?: number;
}

/** Wire envelope — instructorCoursesHandler `{ items, total, page, per }`. */
interface BackendInstructorCoursesList {
  readonly items?: readonly BackendInstructorCourse[];
  readonly total?: number;
}

/** Wire row — chora-delivery roster_handler.go::courseRosterDTO learner. */
interface BackendRosterLearner {
  readonly gcid: string;
  readonly display_name: string;
  readonly progress_pct: number;
  readonly enrolled_at: string;
}

/** Wire envelope — roster_handler.go::courseRosterDTO. */
interface BackendCourseRoster {
  readonly course_id: string;
  readonly tenant_id: string;
  readonly learners: readonly BackendRosterLearner[];
  readonly learner_count: number;
}

/**
 * Sentinel thrown when there is no course to scope the roster to (no GCID or
 * the instructor owns no courses). The component renders the honest
 * empty-state for this case rather than a fail-loud error banner.
 */
export class NoCourseError extends Error {
  constructor() {
    super('no course available to scope the roster');
    this.name = 'NoCourseError';
  }
}

@Injectable({ providedIn: 'root' })
export class ClassRosterService {
  private readonly bff = inject(BffClientService);
  private readonly auth = inject(AuthService);
  private readonly tenants = inject(TenantContextService);

  /**
   * Fetch the roster for the instructor's first live course.
   *
   * Two chained real BFF calls: resolve the course via the instructor-courses
   * endpoint, then fetch that course's roster. Emits `NoCourseError` (not an
   * HTTP error) when there is no course to scope to; propagates the roster
   * endpoint's HttpErrorResponse otherwise.
   */
  getRoster(): Observable<CohortRoster> {
    const gcid = this.auth.gcid();
    if (!gcid) {
      return throwError(() => new NoCourseError());
    }
    const instructorName =
      this.auth.user()?.displayName ?? 'Current instructor';

    return this.bff
      .get<BackendInstructorCoursesList>(
        `/api/v1/instructors/${encodeURIComponent(gcid)}/courses`,
      )
      .pipe(
        switchMap((list) => {
          const course = (list.items ?? [])[0];
          if (!course) {
            return throwError(() => new NoCourseError());
          }
          return this.fetchCourseRoster(course, instructorName);
        }),
      );
  }

  /**
   * GET /api/v1/rosters/{courseId} and fold the wire envelope together with the
   * already-resolved course context into the typed CohortRoster.
   */
  private fetchCourseRoster(
    course: BackendInstructorCourse,
    instructorName: string,
  ): Observable<CohortRoster> {
    const fallbackTenantId = course.tenant_id ?? this.tenants.tenantId() ?? '';
    return this.bff
      .get<BackendCourseRoster>(
        `/api/v1/rosters/${encodeURIComponent(course.id)}`,
      )
      .pipe(
        map((roster) =>
          buildCohortRoster(course, roster, instructorName, fallbackTenantId),
        ),
      );
  }
}

function buildCohortRoster(
  course: BackendInstructorCourse,
  roster: BackendCourseRoster,
  instructorName: string,
  fallbackTenantId: string,
): CohortRoster {
  const learners = (roster.learners ?? []).map(mapBackendLearner);
  return {
    courseId: roster.course_id || course.id,
    cohortName: course.title,
    courseCode: deriveCode(course.title),
    instructorName: course.instructor_name || instructorName,
    tenantId: roster.tenant_id || fallbackTenantId,
    rosterSize: roster.learner_count ?? learners.length,
    learners,
  };
}

function mapBackendLearner(l: BackendRosterLearner): RosterLearner {
  const progress = Number.isFinite(l.progress_pct) ? l.progress_pct : 0;
  return {
    gcid: l.gcid,
    // displayName falls back to gcid until the chora-identity projection lands.
    displayName: l.display_name || l.gcid,
    avatarUrl: null,
    status: deriveStatus(progress),
    progressPct: progress,
    // The roster endpoint exposes only progress_pct, not per-atom counts, so
    // these stay 0 (rendered visibly) until a count projection lands. NOT
    // fabricated — honest zero per `feedback_no_stubs_real_wiring`.
    atomicSessionsCompleted: 0,
    atomicSessionsTotal: 0,
    // No activity timestamp on the wire yet — fall back to the real enrolment
    // date rather than inventing a "5m ago" string.
    lastActivity: l.enrolled_at,
    enrolledAt: l.enrolled_at,
    // Cert Preview is enabled only when the learner has completed the path.
    certPreviewEnabled: progress >= 100,
  };
}

/**
 * Derive an enrolment status from the progress proxy. Conservative — until a
 * real status projection lands, completion is the only signal we trust:
 *   100% → Completed; everything else → Active (NOT a fabricated "At-risk").
 */
function deriveStatus(progressPct: number): EnrolmentStatus {
  return progressPct >= 100 ? 'Completed' : 'Active';
}

/** Build a short course code from the title (mirrors rostering.service.ts). */
function deriveCode(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length === 0) return '';
  const words = trimmed.split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w));
  if (words.length >= 2) {
    return words
      .map((w) => w[0]!)
      .join('')
      .slice(0, 8)
      .toUpperCase();
  }
  return trimmed.slice(0, 8).toUpperCase();
}
