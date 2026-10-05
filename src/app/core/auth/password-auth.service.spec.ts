import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PasswordAuthService } from './password-auth.service';
import { AuthTokenResponse } from './auth.models';
import { environment } from '../../../environments/environment';
import { errorCodeOf, errorMessageOf, httpErrorView } from '../interceptors/api-error.model';

function mintEnvelope(overrides: Partial<AuthTokenResponse> = {}): AuthTokenResponse {
  return {
    access_token: 'header.payload.signature',
    token_type: 'Bearer',
    expires_in: 3600,
    gcid: 'gcid-1',
    memberships: [{ tenant_id: 'tenant-1', tenant_slug: 'acme', roles: ['learner'], surfaces: ['aplus'], is_default: true }],
    ...overrides,
  };
}

describe('PasswordAuthService', () => {
  let service: PasswordAuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), PasswordAuthService],
    });
    service = TestBed.inject(PasswordAuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('is always configured (gateway-owned credential check, no hosted IdP)', () => {
    expect(service.isConfigured()).toBe(true);
  });

  it('signs in with username + password and resolves the mint envelope', async () => {
    const session = mintEnvelope();
    const pending = service.signInWithPassword('admin', 'admin');

    const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/auth/session/mint`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'admin', password: 'admin' });
    req.flush(session);

    await expect(pending).resolves.toEqual(session);
  });

  it('posts the username verbatim (a username is not necessarily an email)', async () => {
    const pending = service.signInWithPassword('admin', 's3cret!');
    const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/auth/session/mint`);
    expect(req.request.body).toEqual({ username: 'admin', password: 's3cret!' });
    req.flush(mintEnvelope());
    await pending;
  });

  it('rejects with the gateway error envelope on 401 INVALID_CREDENTIALS', async () => {
    const pending = service.signInWithPassword('admin', 'wrong');
    const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/auth/session/mint`);
    req.flush(
      { error: { code: 'INVALID_CREDENTIALS', message: 'invalid username or password', correlation_id: 'corr-1' } },
      { status: 401, statusText: 'Unauthorized' },
    );

    const err = await pending.catch((e: unknown) => e);
    // No interceptor chain here (direct service call), so the rejection is
    // the raw HttpErrorResponse carrying the gateway's error envelope.
    const view = httpErrorView(err);
    expect(view?.status).toBe(401);
    expect(errorCodeOf(view)).toBe('INVALID_CREDENTIALS');
    expect(errorMessageOf(view)).toBe('invalid username or password');
  });

  it('signOut is a no-op that resolves', async () => {
    await expect(service.signOut()).resolves.toBeUndefined();
    httpMock.expectNone(`${environment.bffBaseUrl}/api/v1/auth/session/mint`);
  });
});
