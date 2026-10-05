/**
 * TenantAddons — Setup Wizard Phase B wire shapes (CHO-1665 / CHO-1664).
 *
 * Source of truth:
 *   - chora-contracts/openapi/tenancy-admin.yaml — `subscribeMyTenantAddons`
 *   - services/chora-tenancy/internal/adapter/http/me_addons_handler.go
 *
 * Semantics: idempotent-additive. POST a set of catalogue codes; each
 * net-new code becomes a row in `pending_activation`. Codes already
 * subscribed in any status are no-ops. Codes the tenant previously had
 * but omitted from the request are LEFT UNCHANGED — deactivation is
 * the dedicated add-on lifecycle flow's job, not the wizard's.
 */

/**
 * POST request body. `add_on_codes` must contain at least one entry
 * (or be omitted entirely — but the wizard service short-circuits the
 * empty case without ever hitting the wire).
 */
export interface AddonsApplyPayload {
  readonly add_on_codes: readonly string[];
}

/** One subscription row in the response. */
export interface MyTenantAddonSubscription {
  readonly subscription_id: string;
  readonly add_on_code: string;
  readonly status:
    | 'pending_activation'
    | 'active'
    | 'grace_period'
    | 'suspended'
    | 'pending_deactivation'
    | 'deactivated';
  readonly created_at: string;
  /** True if THIS request created the row; false if it was already there. */
  readonly newly_subscribed: boolean;
}

/** 200 success body — the full set of the tenant's subscriptions. */
export interface AddonsApplyResponse {
  readonly subscriptions: readonly MyTenantAddonSubscription[];
}

/**
 * Discriminated union the service surfaces to the wizard. The component
 * stays out of HTTP minutiae and switches on `kind`.
 *
 * `unknown-code` is split out from `invalid` so the wizard can surface
 * a precise "these codes aren't recognised" toast — the upstream error
 * body names the offending subset.
 */
export type AddonsApplyResult =
  | { readonly kind: 'success'; readonly response: AddonsApplyResponse }
  | { readonly kind: 'unknown-code'; readonly message: string }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'no-active-tenant' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

/** Path constant — keep in lockstep with the BFF route. */
export const TENANT_ADDONS_PATH = '/api/v1/tenants/me/addons';
