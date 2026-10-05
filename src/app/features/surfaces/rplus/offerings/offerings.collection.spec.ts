/**
 * createDeliveryFinderDataSource — R3 exam-fold data source spec.
 *
 * The unified R+ delivery finder folds exam sittings (a SEPARATE bounded
 * context, no union endpoint) into the offerings search client-side. This
 * proves the forkJoin merge over the REAL OfferingsService + ExamsService
 * (HttpTestingController, no service stubs per feedback_no_stubs_real_wiring):
 *
 *   - exam rows are appended to the offering page,
 *   - an `exam` bucket lands on the delivery_type facet (count = # exam rows),
 *   - the OFFERING next_cursor is preserved, and — critically —
 *   - exams are merged ONLY on page 1, so a "load more" cursor page never
 *     re-fetches or re-appends (duplicates) them.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { createDeliveryFinderDataSource, createOfferingDataSource } from './offerings.collection';
import { OfferingsService } from './offerings.service';
import { ExamsService } from '../exams/exams.service';
import { EMPTY_QUERY } from '../../../../shared/components/chora-collection-view/collection-view.model';
import { environment } from '../../../../../environments/environment';

const OFFERINGS_URL = `${environment.bffBaseUrl}/api/v1/search/offerings`;
const EXAMS_URL = `${environment.bffBaseUrl}/api/v1/exams`;

/** One offering row + a delivery_type/state facet + a forward cursor. */
const OFFERINGS_PAGE = {
  items: [
    {
      id: 'of1',
      tenant_id: 't1',
      course_id: 'c1',
      delivery_type: 'graduate',
      label: 'Graduate Cohort A',
      capacity: 30,
      state: 'RUNNING',
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-02T00:00:00Z',
    },
  ],
  facets: [
    {
      field: 'delivery_type',
      values: [{ value: 'graduate', label: 'graduate', count: 1 }],
    },
    { field: 'state', values: [{ value: 'RUNNING', label: 'RUNNING', count: 1 }] },
  ],
  next_cursor: 'CURSOR-2',
  total_estimate: 1,
};

/** Two exam sittings (BackendExam wire shape for GET /api/v1/exams). */
const EXAMS_LIST = {
  items: [
    {
      id: 'ex1',
      title: 'Certified Scrum Product Owner',
      scheduled_at: '2026-06-12T09:00:00Z',
      capacity: 40,
      enrolled_count: 5,
      proctor_method: 'Room 5',
      state: 'OPEN',
    },
    {
      id: 'ex2',
      title: 'Certified Scrum Master',
      scheduled_at: '2026-07-01T09:00:00Z',
      capacity: 25,
      enrolled_count: 0,
      proctor_method: 'Room 3',
      state: 'DRAFT',
    },
  ],
};

function dataSource(): ReturnType<typeof createDeliveryFinderDataSource> {
  return createDeliveryFinderDataSource(
    TestBed.inject(OfferingsService),
    TestBed.inject(ExamsService),
  );
}

describe('createDeliveryFinderDataSource', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('appends exam rows + an exam facet bucket on page 1, preserving the offering cursor', async () => {
    const page$ = firstValueFrom(dataSource().search(EMPTY_QUERY)); // cursor === null

    // forkJoin fires BOTH requests synchronously on subscribe.
    httpMock.expectOne((r) => r.url === OFFERINGS_URL).flush(OFFERINGS_PAGE);
    httpMock.expectOne((r) => r.url === EXAMS_URL).flush(EXAMS_LIST);
    const page = await page$;

    // Offering row first, then the two exam rows appended (order preserved).
    expect(page.items.map((i) => i.id)).toEqual(['of1', 'ex1', 'ex2']);

    const exam1 = page.items.find((i) => i.id === 'ex1');
    expect(exam1?.deliveryType as string).toBe('exam');
    expect(exam1?.label).toBe('Certified Scrum Product Owner');

    // `exam` bucket appended to the delivery_type facet; original bucket kept.
    const deliveryFacet = page.facets.find((f) => f.field === 'delivery_type');
    expect(deliveryFacet?.values.map((v) => v.value)).toEqual(['graduate', 'exam']);
    const examBucket = deliveryFacet?.values.find((v) => v.value === 'exam');
    expect(examBucket?.count).toBe(2);
    expect(examBucket?.label).toBe('rplus.offerings.delivery_type_value.exam');

    // Other facet dimensions (state) untouched; offering cursor preserved.
    expect(page.facets.find((f) => f.field === 'state')?.values).toHaveLength(1);
    expect(page.nextCursor).toBe('CURSOR-2');

    httpMock.verify();
  });

  it('returns offerings only on a cursor page (no exam re-fetch, no duplicate rows)', async () => {
    const cursorQuery = { ...EMPTY_QUERY, cursor: 'CURSOR-2' };
    const page$ = firstValueFrom(dataSource().search(cursorQuery));

    // Only the offering request fires — a bare offering page (last page).
    httpMock
      .expectOne((r) => r.url === OFFERINGS_URL)
      .flush({ ...OFFERINGS_PAGE, next_cursor: null });
    const page = await page$;

    // No exam rows appended and no synthesized `exam` facet bucket.
    expect(page.items.map((i) => i.id)).toEqual(['of1']);
    const deliveryFacet = page.facets.find((f) => f.field === 'delivery_type');
    expect(deliveryFacet?.values.find((v) => v.value === 'exam')).toBeUndefined();
    expect(page.nextCursor).toBeNull();

    // verify() throws if the data source had fired GET /api/v1/exams on a cursor page.
    httpMock.verify();
  });

  it('folds nothing (offering page verbatim) when there are no upcoming sittings', async () => {
    const page$ = firstValueFrom(dataSource().search(EMPTY_QUERY));

    httpMock.expectOne((r) => r.url === OFFERINGS_URL).flush(OFFERINGS_PAGE);
    httpMock.expectOne((r) => r.url === EXAMS_URL).flush({ items: [] });
    const page = await page$;

    expect(page.items.map((i) => i.id)).toEqual(['of1']);
    const deliveryFacet = page.facets.find((f) => f.field === 'delivery_type');
    expect(deliveryFacet?.values.find((v) => v.value === 'exam')).toBeUndefined();

    httpMock.verify();
  });

  it('createOfferingDataSource (retained, offerings-only) fires no exam call', async () => {
    // The single-entity offerings source is kept intact for other callers /
    // the descriptor-registry pattern — it must NOT fold exams in.
    const page$ = firstValueFrom(
      createOfferingDataSource(TestBed.inject(OfferingsService)).search(EMPTY_QUERY),
    );
    httpMock.expectOne((r) => r.url === OFFERINGS_URL).flush(OFFERINGS_PAGE);
    const page = await page$;

    expect(page.items.map((i) => i.id)).toEqual(['of1']);
    httpMock.verify(); // no GET /api/v1/exams
  });

  it('synthesizes the delivery_type facet if the offering page omitted it', async () => {
    const page$ = firstValueFrom(dataSource().search(EMPTY_QUERY));

    // An offering page with NO delivery_type facet dimension (defensive edge).
    httpMock
      .expectOne((r) => r.url === OFFERINGS_URL)
      .flush({ ...OFFERINGS_PAGE, facets: [] });
    httpMock.expectOne((r) => r.url === EXAMS_URL).flush(EXAMS_LIST);
    const page = await page$;

    const deliveryFacet = page.facets.find((f) => f.field === 'delivery_type');
    expect(deliveryFacet).toBeTruthy();
    expect(deliveryFacet?.values).toEqual([
      { value: 'exam', label: 'rplus.offerings.delivery_type_value.exam', count: 2 },
    ]);

    httpMock.verify();
  });
});
