/**
 * InstructorPortfolioService - the honest portfolio header behind the R+
 * landing (R4, CHO-2269).
 *
 * Reads GET /api/v1/instructors/{instructor_gcid}/courses (the same live read
 * the retired Rostering dashboard used, proxied by chora-gateway
 * ListInstructorCourses) and maps it to an `InstructorPortfolio` carrying only
 * the fields the backend actually returns. The caller GCID comes from
 * AuthService - no hardcoded fixture.
 *
 * It requests `per=200` (the endpoint's max page) because a portfolio header
 * wants the WHOLE portfolio in one shot; the backend `total` then lets it
 * report the true course count and flag a learner sum that a page cap would
 * undercount. When the caller has no GCID (unauthenticated) it returns an
 * empty portfolio and fires no request - the header hides on an empty
 * portfolio, so an anonymous or non-teaching session sees the finder unchanged.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable, map, of } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { AuthService } from '../../../../core/auth/auth.service';
import type { InstructorPortfolio } from './instructor-portfolio.model';

/** One course row from GET /api/v1/instructors/{gcid}/courses (honest fields only). */
interface BackendInstructorCourse {
  readonly id: string;
  readonly title: string;
  readonly enrolled_count?: number;
}

interface BackendInstructorCoursesList {
  readonly items: readonly BackendInstructorCourse[];
  readonly total?: number;
  readonly page?: number;
  readonly per?: number;
}

/** The endpoint's max page size (chora-delivery parseInstructorRosterPagination). */
const PORTFOLIO_PAGE_SIZE = 200;

@Injectable({ providedIn: 'root' })
export class InstructorPortfolioService {
  private readonly bff = inject(BffClientService);
  private readonly auth = inject(AuthService);

  getInstructorPortfolio(): Observable<InstructorPortfolio> {
    const gcid = this.auth.gcid();
    const instructorName = this.auth.user()?.displayName ?? 'Current instructor';
    if (!gcid) {
      return of({
        instructorName,
        courseCount: 0,
        learnerCount: 0,
        learnerCountIsLowerBound: false,
      });
    }
    return this.bff
      .get<BackendInstructorCoursesList>(
        `/api/v1/instructors/${encodeURIComponent(gcid)}/courses`,
        new HttpParams().set('per', String(PORTFOLIO_PAGE_SIZE)),
      )
      .pipe(map((resp) => summarisePortfolio(resp, instructorName)));
  }
}

/**
 * Fold the course page into the honest portfolio summary. `courseCount` is the
 * backend total when present (falling back to the loaded count); the learner
 * sum is flagged a lower bound whenever fewer courses loaded than that total.
 */
function summarisePortfolio(
  resp: BackendInstructorCoursesList,
  instructorName: string,
): InstructorPortfolio {
  const loaded = resp.items.length;
  const courseCount = resp.total ?? loaded;
  const learnerCount = resp.items.reduce((sum, c) => sum + (c.enrolled_count ?? 0), 0);
  return {
    instructorName,
    courseCount,
    learnerCount,
    learnerCountIsLowerBound: courseCount > loaded,
  };
}
