/**
 * TenantBranding — Setup Wizard Phase A wire shapes (CHO-1655).
 *
 * Source of truth: services/chora-tenancy/internal/adapter/http/
 * me_branding_handler.go — the canonical chora-tenancy mount serves
 * `PATCH /api/v1/tenants/me/branding` with the FLAT body shape and
 * returns the persisted BrandingConfig.
 *
 * Field naming matches the backend exactly (`primary_color_hex`,
 * `logo_url`, `custom_domain`) — NOT the older `primary_color` /
 * `secondary_color` shape in tenant-lifecycle.model.ts which was
 * disconnected from the backend. Drop the old shape from the wizard
 * when this becomes the canonical model.
 */

/**
 * PATCH request body — flat, no nested wrapper. All fields are optional;
 * the handler PATCH-merges (only included fields overlay current state).
 */
export interface BrandingUpdatePayload {
  readonly primary_color_hex?: string;
  readonly logo_url?: string;
  readonly custom_domain?: string;
}

/**
 * 200 success body — mirrors `tenant.BrandingConfig`. Every field is
 * always present on the wire (no omitempty on the Go struct) so the
 * caller can render the persisted state without a follow-up GET.
 */
export interface BrandingResponse {
  readonly primary_color_hex: string;
  readonly logo_url: string;
  readonly custom_domain: string;
}

/**
 * Discriminated union the service surfaces to the wizard. The component
 * stays out of HTTP minutiae and switches on `kind`.
 *
 * `code` (CHO-1709 WP-5) is the upstream API error code from the shared
 * `{"error":{"code","message"}}` envelope (chora-tenancy v2WriteError +
 * chora-gateway errResp emit the same shape). Optional — absent when the
 * error body carried no envelope; consumers fall back to a per-kind code.
 */
export type BrandingUpdateResult =
  | { readonly kind: 'success'; readonly response: BrandingResponse }
  | { readonly kind: 'invalid'; readonly message: string; readonly code?: string }
  | { readonly kind: 'unauthenticated'; readonly code?: string }
  | { readonly kind: 'no-active-tenant'; readonly code?: string }
  | { readonly kind: 'tenant-not-found'; readonly code?: string }
  | { readonly kind: 'server-error'; readonly code?: string }
  | { readonly kind: 'network-error'; readonly code?: string };

/** Path constant — keep in lockstep with the BFF route. */
export const TENANT_BRANDING_PATH = '/api/v1/tenants/me/branding';

// ---------------------------------------------------------------------------
// Hydrate GET (CHO-1709 WP-5) — the H+ branding page pre-fills its form
// from GET /api/v1/tenants/me (CHO-1692 read path: chora-gateway
// GetMyTenantV1 → chora-tenancy MeTenantHandler, pg-backed).
// ---------------------------------------------------------------------------

/** Path constant — keep in lockstep with the BFF route (CHO-1692). */
export const TENANT_ME_PATH = '/api/v1/tenants/me';

/**
 * Wire shape for `GET /api/v1/tenants/me` — narrowed to the fields
 * branding consumers read (the v1TenantDTO emits more; not modelled
 * here to avoid drift). `wizard_completed_at` is OMITTED (not null)
 * on fresh tenants, mirroring the activated_at convention.
 */
export interface MeTenantWire {
  readonly id: string;
  readonly display_name?: string;
  readonly branding?: {
    readonly primary_color_hex?: string;
    readonly logo_url?: string;
    readonly custom_domain?: string;
  };
  readonly wizard_completed_at?: string;
}

/**
 * Normalised hydration snapshot. String fields are '' (never undefined)
 * when the backend has no persisted value, so form bindings stay simple;
 * `wizardCompletedAt` is null when the wizard was never finished.
 */
export interface TenantBrandingSnapshot {
  readonly displayName: string;
  readonly primaryColorHex: string;
  readonly logoUrl: string;
  readonly customDomain: string;
  readonly wizardCompletedAt: string | null;
}

/**
 * Discriminated union for the hydrate GET. No 'invalid' arm — the GET
 * carries no caller input to be invalid; the gateway's 400
 * GATEWAY_TENANT_NOT_RESOLVED (JWT without tenant context) classifies
 * as 'unauthenticated' since the remedy is re-auth, not a form fix.
 */
export type BrandingHydrateResult =
  | { readonly kind: 'success'; readonly snapshot: TenantBrandingSnapshot }
  | { readonly kind: 'unauthenticated'; readonly code?: string }
  | { readonly kind: 'tenant-not-found'; readonly code?: string }
  | { readonly kind: 'server-error'; readonly code?: string }
  | { readonly kind: 'network-error'; readonly code?: string };
