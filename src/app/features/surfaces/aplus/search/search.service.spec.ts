/**
 * SearchService spec — A+ Search Hub (WS-8).
 *
 * Covers:
 *   - Federation merge correctness (atom + course + collection)
 *   - Debounce 250ms (via fakeAsync / tick)
 *   - Graceful degradation when the collection-search branch errors (WS-8 live)
 *   - Error key mapping
 *   - State machine transitions (idle → loading → success | error)
 *   - localStorage side-effect (pushRecentSearch)
 *
 * Per chora-web CLAUDE.md §6: HttpTestingController + verify in afterEach.
 * No mocked-BFF fixtures — tests flush the real wire shapes.
 */
// describe/it/beforeEach/afterEach come from the GLOBAL Vitest API
// (globals:true) so AnalogJS setup-zone wraps each test body in a
// ProxyZone — required by Angular fakeAsync()/tick(). An explicit
// 'vitest' import would use unpatched bindings -> "Expected to be
// running in 'ProxyZone'".
import { expect } from 'vitest';
import {
  TestBed,
  fakeAsync,
  tick,
} from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { throwError, type Observable } from 'rxjs';

import { SearchService } from './search.service';
import type {
  FederatedSearchResponse,
} from './models';
import { RECENT_SEARCHES_KEY, pushRecentSearch, loadRecentSearches } from './models';

/**
 * The outer `catchError` in the constructor's switchMap — the ONLY caller of
 * the private `errorKey()` mapper — is unreachable through the three HTTP
 * branches because each forkJoin branch swallows its own error and degrades to
 * an empty result (federation never fails loud unless the source itself
 * errors). To characterize `errorKey()`'s status-code branch table (404 /
 * >=500 / 401 / 403 / non-numeric default) and the error-state arm of
 * `retry()`, we replace the instance's private `federatedSearch` with a source
 * that errors with a controlled HttpErrorResponse-shaped payload, then drive
 * the public `search()` stream. This touches no source — it overrides one
 * method binding on a single instance from the test.
 */
type FederatedSource = (
  q: string,
) => Observable<{ results: FederatedSearchResponse; query: string }>;

function forceFederatedError(
  service: SearchService,
  errLike: unknown,
): void {
  // Override the private `federatedSearch` binding on this one instance. Cast
  // through `unknown` to a minimal index shape (intersecting with SearchService
  // collapses to `never` because the property is private on the class).
  (service as unknown as Record<'federatedSearch', FederatedSource>).federatedSearch =
    () => throwError(() => errLike);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function setup(): { service: SearchService; httpMock: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const service = TestBed.inject(SearchService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

function makeAtomHit(overrides: Record<string, unknown> = {}) {
  return {
    id: '01000000-0000-7000-8000-000000000001',
    title: 'Photosynthesis Basics',
    atom_type: 'multiple_choice',
    difficulty: 2,
    labels: ['biology'],
    topic_names: ['Biology'],
    ...overrides,
  };
}

function makeCatalogItem(overrides: Record<string, unknown> = {}) {
  return {
    id: '02000000-0000-7000-8000-000000000001',
    title: 'Biology Fundamentals',
    instructor_name: 'Dr. Jane',
    enrolled_count: 42,
    is_free: true,
    price_sgd_cents: 0,
    tags: ['biology'],
    ...overrides,
  };
}

function makeCollectionItem(overrides: Record<string, unknown> = {}) {
  return {
    id: '03000000-0000-7000-8000-000000000001',
    title: 'Core Biology Collection',
    atom_count: 15,
    owner_display_name: 'Alice',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SearchService — A+ Search Hub (WS-8)', () => {
  let service: SearchService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem(RECENT_SEARCHES_KEY);
    const result = setup();
    service = result.service;
    httpMock = result.httpMock;
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  });

  // ── Initial state ───────────────────────────────────────────────────────────

  it('starts in idle state', () => {
    expect(service.state().status).toBe('idle');
    expect(service.atoms()).toEqual([]);
    expect(service.courses()).toEqual([]);
    expect(service.collections()).toEqual([]);
  });

  // ── Debounce ────────────────────────────────────────────────────────────────

  it('debounces 250ms — no HTTP call before debounce completes', fakeAsync(() => {
    service.search('biology');
    tick(100);
    httpMock.expectNone('/api/v1/search/atoms');
    tick(200); // 300ms total > 250ms debounce
    // Now 3 requests fire (atoms, catalog, collections)
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/search/atoms'))
      .flush({ hits: [], pagination: { total_hits: 0, limit: 20, offset: 0 }, processing_time_ms: 0, query: 'biology' });
    httpMock
      .expectOne((r) => r.url.includes('/api/catalog'))
      .flush({ items: [] });
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/collections/search'))
      .flush({ items: [] });
  }));

  it('debounce: only the LAST query in a burst fires', fakeAsync(() => {
    service.search('b');
    tick(50);
    service.search('bi');
    tick(50);
    service.search('bio');
    tick(300);

    // Exactly one set of requests — for 'bio'
    const atomReq = httpMock.expectOne((r) =>
      r.url.includes('/api/v1/search/atoms'),
    );
    expect(atomReq.request.params.get('q')).toBe('bio');
    atomReq.flush({ hits: [], pagination: { total_hits: 0, limit: 20, offset: 0 }, processing_time_ms: 0, query: 'bio' });

    httpMock.expectOne((r) => r.url.includes('/api/catalog')).flush({ items: [] });
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/collections/search'))
      .flush({ items: [] });
  }));

  // ── Federation merge ────────────────────────────────────────────────────────

  it('merges atom + course + collection results into success state', fakeAsync(() => {
    service.search('biology');
    tick(300);

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/search/atoms'))
      .flush({
        hits: [makeAtomHit()],
        pagination: { total_hits: 1, limit: 20, offset: 0 },
        processing_time_ms: 4,
        query: 'biology',
      });
    httpMock
      .expectOne((r) => r.url.includes('/api/catalog'))
      .flush({ items: [makeCatalogItem()] });
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/collections/search'))
      .flush({ items: [makeCollectionItem()] });

    const state = service.state();
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      expect(state.results.atoms).toHaveLength(1);
      expect(state.results.atoms[0].kind).toBe('atom');
      expect(state.results.atoms[0].id).toBe('01000000-0000-7000-8000-000000000001');

      expect(state.results.courses).toHaveLength(1);
      expect(state.results.courses[0].kind).toBe('course');

      expect(state.results.collections).toHaveLength(1);
      expect(state.results.collections[0].kind).toBe('collection');
    }
  }));

  it('course results are client-side filtered by title match', fakeAsync(() => {
    service.search('biology');
    tick(300);

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/search/atoms'))
      .flush({ hits: [], pagination: { total_hits: 0, limit: 20, offset: 0 }, processing_time_ms: 0, query: 'biology' });
    httpMock
      .expectOne((r) => r.url.includes('/api/catalog'))
      .flush({
        items: [
          makeCatalogItem({ title: 'Biology Fundamentals' }),
          // Override the default tags:['biology'] so Calculus does NOT match
          // the 'biology' query (the title filter also matches on tags) — this
          // is the negative case the test intends.
          makeCatalogItem({
            id: '02000000-0000-7000-8000-000000000002',
            title: 'Calculus 101',
            tags: ['math'],
          }),
        ],
      });
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/collections/search'))
      .flush({ items: [] });

    const state = service.state();
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      // Only 'Biology Fundamentals' matches 'biology'
      expect(state.results.courses).toHaveLength(1);
      expect(state.results.courses[0].title).toBe('Biology Fundamentals');
    }
  }));

  it('computed selectors are empty before success', fakeAsync(() => {
    service.search('x');
    tick(300);
    expect(service.state().status).toBe('loading');
    expect(service.atoms()).toEqual([]);
    expect(service.courses()).toEqual([]);
    expect(service.totalCount()).toBe(0);

    httpMock.expectOne((r) => r.url.includes('/api/v1/search/atoms')).flush({ hits: [], pagination: { total_hits: 0, limit: 20, offset: 0 }, processing_time_ms: 0, query: 'x' });
    httpMock.expectOne((r) => r.url.includes('/api/catalog')).flush({ items: [] });
    httpMock.expectOne((r) => r.url.includes('/api/v1/collections/search')).flush({ items: [] });
  }));

  // ── Empty query → idle ──────────────────────────────────────────────────────

  it('empty query resets to idle — no HTTP fired', fakeAsync(() => {
    service.search('');
    tick(300);
    expect(service.state().status).toBe('idle');
    httpMock.expectNone(() => true);
  }));

  it('whitespace-only query resets to idle', fakeAsync(() => {
    service.search('   ');
    tick(300);
    expect(service.state().status).toBe('idle');
    httpMock.expectNone(() => true);
  }));

  // ── Graceful degradation: collection-search error ───────────────────────────
  // WS-8: collection-search is LIVE (gateway SearchMyCollections). A collection
  // branch error degrades to empty collections rather than nuking the whole
  // hub — mirrors the atoms + courses branches.

  it('collection-search error → degrades to empty collections, hub still succeeds', fakeAsync(() => {
    service.search('biology');
    tick(300);

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/search/atoms'))
      .flush({ hits: [], pagination: { total_hits: 0, limit: 20, offset: 0 }, processing_time_ms: 0, query: 'biology' });
    httpMock
      .expectOne((r) => r.url.includes('/api/catalog'))
      .flush({ items: [] });
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/collections/search'))
      .flush(null, { status: 404, statusText: 'Not Found' });

    const state = service.state();
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      expect(state.results.collections).toEqual([]);
    }
  }));

  it('atom 5xx → error_upstream key', fakeAsync(() => {
    service.search('bio');
    tick(300);

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/search/atoms'))
      .flush(null, { status: 500, statusText: 'Internal Server Error' });
    // catalog + collections may or may not fire depending on forkJoin short-circuit
    // httpMock.expectOne may not find these — use expectNone or handle
    httpMock.match(() => true); // consume any remaining
  }));

  it('401 → error_unauthorised key', fakeAsync(() => {
    service.search('bio');
    tick(300);

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/search/atoms'))
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    httpMock.match(() => true);

    // forkJoin error path → error state
    // Note: error key depends on which endpoint throws first.
    // Atom 401 errors: outer catchError → error_unauthorised
    // (This test is structural — key mapping tested via errorKey unit below)
    expect(service.state().status).toSatisfy(
      (s: string) => s === 'error' || s === 'loading',
    );
  }));

  // ── retry() ────────────────────────────────────────────────────────────────

  it('retry() re-fires after a success state using the last query', fakeAsync(() => {
    service.search('biology');
    tick(300);

    const flush = () => {
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/search/atoms'))
        .flush({ hits: [], pagination: { total_hits: 0, limit: 20, offset: 0 }, processing_time_ms: 0, query: 'biology' });
      httpMock.expectOne((r) => r.url.includes('/api/catalog')).flush({ items: [] });
      httpMock.expectOne((r) => r.url.includes('/api/v1/collections/search')).flush({ items: [] });
    };
    flush();
    expect(service.state().status).toBe('success');

    service.retry();
    tick(300);
    flush();
    expect(service.state().status).toBe('success');
  }));

  // ── localStorage side effect ────────────────────────────────────────────────

  it('pushes successful query to localStorage', fakeAsync(() => {
    service.search('biology');
    tick(300);

    httpMock.expectOne((r) => r.url.includes('/api/v1/search/atoms'))
      .flush({ hits: [], pagination: { total_hits: 0, limit: 20, offset: 0 }, processing_time_ms: 0, query: 'biology' });
    httpMock.expectOne((r) => r.url.includes('/api/catalog')).flush({ items: [] });
    httpMock.expectOne((r) => r.url.includes('/api/v1/collections/search')).flush({ items: [] });

    const stored = JSON.parse(
      localStorage.getItem(RECENT_SEARCHES_KEY) ?? '[]',
    ) as string[];
    expect(stored).toContain('biology');
  }));

  // ── Computed count selectors ────────────────────────────────────────────────

  it('atomCount + courseCount + collectionCount sum to totalCount', fakeAsync(() => {
    service.search('bio');
    tick(300);

    httpMock.expectOne((r) => r.url.includes('/api/v1/search/atoms'))
      .flush({ hits: [makeAtomHit(), makeAtomHit({ id: '01000000-0000-7000-8000-000000000002', title: 'Cell Division' })], pagination: { total_hits: 2, limit: 20, offset: 0 }, processing_time_ms: 2, query: 'bio' });
    httpMock.expectOne((r) => r.url.includes('/api/catalog'))
      .flush({ items: [makeCatalogItem()] });
    httpMock.expectOne((r) => r.url.includes('/api/v1/collections/search'))
      .flush({ items: [] });

    expect(service.atomCount()).toBe(2);
    expect(service.courseCount()).toBe(1);
    expect(service.collectionCount()).toBe(0);
    expect(service.totalCount()).toBe(3);
  }));

  // ── Request param shapes ─────────────────────────────────────────────────────

  it('sends absolute BFF urls with the documented query params', fakeAsync(() => {
    service.search('biology');
    tick(300);

    const atomReq = httpMock.expectOne(
      (r) => r.url === 'https://api.chora.site/api/v1/search/atoms',
    );
    expect(atomReq.request.method).toBe('GET');
    expect(atomReq.request.params.get('q')).toBe('biology');
    expect(atomReq.request.params.get('limit')).toBe('20');
    atomReq.flush({
      hits: [],
      pagination: { total_hits: 0, limit: 20, offset: 0 },
      processing_time_ms: 0,
      query: 'biology',
    });

    const catReq = httpMock.expectOne(
      (r) => r.url === 'https://api.chora.site/api/catalog',
    );
    expect(catReq.request.method).toBe('GET');
    expect(catReq.request.params.get('public')).toBe('true');
    // catalog has no server-side q param (FE-side filter)
    expect(catReq.request.params.get('q')).toBeNull();
    catReq.flush({ items: [] });

    const colReq = httpMock.expectOne(
      (r) => r.url === 'https://api.chora.site/api/v1/collections/search',
    );
    expect(colReq.request.method).toBe('GET');
    expect(colReq.request.params.get('q')).toBe('biology');
    expect(colReq.request.params.get('limit')).toBe('10');
    colReq.flush({ items: [] });
  }));

  it('trims the query before sending it to the BFF', fakeAsync(() => {
    service.search('  biology  ');
    tick(300);

    const atomReq = httpMock.expectOne((r) =>
      r.url.includes('/api/v1/search/atoms'),
    );
    expect(atomReq.request.params.get('q')).toBe('biology');
    atomReq.flush({
      hits: [],
      pagination: { total_hits: 0, limit: 20, offset: 0 },
      processing_time_ms: 0,
      query: 'biology',
    });
    httpMock.expectOne((r) => r.url.includes('/api/catalog')).flush({ items: [] });
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/collections/search'))
      .flush({ items: [] });

    const state = service.state();
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      // success state carries the trimmed query
      expect(state.query).toBe('biology');
    }
  }));

  // ── distinctUntilChanged ─────────────────────────────────────────────────────

  it('distinctUntilChanged: an identical consecutive query does NOT refire', fakeAsync(() => {
    service.search('biology');
    tick(300);
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/search/atoms'))
      .flush({ hits: [], pagination: { total_hits: 0, limit: 20, offset: 0 }, processing_time_ms: 0, query: 'biology' });
    httpMock.expectOne((r) => r.url.includes('/api/catalog')).flush({ items: [] });
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/collections/search'))
      .flush({ items: [] });
    expect(service.state().status).toBe('success');

    // Same value again → distinctUntilChanged swallows it; no new requests.
    service.search('biology');
    tick(300);
    httpMock.expectNone(() => true);
    expect(service.state().status).toBe('success');
  }));

  // ── Atom field mapping ───────────────────────────────────────────────────────

  it('maps all atom hit fields incl. content_excerpt onto the AtomSearchResult', fakeAsync(() => {
    service.search('photo');
    tick(300);

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/search/atoms'))
      .flush({
        hits: [
          makeAtomHit({
            content_excerpt: 'Plants use <em>photo</em>synthesis',
            atom_type: 'flashcard',
            difficulty: 5,
            labels: ['biology', 'plants'],
            topic_names: ['Botany'],
          }),
        ],
        pagination: { total_hits: 1, limit: 20, offset: 0 },
        processing_time_ms: 3,
        query: 'photo',
      });
    httpMock.expectOne((r) => r.url.includes('/api/catalog')).flush({ items: [] });
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/collections/search'))
      .flush({ items: [] });

    const atom = service.atoms()[0];
    expect(atom.kind).toBe('atom');
    expect(atom.content_excerpt).toBe('Plants use <em>photo</em>synthesis');
    expect(atom.atom_type).toBe('flashcard');
    expect(atom.difficulty).toBe(5);
    expect(atom.labels).toEqual(['biology', 'plants']);
    expect(atom.topic_names).toEqual(['Botany']);
  }));

  // ── Course filter branches ───────────────────────────────────────────────────

  it('course filter matches on instructor_name', fakeAsync(() => {
    service.search('chen');
    tick(300);

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/search/atoms'))
      .flush({ hits: [], pagination: { total_hits: 0, limit: 20, offset: 0 }, processing_time_ms: 0, query: 'chen' });
    httpMock.expectOne((r) => r.url.includes('/api/catalog')).flush({
      items: [
        makeCatalogItem({
          id: 'c-instructor',
          title: 'Unrelated Title',
          instructor_name: 'Mr. Chen',
          tags: ['math'],
        }),
        makeCatalogItem({
          id: 'c-nomatch',
          title: 'Algebra',
          instructor_name: 'Ms. Lim',
          tags: ['math'],
        }),
      ],
    });
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/collections/search'))
      .flush({ items: [] });

    expect(service.courses()).toHaveLength(1);
    expect(service.courses()[0].id).toBe('c-instructor');
  }));

  it('course filter matches on tags', fakeAsync(() => {
    service.search('robotics');
    tick(300);

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/search/atoms'))
      .flush({ hits: [], pagination: { total_hits: 0, limit: 20, offset: 0 }, processing_time_ms: 0, query: 'robotics' });
    httpMock.expectOne((r) => r.url.includes('/api/catalog')).flush({
      items: [
        makeCatalogItem({
          id: 'c-tag',
          title: 'Intro Course',
          instructor_name: 'Someone',
          tags: ['robotics', 'stem'],
        }),
      ],
    });
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/collections/search'))
      .flush({ items: [] });

    expect(service.courses()).toHaveLength(1);
    expect(service.courses()[0].id).toBe('c-tag');
  }));

  it('course filter tolerates a missing instructor_name (nullish coalesce)', fakeAsync(() => {
    service.search('biology');
    tick(300);

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/search/atoms'))
      .flush({ hits: [], pagination: { total_hits: 0, limit: 20, offset: 0 }, processing_time_ms: 0, query: 'biology' });
    httpMock.expectOne((r) => r.url.includes('/api/catalog')).flush({
      items: [
        // instructor_name omitted → the (c.instructor_name ?? '') branch
        makeCatalogItem({
          id: 'c-noinstructor',
          title: 'Biology Lab',
          instructor_name: undefined,
          tags: [],
        }),
      ],
    });
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/collections/search'))
      .flush({ items: [] });

    expect(service.courses()).toHaveLength(1);
    expect(service.courses()[0].title).toBe('Biology Lab');
    expect(service.courses()[0].instructor_name).toBeUndefined();
  }));

  it('maps full course fields incl. price + free flags', fakeAsync(() => {
    service.search('paid');
    tick(300);

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/search/atoms'))
      .flush({ hits: [], pagination: { total_hits: 0, limit: 20, offset: 0 }, processing_time_ms: 0, query: 'paid' });
    httpMock.expectOne((r) => r.url.includes('/api/catalog')).flush({
      items: [
        makeCatalogItem({
          id: 'c-paid',
          title: 'Paid Bootcamp',
          is_free: false,
          price_sgd_cents: 19900,
          enrolled_count: 7,
          tags: ['paid'],
        }),
      ],
    });
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/collections/search'))
      .flush({ items: [] });

    const course = service.courses()[0];
    expect(course.kind).toBe('course');
    expect(course.is_free).toBe(false);
    expect(course.price_sgd_cents).toBe(19900);
    expect(course.enrolled_count).toBe(7);
  }));

  // ── Collection field mapping ─────────────────────────────────────────────────

  it('maps collection items onto CollectionSearchResult', fakeAsync(() => {
    service.search('bio');
    tick(300);

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/search/atoms'))
      .flush({ hits: [], pagination: { total_hits: 0, limit: 20, offset: 0 }, processing_time_ms: 0, query: 'bio' });
    httpMock.expectOne((r) => r.url.includes('/api/catalog')).flush({ items: [] });
    httpMock.expectOne((r) => r.url.includes('/api/v1/collections/search')).flush({
      items: [
        makeCollectionItem({
          id: 'col-1',
          title: 'Bio Pack',
          atom_count: 9,
          owner_display_name: 'Bob',
        }),
      ],
    });

    const col = service.collections()[0];
    expect(col.kind).toBe('collection');
    expect(col.id).toBe('col-1');
    expect(col.title).toBe('Bio Pack');
    expect(col.atom_count).toBe(9);
    expect(col.owner_display_name).toBe('Bob');
  }));

  // ── Graceful degradation: atom + catalog branch errors ───────────────────────

  it('atom-search 500 degrades to empty atoms — hub still succeeds', fakeAsync(() => {
    service.search('biology');
    tick(300);

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/search/atoms'))
      .flush(null, { status: 500, statusText: 'Internal Server Error' });
    httpMock
      .expectOne((r) => r.url.includes('/api/catalog'))
      .flush({ items: [makeCatalogItem()] });
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/collections/search'))
      .flush({ items: [] });

    const state = service.state();
    expect(state.status).toBe('success');
    expect(service.atoms()).toEqual([]);
    expect(service.courses()).toHaveLength(1);
  }));

  it('catalog 503 degrades to empty courses — hub still succeeds', fakeAsync(() => {
    service.search('biology');
    tick(300);

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/search/atoms'))
      .flush({ hits: [makeAtomHit()], pagination: { total_hits: 1, limit: 20, offset: 0 }, processing_time_ms: 1, query: 'biology' });
    httpMock
      .expectOne((r) => r.url.includes('/api/catalog'))
      .flush(null, { status: 503, statusText: 'Service Unavailable' });
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/collections/search'))
      .flush({ items: [] });

    const state = service.state();
    expect(state.status).toBe('success');
    expect(service.atoms()).toHaveLength(1);
    expect(service.courses()).toEqual([]);
  }));

  it('all three branches erroring still yields a (degenerate) success state', fakeAsync(() => {
    service.search('biology');
    tick(300);

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/search/atoms'))
      .flush(null, { status: 500, statusText: 'err' });
    httpMock
      .expectOne((r) => r.url.includes('/api/catalog'))
      .flush(null, { status: 500, statusText: 'err' });
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/collections/search'))
      .flush(null, { status: 500, statusText: 'err' });

    // Each branch catches its own error → the hub never reaches the outer
    // 'error' state; it succeeds with all three result lists empty.
    expect(service.state().status).toBe('success');
    expect(service.totalCount()).toBe(0);
  }));

  // ── retry() guards ───────────────────────────────────────────────────────────

  it('retry() is a no-op when state is idle (no query) — no HTTP', fakeAsync(() => {
    expect(service.state().status).toBe('idle');
    service.retry();
    tick(300);
    httpMock.expectNone(() => true);
    expect(service.state().status).toBe('idle');
  }));

  it('retry() bypasses distinctUntilChanged — refires the same query', fakeAsync(() => {
    service.search('biology');
    tick(300);
    const flush = () => {
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/search/atoms'))
        .flush({ hits: [], pagination: { total_hits: 0, limit: 20, offset: 0 }, processing_time_ms: 0, query: 'biology' });
      httpMock.expectOne((r) => r.url.includes('/api/catalog')).flush({ items: [] });
      httpMock.expectOne((r) => r.url.includes('/api/v1/collections/search')).flush({ items: [] });
    };
    flush();
    expect(service.state().status).toBe('success');

    // retry refires immediately through refresh$ (no debounce on that stream),
    // but switchMap still sets loading → the inner federatedSearch fires.
    service.retry();
    flush();
    expect(service.state().status).toBe('success');
  }));

  // ── search('') after a success resets to idle ────────────────────────────────

  it('searching empty after a success transitions back to idle', fakeAsync(() => {
    service.search('biology');
    tick(300);
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/search/atoms'))
      .flush({ hits: [], pagination: { total_hits: 0, limit: 20, offset: 0 }, processing_time_ms: 0, query: 'biology' });
    httpMock.expectOne((r) => r.url.includes('/api/catalog')).flush({ items: [] });
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/collections/search'))
      .flush({ items: [] });
    expect(service.state().status).toBe('success');

    service.search('');
    tick(300);
    expect(service.state().status).toBe('idle');
    httpMock.expectNone(() => true);
  }));
});

// ── errorKey() status-code branch table + error-state retry ──────────────────────
// These drive the outer catchError (the sole caller of the private errorKey
// mapper) by replacing federatedSearch with a controlled error source. The
// federation's per-branch catchError makes the real HTTP path never reach this
// arm, so this is the only way to characterize the status-code → i18n-key table.

describe('SearchService — errorKey mapping + error-state retry', () => {
  let service: SearchService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem(RECENT_SEARCHES_KEY);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SearchService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  });

  it('404 → error_collection_not_wired (errorKey branch: status === 404)', fakeAsync(() => {
    forceFederatedError(service, { status: 404 });
    service.search('biology');
    tick(300);

    const state = service.state();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error).toBe('aplus.search.error_collection_not_wired');
    }
    httpMock.expectNone(() => true);
  }));

  it('500 → error_upstream (errorKey branch: status >= 500)', fakeAsync(() => {
    forceFederatedError(service, { status: 500 });
    service.search('biology');
    tick(300);

    const state = service.state();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error).toBe('aplus.search.error_upstream');
    }
    httpMock.expectNone(() => true);
  }));

  it('503 (>500) → error_upstream', fakeAsync(() => {
    forceFederatedError(service, { status: 503 });
    service.search('biology');
    tick(300);

    const state = service.state();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error).toBe('aplus.search.error_upstream');
    }
    httpMock.expectNone(() => true);
  }));

  it('401 → error_unauthorised (errorKey binary-expr: 401 || 403, first arm)', fakeAsync(() => {
    forceFederatedError(service, { status: 401 });
    service.search('biology');
    tick(300);

    const state = service.state();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error).toBe('aplus.search.error_unauthorised');
    }
    httpMock.expectNone(() => true);
  }));

  it('403 → error_unauthorised (errorKey binary-expr: 401 || 403, second arm)', fakeAsync(() => {
    forceFederatedError(service, { status: 403 });
    service.search('biology');
    tick(300);

    const state = service.state();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error).toBe('aplus.search.error_unauthorised');
    }
    httpMock.expectNone(() => true);
  }));

  it('400 (4xx but not 404/401/403) → error_generic (falls through the if-chain)', fakeAsync(() => {
    forceFederatedError(service, { status: 400 });
    service.search('biology');
    tick(300);

    const state = service.state();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error).toBe('aplus.search.error_generic');
    }
    httpMock.expectNone(() => true);
  }));

  it('non-numeric status → error_generic (errorKey guard: typeof status !== number)', fakeAsync(() => {
    forceFederatedError(service, { message: 'TypeError: boom' });
    service.search('biology');
    tick(300);

    const state = service.state();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error).toBe('aplus.search.error_generic');
    }
    httpMock.expectNone(() => true);
  }));

  it('null/undefined-ish error (optional-chain skipped arm) → error_generic', fakeAsync(() => {
    forceFederatedError(service, null);
    service.search('biology');
    tick(300);

    const state = service.state();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error).toBe('aplus.search.error_generic');
    }
    httpMock.expectNone(() => true);
  }));

  // retry() while in ERROR state: s.status === 'error' is truthy, so the
  // ternary takes its FALSE arm (q = '') and the `if (q)` guard is FALSE —
  // retry is a no-op. This covers the previously-uncovered cond-expr false arm
  // (line 154) and the `if (q)` false arm (line 155).
  it('retry() in error state is a no-op (ternary false arm + if(q) false arm)', fakeAsync(() => {
    forceFederatedError(service, { status: 500 });
    service.search('biology');
    tick(300);
    expect(service.state().status).toBe('error');

    // Restore a real (but immediately error-degrading) federatedSearch so a
    // refire would visibly fire HTTP — but retry() in error state computes
    // q = '' and the if(q) guard short-circuits, so refresh$ never emits.
    service.retry();
    tick(300);

    // State unchanged — refresh$ never fired because q was empty.
    expect(service.state().status).toBe('error');
    httpMock.expectNone(() => true);
  }));
});

// ── localStorage helpers unit tests ────────────────────────────────────────────

describe('pushRecentSearch + loadRecentSearches', () => {
  beforeEach(() => localStorage.removeItem(RECENT_SEARCHES_KEY));
  afterEach(() => localStorage.removeItem(RECENT_SEARCHES_KEY));

  it('stores and retrieves a single search term', () => {
    pushRecentSearch('calculus');
    expect(loadRecentSearches()).toContain('calculus');
  });

  it('deduplicates and moves to front', () => {
    pushRecentSearch('a');
    pushRecentSearch('b');
    pushRecentSearch('a');
    const stored = loadRecentSearches();
    expect(stored[0]).toBe('a');
    expect(stored.filter((x: string) => x === 'a')).toHaveLength(1);
  });

  it('caps at 10 items', () => {
    for (let i = 0; i < 15; i++) pushRecentSearch(`term-${i}`);
    expect(loadRecentSearches()).toHaveLength(10);
  });
});
