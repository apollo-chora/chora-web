import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { TenantOverviewService } from './tenant-overview.service';
import type { TenantOverview } from './tenant-overview.model';

/**
 * TenantOverviewService spec — H+ tenant-overview page (Phyllis demo Step 2).
 *
 * Wired LIVE 2026-05-15 to GET /api/tenants/{id}. The wave-1 hardcoded
 * `tenant` object has been deleted — these tests flush the REAL wire shape
 * through HttpTestingController and assert the fail-loud discriminated state.
 * Per chora-web CLAUDE.md §6 — `httpMock.verify()` in afterEach.
 */

const TENANT_ID = '11111111-1111-7111-8111-111111111111';

function buildTenantOverview(overrides: Partial<TenantOverview> = {}): TenantOverview {
  return {
    id: TENANT_ID,
    display_name: 'Mighty Mind Tuition Agency',
    status: 'active',
    self_hosted: false,
    parent_tenant_id: '',
    branding_config: {
      primary_color: '#5B7FFF',
      tagline: 'Mighty minds in motion',
    },
    created_at: '2026-05-10T21:12:17.049353Z',
    updated_at: '2026-05-10T21:12:17.049353Z',
    ...overrides,
  };
}

function setup(): {
  service: TenantOverviewService;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const service = TestBed.inject(TenantOverviewService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

describe('TenantOverviewService (Phyllis Step 2 — real BFF wiring)', () => {
  let service: TenantOverviewService;
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

  describe('load()', () => {
    it('issues GET /api/tenants/{id} (URI-encoded) on load()', () => {
      service.load(TENANT_ID);
      const req = httpMock.expectOne((r) => r.url.includes('/api/tenants/'));
      expect(req.request.method).toBe('GET');
      expect(req.request.url).toContain(`/api/tenants/${encodeURIComponent(TENANT_ID)}`);
      req.flush(buildTenantOverview());
    });

    it('URI-encodes a tenant id with unsafe characters', () => {
      service.load('a b/c');
      const req = httpMock.expectOne((r) => r.url.includes('/api/tenants/'));
      expect(req.request.url).toContain('/api/tenants/a%20b%2Fc');
      req.flush(buildTenantOverview());
    });

    it('starts in the loading state before any flush', () => {
      expect(service.state().status).toBe('loading');
      service.load(TENANT_ID);
      expect(service.state().status).toBe('loading');
      httpMock
        .expectOne((r) => r.url.includes('/api/tenants/'))
        .flush(buildTenantOverview());
    });

    it('transitions to success with the real wire shape', () => {
      const tenant = buildTenantOverview({
        display_name: 'Chen Coaching',
        branding_config: {
          primary_color: '#FF7A7A',
          tagline: 'Coaching for life',
        },
      });
      service.load(TENANT_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/tenants/'))
        .flush(tenant);

      const state = service.state();
      expect(state.status).toBe('success');
      if (state.status === 'success') {
        expect(state.tenant.display_name).toBe('Chen Coaching');
        expect(state.tenant.branding_config.primary_color).toBe('#FF7A7A');
        expect(state.tenant.status).toBe('active');
      }
      expect(service.tenant()?.id).toBe(TENANT_ID);
    });

    it('exposes a null tenant() selector while loading / on error', () => {
      expect(service.tenant()).toBeNull();
      service.load(TENANT_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/tenants/'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      expect(service.tenant()).toBeNull();
    });

    it('maps a 404 to error_not_found', () => {
      service.load(TENANT_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/tenants/'))
        .flush(null, { status: 404, statusText: 'Not Found' });

      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('hplus.tenant.error_not_found');
      }
    });

    it('maps a 5xx to error_upstream', () => {
      service.load(TENANT_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/tenants/'))
        .flush(null, { status: 502, statusText: 'Bad Gateway' });

      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('hplus.tenant.error_upstream');
      }
    });

    it('maps a 401 to error_unauthorised', () => {
      service.load(TENANT_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/tenants/'))
        .flush(null, { status: 401, statusText: 'Unauthorized' });

      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('hplus.tenant.error_unauthorised');
      }
    });

    it('maps a 403 to error_unauthorised', () => {
      service.load(TENANT_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/tenants/'))
        .flush(null, { status: 403, statusText: 'Forbidden' });

      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('hplus.tenant.error_unauthorised');
      }
    });

    it('maps a network error (status 0) to error_generic', () => {
      service.load(TENANT_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/tenants/'))
        .error(new ProgressEvent('error'));

      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('hplus.tenant.error_generic');
      }
    });

    it('load() is idempotent — callable twice, recovers on the second flush', () => {
      service.load(TENANT_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/tenants/'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      expect(service.state().status).toBe('error');

      service.load(TENANT_ID);
      expect(service.state().status).toBe('loading');
      httpMock
        .expectOne((r) => r.url.includes('/api/tenants/'))
        .flush(buildTenantOverview());
      expect(service.state().status).toBe('success');
      expect(service.tenant()?.id).toBe(TENANT_ID);
    });
  });
});
