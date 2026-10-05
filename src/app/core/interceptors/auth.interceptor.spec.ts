import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';
import { of, throwError, Subject } from 'rxjs';

/**
 * Gateway base URL — the interceptor scopes the Bearer token + 401-refresh
 * to this origin only. `BffClientService` always prepends it to real
 * requests, so the specs use absolute gateway URLs to match production.
 */
const GW = environment.bffBaseUrl;

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authService: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        AuthService,
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should attach Bearer token to non-auth gateway requests', () => {
    authService.setUser(
      { gcid: 'g1', tenantId: 't1', roles: [], capabilities: [], displayName: 'Test', email: 'test@example.com' },
      'my-jwt-token',
    );

    http.get(`${GW}/api/v1/some-endpoint`).subscribe();

    const req = httpMock.expectOne(`${GW}/api/v1/some-endpoint`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer my-jwt-token');
    req.flush({});
  });

  it('should skip auth header for auth endpoints', () => {
    authService.setUser(
      { gcid: 'g1', tenantId: 't1', roles: [], capabilities: [], displayName: 'Test', email: 'test@example.com' },
      'my-jwt-token',
    );

    // /api/v1/auth/session/mint carries the username/password in its
    // body and must NOT have a Chora bearer attached (the Chora session
    // is the OUTPUT of this call, not its input).
    http.post(`${GW}/api/v1/auth/session/mint`, {}).subscribe();

    const req = httpMock.expectOne(`${GW}/api/v1/auth/session/mint`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should skip auth header for GCID registration', () => {
    authService.setUser(
      { gcid: 'g1', tenantId: 't1', roles: [], capabilities: [], displayName: 'Test', email: 'test@example.com' },
      'my-jwt-token',
    );

    http.post(`${GW}/api/v1/gcid`, {}).subscribe();

    const req = httpMock.expectOne(`${GW}/api/v1/gcid`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should NOT attach Bearer to non-gateway static-asset requests', () => {
    // i18n JSON + other static assets are served from the GCS CDN
    // (chora.site/assets/*), not the gateway. Attaching a Bearer there
    // makes GCS reject the request with 401 and kills app-wide i18n.
    authService.setUser(
      { gcid: 'g1', tenantId: 't1', roles: [], capabilities: [], displayName: 'Test', email: 'test@example.com' },
      'my-jwt-token',
    );

    http.get('https://chora.site/assets/i18n/en.json').subscribe();

    const req = httpMock.expectOne('https://chora.site/assets/i18n/en.json');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should pass relative (non-gateway) URLs through without a Bearer', () => {
    authService.setUser(
      { gcid: 'g1', tenantId: 't1', roles: [], capabilities: [], displayName: 'Test', email: 'test@example.com' },
      'my-jwt-token',
    );

    http.get('/assets/config.json').subscribe();

    const req = httpMock.expectOne('/assets/config.json');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should send gateway request without Authorization when no token', () => {
    http.get(`${GW}/api/v1/some-endpoint`).subscribe();

    const req = httpMock.expectOne(`${GW}/api/v1/some-endpoint`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('should attempt silent refresh on 401', () => {
    authService.setUser(
      { gcid: 'g1', tenantId: 't1', roles: [], capabilities: [], displayName: 'Test', email: 'test@example.com' },
      'old-token',
    );
    vi.spyOn(authService, 'silentRefresh').mockReturnValue(of(true));
    vi.spyOn(authService, 'getToken').mockReturnValue('new-token');

    http.get(`${GW}/api/v1/some-endpoint`).subscribe();

    const req = httpMock.expectOne(`${GW}/api/v1/some-endpoint`);
    req.flush(null, { status: 401, statusText: 'Unauthorized' });

    const retry = httpMock.expectOne(`${GW}/api/v1/some-endpoint`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new-token');
    retry.flush({});
  });

  it('should clear auth when silent refresh fails', () => {
    authService.setUser(
      { gcid: 'g1', tenantId: 't1', roles: [], capabilities: [], displayName: 'Test', email: 'test@example.com' },
      'old-token',
    );
    vi.spyOn(authService, 'silentRefresh').mockReturnValue(of(false));
    const clearSpy = vi.spyOn(authService, 'clearAuth');

    http.get(`${GW}/api/v1/some-endpoint`).subscribe({ error: () => { /* test ignores error */ } });

    const req = httpMock.expectOne(`${GW}/api/v1/some-endpoint`);
    req.flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(clearSpy).toHaveBeenCalled();
  });

  it('should clear auth when silent refresh throws', () => {
    authService.setUser(
      { gcid: 'g1', tenantId: 't1', roles: [], capabilities: [], displayName: 'Test', email: 'test@example.com' },
      'old-token',
    );
    vi.spyOn(authService, 'silentRefresh').mockReturnValue(throwError(() => new Error('network')));
    const clearSpy = vi.spyOn(authService, 'clearAuth');

    http.get(`${GW}/api/v1/some-endpoint`).subscribe({ error: () => { /* test ignores error */ } });

    const req = httpMock.expectOne(`${GW}/api/v1/some-endpoint`);
    req.flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(clearSpy).toHaveBeenCalled();
  });

  it('should pass through non-401 errors', () => {
    let receivedError: unknown;
    http.get(`${GW}/api/v1/some-endpoint`).subscribe({ error: (err) => (receivedError = err) });

    const req = httpMock.expectOne(`${GW}/api/v1/some-endpoint`);
    req.flush(null, { status: 500, statusText: 'Server Error' });

    expect(receivedError).toBeDefined();
  });

  // ── Branch: handle401 `if (success)` true arm with a FALSY post-refresh
  // token. silentRefresh succeeds but getToken() returns null, so the retried
  // request is the UNMODIFIED `req` (the `: req` arm of `token ? ... : req` at
  // the success branch) — no Authorization header on the retry.
  it('should retry without Bearer when refresh succeeds but token is null', () => {
    authService.setUser(
      { gcid: 'g1', tenantId: 't1', roles: [], capabilities: [], displayName: 'Test', email: 'test@example.com' },
      'old-token',
    );
    vi.spyOn(authService, 'silentRefresh').mockReturnValue(of(true));
    vi.spyOn(authService, 'getToken').mockReturnValue(null);

    http.get(`${GW}/api/v1/some-endpoint`).subscribe();

    const req = httpMock.expectOne(`${GW}/api/v1/some-endpoint`);
    req.flush(null, { status: 401, statusText: 'Unauthorized' });

    const retry = httpMock.expectOne(`${GW}/api/v1/some-endpoint`);
    expect(retry.request.headers.has('Authorization')).toBe(false);
    retry.flush({});
  });

  // ── Branch: handle401 `if (!isRefreshing)` FALSE arm — a second 401 arriving
  // while a refresh is already in flight takes the queued `refreshSubject`
  // path (filter ready → take(1) → switchMap re-attach). Drives lines 100-107.
  it('should queue concurrent 401s behind an in-flight refresh', () => {
    authService.setUser(
      { gcid: 'g1', tenantId: 't1', roles: [], capabilities: [], displayName: 'Test', email: 'test@example.com' },
      'old-token',
    );
    // A controllable refresh that stays pending until we emit — keeps
    // `isRefreshing === true` while the second 401 arrives.
    const refreshGate = new Subject<boolean>();
    vi.spyOn(authService, 'silentRefresh').mockReturnValue(refreshGate.asObservable());
    vi.spyOn(authService, 'getToken').mockReturnValue('fresh-token');

    http.get(`${GW}/api/v1/first`).subscribe();
    http.get(`${GW}/api/v1/second`).subscribe();

    // First request 401s → starts the refresh (isRefreshing = true).
    const first = httpMock.expectOne(`${GW}/api/v1/first`);
    first.flush(null, { status: 401, statusText: 'Unauthorized' });

    // Second request 401s while refresh is in flight → queued path.
    const second = httpMock.expectOne(`${GW}/api/v1/second`);
    second.flush(null, { status: 401, statusText: 'Unauthorized' });

    // Complete the refresh — both queued + in-flight retries fire with the
    // fresh token attached.
    refreshGate.next(true);
    refreshGate.complete();

    const firstRetry = httpMock.expectOne(`${GW}/api/v1/first`);
    expect(firstRetry.request.headers.get('Authorization')).toBe('Bearer fresh-token');
    firstRetry.flush({});

    const secondRetry = httpMock.expectOne(`${GW}/api/v1/second`);
    expect(secondRetry.request.headers.get('Authorization')).toBe('Bearer fresh-token');
    secondRetry.flush({});
  });

  // ── Branch: queued path `token ? addBearerToken(req, token) : req` FALSY arm
  // (line 105) — a concurrent 401 retried with no token re-attaches nothing.
  it('should queue a concurrent 401 and retry without Bearer when token is null', () => {
    authService.setUser(
      { gcid: 'g1', tenantId: 't1', roles: [], capabilities: [], displayName: 'Test', email: 'test@example.com' },
      'old-token',
    );
    const refreshGate = new Subject<boolean>();
    vi.spyOn(authService, 'silentRefresh').mockReturnValue(refreshGate.asObservable());
    // Refresh "succeeds" but yields no token → queued retry has no Bearer.
    vi.spyOn(authService, 'getToken').mockReturnValue(null);

    http.get(`${GW}/api/v1/alpha`).subscribe();
    http.get(`${GW}/api/v1/beta`).subscribe();

    const alpha = httpMock.expectOne(`${GW}/api/v1/alpha`);
    alpha.flush(null, { status: 401, statusText: 'Unauthorized' });

    const beta = httpMock.expectOne(`${GW}/api/v1/beta`);
    beta.flush(null, { status: 401, statusText: 'Unauthorized' });

    refreshGate.next(true);
    refreshGate.complete();

    const alphaRetry = httpMock.expectOne(`${GW}/api/v1/alpha`);
    expect(alphaRetry.request.headers.has('Authorization')).toBe(false);
    alphaRetry.flush({});

    const betaRetry = httpMock.expectOne(`${GW}/api/v1/beta`);
    expect(betaRetry.request.headers.has('Authorization')).toBe(false);
    betaRetry.flush({});
  });
});
