/**
 * TenantManaAdminService — H+ tenant mana-pool read + create-if-absent +
 * monthly auto-renew quota + Stripe top-up checkout (L1 Tenant lane,
 * CHO-1709 WP-4).
 *
 * Four methods over the gateway proxies (BE built in parallel; shapes
 * locked — see tenant-mana-admin.model.ts):
 *  - `pool()`                 — GET  /api/v1/admin/tenants/me/mana-pool
 *  - `create()`               — POST /api/v1/admin/tenants/me/mana-pool
 *  - `setAutoRenew(units)`    — POST /api/v1/admin/tenants/me/mana-pool:auto-renew
 *  - `checkoutTopUp(pack, …)` — POST /api/v1/checkout/mana-topup
 *
 * Per chora-web/CLAUDE.md §3 (BFF-only): all HTTP goes through
 * BffClientService. Error envelopes vary by upstream — tenancy v2 is
 * NESTED `{"error":{"code","message"}}`, the gateway's own errors are
 * FLAT `{code,message}` — so `envelopeCode()` reads
 * `body.error?.code ?? body.code` and falls back to `HTTP_{status}`.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  HttpErrorView,
  httpErrorView,
} from '../../../../core/interceptors/api-error.model';
import {
  ADMIN_TENANT_MANA_POOL_AUTO_RENEW_PATH,
  ADMIN_TENANT_MANA_POOL_PATH,
  CHECKOUT_MANA_TOPUP_PATH,
  ManaTopUpCheckoutRequest,
  ManaTopUpCheckoutResponse,
  ManaTopUpCheckoutResult,
  ManaTopUpPack,
  SetAutoRenewRequest,
  TenantManaPool,
  TenantManaPoolAutoRenewResult,
  TenantManaPoolCreateResult,
  TenantManaPoolLoadResult,
} from '../models/tenant-mana-admin.model';

@Injectable({ providedIn: 'root' })
export class TenantManaAdminService {
  private readonly bff = inject(BffClientService);

  /** Fetch the tenant's mana pool. 404 → `no-pool` (create CTA state). */
  pool(): Observable<TenantManaPoolLoadResult> {
    return this.bff.get<TenantManaPool>(ADMIN_TENANT_MANA_POOL_PATH).pipe(
      map((pool): TenantManaPoolLoadResult => ({ kind: 'success', pool })),
      catchError((err: unknown) => of(this.classifyLoad(err))),
    );
  }

  /**
   * Create the pool (starts empty — no initial balance is promised).
   * A 409 whose body is the existing pool DTO is treated as success.
   */
  create(): Observable<TenantManaPoolCreateResult> {
    return this.bff.post<TenantManaPool>(ADMIN_TENANT_MANA_POOL_PATH, {}).pipe(
      map((pool): TenantManaPoolCreateResult => ({ kind: 'success', pool })),
      catchError((err: unknown) => of(this.classifyCreate(err))),
    );
  }

  /** Set the monthly auto-renew quota. `monthlyTopupUnits` >= 0; 0 disables. */
  setAutoRenew(monthlyTopupUnits: number): Observable<TenantManaPoolAutoRenewResult> {
    const body: SetAutoRenewRequest = { monthly_topup_units: monthlyTopupUnits };
    return this.bff
      .post<TenantManaPool>(ADMIN_TENANT_MANA_POOL_AUTO_RENEW_PATH, body)
      .pipe(
        map((pool): TenantManaPoolAutoRenewResult => ({ kind: 'success', pool })),
        catchError((err: unknown) => of(this.classifyAutoRenew(err))),
      );
  }

  /**
   * Mint a Stripe Checkout Session for a tenant mana top-up. The caller
   * redirects the browser to `checkout.stripe_checkout_url` on success.
   */
  checkoutTopUp(
    pack: ManaTopUpPack,
    successUrl: string,
    cancelUrl: string,
  ): Observable<ManaTopUpCheckoutResult> {
    const body: ManaTopUpCheckoutRequest = {
      sku: pack.sku,
      mana_units: pack.mana_units,
      amount_cents: pack.amount_cents,
      currency: pack.currency,
      success_url: successUrl,
      cancel_url: cancelUrl,
    };
    return this.bff
      .post<ManaTopUpCheckoutResponse>(CHECKOUT_MANA_TOPUP_PATH, body)
      .pipe(
        map((checkout): ManaTopUpCheckoutResult => ({ kind: 'success', checkout })),
        catchError((err: unknown) => of(this.classifyCheckout(err))),
      );
  }

  // ── Classification ──────────────────────────────────────────────────

  private classifyLoad(err: unknown): TenantManaPoolLoadResult {
    const view = httpErrorView(err);
    if (!view) {
      return { kind: 'error', code: 'NETWORK_ERROR' };
    }
    if (view.status === 404) return { kind: 'no-pool' };
    return { kind: 'error', code: this.envelopeCode(view) };
  }

  private classifyCreate(err: unknown): TenantManaPoolCreateResult {
    const view = httpErrorView(err);
    if (!view) {
      return { kind: 'error', code: 'NETWORK_ERROR' };
    }
    if (view.status === 409) {
      // Already exists — the 409 body carries the existing pool DTO;
      // hydrate from it (idempotent create). Defensive: an envelope-only
      // 409 (no pool_id) still classifies as an error.
      const pool = this.poolFromBody(view.body);
      if (pool) return { kind: 'success', pool };
    }
    return { kind: 'error', code: this.envelopeCode(view) };
  }

  private classifyAutoRenew(err: unknown): TenantManaPoolAutoRenewResult {
    const view = httpErrorView(err);
    if (!view) {
      return { kind: 'error', code: 'NETWORK_ERROR' };
    }
    switch (view.status) {
      case 404:
        return { kind: 'no-pool' };
      case 400:
      case 422:
        return { kind: 'invalid', code: this.envelopeCode(view) };
      default:
        return { kind: 'error', code: this.envelopeCode(view) };
    }
  }

  private classifyCheckout(err: unknown): ManaTopUpCheckoutResult {
    const view = httpErrorView(err);
    if (!view) {
      return { kind: 'error', code: 'NETWORK_ERROR' };
    }
    return { kind: 'error', code: this.envelopeCode(view) };
  }

  /**
   * Reads the API error code, tolerating BOTH envelope shapes:
   * tenancy v2 NESTED `{"error":{"code","message"}}` and gateway FLAT
   * `{code,message}` (`body.error?.code ?? body.code`). Falls back to
   * `HTTP_{status}` when neither carries a string code, and
   * `NETWORK_ERROR` for status-0 transport failures.
   */
  private envelopeCode(err: HttpErrorView): string {
    if (err.status === 0) return 'NETWORK_ERROR';
    const body: unknown = err.body;
    if (body && typeof body === 'object') {
      const flat = (body as { code?: unknown }).code;
      const nested = (body as { error?: { code?: unknown } }).error?.code;
      const code = nested ?? flat;
      if (typeof code === 'string' && code.length > 0) return code;
    }
    return `HTTP_${err.status}`;
  }

  /** Narrow an unknown 409 body to a TenantManaPool (pool_id present). */
  private poolFromBody(body: unknown): TenantManaPool | null {
    if (
      body &&
      typeof body === 'object' &&
      typeof (body as { pool_id?: unknown }).pool_id === 'string'
    ) {
      return body as TenantManaPool;
    }
    return null;
  }
}
