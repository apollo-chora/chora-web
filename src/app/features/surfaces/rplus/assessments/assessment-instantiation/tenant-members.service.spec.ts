import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { TenantMembersService } from './tenant-members.service';
import type {
  TenantMemberSearchResponse,
  TenantMemberSummary,
} from './assessment-instantiation.model';

/**
 * TenantMembersService spec — R+ Phase X.4 member picker (ADR-155 D9).
 *
 * Wired LIVE to the real BFF route `/api/v1/admin/tenant-members?q=…`
 * per `identity-admin.yaml#searchTenantMembers`. The service exposes a
 * discriminated AsyncState signal + `search()` driver. `clear()` resets
 * to idle so the dropdown can collapse without an in-flight call.
 *
 * Min-query rule: ≥3 chars per X.4 brief. Anything shorter MUST NOT
 * issue an HTTP call (debounce + min-chars guard live in the component;
 * service stays strict so consumers can't accidentally fan out 1-char
 * searches).
 *
 * Per chora-web CLAUDE.md §6 — `httpMock.verify()` in afterEach.
 */

const MEMBER_A: TenantMemberSummary = {
  gcid: '00000000-0000-7000-8000-000000002001',
  email: 'alice@mtm.test',
  display_name: 'Alice Tan',
  avatar_url: null,
  roles: ['LEARNER'],
  last_active_at: '2026-05-16T09:30:00Z',
};

const MEMBER_B: TenantMemberSummary = {
  gcid: '00000000-0000-7000-8000-000000002002',
  email: 'bob@mtm.test',
  display_name: 'Bob Lim',
  avatar_url: null,
  roles: ['LEARNER', 'INSTRUCTOR'],
  last_active_at: '2026-05-16T11:00:00Z',
};

function setup(): {
  service: TenantMembersService;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const service = TestBed.inject(TenantMembersService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

describe('TenantMembersService (R+ Phase X.4 member picker)', () => {
  let service: TenantMembersService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const r = setup();
    service = r.service;
    httpMock = r.httpMock;
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('initial state', () => {
    it('exposes a readonly searchState signal starting at idle', () => {
      expect(service.searchState().status).toBe('idle');
    });
  });

  describe('search()', () => {
    it('issues GET /api/v1/admin/tenant-members?q=al when query has ≥3 chars', () => {
      service.search('ali');
      const req = httpMock.expectOne(
        (r) =>
          r.url.includes('/api/v1/admin/tenant-members') &&
          r.params.get('q') === 'ali',
      );
      expect(req.request.method).toBe('GET');
      const body: TenantMemberSearchResponse = {
        items: [MEMBER_A],
        next_page_token: null,
        total: 1,
      };
      req.flush(body);
      const s = service.searchState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.items.length).toBe(1);
        expect(s.items[0].gcid).toBe(MEMBER_A.gcid);
      }
    });

    it('flips searchState to loading immediately before flush', () => {
      service.search('alice');
      expect(service.searchState().status).toBe('loading');
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/admin/tenant-members'))
        .flush({ items: [], next_page_token: null });
    });

    it('does NOT issue a request when query is < 3 chars', () => {
      service.search('al');
      httpMock.expectNone((r) =>
        r.url.includes('/api/v1/admin/tenant-members'),
      );
      // Sub-min-chars rolls the state back to idle (no in-flight call)
      expect(service.searchState().status).toBe('idle');
    });

    it('does NOT issue a request when query is empty', () => {
      service.search('   ');
      httpMock.expectNone((r) =>
        r.url.includes('/api/v1/admin/tenant-members'),
      );
      expect(service.searchState().status).toBe('idle');
    });

    it('maps 5xx to error_upstream', () => {
      service.search('alice');
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/admin/tenant-members'))
        .flush(null, { status: 503, statusText: 'Service Unavailable' });
      const s = service.searchState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.member_picker.error');
      }
    });

    it('maps a network error to error_generic', () => {
      service.search('alice');
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/admin/tenant-members'))
        .error(new ProgressEvent('error'));
      const s = service.searchState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.member_picker.error');
      }
    });

    it('idempotent — second call resets to loading then flushes a new payload', () => {
      service.search('alice');
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/admin/tenant-members'))
        .flush({ items: [MEMBER_A], next_page_token: null });
      expect(service.searchState().status).toBe('success');
      service.search('bob');
      expect(service.searchState().status).toBe('loading');
      httpMock
        .expectOne(
          (r) =>
            r.url.includes('/api/v1/admin/tenant-members') &&
            r.params.get('q') === 'bob',
        )
        .flush({ items: [MEMBER_B], next_page_token: null });
      const s = service.searchState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.items[0].gcid).toBe(MEMBER_B.gcid);
      }
    });
  });

  describe('clear()', () => {
    it('resets the search state back to idle', () => {
      service.search('alice');
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/admin/tenant-members'))
        .flush({ items: [MEMBER_A], next_page_token: null });
      expect(service.searchState().status).toBe('success');
      service.clear();
      expect(service.searchState().status).toBe('idle');
    });
  });
});
