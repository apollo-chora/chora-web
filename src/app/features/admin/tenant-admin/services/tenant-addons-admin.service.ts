/**
 * TenantAddonsAdminService — H+ Add-on Lifecycle dashboard + deactivation
 * modal + usage analytics + change-tier flow
 * (CHO-1698, CHO-1731, CHO-1732, CHO-1733).
 *
 * Methods:
 *  - `list()`       — GET /api/v1/admin/tenants/me/addons (CHO-1698 PR 1).
 *  - `refresh()`    — thin alias for `list()`.
 *  - `deactivate()` — POST /api/v1/admin/tenants/me/addons/{planId}:deactivate
 *                     (CHO-1731 PR 1).
 *  - `getUsage()`   — GET /api/v1/admin/tenants/me/addons/{planId}/usage
 *                     (CHO-1732 PR 1).
 *  - `changeTier()` — PATCH /api/v1/admin/tenants/me/addons/{planId}
 *                     (CHO-1733 PR 1). Forwards `ChangeAddonTierRequest`
 *                     body; classifies into a discriminated
 *                     `ChangeAddonTierResult` union for the change-tier
 *                     screen — 409/422 routed to their own kinds so the
 *                     FE can distinguish retry-vs-cancel.
 *
 * Per chora-web/CLAUDE.md §3 (BFF-only): all HTTP goes through
 * BffClientService, never HttpClient directly, never fetch.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import { httpErrorView } from '../../../../core/interceptors/api-error.model';
import {
  ADMIN_MARKETPLACE_ADDONS_PATH,
  ADMIN_TENANTS_ME_ADDONS_PATH,
  AddOnDetail,
  AddOnSubscriptionSnapshot,
  AddOnUsage,
  AddonDetailResult,
  AdminAddonsListResponse,
  AdminAddonsListResult,
  AddonUsageQuery,
  AddonUsageResult,
  CHECKOUT_TENANT_ADDON_PATH,
  CancelDeactivationResult,
  ChangeAddonTierRequest,
  ChangeAddonTierResponse,
  ChangeAddonTierResult,
  CreateAddonCheckoutSessionRequest,
  CreateAddonCheckoutSessionResponse,
  DeactivateAddonRequest,
  DeactivateAddonResponse,
  DeactivateAddonResult,
  MarketplaceAddonDetail,
  MarketplaceAddonListResponse,
  MarketplaceCheckoutResult,
  MarketplaceDetailResult,
  MarketplaceListQuery,
  MarketplaceListResult,
  PreviewAddonTierRequest,
  PreviewAddonTierResponse,
  PreviewAddonTierResult,
  ActivateAddonResult,
  activateAddonPath,
  addonItemPath,
  addonUsagePath,
  cancelDeactivationPath,
  deactivateAddonPath,
  marketplaceAddonDetailPath,
  previewTierChangePath,
} from '../models/tenant-addons-admin.model';

/**
 * Reads `{ "error": { "code", "message" } }` shape chora-tenancy
 * emits on 4xx — used by CHO-1766 to split the 422 into per-code
 * banners (no_stripe_subscription / stripe_price_missing).
 */
function readErrorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const errField = (body as Record<string, unknown>)['error'];
  if (!errField || typeof errField !== 'object') return null;
  const code = (errField as Record<string, unknown>)['code'];
  return typeof code === 'string' ? code : null;
}

@Injectable({ providedIn: 'root' })
export class TenantAddonsAdminService {
  private readonly bff = inject(BffClientService);

  list(): Observable<AdminAddonsListResult> {
    return this.bff
      .get<AdminAddonsListResponse>(ADMIN_TENANTS_ME_ADDONS_PATH)
      .pipe(
        map(
          (response): AdminAddonsListResult => ({
            kind: 'success',
            rows: response?.items ?? [],
          }),
        ),
        catchError((err: unknown) => of(this.classifyList(err))),
      );
  }

  refresh(): Observable<AdminAddonsListResult> {
    return this.list();
  }

  deactivate(
    addonPlanId: string,
    request: DeactivateAddonRequest,
  ): Observable<DeactivateAddonResult> {
    return this.bff
      .post<DeactivateAddonResponse>(deactivateAddonPath(addonPlanId), request)
      .pipe(
        map(
          (response): DeactivateAddonResult =>
            response?.status === 'DEACTIVATION_SCHEDULED'
              ? { kind: 'success-scheduled', response }
              : { kind: 'success-immediate', response },
        ),
        catchError((err: unknown) => of(this.classifyDeactivate(err))),
      );
  }

  /**
   * CHO-1785 — undo a pending end-of-cycle deactivation. POSTs
   * `:cancel-deactivation` against the same `/me/addons` mount; BE
   * flips PENDING_DEACTIVATION → ACTIVE and returns the fresh
   * snapshot.
   */
  cancelScheduledDeactivation(
    addonPlanId: string,
  ): Observable<CancelDeactivationResult> {
    return this.bff
      .post<AddOnSubscriptionSnapshot>(cancelDeactivationPath(addonPlanId), {})
      .pipe(
        map((snapshot): CancelDeactivationResult => ({ kind: 'success', snapshot })),
        catchError((err: unknown) => of(this.classifyCancelDeactivation(err))),
      );
  }

  getUsage(
    addonPlanId: string,
    query: AddonUsageQuery,
  ): Observable<AddonUsageResult> {
    const path = addonUsagePath(addonPlanId) + this.buildUsageQueryString(query);
    return this.bff.get<AddOnUsage>(path).pipe(
      map((usage): AddonUsageResult => ({ kind: 'success', usage })),
      catchError((err: unknown) => of(this.classifyUsage(err))),
    );
  }

  changeTier(
    addonPlanId: string,
    request: ChangeAddonTierRequest,
  ): Observable<ChangeAddonTierResult> {
    return this.bff
      .patch<ChangeAddonTierResponse>(addonItemPath(addonPlanId), request)
      .pipe(
        map(
          (response): ChangeAddonTierResult =>
            response?.schedule_id
              ? { kind: 'success-scheduled', response }
              : { kind: 'success-immediate', response },
        ),
        catchError((err: unknown) => of(this.classifyChangeTier(err))),
      );
  }

  /**
   * CHO-1766 — preview the upcoming-invoice delta Stripe would bill
   * if the addon's tier were changed. Calls
   * POST /api/v1/admin/tenants/me/addons/<id>/preview-tier-change
   * (CHO-1765 BE). Read-only — does NOT mutate the subscription.
   */
  previewTierChange(
    addonPlanId: string,
    request: PreviewAddonTierRequest,
  ): Observable<PreviewAddonTierResult> {
    return this.bff
      .post<PreviewAddonTierResponse>(previewTierChangePath(addonPlanId), request)
      .pipe(
        map(
          (response): PreviewAddonTierResult => ({ kind: 'success', response }),
        ),
        catchError((err: unknown) => of(this.classifyPreviewTier(err))),
      );
  }

  private classifyPreviewTier(err: unknown): PreviewAddonTierResult {
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
      case 404:
        return { kind: 'not-found' };
      case 422: {
        const code = readErrorCode(view.body);
        if (code === 'no_stripe_subscription') return { kind: 'no-stripe-subscription' };
        if (code === 'stripe_price_missing') return { kind: 'stripe-price-missing' };
        return { kind: 'validation-error' };
      }
      default:
        return { kind: 'server-error' };
    }
  }

  /**
   * CHO-1734 STITCH-H-ADD-5 — fetches the full AddOnDetail envelope
   * for the marketplace tile detail screen. Shares the bare-item URL
   * with `changeTier`; dispatch is by HTTP method on the BFF side
   * (GET → detail, PATCH → change-tier).
   */
  getDetail(addonPlanId: string): Observable<AddonDetailResult> {
    return this.bff.get<AddOnDetail>(addonItemPath(addonPlanId)).pipe(
      map((detail): AddonDetailResult => ({ kind: 'success', detail })),
      catchError((err: unknown) => of(this.classifyDetail(err))),
    );
  }

  /**
   * CHO-1735 — H+ Marketplace catalog browse list. Tenant-agnostic
   * (no `me` rewrite) — the BFF strips the `current_subscription`
   * snapshot per chora-tenancy's
   * `TestListMarketplaceAddons_PaginatesAndOmitsCurrentSubscription`.
   * Optional `MarketplaceListQuery` is forwarded as a query string.
   */
  listMarketplace(query: MarketplaceListQuery): Observable<MarketplaceListResult> {
    const path = ADMIN_MARKETPLACE_ADDONS_PATH + this.buildMarketplaceQueryString(query);
    return this.bff.get<MarketplaceAddonListResponse>(path).pipe(
      map(
        (response): MarketplaceListResult => ({
          kind: 'success',
          items: response?.items ?? [],
          nextCursor: response?.next_cursor ?? null,
        }),
      ),
      catchError((err: unknown) => of(this.classifyMarketplaceList(err))),
    );
  }

  /**
   * CHO-1735 — H+ Marketplace catalog detail. Tenant-agnostic (no `me`
   * rewrite). BE sets `is_installed` from the auth-resolved tenant
   * context (omitted on the list endpoint).
   */
  getMarketplaceDetail(addonPlanId: string): Observable<MarketplaceDetailResult> {
    return this.bff
      .get<MarketplaceAddonDetail>(marketplaceAddonDetailPath(addonPlanId))
      .pipe(
        map(
          (detail): MarketplaceDetailResult => ({ kind: 'success', detail }),
        ),
        catchError((err: unknown) => of(this.classifyMarketplaceDetail(err))),
      );
  }

  /**
   * Hand-rolled query-string builder — the BE forwards `from` / `to` /
   * `granularity` raw, and we keep the ISO 8601 colons literal so deep
   * links stay readable. (Angular's default HttpParams encoder would
   * percent-encode `:` to `%3A`.)
   */
  private buildUsageQueryString(query: AddonUsageQuery): string {
    const parts: string[] = [];
    if (query.from) parts.push(`from=${query.from}`);
    if (query.to) parts.push(`to=${query.to}`);
    if (query.granularity) parts.push(`granularity=${query.granularity}`);
    return parts.length > 0 ? `?${parts.join('&')}` : '';
  }

  private classifyList(err: unknown): AdminAddonsListResult {
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

  private classifyDeactivate(err: unknown): DeactivateAddonResult {
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
      case 403:
        return { kind: 'unauthenticated' };
      case 404:
        return { kind: 'not-found' };
      case 409:
        return { kind: 'already-deactivated' };
      case 423:
        return { kind: 'compliance-locked' };
      default:
        return { kind: 'server-error' };
    }
  }

  private classifyCancelDeactivation(err: unknown): CancelDeactivationResult {
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
        return { kind: 'unauthenticated' };
      case 403:
        return { kind: 'forbidden' };
      case 404:
        return { kind: 'not-found' };
      case 409:
        return { kind: 'already-deactivated' };
      default:
        return { kind: 'server-error' };
    }
  }

  private classifyUsage(err: unknown): AddonUsageResult {
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
      case 403:
        return { kind: 'unauthenticated' };
      case 404:
        return { kind: 'not-found' };
      default:
        return { kind: 'server-error' };
    }
  }

  private classifyChangeTier(err: unknown): ChangeAddonTierResult {
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
      case 403:
        return { kind: 'unauthenticated' };
      case 404:
        return { kind: 'not-found' };
      case 409:
        return { kind: 'conflict' };
      case 422: {
        // CHO-1766 — split the 422 into the CHO-1764/1767 sentinel codes
        // so the FE banner copy can be specific.
        const code = readErrorCode(view.body);
        if (code === 'no_stripe_subscription') return { kind: 'no-stripe-subscription' };
        if (code === 'stripe_price_missing') return { kind: 'stripe-price-missing' };
        return { kind: 'validation-error' };
      }
      default:
        return { kind: 'server-error' };
    }
  }

  private classifyDetail(err: unknown): AddonDetailResult {
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
      case 403:
        return { kind: 'unauthenticated' };
      case 404:
        return { kind: 'not-found' };
      default:
        return { kind: 'server-error' };
    }
  }

  /**
   * Forwards `category` / `tier` / `cursor` / `limit` literally — the
   * BE OpenAPI expects them raw. Values are URL-safe per the BE spec
   * (enum or numeric); no encoding pass needed.
   */
  private buildMarketplaceQueryString(query: MarketplaceListQuery): string {
    const parts: string[] = [];
    if (query.category) parts.push(`category=${query.category}`);
    if (query.tier) parts.push(`tier=${query.tier}`);
    if (query.cursor) parts.push(`cursor=${query.cursor}`);
    if (typeof query.limit === 'number') parts.push(`limit=${query.limit}`);
    return parts.length > 0 ? `?${parts.join('&')}` : '';
  }

  private classifyMarketplaceList(err: unknown): MarketplaceListResult {
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

  private classifyMarketplaceDetail(err: unknown): MarketplaceDetailResult {
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
      case 403:
        return { kind: 'unauthenticated' };
      case 404:
        return { kind: 'not-found' };
      default:
        return { kind: 'server-error' };
    }
  }

  /**
   * CHO-1741 — H+ Marketplace Subscribe via Stripe Checkout. POSTs to
   * the chora-gateway BFF alias (`/api/v1/checkout/tenant-addon`,
   * CHO-1739) which proxies to chora-payments. On success the FE
   * does `window.location.href = stripeCheckoutUrl` to redirect into
   * Stripe-hosted Checkout; on return, `?checkout=success` triggers
   * a poll loop until `is_installed=true` and `?checkout=cancel`
   * surfaces a neutral toast (post-checkout handling lives on the
   * catalog detail component).
   */
  createCheckoutSession(req: {
    addonPlanId: string;
    addonCode: string;
    tierCode: string;
    amountCents: number;
    currency: string;
    successUrl?: string;
    cancelUrl?: string;
  }): Observable<MarketplaceCheckoutResult> {
    const origin = window.location.origin;
    const encoded = encodeURIComponent(req.addonPlanId);
    const body: CreateAddonCheckoutSessionRequest = {
      addon_plan_id: req.addonPlanId,
      addon_code: req.addonCode,
      tier_code: req.tierCode,
      amount_cents: req.amountCents,
      currency: req.currency,
      success_url:
        req.successUrl ?? origin + '/h/marketplace/' + encoded + '?checkout=success',
      cancel_url:
        req.cancelUrl ?? origin + '/h/marketplace/' + encoded + '?checkout=cancel',
    };
    return this.bff
      .post<CreateAddonCheckoutSessionResponse>(CHECKOUT_TENANT_ADDON_PATH, body)
      .pipe(
        map(
          (response): MarketplaceCheckoutResult => ({
            kind: 'success',
            stripeCheckoutUrl: response.stripe_checkout_url,
            purchaseId: response.purchase_id,
          }),
        ),
        catchError((err: unknown) => of(this.classifyCheckout(err))),
      );
  }

  private classifyCheckout(err: unknown): MarketplaceCheckoutResult {
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 400:
      case 422:
        return { kind: 'validation-error' };
      case 401:
      case 403:
        return { kind: 'unauthenticated' };
      case 502:
      case 503:
      case 504:
        return { kind: 'payments-down' };
      default:
        return { kind: 'payments-down' };
    }
  }

  /**
   * CHO-1742 — Activate-Free path for $0 marketplace tiles. The catalog
   * detail screen swaps the Subscribe CTA for `Activate Free` when the
   * loaded detail has `pricing_tiers[0].monthly_price_cents === 0`. This
   * method POSTs an empty body to the gateway's
   * `:activate` action alias, which rewrites `me` to the auth tenant
   * and forwards to chora-tenancy's parametric backend.
   *
   * No Stripe Checkout (Stripe rejects $0 sessions by design).
   * No tenant_addon_purchase aggregate (CHO-1736 was paid-only).
   * The tenancy registry's `Subscribe` is idempotent on (tenant, addon).
   */
  activateAddon(addonPlanId: string): Observable<ActivateAddonResult> {
    return this.bff.post<unknown>(activateAddonPath(addonPlanId), {}).pipe(
      map((): ActivateAddonResult => ({ kind: 'success' })),
      catchError((err: unknown) => of(this.classifyActivate(err))),
    );
  }

  private classifyActivate(err: unknown): ActivateAddonResult {
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
      case 403:
        return { kind: 'unauthenticated' };
      case 404:
        return { kind: 'not-found' };
      case 422:
        return { kind: 'validation-error' };
      default:
        return { kind: 'server-error' };
    }
  }
}
