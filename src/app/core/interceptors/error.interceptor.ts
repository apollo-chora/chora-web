import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiError, ErrorResponse } from './api-error.model';

/**
 * Gateway error code emitted (HTTP 403) when an authenticated
 * user has no `members` row in any tenant. Surfaced after the Stage-2
 * cutover (2026-05-14). The generic 401/error path loops through
 * `/login`; instead we route to a dedicated onboarding page.
 */
const NO_TENANT_MEMBERSHIP_CODE = 'AUTH_NO_TENANT_MEMBERSHIP';

function isErrorResponse(body: unknown): body is ErrorResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as ErrorResponse).error?.code === 'string' &&
    typeof (body as ErrorResponse).error?.message === 'string'
  );
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  return next(req).pipe(
    catchError((httpError: HttpErrorResponse) => {
      if (isErrorResponse(httpError.error)) {
        const detail = httpError.error.error;

        // Stage-2 cutover: an authenticated user with no tenant
        // membership. Route to the no-tenant onboarding page rather
        // than the generic auth-failure path (which loops /login).
        if (httpError.status === 403 && detail.code === NO_TENANT_MEMBERSHIP_CODE) {
          router.navigate(['/welcome/no-organisation']);
        }

        // The two identity resolve faults (both 503 from resolve_handler.go).
        // Post ADR-182 a tenantless session means the auto-enrol or the
        // tenancy read failed, so the code is carried to the refusal screen
        // and shown verbatim. Without it the screen can only say that
        // something went wrong, which is the difference between a user who
        // can quote a code to support and one who cannot.
        if (
          httpError.status === 503 &&
          (detail.code === 'IDENTITY_ENROL_FAILED' ||
            detail.code === 'IDENTITY_TENANCY_UNAVAILABLE')
        ) {
          router.navigate(['/welcome/no-organisation'], {
            queryParams: { code: detail.code },
          });
        }

        return throwError(() => new ApiError(httpError.status, detail, httpError.error));
      }

      return throwError(
        () =>
          new ApiError(
            httpError.status || 0,
            {
              code: 'UNKNOWN_ERROR',
              message: httpError.message || 'An unexpected error occurred',
              correlation_id: '',
            },
            // Preserve the raw body — non-envelope error payloads (e.g.
            // the mana-pool create 409 carrying the existing pool DTO,
            // or identity's FLAT {code,message}) are otherwise lost.
            httpError.error,
          ),
      );
    }),
  );
};
