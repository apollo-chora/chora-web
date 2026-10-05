/**
 * MemberEntitySearchPort unit spec (CHO-1930 / ADR-205). Exercises the real
 * BffClientService HTTP leg via HttpTestingController against the absolute
 * environment.bffBaseUrl URL (house convention). Confirms the port hits the
 * canonical member-search route, forwards role=learner + the franchisee facet +
 * the forward cursor, maps `{gcid,display_name,email}` → EntityRef, and
 * fails loud (never a silent empty page) on an HTTP error.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../../../environments/environment';
import { MemberEntitySearchPort } from './member-entity-search.port';
import type { EntityRef, EntitySearchPage } from '../../chora-entity-picker/entity-picker.model';

const BASE = environment.bffBaseUrl;
const MEMBERS_URL = `${BASE}/api/v1/admin/tenant-members`;

describe('MemberEntitySearchPort', () => {
  let port: MemberEntitySearchPort;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    port = TestBed.inject(MemberEntitySearchPort);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('declares the member entityType', () => {
    expect(port.entityType).toBe('member');
  });

  it('searches tenant-members with q + role=learner and maps rows to EntityRef', () => {
    let page: EntitySearchPage | undefined;
    port.search('ali', {}, null).subscribe((p) => (page = p));

    const req = httpMock.expectOne(
      (r) => r.method === 'GET' && r.url === MEMBERS_URL,
    );
    expect(req.request.params.get('q')).toBe('ali');
    expect(req.request.params.get('role')).toBe('learner');
    expect(req.request.params.has('managed_tenant_id')).toBe(false);
    expect(req.request.params.has('page_token')).toBe(false);

    req.flush({
      items: [
        { gcid: 'gcid-1', display_name: 'Alice Tan', email: 'alice@x.io' },
        { gcid: 'gcid-2', display_name: null, email: null },
      ],
      next_page_token: 'cur-2',
    });

    expect(page?.items).toEqual<EntityRef[]>([
      { id: 'gcid-1', label: 'Alice Tan', sublabel: 'alice@x.io' },
      { id: 'gcid-2', label: 'gcid-2' },
    ]);
    expect(page?.nextCursor).toBe('cur-2');
  });

  it('forwards the franchisee facet and the forward cursor as page_token', () => {
    port
      .search('bob', { managed_tenant_id: 'ten-x' }, 'cur-1')
      .subscribe();

    const req = httpMock.expectOne(
      (r) => r.method === 'GET' && r.url === MEMBERS_URL,
    );
    expect(req.request.params.get('managed_tenant_id')).toBe('ten-x');
    expect(req.request.params.get('page_token')).toBe('cur-1');
    req.flush({ items: [] });
  });

  it('honors an explicit role facet override (e.g. instructor) instead of the learner default', () => {
    port.search('ada', { role: 'instructor' }, null).subscribe();

    const req = httpMock.expectOne(
      (r) => r.method === 'GET' && r.url === MEMBERS_URL,
    );
    expect(req.request.params.get('role')).toBe('instructor');
    req.flush({ items: [] });
  });

  it('propagates a search error (fail-loud, never a silent empty page)', () => {
    let errored = false;
    port.search('err', {}, null).subscribe({ error: () => (errored = true) });
    httpMock
      .expectOne((r) => r.url === MEMBERS_URL)
      .flush('boom', { status: 500, statusText: 'Server Error' });
    expect(errored).toBe(true);
  });

  it('maps a missing next_page_token to a null cursor', () => {
    let page: EntitySearchPage | undefined;
    port.search('zoe', {}, null).subscribe((p) => (page = p));
    httpMock
      .expectOne((r) => r.url === MEMBERS_URL)
      .flush({ items: [{ gcid: 'g9', display_name: 'Zoe' }] });
    expect(page?.nextCursor).toBeNull();
  });

  it('resolve returns id-as-label best-effort (no batch endpoint, no fabricated names)', () => {
    let rows: readonly EntityRef[] | undefined;
    port.resolve(['g1', 'g2']).subscribe((r) => (rows = r));
    // Resolve is a synchronous best-effort mapping — no HTTP (afterEach verify()
    // asserts no outstanding request was made).
    expect(rows).toEqual<EntityRef[]>([
      { id: 'g1', label: 'g1' },
      { id: 'g2', label: 'g2' },
    ]);
  });
});
