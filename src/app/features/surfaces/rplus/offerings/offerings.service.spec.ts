/**
 * OfferingsService spec — verifies the real BFF wiring for the offerings finder:
 *   - GET /api/v1/search/offerings with params built from a CollectionQuery
 *   - snake_case wire → camelCase FE mapping (items + facets + cursor + total)
 *   - facet value labels mapped to i18n keys
 *   - HTTP errors propagate (fail-loud, no fixture fallback)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { OfferingsService } from './offerings.service';
import { EMPTY_QUERY, type CollectionQuery } from '../../../../shared/components/chora-collection-view/collection-view.model';
import { environment } from '../../../../../environments/environment';

const BASE = `${environment.bffBaseUrl}/api/v1/search/offerings`;

describe('OfferingsService', () => {
  let service: OfferingsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(OfferingsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('builds the GET request params from the query', () => {
    const query: CollectionQuery = {
      q: 'graph',
      filters: { delivery_type: ['graduate', 'short'], state: ['DRAFT'] },
      sort: [{ field: 'label', dir: 'asc' }],
      cursor: 'CURSOR==',
      limit: 50,
    };
    service.search(query).subscribe();

    const req = httpMock.expectOne((r) => r.url === BASE);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('q')).toBe('graph');
    expect(req.request.params.getAll('filter[delivery_type]')).toEqual(['graduate', 'short']);
    expect(req.request.params.getAll('filter[state]')).toEqual(['DRAFT']);
    expect(req.request.params.get('sort')).toBe('label:asc');
    expect(req.request.params.get('cursor')).toBe('CURSOR==');
    expect(req.request.params.get('limit')).toBe('50');
    req.flush({ items: [], facets: [], next_cursor: null, total_estimate: 0 });
  });

  it('maps the wire page to the FE CollectionPage (incl. facet i18n keys)', async () => {
    const promise = firstValueFrom(service.search(EMPTY_QUERY));
    httpMock.expectOne((r) => r.url === BASE).flush({
      items: [
        {
          id: 'of1',
          tenant_id: 't1',
          course_id: 'c1',
          delivery_type: 'graduate',
          label: 'Graduate Cohort A',
          capacity: 30,
          state: 'DRAFT',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-02T00:00:00Z',
          launched_at: null,
        },
      ],
      facets: [
        { field: 'delivery_type', values: [{ value: 'graduate', label: 'graduate', count: 3 }] },
        { field: 'state', values: [{ value: 'DRAFT', label: 'DRAFT', count: 2 }] },
      ],
      next_cursor: 'NEXT==',
      total_estimate: 42,
    });

    const page = await promise;
    expect(page.items[0]).toMatchObject({
      id: 'of1',
      tenantId: 't1',
      courseId: 'c1',
      deliveryType: 'graduate',
      label: 'Graduate Cohort A',
      capacity: 30,
      state: 'DRAFT',
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-02T00:00:00Z',
      launchedAt: null,
    });
    expect(page.nextCursor).toBe('NEXT==');
    expect(page.totalEstimate).toBe(42);
    expect(page.facets[0].values[0].label).toBe('rplus.offerings.delivery_type_value.graduate');
    expect(page.facets[1].values[0].label).toBe('rplus.offerings.state_value.DRAFT');
  });

  it('defaults a missing capacity to 0 and null timestamps', async () => {
    const promise = firstValueFrom(service.search(EMPTY_QUERY));
    httpMock.expectOne((r) => r.url === BASE).flush({
      items: [
        {
          id: 'of2',
          tenant_id: 't1',
          course_id: 'c2',
          delivery_type: 'async',
          label: 'Async Track',
          state: 'LAUNCHED',
          created_at: '2026-06-05T00:00:00Z',
          updated_at: '2026-06-05T00:00:00Z',
        },
      ],
      facets: [],
      next_cursor: null,
      total_estimate: 1,
    });

    const page = await promise;
    expect(page.items[0].capacity).toBe(0);
    expect(page.items[0].launchedAt).toBeNull();
    expect(page.nextCursor).toBeNull();
  });

  it('maps a sparse/empty body to an empty page (defensive defaults)', async () => {
    const promise = firstValueFrom(service.search(EMPTY_QUERY));
    httpMock.expectOne((r) => r.url === BASE).flush({});
    const page = await promise;
    expect(page.items).toEqual([]);
    expect(page.facets).toEqual([]);
    expect(page.nextCursor).toBeNull();
    expect(page.totalEstimate).toBe(0);
  });

  it('propagates HTTP errors to the caller (fail-loud)', async () => {
    const promise = firstValueFrom(service.search(EMPTY_QUERY));
    httpMock.expectOne((r) => r.url === BASE).flush('upstream down', {
      status: 503,
      statusText: 'Service Unavailable',
    });
    await expect(promise).rejects.toMatchObject({ status: 503 });
  });

  // ── W2.D: detail + transitions + create + courses ──────────────────────

  const OFFERING_DTO = {
    id: 'of1',
    tenant_id: 't1',
    course_id: 'c1',
    delivery_type: 'graduate',
    label: 'Graduate Cohort A',
    capacity: 30,
    state: 'DRAFT',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-02T00:00:00Z',
  };

  describe('getOffering', () => {
    it('GETs the detail endpoint and maps the wire DTO', async () => {
      const promise = firstValueFrom(service.getOffering('of1'));
      const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/offerings/of1`);
      expect(req.request.method).toBe('GET');
      req.flush({ ...OFFERING_DTO, launched_at: null, concluded_at: null, archived_at: null });

      const offering = await promise;
      expect(offering).toMatchObject({
        id: 'of1',
        tenantId: 't1',
        courseId: 'c1',
        deliveryType: 'graduate',
        label: 'Graduate Cohort A',
        capacity: 30,
        state: 'DRAFT',
        launchedAt: null,
      });
    });

    it('URL-encodes the id segment', () => {
      service.getOffering('a/b').subscribe();
      httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/offerings/a%2Fb`).flush(OFFERING_DTO);
    });

    it('propagates a 404 (fail-loud, no placeholder)', async () => {
      const promise = firstValueFrom(service.getOffering('missing'));
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/missing`)
        .flush('not found', { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('transition', () => {
    it.each(['launch', 'start', 'conclude', 'archive'] as const)(
      'PATCHes /%s with an empty body and maps the result',
      async (action) => {
        const promise = firstValueFrom(service.transition('of1', action));
        const req = httpMock.expectOne(
          `${environment.bffBaseUrl}/api/v1/offerings/of1/${action}`,
        );
        expect(req.request.method).toBe('PATCH');
        expect(req.request.body).toEqual({});
        req.flush({ ...OFFERING_DTO, state: 'LAUNCHED' });

        const offering = await promise;
        expect(offering.state).toBe('LAUNCHED');
      },
    );

    it('propagates a 409 illegal-transition (fail-loud)', async () => {
      const promise = firstValueFrom(service.transition('of1', 'start'));
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/of1/start`)
        .flush({ error: 'illegal transition' }, { status: 409, statusText: 'Conflict' });
      await expect(promise).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('createOffering', () => {
    it('POSTs the snake_case body (course_ids array) and maps the 201', async () => {
      const promise = firstValueFrom(
        service.createOffering({
          courseIds: ['c1', 'c2'],
          deliveryType: 'short',
          label: 'Short Course B',
          capacity: 12,
        }),
      );
      const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/offerings`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        course_ids: ['c1', 'c2'],
        delivery_type: 'short',
        label: 'Short Course B',
        capacity: 12,
      });
      req.flush({
        ...OFFERING_DTO,
        id: 'of9',
        delivery_type: 'short',
        label: 'Short Course B',
        course_ids: ['c1', 'c2'],
      });

      const offering = await promise;
      expect(offering.id).toBe('of9');
      expect(offering.deliveryType).toBe('short');
      // Response carries BOTH the primary `course_id` (back-compat) and the
      // full `course_ids` list — the FE reads the list.
      expect(offering.courseId).toBe('c1');
      expect([...offering.courseIds]).toEqual(['c1', 'c2']);
    });

    it('derives courseIds from the primary course_id when the list is absent (back-compat)', async () => {
      const promise = firstValueFrom(service.getOffering('of1'));
      // Legacy / search-projection rows may omit `course_ids`.
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/of1`)
        .flush({ ...OFFERING_DTO });
      const offering = await promise;
      expect([...offering.courseIds]).toEqual(['c1']);
    });

    it('propagates a 400 validation error (fail-loud)', async () => {
      const promise = firstValueFrom(
        service.createOffering({ courseIds: ['c1'], deliveryType: 'graduate', label: '', capacity: 0 }),
      );
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings`)
        .flush({ error: 'label required' }, { status: 400, statusText: 'Bad Request' });
      await expect(promise).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('listCourses', () => {
    it('GETs PUBLISHED courses and maps to {id,label}', async () => {
      const promise = firstValueFrom(service.listCourses());
      const req = httpMock.expectOne(
        (r) => r.url === `${environment.bffBaseUrl}/api/v1/courses`,
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('state')).toBe('PUBLISHED');
      expect(req.request.params.get('page_size')).toBe('50');
      req.flush({
        items: [
          { id: 'c1', title: 'Certified Scrum Product Owner' },
          { id: 'c2', title: 'Data Engineering Foundations' },
        ],
      });

      const courses = await promise;
      expect(courses).toEqual([
        { id: 'c1', label: 'Certified Scrum Product Owner' },
        { id: 'c2', label: 'Data Engineering Foundations' },
      ]);
    });

    it('maps a sparse body to an empty list', async () => {
      const promise = firstValueFrom(service.listCourses());
      httpMock
        .expectOne((r) => r.url === `${environment.bffBaseUrl}/api/v1/courses`)
        .flush({});
      expect(await promise).toEqual([]);
    });
  });

  // ── W3.A: offering assessments (list / attach / detach) + test-set picker ──

  const ASSESSMENT_DTO = {
    assessment_id: 'as1',
    offering_id: 'of1',
    test_set_id: 'ts1',
    title: 'Midterm Assessment',
    state: 'DRAFT',
    question_count: 10,
    total_points: 100,
    scheduled_open_at: null,
    scheduled_close_at: null,
    created_at: '2026-06-10T00:00:00Z',
  };

  describe('listOfferingAssessments', () => {
    it('GETs /offerings/:id/assessments and maps the wire items', async () => {
      const promise = firstValueFrom(service.listOfferingAssessments('of1'));
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/offerings/of1/assessments`,
      );
      expect(req.request.method).toBe('GET');
      req.flush({ items: [ASSESSMENT_DTO], next_page_token: null });

      const items = await promise;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        id: 'as1',
        offeringId: 'of1',
        testSetId: 'ts1',
        title: 'Midterm Assessment',
        state: 'DRAFT',
        questionCount: 10,
        totalPoints: 100,
        scheduledOpenAt: null,
        scheduledCloseAt: null,
        createdAt: '2026-06-10T00:00:00Z',
      });
    });

    it('defaults missing counts to 0 and missing windows to null; preserves windows when present', async () => {
      const promise = firstValueFrom(service.listOfferingAssessments('of1'));
      httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/offerings/of1/assessments`).flush({
        items: [
          // sparse row: no question_count / total_points / scheduled_* fields
          {
            assessment_id: 'as-sparse',
            offering_id: 'of1',
            test_set_id: 'ts1',
            title: 'Sparse',
            state: 'OPEN',
            created_at: '2026-06-11T00:00:00Z',
          },
          // populated window row
          {
            assessment_id: 'as-window',
            offering_id: 'of1',
            test_set_id: 'ts2',
            title: 'Windowed',
            state: 'SCHEDULED',
            question_count: 5,
            total_points: 50,
            scheduled_open_at: '2026-07-01T00:00:00Z',
            scheduled_close_at: '2026-07-02T00:00:00Z',
            created_at: '2026-06-11T00:00:00Z',
          },
        ],
        next_page_token: null,
      });
      const items = await promise;
      expect(items[0]).toMatchObject({
        questionCount: 0,
        totalPoints: 0,
        scheduledOpenAt: null,
        scheduledCloseAt: null,
      });
      expect(items[1]).toMatchObject({
        questionCount: 5,
        totalPoints: 50,
        scheduledOpenAt: '2026-07-01T00:00:00Z',
        scheduledCloseAt: '2026-07-02T00:00:00Z',
      });
    });

    it('URL-encodes the offering id segment', () => {
      service.listOfferingAssessments('a/b').subscribe();
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/a%2Fb/assessments`)
        .flush({ items: [], next_page_token: null });
    });

    it('maps a sparse/empty body to an empty list (defensive)', async () => {
      const promise = firstValueFrom(service.listOfferingAssessments('of1'));
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/of1/assessments`)
        .flush({});
      expect(await promise).toEqual([]);
    });

    it('propagates HTTP errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.listOfferingAssessments('of1'));
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/of1/assessments`)
        .flush('boom', { status: 503, statusText: 'Service Unavailable' });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('attachAssessment', () => {
    it('POSTs the minimal snake_case body and maps the 201', async () => {
      const promise = firstValueFrom(service.attachAssessment('of1', { testSetId: 'ts1' }));
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/offerings/of1/assessments`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ test_set_id: 'ts1' });
      req.flush(ASSESSMENT_DTO, { status: 201, statusText: 'Created' });

      const a = await promise;
      expect(a).toMatchObject({ id: 'as1', testSetId: 'ts1', state: 'DRAFT' });
    });

    it('serialises optional fields when present (blanks omitted)', () => {
      service
        .attachAssessment('of1', {
          testSetId: 'ts1',
          titleOverride: 'Final',
          scheduledOpenAt: '2026-07-01T00:00:00Z',
          scheduledCloseAt: '2026-07-02T00:00:00Z',
          maxAttempts: 3,
        })
        .subscribe();
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/offerings/of1/assessments`,
      );
      expect(req.request.body).toEqual({
        test_set_id: 'ts1',
        title_override: 'Final',
        scheduled_open_at: '2026-07-01T00:00:00Z',
        scheduled_close_at: '2026-07-02T00:00:00Z',
        max_attempts: 3,
      });
      req.flush(ASSESSMENT_DTO, { status: 201, statusText: 'Created' });
    });

    it('propagates a 400 (test-set not PUBLISHED) fail-loud', async () => {
      const promise = firstValueFrom(service.attachAssessment('of1', { testSetId: 'ts1' }));
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/of1/assessments`)
        .flush({ error: 'not published' }, { status: 400, statusText: 'Bad Request' });
      await expect(promise).rejects.toMatchObject({ status: 400 });
    });

    it('propagates a 404 (offering missing) fail-loud', async () => {
      const promise = firstValueFrom(
        service.attachAssessment('missing', { testSetId: 'ts1' }),
      );
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/missing/assessments`)
        .flush('no offering', { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('detachAssessment', () => {
    it('POSTs to the assessment archive endpoint with an empty body', () => {
      service.detachAssessment('as1').subscribe();
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/assessments/as1/archive`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({});
    });

    it('URL-encodes the assessment id', () => {
      service.detachAssessment('a/b').subscribe();
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/assessments/a%2Fb/archive`)
        .flush({});
    });

    it('propagates HTTP errors (fail-loud)', async () => {
      const promise = firstValueFrom(service.detachAssessment('as1'));
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/assessments/as1/archive`)
        .flush('boom', { status: 500, statusText: 'Server Error' });
      await expect(promise).rejects.toMatchObject({ status: 500 });
    });
  });

  describe('listPublishedTestSets', () => {
    const TS_PUBLISHED = {
      test_set_id: 'ts1',
      tenant_id: 't1',
      author_gcid: 'g1',
      title: 'Agile Estimation',
      state: 'PUBLISHED',
      total_points: 100,
      question_count: 10,
      created_at: '2026-05-10T00:00:00Z',
      updated_at: '2026-05-12T00:00:00Z',
      published_at: '2026-05-12T00:00:00Z',
    };
    const TS_DRAFT = { ...TS_PUBLISHED, test_set_id: 'ts2', title: 'Draft set', state: 'DRAFT' };

    it('GETs /test-sets?state=PUBLISHED and maps to summaries', async () => {
      const promise = firstValueFrom(service.listPublishedTestSets());
      const req = httpMock.expectOne(
        (r) => r.url === `${environment.bffBaseUrl}/api/v1/test-sets`,
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('state')).toBe('PUBLISHED');
      req.flush({ items: [TS_PUBLISHED], next_page_token: null, total: 1 });

      const items = await promise;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        id: 'ts1',
        title: 'Agile Estimation',
        state: 'PUBLISHED',
        questionCount: 10,
        totalPoints: 100,
      });
    });

    it('defensively filters out any non-PUBLISHED row the server returns', async () => {
      const promise = firstValueFrom(service.listPublishedTestSets());
      httpMock
        .expectOne((r) => r.url === `${environment.bffBaseUrl}/api/v1/test-sets`)
        .flush({ items: [TS_PUBLISHED, TS_DRAFT], next_page_token: null, total: 2 });
      const items = await promise;
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('ts1');
    });

    it('defaults a missing question_count / total_points to 0', async () => {
      const promise = firstValueFrom(service.listPublishedTestSets());
      httpMock.expectOne((r) => r.url === `${environment.bffBaseUrl}/api/v1/test-sets`).flush({
        items: [
          { test_set_id: 'ts9', title: 'Sparse Set', state: 'PUBLISHED' },
        ],
        next_page_token: null,
      });
      const items = await promise;
      expect(items[0]).toMatchObject({
        id: 'ts9',
        title: 'Sparse Set',
        state: 'PUBLISHED',
        questionCount: 0,
        totalPoints: 0,
      });
    });

    it('maps a sparse body to an empty list', async () => {
      const promise = firstValueFrom(service.listPublishedTestSets());
      httpMock
        .expectOne((r) => r.url === `${environment.bffBaseUrl}/api/v1/test-sets`)
        .flush({});
      expect(await promise).toEqual([]);
    });

    it('propagates HTTP errors (fail-loud)', async () => {
      const promise = firstValueFrom(service.listPublishedTestSets());
      httpMock
        .expectOne((r) => r.url === `${environment.bffBaseUrl}/api/v1/test-sets`)
        .flush('down', { status: 503, statusText: 'Unavailable' });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  // ── W2.D: offering curriculum (read-only attached-course outline) ──────────

  describe('getOfferingCurriculum', () => {
    function curriculumUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/curriculum`;
    }

    it('GETs /offerings/:id/curriculum and maps the wire courses + items', async () => {
      const promise = firstValueFrom(service.getOfferingCurriculum('of1'));
      const req = httpMock.expectOne(curriculumUrl('of1'));
      expect(req.request.method).toBe('GET');
      req.flush({
        courses: [
          {
            id: 'c1',
            title: 'Calculus I',
            items: [
              { item_id: 'it1', kind: 'atom', title: 'Limits', position: 0 },
              { item_id: 'it2', kind: 'youtube', title: 'Derivatives', position: 1 },
            ],
          },
        ],
      });

      const courses = await promise;
      expect(courses).toHaveLength(1);
      expect(courses[0]).toMatchObject({ id: 'c1', title: 'Calculus I' });
      expect(courses[0].items).toHaveLength(2);
      expect(courses[0].items[0]).toMatchObject({
        itemId: 'it1',
        kind: 'atom',
        title: 'Limits',
        position: 0,
      });
      expect(courses[0].items[1]).toMatchObject({
        itemId: 'it2',
        kind: 'youtube',
        title: 'Derivatives',
        position: 1,
      });
    });

    it('maps a course with an empty outline to an empty items array', async () => {
      const promise = firstValueFrom(service.getOfferingCurriculum('of1'));
      httpMock
        .expectOne(curriculumUrl('of1'))
        .flush({ courses: [{ id: 'c1', title: 'Empty', items: [] }] });
      const courses = await promise;
      expect(courses[0].items).toEqual([]);
    });

    it('defaults a missing course title to "" and a missing item position to 0', async () => {
      const promise = firstValueFrom(service.getOfferingCurriculum('of1'));
      // BE emits title:"" when a course is not resolvable; a sparse item omits
      // position — both degrade defensively at the mapping boundary.
      httpMock.expectOne(curriculumUrl('of1')).flush({
        courses: [{ id: 'c1', items: [{ item_id: 'it1', kind: 'atom', title: 'Limits' }] }],
      });
      const courses = await promise;
      expect(courses[0].title).toBe('');
      expect(courses[0].items[0].position).toBe(0);
    });

    it('URL-encodes the offering id segment', () => {
      service.getOfferingCurriculum('a/b').subscribe();
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/a%2Fb/curriculum`)
        .flush({ courses: [] });
    });

    it('maps a sparse/empty body to an empty list (defensive)', async () => {
      const promise = firstValueFrom(service.getOfferingCurriculum('of1'));
      httpMock.expectOne(curriculumUrl('of1')).flush({});
      expect(await promise).toEqual([]);
    });

    it('propagates HTTP errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.getOfferingCurriculum('of1'));
      httpMock
        .expectOne(curriculumUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Service Unavailable' });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  // ── W2.D: offering certification (read-only attached-course cert config) ────

  describe('getOfferingCertification', () => {
    function certUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/certification`;
    }

    it('GETs /offerings/:id/certification and maps the wire courses + cert config', async () => {
      const promise = firstValueFrom(service.getOfferingCertification('of1'));
      const req = httpMock.expectOne(certUrl('of1'));
      expect(req.request.method).toBe('GET');
      req.flush({
        courses: [
          {
            id: 'c1',
            title: 'Calculus I',
            certifications: [
              {
                enabled: true,
                cert_type: 'COMPETENCY',
                passing_score_pct: 70,
                require_all_content: true,
              },
            ],
          },
        ],
      });

      const { courses, completionPolicy } = await promise;
      expect(courses).toHaveLength(1);
      expect(courses[0]).toMatchObject({ id: 'c1', title: 'Calculus I' });
      expect(courses[0].certifications).toHaveLength(1);
      expect(courses[0].certifications[0]).toMatchObject({
        enabled: true,
        certType: 'COMPETENCY',
        passingScorePct: 70,
        requireAllContent: true,
      });
      // No completion policy in the payload → null (never fabricated).
      expect(completionPolicy).toBeNull();
    });

    it('maps the offering-level completion policy when present (S2)', async () => {
      const promise = firstValueFrom(service.getOfferingCertification('of1'));
      httpMock.expectOne(certUrl('of1')).flush({
        courses: [],
        completion_policy: {
          awards_certificate: true,
          passing_score_pct: 80,
          cert_title: 'Certificate of Completion',
          updated_at: '2026-07-07T00:00:00Z',
        },
      });
      const { courses, completionPolicy } = await promise;
      expect(courses).toEqual([]);
      expect(completionPolicy).toEqual({
        awardsCertificate: true,
        passingScorePct: 80,
        certTitle: 'Certificate of Completion',
        updatedAt: '2026-07-07T00:00:00Z',
      });
    });

    it('maps a course with no cert config to an empty certifications array', async () => {
      const promise = firstValueFrom(service.getOfferingCertification('of1'));
      httpMock
        .expectOne(certUrl('of1'))
        .flush({ courses: [{ id: 'c1', title: 'Uncertified', certifications: [] }] });
      const { courses } = await promise;
      expect(courses[0].certifications).toEqual([]);
    });

    it('defaults a missing course title to "" and sparse cert fields to zero-values', async () => {
      const promise = firstValueFrom(service.getOfferingCertification('of1'));
      // BE emits title:"" when a course is not resolvable; a sparse cert omits
      // optional fields — both degrade defensively at the mapping boundary.
      httpMock.expectOne(certUrl('of1')).flush({
        courses: [{ id: 'c1', certifications: [{ enabled: true }] }],
      });
      const { courses } = await promise;
      expect(courses[0].title).toBe('');
      expect(courses[0].certifications[0]).toMatchObject({
        certType: '',
        passingScorePct: 0,
        requireAllContent: false,
      });
    });

    it('URL-encodes the offering id segment', () => {
      service.getOfferingCertification('a/b').subscribe();
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/a%2Fb/certification`)
        .flush({ courses: [] });
    });

    it('maps a sparse/empty body to an empty list + null policy (defensive)', async () => {
      const promise = firstValueFrom(service.getOfferingCertification('of1'));
      httpMock.expectOne(certUrl('of1')).flush({});
      expect(await promise).toEqual({ courses: [], completionPolicy: null });
    });

    it('propagates HTTP errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.getOfferingCertification('of1'));
      httpMock
        .expectOne(certUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Service Unavailable' });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  // ── R+ Phase-2 S2: set the offering-level completion policy (CHO-2054) ─────

  describe('setCompletionPolicy', () => {
    function certUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/certification`;
    }

    it('PATCHes the snake_case body and maps the saved policy (200)', async () => {
      const promise = firstValueFrom(
        service.setCompletionPolicy('of1', {
          awardsCertificate: true,
          passingScorePct: 75,
          certTitle: 'Cert of Completion',
        }),
      );
      const req = httpMock.expectOne(certUrl('of1'));
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({
        awards_certificate: true,
        passing_score_pct: 75,
        cert_title: 'Cert of Completion',
      });
      req.flush({
        awards_certificate: true,
        passing_score_pct: 75,
        cert_title: 'Cert of Completion',
        updated_at: '2026-07-07T12:00:00Z',
      });
      expect(await promise).toEqual({
        awardsCertificate: true,
        passingScorePct: 75,
        certTitle: 'Cert of Completion',
        updatedAt: '2026-07-07T12:00:00Z',
      });
    });

    it('propagates a 400 (score out of range) fail-loud', async () => {
      const promise = firstValueFrom(
        service.setCompletionPolicy('of1', {
          awardsCertificate: true,
          passingScorePct: 250,
          certTitle: 'X',
        }),
      );
      httpMock
        .expectOne(certUrl('of1'))
        .flush({ error: 'passing_score_pct must be in [0,100]' }, {
          status: 400,
          statusText: 'Bad Request',
        });
      await expect(promise).rejects.toMatchObject({ status: 400 });
    });

    it('URL-encodes the offering id segment', () => {
      service
        .setCompletionPolicy('a/b', {
          awardsCertificate: false,
          passingScorePct: 0,
          certTitle: '',
        })
        .subscribe();
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/a%2Fb/certification`)
        .flush({ awards_certificate: false, passing_score_pct: 0, cert_title: '' });
    });
  });

  // ── R+ Phase-2 S3: admin enrol a learner into a course (CHO-2053) ──────────

  describe('enrolLearner', () => {
    function rosterUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/roster`;
    }

    it('POSTs {course_id,gcid} and maps the 201 enrolment', async () => {
      const promise = firstValueFrom(
        service.enrolLearner('of1', { courseId: 'c1', gcid: 'g-77' }),
      );
      const req = httpMock.expectOne(rosterUrl('of1'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ course_id: 'c1', gcid: 'g-77' });
      req.flush(
        {
          enrollment_id: 'en1',
          course_id: 'c1',
          gcid: 'g-77',
          status: 'ACTIVE',
          enrolled_at: '2026-07-07T00:00:00Z',
        },
        { status: 201, statusText: 'Created' },
      );
      expect(await promise).toEqual({
        enrollmentId: 'en1',
        courseId: 'c1',
        gcid: 'g-77',
        status: 'ACTIVE',
        enrolledAt: '2026-07-07T00:00:00Z',
      });
    });

    it('propagates a 409 (at capacity) fail-loud', async () => {
      const promise = firstValueFrom(
        service.enrolLearner('of1', { courseId: 'c1', gcid: 'g-1' }),
      );
      httpMock
        .expectOne(rosterUrl('of1'))
        .flush({ error: 'offering is at capacity' }, { status: 409, statusText: 'Conflict' });
      await expect(promise).rejects.toMatchObject({ status: 409 });
    });

    it('propagates a 400 (course not attached) fail-loud', async () => {
      const promise = firstValueFrom(
        service.enrolLearner('of1', { courseId: 'nope', gcid: 'g-1' }),
      );
      httpMock
        .expectOne(rosterUrl('of1'))
        .flush({ error: 'course_id is not attached to this offering' }, {
          status: 400,
          statusText: 'Bad Request',
        });
      await expect(promise).rejects.toMatchObject({ status: 400 });
    });
  });

  // ── R+ Phase-2 WS-B: admin unenrol a learner from an attached course ───────

  describe('removeLearner', () => {
    function rosterRemoveUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/roster/remove`;
    }

    it('POSTs {course_id,gcid} to /roster/remove and resolves void on 204', async () => {
      const promise = firstValueFrom(
        service.removeLearner('of1', { courseId: 'c1', gcid: 'g-77' }),
      );
      const req = httpMock.expectOne(rosterRemoveUrl('of1'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ course_id: 'c1', gcid: 'g-77' });
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect(await promise).toBeUndefined();
    });

    it('URL-encodes the offering id', () => {
      service.removeLearner('a/b', { courseId: 'c1', gcid: 'g-1' }).subscribe();
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/a%2Fb/roster/remove`)
        .flush(null, { status: 204, statusText: 'No Content' });
    });

    it('propagates a 404 (enrolment not found) fail-loud', async () => {
      const promise = firstValueFrom(
        service.removeLearner('of1', { courseId: 'c1', gcid: 'g-1' }),
      );
      httpMock
        .expectOne(rosterRemoveUrl('of1'))
        .flush({ error: 'enrolment not found' }, { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ status: 404 });
    });

    it('propagates a 400 (course not attached) fail-loud', async () => {
      const promise = firstValueFrom(
        service.removeLearner('of1', { courseId: 'nope', gcid: 'g-1' }),
      );
      httpMock
        .expectOne(rosterRemoveUrl('of1'))
        .flush({ error: 'course_id is not attached to this offering' }, {
          status: 400,
          statusText: 'Bad Request',
        });
      await expect(promise).rejects.toMatchObject({ status: 400 });
    });
  });

  // ── R+ per-offering MANUAL certificate issuance ────────────────────────────

  describe('issueCertificate', () => {
    function issueUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/certification/issue`;
    }

    it('POSTs {learner_gcid} (no course_id when omitted) and maps the 201', async () => {
      const promise = firstValueFrom(
        service.issueCertificate('of1', { learnerGcid: 'g-77' }),
      );
      const req = httpMock.expectOne(issueUrl('of1'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ learner_gcid: 'g-77' });
      req.flush(
        { certification_id: 'cert-1', course_id: 'c1', gcid: 'g-77' },
        { status: 201, statusText: 'Created' },
      );
      expect(await promise).toEqual({
        certificationId: 'cert-1',
        courseId: 'c1',
        gcid: 'g-77',
      });
    });

    it('includes course_id in the body when provided', () => {
      service.issueCertificate('of1', { learnerGcid: 'g-77', courseId: 'c2' }).subscribe();
      const req = httpMock.expectOne(issueUrl('of1'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ learner_gcid: 'g-77', course_id: 'c2' });
      req.flush({ certification_id: 'cert-2', course_id: 'c2', gcid: 'g-77' }, {
        status: 201,
        statusText: 'Created',
      });
    });

    it('propagates a 409 (already holds a certificate) fail-loud', async () => {
      const promise = firstValueFrom(
        service.issueCertificate('of1', { learnerGcid: 'g-1' }),
      );
      httpMock
        .expectOne(issueUrl('of1'))
        .flush({ error: 'learner already holds a certificate for this course' }, {
          status: 409,
          statusText: 'Conflict',
        });
      await expect(promise).rejects.toMatchObject({ status: 409 });
    });

    it('URL-encodes the offering id segment', () => {
      service.issueCertificate('a/b', { learnerGcid: 'g-1' }).subscribe();
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/a%2Fb/certification/issue`)
        .flush({ certification_id: 'cert-3', course_id: 'c1', gcid: 'g-1' }, {
          status: 201,
          statusText: 'Created',
        });
    });
  });

  // ── R+ Phase-2 S4: edit a section's detail (CHO-2051) ──────────────────────

  describe('updateSection', () => {
    function sectionUrl(id: string, sectionId: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/sections/${sectionId}`;
    }
    const UPDATED = {
      section_id: 'sec1',
      name: 'Evening Cohort',
      lead_instructor_gcid: 'g9',
      room: 'Room 7',
      start_date: '2026-09-02',
      end_date: '2026-12-16',
      created_at: '2026-06-10T00:00:00Z',
      updated_at: '2026-07-07T00:00:00Z',
    };

    it('PATCHes only the provided (changed) fields and maps the 200', async () => {
      const promise = firstValueFrom(
        service.updateSection('of1', 'sec1', { name: 'Evening Cohort', room: 'Room 7' }),
      );
      const req = httpMock.expectOne(sectionUrl('of1', 'sec1'));
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ name: 'Evening Cohort', room: 'Room 7' });
      req.flush(UPDATED);
      expect(await promise).toMatchObject({
        sectionId: 'sec1',
        name: 'Evening Cohort',
        room: 'Room 7',
      });
    });

    it('sends an empty body when the patch has no fields', () => {
      service.updateSection('of1', 'sec1', {}).subscribe();
      const req = httpMock.expectOne(sectionUrl('of1', 'sec1'));
      expect(req.request.body).toEqual({});
      req.flush(UPDATED);
    });

    it('serialises an explicit blank field (clearing room) rather than dropping it', () => {
      service.updateSection('of1', 'sec1', { room: '' }).subscribe();
      const req = httpMock.expectOne(sectionUrl('of1', 'sec1'));
      expect(req.request.body).toEqual({ room: '' });
      req.flush(UPDATED);
    });

    it('propagates a 404 (missing section) fail-loud', async () => {
      const promise = firstValueFrom(
        service.updateSection('of1', 'missing', { name: 'X' }),
      );
      httpMock
        .expectOne(sectionUrl('of1', 'missing'))
        .flush({ error: 'section not found' }, { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ status: 404 });
    });

    it('URL-encodes both id segments', () => {
      service.updateSection('a/b', 's/1', { name: 'X' }).subscribe();
      httpMock
        .expectOne(
          `${environment.bffBaseUrl}/api/v1/offerings/a%2Fb/sections/s%2F1`,
        )
        .flush(UPDATED);
    });
  });

  // ── W7: offering roster (read-only per-course learner roster) ──────────────

  describe('getOfferingRoster', () => {
    function rosterUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/roster`;
    }

    it('GETs /offerings/:id/roster and maps the wire courses + learners + distinct count', async () => {
      const promise = firstValueFrom(service.getOfferingRoster('of1'));
      const req = httpMock.expectOne(rosterUrl('of1'));
      expect(req.request.method).toBe('GET');
      req.flush({
        courses: [
          {
            id: 'c1',
            title: 'Calculus I',
            learner_count: 1,
            learners: [
              {
                gcid: 'g1',
                display_name: 'Ada',
                progress_pct: 40,
                enrolled_at: '2026-06-01T00:00:00Z',
              },
            ],
          },
        ],
        distinct_learner_count: 1,
      });

      const roster = await promise;
      expect(roster.distinctLearnerCount).toBe(1);
      expect(roster.courses).toHaveLength(1);
      expect(roster.courses[0]).toMatchObject({ id: 'c1', title: 'Calculus I', learnerCount: 1 });
      expect(roster.courses[0].learners[0]).toMatchObject({
        gcid: 'g1',
        displayName: 'Ada',
        progressPct: 40,
        enrolledAt: '2026-06-01T00:00:00Z',
      });
    });

    it('maps a course with no enrolments to an empty learners array', async () => {
      const promise = firstValueFrom(service.getOfferingRoster('of1'));
      httpMock.expectOne(rosterUrl('of1')).flush({
        courses: [{ id: 'c1', title: 'Empty', learner_count: 0, learners: [] }],
        distinct_learner_count: 0,
      });
      const roster = await promise;
      expect(roster.courses[0].learners).toEqual([]);
      expect(roster.courses[0].learnerCount).toBe(0);
    });

    it('falls back display_name to gcid + derives learner_count when sparse', async () => {
      const promise = firstValueFrom(service.getOfferingRoster('of1'));
      // The BE always sends display_name=gcid + learner_count, but the mapper
      // degrades defensively: missing title → ''; missing display_name → gcid;
      // missing learner_count → the learners length; missing counts → 0.
      httpMock.expectOne(rosterUrl('of1')).flush({
        courses: [{ id: 'c1', learners: [{ gcid: 'g9' }] }],
      });
      const roster = await promise;
      expect(roster.courses[0].title).toBe('');
      expect(roster.courses[0].learnerCount).toBe(1);
      expect(roster.courses[0].learners[0]).toMatchObject({
        gcid: 'g9',
        displayName: 'g9',
        progressPct: 0,
        enrolledAt: '',
      });
      expect(roster.distinctLearnerCount).toBe(0);
    });

    it('URL-encodes the offering id segment', () => {
      service.getOfferingRoster('a/b').subscribe();
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/a%2Fb/roster`)
        .flush({ courses: [], distinct_learner_count: 0 });
    });

    it('maps a sparse/empty body defensively', async () => {
      const promise = firstValueFrom(service.getOfferingRoster('of1'));
      httpMock.expectOne(rosterUrl('of1')).flush({});
      const roster = await promise;
      expect(roster.courses).toEqual([]);
      expect(roster.distinctLearnerCount).toBe(0);
    });

    it('propagates HTTP errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.getOfferingRoster('of1'));
      httpMock
        .expectOne(rosterUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Service Unavailable' });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  // ── W7: offering analytics (read-only delivery-local roll-up, async) ───────

  describe('getOfferingAnalytics', () => {
    function analyticsUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/analytics`;
    }

    it('GETs /offerings/:id/analytics and maps the wire roll-up', async () => {
      const promise = firstValueFrom(service.getOfferingAnalytics('of1'));
      const req = httpMock.expectOne(analyticsUrl('of1'));
      expect(req.request.method).toBe('GET');
      req.flush({
        state: 'LAUNCHED',
        capacity: 10,
        capacity_unbounded: false,
        capacity_utilisation_pct: 30,
        total_enrollments: 4,
        distinct_learners: 3,
        assessment_count: 2,
        launched_at: '2026-06-01T00:00:00Z',
        concluded_at: null,
        courses: [{ id: 'c1', title: 'Course A', enrollments: 2 }],
      });

      const a = await promise;
      expect(a).toMatchObject({
        state: 'LAUNCHED',
        capacity: 10,
        capacityUnbounded: false,
        capacityUtilisationPct: 30,
        totalEnrollments: 4,
        distinctLearners: 3,
        assessmentCount: 2,
        launchedAt: '2026-06-01T00:00:00Z',
        concludedAt: null,
      });
      expect(a.courses[0]).toMatchObject({ id: 'c1', title: 'Course A', enrollments: 2 });
    });

    it('maps the progress + completion roll-up (CHO-1827 BE fields)', async () => {
      const promise = firstValueFrom(service.getOfferingAnalytics('of1'));
      httpMock.expectOne(analyticsUrl('of1')).flush({
        total_enrollments: 4,
        avg_progress_pct: 62,
        completion_rate_pct: 25,
        completed_enrollments: 1,
        courses: [
          {
            id: 'c1',
            title: 'Course A',
            enrollments: 2,
            avg_progress_pct: 50,
            completion_rate_pct: 50,
            completed_learners: 1,
          },
        ],
      });
      const a = await promise;
      expect(a).toMatchObject({
        avgProgressPct: 62,
        completionRatePct: 25,
        completedEnrollments: 1,
      });
      expect(a.courses[0]).toMatchObject({
        avgProgressPct: 50,
        completionRatePct: 50,
        completedLearners: 1,
      });
    });

    // The BE returns null (NOT 0) when an offering has no enrolments: "nobody has
    // made progress" and "there is nobody" are different facts. Collapsing null to
    // 0 here would re-introduce exactly the lie the BE refuses to tell.
    it('preserves null progress/completion rather than collapsing it to 0', async () => {
      const promise = firstValueFrom(service.getOfferingAnalytics('of1'));
      httpMock.expectOne(analyticsUrl('of1')).flush({
        total_enrollments: 0,
        avg_progress_pct: null,
        completion_rate_pct: null,
        completed_enrollments: 0,
        courses: [
          { id: 'c1', enrollments: 0, avg_progress_pct: null, completion_rate_pct: null },
        ],
      });
      const a = await promise;
      expect(a.avgProgressPct).toBeNull();
      expect(a.completionRatePct).toBeNull();
      expect(a.courses[0]?.avgProgressPct).toBeNull();
      expect(a.courses[0]?.completionRatePct).toBeNull();
    });

    // A genuinely absent field (old BE, sparse body) is also "unknown", not 0.
    it('maps missing progress/completion fields to null, not 0', async () => {
      const promise = firstValueFrom(service.getOfferingAnalytics('of1'));
      httpMock.expectOne(analyticsUrl('of1')).flush({ total_enrollments: 2, courses: [] });
      const a = await promise;
      expect(a.avgProgressPct).toBeNull();
      expect(a.completionRatePct).toBeNull();
      expect(a.completedEnrollments).toBe(0);
    });

    it('maps unbounded capacity (null utilisation) defensively', async () => {
      const promise = firstValueFrom(service.getOfferingAnalytics('of1'));
      httpMock.expectOne(analyticsUrl('of1')).flush({
        capacity: 0,
        capacity_unbounded: true,
        capacity_utilisation_pct: null,
        total_enrollments: 5,
        distinct_learners: 5,
      });
      const a = await promise;
      expect(a.capacityUnbounded).toBe(true);
      expect(a.capacityUtilisationPct).toBeNull();
      expect(a.courses).toEqual([]);
    });

    it('URL-encodes the offering id segment', () => {
      service.getOfferingAnalytics('a/b').subscribe();
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/a%2Fb/analytics`)
        .flush({ courses: [] });
    });

    it('maps a sparse/empty body defensively', async () => {
      const promise = firstValueFrom(service.getOfferingAnalytics('of1'));
      httpMock.expectOne(analyticsUrl('of1')).flush({});
      const a = await promise;
      expect(a).toMatchObject({
        state: '',
        totalEnrollments: 0,
        distinctLearners: 0,
        assessmentCount: 0,
        capacityUtilisationPct: null,
      });
      expect(a.courses).toEqual([]);
    });

    it('propagates HTTP errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.getOfferingAnalytics('of1'));
      httpMock
        .expectOne(analyticsUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Service Unavailable' });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  // ── W7: offering sections (intra-cohort sub-groups; list + create) ─────────

  describe('getOfferingSections', () => {
    function sectionsUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/sections`;
    }

    it('GETs /offerings/:id/sections and maps the wire rows', async () => {
      const promise = firstValueFrom(service.getOfferingSections('of1'));
      const req = httpMock.expectOne(sectionsUrl('of1'));
      expect(req.request.method).toBe('GET');
      req.flush({
        sections: [
          {
            section_id: 'sec1',
            name: 'Morning Cohort',
            lead_instructor_gcid: 'g1',
            room: 'Room 204',
            start_date: '2026-09-01',
            end_date: '2026-12-15',
            created_at: '2026-06-10T00:00:00Z',
            updated_at: '2026-06-10T00:00:00Z',
          },
        ],
      });

      const sections = await promise;
      expect(sections).toHaveLength(1);
      expect(sections[0]).toMatchObject({
        sectionId: 'sec1',
        name: 'Morning Cohort',
        leadInstructorGcid: 'g1',
        room: 'Room 204',
        startDate: '2026-09-01',
        endDate: '2026-12-15',
      });
    });

    it('defaults sparse optional fields to empty strings', async () => {
      const promise = firstValueFrom(service.getOfferingSections('of1'));
      httpMock
        .expectOne(sectionsUrl('of1'))
        .flush({ sections: [{ section_id: 'sec2', name: 'Bare' }] });
      const sections = await promise;
      expect(sections[0]).toMatchObject({
        sectionId: 'sec2',
        name: 'Bare',
        leadInstructorGcid: '',
        room: '',
        startDate: '',
        endDate: '',
      });
    });

    it('URL-encodes the offering id segment', () => {
      service.getOfferingSections('a/b').subscribe();
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/a%2Fb/sections`)
        .flush({ sections: [] });
    });

    it('maps a sparse/empty body to an empty list (defensive)', async () => {
      const promise = firstValueFrom(service.getOfferingSections('of1'));
      httpMock.expectOne(sectionsUrl('of1')).flush({});
      expect(await promise).toEqual([]);
    });

    it('propagates HTTP errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.getOfferingSections('of1'));
      httpMock
        .expectOne(sectionsUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Service Unavailable' });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('createOfferingSection', () => {
    function sectionsUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/sections`;
    }
    const SECTION_DTO = {
      section_id: 'sec1',
      name: 'Morning Cohort',
      lead_instructor_gcid: 'g1',
      room: 'Room 204',
      start_date: '2026-09-01',
      end_date: '2026-12-15',
      created_at: '2026-06-10T00:00:00Z',
      updated_at: '2026-06-10T00:00:00Z',
    };

    it('POSTs the minimal snake_case body (name only) and maps the 201', async () => {
      const promise = firstValueFrom(
        service.createOfferingSection('of1', { name: 'Morning Cohort' }),
      );
      const req = httpMock.expectOne(sectionsUrl('of1'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'Morning Cohort' });
      req.flush(SECTION_DTO, { status: 201, statusText: 'Created' });

      const section = await promise;
      expect(section).toMatchObject({ sectionId: 'sec1', name: 'Morning Cohort' });
    });

    it('serialises optional fields when present (blanks omitted)', () => {
      service
        .createOfferingSection('of1', {
          name: 'Morning Cohort',
          leadInstructorGcid: 'g1',
          room: 'Room 204',
          startDate: '2026-09-01',
          endDate: '2026-12-15',
        })
        .subscribe();
      const req = httpMock.expectOne(sectionsUrl('of1'));
      expect(req.request.body).toEqual({
        name: 'Morning Cohort',
        lead_instructor_gcid: 'g1',
        room: 'Room 204',
        start_date: '2026-09-01',
        end_date: '2026-12-15',
      });
      req.flush(SECTION_DTO, { status: 201, statusText: 'Created' });
    });

    it('propagates a 404 (offering missing) fail-loud', async () => {
      const promise = firstValueFrom(
        service.createOfferingSection('missing', { name: 'X' }),
      );
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/missing/sections`)
        .flush('no offering', { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ status: 404 });
    });

    it('propagates a 409 (not a graduate offering) fail-loud', async () => {
      const promise = firstValueFrom(service.createOfferingSection('of1', { name: 'X' }));
      httpMock
        .expectOne(sectionsUrl('of1'))
        .flush({ error: 'not graduate' }, { status: 409, statusText: 'Conflict' });
      await expect(promise).rejects.toMatchObject({ status: 409 });
    });
  });

  // ── CHO-1985: offering schedule (delivery sessions; list + create) ─────────

  describe('getOfferingSchedule', () => {
    function scheduleUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/schedule`;
    }

    it('GETs /offerings/:id/schedule and maps the wire session rows', async () => {
      const promise = firstValueFrom(service.getOfferingSchedule('of1'));
      const req = httpMock.expectOne(scheduleUrl('of1'));
      expect(req.request.method).toBe('GET');
      req.flush({
        sessions: [
          {
            id: 'sess1',
            title: 'Week 1 — Kick-off',
            room_id: 'room-abc',
            room: 'Room 204',
            instructor_gcid: 'g1',
            starts_at: '2026-09-01T09:00:00Z',
            ends_at: '2026-09-01T11:00:00Z',
            created_at: '2026-06-10T00:00:00Z',
            updated_at: '2026-06-10T00:00:00Z',
          },
        ],
      });

      const sessions = await promise;
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        id: 'sess1',
        title: 'Week 1 — Kick-off',
        roomId: 'room-abc',
        room: 'Room 204',
        instructorGcid: 'g1',
        startsAt: '2026-09-01T09:00:00Z',
        endsAt: '2026-09-01T11:00:00Z',
      });
    });

    it('defaults sparse optional fields to empty strings', async () => {
      const promise = firstValueFrom(service.getOfferingSchedule('of1'));
      httpMock.expectOne(scheduleUrl('of1')).flush({
        sessions: [
          {
            id: 'sess2',
            title: 'Bare',
            starts_at: '2026-09-02T09:00:00Z',
            ends_at: '2026-09-02T10:00:00Z',
          },
        ],
      });
      const sessions = await promise;
      expect(sessions[0]).toMatchObject({
        id: 'sess2',
        title: 'Bare',
        roomId: '',
        room: '',
        instructorGcid: '',
        createdAt: '',
        updatedAt: '',
      });
    });

    it('URL-encodes the offering id segment', () => {
      service.getOfferingSchedule('a/b').subscribe();
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/a%2Fb/schedule`)
        .flush({ sessions: [] });
    });

    it('maps a sparse/empty body to an empty list (defensive)', async () => {
      const promise = firstValueFrom(service.getOfferingSchedule('of1'));
      httpMock.expectOne(scheduleUrl('of1')).flush({});
      expect(await promise).toEqual([]);
    });

    it('propagates HTTP errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.getOfferingSchedule('of1'));
      httpMock
        .expectOne(scheduleUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Service Unavailable' });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('createOfferingSession', () => {
    function scheduleUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/schedule`;
    }
    const SESSION_DTO = {
      id: 'sess1',
      title: 'Week 1 — Kick-off',
      room_id: 'room-abc',
      room: 'Room 204',
      instructor_gcid: 'g1',
      starts_at: '2026-09-01T09:00:00Z',
      ends_at: '2026-09-01T11:00:00Z',
      created_at: '2026-06-10T00:00:00Z',
      updated_at: '2026-06-10T00:00:00Z',
    };

    it('POSTs the minimal snake_case body (title + window only) and maps the 201', async () => {
      const promise = firstValueFrom(
        service.createOfferingSession('of1', {
          title: 'Week 1 — Kick-off',
          startsAt: '2026-09-01T09:00:00Z',
          endsAt: '2026-09-01T11:00:00Z',
        }),
      );
      const req = httpMock.expectOne(scheduleUrl('of1'));
      expect(req.request.method).toBe('POST');
      // Blank optional room / instructor drop out → a clean title+window body.
      expect(req.request.body).toEqual({
        title: 'Week 1 — Kick-off',
        starts_at: '2026-09-01T09:00:00Z',
        ends_at: '2026-09-01T11:00:00Z',
      });
      req.flush(SESSION_DTO, { status: 201, statusText: 'Created' });

      const session = await promise;
      expect(session).toMatchObject({ id: 'sess1', title: 'Week 1 — Kick-off' });
    });

    it('serialises optional room_id + instructor when present (blanks omitted)', () => {
      service
        .createOfferingSession('of1', {
          title: 'Week 1',
          roomId: 'room-abc',
          instructorGcid: 'g1',
          startsAt: '2026-09-01T09:00:00Z',
          endsAt: '2026-09-01T11:00:00Z',
        })
        .subscribe();
      const req = httpMock.expectOne(scheduleUrl('of1'));
      // CHO-2191: a room is booked by room_id on the wire, never free-text room.
      expect(req.request.body).toEqual({
        title: 'Week 1',
        starts_at: '2026-09-01T09:00:00Z',
        ends_at: '2026-09-01T11:00:00Z',
        room_id: 'room-abc',
        instructor_gcid: 'g1',
      });
      req.flush(SESSION_DTO, { status: 201, statusText: 'Created' });
    });

    it('propagates a 400 (invalid window / blank title) fail-loud', async () => {
      const promise = firstValueFrom(
        service.createOfferingSession('of1', {
          title: 'X',
          startsAt: '2026-09-01T11:00:00Z',
          endsAt: '2026-09-01T09:00:00Z',
        }),
      );
      httpMock
        .expectOne(scheduleUrl('of1'))
        .flush({ error: 'ends before starts' }, { status: 400, statusText: 'Bad Request' });
      await expect(promise).rejects.toMatchObject({ status: 400 });
    });

    it('propagates a 404 (offering missing) fail-loud', async () => {
      const promise = firstValueFrom(
        service.createOfferingSession('missing', {
          title: 'X',
          startsAt: '2026-09-01T09:00:00Z',
          endsAt: '2026-09-01T11:00:00Z',
        }),
      );
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/missing/schedule`)
        .flush('no offering', { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ status: 404 });
    });
  });

  // ── CHO-2191: rooms (the schedule picker source + create) ──────────────────

  describe('listRooms', () => {
    const roomsUrl = `${environment.bffBaseUrl}/api/v1/rooms`;

    it('GETs /api/v1/rooms and maps the wire rows to picker options', async () => {
      const promise = firstValueFrom(service.listRooms());
      const req = httpMock.expectOne(roomsUrl);
      expect(req.request.method).toBe('GET');
      req.flush({
        rooms: [
          {
            id: 'room-abc',
            name: 'Lab A',
            capacity: 30,
            campus_id: '',
            branch_id: '',
            created_at: '2026-07-16T00:00:00Z',
          },
        ],
      });
      const rooms = await promise;
      expect(rooms).toEqual([{ id: 'room-abc', name: 'Lab A', capacity: 30 }]);
    });

    it('maps a sparse/empty body to an empty list (defensive)', async () => {
      const promise = firstValueFrom(service.listRooms());
      httpMock.expectOne(roomsUrl).flush({});
      expect(await promise).toEqual([]);
    });

    it('propagates HTTP errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.listRooms());
      httpMock
        .expectOne(roomsUrl)
        .flush('boom', { status: 503, statusText: 'Service Unavailable' });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('createRoom', () => {
    const roomsUrl = `${environment.bffBaseUrl}/api/v1/rooms`;

    it('POSTs the minimal snake_case body (name + capacity) and maps the 201', async () => {
      const promise = firstValueFrom(service.createRoom({ name: 'Lab A', capacity: 30 }));
      const req = httpMock.expectOne(roomsUrl);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ name: 'Lab A', capacity: 30 });
      req.flush(
        { id: 'room-abc', name: 'Lab A', capacity: 30 },
        { status: 201, statusText: 'Created' },
      );
      expect(await promise).toEqual({ id: 'room-abc', name: 'Lab A', capacity: 30 });
    });

    it('serialises optional campus + branch when present (blanks omitted)', () => {
      service
        .createRoom({ name: 'Lab A', capacity: 12, campusId: 'c1', branchId: 'b1' })
        .subscribe();
      const req = httpMock.expectOne(roomsUrl);
      expect(req.request.body).toEqual({
        name: 'Lab A',
        capacity: 12,
        campus_id: 'c1',
        branch_id: 'b1',
      });
      req.flush(
        { id: 'room-xyz', name: 'Lab A', capacity: 12 },
        { status: 201, statusText: 'Created' },
      );
    });

    it('propagates a 400 (blank name / capacity<=0) fail-loud', async () => {
      const promise = firstValueFrom(service.createRoom({ name: '', capacity: 0 }));
      httpMock
        .expectOne(roomsUrl)
        .flush({ error: 'bad' }, { status: 400, statusText: 'Bad Request' });
      await expect(promise).rejects.toMatchObject({ status: 400 });
    });
  });

  // ── CHO-1986: offering attendance (session-scoped records; mark + list) ────

  describe('getOfferingAttendance', () => {
    // CHO-2186 — the session id rides in the PATH, never the query string. A
    // query param named `session_id` is edge-denied 100% of the time by Cloud
    // Armor rule 1008 → OWASP CRS 943110 (session fixation w/ off-domain
    // Referer): the SPA is on rplus.chora.site and the API on api.chora.site, so
    // the Referer is ALWAYS off-domain. This read had never worked in prod.
    function attendanceUrl(id: string, sid: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/attendance/${sid}`;
    }

    it('GETs /offerings/:id/attendance/:sid and maps records', async () => {
      const promise = firstValueFrom(service.getOfferingAttendance('of1', 'sess1'));
      const req = httpMock.expectOne((r) => r.url === attendanceUrl('of1', 'sess1'));
      expect(req.request.method).toBe('GET');
      req.flush({
        records: [
          {
            id: 'att1',
            session_id: 'sess1',
            gcid: 'g1',
            status: 'present',
            source: 'manual',
            recorded_at: '2026-09-01T09:05:00Z',
          },
        ],
      });

      const records = await promise;
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        id: 'att1',
        sessionId: 'sess1',
        gcid: 'g1',
        status: 'present',
        source: 'manual',
        recordedAt: '2026-09-01T09:05:00Z',
      });
    });

    // The regression guard. Not "session_id is absent" alone — the request must
    // carry NO query string whatsoever, so no rename (offering_session_id, …)
    // can creep back in: CRS 943110 matches the substring `session_id`.
    it('sends NO query string at all (CRS 943110 would deny it at the edge)', () => {
      service.getOfferingAttendance('of1', 'sess1').subscribe();
      const req = httpMock.expectOne((r) => r.url === attendanceUrl('of1', 'sess1'));
      expect(req.request.params.keys()).toEqual([]);
      expect(req.request.params.get('session_id')).toBeNull();
      expect(req.request.urlWithParams).not.toContain('?');
      expect(req.request.urlWithParams).not.toContain('session_id');
      req.flush({ records: [] });
    });

    it('defaults a missing source / recorded_at to empty strings', async () => {
      const promise = firstValueFrom(service.getOfferingAttendance('of1', 'sess1'));
      httpMock.expectOne((r) => r.url === attendanceUrl('of1', 'sess1')).flush({
        records: [{ id: 'att2', session_id: 'sess1', gcid: 'g2', status: 'late' }],
      });
      const records = await promise;
      expect(records[0]).toMatchObject({ source: '', recordedAt: '' });
    });

    it('URL-encodes both the offering id and the session id segments', () => {
      service.getOfferingAttendance('a/b', 's/1').subscribe();
      httpMock
        .expectOne(
          (r) =>
            r.url === `${environment.bffBaseUrl}/api/v1/offerings/a%2Fb/attendance/s%2F1`,
        )
        .flush({ records: [] });
    });

    it('maps a sparse/empty body to an empty list (defensive)', async () => {
      const promise = firstValueFrom(service.getOfferingAttendance('of1', 'sess1'));
      httpMock.expectOne((r) => r.url === attendanceUrl('of1', 'sess1')).flush({});
      expect(await promise).toEqual([]);
    });

    it('propagates HTTP errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.getOfferingAttendance('of1', 'sess1'));
      httpMock
        .expectOne((r) => r.url === attendanceUrl('of1', 'sess1'))
        .flush('boom', { status: 503, statusText: 'Service Unavailable' });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('markAttendance', () => {
    function attendanceUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/attendance`;
    }
    const RECORD_DTO = {
      id: 'att1',
      session_id: 'sess1',
      gcid: 'g1',
      status: 'present',
      source: 'manual',
      recorded_at: '2026-09-01T09:05:00Z',
    };

    it('POSTs the snake_case body (source fixed manual) and maps the record', async () => {
      const promise = firstValueFrom(
        service.markAttendance('of1', { sessionId: 'sess1', gcid: 'g1', status: 'present' }),
      );
      const req = httpMock.expectOne(attendanceUrl('of1'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        session_id: 'sess1',
        gcid: 'g1',
        status: 'present',
        source: 'manual',
      });
      req.flush(RECORD_DTO);

      const record = await promise;
      expect(record).toMatchObject({ id: 'att1', gcid: 'g1', status: 'present', source: 'manual' });
    });

    it('propagates a 400 (invalid status) fail-loud', async () => {
      const promise = firstValueFrom(
        service.markAttendance('of1', { sessionId: 'sess1', gcid: 'g1', status: 'bogus' }),
      );
      httpMock
        .expectOne(attendanceUrl('of1'))
        .flush({ error: 'invalid status' }, { status: 400, statusText: 'Bad Request' });
      await expect(promise).rejects.toMatchObject({ status: 400 });
    });

    it('propagates a 403 (non-admin) fail-loud', async () => {
      const promise = firstValueFrom(
        service.markAttendance('of1', { sessionId: 'sess1', gcid: 'g1', status: 'present' }),
      );
      httpMock
        .expectOne(attendanceUrl('of1'))
        .flush('forbidden', { status: 403, statusText: 'Forbidden' });
      await expect(promise).rejects.toMatchObject({ status: 403 });
    });
  });

  // ── CHO-1987: offering publish / catalog handoff (read + action) ───────────

  describe('getOfferingPublish', () => {
    function publishUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/publish`;
    }

    it('GETs /offerings/:id/publish and maps the courses (count 0 on the read)', async () => {
      const promise = firstValueFrom(service.getOfferingPublish('of1'));
      const req = httpMock.expectOne(publishUrl('of1'));
      expect(req.request.method).toBe('GET');
      req.flush({
        courses: [
          { id: 'c1', title: 'Intro to Go', visibility: 'draft', published: false },
          { id: 'c2', title: 'Advanced Go', visibility: 'public', published: true },
        ],
      });

      const state = await promise;
      expect(state.publishedCount).toBe(0);
      expect(state.courses).toHaveLength(2);
      expect(state.courses[0]).toMatchObject({
        id: 'c1',
        title: 'Intro to Go',
        visibility: 'draft',
        published: false,
      });
      expect(state.courses[1]).toMatchObject({ visibility: 'public', published: true });
    });

    it('defaults sparse fields (title / visibility → "", published → false)', async () => {
      const promise = firstValueFrom(service.getOfferingPublish('of1'));
      httpMock.expectOne(publishUrl('of1')).flush({ courses: [{ id: 'c1' }] });
      const state = await promise;
      expect(state.courses[0]).toMatchObject({
        id: 'c1',
        title: '',
        visibility: '',
        published: false,
      });
    });

    it('URL-encodes the offering id segment', () => {
      service.getOfferingPublish('a/b').subscribe();
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/a%2Fb/publish`)
        .flush({ courses: [] });
    });

    it('maps a sparse/empty body to an empty list + zero count (defensive)', async () => {
      const promise = firstValueFrom(service.getOfferingPublish('of1'));
      httpMock.expectOne(publishUrl('of1')).flush({});
      const state = await promise;
      expect(state.courses).toEqual([]);
      expect(state.publishedCount).toBe(0);
    });

    it('propagates HTTP errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.getOfferingPublish('of1'));
      httpMock
        .expectOne(publishUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Service Unavailable' });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('publishOffering', () => {
    function publishUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/publish`;
    }

    it('PATCHes (empty body) and maps the updated courses + published_count', async () => {
      const promise = firstValueFrom(service.publishOffering('of1'));
      const req = httpMock.expectOne(publishUrl('of1'));
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({});
      req.flush({
        courses: [
          { id: 'c1', title: 'Intro to Go', visibility: 'public', published: true },
          { id: 'c2', title: 'Advanced Go', visibility: 'public', published: true },
        ],
        published_count: 2,
      });

      const state = await promise;
      expect(state.publishedCount).toBe(2);
      expect(state.courses.every((c) => c.visibility === 'public' && c.published)).toBe(true);
    });

    it('maps a no-op publish (all already public → count 0)', async () => {
      const promise = firstValueFrom(service.publishOffering('of1'));
      httpMock.expectOne(publishUrl('of1')).flush({
        courses: [{ id: 'c1', title: 'Intro', visibility: 'public', published: true }],
        published_count: 0,
      });
      const state = await promise;
      expect(state.publishedCount).toBe(0);
      expect(state.courses[0].published).toBe(true);
    });

    it('URL-encodes the offering id segment', () => {
      service.publishOffering('a/b').subscribe();
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/a%2Fb/publish`)
        .flush({ courses: [], published_count: 0 });
    });

    it('propagates HTTP errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.publishOffering('of1'));
      httpMock
        .expectOne(publishUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Service Unavailable' });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  // ── ADR-226: offering prerequisites (structured course→course DAG) ────────

  describe('listPrerequisites', () => {
    function prereqUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/prerequisites`;
    }

    it('GETs /offerings/:id/prerequisites and maps courses + edges + notes', async () => {
      const promise = firstValueFrom(service.listPrerequisites('of1'));
      const req = httpMock.expectOne(prereqUrl('of1'));
      expect(req.request.method).toBe('GET');
      req.flush({
        courses: [
          {
            course_id: 'c1',
            title: 'Calculus II',
            prerequisite_notes: ['Comfort with limits'],
            prerequisites: [
              {
                prerequisite_course_id: 'c0',
                prerequisite_course_title: 'Calculus I',
                kind: 'hard_gate',
              },
            ],
          },
        ],
      });

      const courses = await promise;
      expect(courses).toHaveLength(1);
      expect(courses[0]).toMatchObject({ id: 'c1', title: 'Calculus II' });
      expect(courses[0].prerequisiteNotes).toEqual(['Comfort with limits']);
      expect(courses[0].prerequisites).toEqual([
        { prerequisiteCourseId: 'c0', prerequisiteCourseTitle: 'Calculus I', kind: 'hard_gate' },
      ]);
    });

    it('maps a course with no edges/notes yet to empty arrays', async () => {
      const promise = firstValueFrom(service.listPrerequisites('of1'));
      httpMock
        .expectOne(prereqUrl('of1'))
        .flush({ courses: [{ course_id: 'c1', title: 'Fresh', prerequisites: [] }] });
      const courses = await promise;
      expect(courses[0].prerequisites).toEqual([]);
      expect(courses[0].prerequisiteNotes).toEqual([]);
    });

    it('defaults a missing course title and a missing edge title to ""', async () => {
      const promise = firstValueFrom(service.listPrerequisites('of1'));
      httpMock.expectOne(prereqUrl('of1')).flush({
        courses: [
          {
            course_id: 'c1',
            prerequisites: [{ prerequisite_course_id: 'c0', kind: 'advisory' }],
          },
        ],
      });
      const courses = await promise;
      expect(courses[0].title).toBe('');
      expect(courses[0].prerequisites[0].prerequisiteCourseTitle).toBe('');
    });

    it('URL-encodes the offering id segment', () => {
      service.listPrerequisites('a/b').subscribe();
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/a%2Fb/prerequisites`)
        .flush({ courses: [] });
    });

    it('maps a sparse/empty body to an empty list (defensive)', async () => {
      const promise = firstValueFrom(service.listPrerequisites('of1'));
      httpMock.expectOne(prereqUrl('of1')).flush({});
      expect(await promise).toEqual([]);
    });

    it('propagates HTTP errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.listPrerequisites('of1'));
      httpMock
        .expectOne(prereqUrl('of1'))
        .flush('boom', { status: 503, statusText: 'Service Unavailable' });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('addPrerequisite', () => {
    function prereqUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/prerequisites`;
    }

    it('POSTs {course_id,prerequisite_course_id,kind} and maps the 200 edge list', async () => {
      const promise = firstValueFrom(
        service.addPrerequisite('of1', {
          courseId: 'c1',
          prerequisiteCourseId: 'c0',
          kind: 'hard_gate',
        }),
      );
      const req = httpMock.expectOne(prereqUrl('of1'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        course_id: 'c1',
        prerequisite_course_id: 'c0',
        kind: 'hard_gate',
      });
      req.flush({
        course_id: 'c1',
        prerequisites: [
          { prerequisite_course_id: 'c0', prerequisite_course_title: 'Calculus I', kind: 'hard_gate' },
        ],
      });
      expect(await promise).toEqual({
        courseId: 'c1',
        prerequisites: [
          { prerequisiteCourseId: 'c0', prerequisiteCourseTitle: 'Calculus I', kind: 'hard_gate' },
        ],
      });
    });

    it('propagates a 422 graph refusal (cycle) fail-loud', async () => {
      const promise = firstValueFrom(
        service.addPrerequisite('of1', {
          courseId: 'c1',
          prerequisiteCourseId: 'c0',
          kind: 'advisory',
        }),
      );
      httpMock.expectOne(prereqUrl('of1')).flush(
        { error: 'Unprocessable Entity', message: 'prerequisite would create a cycle' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      await expect(promise).rejects.toMatchObject({ status: 422 });
    });

    it('propagates a 400 (malformed / unattached course) fail-loud', async () => {
      const promise = firstValueFrom(
        service.addPrerequisite('of1', {
          courseId: 'nope',
          prerequisiteCourseId: 'c0',
          kind: 'advisory',
        }),
      );
      httpMock
        .expectOne(prereqUrl('of1'))
        .flush(
          { error: 'Bad Request', message: 'course_id is not attached to this offering' },
          { status: 400, statusText: 'Bad Request' },
        );
      await expect(promise).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('removePrerequisite', () => {
    function prereqRemoveUrl(id: string): string {
      return `${environment.bffBaseUrl}/api/v1/offerings/${id}/prerequisites/remove`;
    }

    it('POSTs {course_id,prerequisite_course_id} to /prerequisites/remove and maps the remaining edges', async () => {
      const promise = firstValueFrom(
        service.removePrerequisite('of1', { courseId: 'c1', prerequisiteCourseId: 'c0' }),
      );
      const req = httpMock.expectOne(prereqRemoveUrl('of1'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ course_id: 'c1', prerequisite_course_id: 'c0' });
      req.flush({ course_id: 'c1', prerequisites: [] });
      expect(await promise).toEqual({ courseId: 'c1', prerequisites: [] });
    });

    it('URL-encodes the offering id', () => {
      service.removePrerequisite('a/b', { courseId: 'c1', prerequisiteCourseId: 'c0' }).subscribe();
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/v1/offerings/a%2Fb/prerequisites/remove`)
        .flush({ course_id: 'c1', prerequisites: [] });
    });

    it('propagates a 400 (malformed / unattached course) fail-loud', async () => {
      const promise = firstValueFrom(
        service.removePrerequisite('of1', { courseId: 'nope', prerequisiteCourseId: 'c0' }),
      );
      httpMock
        .expectOne(prereqRemoveUrl('of1'))
        .flush(
          { error: 'Bad Request', message: 'course_id is not attached to this offering' },
          { status: 400, statusText: 'Bad Request' },
        );
      await expect(promise).rejects.toMatchObject({ status: 400 });
    });
  });

  // ── Curriculum blast-radius: count offerings bundling a course ─────────────

  describe('countOfferingsForCourse', () => {
    function listUrl(): string {
      return `${environment.bffBaseUrl}/api/v1/search/offerings`;
    }

    it('GETs /search/offerings?course_id=&limit=1 and maps total_estimate', async () => {
      const promise = firstValueFrom(service.countOfferingsForCourse('c1'));
      const req = httpMock.expectOne((r) => r.url === listUrl());
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('course_id')).toBe('c1');
      expect(req.request.params.get('limit')).toBe('1');
      req.flush({ items: [{ id: 'of1' }], next_cursor: null, total_estimate: 4 });
      expect(await promise).toBe(4);
    });

    it('defaults a missing total_estimate to 0', async () => {
      const promise = firstValueFrom(service.countOfferingsForCourse('c1'));
      httpMock.expectOne((r) => r.url === listUrl()).flush({ items: [] });
      expect(await promise).toBe(0);
    });

    it('URL-encodes the course_id query param', () => {
      service.countOfferingsForCourse('a/b').subscribe();
      const req = httpMock.expectOne((r) => r.url === listUrl());
      expect(req.request.params.get('course_id')).toBe('a/b');
      req.flush({ items: [], total_estimate: 1 });
    });

    it('propagates HTTP errors so the caller can degrade to no badge (fail-loud)', async () => {
      const promise = firstValueFrom(service.countOfferingsForCourse('c1'));
      httpMock
        .expectOne((r) => r.url === listUrl())
        .flush('boom', { status: 503, statusText: 'Service Unavailable' });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  // ── W6: offering transcript (per-offering gradebook join) ──────────────────

  describe('getTranscriptByAssessments', () => {
    function transcriptUrl(): string {
      return `${environment.bffBaseUrl}/api/v1/transcript/by-assessments`;
    }

    it('GETs /transcript/by-assessments?assessment_ids=<csv> and maps items', async () => {
      const promise = firstValueFrom(
        service.getTranscriptByAssessments(['as1', 'as2']),
      );
      const req = httpMock.expectOne((r) => r.url === transcriptUrl());
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('assessment_ids')).toBe('as1,as2');
      req.flush({
        items: [
          {
            entry_id: 'te1',
            gcid: 'g1',
            kind: 'assessment',
            source_ref: 'as1',
            title: '',
            score_earned: 8.5,
            score_possible: 10,
            score_percent: 85,
            passed: true,
            course_id: null,
            occurred_at: '2026-07-01T00:00:00Z',
          },
        ],
      });
      const items = await promise;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        entryId: 'te1',
        gcid: 'g1',
        kind: 'assessment',
        sourceRef: 'as1',
        title: '',
        scoreEarned: 8.5,
        scorePossible: 10,
        scorePercent: 85,
        passed: true,
        courseId: null,
        occurredAt: '2026-07-01T00:00:00Z',
      });
    });

    it('degrades a sparse/null-field row defensively (unfinished grading)', async () => {
      const promise = firstValueFrom(service.getTranscriptByAssessments(['as1']));
      httpMock.expectOne((r) => r.url === transcriptUrl()).flush({
        items: [
          {
            entry_id: 'te2',
            gcid: 'g2',
            kind: 'assessment',
            source_ref: 'as1',
            title: '',
            score_earned: null,
            score_possible: null,
            score_percent: null,
            passed: null,
            course_id: null,
            occurred_at: '2026-07-02T00:00:00Z',
          },
        ],
      });
      const items = await promise;
      expect(items[0]).toMatchObject({
        scoreEarned: null,
        scorePossible: null,
        scorePercent: null,
        passed: false,
        courseId: null,
      });
    });

    it('maps a sparse/empty body to an empty list', async () => {
      const promise = firstValueFrom(service.getTranscriptByAssessments(['as1']));
      httpMock.expectOne((r) => r.url === transcriptUrl()).flush({});
      expect(await promise).toEqual([]);
    });

    it('short-circuits to an empty list with NO HTTP call when assessmentIds is empty', async () => {
      const promise = firstValueFrom(service.getTranscriptByAssessments([]));
      expect(await promise).toEqual([]);
      httpMock.expectNone((r) => r.url === transcriptUrl());
    });

    it('propagates HTTP errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.getTranscriptByAssessments(['as1']));
      httpMock
        .expectOne((r) => r.url === transcriptUrl())
        .flush('boom', { status: 503, statusText: 'Service Unavailable' });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });
});
