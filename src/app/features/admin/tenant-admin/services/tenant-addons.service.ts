/**
 * TenantAddonsService — Setup Wizard Phase B FE service (CHO-1665 / CHO-1664).
 *
 * Single-method service that wraps `POST /api/v1/tenants/me/addons`
 * (chora-gateway BFF → chora-tenancy per phyllis.SubscribeMeAddOns).
 * Surfaces a discriminated `AddonsApplyResult` so the wizard's step 2
 * stays out of HTTP minutiae and switches on `kind`.
 *
 * Per chora-web/CLAUDE.md §3 (BFF-only): goes through BffClientService,
 * never HttpClient directly, never fetch.
 *
 * Empty list short-circuit: when `add_on_codes` is empty the service
 * returns a synthetic `success` with no subscriptions WITHOUT hitting
 * the wire. The user opted into nothing — no point in a round-trip.
 *
 * Mirrors the tenant-branding.service.ts pattern from CHO-1655 — that's
 * the established shape for wizard-style flows that need discriminated
 * outcomes the component can render directly.
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
  AddonsApplyPayload,
  AddonsApplyResponse,
  AddonsApplyResult,
  TENANT_ADDONS_PATH,
} from '../models/tenant-addons.model';

@Injectable({ providedIn: 'root' })
export class TenantAddonsService {
  private readonly bff = inject(BffClientService);

  /**
   * Apply the wizard's selected add-on codes. Idempotent-additive on
   * the backend: repeats are no-ops; omitted codes are NOT deactivated.
   */
  applyAddons(input: AddonsApplyPayload): Observable<AddonsApplyResult> {
    // CHO-1692 — empty list IS a meaningful state: the user has
    // unticked every previously-selected add-on. The BE's REPLACE
    // semantics interpret [] as "remove all wizard-managed
    // selections for this tenant", so we MUST hit the wire even when
    // the local set is empty. The previous synthetic-success
    // short-circuit silently dropped the un-ticks and left the
    // server state stale (CHO-1692 hydration regression).
    const body = { add_on_codes: input.add_on_codes ? [...input.add_on_codes] : [] };
    return this.bff.post<AddonsApplyResponse>(TENANT_ADDONS_PATH, body).pipe(
      map((response): AddonsApplyResult => ({ kind: 'success', response })),
      catchError((err: unknown) => of(this.classify(err))),
    );
  }

  private classify(err: unknown): AddonsApplyResult {
    // httpErrorView, not `instanceof HttpErrorResponse`: the global
    // errorInterceptor rethrows every failure as ApiError, so the instanceof
    // matched only in specs and this whole switch was unreachable in the app.
    const view = httpErrorView(err);
    if (!view) {
      return { kind: 'network-error' };
    }
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
      case 403:
        return { kind: 'unauthenticated' };
      case 409:
        if (errorCodeOf(view) === NO_ACTIVE_TENANT_CODE) {
          return { kind: 'no-active-tenant' };
        }
        return { kind: 'server-error' };
      case 400:
      case 422: {
        const message =
          errorMessageOf(view) ?? 'Add-ons subscription failed validation.';
        if (errorCodeOf(view) === 'unknown_addon_code') {
          return { kind: 'unknown-code', message };
        }
        return { kind: 'invalid', message };
      }
      default:
        // 5xx + anything else falls through to server-error so the
        // wizard surfaces a uniform "try again" toast.
        return { kind: 'server-error' };
    }
  }
}
