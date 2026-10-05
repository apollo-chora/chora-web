/**
 * SchedulingService spec — real-BFF wiring (post-fixture cutover).
 *
 * Tests the GET /v1/scheduling/classes proxy + the BackendScheduledClass →
 * SchedulingWeek mapping. Per chora-web/CLAUDE.md §3 (BFF-only API calls)
 * + `feedback_no_stubs_real_wiring` the service no longer ships an inline
 * CSPO fixture — empty backend ⇒ empty FE week (component renders empty
 * state).
 *
 * Pattern mirrors catalog.service.spec.ts:
 *   - provideHttpClient() + provideHttpClientTesting()
 *   - HttpTestingController.expectOne + flush
 *   - httpMock.verify() in afterEach
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { SchedulingService } from './scheduling.service';
import { environment } from '../../../../../environments/environment';

describe('SchedulingService', () => {
  let service: SchedulingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SchedulingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getCurrentWeek (no arg → default week)', () => {
    it('GETs /v1/scheduling/classes on the BFF without a week_iso when none supplied', async () => {
      const promise = firstValueFrom(service.getCurrentWeek());
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/v1/scheduling/classes`,
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.has('week_iso')).toBe(false);
      req.flush({ items: [] });
      const week = await promise;
      expect(week.sessions).toEqual([]);
    });

    it('returns an empty week with zero sessions when the backend has no classes', async () => {
      const promise = firstValueFrom(service.getCurrentWeek());
      httpMock
        .expectOne(`${environment.bffBaseUrl}/v1/scheduling/classes`)
        .flush({ items: [] });
      const week = await promise;
      expect(week.sessions).toHaveLength(0);
      expect(week.timezone).toBe('Asia/Singapore');
      expect(week.timezoneLabel).toContain('SGT');
    });
  });

  describe('getCurrentWeek(weekStartIso)', () => {
    it('passes the supplied week_iso through as a query param', async () => {
      const promise = firstValueFrom(service.getCurrentWeek('2026-05-18'));
      const req = httpMock.expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/v1/scheduling/classes` &&
          r.params.get('week_iso') === '2026-05-18',
      );
      expect(req.request.method).toBe('GET');
      req.flush({ items: [] });
      const week = await promise;
      expect(week.weekStartIso).toBe('2026-05-18');
      expect(week.weekLabel).toContain('18 May 2026');
    });
  });

  describe('mapping BackendScheduledClass → ClassSession', () => {
    it('maps a single class with id / room / instructor / starts_at / ends_at', async () => {
      const promise = firstValueFrom(service.getCurrentWeek('2026-05-18'));
      const req = httpMock.expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/v1/scheduling/classes` &&
          r.params.get('week_iso') === '2026-05-18',
      );
      req.flush({
        items: [
          {
            id: 'cls-1',
            tenant_id: 'tenant-001',
            course_id: 'course-cspo',
            instructor_gcid: 'gcid-chen',
            room_id: '01985e7f-6666-7abc-8def-000000000401',
            room: 'MTM HQ Room 401',
            starts_at: '2026-05-19T09:00:00+00:00',
            ends_at: '2026-05-19T12:00:00+00:00',
            max_capacity: 25,
          },
        ],
      });
      const week = await promise;
      expect(week.sessions).toHaveLength(1);
      const s = week.sessions[0]!;
      expect(s.sessionId).toBe('cls-1');
      // Raw course_id is carried through so the component can resolve the
      // real title against the courses() list it fetches.
      expect(s.courseId).toBe('course-cspo');
      // course_id is opaque; FE also derives a short courseCode as a fallback.
      expect(s.courseCode.length).toBeGreaterThan(0);
      expect(s.day).toBe('tuesday'); // 2026-05-19 is a Tuesday
      expect(s.dateIso).toBe('2026-05-19');
      expect(s.startTime).toBe('09:00');
      expect(s.endTime).toBe('12:00');
      expect(s.durationHours).toBe(3);
      expect(s.roomId).toBe('01985e7f-6666-7abc-8def-000000000401');
      expect(s.venue).toBe('MTM HQ Room 401');
      expect(s.maxCapacity).toBe(25);
      // Instructor display name falls back to the gcid when no people lookup
      // is wired, so carry the genuine id rather than a faked display name.
      expect(s.instructorGcid).toBe('gcid-chen');
    });

    it('maps multiple classes preserving the backend list order', async () => {
      const promise = firstValueFrom(service.getCurrentWeek('2026-05-18'));
      const req = httpMock.expectOne(
        (r) => r.url === `${environment.bffBaseUrl}/v1/scheduling/classes`,
      );
      req.flush({
        items: [
          {
            id: 'cls-1',
            tenant_id: 'tenant-001',
            course_id: 'course-cspo',
            instructor_gcid: 'gcid-chen',
            room: 'rm-1',
            starts_at: '2026-05-18T09:00:00+00:00',
            ends_at: '2026-05-18T12:00:00+00:00',
            max_capacity: 25,
          },
          {
            id: 'cls-2',
            tenant_id: 'tenant-001',
            course_id: 'course-cspo',
            instructor_gcid: 'gcid-chen',
            room: 'rm-2',
            starts_at: '2026-05-20T13:00:00+00:00',
            ends_at: '2026-05-20T16:00:00+00:00',
            max_capacity: 25,
          },
        ],
      });
      const week = await promise;
      expect(week.sessions).toHaveLength(2);
      expect(week.sessions[0]!.sessionId).toBe('cls-1');
      expect(week.sessions[0]!.day).toBe('monday');
      expect(week.sessions[1]!.sessionId).toBe('cls-2');
      expect(week.sessions[1]!.day).toBe('wednesday');
    });

    it('computes durationHours from starts_at + ends_at', async () => {
      const promise = firstValueFrom(service.getCurrentWeek('2026-05-18'));
      const req = httpMock.expectOne(
        (r) => r.url === `${environment.bffBaseUrl}/v1/scheduling/classes`,
      );
      req.flush({
        items: [
          {
            id: 'cls-30min',
            tenant_id: 'tenant-001',
            course_id: 'course-cspo',
            instructor_gcid: 'gcid-chen',
            room: 'rm',
            starts_at: '2026-05-19T09:00:00+00:00',
            ends_at: '2026-05-19T09:30:00+00:00',
            max_capacity: 10,
          },
        ],
      });
      const week = await promise;
      // 30 min rounds up to 1 hour for the grid display (matches the
      // existing spanHours behaviour in scheduling.component.ts).
      expect(week.sessions[0]!.durationHours).toBeGreaterThanOrEqual(0.5);
      expect(week.sessions[0]!.durationHours).toBeLessThanOrEqual(1);
    });
  });

  describe('createClass (POST) — CHO-1626', () => {
    it('POSTs the snake_case create payload to /v1/scheduling/classes', async () => {
      const promise = firstValueFrom(
        service.createClass({
          courseId: 'course-cspo',
          instructorGcid: 'gcid-chen',
          roomId: '01985e7f-6666-7abc-8def-000000000401',
          startsAt: '2026-05-19T09:00:00Z',
          endsAt: '2026-05-19T12:00:00Z',
          maxCapacity: 25,
        }),
      );
      const req = httpMock.expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/v1/scheduling/classes` &&
          r.method === 'POST',
      );
      expect(req.request.body).toEqual({
        course_id: 'course-cspo',
        instructor_gcid: 'gcid-chen',
        room_id: '01985e7f-6666-7abc-8def-000000000401',
        starts_at: '2026-05-19T09:00:00Z',
        ends_at: '2026-05-19T12:00:00Z',
        max_capacity: 25,
      });
      req.flush({
        id: 'cls-new',
        tenant_id: 'tenant-001',
        course_id: 'course-cspo',
        instructor_gcid: 'gcid-chen',
        room_id: '01985e7f-6666-7abc-8def-000000000401',
        room: 'MTM HQ Room 401',
        starts_at: '2026-05-19T09:00:00Z',
        ends_at: '2026-05-19T12:00:00Z',
        max_capacity: 25,
      });
      const created = await promise;
      expect(created.sessionId).toBe('cls-new');
      expect(created.venue).toBe('MTM HQ Room 401');
      expect(created.startTime).toBe('09:00');
    });
  });

  describe('rescheduleClass (POST /{id}/reschedule) CHO-2334', () => {
    it('POSTs starts_at/ends_at/room_id to the reschedule sub-route and maps the echo', async () => {
      const promise = firstValueFrom(
        service.rescheduleClass('cls-1', {
          startsAt: '2026-05-20T14:00:00Z',
          endsAt: '2026-05-20T17:00:00Z',
          roomId: '01985e7f-6666-7abc-8def-000000000401',
        }),
      );
      const req = httpMock.expectOne(
        (r) =>
          r.url ===
            `${environment.bffBaseUrl}/v1/scheduling/classes/cls-1/reschedule` &&
          r.method === 'POST',
      );
      expect(req.request.body).toEqual({
        starts_at: '2026-05-20T14:00:00Z',
        ends_at: '2026-05-20T17:00:00Z',
        room_id: '01985e7f-6666-7abc-8def-000000000401',
      });
      req.flush({
        id: 'cls-1',
        tenant_id: 'tenant-001',
        course_id: 'course-cspo',
        instructor_gcid: 'gcid-chen',
        room_id: '01985e7f-6666-7abc-8def-000000000401',
        room: 'MTM HQ Room 401',
        starts_at: '2026-05-20T14:00:00Z',
        ends_at: '2026-05-20T17:00:00Z',
        max_capacity: 25,
      });
      const updated = await promise;
      expect(updated.sessionId).toBe('cls-1');
      expect(updated.startTime).toBe('14:00');
      expect(updated.day).toBe('wednesday');
    });

    it('sends an empty room_id for a roomless reschedule (never a free-text name)', async () => {
      const promise = firstValueFrom(
        service.rescheduleClass('cls-2', {
          startsAt: '2026-05-20T14:00:00Z',
          endsAt: '2026-05-20T15:00:00Z',
          roomId: '',
        }),
      );
      const req = httpMock.expectOne(
        (r) => r.url.endsWith('/v1/scheduling/classes/cls-2/reschedule'),
      );
      expect(req.request.body).toEqual({
        starts_at: '2026-05-20T14:00:00Z',
        ends_at: '2026-05-20T15:00:00Z',
        room_id: '',
      });
      expect('room' in (req.request.body as Record<string, unknown>)).toBe(false);
      req.flush({
        id: 'cls-2',
        tenant_id: 'tenant-001',
        course_id: 'course-cspo',
        instructor_gcid: 'gcid-chen',
        room_id: '',
        room: '',
        starts_at: '2026-05-20T14:00:00Z',
        ends_at: '2026-05-20T15:00:00Z',
        max_capacity: 10,
      });
      await promise;
    });

    it('propagates a 409 room_double_booked with the server body intact', async () => {
      const promise = firstValueFrom(
        service.rescheduleClass('cls-3', {
          startsAt: '2026-05-20T14:00:00Z',
          endsAt: '2026-05-20T17:00:00Z',
          roomId: 'room-x',
        }),
      );
      const req = httpMock.expectOne((r) =>
        r.url.endsWith('/v1/scheduling/classes/cls-3/reschedule'),
      );
      req.flush(
        {
          error: {
            code: 'room_double_booked',
            message:
              'that room is already booked for an overlapping time; pick another room or time',
          },
        },
        { status: 409, statusText: 'Conflict' },
      );
      await expect(promise).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('cancelClass (POST /{id}/cancel) CHO-2334', () => {
    it('POSTs to the cancel sub-route with no meaningful body', async () => {
      const promise = firstValueFrom(service.cancelClass('cls-1'));
      const req = httpMock.expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/v1/scheduling/classes/cls-1/cancel` &&
          r.method === 'POST',
      );
      // The cancel endpoint ignores the body; we must not send a fabricated one.
      expect(req.request.body ?? {}).toEqual({});
      req.flush({
        id: 'cls-1',
        tenant_id: 'tenant-001',
        course_id: 'course-cspo',
        instructor_gcid: 'gcid-chen',
        room_id: 'room-1',
        room: 'MTM HQ Room 401',
        starts_at: '2026-05-20T14:00:00Z',
        ends_at: '2026-05-20T17:00:00Z',
        max_capacity: 25,
        deleted_at: '2026-05-19T00:00:00Z',
      });
      const cancelled = await promise;
      expect(cancelled.sessionId).toBe('cls-1');
    });
  });

  describe('listPublishedCourses (course picker source)', () => {
    it('GETs /api/v1/courses with the required state=PUBLISHED param and maps id/label/instructorGcids', async () => {
      const promise = firstValueFrom(service.listPublishedCourses());
      const req = httpMock.expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/api/v1/courses` &&
          r.params.get('state') === 'PUBLISHED',
      );
      expect(req.request.method).toBe('GET');
      req.flush({
        items: [
          {
            id: 'course-cspo',
            title: 'Certified Scrum Product Owner',
            description: 'Advanced product ownership',
            instructor_gcids: ['gcid-chen', 'gcid-lee'],
            state: 'PUBLISHED',
          },
        ],
      });
      const courses = await promise;
      expect(courses).toHaveLength(1);
      expect(courses[0]!.id).toBe('course-cspo');
      // title wins over description for the option label.
      expect(courses[0]!.label).toBe('Certified Scrum Product Owner');
      expect(courses[0]!.instructorGcids).toEqual(['gcid-chen', 'gcid-lee']);
    });

    it('falls back to description for the label when title is absent', async () => {
      const promise = firstValueFrom(service.listPublishedCourses());
      httpMock
        .expectOne((r) => r.url === `${environment.bffBaseUrl}/api/v1/courses`)
        .flush({
          items: [
            {
              id: 'c2',
              description: 'Only a description',
              instructor_gcids: [],
              state: 'PUBLISHED',
            },
          ],
        });
      const courses = await promise;
      expect(courses[0]!.label).toBe('Only a description');
      expect(courses[0]!.instructorGcids).toEqual([]);
    });

    it('defaults instructorGcids to an empty array when the wire omits it', async () => {
      const promise = firstValueFrom(service.listPublishedCourses());
      httpMock
        .expectOne((r) => r.url === `${environment.bffBaseUrl}/api/v1/courses`)
        .flush({ items: [{ id: 'c3', title: 'No instructors', state: 'PUBLISHED' }] });
      const courses = await promise;
      expect(courses[0]!.instructorGcids).toEqual([]);
    });

    it('truncates an over-long label so the picker stays readable', async () => {
      const long = 'x'.repeat(200);
      const promise = firstValueFrom(service.listPublishedCourses());
      httpMock
        .expectOne((r) => r.url === `${environment.bffBaseUrl}/api/v1/courses`)
        .flush({
          items: [{ id: 'c4', title: long, instructor_gcids: [], state: 'PUBLISHED' }],
        });
      const courses = await promise;
      expect(courses[0]!.label.length).toBeLessThanOrEqual(90);
      expect(courses[0]!.label.endsWith('...')).toBe(true);
    });
  });
});
