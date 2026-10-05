/**
 * BootstrapTenantService spec — RED-phase tests for CHO-1642.
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
import { firstValueFrom, throwError } from 'rxjs';

import { BootstrapTenantService } from './bootstrap-tenant.service';
import { BOOTSTRAP_TENANT_PATH } from './bootstrap-tenant.model';
import { BffClientService } from '../../../core/services/bff-client.service';
import { environment } from '../../../../environments/environment';

const URL = `${environment.bffBaseUrl}${BOOTSTRAP_TENANT_PATH}`;

function setup(): {
  service: BootstrapTenantService;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const service = TestBed.inject(BootstrapTenantService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

describe('BootstrapTenantService', () => {
  let mock: HttpTestingController;

  afterEach(() => {
    mock?.verify();
  });

  it('sends POST to /api/v1/tenants/bootstrap with { name } body', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.bootstrap('Htet Aung Dev Tenant'));

    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Htet Aung Dev Tenant' });

    req.flush({
      tenant_id: '01935f12-0000-7000-8000-000000000001',
      owner_member_id: '01935f12-0000-7000-8000-000000000002',
      entitlement_id: '01935f12-0000-7000-8000-000000000003',
      created_at: '2026-06-02T01:00:00Z',
    }, { status: 201, statusText: 'Created' });

    const result = await promise;
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.response.tenant_id).toBe('01935f12-0000-7000-8000-000000000001');
    }
  });

  it('trims whitespace from the name before sending', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.bootstrap('   Trimmed Tenant   '));

    const req = httpMock.expectOne(URL);
    expect(req.request.body).toEqual({ name: 'Trimmed Tenant' });
    req.flush({
      tenant_id: 'x', owner_member_id: 'y', entitlement_id: 'z',
      created_at: '2026-06-02T01:00:00Z',
    }, { status: 201, statusText: 'Created' });
    await promise;
  });

  it('maps 409 to { kind: already-member }', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.bootstrap('Dup Tenant'));

    httpMock.expectOne(URL).flush(
      { error: { code: 'already_member', message: 'caller already holds membership' } },
      { status: 409, statusText: 'Conflict' },
    );

    const result = await promise;
    expect(result.kind).toBe('already-member');
  });

  it('maps 400 to { kind: invalid-name } with the upstream message', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.bootstrap('xx'));

    httpMock.expectOne(URL).flush(
      { error: { code: 'invalid_argument', message: 'name must be at least 3 characters' } },
      { status: 400, statusText: 'Bad Request' },
    );

    const result = await promise;
    expect(result.kind).toBe('invalid-name');
    if (result.kind === 'invalid-name') {
      expect(result.message).toContain('3 characters');
    }
  });

  it('maps 401 to { kind: unauthenticated }', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.bootstrap('No Auth'));

    httpMock.expectOne(URL).flush(
      { error: { code: 'gateway_unauthenticated' } },
      { status: 401, statusText: 'Unauthorized' },
    );

    const result = await promise;
    expect(result.kind).toBe('unauthenticated');
  });

  it('maps 5xx to { kind: server-error }', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.bootstrap('Boom'));

    httpMock.expectOne(URL).flush(
      { error: 'oops' },
      { status: 500, statusText: 'Internal Server Error' },
    );

    const result = await promise;
    expect(result.kind).toBe('server-error');
  });

  it('maps network failure to { kind: network-error }', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.bootstrap('Offline'));

    httpMock.expectOne(URL).error(new ProgressEvent('error'), {
      status: 0,
      statusText: 'Unknown Error',
    });

    const result = await promise;
    expect(result.kind).toBe('network-error');
  });

  // --- Augmentation: branches not covered by the RED-phase suite ---

  it('maps 403 to { kind: unauthenticated }', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.bootstrap('Forbidden Tenant'));

    httpMock.expectOne(URL).flush(
      { error: { code: 'permission_denied', message: 'forbidden' } },
      { status: 403, statusText: 'Forbidden' },
    );

    const result = await promise;
    expect(result.kind).toBe('unauthenticated');
  });

  it('maps 422 to { kind: invalid-name } with the upstream message', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.bootstrap('Bad Name'));

    httpMock.expectOne(URL).flush(
      { error: { code: 'validation_error', message: 'name failed validation' } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    const result = await promise;
    expect(result.kind).toBe('invalid-name');
    if (result.kind === 'invalid-name') {
      expect(result.message).toContain('failed validation');
    }
  });

  it('falls back to the flat err.error.message when the BFF envelope is not nested', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.bootstrap('Flat Error'));

    // No nested `error.error.message` — only a top-level `message`.
    httpMock.expectOne(URL).flush(
      { message: 'plain validation message' },
      { status: 400, statusText: 'Bad Request' },
    );

    const result = await promise;
    expect(result.kind).toBe('invalid-name');
    if (result.kind === 'invalid-name') {
      expect(result.message).toBe('plain validation message');
    }
  });

  it('falls back to the default message when no message is present in the body', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.bootstrap('No Message'));

    // Body has neither nested nor flat message.
    httpMock.expectOne(URL).flush(
      { error: { code: 'invalid_argument' } },
      { status: 400, statusText: 'Bad Request' },
    );

    const result = await promise;
    expect(result.kind).toBe('invalid-name');
    if (result.kind === 'invalid-name') {
      expect(result.message).toBe('Tenant name is invalid.');
    }
  });

  it('maps an unhandled non-5xx 4xx status (e.g. 404) to { kind: server-error }', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.bootstrap('Missing Route'));

    httpMock.expectOne(URL).flush(
      { error: { code: 'not_found' } },
      { status: 404, statusText: 'Not Found' },
    );

    const result = await promise;
    // Both default-branch arms (>=500 and the else) return server-error.
    expect(result.kind).toBe('server-error');
  });

  it('maps a 503 to { kind: server-error } via the >=500 arm', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.bootstrap('Unavailable'));

    httpMock.expectOne(URL).flush(
      { error: { code: 'unavailable' } },
      { status: 503, statusText: 'Service Unavailable' },
    );

    const result = await promise;
    expect(result.kind).toBe('server-error');
  });

  it('maps a non-HttpErrorResponse rejection to { kind: network-error }', async () => {
    // Drive the `!(err instanceof HttpErrorResponse)` guard directly: a
    // flushed HttpTestingController error always yields status 0, so this
    // branch is only reachable when the underlying client throws a plain
    // error (e.g. a synchronous TypeError before the request is sent).
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: BffClientService,
          useValue: {
            post: () => throwError(() => new TypeError('boom')),
          },
        },
      ],
    });
    const service = TestBed.inject(BootstrapTenantService);
    // No HttpTestingController interaction — leave `mock` unset for this case.
    mock = undefined as unknown as HttpTestingController;

    const result = await firstValueFrom(service.bootstrap('Plain Throw'));
    expect(result.kind).toBe('network-error');
  });
});
