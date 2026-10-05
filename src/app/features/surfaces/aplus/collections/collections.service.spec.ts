/**
 * CollectionsService spec — WS-6b BFF wrapper.
 *
 * Tests cover:
 * - loadList(): GET /api/v1/me/collections → success / error transitions
 * - loadDetail(): GET /api/v1/collections/{id} → success / 404 / 5xx
 * - create(): POST /api/v1/collections → submitting → success / error
 * - update(): PATCH /api/v1/collections/{id} → submitting → success / error
 * - delete(): DELETE /api/v1/collections/{id} → success / error
 * - addAtom(): POST /api/v1/collections/{id}/atoms → success / 409 cap / error
 * - removeAtom(): DELETE /api/v1/collections/{id}/atoms/{atomId} → success / error
 * - Fail-loud: 4xx/5xx and gateway-not-wired (status 0) map to explicit error keys
 * - httpMock.verify() asserts no unexpected requests
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { throwError } from 'rxjs';

import { ApiError } from '../../../../core/interceptors/api-error.model';
import { CollectionsService } from './collections.service';
import type {
  Collection,
  CollectionListResponse,
  ConvertToStudyListResponse,
} from './collections.model';

/** Deferred-throwing observable factory for the no-numeric-status error branch. */
function throwErrorOf(err: unknown) {
  return throwError(() => err);
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

const TENANT_ID = '10000000-0000-7000-8000-000000000001';
const GCID_1 = '20000000-0000-7000-8000-000000000002';
const COL_ID = '30000000-0000-7000-8000-000000000003';
const ATOM_ID_1 = '40000000-0000-7000-8000-000000000004';
const ATOM_ID_2 = '40000000-0000-7000-8000-000000000005';

function buildCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    collection_id: COL_ID,
    tenant_id: TENANT_ID,
    owner_gcid: GCID_1,
    title: 'My Study Collection',
    description: 'A curated list of atoms for the OSI model chapter.',
    visibility: 'private',
    created_at: '2026-05-26T10:00:00.000Z',
    updated_at: '2026-05-26T10:00:00.000Z',
    ...overrides,
  };
}

function buildListResponse(overrides: Partial<CollectionListResponse> = {}): CollectionListResponse {
  return {
    items: [buildCollection()],
    total: 1,
    ...overrides,
  };
}

/** WS-4 / ADR-233 D11 — the 201 partial-success envelope. */
function buildConvertResult(
  overrides: Partial<ConvertToStudyListResponse> = {},
): ConvertToStudyListResponse {
  return {
    study_list_event_id: '019f0000-0000-7000-8000-00000000000a',
    atom_count: 3,
    excluded: [],
    ...overrides,
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────────

function setup(): { service: CollectionsService; httpMock: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(CollectionsService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CollectionsService (WS-6b BFF wrapper)', () => {
  let service: CollectionsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ service, httpMock } = setup());
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ── loadList ────────────────────────────────────────────────────────────────

  describe('loadList()', () => {
    it('issues GET /api/v1/me/collections', () => {
      service.loadList();
      const req = httpMock.expectOne((r) => r.url.includes('/me/collections'));
      expect(req.request.method).toBe('GET');
      expect(req.request.url).toContain('/api/v1/me/collections');
      req.flush(buildListResponse());
    });

    it('starts in loading state', () => {
      expect(service.listState().status).toBe('loading');
      service.loadList();
      expect(service.listState().status).toBe('loading');
      httpMock.expectOne((r) => r.url.includes('/me/collections')).flush(buildListResponse());
    });

    it('transitions to success with items and total', () => {
      service.loadList();
      const resp = buildListResponse({ items: [buildCollection(), buildCollection({ collection_id: 'col-2' })], total: 2 });
      httpMock.expectOne((r) => r.url.includes('/me/collections')).flush(resp);
      const s = service.listState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.items.length).toBe(2);
        expect(s.total).toBe(2);
      }
    });

    it('collections() computed returns items on success', () => {
      service.loadList();
      httpMock.expectOne((r) => r.url.includes('/me/collections')).flush(buildListResponse());
      expect(service.collections().length).toBe(1);
      expect(service.collections()[0].collection_id).toBe(COL_ID);
    });

    it('collections() returns empty array on loading', () => {
      service.loadList();
      expect(service.collections().length).toBe(0);
      httpMock.expectOne((r) => r.url.includes('/me/collections')).flush(buildListResponse());
    });

    it('maps 401 to error_unauthorised', () => {
      service.loadList();
      httpMock
        .expectOne((r) => r.url.includes('/me/collections'))
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      const s = service.listState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_unauthorised');
    });

    it('maps 5xx to error_upstream', () => {
      service.loadList();
      httpMock
        .expectOne((r) => r.url.includes('/me/collections'))
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const s = service.listState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_upstream');
    });

    it('maps status 0 (GATEWAY_ROUTE_NOT_FOUND) to error_gateway_not_wired', () => {
      service.loadList();
      httpMock
        .expectOne((r) => r.url.includes('/me/collections'))
        .flush(null, { status: 0, statusText: 'Unknown Error' });
      const s = service.listState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_gateway_not_wired');
    });

    it('loadList() is idempotent — re-call after error resets to loading', () => {
      service.loadList();
      httpMock
        .expectOne((r) => r.url.includes('/me/collections'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      expect(service.listState().status).toBe('error');

      service.loadList();
      expect(service.listState().status).toBe('loading');
      httpMock.expectOne((r) => r.url.includes('/me/collections')).flush(buildListResponse());
      expect(service.listState().status).toBe('success');
    });
  });

  // ── loadDetail ──────────────────────────────────────────────────────────────

  describe('loadDetail()', () => {
    it('issues GET /api/v1/collections/{id} (URI-encoded)', () => {
      service.loadDetail(COL_ID);
      const req = httpMock.expectOne((r) => r.url.includes(`/collections/${COL_ID}`));
      expect(req.request.method).toBe('GET');
      req.flush(buildCollection({ atoms: [] }));
    });

    it('transitions to success with collection', () => {
      service.loadDetail(COL_ID);
      httpMock
        .expectOne((r) => r.url.includes(`/collections/${COL_ID}`))
        .flush(buildCollection({ atoms: [] }));
      const s = service.detailState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.collection.collection_id).toBe(COL_ID);
      }
    });

    it('maps 404 to error_not_found', () => {
      service.loadDetail(COL_ID);
      httpMock
        .expectOne((r) => r.url.includes(`/collections/${COL_ID}`))
        .flush(null, { status: 404, statusText: 'Not Found' });
      const s = service.detailState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_not_found');
    });

    it('maps 403 to error_unauthorised', () => {
      service.loadDetail(COL_ID);
      httpMock
        .expectOne((r) => r.url.includes(`/collections/${COL_ID}`))
        .flush(null, { status: 403, statusText: 'Forbidden' });
      const s = service.detailState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_unauthorised');
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('issues POST /api/v1/collections with body', () => {
      let result: Collection | undefined;
      service.create({ title: 'Test', visibility: 'private' }).subscribe((c) => (result = c));
      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/collections') && r.method === 'POST');
      expect(req.request.body).toEqual({ title: 'Test', visibility: 'private' });
      req.flush(buildCollection({ title: 'Test' }));
      expect(result?.title).toBe('Test');
    });

    it('sets editState to submitting then success', () => {
      service.create({ title: 'Test' }).subscribe();
      expect(service.editState().status).toBe('submitting');
      httpMock.expectOne((r) => r.method === 'POST' && r.url.includes('/collections')).flush(buildCollection());
      expect(service.editState().status).toBe('success');
    });

    it('maps 400 to error_bad_request on create', () => {
      let caught = false;
      service.create({ title: '' }).subscribe({ error: () => (caught = true) });
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url.includes('/collections'))
        .flush(null, { status: 400, statusText: 'Bad Request' });
      const s = service.editState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_bad_request');
      expect(caught).toBe(true);
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('issues PATCH /api/v1/collections/{id}', () => {
      service.update(COL_ID, { title: 'Updated' }).subscribe();
      const req = httpMock.expectOne((r) => r.url.includes(`/collections/${COL_ID}`) && r.method === 'PATCH');
      expect(req.request.body).toEqual({ title: 'Updated' });
      req.flush(buildCollection({ title: 'Updated' }));
    });

    it('sets editState to submitting then success with updated collection', () => {
      service.update(COL_ID, { title: 'Updated' }).subscribe();
      expect(service.editState().status).toBe('submitting');
      httpMock
        .expectOne((r) => r.method === 'PATCH' && r.url.includes(`/collections/${COL_ID}`))
        .flush(buildCollection({ title: 'Updated' }));
      const s = service.editState();
      expect(s.status).toBe('success');
      if (s.status === 'success') expect(s.collection.title).toBe('Updated');
    });
  });

  // ── delete ──────────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('issues DELETE /api/v1/collections/{id}', () => {
      service.delete(COL_ID).subscribe();
      const req = httpMock.expectOne((r) => r.url.includes(`/collections/${COL_ID}`) && r.method === 'DELETE');
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('completes without error on 204', () => {
      let completed = false;
      service.delete(COL_ID).subscribe({ complete: () => (completed = true) });
      httpMock
        .expectOne((r) => r.method === 'DELETE' && r.url.includes(`/collections/${COL_ID}`))
        .flush(null, { status: 204, statusText: 'No Content' });
      expect(completed).toBe(true);
    });
  });

  // ── addAtom ─────────────────────────────────────────────────────────────────

  describe('addAtom()', () => {
    it('issues POST /api/v1/collections/{id}/atoms with atom_id', () => {
      service.addAtom(COL_ID, ATOM_ID_1).subscribe();
      const req = httpMock.expectOne((r) =>
        r.url.includes(`/collections/${COL_ID}/atoms`) && r.method === 'POST',
      );
      expect(req.request.body).toEqual({ atom_id: ATOM_ID_1 });
      req.flush(buildCollection());
    });

    it('includes optional position when supplied', () => {
      service.addAtom(COL_ID, ATOM_ID_1, 2).subscribe();
      const req = httpMock.expectOne((r) =>
        r.url.includes(`/collections/${COL_ID}/atoms`) && r.method === 'POST',
      );
      expect(req.request.body).toEqual({ atom_id: ATOM_ID_1, position: 2 });
      req.flush(buildCollection());
    });

    it('maps 409 to error_atom_duplicate', () => {
      let caught = false;
      service.addAtom(COL_ID, ATOM_ID_1).subscribe({ error: () => (caught = true) });
      httpMock
        .expectOne((r) => r.url.includes(`/collections/${COL_ID}/atoms`) && r.method === 'POST')
        .flush(null, { status: 409, statusText: 'Conflict' });
      const s = service.atomOpState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_atom_duplicate');
      expect(caught).toBe(true);
    });

    it('maps 422 to error_atom_cap_exceeded', () => {
      let caught = false;
      service.addAtom(COL_ID, ATOM_ID_1).subscribe({ error: () => (caught = true) });
      httpMock
        .expectOne((r) => r.url.includes(`/collections/${COL_ID}/atoms`) && r.method === 'POST')
        .flush(null, { status: 422, statusText: 'Unprocessable Entity' });
      const s = service.atomOpState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_atom_cap_exceeded');
      expect(caught).toBe(true);
    });
  });

  // ── removeAtom ──────────────────────────────────────────────────────────────

  describe('removeAtom()', () => {
    it('issues DELETE /api/v1/collections/{id}/atoms/{atomId}', () => {
      service.removeAtom(COL_ID, ATOM_ID_1).subscribe();
      const req = httpMock.expectOne((r) =>
        r.url.includes(`/collections/${COL_ID}/atoms/${ATOM_ID_1}`) && r.method === 'DELETE',
      );
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('optimistically removes atom from detail state', () => {
      // Seed detail state with a collection containing two atoms
      service.loadDetail(COL_ID);
      httpMock
        .expectOne((r) => r.url.includes(`/collections/${COL_ID}`) && r.method === 'GET')
        .flush(
          buildCollection({
            atoms: [
              { collection_id: COL_ID, atom_id: ATOM_ID_1, position: 0, added_at: '2026-05-26T10:00:00Z' },
              { collection_id: COL_ID, atom_id: ATOM_ID_2, position: 1, added_at: '2026-05-26T10:01:00Z' },
            ],
          }),
        );
      expect(service.detailCollection()?.atoms?.length).toBe(2);

      service.removeAtom(COL_ID, ATOM_ID_1).subscribe();
      httpMock
        .expectOne((r) => r.url.includes(`/collections/${COL_ID}/atoms/${ATOM_ID_1}`) && r.method === 'DELETE')
        .flush(null, { status: 204, statusText: 'No Content' });

      const atoms = service.detailCollection()?.atoms;
      expect(atoms?.length).toBe(1);
      expect(atoms?.[0].atom_id).toBe(ATOM_ID_2);
    });

    it('maps 404 to error_atom_not_found', () => {
      let caught = false;
      service.removeAtom(COL_ID, ATOM_ID_1).subscribe({ error: () => (caught = true) });
      httpMock
        .expectOne((r) => r.url.includes(`/collections/${COL_ID}/atoms/${ATOM_ID_1}`))
        .flush(null, { status: 404, statusText: 'Not Found' });
      const s = service.atomOpState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_atom_not_found');
      expect(caught).toBe(true);
    });
  });

  // ── resetEditState ──────────────────────────────────────────────────────────

  describe('resetEditState()', () => {
    it('resets editState to idle', () => {
      service.create({ title: 'Test' }).subscribe();
      httpMock.expectOne((r) => r.method === 'POST').flush(buildCollection());
      expect(service.editState().status).toBe('success');
      service.resetEditState();
      expect(service.editState().status).toBe('idle');
    });

    it('editState starts idle before any operation', () => {
      expect(service.editState().status).toBe('idle');
    });
  });

  // ── loadList — additional branches ────────────────────────────────────────────

  describe('loadList() — extra error branches', () => {
    it('maps 403 to error_unauthorised', () => {
      service.loadList();
      httpMock
        .expectOne((r) => r.url.includes('/me/collections'))
        .flush(null, { status: 403, statusText: 'Forbidden' });
      const s = service.listState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_unauthorised');
    });

    it('maps 500 exactly to error_upstream', () => {
      service.loadList();
      httpMock
        .expectOne((r) => r.url.includes('/me/collections'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      const s = service.listState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_upstream');
    });

    it('maps a non-HTTP error (no numeric status) to error_gateway_not_wired', () => {
      // Force the rxjs pipe to throw a plain Error object (status property absent),
      // exercising the httpStatus()→null branch.
      const bff = (service as unknown as { bff: { get: (...a: unknown[]) => unknown } }).bff;
      const spy = vi.spyOn(bff, 'get').mockReturnValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        throwErrorOf(new Error('network down')) as any,
      );
      service.loadList();
      const s = service.listState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_gateway_not_wired');
      spy.mockRestore();
    });

    it('maps 404 (route-not-found) to error_gateway_not_wired', () => {
      service.loadList();
      httpMock
        .expectOne((r) => r.url.includes('/me/collections'))
        .flush(null, { status: 404, statusText: 'Not Found' });
      const s = service.listState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_gateway_not_wired');
    });
  });

  // ── loadDetail — additional branches ─────────────────────────────────────────

  describe('loadDetail() — extra branches', () => {
    it('detailCollection() is null while loading', () => {
      service.loadDetail(COL_ID);
      expect(service.detailCollection()).toBeNull();
      httpMock
        .expectOne((r) => r.url.includes(`/collections/${COL_ID}`))
        .flush(buildCollection({ atoms: [] }));
    });

    it('detailCollection() returns the collection on success', () => {
      service.loadDetail(COL_ID);
      httpMock
        .expectOne((r) => r.url.includes(`/collections/${COL_ID}`))
        .flush(buildCollection({ atoms: [] }));
      expect(service.detailCollection()?.collection_id).toBe(COL_ID);
    });

    it('URI-encodes the id in the path', () => {
      const weirdId = 'a b/c?d';
      service.loadDetail(weirdId);
      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/collections/'));
      expect(req.request.url).toContain(encodeURIComponent(weirdId));
      req.flush(buildCollection());
    });

    it('maps 5xx to error_upstream', () => {
      service.loadDetail(COL_ID);
      httpMock
        .expectOne((r) => r.url.includes(`/collections/${COL_ID}`))
        .flush(null, { status: 503, statusText: 'Service Unavailable' });
      const s = service.detailState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_upstream');
    });

    it('maps status 0 to error_gateway_not_wired', () => {
      service.loadDetail(COL_ID);
      httpMock
        .expectOne((r) => r.url.includes(`/collections/${COL_ID}`))
        .flush(null, { status: 0, statusText: 'Unknown Error' });
      const s = service.detailState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_gateway_not_wired');
    });
  });

  // ── create — additional branches ─────────────────────────────────────────────

  describe('create() — extra error branches', () => {
    it('maps 409 to error_conflict', () => {
      let caught = false;
      service.create({ title: 'Dup' }).subscribe({ error: () => (caught = true) });
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url.includes('/collections'))
        .flush(null, { status: 409, statusText: 'Conflict' });
      const s = service.editState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_conflict');
      expect(caught).toBe(true);
    });

    it('maps 401 to error_unauthorised', () => {
      let caught = false;
      service.create({ title: 'X' }).subscribe({ error: () => (caught = true) });
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url.includes('/collections'))
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      const s = service.editState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_unauthorised');
      expect(caught).toBe(true);
    });

    it('maps 5xx to error_upstream', () => {
      let caught = false;
      service.create({ title: 'X' }).subscribe({ error: () => (caught = true) });
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url.includes('/collections'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      const s = service.editState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_upstream');
      expect(caught).toBe(true);
    });

    it('maps an unmapped status (418) to error_gateway_not_wired', () => {
      let caught = false;
      service.create({ title: 'X' }).subscribe({ error: () => (caught = true) });
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url.includes('/collections'))
        .flush(null, { status: 418, statusText: "I'm a teapot" });
      const s = service.editState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_gateway_not_wired');
      expect(caught).toBe(true);
    });
  });

  // ── update — additional branches ─────────────────────────────────────────────

  describe('update() — extra error branches', () => {
    it('maps 409 to error_conflict and sets editState error', () => {
      let caught = false;
      service.update(COL_ID, { title: 'Dup' }).subscribe({ error: () => (caught = true) });
      httpMock
        .expectOne((r) => r.method === 'PATCH' && r.url.includes(`/collections/${COL_ID}`))
        .flush(null, { status: 409, statusText: 'Conflict' });
      const s = service.editState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_conflict');
      expect(caught).toBe(true);
    });

    it('maps 400 to error_bad_request', () => {
      let caught = false;
      service.update(COL_ID, { title: '' }).subscribe({ error: () => (caught = true) });
      httpMock
        .expectOne((r) => r.method === 'PATCH' && r.url.includes(`/collections/${COL_ID}`))
        .flush(null, { status: 400, statusText: 'Bad Request' });
      const s = service.editState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_bad_request');
      expect(caught).toBe(true);
    });

    it('re-throws so callers can react to the error', () => {
      let errored: unknown = null;
      service.update(COL_ID, { title: 'X' }).subscribe({ error: (e) => (errored = e) });
      httpMock
        .expectOne((r) => r.method === 'PATCH' && r.url.includes(`/collections/${COL_ID}`))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      expect(errored).not.toBeNull();
    });
  });

  // ── delete — additional branches ─────────────────────────────────────────────

  describe('delete() — error path', () => {
    it('sets detailState error and re-throws on 403', () => {
      let errored: unknown = null;
      service.delete(COL_ID).subscribe({ error: (e) => (errored = e) });
      httpMock
        .expectOne((r) => r.method === 'DELETE' && r.url.includes(`/collections/${COL_ID}`))
        .flush(null, { status: 403, statusText: 'Forbidden' });
      const s = service.detailState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_unauthorised');
      expect(errored).not.toBeNull();
    });

    it('maps 404 to error_not_found on detailState', () => {
      let caught = false;
      service.delete(COL_ID).subscribe({ error: () => (caught = true) });
      httpMock
        .expectOne((r) => r.method === 'DELETE' && r.url.includes(`/collections/${COL_ID}`))
        .flush(null, { status: 404, statusText: 'Not Found' });
      const s = service.detailState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_not_found');
      expect(caught).toBe(true);
    });
  });

  // ── addAtom — additional branches ────────────────────────────────────────────

  describe('addAtom() — state transitions and extra branches', () => {
    it('sets atomOpState to pending with atomId while in flight', () => {
      service.addAtom(COL_ID, ATOM_ID_1).subscribe();
      const s = service.atomOpState();
      expect(s.status).toBe('pending');
      if (s.status === 'pending') expect(s.atomId).toBe(ATOM_ID_1);
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url.includes(`/collections/${COL_ID}/atoms`))
        .flush(buildCollection());
    });

    it('on success resets atomOpState to idle and refreshes detailState', () => {
      let result: Collection | undefined;
      service.addAtom(COL_ID, ATOM_ID_1).subscribe((c) => (result = c));
      const updated = buildCollection({
        atoms: [{ collection_id: COL_ID, atom_id: ATOM_ID_1, position: 0, added_at: '2026-05-26T10:00:00Z' }],
      });
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url.includes(`/collections/${COL_ID}/atoms`))
        .flush(updated);
      expect(service.atomOpState().status).toBe('idle');
      const d = service.detailState();
      expect(d.status).toBe('success');
      if (d.status === 'success') expect(d.collection.atoms?.length).toBe(1);
      expect(result?.atoms?.length).toBe(1);
    });

    it('does not send a position key when position is undefined', () => {
      service.addAtom(COL_ID, ATOM_ID_1).subscribe();
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.includes(`/collections/${COL_ID}/atoms`),
      );
      expect(Object.prototype.hasOwnProperty.call(req.request.body, 'position')).toBe(false);
      req.flush(buildCollection());
    });

    it('sends position 0 when explicitly supplied', () => {
      service.addAtom(COL_ID, ATOM_ID_1, 0).subscribe();
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.includes(`/collections/${COL_ID}/atoms`),
      );
      expect(req.request.body).toEqual({ atom_id: ATOM_ID_1, position: 0 });
      req.flush(buildCollection());
    });

    it('maps 404 to error_atom_not_found and keeps atomId in error state', () => {
      let caught = false;
      service.addAtom(COL_ID, ATOM_ID_1).subscribe({ error: () => (caught = true) });
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url.includes(`/collections/${COL_ID}/atoms`))
        .flush(null, { status: 404, statusText: 'Not Found' });
      const s = service.atomOpState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.collections.error_atom_not_found');
        expect(s.atomId).toBe(ATOM_ID_1);
      }
      expect(caught).toBe(true);
    });

    it('maps 403 to error_unauthorised', () => {
      let caught = false;
      service.addAtom(COL_ID, ATOM_ID_1).subscribe({ error: () => (caught = true) });
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url.includes(`/collections/${COL_ID}/atoms`))
        .flush(null, { status: 403, statusText: 'Forbidden' });
      const s = service.atomOpState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_unauthorised');
      expect(caught).toBe(true);
    });

    it('maps 5xx to error_upstream', () => {
      let caught = false;
      service.addAtom(COL_ID, ATOM_ID_1).subscribe({ error: () => (caught = true) });
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url.includes(`/collections/${COL_ID}/atoms`))
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const s = service.atomOpState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_upstream');
      expect(caught).toBe(true);
    });

    it('maps an unmapped status to error_gateway_not_wired', () => {
      let caught = false;
      service.addAtom(COL_ID, ATOM_ID_1).subscribe({ error: () => (caught = true) });
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url.includes(`/collections/${COL_ID}/atoms`))
        .flush(null, { status: 400, statusText: 'Bad Request' });
      const s = service.atomOpState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_gateway_not_wired');
      expect(caught).toBe(true);
    });
  });

  // ── removeAtom — additional branches ─────────────────────────────────────────

  describe('removeAtom() — state transitions and extra branches', () => {
    it('sets atomOpState to pending with atomId while in flight', () => {
      service.removeAtom(COL_ID, ATOM_ID_1).subscribe();
      const s = service.atomOpState();
      expect(s.status).toBe('pending');
      if (s.status === 'pending') expect(s.atomId).toBe(ATOM_ID_1);
      httpMock
        .expectOne((r) => r.method === 'DELETE' && r.url.includes(`/collections/${COL_ID}/atoms/${ATOM_ID_1}`))
        .flush(null, { status: 204, statusText: 'No Content' });
    });

    it('on success resets atomOpState to idle', () => {
      service.removeAtom(COL_ID, ATOM_ID_1).subscribe();
      httpMock
        .expectOne((r) => r.method === 'DELETE' && r.url.includes(`/collections/${COL_ID}/atoms/${ATOM_ID_1}`))
        .flush(null, { status: 204, statusText: 'No Content' });
      expect(service.atomOpState().status).toBe('idle');
    });

    it('does not mutate detailState when it is not in success status', () => {
      // detailState is in its initial 'loading' status (never seeded with success).
      expect(service.detailState().status).toBe('loading');
      service.removeAtom(COL_ID, ATOM_ID_1).subscribe();
      httpMock
        .expectOne((r) => r.method === 'DELETE' && r.url.includes(`/collections/${COL_ID}/atoms/${ATOM_ID_1}`))
        .flush(null, { status: 204, statusText: 'No Content' });
      // Still loading — no optimistic mutation attempted on a non-success state.
      expect(service.detailState().status).toBe('loading');
    });

    it('leaves detailState untouched when collection has no atoms array', () => {
      service.loadDetail(COL_ID);
      // Detail success but no atoms property present.
      httpMock
        .expectOne((r) => r.url.includes(`/collections/${COL_ID}`) && r.method === 'GET')
        .flush(buildCollection());
      expect(service.detailState().status).toBe('success');

      service.removeAtom(COL_ID, ATOM_ID_1).subscribe();
      httpMock
        .expectOne((r) => r.method === 'DELETE' && r.url.includes(`/collections/${COL_ID}/atoms/${ATOM_ID_1}`))
        .flush(null, { status: 204, statusText: 'No Content' });
      // collection had no atoms → branch skipped, still success without atoms.
      const d = service.detailState();
      expect(d.status).toBe('success');
      if (d.status === 'success') expect(d.collection.atoms).toBeUndefined();
    });

    it('maps 409 to error_atom_duplicate', () => {
      let caught = false;
      service.removeAtom(COL_ID, ATOM_ID_1).subscribe({ error: () => (caught = true) });
      httpMock
        .expectOne((r) => r.url.includes(`/collections/${COL_ID}/atoms/${ATOM_ID_1}`))
        .flush(null, { status: 409, statusText: 'Conflict' });
      const s = service.atomOpState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_atom_duplicate');
      expect(caught).toBe(true);
    });

    it('maps 5xx to error_upstream', () => {
      let caught = false;
      service.removeAtom(COL_ID, ATOM_ID_1).subscribe({ error: () => (caught = true) });
      httpMock
        .expectOne((r) => r.url.includes(`/collections/${COL_ID}/atoms/${ATOM_ID_1}`))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      const s = service.atomOpState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_upstream');
      expect(caught).toBe(true);
    });

    it('URI-encodes both collectionId and atomId in the path', () => {
      const cId = 'c i/d';
      const aId = 'a t/m';
      service.removeAtom(cId, aId).subscribe();
      const req = httpMock.expectOne((r) => r.method === 'DELETE' && r.url.includes('/atoms/'));
      expect(req.request.url).toContain(encodeURIComponent(cId));
      expect(req.request.url).toContain(encodeURIComponent(aId));
      req.flush(null, { status: 204, statusText: 'No Content' });
    });
  });

  // ── convertToStudyList() — WS-4 / ADR-233 D11 ──────────────────────────────
  //
  // Conversion is a PARTIAL SUCCESS: entitled atoms convert; atoms the author
  // has since restricted are dropped and NAMED in excluded[]. The Collection is
  // never mutated. Zero survivors → 409 (never an empty study list).
  describe('convertToStudyList()', () => {
    it('POSTs to /api/v1/collections/{id}/convert-to-study-list', () => {
      service.convertToStudyList(COL_ID).subscribe();
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.includes(`/collections/${COL_ID}/convert-to-study-list`),
      );
      expect(req.request.method).toBe('POST');
      req.flush(buildConvertResult(), { status: 201, statusText: 'Created' });
    });

    it('URI-encodes the collectionId in the path', () => {
      const cId = 'c i/d';
      service.convertToStudyList(cId).subscribe();
      const req = httpMock.expectOne((r) => r.url.includes('/convert-to-study-list'));
      expect(req.request.url).toContain(encodeURIComponent(cId));
      req.flush(buildConvertResult(), { status: 201, statusText: 'Created' });
    });

    it('sets convertState to submitting while in flight', () => {
      service.convertToStudyList(COL_ID).subscribe();
      expect(service.convertState().status).toBe('submitting');
      httpMock
        .expectOne((r) => r.url.includes('/convert-to-study-list'))
        .flush(buildConvertResult(), { status: 201, statusText: 'Created' });
    });

    it('on 201 sets convertState success carrying atom_count and excluded[]', () => {
      const result = buildConvertResult({
        atom_count: 18,
        excluded: [{ atom_id: ATOM_ID_1, reason: 'REUSE_VISIBILITY_NARROWED' }],
      });
      let emitted: ConvertToStudyListResponse | null = null;
      service.convertToStudyList(COL_ID).subscribe((r) => (emitted = r));
      httpMock
        .expectOne((r) => r.url.includes('/convert-to-study-list'))
        .flush(result, { status: 201, statusText: 'Created' });

      const s = service.convertState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.result.atom_count).toBe(18);
        expect(s.result.excluded).toHaveLength(1);
        expect(s.result.excluded[0].reason).toBe('REUSE_VISIBILITY_NARROWED');
      }
      expect(emitted).not.toBeNull();
    });

    it('preserves an empty excluded[] as a clean full conversion', () => {
      service.convertToStudyList(COL_ID).subscribe();
      httpMock
        .expectOne((r) => r.url.includes('/convert-to-study-list'))
        .flush(buildConvertResult({ atom_count: 5, excluded: [] }), {
          status: 201,
          statusText: 'Created',
        });
      const s = service.convertState();
      expect(s.status).toBe('success');
      if (s.status === 'success') expect(s.result.excluded).toEqual([]);
    });

    // D11: zero survivors must NEVER be rendered as an empty study list.
    it('maps 409 to convert_error_no_entitled_atoms', () => {
      let caught = false;
      service.convertToStudyList(COL_ID).subscribe({ error: () => (caught = true) });
      httpMock
        .expectOne((r) => r.url.includes('/convert-to-study-list'))
        .flush(
          { error: { code: 'CREATION_COLLECTION_NO_ENTITLED_ATOMS', message: 'none entitled' } },
          { status: 409, statusText: 'Conflict' },
        );
      const s = service.convertState();
      expect(s.status).toBe('error');
      if (s.status === 'error')
        expect(s.error).toBe('aplus.collections.convert_error_no_entitled_atoms');
      expect(caught).toBe(true);
    });

    it('maps 403 to convert_error_forbidden', () => {
      let caught = false;
      service.convertToStudyList(COL_ID).subscribe({ error: () => (caught = true) });
      httpMock
        .expectOne((r) => r.url.includes('/convert-to-study-list'))
        .flush(
          { error: { code: 'CREATION_COLLECTION_FORBIDDEN', message: 'not owner' } },
          { status: 403, statusText: 'Forbidden' },
        );
      const s = service.convertState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.convert_error_forbidden');
      expect(caught).toBe(true);
    });

    it('maps 404 to error_not_found', () => {
      service.convertToStudyList(COL_ID).subscribe({ error: () => undefined });
      httpMock
        .expectOne((r) => r.url.includes('/convert-to-study-list'))
        .flush(null, { status: 404, statusText: 'Not Found' });
      const s = service.convertState();
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_not_found');
    });

    it('maps 5xx to error_upstream', () => {
      service.convertToStudyList(COL_ID).subscribe({ error: () => undefined });
      httpMock
        .expectOne((r) => r.url.includes('/convert-to-study-list'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      const s = service.convertState();
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_upstream');
    });

    it('maps an unmapped status to error_gateway_not_wired', () => {
      service.convertToStudyList(COL_ID).subscribe({ error: () => undefined });
      httpMock
        .expectOne((r) => r.url.includes('/convert-to-study-list'))
        .flush(null, { status: 418, statusText: "I'm a teapot" });
      const s = service.convertState();
      if (s.status === 'error') expect(s.error).toBe('aplus.collections.error_gateway_not_wired');
    });

    // ⚠ The runtime errorInterceptor re-throws EVERY HTTP failure as an ApiError,
    // whose body lives on `.body` — NOT `.error`. A spec that only flushes via
    // HttpTestingController exercises the HttpErrorResponse shape and would pass
    // green while production mis-classifies. Assert the ApiError shape too.
    // (memory: reusable_fe_error_detail_apierror_body_not_error)
    it('classifies an ApiError (runtime interceptor shape) — 409, body on .body', () => {
      const apiErr = new ApiError(
        409,
        {
          code: 'CREATION_COLLECTION_NO_ENTITLED_ATOMS',
          message: 'none entitled',
          correlation_id: 'c-1',
        },
        { error: { code: 'CREATION_COLLECTION_NO_ENTITLED_ATOMS', message: 'none entitled' } },
      );
      const svc = TestBed.inject(CollectionsService);
      // Drive the classifier through the real catchError path.
      svc['_convertState'].set({ status: 'idle' });
      const key = svc['convertErrorKey'](apiErr);
      expect(key).toBe('aplus.collections.convert_error_no_entitled_atoms');
    });

    it('classifies an ApiError (runtime interceptor shape) — 403 forbidden', () => {
      const apiErr = new ApiError(
        403,
        { code: 'CREATION_COLLECTION_FORBIDDEN', message: 'not owner', correlation_id: 'c-2' },
        { error: { code: 'CREATION_COLLECTION_FORBIDDEN', message: 'not owner' } },
      );
      const svc = TestBed.inject(CollectionsService);
      expect(svc['convertErrorKey'](apiErr)).toBe('aplus.collections.convert_error_forbidden');
    });

    // =========================================================================
    // CHO-2174 — chora-sharing's verdicts must reach the learner as SENTENCES.
    //
    // chora-creation now translates the consent gate's gRPC refusals into real
    // statuses + actionable codes (409 CREATION_ATOM_NOT_SHAREABLE, 403
    // CREATION_ATOM_REUSE_DENIED, 502 CREATION_SHARING_UNAVAILABLE / _GATE_ERROR)
    // instead of a 400 CREATION_COLLECTION_INVALID with an `rpc error:` chain.
    //
    // ⚠ The CODE must be tested BEFORE the status, because status alone now LIES:
    //   409 → "none of your atoms are available"  (wrong: one atom isn't shareable)
    //   403 → "only the owner can convert"        (wrong: the caller IS the owner)
    // =========================================================================

    // NB the FLAT `{code,message}` envelope — this is what chora-creation's
    // writeError actually emits. (The older specs above flush a NESTED
    // `{error:{code}}` body; both shapes must classify.)
    it('maps 409 CREATION_ATOM_NOT_SHAREABLE to convert_error_atom_not_shareable', () => {
      let caught = false;
      service.convertToStudyList(COL_ID).subscribe({ error: () => (caught = true) });
      httpMock.expectOne((r) => r.url.includes('/convert-to-study-list')).flush(
        {
          code: 'CREATION_ATOM_NOT_SHAREABLE',
          message: 'an atom in this collection is not available for reuse',
        },
        { status: 409, statusText: 'Conflict' },
      );
      const s = service.convertState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        // NOT convert_error_no_entitled_atoms — that would tell the learner none
        // of their atoms are available, when in fact one atom is unshareable.
        expect(s.error).toBe('aplus.collections.convert_error_atom_not_shareable');
      }
      expect(caught).toBe(true);
    });

    it('classifies an ApiError — 409 CREATION_ATOM_NOT_SHAREABLE (production shape)', () => {
      const apiErr = new ApiError(
        409,
        {
          code: 'CREATION_ATOM_NOT_SHAREABLE',
          message: 'an atom in this collection is not available for reuse',
          correlation_id: 'c-3',
        },
        { code: 'CREATION_ATOM_NOT_SHAREABLE', message: 'not shareable' },
      );
      const svc = TestBed.inject(CollectionsService);
      expect(svc['convertErrorKey'](apiErr)).toBe(
        'aplus.collections.convert_error_atom_not_shareable',
      );
    });

    it('maps 403 CREATION_ATOM_REUSE_DENIED to convert_error_reuse_denied', () => {
      service.convertToStudyList(COL_ID).subscribe({ error: () => undefined });
      httpMock.expectOne((r) => r.url.includes('/convert-to-study-list')).flush(
        {
          code: 'CREATION_ATOM_REUSE_DENIED',
          message: 'the author has not given you permission to reuse it',
        },
        { status: 403, statusText: 'Forbidden' },
      );
      const s = service.convertState();
      if (s.status === 'error') {
        // NOT convert_error_forbidden — the caller IS the owner of the
        // collection; it is the ATOM's author who refused.
        expect(s.error).toBe('aplus.collections.convert_error_reuse_denied');
      }
    });

    // A sharing outage REFUSED the conversion — nothing was converted. The
    // learner is owed that fact, not a shrug.
    it('maps 502 CREATION_SHARING_UNAVAILABLE to convert_error_sharing_unavailable', () => {
      service.convertToStudyList(COL_ID).subscribe({ error: () => undefined });
      httpMock.expectOne((r) => r.url.includes('/convert-to-study-list')).flush(
        {
          code: 'CREATION_SHARING_UNAVAILABLE',
          message: 'we could not check sharing permissions just now',
        },
        { status: 502, statusText: 'Bad Gateway' },
      );
      const s = service.convertState();
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.collections.convert_error_sharing_unavailable');
      }
    });

    it('maps 502 CREATION_SHARING_GATE_ERROR to convert_error_sharing_unavailable', () => {
      service.convertToStudyList(COL_ID).subscribe({ error: () => undefined });
      httpMock
        .expectOne((r) => r.url.includes('/convert-to-study-list'))
        .flush(
          { code: 'CREATION_SHARING_GATE_ERROR', message: 'gate error' },
          { status: 502, statusText: 'Bad Gateway' },
        );
      const s = service.convertState();
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.collections.convert_error_sharing_unavailable');
      }
    });

    // The unknown-code fallback survives: an unrecognised code falls back to the
    // status arms (a 409 we do not recognise is still "nothing to convert"), and
    // an unrecognised status still lands on error_gateway_not_wired.
    it('keeps the status fallback for an unknown code', () => {
      service.convertToStudyList(COL_ID).subscribe({ error: () => undefined });
      httpMock
        .expectOne((r) => r.url.includes('/convert-to-study-list'))
        .flush(
          { code: 'CREATION_SOMETHING_NEW', message: 'unknown' },
          { status: 409, statusText: 'Conflict' },
        );
      const s = service.convertState();
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.collections.convert_error_no_entitled_atoms');
      }
    });

    it('resetConvertState() returns convertState to idle', () => {
      service.convertToStudyList(COL_ID).subscribe();
      httpMock
        .expectOne((r) => r.url.includes('/convert-to-study-list'))
        .flush(buildConvertResult(), { status: 201, statusText: 'Created' });
      expect(service.convertState().status).toBe('success');
      service.resetConvertState();
      expect(service.convertState().status).toBe('idle');
    });
  });
});
