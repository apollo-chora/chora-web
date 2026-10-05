/**
 * TenantAddonsAdmin — H+ Add-on Lifecycle dashboard wire shapes
 * (CHO-1698 STITCH-H-ADD-1).
 *
 * Source of truth:
 *   - `chora-contracts/openapi/tenancy-admin.yaml` (`listTenantAddons` op)
 *   - `services/chora-tenancy/internal/adapter/http/v2_handlers.go::handleAdminListAddons`
 *   - chora-gateway alias `/api/v1/admin/tenants/me/addons` (CHO-1698 PR 1)
 *
 * The BE returns one row per active subscription with the fields the
 * dashboard tile renders. status arrives UPPERCASE from the BE (it
 * mirrors `addon.SubscriptionStatus`); the dashboard normalises to
 * lower-case for display + filter-chip matching.
 */

/** Path constant — keep in lockstep with the BFF alias. */
export const ADMIN_TENANTS_ME_ADDONS_PATH = '/api/v1/admin/tenants/me/addons';

/** One row from the list response. Mirrors the BE handler output. */
export interface AdminAddonRow {
  readonly tenant_id: string;
  readonly addon_plan_id: string;
  readonly addon_code: string;
  readonly display_name: string;
  /** BE emits uppercase (`ACTIVE`, `PENDING_ACTIVATION`, etc.). */
  readonly status: string;
  readonly current_tier?: string;
  /** Monthly cost in minor units (cents) at the time of activation. */
  readonly monthly_cost?: number;
  readonly seats_used?: number;
  readonly activated_at: string;
  readonly deactivated_at?: string | null;
  /** Optional fields documented in the design doc that the BE may add later. */
  readonly billing_cycle_end?: string;
  /**
   * CHO-1784 — next Stripe billing cycle anchor. Populated by chora-tenancy
   * registry's Subscribe as ActivatedAt + 30d (first-cycle approximation);
   * a follow-up will refresh from a chora-payments event. Drives the
   * deactivate modal's effective_at on the end_of_cycle path so the BE
   * schedules to the real anchor instead of a client-side +30d
   * approximation.
   */
  readonly next_renewal_at?: string;
  readonly last_usage_rollup_at?: string;
  readonly compliance_locked?: boolean;
  /**
   * Stripe dunning flag (CHO-1776). True when the BE has received a
   * `chora.payments.tenant_addon_purchase.subscription_payment_failed.v1`
   * event for this subscription + Stripe smart-retry hasn't yet
   * recovered. Drives the `/h/billing` dunning banner (CHO-1777).
   * Optional for forward-compat with pre-CHO-1776 BE responses.
   */
  readonly past_due?: boolean;
  /**
   * Pending end-of-cycle tier change (CHO-1772). Set by the
   * change-tier flow when the admin picks "At the end of this
   * billing cycle". current_tier stays at the paid-for tier; these
   * two fields drive the "<ScheduledTier> starting <date>" badge on
   * the addon tile. Cleared by the subscription_schedule.released
   * webhook when Stripe promotes the new tier.
   */
  readonly scheduled_tier_code?: string;
  readonly scheduled_effective_at?: string;
  /**
   * Pending end-of-cycle deactivation (CHO-1782). Set when the admin
   * picks "End of billing cycle" on the deactivate modal. When status
   * is PENDING_DEACTIVATION and this date is populated the tile renders
   * the destructive "Deactivating <date>" pill. Cleared by the
   * subscription_cancelled subscriber (CHO-1783) when Stripe anchors
   * the cancellation.
   *
   * Note: AdminAddonRow's `status` field carries the un-prefixed
   * uppercase enum from `normaliseAddonStatus()` upstream
   * ('PENDING_DEACTIVATION' here); the FE component template gates the
   * pill on both `status === 'PENDING_DEACTIVATION'` and a populated
   * `deactivation_effective_at` so a half-populated row never renders.
   */
  readonly deactivation_effective_at?: string;
  readonly deactivation_reason?: string;
}

/** GET list response envelope. `items` is ALWAYS present (possibly empty). */
export interface AdminAddonsListResponse {
  readonly items: ReadonlyArray<AdminAddonRow>;
}

/**
 * Normalised status the dashboard renders. The BE's status enum has
 * more values than the design's 4 chips — anything not in the chip
 * set maps to `other` (rendered without a chip filter but still
 * visible under "All").
 */
export type AdminAddonStatus =
  | 'active'
  | 'pending'
  | 'suspended'
  | 'deactivating'
  | 'other';

/** Discriminated result the service surfaces to the dashboard component. */
export type AdminAddonsListResult =
  | { readonly kind: 'success'; readonly rows: ReadonlyArray<AdminAddonRow> }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

/**
 * Normalise the BE's uppercase status to the dashboard's lowercase chip
 * vocabulary. Anything unknown becomes `other` rather than crashing.
 */
export function normaliseAddonStatus(beStatus: string): AdminAddonStatus {
  const s = beStatus.toLowerCase();
  if (s === 'active') return 'active';
  if (s === 'pending_activation' || s === 'pending') return 'pending';
  if (s === 'suspended') return 'suspended';
  if (s === 'pending_deactivation' || s === 'deactivating') return 'deactivating';
  return 'other';
}

// ---------------------------------------------------------------------------
// Deactivation modal — CHO-1731 STITCH-H-ADD-2
// ---------------------------------------------------------------------------

/**
 * Path template for the action-style deactivate endpoint. Use
 * `deactivateAddonPath(planId)` to materialise.
 */
export const ADMIN_TENANTS_ME_ADDONS_DEACTIVATE_PATH =
  '/api/v1/admin/tenants/me/addons/{addonPlanId}:deactivate';

export function deactivateAddonPath(addonPlanId: string): string {
  return `/api/v1/admin/tenants/me/addons/${encodeURIComponent(addonPlanId)}:deactivate`;
}

// CHO-1785 — undo a pending end-of-cycle deactivation. Sibling of the
// :deactivate action path; same /me/addons mount, different verb.
export function cancelDeactivationPath(addonPlanId: string): string {
  return `/api/v1/admin/tenants/me/addons/${encodeURIComponent(addonPlanId)}:cancel-deactivation`;
}

/** Discriminated result for the cancel-deactivation flow (CHO-1785). */
export type CancelDeactivationResult =
  | { readonly kind: 'success'; readonly snapshot: AddOnSubscriptionSnapshot }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'already-deactivated' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

/**
 * Reason enum — mirrors `DeactivateAddonRequest.reason` in
 * chora-contracts/openapi/tenancy-admin.yaml (CHO-1731 PR 1).
 */
export type DeactivateReason =
  | 'no_longer_needed'
  | 'cost'
  | 'consolidation'
  | 'migration'
  | 'compliance'
  | 'other';

/** Ordered list for the dropdown — first option is the safe default. */
export const DEACTIVATE_REASONS: ReadonlyArray<DeactivateReason> = [
  'no_longer_needed',
  'cost',
  'consolidation',
  'migration',
  'compliance',
  'other',
];

/** Effective-at radio choice — `null` = immediate; ISO string = scheduled. */
export type DeactivateEffectiveAt = 'immediate' | 'end_of_cycle';

/** Outbound request body sent to the gateway alias. */
export interface DeactivateAddonRequest {
  readonly reason: DeactivateReason;
  /** Required iff `reason === 'other'`; optional context otherwise. */
  readonly reason_text?: string;
  /**
   * ISO 8601 deferral. Null/omitted means immediate. The FE picks this
   * from the effective-at radio + tile's billing_cycle_end.
   */
  readonly effective_at?: string | null;
}

/** BE response envelope for the deactivate action. */
export interface DeactivateAddonResponse {
  readonly tenant_id: string;
  readonly addon_plan_id: string;
  readonly status: 'DEACTIVATED' | 'DEACTIVATION_SCHEDULED';
  readonly requested_at: string;
  readonly effective_at?: string | null;
  readonly reason?: DeactivateReason;
}

/** Discriminated result the service surfaces to the modal. */
export type DeactivateAddonResult =
  | { readonly kind: 'success-immediate'; readonly response: DeactivateAddonResponse }
  | { readonly kind: 'success-scheduled'; readonly response: DeactivateAddonResponse }
  | { readonly kind: 'compliance-locked' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'already-deactivated' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

// ---------------------------------------------------------------------------
// Usage analytics — CHO-1732 STITCH-H-ADD-3
// ---------------------------------------------------------------------------

/** Path template for the slash-style sub-resource read. */
export const ADMIN_TENANTS_ME_ADDONS_USAGE_PATH =
  '/api/v1/admin/tenants/me/addons/{addonPlanId}/usage';

export function addonUsagePath(addonPlanId: string): string {
  return `/api/v1/admin/tenants/me/addons/${encodeURIComponent(addonPlanId)}/usage`;
}

export type AddonUsageGranularity = 'day' | 'week' | 'month';

export interface AddonUsageQuery {
  readonly from?: string;
  readonly to?: string;
  readonly granularity?: AddonUsageGranularity;
}

/**
 * One bucket of the time-series — mirrors `AddOnUsageBucket` in
 * chora-contracts/openapi/tenancy-admin.yaml (lines 1685-1710).
 */
export interface AddOnUsageBucket {
  readonly bucket_start: string;
  readonly seats_used?: number;
  readonly quota_consumed?: number;
  readonly api_calls?: number | null;
  readonly error_count?: number | null;
}

/**
 * Privacy-preserving top-consumer entry. NEVER carries a raw GCID — only
 * a per-window pseudonym (HMAC of GCID with a tenant-scoped DEK rotated
 * each window) per the federated closure saga rules.
 *
 * Spec asserts every rendered `user_id_pseudonymous` matches the regex
 * `/^user_[a-z0-9]{4}$/` so a future regression that leaks raw GCID
 * is caught.
 */
export interface AddOnUsageTopConsumer {
  readonly user_id_pseudonymous: string;
  readonly share_pct: number;
}

/**
 * Aggregated usage for an add-on within a window. Mirrors `AddOnUsage`
 * in chora-contracts/openapi/tenancy-admin.yaml (lines 1730-1796).
 */
export interface AddOnUsage {
  readonly addon_plan_id: string;
  readonly tenant_id: string;
  readonly period_from: string;
  readonly period_to: string;
  readonly granularity: AddonUsageGranularity;
  readonly seats_total?: number;
  readonly seats_used?: number;
  readonly seats_used_peak?: number;
  readonly quota_unit?: string | null;
  readonly quota_limit?: number | null;
  readonly quota_consumed?: number;
  readonly quota_consumed_pct?: number | null;
  readonly time_series?: ReadonlyArray<AddOnUsageBucket>;
  readonly top_consumers?: ReadonlyArray<AddOnUsageTopConsumer>;
}

/** Discriminated result the service surfaces to the usage screen. */
export type AddonUsageResult =
  | { readonly kind: 'success'; readonly usage: AddOnUsage }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

// ---------------------------------------------------------------------------
// Change-tier flow — CHO-1733 STITCH-H-ADD-4
// ---------------------------------------------------------------------------

/** Path template for the bare-item PATCH endpoint. */
export const ADMIN_TENANTS_ME_ADDONS_ITEM_PATH =
  '/api/v1/admin/tenants/me/addons/{addonPlanId}';

export function addonItemPath(addonPlanId: string): string {
  return `/api/v1/admin/tenants/me/addons/${encodeURIComponent(addonPlanId)}`;
}

/**
 * Proration mode — mirrors OpenAPI `ChangeAddonTierRequest.proration_mode`.
 *
 *  - `create_prorations` — Stripe creates a credit/charge for unused portion.
 *  - `none` — honour new price starting at next renewal, no mid-cycle.
 *  - `always_invoice` (CHO-1786) — like create_prorations but Stripe
 *    invoices + bills the prorated delta TODAY on a separate invoice
 *    rather than rolling it into the next upcoming invoice. Used by
 *    the FE "Immediately" radio so the result card's "Additional
 *    charge today" label matches what Stripe actually bills.
 */
export type ProrationMode = 'create_prorations' | 'none' | 'always_invoice';

export const PRORATION_MODES: ReadonlyArray<ProrationMode> = [
  'create_prorations',
  'none',
  'always_invoice',
];

/** Effective-at radio choice — `immediate` = null payload; `end_of_cycle` = ISO. */
export type ChangeTierEffectiveAt = 'immediate' | 'end_of_cycle';

/** Outbound request body for the PATCH change-tier endpoint. */
export interface ChangeAddonTierRequest {
  readonly target_plan_id: string;
  readonly proration_mode: ProrationMode;
  /**
   * Null/omitted → applies immediately. ISO 8601 → scheduled change
   * (BE creates a Stripe subscription_schedule).
   */
  readonly effective_at?: string | null;
}

/** BE response envelope for the change-tier PATCH. */
export interface ChangeAddonTierResponse {
  readonly subscription_id: string;
  /**
   * Net change for the current billing period in cents.
   * Positive = additional charge (upgrade). Negative = credit (downgrade).
   * Zero = no proration applied.
   */
  readonly billing_delta_cents: number;
  readonly effective_at: string;
  readonly schedule_id?: string | null;
  readonly from_tier?: string;
  readonly to_tier?: string;
  /**
   * CHO-1789 — lowercase ISO currency echoed by chora-payments
   * (e.g. "sgd"). Result card uses this to render the platform default
   * rather than a hardcoded "$".
   */
  readonly currency?: string;
}

/** Discriminated result the service surfaces to the change-tier screen. */
export type ChangeAddonTierResult =
  | { readonly kind: 'success-immediate'; readonly response: ChangeAddonTierResponse }
  | { readonly kind: 'success-scheduled'; readonly response: ChangeAddonTierResponse }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'validation-error' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' }
  /**
   * CHO-1766 — BE returns 422 `no_stripe_subscription` when the row
   * predates CHO-1762's mode=subscription rollout. FE surfaces a
   * banner explaining "please deactivate and re-subscribe".
   */
  | { readonly kind: 'no-stripe-subscription' }
  /**
   * CHO-1766 — BE returns 422 `stripe_price_missing` when the catalogue
   * doesn't have a Price ID for the requested tier (or it's still a
   * placeholder). Surfaces as a banner pointing at the seed script.
   */
  | { readonly kind: 'stripe-price-missing' };

// ---------------------------------------------------------------------------
// CHO-1765 / CHO-1766 — preview-tier-change shape
// ---------------------------------------------------------------------------

/** Outbound request body for POST `.../preview-tier-change`. */
export interface PreviewAddonTierRequest {
  readonly target_tier_code: string;
  readonly proration_mode: ProrationMode;
  /**
   * CHO-1772 — null/omitted → preview the immediate path (proration
   * delta via Stripe Invoice.upcoming). ISO 8601 → preview the
   * end-of-cycle path (billing_delta=0 + next_invoice = new tier
   * monthly price via SubscriptionSchedule).
   */
  readonly effective_at?: string | null;
}

/** BE response envelope — mirrors chora-tenancy's preview-tier-change shape. */
export interface PreviewAddonTierResponse {
  readonly from_tier: string;
  readonly to_tier: string;
  readonly current_monthly_cents: number;
  readonly target_monthly_cents: number;
  readonly billing_delta_cents: number;
  readonly next_invoice_total_cents: number;
  readonly proration_mode: ProrationMode;
  readonly effective_at: string;
  readonly deferred_to_cycle_end: boolean;
  readonly schedule_id?: string | null;
  readonly currency: string;
}

/** Discriminated result the picker uses to drive the preview card. */
export type PreviewAddonTierResult =
  | { readonly kind: 'success'; readonly response: PreviewAddonTierResponse }
  | { readonly kind: 'no-stripe-subscription' }
  | { readonly kind: 'stripe-price-missing' }
  | { readonly kind: 'validation-error' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

/** Path template for the action-style preview endpoint. */
export const ADMIN_TENANTS_ME_ADDONS_PREVIEW_PATH =
  '/api/v1/admin/tenants/me/addons/{addonPlanId}/preview-tier-change';

export function previewTierChangePath(addonPlanId: string): string {
  return `/api/v1/admin/tenants/me/addons/${encodeURIComponent(addonPlanId)}/preview-tier-change`;
}

/** UUID v4/v7 shape — used for client-side target_plan_id validation. */
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Marketplace tile detail — CHO-1734 STITCH-H-ADD-5 (epic close)
// ---------------------------------------------------------------------------
//
// `addonItemPath(planId)` defined for the change-tier flow (CHO-1733)
// also fits the detail GET — both target the bare-item URL.

/** AddOnEntitlement — mirrors openapi `AddOnEntitlement`. */
export interface AddOnEntitlement {
  readonly feature_code: string;
  readonly label: string;
  /** Cap on the entitlement; null/omitted = unlimited. */
  readonly limit?: number | null;
  /** Unit string (e.g. 'seats', 'tokens', 'minutes'); null = no unit. */
  readonly limit_unit?: string | null;
}

/** AddOnIntegration — mirrors openapi `AddOnIntegration`. */
export interface AddOnIntegration {
  readonly type: string;
  readonly label: string;
  readonly status?: 'available' | 'configured' | 'error' | 'disabled';
}

/** AddOnCompliance — mirrors openapi `AddOnCompliance`. */
export interface AddOnCompliance {
  readonly gdpr?: boolean;
  readonly pdpa?: boolean;
  readonly ccpa?: boolean;
  readonly imda?: boolean;
  readonly data_residency_regions?: ReadonlyArray<string>;
}

/** AddOnPricingTier — mirrors openapi `AddOnPricingTier`. */
export interface AddOnPricingTier {
  readonly tier_code: string;
  readonly label: string;
  readonly monthly_price_cents: number;
  readonly currency: string;
  readonly included_units?: number | null;
  readonly overage_unit_cents?: number | null;
}

/** Subscription snapshot status — BE emits UPPERCASE. */
export type SubscriptionSnapshotStatus =
  | 'ACTIVE'
  | 'GRACE'
  | 'PENDING_DEACTIVATION'
  | 'DEACTIVATION_SCHEDULED'
  | 'DEACTIVATED';

/** AddOnSubscriptionSnapshot — mirrors openapi `AddOnSubscriptionSnapshot`. */
export interface AddOnSubscriptionSnapshot {
  readonly activated_at: string;
  readonly current_tier?: string;
  readonly status: SubscriptionSnapshotStatus;
  readonly next_renewal_at?: string | null;
  readonly billing_cycle?: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | null;
  /**
   * Pending end-of-cycle tier change (CHO-1780). When populated the FE
   * renders "<scheduled_tier_code> starting <scheduled_effective_at>".
   * Cleared by the subscription_schedule.released subscriber when
   * Stripe promotes the new tier at the cycle anchor.
   */
  readonly scheduled_tier_code?: string;
  readonly scheduled_effective_at?: string;
  /**
   * Pending end-of-cycle deactivation (CHO-1782). When status is
   * PENDING_DEACTIVATION and this date is populated the FE renders the
   * destructive "Deactivating <date>" pill. Cleared by the
   * subscription_cancelled subscriber (CHO-1783) at the Stripe cycle
   * anchor.
   */
  readonly deactivation_effective_at?: string;
  readonly deactivation_reason?: string;
}

/** AddOnDetail envelope — mirrors openapi `AddOnDetail`. */
export interface AddOnDetail {
  readonly addon_plan_id: string;
  readonly code: string;
  readonly display_name: string;
  readonly category: string;
  readonly description?: string;
  readonly entitlements?: ReadonlyArray<AddOnEntitlement>;
  readonly integrations?: ReadonlyArray<AddOnIntegration>;
  readonly compliance?: AddOnCompliance;
  readonly pricing_tiers?: ReadonlyArray<AddOnPricingTier>;
  /**
   * Tenant-specific subscription snapshot. Present only on the
   * tenant-scoped GET when the tenant has an active subscription;
   * null on the marketplace browse endpoint.
   */
  readonly current_subscription?: AddOnSubscriptionSnapshot | null;
  /**
   * CHO-1745 affordance gate. True for plans that ship as part of the
   * tenant baseline (`base` today) and cannot be subscribed / activated /
   * deactivated via the standard flows. FE uses this to suppress
   * Subscribe / Activate Free / Deactivate buttons and render the
   * `Included for all tenants` badge instead.
   *
   * Optional in the type only for tolerance against pre-CHO-1747
   * fixtures and the existing tenancy-detail GET (where the field is
   * informational); the BE contract marks it required.
   */
  readonly system?: boolean;
  /**
   * CHO-1745 denormalised view of "calling tenant currently holds a
   * live subscription to this plan." Drives the marketplace `Installed`
   * chip without an extra detail round-trip and the management surface
   * `Manage` CTA when an active sub exists.
   *
   * Wider than `current_subscription != null`: also true for
   * `StatusPendingActivation` so the Stripe-Checkout race window
   * doesn't re-offer Subscribe.
   */
  readonly installed?: boolean;
}

/** Discriminated result the service surfaces to the detail screen. */
export type AddonDetailResult =
  | { readonly kind: 'success'; readonly detail: AddOnDetail }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

// ---------------------------------------------------------------------------
// H+ Marketplace catalog browse — CHO-1735
// ---------------------------------------------------------------------------

/** Path constants — kept in lockstep with the BFF aliases. */
export const ADMIN_MARKETPLACE_ADDONS_PATH = '/api/v1/admin/marketplace/addons';

export function marketplaceAddonDetailPath(addonPlanId: string): string {
  return `${ADMIN_MARKETPLACE_ADDONS_PATH}/${encodeURIComponent(addonPlanId)}`;
}

/** Optional list query — all fields verbatim per the BE OpenAPI. */
export interface MarketplaceListQuery {
  readonly category?: string;
  readonly tier?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

/**
 * Marketplace catalog detail. Extends `AddOnDetail` with the
 * `is_installed` flag the BE sets on the detail endpoint (omitted on
 * list responses per chora-tenancy's
 * `TestListMarketplaceAddons_PaginatesAndOmitsCurrentSubscription`).
 */
export interface MarketplaceAddonDetail extends AddOnDetail {
  readonly is_installed?: boolean;
  /**
   * CHO-1757 — the tenant's currently-held tier when `installed === true`.
   * BFF emits this from the in-memory SubscriptionRegistry so the FE can
   * re-highlight the actual selection after returning from Stripe Checkout
   * (where `onSubscribe` hard-navigates and resets component state).
   * Omitted when not installed or when the registry row has no tier.
   */
  readonly current_tier?: string;
}

/** List response envelope — paginated `AddOnDetail[]`. */
export interface MarketplaceAddonListResponse {
  readonly items: ReadonlyArray<AddOnDetail>;
  readonly next_cursor?: string | null;
}

/** Discriminated result for the list call. */
export type MarketplaceListResult =
  | {
      readonly kind: 'success';
      readonly items: ReadonlyArray<AddOnDetail>;
      readonly nextCursor: string | null;
    }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

/** Discriminated result for the detail call. */
export type MarketplaceDetailResult =
  | { readonly kind: 'success'; readonly detail: MarketplaceAddonDetail }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

// ---------------------------------------------------------------------------
// H+ Marketplace Subscribe via Stripe Checkout — CHO-1741 (Sub 5 of CHO-1736)
// ---------------------------------------------------------------------------

/** Path constant for the gateway BFF alias (CHO-1739). */
export const CHECKOUT_TENANT_ADDON_PATH = '/api/v1/checkout/tenant-addon';

/**
 * Request body for the BFF checkout call. Mirrors the gRPC
 * `CreateTenantAddonCheckoutSessionRequest` shape minus the
 * auth-derived fields (tenant_id + admin_gcid the gateway stamps
 * from the ChoraSession JWT).
 */
export interface CreateAddonCheckoutSessionRequest {
  readonly addon_plan_id: string;
  readonly addon_code: string;
  readonly tier_code: string;
  readonly amount_cents: number;
  readonly currency: string;
  /** Optional override; defaults handled server-side. */
  readonly success_url?: string;
  readonly cancel_url?: string;
}

/** Successful response shape from `POST /api/v1/checkout/tenant-addon`. */
export interface CreateAddonCheckoutSessionResponse {
  readonly purchase_id: string;
  readonly stripe_session_id: string;
  readonly stripe_checkout_url: string;
  readonly state: string; // canonical: "checkout_started"
}

/** Discriminated result for the FE Subscribe → BFF → Stripe call. */
export type MarketplaceCheckoutResult =
  | {
      readonly kind: 'success';
      readonly stripeCheckoutUrl: string;
      readonly purchaseId: string;
    }
  | { readonly kind: 'validation-error' }
  | { readonly kind: 'payments-down' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'network-error' };

// ---------------------------------------------------------------------------
// CHO-1742 — Activate-Free for $0 marketplace tiles
// ---------------------------------------------------------------------------

/** Path template for the action-style activate endpoint. */
export const ADMIN_TENANTS_ME_ADDONS_ACTIVATE_PATH =
  '/api/v1/admin/tenants/me/addons/{addonPlanId}:activate';

export function activateAddonPath(addonPlanId: string): string {
  return `/api/v1/admin/tenants/me/addons/${encodeURIComponent(addonPlanId)}:activate`;
}

/** Discriminated result for the FE Activate-Free button. */
export type ActivateAddonResult =
  | { readonly kind: 'success' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'validation-error' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };
