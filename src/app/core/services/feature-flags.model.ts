/**
 * Feature-flags / tenant-entitlements model — wired LIVE 2026-05-15 to
 *   GET /api/feature-flags → chora-gateway → chora-tenancy
 * (A7 RESOLVED, BE round-10, `chora-tenancy:7b006fee`).
 *
 * The response is the tenant's `TenantEntitlement` set — the BE round-10 note
 * spells this out: "the TenantEntitlement list IS the feature-flag set (no
 * literal `feature-flags` route exists downstream)". Each entitlement is a
 * snake_case wire DTO mirrored EXACTLY (no synthesized fields):
 *
 *   {
 *     id: UUIDv7,
 *     tenant_id: UUIDv7,
 *     addon_id: UUIDv7,
 *     status: "active" | <other lifecycle states>,
 *     monthly_price_cents_snapshot: int,
 *     activated_at: ISO-8601,
 *     updated_at: ISO-8601
 *   }
 *
 * RLS-scoped to the active tenant — the JWT `tenant_id` claim narrows the
 * response automatically.
 *
 * A8 gap CLOSED (auth-hardening Phase A §4.7b, CHO-1717): the BE now
 * carries `addon_code` (human snake_case slug, e.g. `cplus_social`) on the
 * entitlement DTO — tenancy migration 0021 added `add_ons.code` and the
 * entitlements read JOINs it in (handoff §4.6). CONTRACT PIN: the JSON
 * field name is `addon_code`; it MAY be empty (`""`) for legacy add-on
 * rows created before the column existed, and is typed optional here so
 * pre-cutover responses (field absent) remain assignable.
 */

/** A single tenant add-on subscription as returned by `/api/feature-flags`. */
export interface TenantEntitlement {
  /** Entitlement row id (UUIDv7). */
  readonly id: string;
  /** Tenant aggregate id (UUIDv7) — narrowed by RLS. */
  readonly tenant_id: string;
  /** Add-on aggregate id (UUIDv7). Opaque to the FE for now. */
  readonly addon_id: string;
  /**
   * Human snake_case add-on slug (e.g. `cplus_social`) — the bridge for
   * `FeatureFlagService.isEnabled(code)`. Optional: absent on pre-cutover
   * responses and MAY be `""` for legacy add-on rows without a code.
   * Empty values never match any `isEnabled` query.
   */
  readonly addon_code?: string;
  /**
   * Entitlement lifecycle state. `active` is the only state the FE treats
   * as enabled; everything else is treated as not-entitled.
   */
  readonly status: string;
  /** Frozen SGD-cents price captured at activation time. */
  readonly monthly_price_cents_snapshot: number;
  /** ISO-8601 UTC activation timestamp. */
  readonly activated_at: string;
  /** ISO-8601 UTC last-update timestamp. */
  readonly updated_at: string;
}

/** Wire shape of `GET /api/feature-flags`. */
export interface FeatureFlagsResponse {
  readonly items: readonly TenantEntitlement[];
  readonly total: number;
}
