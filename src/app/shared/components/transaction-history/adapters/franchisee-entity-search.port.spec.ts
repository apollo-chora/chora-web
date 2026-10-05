/**
 * FranchiseeEntitySearchPort unit spec (CHO-1930 / ADR-205). Exercises the real
 * BffClientService HTTP leg via HttpTestingController against the absolute
 * environment.bffBaseUrl URL (house convention). Confirms the port hits the new
 * master-only franchisee-list route, forwards q + the forward cursor, maps
 * `{tenant_id,name}` → EntityRef, and fails loud on an HTTP error.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../../../environments/environment';
import { FranchiseeEntitySearchPort } from './franchisee-entity-search.port';
import type { EntityRef, EntitySearchPage } from '../../chora-entity-picker/entity-picker.model';

const BASE = environment.bffBaseUrl;
const FRANCHISEES_URL = `${BASE}/api/v1/admin/transactions/franchisees`;

describe('FranchiseeEntitySearchPort', () => {
  let port: FranchiseeEntitySearchPort;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    port = TestBed.inject(FranchiseeEntitySearchPort);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('declares the franchisee entityType', () => {
    expect(port.entityType).toBe('franchisee');
  });

  it('searches franchisees with q and maps {tenant_id,name} → EntityRef', () => {
    let page: EntitySearchPage | undefined;
    port.search('acme', {}, null).subscribe((p) => (page = p));

    const req = httpMock.expectOne(
      (r) => r.method === 'GET' && r.url === FRANCHISEES_URL,
    );
    expect(req.request.params.get('q')).toBe('acme');
    expect(req.request.params.has('page_token')).toBe(false);

    req.flush({
      franchisees: [
        { tenant_id: 'ten-1', name: 'Acme Learning' },
        { tenant_id: 'ten-2', name: null },
      ],
      next_page_token: 'cur-2',
    });

    expect(page?.items).toEqual<EntityRef[]>([
      { id: 'ten-1', label: 'Acme Learning' },
      { id: 'ten-2', label: 'ten-2' },
    ]);
    expect(page?.nextCursor).toBe('cur-2');
  });

  it('forwards the forward cursor as page_token', () => {
    port.search('beta', {}, 'cur-1').subscribe();
    const req = httpMock.expectOne(
      (r) => r.method === 'GET' && r.url === FRANCHISEES_URL,
    );
    expect(req.request.params.get('page_token')).toBe('cur-1');
    req.flush({ franchisees: [] });
  });

  it('maps a missing next_page_token to a null cursor', () => {
    let page: EntitySearchPage | undefined;
    port.search('gamma', {}, null).subscribe((p) => (page = p));
    httpMock
      .expectOne((r) => r.url === FRANCHISEES_URL)
      .flush({ franchisees: [{ tenant_id: 't3', name: 'Gamma' }] });
    expect(page?.nextCursor).toBeNull();
  });

  it('propagates a search error (fail-loud, never a silent empty page)', () => {
    let errored = false;
    port.search('err', {}, null).subscribe({ error: () => (errored = true) });
    httpMock
      .expectOne((r) => r.url === FRANCHISEES_URL)
      .flush('boom', { status: 500, statusText: 'Server Error' });
    expect(errored).toBe(true);
  });

  it('resolve returns id-as-label best-effort (no batch endpoint, no fabricated names)', () => {
    let rows: readonly EntityRef[] | undefined;
    port.resolve(['t1', 't2']).subscribe((r) => (rows = r));
    expect(rows).toEqual<EntityRef[]>([
      { id: 't1', label: 't1' },
      { id: 't2', label: 't2' },
    ]);
  });
});
