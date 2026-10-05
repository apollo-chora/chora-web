/**
 * AtomRevisionsService spec — WS-7 BFF wrapper.
 *
 * Tests cover:
 * - GET /api/atoms/{atomId}/revisions issues correct HTTP call (URI-encoded)
 * - AsyncState transitions: loading → success / error
 * - Fail-loud: 4xx and 5xx map to specific error keys
 * - httpMock.verify() asserts no unexpected requests
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { AtomRevisionsService } from './atom-revisions.service';
import type { AtomRevision, AtomRevisionPage } from './models';

const ATOM_ID = '00000000-0000-7000-8000-00000000a0a1';
const REV_PATH = `/api/atoms/${encodeURIComponent(ATOM_ID)}/revisions`;

function buildRevision(overrides: Partial<AtomRevision> = {}): AtomRevision {
  return {
    revision_id: '019e0001-0000-7000-8000-000000000001',
    atom_id: ATOM_ID,
    revision_number: 1,
    content_hash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
    validation_rule_type: 'STANDARD',
    published_by_gcid: '00000000-0000-7000-8000-000000001999',
    published_at: '2026-05-26T10:00:00.000Z',
    summary: 'Initial revision',
    ...overrides,
  };
}

function buildPage(overrides: Partial<AtomRevisionPage> = {}): AtomRevisionPage {
  return {
    revisions: [buildRevision()],
    ...overrides,
  };
}

function setup(): { service: AtomRevisionsService; httpMock: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(AtomRevisionsService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('AtomRevisionsService (WS-7 BFF wrapper)', () => {
  let service: AtomRevisionsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ service, httpMock } = setup());
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('load()', () => {
    it('issues GET /api/atoms/{atomId}/revisions (URI-encoded)', () => {
      service.load(ATOM_ID);
      const req = httpMock.expectOne((r) => r.url.includes('/revisions'));
      expect(req.request.method).toBe('GET');
      expect(req.request.url).toContain(REV_PATH);
      req.flush(buildPage());
    });

    it('starts in loading state before flush', () => {
      expect(service.state().status).toBe('loading');
      service.load(ATOM_ID);
      expect(service.state().status).toBe('loading');
      httpMock.expectOne((r) => r.url.includes('/revisions')).flush(buildPage());
    });

    it('transitions to success with the page DTO', () => {
      service.load(ATOM_ID);
      const page = buildPage({
        revisions: [buildRevision({ revision_number: 2 }), buildRevision({ revision_number: 1 })],
      });
      httpMock.expectOne((r) => r.url.includes('/revisions')).flush(page);

      const s = service.state();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.page.revisions.length).toBe(2);
        expect(s.page.revisions[0].revision_number).toBe(2);
      }
    });

    it('revisions() computed returns the array on success', () => {
      service.load(ATOM_ID);
      httpMock.expectOne((r) => r.url.includes('/revisions')).flush(buildPage());
      expect(service.revisions().length).toBe(1);
      expect(service.revisions()[0].atom_id).toBe(ATOM_ID);
    });

    it('page() computed returns null on loading', () => {
      expect(service.page()).toBeNull();
    });

    it('maps 404 to error_not_found', () => {
      service.load(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.includes('/revisions'))
        .flush(null, { status: 404, statusText: 'Not Found' });
      const s = service.state();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.atom_revisions.error_not_found');
      }
    });

    it('maps 401 to error_unauthorised', () => {
      service.load(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.includes('/revisions'))
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      const s = service.state();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.atom_revisions.error_unauthorised');
      }
    });

    it('maps 403 to error_unauthorised', () => {
      service.load(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.includes('/revisions'))
        .flush(null, { status: 403, statusText: 'Forbidden' });
      const s = service.state();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.atom_revisions.error_unauthorised');
      }
    });

    it('maps 5xx to error_upstream', () => {
      service.load(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.includes('/revisions'))
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const s = service.state();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.atom_revisions.error_upstream');
      }
    });

    it('maps no-route 0-status (GATEWAY_ROUTE_NOT_FOUND) to error_generic', () => {
      service.load(ATOM_ID);
      // Simulate network error (status 0 = no response / CORS / unreachable)
      httpMock
        .expectOne((r) => r.url.includes('/revisions'))
        .flush(null, { status: 0, statusText: 'Unknown Error' });
      const s = service.state();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.atom_revisions.error_generic');
      }
    });

    it('load() is idempotent — re-call after error transitions back to loading', () => {
      service.load(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.includes('/revisions'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      expect(service.state().status).toBe('error');

      service.load(ATOM_ID);
      expect(service.state().status).toBe('loading');
      httpMock
        .expectOne((r) => r.url.includes('/revisions'))
        .flush(buildPage());
      expect(service.state().status).toBe('success');
    });

    it('URI-encodes atomId with special characters', () => {
      const specialId = 'atom/with:special?chars';
      service.load(specialId);
      const req = httpMock.expectOne((r) => r.url.includes('/revisions'));
      expect(req.request.url).toContain(encodeURIComponent(specialId));
      req.flush(buildPage());
    });
  });
});
