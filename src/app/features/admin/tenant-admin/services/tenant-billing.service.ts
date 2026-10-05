/**
 * TenantBillingService — H+ Billing Wave 4 wire (CHO-1773).
 *
 * Backs `/h/billing`:
 *   - `listInvoices()` — GET /api/v1/admin/tenants/me/invoices?limit=&starting_after=
 *   - `createCustomerPortalSession()` — POST /api/v1/admin/tenants/me/billing-portal
 *
 * Per chora-web/CLAUDE.md §3 (BFF-only): all HTTP goes through
 * BffClientService, never HttpClient directly, never fetch.
 *
 * 422 from the portal endpoint is split into `no-stripe-customer` vs
 * `validation-error` via the BE's `error` code field so the FE can
 * render distinct copy ("Subscribe first" vs "return_url required").
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import { httpErrorView } from '../../../../core/interceptors/api-error.model';
import {
  ADMIN_TENANTS_ME_BILLING_PORTAL_PATH,
  ADMIN_TENANTS_ME_INVOICES_PATH,
  CreatePortalSessionRequest,
  CreatePortalSessionResult,
  ListInvoicesQuery,
  ListInvoicesResponse,
  ListInvoicesResult,
  PortalSessionResponse,
} from '../models/tenant-billing.model';

/** Reads the `{ "error": "<code>" }` body shape chora-payments emits. */
function readErrorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const errField = (body as Record<string, unknown>)['error'];
  if (typeof errField === 'string') return errField;
  if (errField && typeof errField === 'object') {
    const code = (errField as Record<string, unknown>)['code'];
    return typeof code === 'string' ? code : null;
  }
  return null;
}

@Injectable({ providedIn: 'root' })
export class TenantBillingService {
  private readonly bff = inject(BffClientService);

  listInvoices(query: ListInvoicesQuery): Observable<ListInvoicesResult> {
    let params = new HttpParams();
    if (query.limit !== undefined) {
      params = params.set('limit', String(query.limit));
    }
    if (query.startingAfter) {
      params = params.set('starting_after', query.startingAfter);
    }
    return this.bff
      .get<ListInvoicesResponse>(ADMIN_TENANTS_ME_INVOICES_PATH, params)
      .pipe(
        map(
          (response): ListInvoicesResult => ({
            kind: 'success',
            items: response?.items ?? [],
            nextCursor: response?.next_cursor ?? null,
          }),
        ),
        catchError((err: unknown) => of(this.classifyListInvoices(err))),
      );
  }

  createCustomerPortalSession(
    request: CreatePortalSessionRequest,
  ): Observable<CreatePortalSessionResult> {
    return this.bff
      .post<PortalSessionResponse>(ADMIN_TENANTS_ME_BILLING_PORTAL_PATH, request)
      .pipe(
        map(
          (response): CreatePortalSessionResult => ({
            kind: 'success',
            url: response?.url ?? '',
          }),
        ),
        catchError((err: unknown) => of(this.classifyPortal(err))),
      );
  }

  private classifyListInvoices(err: unknown): ListInvoicesResult {
    // httpErrorView, not `instanceof HttpErrorResponse`: the global
    // errorInterceptor rethrows every failure as ApiError, so the instanceof
    // matched only in specs and these switches were unreachable in the app.
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
      case 403:
        return { kind: 'unauthenticated' };
      default:
        return { kind: 'server-error' };
    }
  }

  private classifyPortal(err: unknown): CreatePortalSessionResult {
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
      case 403:
        return { kind: 'unauthenticated' };
      case 422: {
        const code = readErrorCode(view.body);
        return code === 'no_stripe_customer'
          ? { kind: 'no-stripe-customer' }
          : { kind: 'validation-error' };
      }
      default:
        return { kind: 'server-error' };
    }
  }
}
