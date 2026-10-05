/**
 * Integration: BffClientService + authInterceptor + AuthService.
 *
 * Exercises the cross-service HTTP path: a caller using BffClientService
 * hits HttpClient → authInterceptor decides whether to attach a Bearer
 * token based on AuthService state + endpoint allow-list.
 *
 * This is INTEGRATION-level (not unit) because it wires three independent
 * services through the real Angular HttpClient via provideHttpClient +
 * withInterceptors, mirroring the actual app-bootstrap dependency graph.
 * Pure unit tests for each (auth.interceptor.spec.ts, bff-client.service
 * .spec.ts, auth.service.spec.ts) cover the components in isolation.
 *
 * Lives under chora-web/src/integration-tests/ (kept inside src so
 * Angular's @angular/build:unit-test builder discovers it — moving
 * out to chora-web/tests/ silently dropped it from Vitest's file set,
 * even with tsconfig.spec.json widened — per build 249573ad). Stage 3b
 * filters via the integration-spec glob; stage 2 unit-test excludes it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { authInterceptor } from '../app/core/interceptors/auth.interceptor';
import { BffClientService } from '../app/core/services/bff-client.service';
import { AuthService } from '../app/core/auth/auth.service';
import { environment } from '../environments/environment';

describe('Integration: BffClient → authInterceptor → AuthService', () => {
  let bff: BffClientService;
  let authService: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        BffClientService,
        AuthService,
      ],
    });
    bff = TestBed.inject(BffClientService);
    authService = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('attaches Authorization: Bearer to a gateway request when authenticated', () => {
    authService.setUser(
      {
        gcid: 'g-int-1',
        tenantId: 't-int-1',
        roles: ['learner'],
        capabilities: [],
        displayName: 'Integration User',
        email: 'i@example.com',
      },
      'test-token-abc',
    );

    bff.get('/api/v1/courses').subscribe();

    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/courses`,
    );
    expect(req.request.headers.get('Authorization')).toBe(
      'Bearer test-token-abc',
    );
    req.flush({ courses: [] });
  });

  it('does NOT attach Authorization to the /api/v1/auth/session/mint endpoint, even when authenticated', () => {
    authService.setUser(
      {
        gcid: 'g-int-2',
        tenantId: 't-int-2',
        roles: [],
        capabilities: [],
        displayName: 'Mint Path',
        email: 'm@example.com',
      },
      'test-token-mint',
    );

    bff.post('/api/v1/auth/session/mint', { username: 'u', password: 'p' }).subscribe();

    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/auth/session/mint`,
    );
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ token: 'minted' });
  });

  it('does NOT attach Authorization when the user is unauthenticated', () => {
    bff.get('/api/v1/courses').subscribe();

    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/courses`,
    );
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ courses: [] });
  });
});
