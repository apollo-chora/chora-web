/**
 * ClassRosterService spec — R+ /r/roster (real BFF wiring, no stubs).
 *
 * Verifies the two-call chain through BffClientService:
 *   1. GET /api/v1/instructors/{gcid}/courses  → resolve the first course
 *   2. GET /api/v1/rosters/{courseId}          → that course's learner list
 * and the fold into the typed CohortRoster. HttpTestingController flushes real
 * wire envelopes per `feedback_no_stubs_real_wiring`. NoCourseError is asserted
 * for the no-GCID + no-courses branches; the roster 404 propagates as an HTTP
 * error so the component can render its fail-loud banner.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { ClassRosterService, NoCourseError } from './class-roster.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { environment } from '../../../../../environments/environment';

const GCID = '00000000-0000-7000-8000-000000001999';
const COURSE_ID = '019e30da-923e-7da2-a8e7-ef2dad3137a0';

function coursesUrl(gcid: string): string {
  return `${environment.bffBaseUrl}/api/v1/instructors/${encodeURIComponent(
    gcid,
  )}/courses`;
}

function rosterUrl(courseId: string): string {
  return `${environment.bffBaseUrl}/api/v1/rosters/${encodeURIComponent(
    courseId,
  )}`;
}

function authenticate(auth: AuthService, gcid: string = GCID): void {
  auth.setUser(
    {
      gcid,
      tenantId: 'tenant-001',
      roles: ['INSTRUCTOR'],
      capabilities: [],
      displayName: 'Test Instructor',
      email: 'inst@example.com',
    },
    'fake-jwt',
  );
}

describe('ClassRosterService', () => {
  let service: ClassRosterService;
  let httpMock: HttpTestingController;
  let auth: AuthService;
  let tenants: TenantContextService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ClassRosterService);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    tenants = TestBed.inject(TenantContextService);
    tenants.setCurrentTenant({
      id: 'tenant-001',
      name: 'MTM Singapore',
      slug: 'mtm',
      logoUrl: null,
    });
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('chains instructor-courses → roster and folds into CohortRoster', async () => {
    authenticate(auth);
    const promise = firstValueFrom(service.getRoster());

    const coursesReq = httpMock.expectOne(coursesUrl(GCID));
    expect(coursesReq.request.method).toBe('GET');
    coursesReq.flush({
      items: [
        {
          id: COURSE_ID,
          tenant_id: 'tenant-001',
          title: 'CJ2 E2E Foundations',
          instructor_name: '',
          enrolled_count: 2,
        },
      ],
      total: 1,
    });

    const rosterReq = httpMock.expectOne(rosterUrl(COURSE_ID));
    expect(rosterReq.request.method).toBe('GET');
    rosterReq.flush({
      course_id: COURSE_ID,
      tenant_id: 'tenant-001',
      learners: [
        {
          gcid: 'gcid-phyllis',
          display_name: 'gcid-phyllis',
          progress_pct: 100,
          enrolled_at: '2026-05-26T10:00:00Z',
        },
        {
          gcid: 'gcid-mei',
          display_name: 'Mei Lin',
          progress_pct: 40,
          enrolled_at: '2026-05-26T11:00:00Z',
        },
      ],
      learner_count: 2,
    });

    const roster = await promise;
    expect(roster.courseId).toBe(COURSE_ID);
    expect(roster.cohortName).toBe('CJ2 E2E Foundations');
    expect(roster.courseCode).toBe('CEF');
    expect(roster.instructorName).toBe('Test Instructor');
    expect(roster.tenantId).toBe('tenant-001');
    expect(roster.rosterSize).toBe(2);
    expect(roster.learners).toHaveLength(2);
  });

  it('maps a completed learner to Completed + cert-preview enabled', async () => {
    authenticate(auth);
    const promise = firstValueFrom(service.getRoster());
    httpMock.expectOne(coursesUrl(GCID)).flush({
      items: [{ id: COURSE_ID, title: 'Algorithms 1', enrolled_count: 1 }],
    });
    httpMock.expectOne(rosterUrl(COURSE_ID)).flush({
      course_id: COURSE_ID,
      tenant_id: 'tenant-001',
      learners: [
        {
          gcid: 'gcid-done',
          display_name: 'gcid-done',
          progress_pct: 100,
          enrolled_at: '2026-05-26T10:00:00Z',
        },
      ],
      learner_count: 1,
    });
    const roster = await promise;
    const learner = roster.learners[0]!;
    expect(learner.status).toBe('Completed');
    expect(learner.certPreviewEnabled).toBe(true);
    expect(learner.progressPct).toBe(100);
    // displayName falls back to gcid when the identity projection is unwired.
    expect(learner.displayName).toBe('gcid-done');
  });

  it('maps an in-progress learner to Active + cert-preview disabled', async () => {
    authenticate(auth);
    const promise = firstValueFrom(service.getRoster());
    httpMock.expectOne(coursesUrl(GCID)).flush({
      items: [{ id: COURSE_ID, title: 'Algorithms 1', enrolled_count: 1 }],
    });
    httpMock.expectOne(rosterUrl(COURSE_ID)).flush({
      course_id: COURSE_ID,
      tenant_id: 'tenant-001',
      learners: [
        {
          gcid: 'gcid-wip',
          display_name: 'Work Inprogress',
          progress_pct: 35,
          enrolled_at: '2026-05-26T12:00:00Z',
        },
      ],
      learner_count: 1,
    });
    const roster = await promise;
    const learner = roster.learners[0]!;
    expect(learner.status).toBe('Active');
    expect(learner.certPreviewEnabled).toBe(false);
    expect(learner.atomicSessionsCompleted).toBe(0);
    expect(learner.atomicSessionsTotal).toBe(0);
  });

  it('returns an empty roster (no learners) for a zero-enrolment course', async () => {
    authenticate(auth);
    const promise = firstValueFrom(service.getRoster());
    httpMock.expectOne(coursesUrl(GCID)).flush({
      items: [{ id: COURSE_ID, title: 'Empty Course', enrolled_count: 0 }],
    });
    httpMock.expectOne(rosterUrl(COURSE_ID)).flush({
      course_id: COURSE_ID,
      tenant_id: 'tenant-001',
      learners: [],
      learner_count: 0,
    });
    const roster = await promise;
    expect(roster.learners).toEqual([]);
    expect(roster.rosterSize).toBe(0);
    expect(roster.cohortName).toBe('Empty Course');
  });

  it('throws NoCourseError (not an HTTP call) when unauthenticated', async () => {
    // No setUser → auth.gcid() is null.
    await expect(firstValueFrom(service.getRoster())).rejects.toBeInstanceOf(
      NoCourseError,
    );
    httpMock.expectNone(coursesUrl(GCID));
  });

  it('throws NoCourseError when the instructor owns no courses', async () => {
    authenticate(auth);
    const promise = firstValueFrom(service.getRoster());
    httpMock.expectOne(coursesUrl(GCID)).flush({ items: [], total: 0 });
    await expect(promise).rejects.toBeInstanceOf(NoCourseError);
  });

  it('propagates the roster endpoint 404 as an HTTP error (fail loud)', async () => {
    authenticate(auth);
    const promise = firstValueFrom(service.getRoster());
    httpMock.expectOne(coursesUrl(GCID)).flush({
      items: [{ id: COURSE_ID, title: 'Algorithms 1', enrolled_count: 1 }],
    });
    httpMock
      .expectOne(rosterUrl(COURSE_ID))
      .flush('404 page not found', {
        status: 404,
        statusText: 'Not Found',
      });
    await expect(promise).rejects.toMatchObject({ status: 404 });
  });

  it('URL-encodes the course id in the roster path', async () => {
    authenticate(auth);
    const messyId = 'course/with space';
    const promise = firstValueFrom(service.getRoster());
    httpMock.expectOne(coursesUrl(GCID)).flush({
      items: [{ id: messyId, title: 'Messy', enrolled_count: 0 }],
    });
    const req = httpMock.expectOne(rosterUrl(messyId));
    expect(req.request.method).toBe('GET');
    req.flush({
      course_id: messyId,
      tenant_id: 'tenant-001',
      learners: [],
      learner_count: 0,
    });
    await promise;
  });

  // ── Branch augmentation ─────────────────────────────────────────────────
  // Each test below drives a currently-uncovered conditional arm in
  // class-roster.service.ts. Source is NOT modified.

  it('throws NoCourseError when the courses envelope omits `items` (?? [] arm)', async () => {
    // `(list.items ?? [])[0]` — exercise the nullish-coalescing fallback by
    // flushing a body with NO `items` key at all → [] → no first course.
    authenticate(auth);
    const promise = firstValueFrom(service.getRoster());
    httpMock.expectOne(coursesUrl(GCID)).flush({ total: 0 });
    await expect(promise).rejects.toBeInstanceOf(NoCourseError);
  });

  it('falls back to the TenantContext tenant id when neither course nor roster carry one', async () => {
    // fetchCourseRoster: `course.tenant_id ?? this.tenants.tenantId() ?? ''`
    //   → course has no tenant_id, so tenants.tenantId() ('tenant-001') is used.
    // buildCohortRoster: `roster.tenant_id || fallbackTenantId`
    //   → roster.tenant_id is empty, so the fallback wins.
    authenticate(auth);
    const promise = firstValueFrom(service.getRoster());
    httpMock.expectOne(coursesUrl(GCID)).flush({
      // NO tenant_id on the course.
      items: [{ id: COURSE_ID, title: 'No Tenant Course', enrolled_count: 0 }],
    });
    httpMock.expectOne(rosterUrl(COURSE_ID)).flush({
      course_id: COURSE_ID,
      tenant_id: '', // falsy → fallbackTenantId (= tenants.tenantId()) wins.
      learners: [],
      learner_count: 0,
    });
    const roster = await promise;
    expect(roster.tenantId).toBe('tenant-001');
  });

  it('falls back to empty-string tenant id when no tenant context is set either', async () => {
    // fetchCourseRoster: `course.tenant_id ?? this.tenants.tenantId() ?? ''`
    //   → course has no tenant_id AND tenants.tenantId() is null → '' arm.
    // Build a fresh TestBed WITHOUT seeding a current tenant so tenantId() is
    // null (the shared beforeEach seeds one; reset it here in isolation).
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const freshService = TestBed.inject(ClassRosterService);
    const freshHttp = TestBed.inject(HttpTestingController);
    const freshAuth = TestBed.inject(AuthService);
    authenticate(freshAuth);

    const promise = firstValueFrom(freshService.getRoster());
    freshHttp.expectOne(coursesUrl(GCID)).flush({
      items: [{ id: COURSE_ID, title: 'Orphan Course', enrolled_count: 0 }],
    });
    freshHttp.expectOne(rosterUrl(COURSE_ID)).flush({
      course_id: COURSE_ID,
      tenant_id: '', // falsy → fallbackTenantId, which itself resolved to ''.
      learners: [],
      learner_count: 0,
    });
    const roster = await promise;
    expect(roster.tenantId).toBe('');
    freshHttp.verify();
  });

  it('uses the course id when the roster envelope course_id is empty', async () => {
    // buildCohortRoster: `roster.course_id || course.id` — roster.course_id
    // empty → course.id wins.
    authenticate(auth);
    const promise = firstValueFrom(service.getRoster());
    httpMock.expectOne(coursesUrl(GCID)).flush({
      items: [{ id: COURSE_ID, title: 'Fallback Id', enrolled_count: 0 }],
    });
    httpMock.expectOne(rosterUrl(COURSE_ID)).flush({
      course_id: '', // falsy → course.id wins.
      tenant_id: 'tenant-001',
      learners: [],
      learner_count: 0,
    });
    const roster = await promise;
    expect(roster.courseId).toBe(COURSE_ID);
  });

  it('prefers the course instructor_name over the AuthService display name', async () => {
    // buildCohortRoster: `course.instructor_name || instructorName` — when the
    // course carries a non-empty instructor_name, it wins over AuthService.
    authenticate(auth);
    const promise = firstValueFrom(service.getRoster());
    httpMock.expectOne(coursesUrl(GCID)).flush({
      items: [
        {
          id: COURSE_ID,
          title: 'Named Instructor',
          instructor_name: 'Prof. Backend',
          enrolled_count: 0,
        },
      ],
    });
    httpMock.expectOne(rosterUrl(COURSE_ID)).flush({
      course_id: COURSE_ID,
      tenant_id: 'tenant-001',
      learners: [],
      learner_count: 0,
    });
    const roster = await promise;
    expect(roster.instructorName).toBe('Prof. Backend');
  });

  it('derives rosterSize from learners.length when learner_count is absent (?? arm)', async () => {
    // buildCohortRoster: `roster.learner_count ?? learners.length` — omit
    // learner_count entirely so the length fallback is taken.
    authenticate(auth);
    const promise = firstValueFrom(service.getRoster());
    httpMock.expectOne(coursesUrl(GCID)).flush({
      items: [{ id: COURSE_ID, title: 'Count From Length', enrolled_count: 9 }],
    });
    httpMock.expectOne(rosterUrl(COURSE_ID)).flush({
      course_id: COURSE_ID,
      tenant_id: 'tenant-001',
      learners: [
        {
          gcid: 'gcid-a',
          display_name: 'Aaa',
          progress_pct: 10,
          enrolled_at: '2026-05-26T10:00:00Z',
        },
        {
          gcid: 'gcid-b',
          display_name: 'Bbb',
          progress_pct: 20,
          enrolled_at: '2026-05-26T11:00:00Z',
        },
      ],
      // NO learner_count key.
    });
    const roster = await promise;
    expect(roster.rosterSize).toBe(2);
    expect(roster.learners).toHaveLength(2);
  });

  it('treats a missing learners array as empty (?? [] arm)', async () => {
    // buildCohortRoster: `(roster.learners ?? [])` — omit learners entirely.
    // learner_count is also omitted so rosterSize falls to length (0).
    authenticate(auth);
    const promise = firstValueFrom(service.getRoster());
    httpMock.expectOne(coursesUrl(GCID)).flush({
      items: [{ id: COURSE_ID, title: 'No Learners Key', enrolled_count: 0 }],
    });
    httpMock.expectOne(rosterUrl(COURSE_ID)).flush({
      course_id: COURSE_ID,
      tenant_id: 'tenant-001',
      // NO learners key, NO learner_count key.
    });
    const roster = await promise;
    expect(roster.learners).toEqual([]);
    expect(roster.rosterSize).toBe(0);
  });

  it('coerces a non-finite progress_pct to 0 (Number.isFinite false arm)', async () => {
    // mapBackendLearner: `Number.isFinite(l.progress_pct) ? l.progress_pct : 0`
    //   — a NaN progress (e.g. a future projection sending null serialised as
    //   NaN) is coerced to 0 → Active + cert-preview disabled.
    authenticate(auth);
    const promise = firstValueFrom(service.getRoster());
    httpMock.expectOne(coursesUrl(GCID)).flush({
      items: [{ id: COURSE_ID, title: 'NaN Progress', enrolled_count: 1 }],
    });
    httpMock.expectOne(rosterUrl(COURSE_ID)).flush({
      course_id: COURSE_ID,
      tenant_id: 'tenant-001',
      learners: [
        {
          gcid: 'gcid-nan',
          display_name: 'No Progress',
          progress_pct: Number.NaN,
          enrolled_at: '2026-05-26T10:00:00Z',
        },
      ],
      learner_count: 1,
    });
    const roster = await promise;
    const learner = roster.learners[0]!;
    expect(learner.progressPct).toBe(0);
    expect(learner.status).toBe('Active');
    expect(learner.certPreviewEnabled).toBe(false);
  });

  it('derives an empty course code for a whitespace-only title (length===0 arm)', async () => {
    // deriveCode: trimmed.length === 0 → '' early return.
    authenticate(auth);
    const promise = firstValueFrom(service.getRoster());
    httpMock.expectOne(coursesUrl(GCID)).flush({
      items: [{ id: COURSE_ID, title: '   ', enrolled_count: 0 }],
    });
    httpMock.expectOne(rosterUrl(COURSE_ID)).flush({
      course_id: COURSE_ID,
      tenant_id: 'tenant-001',
      learners: [],
      learner_count: 0,
    });
    const roster = await promise;
    expect(roster.courseCode).toBe('');
  });

  it('derives a sliced course code for a single-word title (words.length < 2 arm)', async () => {
    // deriveCode: a single word → words.length is 1 → the slice(0,8).toUpperCase
    // fallback rather than the initials path.
    authenticate(auth);
    const promise = firstValueFrom(service.getRoster());
    httpMock.expectOne(coursesUrl(GCID)).flush({
      items: [{ id: COURSE_ID, title: 'Algorithms', enrolled_count: 0 }],
    });
    httpMock.expectOne(rosterUrl(COURSE_ID)).flush({
      course_id: COURSE_ID,
      tenant_id: 'tenant-001',
      learners: [],
      learner_count: 0,
    });
    const roster = await promise;
    expect(roster.courseCode).toBe('ALGORITH');
  });

  it('filters non-alphanumeric-leading words out of the course code', async () => {
    // deriveCode: the `.filter(/^[A-Za-z0-9]/)` drops the leading punctuation
    // token, leaving one usable word → the slice path on the trimmed title.
    authenticate(auth);
    const promise = firstValueFrom(service.getRoster());
    httpMock.expectOne(coursesUrl(GCID)).flush({
      items: [{ id: COURSE_ID, title: '- Calculus', enrolled_count: 0 }],
    });
    httpMock.expectOne(rosterUrl(COURSE_ID)).flush({
      course_id: COURSE_ID,
      tenant_id: 'tenant-001',
      learners: [],
      learner_count: 0,
    });
    const roster = await promise;
    // Only "Calculus" survives the filter (1 word) → slice of the trimmed title.
    expect(roster.courseCode).toBe('- CALCUL');
  });
});
