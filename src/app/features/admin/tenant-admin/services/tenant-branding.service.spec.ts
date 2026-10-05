/**
 * TenantBrandingService spec — RED-phase tests for CHO-1655 Phase A FE.
 *
 * Strict TDD per chora/.claude/rules/development-execution.md: this
 * file is written BEFORE tenant-branding.service.ts exists. Compile
 * must fail with "Cannot find module './tenant-branding.service'" —
 * that's the observed RED phase. Implementation lands next and turns
 * these GREEN.
 *
 * Drives the service through HttpTestingController against the
 * canonical BFF URL + body shape. Per chora-web/CLAUDE.md §6, every
 * test calls `httpMock.verify()` in afterEach.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { TenantBrandingService } from './tenant-branding.service';
import {
  BrandingResponse,
  TENANT_BRANDING_PATH,
  TENANT_ME_PATH,
} from '../models/tenant-branding.model';
import { environment } from '../../../../../environments/environment';

const URL = `${environment.bffBaseUrl}${TENANT_BRANDING_PATH}`;
const ME_URL = `${environment.bffBaseUrl}${TENANT_ME_PATH}`;

function setup(): {
  service: TenantBrandingService;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const service = TestBed.inject(TenantBrandingService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

describe('TenantBrandingService', () => {
  let mock: HttpTestingController;

  afterEach(() => {
    mock?.verify();
  });

  it('sends PATCH to /api/v1/tenants/me/branding with the FLAT body shape', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.updateBranding({
        primary_color_hex: '#FF5500',
        logo_url: 'https://cdn.example.com/logo.png',
      }),
    );

    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({
      primary_color_hex: '#FF5500',
      logo_url: 'https://cdn.example.com/logo.png',
    });

    const flushed: BrandingResponse = {
      primary_color_hex: '#FF5500',
      logo_url: 'https://cdn.example.com/logo.png',
      custom_domain: '',
    };
    req.flush(flushed, { status: 200, statusText: 'OK' });

    const result = await promise;
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.response).toEqual(flushed);
    }
  });

  it('omits empty / undefined fields from the body (partial PATCH)', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.updateBranding({ primary_color_hex: '#123456' }),
    );

    const req = httpMock.expectOne(URL);
    expect(req.request.body).toEqual({ primary_color_hex: '#123456' });
    expect(req.request.body).not.toHaveProperty('logo_url');
    expect(req.request.body).not.toHaveProperty('custom_domain');

    req.flush(
      {
        primary_color_hex: '#123456',
        logo_url: 'https://existing.example.com/old.png',
        custom_domain: '',
      },
      { status: 200, statusText: 'OK' },
    );
    await promise;
  });

  it('classifies 400 as invalid with upstream message', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.updateBranding({ primary_color_hex: 'red' }),
    );

    const req = httpMock.expectOne(URL);
    req.flush(
      { error: { code: 'invalid_argument', message: 'primary_color_hex must be #RRGGBB' } },
      { status: 400, statusText: 'Bad Request' },
    );

    const result = await promise;
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.message).toBe('primary_color_hex must be #RRGGBB');
    }
  });

  it('classifies 400 with no upstream message as invalid with fallback text', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.updateBranding({ logo_url: 'javascript:alert(1)' }),
    );

    const req = httpMock.expectOne(URL);
    req.flush({}, { status: 400, statusText: 'Bad Request' });

    const result = await promise;
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it('classifies 401 as unauthenticated', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.updateBranding({ primary_color_hex: '#FF0000' }),
    );

    const req = httpMock.expectOne(URL);
    req.flush(
      { error: { code: 'gateway_unauthenticated' } },
      { status: 401, statusText: 'Unauthorized' },
    );

    const result = await promise;
    expect(result.kind).toBe('unauthenticated');
  });

  it('classifies 403 as unauthenticated (same semantic — re-auth required)', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.updateBranding({ primary_color_hex: '#FF0000' }),
    );

    const req = httpMock.expectOne(URL);
    req.flush({}, { status: 403, statusText: 'Forbidden' });

    const result = await promise;
    expect(result.kind).toBe('unauthenticated');
  });

  it('classifies 404 as tenant-not-found', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.updateBranding({ primary_color_hex: '#FF0000' }),
    );

    const req = httpMock.expectOne(URL);
    req.flush(
      { error: { code: 'tenant_not_found' } },
      { status: 404, statusText: 'Not Found' },
    );

    const result = await promise;
    expect(result.kind).toBe('tenant-not-found');
  });

  it('classifies 500 as server-error', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.updateBranding({ primary_color_hex: '#FF0000' }),
    );

    const req = httpMock.expectOne(URL);
    req.flush({}, { status: 500, statusText: 'Internal Server Error' });

    const result = await promise;
    expect(result.kind).toBe('server-error');
  });

  it('classifies 502 (BFF upstream) as server-error', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.updateBranding({ primary_color_hex: '#FF0000' }),
    );

    const req = httpMock.expectOne(URL);
    req.flush({}, { status: 502, statusText: 'Bad Gateway' });

    const result = await promise;
    expect(result.kind).toBe('server-error');
  });

  it('classifies status 0 (network failure) as network-error', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.updateBranding({ primary_color_hex: '#FF0000' }),
    );

    const req = httpMock.expectOne(URL);
    req.error(new ProgressEvent('Network failure'), {
      status: 0,
      statusText: '',
    });

    const result = await promise;
    expect(result.kind).toBe('network-error');
  });

  // -------------------------------------------------------------------------
  // CHO-1709 WP-5 — error-code capture. The H+ branding page renders the
  // upstream API code (`{"error":{"code":...}}` envelope shared by
  // chora-tenancy v2WriteError + chora-gateway errResp) in its error
  // banner, so the classifier must surface it alongside `kind`.
  // -------------------------------------------------------------------------

  it('captures the upstream error code on invalid results', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.updateBranding({ primary_color_hex: 'red' }),
    );

    httpMock.expectOne(URL).flush(
      { error: { code: 'invalid_argument', message: 'bad hex' } },
      { status: 400, statusText: 'Bad Request' },
    );

    const result = await promise;
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.code).toBe('invalid_argument');
    }
  });

  it('captures the upstream error code on unauthenticated results', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.updateBranding({ primary_color_hex: '#FF0000' }),
    );

    httpMock.expectOne(URL).flush(
      { error: { code: 'gateway_unauthenticated', message: 'no tenant' } },
      { status: 401, statusText: 'Unauthorized' },
    );

    const result = await promise;
    expect(result.kind).toBe('unauthenticated');
    if (result.kind === 'unauthenticated') {
      expect(result.code).toBe('gateway_unauthenticated');
    }
  });

  it('captures the gateway code on 502 server-error results', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.updateBranding({ primary_color_hex: '#FF0000' }),
    );

    httpMock.expectOne(URL).flush(
      { error: { code: 'GATEWAY_UPSTREAM_5XX', message: 'upstream returned 500' } },
      { status: 502, statusText: 'Bad Gateway' },
    );

    const result = await promise;
    expect(result.kind).toBe('server-error');
    if (result.kind === 'server-error') {
      expect(result.code).toBe('GATEWAY_UPSTREAM_5XX');
    }
  });

  it('leaves code undefined when the error body has no envelope', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.updateBranding({ primary_color_hex: '#FF0000' }),
    );

    httpMock
      .expectOne(URL)
      .flush({}, { status: 500, statusText: 'Internal Server Error' });

    const result = await promise;
    expect(result.kind).toBe('server-error');
    if (result.kind === 'server-error') {
      expect(result.code).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// CHO-1709 WP-5 — hydrate GET. The H+ branding page (and any future
// branding consumer) hydrates its form from GET /api/v1/tenants/me
// (CHO-1692 read path: gateway GetMyTenantV1 → chora-tenancy
// MeTenantHandler). The service narrows the v1TenantDTO to the fields
// branding cares about and surfaces a discriminated result.
// ---------------------------------------------------------------------------

describe('TenantBrandingService.hydrateBranding', () => {
  let mock: HttpTestingController;

  afterEach(() => {
    mock?.verify();
  });

  it('sends GET to /api/v1/tenants/me and maps the full tenant doc', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.hydrateBranding());

    const req = httpMock.expectOne(ME_URL);
    expect(req.request.method).toBe('GET');
    req.flush({
      id: 'ten_01HZX',
      display_name: 'MTM Singapore',
      status: 'active',
      branding: {
        primary_color_hex: '#0f766e',
        logo_url: 'https://cdn.mtm.sg/brand/logo.svg',
        custom_domain: 'learn.mtm.sg',
      },
      wizard_completed_at: '2026-05-30T08:00:00Z',
    });

    const result = await promise;
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.snapshot).toEqual({
        displayName: 'MTM Singapore',
        primaryColorHex: '#0f766e',
        logoUrl: 'https://cdn.mtm.sg/brand/logo.svg',
        customDomain: 'learn.mtm.sg',
        wizardCompletedAt: '2026-05-30T08:00:00Z',
      });
    }
  });

  it('normalises a missing branding block + absent wizard_completed_at', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.hydrateBranding());

    httpMock.expectOne(ME_URL).flush({
      id: 'ten_fresh',
      display_name: 'Fresh Tenant',
    });

    const result = await promise;
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.snapshot).toEqual({
        displayName: 'Fresh Tenant',
        primaryColorHex: '',
        logoUrl: '',
        customDomain: '',
        wizardCompletedAt: null,
      });
    }
  });

  it('classifies 401 as unauthenticated with the API code', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.hydrateBranding());

    httpMock.expectOne(ME_URL).flush(
      { error: { code: 'gateway_unauthenticated', message: 'no JWT' } },
      { status: 401, statusText: 'Unauthorized' },
    );

    const result = await promise;
    expect(result.kind).toBe('unauthenticated');
    if (result.kind === 'unauthenticated') {
      expect(result.code).toBe('gateway_unauthenticated');
    }
  });

  it('classifies 400 GATEWAY_TENANT_NOT_RESOLVED as unauthenticated', async () => {
    // GetMyTenantV1 400s when the session JWT carries no tenant context —
    // semantically a re-auth problem, not a validation problem (the GET
    // has no caller input to be invalid).
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.hydrateBranding());

    httpMock.expectOne(ME_URL).flush(
      {
        error: {
          code: 'GATEWAY_TENANT_NOT_RESOLVED',
          message: 'tenant_id missing from auth context',
        },
      },
      { status: 400, statusText: 'Bad Request' },
    );

    const result = await promise;
    expect(result.kind).toBe('unauthenticated');
    if (result.kind === 'unauthenticated') {
      expect(result.code).toBe('GATEWAY_TENANT_NOT_RESOLVED');
    }
  });

  it('classifies 404 as tenant-not-found', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.hydrateBranding());

    httpMock.expectOne(ME_URL).flush(
      { error: { code: 'tenant_not_found', message: 'stale JWT' } },
      { status: 404, statusText: 'Not Found' },
    );

    const result = await promise;
    expect(result.kind).toBe('tenant-not-found');
    if (result.kind === 'tenant-not-found') {
      expect(result.code).toBe('tenant_not_found');
    }
  });

  it('classifies 502 (BFF upstream) as server-error with the gateway code', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.hydrateBranding());

    httpMock.expectOne(ME_URL).flush(
      { error: { code: 'GATEWAY_UPSTREAM_5XX', message: 'upstream returned 500' } },
      { status: 502, statusText: 'Bad Gateway' },
    );

    const result = await promise;
    expect(result.kind).toBe('server-error');
    if (result.kind === 'server-error') {
      expect(result.code).toBe('GATEWAY_UPSTREAM_5XX');
    }
  });

  it('classifies status 0 (network failure) as network-error', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.hydrateBranding());

    httpMock.expectOne(ME_URL).error(new ProgressEvent('Network failure'), {
      status: 0,
      statusText: '',
    });

    const result = await promise;
    expect(result.kind).toBe('network-error');
  });
});
