/**
 * RosterByCourseService spec — R+ /r/rosters/:courseId (real BFF wiring).
 *
 * Verifies the service issues GET /api/v1/rosters/{courseId} on the BFF
 * + URL-encodes the path segment + maps the backend snake-case wire envelope
 * into the camelCase CourseRoster model. No service-level stubs;
 * HttpTestingController flushes real envelopes per
 * `feedback_no_stubs_real_wiring`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { RosterByCourseService } from './roster-by-course.service';
import { environment } from '../../../../../environments/environment';

describe('RosterByCourseService', () => {
  let service: RosterByCourseService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RosterByCourseService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('GETs /api/v1/rosters/{courseId} on the BFF', async () => {
    const promise = firstValueFrom(service.getByCourseId('course-cspo'));

    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/rosters/course-cspo`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      course_id: 'course-cspo',
      tenant_id: 'tenant-001',
      learners: [],
      learner_count: 0,
    });

    const out = await promise;
    expect(out.courseId).toBe('course-cspo');
    expect(out.tenantId).toBe('tenant-001');
    expect(out.learners).toEqual([]);
    expect(out.learnerCount).toBe(0);
  });

  it('URL-encodes the courseId path segment', async () => {
    // UUIDv7 ids never need encoding, but a future slug-style id might.
    const messy = 'course/with spaces';
    const promise = firstValueFrom(service.getByCourseId(messy));
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/rosters/${encodeURIComponent(messy)}`,
    );
    req.flush({
      course_id: messy,
      tenant_id: 'tenant-001',
      learners: [],
      learner_count: 0,
    });
    await promise;
  });

  it('maps backend learner envelope into the typed RosterLearner model', async () => {
    const promise = firstValueFrom(service.getByCourseId('course-cspo'));
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/rosters/course-cspo`,
    );
    req.flush({
      course_id: 'course-cspo',
      tenant_id: 'tenant-001',
      learners: [
        {
          gcid: 'gcid-phyllis',
          display_name: 'gcid-phyllis',
          progress_pct: 0,
          enrolled_at: '2026-05-26T10:00:00Z',
        },
        {
          gcid: 'gcid-mei',
          display_name: 'gcid-mei',
          progress_pct: 0,
          enrolled_at: '2026-05-26T11:00:00Z',
        },
      ],
      learner_count: 2,
    });

    const out = await promise;
    expect(out.learnerCount).toBe(2);
    expect(out.learners.length).toBe(2);
    const first = out.learners[0]!;
    expect(first.gcid).toBe('gcid-phyllis');
    expect(first.displayName).toBe('gcid-phyllis');
    expect(first.progressPct).toBe(0);
    expect(first.enrolledAt).toBe('2026-05-26T10:00:00Z');
  });

  it('returns empty learners array when course has zero enrolments', async () => {
    const promise = firstValueFrom(service.getByCourseId('course-empty'));
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/rosters/course-empty`,
    );
    req.flush({
      course_id: 'course-empty',
      tenant_id: 'tenant-001',
      learners: [],
      learner_count: 0,
    });
    const out = await promise;
    expect(out.learners).toEqual([]);
    expect(out.learnerCount).toBe(0);
  });
});
