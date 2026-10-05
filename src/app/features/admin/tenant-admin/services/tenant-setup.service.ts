/**
 * TenantSetupService — Setup Wizard Phase C FE service (CHO-1683 / CHO-1682).
 *
 * Single-method service that wraps `POST /api/v1/tenants/setup`
 * (chora-gateway BFF aggregator → chora-identity /me/idp-providers +
 * chora-tenancy /me/finish-setup). Surfaces a discriminated
 * `SetupApplyResult` so the wizard's step 4 Apply stays out of HTTP
 * minutiae and switches on `kind`.
 *
 * Per chora-web/CLAUDE.md §3 (BFF-only): goes through BffClientService,
 * never HttpClient directly, never fetch.
 *
 * Mirrors the tenant-branding.service.ts / tenant-addons.service.ts
 * pattern from CHO-1655 / CHO-1665 — the established shape for wizard
 * flows that need discriminated outcomes.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  errorCodeOf,
  errorMessageOf,
  httpErrorView,
  NO_ACTIVE_TENANT_CODE,
} from '../../../../core/interceptors/api-error.model';
import {
  SetupApplyPayload,
  SetupApplyResponse,
  SetupApplyResult,
  TENANT_SETUP_PATH,
} from '../models/tenant-setup.model';

@Injectable({ providedIn: 'root' })
export class TenantSetupService {
  private readonly bff = inject(BffClientService);

  /**
   * Apply the wizard's collected state — fans out to chora-identity
   * (IdP upsert) and chora-tenancy (finish-setup stamp) via the BFF.
   * Both downstream endpoints are idempotent so the
   * `tenancy-failed-retry-safe` branch is safe to re-issue.
   */
  applyWizard(payload: SetupApplyPayload): Observable<SetupApplyResult> {
    return this.bff.post<SetupApplyResponse>(TENANT_SETUP_PATH, payload).pipe(
      map((response): SetupApplyResult => ({ kind: 'success', response })),
      catchError((err: unknown) => of(this.classify(err))),
    );
  }

  private classify(err: unknown): SetupApplyResult {
    // httpErrorView, not `instanceof HttpErrorResponse`: the global
    // errorInterceptor rethrows every failure as ApiError, so the instanceof
    // matched only in specs and this whole switch was unreachable in the app.
    const view = httpErrorView(err);
    if (!view) {
      return { kind: 'network-error' };
    }
    const upstreamCode = errorCodeOf(view);
    const upstreamMessage = errorMessageOf(view) ?? 'Setup failed.';

    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
      case 403:
        return { kind: 'unauthenticated' };
      case 409:
        if (upstreamCode === NO_ACTIVE_TENANT_CODE) {
          return { kind: 'no-active-tenant' };
        }
        return { kind: 'server-error' };
      case 400:
      case 422:
        // Split unknown-provider-type out so the FE can surface a
        // precise message on the Identity step (a generic 400 message
        // hides which input is wrong).
        if (
          upstreamMessage.includes('unknown provider_type') ||
          upstreamCode === 'unknown_provider_type'
        ) {
          return { kind: 'unknown-provider-type', message: upstreamMessage };
        }
        return { kind: 'invalid', message: upstreamMessage };
      case 502: {
        // Phyllis names the failing leg in the error.code:
        //   - GATEWAY_UPSTREAM_TENANCY — identity row created; retry-safe
        //   - secret_manager_failed    — identity Secret Manager write failed
        //   - GATEWAY_UPSTREAM_5XX     — generic upstream
        if (upstreamCode === 'GATEWAY_UPSTREAM_TENANCY') {
          return {
            kind: 'tenancy-failed-retry-safe',
            message: upstreamMessage,
          };
        }
        if (upstreamCode === 'secret_manager_failed') {
          return { kind: 'secret-manager-failed', message: upstreamMessage };
        }
        return { kind: 'server-error' };
      }
      default:
        // 5xx + anything else falls through to server-error so the
        // wizard surfaces a uniform "try again" toast.
        return { kind: 'server-error' };
    }
  }
}

