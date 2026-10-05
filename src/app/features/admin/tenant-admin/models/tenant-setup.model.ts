/**
 * TenantSetup — Setup Wizard Phase C wire shapes (CHO-1683 / CHO-1682).
 *
 * Source of truth:
 *   - chora-contracts/openapi/bff-gateway.yaml — `setupTenant` aggregator
 *   - services/chora-gateway/internal/aggregator/phyllis/setup.go
 *     (fans out to chora-identity /me/idp-providers + chora-tenancy /me/finish-setup)
 *
 * Semantics — multi-downstream aggregator:
 *  1. Identity FIRST. On 4xx/5xx, tenancy is NOT called — pass-through.
 *  2. On identity 2xx, tenancy is called. On tenancy failure surface a
 *     502 `GATEWAY_UPSTREAM_TENANCY` and let the FE offer a retry CTA
 *     (both downstreams are idempotent so the whole call is safe to
 *     re-issue).
 */

/**
 * POST request body. The wizard sends its FULL state for diagnostic
 * parity; the BFF only consumes `identity` (additionalProperties:true
 * on the OpenAPI envelope so branding + add_ons pass through harmlessly).
 */
export interface SetupApplyPayload {
  readonly current_step?: number;
  readonly branding?: unknown;
  readonly add_ons?: readonly string[];
  readonly identity: IdentitySlice;
}

/** Mirrors openapi SetupTenantIdentitySlice. */
export interface IdentitySlice {
  readonly provider_type: 'oidc' | 'saml' | 'singpass';
  readonly client_id?: string;
  readonly client_secret?: string; // writeOnly: never echoed back
  readonly discovery_url?: string;
  readonly singpass_enabled?: boolean;
}

/** Mirrors openapi TenantIdpProviderResponse (excerpt — full shape from chora-identity). */
export interface IdpProviderSummary {
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

/** Mirrors openapi FinishMyTenantSetupResponse. */
export interface FinishSetupSummary {
  readonly tenant_id: string;
  readonly wizard_completed_at: string;
  /**
   * True if THIS request flipped the timestamp from NULL; false if the
   * wizard was already complete. Drives the FE's celebration-vs-quiet
   * toast variant.
   */
  readonly newly_completed: boolean;
}

/** 200 success body — both downstream responses stitched together. */
export interface SetupApplyResponse {
  readonly idp_provider: IdpProviderSummary;
  readonly finish_setup: FinishSetupSummary;
}

/**
 * Discriminated union the service surfaces to the wizard. The component
 * stays out of HTTP minutiae and switches on `kind`.
 *
 * - `success`                   → 200; show celebration/quiet toast per newly_completed, navigate
 * - `invalid`                   → 400 generic validation error (e.g. OIDC missing client_id) — inline on step 3
 * - `unknown-provider-type`     → 400 specifically calling out a bad provider_type — inline on step 3
 * - `unauthenticated`           → 401 missing/invalid JWT — toast + redirect to /login
 * - `secret-manager-failed`     → 502 the identity Secret Manager mint failed — toast (no DB row leaked)
 * - `tenancy-failed-retry-safe` → 502 GATEWAY_UPSTREAM_TENANCY (identity row created, tenancy finish failed)
 *                                  → inline retry CTA on step 4 (idempotent re-issue is safe)
 * - `server-error`              → other 5xx — toast
 * - `network-error`             → status 0 — toast
 */
export type SetupApplyResult =
  | { readonly kind: 'success'; readonly response: SetupApplyResponse }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'unknown-provider-type'; readonly message: string }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'no-active-tenant' }
  | { readonly kind: 'secret-manager-failed'; readonly message: string }
  | { readonly kind: 'tenancy-failed-retry-safe'; readonly message: string }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

/** Path constant — keep in lockstep with the BFF route. */
export const TENANT_SETUP_PATH = '/api/v1/tenants/setup';
