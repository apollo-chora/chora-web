import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { errorInterceptor } from './error.interceptor';
import { ApiError, isApiError } from './api-error.model';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    router = { navigate: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should pass through successful responses', () => {
    let result: unknown;
    http.get('/api/test').subscribe((r) => (result = r));

    httpMock.expectOne('/api/test').flush({ data: 'ok' });
    expect(result).toEqual({ data: 'ok' });
  });

  it('should normalize IAM ErrorResponse into ApiError', () => {
    let receivedError: unknown;
    http.get('/api/test').subscribe({ error: (err) => (receivedError = err) });

    httpMock.expectOne('/api/test').flush(
      {
        error: {
          code: 'IAM_DUPLICATE_EMAIL',
          message: 'A GCID with this email already exists',
          correlation_id: 'corr-123',
          details: {
            fields: [{ field: 'email', code: 'IAM_EMAIL_REQUIRED', message: 'Email is required' }],
          },
        },
      },
      { status: 409, statusText: 'Conflict' },
    );

    expect(isApiError(receivedError)).toBe(true);
    const apiErr = receivedError as ApiError;
    expect(apiErr.code).toBe('IAM_DUPLICATE_EMAIL');
    expect(apiErr.status).toBe(409);
    expect(apiErr.correlationId).toBe('corr-123');
    expect(apiErr.fieldErrors).toHaveLength(1);
  });

  it('should wrap unknown error shapes into ApiError', () => {
    let receivedError: unknown;
    http.get('/api/test').subscribe({ error: (err) => (receivedError = err) });

    httpMock.expectOne('/api/test').flush('server is down', {
      status: 502,
      statusText: 'Bad Gateway',
    });

    expect(isApiError(receivedError)).toBe(true);
    const apiErr = receivedError as ApiError;
    expect(apiErr.code).toBe('UNKNOWN_ERROR');
    expect(apiErr.status).toBe(502);
  });

  it('should handle error with no body', () => {
    let receivedError: unknown;
    http.get('/api/test').subscribe({ error: (err) => (receivedError = err) });

    httpMock.expectOne('/api/test').flush(null, { status: 500, statusText: 'Internal Server Error' });

    expect(isApiError(receivedError)).toBe(true);
    const apiErr = receivedError as ApiError;
    expect(apiErr.status).toBe(500);
  });

  it('should preserve status 0 for network errors', () => {
    let receivedError: unknown;
    http.get('/api/test').subscribe({ error: (err) => (receivedError = err) });

    httpMock.expectOne('/api/test').error(new ProgressEvent('error'));

    expect(isApiError(receivedError)).toBe(true);
    const apiErr = receivedError as ApiError;
    expect(apiErr.status).toBe(0);
    expect(apiErr.code).toBe('UNKNOWN_ERROR');
  });

  it('navigates to the named refusal on 403 AUTH_NO_TENANT_MEMBERSHIP', () => {
    let receivedError: unknown;
    http.post('/api/v1/auth/session/mint', {}).subscribe({
      error: (err) => (receivedError = err),
    });

    httpMock.expectOne('/api/v1/auth/session/mint').flush(
      {
        error: {
          code: 'AUTH_NO_TENANT_MEMBERSHIP',
          message: 'No tenant membership found for this account',
          correlation_id: 'corr-no-tenant',
        },
      },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(router.navigate).toHaveBeenCalledWith(['/welcome/no-organisation']);
    // Still normalises the error so callers can react if needed.
    expect(isApiError(receivedError)).toBe(true);
    expect((receivedError as ApiError).code).toBe('AUTH_NO_TENANT_MEMBERSHIP');
  });

  it('does NOT navigate for other 403 error codes', () => {
    http.get('/api/test').subscribe({ error: () => { /* test ignores error */ } });

    httpMock.expectOne('/api/test').flush(
      {
        error: {
          code: 'IAM_FORBIDDEN',
          message: 'Forbidden',
          correlation_id: 'corr-x',
        },
      },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does NOT navigate for AUTH_NO_TENANT_MEMBERSHIP code at non-403 status', () => {
    http.get('/api/test').subscribe({ error: () => { /* test ignores error */ } });

    httpMock.expectOne('/api/test').flush(
      {
        error: {
          code: 'AUTH_NO_TENANT_MEMBERSHIP',
          message: 'mismatched status',
          correlation_id: 'corr-y',
        },
      },
      { status: 500, statusText: 'Internal Server Error' },
    );

    expect(router.navigate).not.toHaveBeenCalled();
  });
});
