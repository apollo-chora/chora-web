/**
 * InstructorPortfolioService spec - the honest portfolio header behind the R+
 * landing (R4, CHO-2269). Mounts the REAL service over HttpTestingController
 * (no service-level mock per feedback_no_stubs_real_wiring), hitting the same
 * GET /api/v1/instructors/{gcid}/courses read the retired Rostering dashboard
 * used - but mapping ONLY the honest fields the backend actually carries
 * (instructor name, course total, enrolled counts). The dashboard's
 * at-risk / completion / attendance were hardcoded zeros (publicCourseDTO has
 * no such field); they are absorbed away, never promoted to the landing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { InstructorPortfolioService } from './instructor-portfolio.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { environment } from '../../../../../environments/environment';

const GCID = '00000000-0000-7000-8000-000000001999';
const COURSES_URL = `${environment.bffBaseUrl}/api/v1/instructors/${encodeURIComponent(GCID)}/courses`;

describe('InstructorPortfolioService', () => {
  let service: InstructorPortfolioService;
  let httpMock: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(InstructorPortfolioService);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    auth.setUser(
      {
        gcid: GCID,
        tenantId: 'tenant-001',
        roles: ['INSTRUCTOR'],
        capabilities: [],
        displayName: 'Mr. Chen',
        email: 'chen@example.com',
      },
      'fake-jwt',
    );
  });

  afterEach(() => httpMock.verify());

  it('reads the whole portfolio in one page (per=200) so the sum is complete', async () => {
    const promise = firstValueFrom(service.getInstructorPortfolio());
    const req = httpMock.expectOne((r) => r.url === COURSES_URL);
    expect(req.request.method).toBe('GET');
    // A portfolio header wants the WHOLE portfolio; request the max page.
    expect(req.request.params.get('per')).toBe('200');
    req.flush({ items: [], total: 0, page: 1, per: 200 });
    await promise;
  });

  it('summarises instructor name, course total, and the learner sum', async () => {
    const promise = firstValueFrom(service.getInstructorPortfolio());
    httpMock.expectOne((r) => r.url === COURSES_URL).flush({
      items: [
        { id: 'c1', title: 'Certified Scrum Product Owner', enrolled_count: 12 },
        { id: 'c2', title: 'Data Structures 101', enrolled_count: 8 },
      ],
      total: 2,
      page: 1,
      per: 200,
    });
    const p = await promise;
    expect(p.instructorName).toBe('Mr. Chen');
    expect(p.courseCount).toBe(2);
    expect(p.learnerCount).toBe(20);
    // Every course loaded (items === total), so the sum is exact.
    expect(p.learnerCountIsLowerBound).toBe(false);
  });

  it('never fabricates a metric the backend does not carry', async () => {
    const promise = firstValueFrom(service.getInstructorPortfolio());
    httpMock.expectOne((r) => r.url === COURSES_URL).flush({
      items: [{ id: 'c1', title: 'X', enrolled_count: 5 }],
      total: 1,
    });
    const p = await promise;
    // The honest model exposes ONLY these four keys - there is no at-risk,
    // completion or attendance field to fabricate a zero into.
    expect(Object.keys(p).sort()).toEqual(
      ['courseCount', 'instructorName', 'learnerCount', 'learnerCountIsLowerBound'].sort(),
    );
  });

  it('marks the learner sum a LOWER BOUND when total exceeds the loaded page', async () => {
    const promise = firstValueFrom(service.getInstructorPortfolio());
    // Backend caps the page but reports a larger total: the sum undercounts.
    httpMock.expectOne((r) => r.url === COURSES_URL).flush({
      items: [{ id: 'c1', title: 'X', enrolled_count: 5 }],
      total: 250,
      page: 1,
      per: 200,
    });
    const p = await promise;
    expect(p.courseCount).toBe(250);
    expect(p.learnerCount).toBe(5);
    // 1 loaded < 250 total → the learner sum is a floor, not the truth.
    expect(p.learnerCountIsLowerBound).toBe(true);
  });

  it('treats a missing enrolled_count as zero (no NaN in the sum)', async () => {
    const promise = firstValueFrom(service.getInstructorPortfolio());
    httpMock.expectOne((r) => r.url === COURSES_URL).flush({
      items: [{ id: 'c1', title: 'X' }, { id: 'c2', title: 'Y', enrolled_count: 3 }],
      total: 2,
    });
    const p = await promise;
    expect(p.learnerCount).toBe(3);
  });

  it('falls back to the item count when the backend omits total', async () => {
    const promise = firstValueFrom(service.getInstructorPortfolio());
    httpMock.expectOne((r) => r.url === COURSES_URL).flush({
      items: [{ id: 'c1', title: 'X', enrolled_count: 4 }],
    });
    const p = await promise;
    // No total on the wire → the loaded count is the best truth we have, and
    // it is not a lower bound (we cannot claim more exist than we can see).
    expect(p.courseCount).toBe(1);
    expect(p.learnerCountIsLowerBound).toBe(false);
  });

  it('returns an empty portfolio and fires NO request when unauthenticated', async () => {
    auth.clearAuth();
    const p = await firstValueFrom(service.getInstructorPortfolio());
    expect(p.courseCount).toBe(0);
    expect(p.learnerCount).toBe(0);
    expect(p.learnerCountIsLowerBound).toBe(false);
    httpMock.expectNone((r) => r.url === COURSES_URL);
  });
});
