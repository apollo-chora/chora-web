/**
 * CourseLearnService — A+ course-learn provider.
 *
 * Thin BFF wrapper for
 *   GET /api/v1/me/learning-paths?course_id={courseId}
 *
 * Real wiring per [[feedback-no-stubs-real-wiring]] — no synthesized
 * polling, no in-memory fixtures. The component owns the polling cadence
 * + state machine; the service simply issues a single HTTP request.
 *
 * Per chora-web CLAUDE.md §3 (BFF-Only API Calls) all calls go through
 * `BffClientService`.
 */
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  CourseLearnResponse,
  CourseTitleSummary,
  MyEnrolmentsResponse,
} from './course-learn.model';

@Injectable({ providedIn: 'root' })
export class CourseLearnService {
  private readonly bff = inject(BffClientService);

  /**
   * Issue a single GET against the BFF proxy of
   *   chora-consumption /api/v1/me/learning-paths?course_id={id}.
   *
   * The caller is responsible for retrying on 404 (not-yet-bootstrapped)
   * and escalating to a fail-loud banner on 401/403/other 4xx.
   */
  getMyLearningPathByCourse(
    courseId: string,
  ): Observable<CourseLearnResponse> {
    return this.bff.get<CourseLearnResponse>(
      '/api/v1/me/learning-paths?course_id=' + encodeURIComponent(courseId),
    );
  }

  /**
   * Issue a single GET against the BFF proxy of
   *   chora-delivery /api/v1/me/enrolments?course_id={id}.
   *
   * Used by the component ONLY to disambiguate a 404-the-whole-window
   * learning-path poll: an enrolment row present → the path is merely still
   * bootstrapping (OPEN-4 'provisioning'); absent → genuinely not enrolled.
   * The caller treats any error as "can't confirm" and degrades to 'timeout'
   * rather than a false "not enrolled".
   */
  getMyEnrolments(courseId: string): Observable<MyEnrolmentsResponse> {
    return this.bff.get<MyEnrolmentsResponse>(
      '/api/v1/me/enrolments?course_id=' + encodeURIComponent(courseId),
    );
  }

  /**
   * Resolve the authoritative human-readable course name from the chora-delivery
   * catalog row
   *   GET /api/courses/{id}
   * (the same route the sibling course-detail page reads). Used ONLY to fix the
   * course-learn heading: the learning-path DTO's `title` is a "Course <uuid>"
   * bootstrap placeholder when the consumption course_directory projection has
   * not resolved the real name. The caller treats any error as a best-effort
   * miss and degrades to a generic label — never the raw UUID.
   */
  getCourseTitle(courseId: string): Observable<CourseTitleSummary> {
    return this.bff.get<CourseTitleSummary>(
      '/api/courses/' + encodeURIComponent(courseId),
    );
  }
}
