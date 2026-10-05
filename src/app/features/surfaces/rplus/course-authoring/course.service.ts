/**
 * CourseService — CJ#2 (Course authoring + R+ review/release).
 *
 * Sole BFF adapter for the 7-endpoint Course aggregate at
 * `chora-contracts/openapi/delivery-courses.yaml`:
 *
 *   createCourse    POST   /api/v1/courses
 *   listCourses     GET    /api/v1/courses?state=
 *   getCourse       GET    /api/v1/courses/{id}
 *   updateCourse    PATCH  /api/v1/courses/{id}
 *   publishCourse   POST   /api/v1/courses/{id}/publish     DRAFT → AWAITING_REVIEW
 *   releaseCourse   POST   /api/v1/courses/{id}/release     AWAITING_REVIEW → PUBLISHED
 *   rejectCourse    POST   /api/v1/courses/{id}/reject      AWAITING_REVIEW → DRAFT
 *
 * Per chora-web CLAUDE.md §3: all HTTP via BffClientService.
 * Per `feedback_no_stubs_real_wiring`: no fixtures, fail-loud on 5xx.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  type Course,
  type CourseList,
  type CourseState,
  type CreateCourseRequest,
  type RejectCourseRequest,
  type ReleaseCourseRequest,
  type UpdateCourseRequest,
} from './course-authoring.model';

const PATH = '/api/v1/courses';

const ALL_AUTHORED_STATES: readonly CourseState[] = [
  'DRAFT',
  'AWAITING_REVIEW',
  'PUBLISHED',
  'ARCHIVED',
];

interface ListCoursesQuery {
  readonly state: CourseState;
  readonly cursor?: string;
  readonly page_size?: number;
}

@Injectable({ providedIn: 'root' })
export class CourseService {
  private readonly bff = inject(BffClientService);

  createCourse(req: CreateCourseRequest): Observable<Course> {
    return this.bff.post<Course>(PATH, req);
  }

  listCourses(q: ListCoursesQuery): Observable<CourseList> {
    let params = new HttpParams().set('state', q.state);
    if (q.cursor) params = params.set('cursor', q.cursor);
    if (q.page_size) params = params.set('page_size', String(q.page_size));
    return this.bff.get<CourseList>(PATH, params);
  }

  getCourse(courseId: string): Observable<Course> {
    return this.bff.get<Course>(`${PATH}/${encodeURIComponent(courseId)}`);
  }

  updateCourse(courseId: string, req: UpdateCourseRequest): Observable<Course> {
    return this.bff.patch<Course>(
      `${PATH}/${encodeURIComponent(courseId)}`,
      req,
    );
  }

  publishCourse(courseId: string): Observable<Course> {
    return this.bff.post<Course>(
      `${PATH}/${encodeURIComponent(courseId)}/publish`,
      {},
    );
  }

  releaseCourse(courseId: string, req: ReleaseCourseRequest): Observable<Course> {
    return this.bff.post<Course>(
      `${PATH}/${encodeURIComponent(courseId)}/release`,
      req,
    );
  }

  rejectCourse(courseId: string, req: RejectCourseRequest): Observable<Course> {
    return this.bff.post<Course>(
      `${PATH}/${encodeURIComponent(courseId)}/reject`,
      req,
    );
  }

  /**
   * Fan-out 4 listCourses calls (one per state) + merge into a single
   * author-scoped list, sorted by created_at desc. The BE filters by
   * caller GCID for non-admin roles; we also client-side filter by
   * `authorGcid` as defensive depth so a misbehaving BE projection
   * doesn't leak other instructors' drafts into Phyllis's panel.
   */
  listAuthoredCourses(authorGcid: string): Observable<readonly Course[]> {
    const perState = ALL_AUTHORED_STATES.map((state) =>
      this.listCourses({ state, page_size: 100 }),
    );
    return forkJoin(perState).pipe(
      map((results) => {
        const merged = results.flatMap((r) => r.items);
        const mine = merged.filter((c) => c.author_gcid === authorGcid);
        return [...mine].sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        );
      }),
    );
  }
}
