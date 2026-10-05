/**
 * TenantManaAdmin — H+ tenant mana-pool wire shapes (L1 Tenant lane,
 * CHO-1709 WP-4).
 *
 * Source of truth:
 *   - tenancy v2 mana-pool admin proxies (BE built in parallel; shapes
 *     locked by the WP-4 brief):
 *       GET  /api/v1/admin/tenants/me/mana-pool            → pool DTO | 404 no pool
 *       POST /api/v1/admin/tenants/me/mana-pool            → 201 pool | 409 pool (exists)
 *       POST /api/v1/admin/tenants/me/mana-pool:auto-renew → 200 pool | 422 | 404
 *   - chora-gateway `payments_handler.go` (`handleManaTopUp` +
 *     `writeCheckoutResp` over `clients.CheckoutResponse`):
 *       POST /api/v1/checkout/mana-topup → {purchase_id, stripe_session_id,
 *                                           stripe_checkout_url, state}
 *
 * Error envelopes VARY by upstream: tenancy v2 emits the NESTED
 * `{"error":{"code","message"}}` shape; the gateway's own errors are
 * FLAT `{code,message}`. The service classifier reads
 * `body.error?.code ?? body.code` so both shapes resolve.
 *
 * The TenantManaPool DTO is snake_case on the wire (matches the BE
 * projection; same convention as TenantMemberSummary).
 */

/** Singleton pool resource — GET read + POST create-if-absent. */
export const ADMIN_TENANT_MANA_POOL_PATH = '/api/v1/admin/tenants/me/mana-pool';

/** Custom-method path — POST set monthly auto-renew quota (0 disables). */
export const ADMIN_TENANT_MANA_POOL_AUTO_RENEW_PATH = `${ADMIN_TENANT_MANA_POOL_PATH}:auto-renew`;

/** Gateway checkout route for tenant mana top-ups (Stripe redirect). */
export const CHECKOUT_MANA_TOPUP_PATH = '/api/v1/checkout/mana-topup';

/** TenantManaPool projection (ADR-142 tenant subsidy pool). */
export interface TenantManaPool {
  readonly pool_id: string;
  readonly tenant_id: string;
  readonly balance_units: number;
  readonly monthly_topup_units: number;
  readonly lifetime_topped_up_units: number;
  readonly lifetime_allocated_units: number;
  readonly version: number;
  readonly created_at: string;
  readonly last_topped_up_at: string | null;
  readonly low_balance_threshold: number;
  readonly is_low_balance: boolean;
}

/** POST :auto-renew request body. `monthly_topup_units` >= 0; 0 disables. */
export interface SetAutoRenewRequest {
  readonly monthly_topup_units: number;
}

/** A fixed FE-offered top-up pack (the mana-topup route is client-priced). */
export interface ManaTopUpPack {
  readonly sku: string;
  readonly mana_units: number;
  readonly amount_cents: number;
  readonly currency: string;
}

/**
 * Fixed tenant top-up packs. Unit pricing mirrors the deployed per-user
 * CHORA_MANA_PACKS rate card (1000 → S$1.99, 5000 → S$7.99,
 * 20000 → S$24.99) with tenant-scoped SKUs.
 */
export const TENANT_MANA_TOPUP_PACKS: readonly ManaTopUpPack[] = [
  { sku: 'tenant-mana-1000', mana_units: 1000, amount_cents: 199, currency: 'SGD' },
  { sku: 'tenant-mana-5000', mana_units: 5000, amount_cents: 799, currency: 'SGD' },
  { sku: 'tenant-mana-20000', mana_units: 20000, amount_cents: 2499, currency: 'SGD' },
];

/** POST /api/v1/checkout/mana-topup request body (gateway `manaTopUpCheckoutBody`). */
export interface ManaTopUpCheckoutRequest {
  readonly sku: string;
  readonly mana_units: number;
  readonly amount_cents: number;
  readonly currency: string;
  readonly success_url: string;
  readonly cancel_url: string;
}

/** Gateway checkout envelope (`clients.CheckoutResponse`). */
export interface ManaTopUpCheckoutResponse {
  readonly purchase_id: string;
  readonly stripe_session_id: string;
  /** Stripe-hosted Checkout page — redirect the browser here. */
  readonly stripe_checkout_url: string;
  readonly state: string;
}

/**
 * Discriminated result for the pool read. 404 is `no-pool` — a first-run
 * state that renders the create CTA, NOT an error.
 */
export type TenantManaPoolLoadResult =
  | { readonly kind: 'success'; readonly pool: TenantManaPool }
  | { readonly kind: 'no-pool' }
  | { readonly kind: 'error'; readonly code: string };

/**
 * Discriminated result for create-if-absent. A 409 whose body carries the
 * existing pool DTO is mapped to `success` by the service (idempotent
 * create — hydrate from body).
 */
export type TenantManaPoolCreateResult =
  | { readonly kind: 'success'; readonly pool: TenantManaPool }
  | { readonly kind: 'error'; readonly code: string };

/** Discriminated result for the monthly auto-renew quota mutation. */
export type TenantManaPoolAutoRenewResult =
  | { readonly kind: 'success'; readonly pool: TenantManaPool }
  | { readonly kind: 'invalid'; readonly code: string }
  | { readonly kind: 'no-pool' }
  | { readonly kind: 'error'; readonly code: string };

/** Discriminated result for the Stripe top-up checkout mint. */
export type ManaTopUpCheckoutResult =
  | { readonly kind: 'success'; readonly checkout: ManaTopUpCheckoutResponse }
  | { readonly kind: 'error'; readonly code: string };
