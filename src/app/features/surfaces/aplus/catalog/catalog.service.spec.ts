import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { CatalogService } from './catalog.service';
import { buildCatalogCourse } from '../../../../testing/builders/buildCatalogCourse';

/**
 * CatalogService spec — A+ public catalog (Phyllis demo Step 5).
 *
 * Wired LIVE 2026-05-14 to GET /api/catalog?public=true. The wave-2
 * fixture is gone — these tests flush the REAL wire shape ({items:[...]})
 * through HttpTestingController and assert the fail-loud discriminated
 * state. Per chora-web CLAUDE.md §6 — `httpMock.verify()` in afterEach.
 */

function setup(): { service: CatalogService; httpMock: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const service = TestBed.inject(CatalogService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

describe('CatalogService (Phyllis Step 5 — real BFF wiring)', () => {
  let service: CatalogService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const result = setup();
    service = result.service;
    httpMock = result.httpMock;
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('issues GET /api/catalog?public=true on load()', () => {
    service.load();
    const req = httpMock.expectOne((r) => r.url.includes('/api/catalog'));
    expect(req.request.method).toBe('GET');
    expect(req.request.url).toContain('public=true');
    req.flush({ items: [] });
  });

  it('starts in the loading state before any flush', () => {
    expect(service.state().status).toBe('loading');
    service.load();
    expect(service.state().status).toBe('loading');
    httpMock.expectOne((r) => r.url.includes('/api/catalog')).flush({ items: [] });
  });

  it('transitions to success with the real {items:[...]} shape', () => {
    const course = buildCatalogCourse({
      id: '05000000-0000-7000-8000-0000000c5301',
      title: 'Certified ScrumMaster (CSM) Prep',
    });
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/catalog'))
      .flush({ items: [course] });

    const state = service.state();
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      expect(state.courses).toHaveLength(1);
      expect(state.courses[0].id).toBe('05000000-0000-7000-8000-0000000c5301');
      expect(state.courses[0].title).toBe('Certified ScrumMaster (CSM) Prep');
    }
    expect(service.courses()).toHaveLength(1);
  });

  it('exposes an empty courses() selector while loading / on error', () => {
    expect(service.courses()).toEqual([]);
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/catalog'))
      .flush(null, { status: 500, statusText: 'Internal Server Error' });
    expect(service.courses()).toEqual([]);
  });

  it('maps a 5xx to error_upstream', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/catalog'))
      .flush(null, { status: 500, statusText: 'Internal Server Error' });

    const state = service.state();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error).toBe('aplus.catalog.error_upstream');
    }
  });

  it('maps a 401 to error_unauthorised', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/catalog'))
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    const state = service.state();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error).toBe('aplus.catalog.error_unauthorised');
    }
  });

  it('maps a 403 to error_unauthorised', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/catalog'))
      .flush(null, { status: 403, statusText: 'Forbidden' });

    const state = service.state();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error).toBe('aplus.catalog.error_unauthorised');
    }
  });

  it('maps a network error (status 0) to error_generic', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/catalog'))
      .error(new ProgressEvent('error'));

    const state = service.state();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error).toBe('aplus.catalog.error_generic');
    }
  });

  it('load() is idempotent — callable twice, recovers on the second flush', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/catalog'))
      .flush(null, { status: 500, statusText: 'Internal Server Error' });
    expect(service.state().status).toBe('error');

    service.load();
    expect(service.state().status).toBe('loading');
    httpMock
      .expectOne((r) => r.url.includes('/api/catalog'))
      .flush({ items: [buildCatalogCourse()] });
    expect(service.state().status).toBe('success');
    expect(service.courses()).toHaveLength(1);
  });

  // ── CR2-C2 pagination + server-side search tests ─────────────────────

  describe('load() — pagination + server-side search', () => {
    it('sends q param when q is specified', () => {
      service.load({ q: 'scrum' });
      const req = httpMock.expectOne((r) => r.url.includes('/api/catalog'));
      expect(req.request.params.get('q')).toBe('scrum');
      req.flush({ items: [] });
    });

    it('sends first param when first is specified', () => {
      service.load({ first: 10 });
      const req = httpMock.expectOne((r) => r.url.includes('/api/catalog'));
      expect(req.request.params.get('first')).toBe('10');
      req.flush({ items: [] });
    });

    it('sends after param when after is specified', () => {
      service.load({ after: 'cursor-abc123' });
      const req = httpMock.expectOne((r) => r.url.includes('/api/catalog'));
      expect(req.request.params.get('after')).toBe('cursor-abc123');
      req.flush({ items: [] });
    });

    it('stores hasNextPage=true when page_info.has_next_page is true', () => {
      service.load();
      httpMock
        .expectOne((r) => r.url.includes('/api/catalog'))
        .flush({
          items: [buildCatalogCourse()],
          page_info: { has_next_page: true, end_cursor: 'end-cur-1' },
        });
      expect(service.hasNextPage()).toBe(true);
    });

    it('stores endCursor from page_info.end_cursor', () => {
      service.load();
      httpMock
        .expectOne((r) => r.url.includes('/api/catalog'))
        .flush({
          items: [buildCatalogCourse()],
          page_info: { has_next_page: true, end_cursor: 'end-cur-xyz' },
        });
      expect(service.endCursor()).toBe('end-cur-xyz');
    });

    it('defaults hasNextPage to false when page_info is absent', () => {
      service.load();
      httpMock
        .expectOne((r) => r.url.includes('/api/catalog'))
        .flush({ items: [] });
      expect(service.hasNextPage()).toBe(false);
    });

    it('defaults endCursor to null when page_info is absent', () => {
      service.load();
      httpMock
        .expectOne((r) => r.url.includes('/api/catalog'))
        .flush({ items: [] });
      expect(service.endCursor()).toBeNull();
    });

    it('appends items when append:true', () => {
      // First page
      service.load();
      httpMock
        .expectOne((r) => r.url.includes('/api/catalog'))
        .flush({
          items: [buildCatalogCourse({ id: 'c1', title: 'First Course' })],
          page_info: { has_next_page: true, end_cursor: 'cur-2' },
        });
      expect(service.courses()).toHaveLength(1);

      // Append second page
      service.load({ after: 'cur-2', append: true });
      httpMock
        .expectOne((r) => r.url.includes('/api/catalog'))
        .flush({
          items: [buildCatalogCourse({ id: 'c2', title: 'Second Course' })],
          page_info: { has_next_page: false, end_cursor: '' },
        });
      expect(service.courses()).toHaveLength(2);
      expect(service.courses()[0].id).toBe('c1');
      expect(service.courses()[1].id).toBe('c2');
    });

    it('does NOT reset state to loading when append:true', () => {
      // Prime success state
      service.load();
      httpMock
        .expectOne((r) => r.url.includes('/api/catalog'))
        .flush({
          items: [buildCatalogCourse({ id: 'c1' })],
          page_info: { has_next_page: true, end_cursor: 'cur-2' },
        });
      expect(service.state().status).toBe('success');

      // Append — state must stay success (no loading flicker)
      service.load({ after: 'cur-2', append: true });
      expect(service.state().status).toBe('success');
      httpMock
        .expectOne((r) => r.url.includes('/api/catalog'))
        .flush({ items: [buildCatalogCourse({ id: 'c2' })] });
    });
  });
});
