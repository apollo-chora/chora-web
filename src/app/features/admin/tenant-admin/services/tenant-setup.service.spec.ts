/**
 * TenantSetupService spec — RED-phase tests for CHO-1683 Phase C FE.
 *
 * Strict TDD per chora/.claude/rules/development-execution.md: this
 * file is written BEFORE tenant-setup.service.ts exists. Compile
 * must fail with "Cannot find module './tenant-setup.service'" —
 * that's the observed RED phase. Implementation lands next and turns
 * these GREEN.
 *
 * Drives the service through HttpTestingController against the
 * canonical BFF URL + body shape. Per chora-web/CLAUDE.md §6, every
 * test calls `httpMock.verify()` in afterEach.
 *
 * Mirrors the TenantAddonsService spec shape (CHO-1665). 8 result kinds
 * covered:
 *   - success                                  (newly_completed=true)
 *   - success                                  (newly_completed=false)
 *   - invalid                                  (400 from identity validation)
 *   - unknown-provider-type                    (400 unknown_provider_type from validate)
 *   - unauthenticated                          (401)
 *   - secret-manager-failed                    (502 secret_manager_failed)
 *   - tenancy-failed-retry-safe                (502 GATEWAY_UPSTREAM_TENANCY)
 *   - server-error                             (5xx — generic upstream)
 *   - network-error                            (status 0)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { TenantSetupService } from './tenant-setup.service';
import {
  SetupApplyResponse,
  TENANT_SETUP_PATH,
} from '../models/tenant-setup.model';
import { environment } from '../../../../../environments/environment';

const URL = `${environment.bffBaseUrl}${TENANT_SETUP_PATH}`;

function setup(): {
  service: TenantSetupService;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const service = TestBed.inject(TenantSetupService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

const happyPayload = {
  current_step: 3,
  branding: { primary_color_hex: '#2563eb', logo_url: '' },
  add_ons: [],
  identity: {
    provider_type: 'oidc' as const,
    client_id: 'acme',
    client_secret: 'shhh',
    discovery_url: 'https://issuer.example.com/.well-known/openid-configuration',
    singpass_enabled: false,
  },
};

describe('TenantSetupService', () => {
  let mock: HttpTestingController;

  afterEach(() => {
    mock?.verify();
  });

  // -------------------------------------------------------------------------
  // Happy path — success with newly_completed=true
  // -------------------------------------------------------------------------

  it('sends POST to /api/v1/tenants/setup with the wizard state', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.applyWizard(happyPayload));

    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(happyPayload);

    const flushed: SetupApplyResponse = {
      idp_provider: {
        id: '019e0000-0000-7000-8000-iiiiiiiiiiii',
        tenant_id: '01970000-0000-7000-8000-aaaaaaaaaaaa',
        provider_type: 'oidc',
        client_id: 'acme',
        client_secret_name: 'projects/chora-489812/secrets/idp-client-secret-…',
        discovery_url: 'https://issuer.example.com/.well-known/openid-configuration',
        singpass_enabled: false,
        created_at: '2026-06-07T00:00:00Z',
        updated_at: '2026-06-07T00:00:00Z',
      },
      finish_setup: {
        tenant_id: '01970000-0000-7000-8000-aaaaaaaaaaaa',
        wizard_completed_at: '2026-06-07T00:00:01Z',
        newly_completed: true,
      },
    };
    req.flush(flushed, { status: 200, statusText: 'OK' });

    const result = await promise;
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.response.finish_setup.newly_completed).toBe(true);
      expect(result.response.idp_provider.client_id).toBe('acme');
    }
  });

  // -------------------------------------------------------------------------
  // Happy path — success with newly_completed=false (idempotent re-finish)
  // -------------------------------------------------------------------------

  it('passes through newly_completed=false on idempotent re-finish', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.applyWizard(happyPayload));
    const req = httpMock.expectOne(URL);
    req.flush({
      idp_provider: {
        id: 'x', tenant_id: 't', provider_type: 'oidc', client_id: 'c',
        client_secret_name: 'sn', discovery_url: 'https://x.example',
        singpass_enabled: false,
        created_at: '2026-06-07T00:00:00Z', updated_at: '2026-06-07T00:00:00Z',
      },
      finish_setup: {
        tenant_id: 't',
        wizard_completed_at: '2026-06-06T00:00:00Z', // stamped earlier
        newly_completed: false,
      },
    } satisfies SetupApplyResponse, { status: 200, statusText: 'OK' });

    const result = await promise;
    if (result.kind !== 'success') {
      throw new Error(`expected success; got ${result.kind}`);
    }
    expect(result.response.finish_setup.newly_completed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 400 invalid_input → invalid with the upstream message
  // -------------------------------------------------------------------------

  it('maps 400 invalid_input → kind: "invalid" carrying the message', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.applyWizard(happyPayload));
    const req = httpMock.expectOne(URL);
    req.flush(
      { error: { code: 'invalid_input', message: 'oidc requires client_id' } },
      { status: 400, statusText: 'Bad Request' },
    );

    const result = await promise;
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.message).toContain('client_id');
    }
  });

  // -------------------------------------------------------------------------
  // 400 unknown_provider_type → unknown-provider-type
  // -------------------------------------------------------------------------

  it('maps 400 unknown provider_type → kind: "unknown-provider-type"', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.applyWizard(happyPayload));
    const req = httpMock.expectOne(URL);
    req.flush(
      {
        error: {
          code: 'invalid_input',
          message: 'tenant_idp_provider: invalid input: unknown provider_type "bogus"',
        },
      },
      { status: 400, statusText: 'Bad Request' },
    );

    const result = await promise;
    expect(result.kind).toBe('unknown-provider-type');
    if (result.kind === 'unknown-provider-type') {
      expect(result.message).toContain('provider_type');
    }
  });

  // -------------------------------------------------------------------------
  // 401 → unauthenticated
  // -------------------------------------------------------------------------

  it('maps 401 → kind: "unauthenticated"', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.applyWizard(happyPayload));
    const req = httpMock.expectOne(URL);
    req.flush(null, { status: 401, statusText: 'Unauthorized' });

    const result = await promise;
    expect(result.kind).toBe('unauthenticated');
  });

  // -------------------------------------------------------------------------
  // 502 secret_manager_failed → secret-manager-failed
  // -------------------------------------------------------------------------

  it('maps 502 secret_manager_failed → kind: "secret-manager-failed"', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.applyWizard(happyPayload));
    const req = httpMock.expectOne(URL);
    req.flush(
      { error: { code: 'secret_manager_failed', message: 'kaboom' } },
      { status: 502, statusText: 'Bad Gateway' },
    );

    const result = await promise;
    expect(result.kind).toBe('secret-manager-failed');
  });

  // -------------------------------------------------------------------------
  // 502 GATEWAY_UPSTREAM_TENANCY → tenancy-failed-retry-safe
  // -------------------------------------------------------------------------

  it('maps 502 GATEWAY_UPSTREAM_TENANCY → kind: "tenancy-failed-retry-safe"', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.applyWizard(happyPayload));
    const req = httpMock.expectOne(URL);
    req.flush(
      {
        error: {
          code: 'GATEWAY_UPSTREAM_TENANCY',
          message: 'identity succeeded; tenancy returned 500 (retry-safe — both endpoints idempotent)',
        },
      },
      { status: 502, statusText: 'Bad Gateway' },
    );

    const result = await promise;
    expect(result.kind).toBe('tenancy-failed-retry-safe');
    if (result.kind === 'tenancy-failed-retry-safe') {
      expect(result.message).toContain('retry-safe');
    }
  });

  // -------------------------------------------------------------------------
  // Other 5xx → server-error
  // -------------------------------------------------------------------------

  it('maps generic 500 → kind: "server-error"', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.applyWizard(happyPayload));
    const req = httpMock.expectOne(URL);
    req.flush(null, { status: 500, statusText: 'Internal Server Error' });

    const result = await promise;
    expect(result.kind).toBe('server-error');
  });

  // -------------------------------------------------------------------------
  // status 0 → network-error
  // -------------------------------------------------------------------------

  it('maps status 0 → kind: "network-error"', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.applyWizard(happyPayload));
    const req = httpMock.expectOne(URL);
    req.flush(null, { status: 0, statusText: 'Network error' });

    const result = await promise;
    expect(result.kind).toBe('network-error');
  });
});
