/**
 * TenantSetupHydration — model shapes for the Setup Wizard re-entry
 * hydration flow (CHO-1692).
 *
 * Source of truth:
 *   - `chora-contracts/openapi/bff-gateway.yaml` — `getMyTenant`
 *     proxies to chora-tenancy's `/v1/tenants/{id}` which returns the
 *     full tenant doc (branding + `wizard_completed_at`).
 *   - `chora-contracts/openapi/identity-admin.yaml` v1.2 — the new
 *     `GET /api/v1/tenants/me/idp-providers` envelope (`{items: [...]}`)
 *     surfaces persisted IdP rows for the calling tenant.
 *
 * Semantics — parallel fetch, fault-tolerant:
 *   The hydration service issues both reads in parallel and NEVER
 *   rejects. Per-source failure (5xx / network / 401) yields `null`
 *   for that slice while sibling slices continue. The wizard treats
 *   `null` as "no persisted value — use defaults" which mirrors a
 *   fresh-tenant first-visit.
 *
 * `client_secret` is NEVER hydrated. The chora-identity GET endpoint
 * explicitly omits the value (Secret Manager-resident; only
 * `client_secret_name` is exposed). Re-entering the secret remains an
 * opt-in per-session action.
 */

/** Path constants — keep in lockstep with the BFF + identity routes. */
// CHO-1692 — uses the pg-backed /api/v1/tenants/me which returns the
// canonical v1TenantDTO shape (branding + wizard_completed_at). The
// legacy /api/tenants/me hits an in-memory registry that returns a
// different shape and doesn't carry wizard_completed_at.
export const HYDRATION_TENANT_PATH = '/api/v1/tenants/me';
export const HYDRATION_IDP_PROVIDERS_PATH = '/api/v1/tenants/me/idp-providers';

/**
 * Wire shape for `GET /api/tenants/me` — narrow to the fields the
 * wizard hydration reads. The chora-tenancy DTO emits many more
 * fields; we deliberately don't model them here to avoid drift.
 *
 * `wizard_completed_at` is OMITTED on fresh tenants (mirrors the
 * activated_at / deleted_at convention in v1TenantDTO); the hydration
 * service treats `undefined` as "wizard not yet completed".
 */
export interface MeTenantHydrationWire {
  readonly id: string;
  readonly branding?: {
    readonly primary_color_hex?: string;
    readonly logo_url?: string;
    readonly custom_domain?: string;
  };
  readonly wizard_completed_at?: string;
}

/**
 * Wire shape for `GET /api/v1/tenants/me/idp-providers`. Mirrors
 * `TenantIdpProviderListResponse` in identity-admin.yaml v1.2. The
 * `items` array is ALWAYS present (possibly empty) so iteration is
 * null-safe.
 */
export interface MeIdpProvidersHydrationWire {
  readonly items: ReadonlyArray<MeIdpProviderRowWire>;
}

export interface MeIdpProviderRowWire {
  readonly id: string;
  readonly tenant_id: string;
  readonly provider_type: 'oidc' | 'saml' | 'singpass';
  readonly client_id?: string;
  readonly client_secret_name?: string;
  readonly discovery_url?: string;
  readonly singpass_enabled: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Normalised hydration result the wizard consumes. Each slice is
 * INDEPENDENT — a tenant-GET failure does not nullify the idp slice
 * and vice versa.
 *
 * Slice nullability:
 *   - `branding: null`           → tenant GET failed (auth / 5xx / net).
 *   - `wizardCompletedAt: null`  → tenant GET failed OR the tenant
 *                                  has not yet finished the wizard.
 *                                  The wizard banner uses non-null +
 *                                  parseable date to decide whether
 *                                  to render — a `null` slice means
 *                                  "do not show the banner".
 *   - `identity: null`           → idp GET failed OR no rows yet.
 *                                  Empty list and 5xx are
 *                                  observationally identical here
 *                                  (both mean "no signal to pre-fill");
 *                                  the wizard treats them the same.
 *
 * The `sources` field carries per-stream status flags so the wizard
 * can surface a "we couldn't load your saved settings" hint when
 * something failed (rather than silently presenting defaults that the
 * user might mistake for data loss).
 */
export interface HydrationState {
  readonly branding: HydrationBranding | null;
  readonly identity: HydrationIdentity | null;
  readonly wizardCompletedAt: string | null;
  readonly sources: HydrationSources;
}

export interface HydrationBranding {
  readonly primary_color_hex: string | null;
  readonly logo_url: string | null;
}

export interface HydrationIdentity {
  readonly provider_type: 'oidc' | 'singpass';
  readonly client_id: string;
  readonly discovery_url: string;
  readonly singpass_enabled: boolean;
  /**
   * Secret Manager resource name for the previously-configured
   * `client_secret`. Surfaced to the FE so re-entry can show "secret
   * already configured" affordance without exposing the value.
   */
  readonly client_secret_name: string | null;
}

export interface HydrationSources {
  readonly tenant: 'ok' | 'failed';
  readonly idp: 'ok' | 'failed';
}
