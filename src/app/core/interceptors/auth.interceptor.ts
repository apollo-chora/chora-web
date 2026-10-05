import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

// The session mint is anonymous (it IS the auth-establishing call) and the
// webauthn/gcid routes manage their own challenge semantics, so none of
// them receive the Bearer header or take part in the 401-refresh dance.
const AUTH_ENDPOINTS = [
  '/api/v1/auth/webauthn/',
  '/api/v1/auth/session/mint',
  '/api/v1/auth/logout',
  '/api/v1/gcid',
];

let isRefreshing = false;
const refreshSubject = new BehaviorSubject<boolean>(false);

function isAuthEndpoint(url: string): boolean {
  return AUTH_ENDPOINTS.some((ep) => url.includes(ep));
}

/**
 * True only for requests targeting the BFF gateway. The Bearer token +
 * 401-refresh handling must be scoped to the gateway origin — attaching
 * `Authorization` to a static CDN asset (`chora.site/assets/*`, served
 * from GCS) makes GCS reject it with 401. All app HTTP goes through
 * `BffClientService`, which always prepends `environment.bffBaseUrl`.
 */
function isGatewayRequest(url: string): boolean {
  return url.startsWith(environment.bffBaseUrl);
}

function addBearerToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const authService = inject(AuthService);

  // Non-gateway requests (static CDN assets, i18n JSON, anything not on
  // the BFF origin) pass through untouched — no Bearer, no 401-refresh.
  if (!isGatewayRequest(req.url)) {
    return next(req);
  }

  if (isAuthEndpoint(req.url)) {
    return next(req);
  }

  const token = authService.getToken();
  const authedReq = token ? addBearerToken(req, token) : req;

  return next(authedReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isAuthEndpoint(req.url)) {
        return handle401(req, next, authService);
      }
      return throwError(() => error);
    }),
  );
};

function handle401(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService,
): Observable<import('@angular/common/http').HttpEvent<unknown>> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshSubject.next(false);

    return authService.silentRefresh().pipe(
      switchMap((success) => {
        isRefreshing = false;
        refreshSubject.next(true);

        if (success) {
          const token = authService.getToken();
          return next(token ? addBearerToken(req, token) : req);
        }
        authService.clearAuth();
        return throwError(() => new HttpErrorResponse({ status: 401 }));
      }),
      catchError((err) => {
        isRefreshing = false;
        refreshSubject.next(true);
        authService.clearAuth();
        return throwError(() => err);
      }),
    );
  }

  return refreshSubject.pipe(
    filter((ready) => ready),
    take(1),
    switchMap(() => {
      const token = authService.getToken();
      return next(token ? addBearerToken(req, token) : req);
    }),
  );
}
