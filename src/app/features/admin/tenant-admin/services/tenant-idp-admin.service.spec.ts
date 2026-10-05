/**
 * TenantIdpAdminService spec — RED-phase tests for CHO-1694 PR 2.
 *
 * Strict TDD per chora/.claude/rules/development-execution.md: this
 * file is written BEFORE tenant-idp-admin.service.ts exists. Compile
 * must fail with "Cannot find module './tenant-idp-admin.service'" —
 * the observed RED phase. Implementation lands next.
 *
 * Drives the service through HttpTestingController against the
 * canonical BFF URLs. Per chora-web/CLAUDE.md §6, every test calls
 * `httpMock.verify()` in afterEach. Mirrors `tenant-setup.service.spec`
 * (CHO-1683) + `tenant-setup-hydration.service.spec` (CHO-1692) shape.
 *
 * Wire scenarios:
 *   list   — happy / empty / 401 / 5xx / network
 *   upsert — happy / 400 invalid / 401 / 502 secret-manager / 5xx / network
 *   delete — happy 204 / 404 / 400 / 401 / 5xx / network
 *   client_secret never leaks back on the upsert response.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { TenantIdpAdminService } from './tenant-idp-admin.service';
import {
  IDP_PROVIDERS_BASE_PATH,
  IdpProviderListResponse,
  IdpProviderRow,
  idpProviderDeletePath,
} from '../models/tenant-idp-admin.model';
import { environment } from '../../../../../environments/environment';

const LIST_URL = `${environment.bffBaseUrl}${IDP_PROVIDERS_BASE_PATH}`;
const UPSERT_URL = LIST_URL;
const DELETE_OIDC_URL = `${environment.bffBaseUrl}${idpProviderDeletePath('oidc')}`;

function setup(): {
  service: TenantIdpAdminService;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const service = TestBed.inject(TenantIdpAdminService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

const sampleRow: IdpProviderRow = {
  id: '019e0000-0000-7000-8000-iiiiiiiiiiii',
  tenant_id: '01970000-0000-7000-8000-aaaaaaaaaaaa',
  provider_type: 'oidc',
  client_id: 'acme',
  client_secret_name:
    'projects/chora-489812/secrets/idp-client-secret-acme',
  discovery_url:
    'https://issuer.example.com/.well-known/openid-configuration',
  singpass_enabled: false,
  created_at: '2026-06-09T00:00:00Z',
  updated_at: '2026-06-09T00:00:00Z',
};

describe('TenantIdpAdminService', () => {
  let mock: HttpTestingController;

  afterEach(() => {
    mock?.verify();
  });

  // -------------------------------------------------------------------------
  // list()
  // -------------------------------------------------------------------------

  describe('list', () => {
    it('GETs the base path and surfaces rows verbatim on 200', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.list());
      const req = httpMock.expectOne(LIST_URL);
      expect(req.request.method).toBe('GET');
      req.flush(
        { items: [sampleRow] } satisfies IdpProviderListResponse,
        { status: 200, statusText: 'OK' },
      );
      const result = await promise;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.rows).toEqual([sampleRow]);
      }
    });

    it('treats empty items array as success (fresh tenant, not 404)', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(LIST_URL).flush(
        { items: [] } satisfies IdpProviderListResponse,
        { status: 200, statusText: 'OK' },
      );
      const result = await promise;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') expect(result.rows).toEqual([]);
    });

    it('maps 401 to kind:"unauthenticated"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(LIST_URL).flush(null, {
        status: 401,
        statusText: 'Unauthorized',
      });
      const result = await promise;
      expect(result.kind).toBe('unauthenticated');
    });

    it('maps 5xx to kind:"server-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(LIST_URL).flush(null, {
        status: 502,
        statusText: 'Bad Gateway',
      });
      const result = await promise;
      expect(result.kind).toBe('server-error');
    });

    it('maps status 0 to kind:"network-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(LIST_URL).flush(null, {
        status: 0,
        statusText: 'Network error',
      });
      const result = await promise;
      expect(result.kind).toBe('network-error');
    });
  });

  // -------------------------------------------------------------------------
  // upsert()
  // -------------------------------------------------------------------------

  describe('upsert', () => {
    it('POSTs the payload and returns the persisted row', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(
        service.upsert({
          provider_type: 'oidc',
          client_id: 'acme',
          client_secret: 'shhh',
          discovery_url:
            'https://issuer.example.com/.well-known/openid-configuration',
        }),
      );
      const req = httpMock.expectOne(UPSERT_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        provider_type: 'oidc',
        client_id: 'acme',
        client_secret: 'shhh',
        discovery_url:
          'https://issuer.example.com/.well-known/openid-configuration',
      });
      req.flush(sampleRow, { status: 200, statusText: 'OK' });
      const result = await promise;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.row.id).toBe(sampleRow.id);
        expect(
          (result.row as unknown as Record<string, unknown>)['client_secret'],
        ).toBeUndefined();
      }
    });

    it('maps 400 invalid_input to kind:"invalid" with the upstream message', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(
        service.upsert({ provider_type: 'oidc', client_id: '' }),
      );
      httpMock.expectOne(UPSERT_URL).flush(
        { code: 'invalid_input', message: 'oidc requires client_id' },
        { status: 400, statusText: 'Bad Request' },
      );
      const result = await promise;
      expect(result.kind).toBe('invalid');
      if (result.kind === 'invalid') {
        expect(result.message).toContain('client_id');
      }
    });

    it('maps 401 to kind:"unauthenticated"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(
        service.upsert({ provider_type: 'singpass', singpass_enabled: true }),
      );
      httpMock.expectOne(UPSERT_URL).flush(null, {
        status: 401,
        statusText: 'Unauthorized',
      });
      const result = await promise;
      expect(result.kind).toBe('unauthenticated');
    });

    it('maps 502 secret_manager_failed to kind:"secret-manager-failed"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(
        service.upsert({
          provider_type: 'oidc',
          client_id: 'x',
          client_secret: 'y',
          discovery_url: 'https://x.example/openid',
        }),
      );
      httpMock.expectOne(UPSERT_URL).flush(
        { code: 'secret_manager_failed', message: 'kaboom' },
        { status: 502, statusText: 'Bad Gateway' },
      );
      const result = await promise;
      expect(result.kind).toBe('secret-manager-failed');
    });

    it('maps generic 500 to kind:"server-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(
        service.upsert({ provider_type: 'oidc' }),
      );
      httpMock.expectOne(UPSERT_URL).flush(null, {
        status: 500,
        statusText: 'Internal Server Error',
      });
      const result = await promise;
      expect(result.kind).toBe('server-error');
    });

    it('maps status 0 to kind:"network-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(
        service.upsert({ provider_type: 'oidc' }),
      );
      httpMock.expectOne(UPSERT_URL).flush(null, {
        status: 0,
        statusText: 'Network error',
      });
      const result = await promise;
      expect(result.kind).toBe('network-error');
    });
  });

  // -------------------------------------------------------------------------
  // delete()
  // -------------------------------------------------------------------------

  describe('delete', () => {
    it('DELETEs the typed sub-path and returns kind:"success" on 204', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.delete('oidc'));
      const req = httpMock.expectOne(DELETE_OIDC_URL);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      const result = await promise;
      expect(result.kind).toBe('success');
    });

    it('maps 404 to kind:"not-found" (already disconnected)', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.delete('oidc'));
      httpMock.expectOne(DELETE_OIDC_URL).flush(
        { code: 'not_found', message: 'no active idp-provider' },
        { status: 404, statusText: 'Not Found' },
      );
      const result = await promise;
      expect(result.kind).toBe('not-found');
    });

    it('maps 400 invalid_provider_type to kind:"invalid"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.delete('oidc'));
      httpMock.expectOne(DELETE_OIDC_URL).flush(
        { code: 'invalid_provider_type', message: 'unknown provider' },
        { status: 400, statusText: 'Bad Request' },
      );
      const result = await promise;
      expect(result.kind).toBe('invalid');
    });

    it('maps 401 to kind:"unauthenticated"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.delete('oidc'));
      httpMock.expectOne(DELETE_OIDC_URL).flush(null, {
        status: 401,
        statusText: 'Unauthorized',
      });
      const result = await promise;
      expect(result.kind).toBe('unauthenticated');
    });

    it('maps 5xx to kind:"server-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.delete('oidc'));
      httpMock.expectOne(DELETE_OIDC_URL).flush(null, {
        status: 500,
        statusText: 'Internal Server Error',
      });
      const result = await promise;
      expect(result.kind).toBe('server-error');
    });

    it('maps status 0 to kind:"network-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.delete('oidc'));
      httpMock.expectOne(DELETE_OIDC_URL).flush(null, {
        status: 0,
        statusText: 'Network error',
      });
      const result = await promise;
      expect(result.kind).toBe('network-error');
    });
  });
});
