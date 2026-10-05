/**
 * RosterByCourseService — R+ /r/rosters/:courseId BFF wiring (real, no stubs).
 *
 * Per chora-web/CLAUDE.md §3 the only HTTP surface is BffClientService.
 * The service exposes a single read operation:
 *
 *   getByCourseId(courseId) → GET /api/v1/rosters/{courseId}
 *
 * Tenant is resolved off the validated mesh claims chora-gateway stamps
 * (RequireChoraSessionJWT); no tenant_id is sent on the wire from the FE.
 *
 * Wire envelope from chora-delivery/internal/adapter/http/roster_handler.go:
 *
 *   {
 *     "course_id":     "<UUIDv7>",
 *     "tenant_id":     "<UUIDv7>",
 *     "learners":      [ { gcid, display_name, progress_pct, enrolled_at } ],
 *     "learner_count": <int>
 *   }
 *
 * `learners` is always present (empty array, never null) so the FE binds
 * to the iterable without null-guards. Per `feedback_no_stubs_real_wiring`
 * an empty course renders the empty-state branch, not a fixture.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type { CourseRoster, RosterLearner } from './roster-by-course.model';

interface BackendRosterLearner {
  readonly gcid: string;
  readonly display_name: string;
  readonly progress_pct: number;
  readonly enrolled_at: string;
}

interface BackendCourseRoster {
  readonly course_id: string;
  readonly tenant_id: string;
  readonly learners: readonly BackendRosterLearner[];
  readonly learner_count: number;
}

@Injectable({ providedIn: 'root' })
export class RosterByCourseService {
  private readonly bff = inject(BffClientService);

  /**
   * Fetch the course roster for `courseId`. URL-encodes the path segment
   * so UUIDv7 + future slug-style ids are safe to send verbatim.
   */
  getByCourseId(courseId: string): Observable<CourseRoster> {
    return this.bff
      .get<BackendCourseRoster>(
        `/api/v1/rosters/${encodeURIComponent(courseId)}`,
      )
      .pipe(map(mapBackendCourseRoster));
  }
}

function mapBackendCourseRoster(r: BackendCourseRoster): CourseRoster {
  return {
    courseId: r.course_id,
    tenantId: r.tenant_id,
    learners: r.learners.map(mapBackendLearner),
    learnerCount: r.learner_count,
  };
}

function mapBackendLearner(l: BackendRosterLearner): RosterLearner {
  return {
    gcid: l.gcid,
    displayName: l.display_name,
    progressPct: l.progress_pct,
    enrolledAt: l.enrolled_at,
  };
}
