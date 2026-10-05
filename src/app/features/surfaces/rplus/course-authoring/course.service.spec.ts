/**
 * CourseService spec — CJ#2 (Course authoring + R+ review/release).
 *
 * Wires the service LIVE to the canonical BFF routes
 * (`chora-contracts/openapi/delivery-courses.yaml`) via HttpTestingController
 * — matching the sibling R+ service specs (assessment-monitor.service.spec.ts)
 * and per chora-web/CLAUDE.md §6 `httpMock.verify()` in afterEach.
 *
 * Covers the 7-endpoint aggregate plus the author-scoped fan-out
 * (`listAuthoredCourses` merges one GET per state and filters by author).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
  TestRequest,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { CourseService } from './course.service';
import type {
  Course,
  CourseState,
  CreateCourseRequest,
  RejectCourseRequest,
  ReleaseCourseRequest,
  UpdateCourseRequest,
} from './course-authoring.model';

const COURSE_ID = '019e0000-0000-7000-8000-000000000001';
const AUTHOR_GCID = '00000000-0000-7000-8000-000000001999';
const OTHER_AUTHOR_GCID = '00000000-0000-7000-8000-000000002000';

function buildCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: COURSE_ID,
    tenant_id: '11111111-1111-7111-8111-111111111111',
    title: 'Agile Estimation Fundamentals',
    state: 'DRAFT',
    author_gcid: AUTHOR_GCID,
    test_set_ids: ['01985e7f-1234-7abc-8def-000000000a01'],
    created_at: '2026-06-01T10:00:00Z',
    updated_at: '2026-06-01T10:00:00Z',
    ...overrides,
  };
}

function setup(): {
  service: CourseService;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(CourseService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('CourseService (CJ#2)', () => {
  let service: CourseService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    const r = setup();
    service = r.service;
    httpMock = r.httpMock;
  });

  afterEach(() => httpMock.verify());

  describe('createCourse', () => {
    it('POSTs the request body to /api/v1/courses and returns the created course', async () => {
      const body: CreateCourseRequest = {
        title: 'Agile Estimation Fundamentals',
        description: 'Estimate with story points.',
        test_set_ids: ['01985e7f-1234-7abc-8def-000000000a01'],
      };
      const promise = firstValueFrom(service.createCourse(body));
      const req = httpMock.expectOne(
        (r) => r.url.endsWith('/api/v1/courses') && r.method === 'POST',
      );
      expect(req.request.body).toEqual(body);
      req.flush(buildCourse(), { status: 201, statusText: 'Created' });
      const course = await promise;
      expect(course.id).toBe(COURSE_ID);
      expect(course.state).toBe('DRAFT');
    });
  });

  describe('listCourses', () => {
    it('GETs /api/v1/courses with the state param only when no cursor/page_size are given', async () => {
      const promise = firstValueFrom(service.listCourses({ state: 'DRAFT' }));
      const req = httpMock.expectOne(
        (r) => r.url.endsWith('/api/v1/courses') && r.method === 'GET',
      );
      expect(req.request.params.get('state')).toBe('DRAFT');
      expect(req.request.params.has('cursor')).toBe(false);
      expect(req.request.params.has('page_size')).toBe(false);
      req.flush({ items: [buildCourse()], next_cursor: null });
      const list = await promise;
      expect(list.items.length).toBe(1);
      expect(list.items[0].state).toBe('DRAFT');
    });

    it('forwards cursor and page_size when supplied', async () => {
      const promise = firstValueFrom(
        service.listCourses({
          state: 'AWAITING_REVIEW',
          cursor: 'cur-5',
          page_size: 25,
        }),
      );
      const req = httpMock.expectOne(
        (r) => r.url.endsWith('/api/v1/courses') && r.method === 'GET',
      );
      expect(req.request.params.get('state')).toBe('AWAITING_REVIEW');
      expect(req.request.params.get('cursor')).toBe('cur-5');
      expect(req.request.params.get('page_size')).toBe('25');
      req.flush({ items: [] });
      await promise;
    });
  });

  describe('getCourse', () => {
    it('GETs /api/v1/courses/{id} with the URI-encoded id', async () => {
      const promise = firstValueFrom(service.getCourse(COURSE_ID));
      const req = httpMock.expectOne(
        (r) =>
          r.url.endsWith(
            `/api/v1/courses/${encodeURIComponent(COURSE_ID)}`,
          ) && r.method === 'GET',
      );
      req.flush(buildCourse({ state: 'PUBLISHED' }));
      const course = await promise;
      expect(course.state).toBe('PUBLISHED');
    });
  });

  describe('updateCourse', () => {
    it('PATCHes the request body to /api/v1/courses/{id}', async () => {
      const body: UpdateCourseRequest = {
        title: 'Agile Estimation Fundamentals v2',
        prerequisites: ['Scrum basics'],
      };
      const promise = firstValueFrom(service.updateCourse(COURSE_ID, body));
      const req = httpMock.expectOne(
        (r) =>
          r.url.endsWith(
            `/api/v1/courses/${encodeURIComponent(COURSE_ID)}`,
          ) && r.method === 'PATCH',
      );
      expect(req.request.body).toEqual(body);
      req.flush(buildCourse({ title: body.title }));
      const course = await promise;
      expect(course.title).toBe('Agile Estimation Fundamentals v2');
    });
  });

  describe('publishCourse', () => {
    it('POSTs an empty body to /api/v1/courses/{id}/publish (DRAFT → AWAITING_REVIEW)', async () => {
      const promise = firstValueFrom(service.publishCourse(COURSE_ID));
      const req = httpMock.expectOne(
        (r) =>
          r.url.endsWith(
            `/api/v1/courses/${encodeURIComponent(COURSE_ID)}/publish`,
          ) && r.method === 'POST',
      );
      expect(req.request.body).toEqual({});
      req.flush(buildCourse({ state: 'AWAITING_REVIEW' }));
      const course = await promise;
      expect(course.state).toBe('AWAITING_REVIEW');
    });
  });

  describe('releaseCourse', () => {
    it('POSTs the release body to /api/v1/courses/{id}/release (AWAITING_REVIEW → PUBLISHED)', async () => {
      const body: ReleaseCourseRequest = {
        price_sgd_cents: 49900,
        sf_eligible: true,
        instructor_gcids: [AUTHOR_GCID],
        scheduled_open_at: '2026-07-01T00:00:00Z',
      };
      const promise = firstValueFrom(service.releaseCourse(COURSE_ID, body));
      const req = httpMock.expectOne(
        (r) =>
          r.url.endsWith(
            `/api/v1/courses/${encodeURIComponent(COURSE_ID)}/release`,
          ) && r.method === 'POST',
      );
      expect(req.request.body).toEqual(body);
      req.flush(buildCourse({ state: 'PUBLISHED' }));
      const course = await promise;
      expect(course.state).toBe('PUBLISHED');
    });
  });

  describe('rejectCourse', () => {
    it('POSTs the review-notes body to /api/v1/courses/{id}/reject (AWAITING_REVIEW → DRAFT)', async () => {
      const body: RejectCourseRequest = {
        review_notes: 'Missing learning objectives.',
      };
      const promise = firstValueFrom(service.rejectCourse(COURSE_ID, body));
      const req = httpMock.expectOne(
        (r) =>
          r.url.endsWith(
            `/api/v1/courses/${encodeURIComponent(COURSE_ID)}/reject`,
          ) && r.method === 'POST',
      );
      expect(req.request.body).toEqual(body);
      req.flush(buildCourse({ state: 'DRAFT', review_notes: body.review_notes }));
      const course = await promise;
      expect(course.review_notes).toBe('Missing learning objectives.');
    });
  });

  describe('listAuthoredCourses', () => {
    it('fans out one GET per state (page_size=100), filters to the author, and sorts by created_at desc', async () => {
      const promise = firstValueFrom(service.listAuthoredCourses(AUTHOR_GCID));

      const requests = httpMock.match(
        (r) => r.url.endsWith('/api/v1/courses') && r.method === 'GET',
      );
      expect(requests.length).toBe(4);
      // params.get returns string | null, so drop absent values before
      // sorting. A missing state then shortens the array and the toEqual
      // below fails, rather than the sort throwing on null.
      const states: CourseState[] = requests
        .map((r) => r.request.params.get('state'))
        .filter((state): state is string => state !== null)
        .sort((a, b) => a.localeCompare(b)) as CourseState[];
      expect(states).toEqual(['ARCHIVED', 'AWAITING_REVIEW', 'DRAFT', 'PUBLISHED']);
      for (const req of requests) {
        expect(req.request.params.get('page_size')).toBe('100');
      }

      const byState = new Map<string, TestRequest>();
      for (const req of requests) {
        byState.set(req.request.params.get('state')!, req);
      }
      // Mine: 3 courses across DRAFT / AWAITING_REVIEW / PUBLISHED.
      byState.get('DRAFT')!.flush({
        items: [
          buildCourse({
            id: 'course-draft',
            state: 'DRAFT',
            author_gcid: AUTHOR_GCID,
            created_at: '2026-06-01T10:00:00Z',
          }),
          buildCourse({
            id: 'course-foreign',
            state: 'DRAFT',
            author_gcid: OTHER_AUTHOR_GCID,
            created_at: '2026-06-02T10:00:00Z',
          }),
        ],
      });
      byState.get('AWAITING_REVIEW')!.flush({
        items: [
          buildCourse({
            id: 'course-review',
            state: 'AWAITING_REVIEW',
            author_gcid: AUTHOR_GCID,
            created_at: '2026-06-03T10:00:00Z',
          }),
        ],
      });
      byState.get('PUBLISHED')!.flush({
        items: [
          buildCourse({
            id: 'course-published',
            state: 'PUBLISHED',
            author_gcid: AUTHOR_GCID,
            created_at: '2026-05-01T10:00:00Z',
          }),
        ],
      });
      byState.get('ARCHIVED')!.flush({ items: [] });

      const courses = await promise;
      // Author-scoped + sorted newest-first; the foreign draft is dropped.
      expect(courses.map((c) => c.id)).toEqual([
        'course-review',
        'course-draft',
        'course-published',
      ]);
    });
  });
});