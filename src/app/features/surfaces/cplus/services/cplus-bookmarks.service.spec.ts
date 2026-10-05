import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
  TestRequest,
} from '@angular/common/http/testing';

import { CplusBookmarksService } from './cplus-bookmarks.service';
import { BookmarkEntry } from '../models/cplus-bookmarks.model';

/**
 * Wire-shape bookmark entry — mirrors chora-sharing
 * `GET /v1/me/bookmarks` DTO.
 */
const WIRE_BOOKMARK: BookmarkEntry = {
  id: 'bk-1',
  atom_id: 'atom-019700aa-abc',
  atom_revision_id: 'rev-019700aa-abc',
  created_at: '2026-06-19T10:00:00Z',
};

const WIRE_BOOKMARK_2: BookmarkEntry = {
  id: 'bk-2',
  atom_id: 'atom-019700bb-def',
  atom_revision_id: 'rev-019700bb-def',
  created_at: '2026-06-20T11:00:00Z',
};

describe('CplusBookmarksService', () => {
  let service: CplusBookmarksService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        CplusBookmarksService,
      ],
    });
    service = TestBed.inject(CplusBookmarksService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('initial state', () => {
    it('starts idle with no bookmarked ids', () => {
      expect(service.state().status).toBe('idle');
      expect(service.bookmarkedIds().size).toBe(0);
      expect(service.isBookmarked('atom-1')).toBe(false);
    });
  });

  describe('bookmark (POST /v1/atoms/{id}/bookmark)', () => {
    it('POSTs with an Idempotency-Key and transitions saving → saved', async () => {
      const promise = service.bookmark('atom-1');
      const req = httpMock.expectOne((r) =>
        r.method === 'POST' && r.url.endsWith('/v1/atoms/atom-1/bookmark'),
      );
      expect(service.state().status).toBe('saving');
      // Contract-mandated idempotency key: `bookmark-{atomId}-{timestamp}`.
      const key = req.request.headers.get('Idempotency-Key');
      expect(key).toMatch(/^bookmark-atom-1-\d+$/);
      req.flush(null, { status: 204, statusText: 'No Content' });

      expect(await promise).toBe(true);
      expect(service.state().status).toBe('saved');
      expect(service.isBookmarked('atom-1')).toBe(true);
      expect(service.bookmarkedIds().has('atom-1')).toBe(true);
    });

    it('POSTs with an empty body {}', async () => {
      const promise = service.bookmark('atom-2');
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/atoms/atom-2/bookmark'));
      expect(req.request.body).toEqual({});
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect(await promise).toBe(true);
    });

    it('500 → error state with the upstream key and returns false', async () => {
      const promise = service.bookmark('atom-1');
      httpMock
        .expectOne((r) => r.url.endsWith('/v1/atoms/atom-1/bookmark'))
        .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });

      expect(await promise).toBe(false);
      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error.code).toBe('BOOKMARK_FAILED');
        expect(state.error.message).toBe('cplus.bookmarks.error_upstream');
      }
      expect(service.isBookmarked('atom-1')).toBe(false);
    });

    it('401 → the not-authenticated key, which asks for a sign-in', async () => {
      const promise = service.bookmark('atom-1');
      httpMock
        .expectOne((r) => r.url.endsWith('/v1/atoms/atom-1/bookmark'))
        .flush({}, { status: 401, statusText: 'Unauthorized' });
      await promise;
      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error.message).toBe('cplus.bookmarks.error_unauthenticated');
      }
    });

    it('403 → the forbidden key, which never asks for a sign-in', async () => {
      const promise = service.bookmark('atom-1');
      httpMock
        .expectOne((r) => r.url.endsWith('/v1/atoms/atom-1/bookmark'))
        .flush({}, { status: 403, statusText: 'Forbidden' });
      await promise;
      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error.message).toBe('cplus.bookmarks.error_forbidden');
      }
    });

    it('404 → error state with the generic key', async () => {
      const promise = service.bookmark('atom-1');
      httpMock
        .expectOne((r) => r.url.endsWith('/v1/atoms/atom-1/bookmark'))
        .flush({}, { status: 404, statusText: 'Not Found' });
      await promise;
      const state = service.state();
      if (state.status === 'error') {
        expect(state.error.message).toBe('cplus.bookmarks.error_generic');
      }
    });

    it('network error (no status) → error state with the generic key', async () => {
      const promise = service.bookmark('atom-1');
      httpMock
        .expectOne((r) => r.url.endsWith('/v1/atoms/atom-1/bookmark'))
        .error(new ProgressEvent('network error'));
      expect(await promise).toBe(false);
      const state = service.state();
      if (state.status === 'error') {
        expect(state.error.message).toBe('cplus.bookmarks.error_generic');
      }
    });
  });

  describe('unbookmark (DELETE /v1/atoms/{id}/bookmark)', () => {
    it('DELETEs and transitions removing → removed', async () => {
      // Seed the toggled-on state the UI would show — flush the POST before
      // awaiting so the priming call completes.
      const prime = service.bookmark('atom-1');
      httpMock.expectOne((r) => r.url.endsWith('/v1/atoms/atom-1/bookmark'))
        .flush(null, { status: 204, statusText: 'No Content' });
      await prime;

      const promise = service.unbookmark('atom-1');
      const req = httpMock.expectOne((r) =>
        r.method === 'DELETE' && r.url.endsWith('/v1/atoms/atom-1/bookmark'),
      );
      expect(service.state().status).toBe('removing');
      req.flush(null, { status: 204, statusText: 'No Content' });

      expect(await promise).toBe(true);
      expect(service.state().status).toBe('removed');
      expect(service.isBookmarked('atom-1')).toBe(false);
      expect(service.bookmarkedIds().size).toBe(0);
    });

    it('400 → error state with the generic key and keeps the bookmark', async () => {
      // Prime the bookmarked set so the "kept" assertion is meaningful.
      const prime = service.bookmark('atom-1');
      httpMock.expectOne((r) => r.url.endsWith('/v1/atoms/atom-1/bookmark'))
        .flush(null, { status: 204, statusText: 'No Content' });
      await prime;

      const promise = service.unbookmark('atom-1');
      httpMock
        .expectOne((r) => r.url.endsWith('/v1/atoms/atom-1/bookmark'))
        .flush({}, { status: 400, statusText: 'Bad Request' });

      expect(await promise).toBe(false);
      const state = service.state();
      if (state.status === 'error') {
        expect(state.error.code).toBe('UNBOOKMARK_FAILED');
        expect(state.error.message).toBe('cplus.bookmarks.error_generic');
      }
      expect(service.isBookmarked('atom-1')).toBe(true);
    });
  });

  describe('listBookmarks (GET /v1/me/bookmarks)', () => {
    // NOTE: the service builds `?limit=` INTO the URL string (no HttpParams
    // option), so in this Angular version the query rides along in `req.url`
    // — strip it before path-matching and read params via `new URL(...)`.
    function expectListRequest(): TestRequest {
      return httpMock.expectOne((r) =>
        r.method === 'GET' &&
        r.url.split('?')[0].endsWith('/v1/me/bookmarks'),
      );
    }

    function listParams(req: { request: { urlWithParams: string } }): URLSearchParams {
      return new URL(req.request.urlWithParams).searchParams;
    }

    it('GETs limit=20 by default and seeds the bookmarked-id set', async () => {
      const promise = service.listBookmarks();
      const req = expectListRequest();
      expect(listParams(req).get('limit')).toBe('20');
      expect(listParams(req).has('cursor')).toBe(false);
      req.flush({ bookmarks: [WIRE_BOOKMARK, WIRE_BOOKMARK_2] });

      const entries = await promise;
      expect(entries).toHaveLength(2);
      expect(entries[0].atom_id).toBe(WIRE_BOOKMARK.atom_id);
      expect(entries[1].atom_id).toBe(WIRE_BOOKMARK_2.atom_id);
      expect(service.isBookmarked(WIRE_BOOKMARK.atom_id)).toBe(true);
      expect(service.isBookmarked(WIRE_BOOKMARK_2.atom_id)).toBe(true);
    });

    it('passes a custom limit when supplied', async () => {
      const promise = service.listBookmarks(undefined, 50);
      const req = expectListRequest();
      expect(listParams(req).get('limit')).toBe('50');
      req.flush({ bookmarks: [] });
      await promise;
    });

    it('appends a URL-encoded cursor param when one is supplied', async () => {
      const promise = service.listBookmarks('cursor abc/def');
      // Note: expectOne predicates receive the underlying HttpRequest (which
      // has no `.request` field) — match on the path only, then read the
      // query string from the returned TestRequest via `new URL(...)`.
      const req = expectListRequest();
      expect(listParams(req).get('cursor')).toBe('cursor abc/def');
      req.flush({ bookmarks: [] });
      await promise;
    });

    it('omits the cursor param when the cursor is whitespace-only', async () => {
      const promise = service.listBookmarks('   ');
      const req = expectListRequest();
      expect(listParams(req).has('cursor')).toBe(false);
      req.flush({ bookmarks: [] });
      await promise;
    });

    it('merges newly-listed ids into (rather than replacing) the bookmarked set', async () => {
      const prime = service.bookmark('atom-already');
      httpMock.expectOne((r) => r.url.endsWith('/v1/atoms/atom-already/bookmark'))
        .flush(null, { status: 204, statusText: 'No Content' });
      await prime;

      const promise = service.listBookmarks();
      const req = expectListRequest();
      req.flush({ bookmarks: [WIRE_BOOKMARK] });
      await promise;

      expect(service.isBookmarked('atom-already')).toBe(true);
      expect(service.isBookmarked(WIRE_BOOKMARK.atom_id)).toBe(true);
    });

    it('returns [] when the response omits the bookmarks key (?? [])', async () => {
      const promise = service.listBookmarks();
      const req = expectListRequest();
      req.flush({}); // no `bookmarks` key — exercises the `resp?.bookmarks ?? []` arm.
      expect(await promise).toEqual([]);
      expect(service.state().status).toBe('idle'); // list does not touch _state
    });

    it('returns [] on error (never throws)', async () => {
      const promise = service.listBookmarks();
      const req = expectListRequest();
      req.flush({}, { status: 500, statusText: 'Server Error' });
      expect(await promise).toEqual([]);
      expect(service.bookmarkedIds().size).toBe(0);
    });
  });

  describe('toggle', () => {
    it('bookmarks an unbookmarked atom', async () => {
      const promise = service.toggle('atom-t');
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/atoms/atom-t/bookmark'));
      expect(req.request.method).toBe('POST');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await promise;
      expect(service.isBookmarked('atom-t')).toBe(true);
      expect(service.state().status).toBe('saved');
    });

    it('unbookmarks a bookmarked atom', async () => {
      const prime = service.bookmark('atom-t');
      httpMock.expectOne((r) => r.url.endsWith('/v1/atoms/atom-t/bookmark'))
        .flush(null, { status: 204, statusText: 'No Content' });
      await prime;

      const promise = service.toggle('atom-t');
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/atoms/atom-t/bookmark'));
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await promise;
      expect(service.isBookmarked('atom-t')).toBe(false);
      expect(service.state().status).toBe('removed');
    });
  });
});