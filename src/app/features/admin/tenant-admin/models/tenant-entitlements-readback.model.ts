/**
 * Setup wizard step 2 read-back model (E5 slice 2).
 *
 * ⚠⚠⚠ TWO ENDPOINTS, AND ONLY ONE OF THEM IS THE PLAN.
 *
 *  - THE GRANT, read here. `GET /api/feature-flags` is chora-gateway's proxy
 *    of chora-tenancy `GET /api/tenants/{id}/entitlements`, with the tenant
 *    taken from the validated JWT rather than a route parameter
 *    (`gatewayproxy.GetFeatureFlags`). Its rows are `add_on_subscriptions`,
 *    the durable entitlement chora-tenancy writes when an organisation is
 *    created. Field `addon_code`, envelope `items`.
 *
 *  - THE INTENT, never read here. `GET /api/v1/tenants/me/addons` is served
 *    from `setup_wizard_addon_selections` (chora-tenancy
 *    `me_addons_handler.go`), and that handler's own POST comment records
 *    that it leaves `add_on_subscriptions` untouched. Field `add_on_code`,
 *    envelope `subscriptions`. The two DIVERGE, because tenant creation
 *    grants durably while this wizard only ever wrote intent. Rendering it
 *    would show an operator what somebody once ticked and label it the
 *    organisation's plan.
 *
 * The wizard's own path to the entitlements endpoint is closed, which is why
 * this reads the feature-flags alias and not the path the design named: the
 * gateway claims the whole `/api/tenants/` subtree and hands it to
 * `handleTenantByID`, which 404s any path with a slash after the id
 * (`gatewayproxy_handler.go`). A direct call would never reach chora-tenancy.
 */

/**
 * The ONLY browser-reachable read of the durable grant. See the file header
 * for why it is not the `/api/tenants/{id}/entitlements` path itself.
 */
export const ENTITLEMENTS_READBACK_PATH = '/api/feature-flags';

/** Where an operator goes to CHANGE the plan. Step 2 is read-only. */
export const ADDONS_MANAGEMENT_PATH = '/h/addons';

/**
 * One row of the grant. Mirrors chora-tenancy's `entitlementDTO`; only the
 * two fields this read-back uses are named, because a model that restates
 * fields nobody reads invites the next reader to trust it as the contract.
 *
 * `addon_code` is optional and MAY be `""`: chora-web's own contract note
 * (core/services/feature-flags.model.ts) records that legacy `add_ons` rows
 * predating tenancy migration 0021 carry no code. That is a real data
 * condition, not a wire fault, and this read-back counts those rows rather
 * than dropping them.
 */
export interface EntitlementRowWire {
  readonly addon_code?: string;
  readonly status: string;
}

/** Wire shape of `GET /api/feature-flags`. */
export interface EntitlementsReadbackWire {
  readonly items?: readonly EntitlementRowWire[];
  readonly total?: number;
}

/**
 * What step 2 renders. `codes` is verbatim and in server order: the wizard's
 * hardcoded catalogue supplies a label where it knows the code, and shows the
 * raw code where it does not, so a grant the catalogue has not caught up with
 * is still visible.
 */
export interface EntitlementsReadback {
  readonly codes: readonly string[];
  /**
   * Granted rows whose `addon_code` was absent or empty. Reported, never
   * silently dropped: an operator reading "3 add-ons" when 4 are granted has
   * been told something false about their own organisation.
   */
  readonly uncodedCount: number;
}

/**
 * Discriminated outcome, mirroring the shape the wizard's sibling services
 * use so step 2 switches on `kind` and stays out of HTTP minutiae.
 */
export type EntitlementsReadbackResult =
  | { readonly kind: 'success'; readonly readback: EntitlementsReadback }
  | { readonly kind: 'no-active-tenant' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

/**
 * The gateway's code when it cannot resolve a tenant for this read
 * (`gatewayproxy.GetFeatureFlags`, HTTP 400). Distinct from the sibling
 * wizard services' `GATEWAY_NO_ACTIVE_TENANT` (HTTP 409), and both mean the
 * same thing to an operator: there is no organisation in this session.
 */
export const TENANT_NOT_RESOLVED_CODE = 'GATEWAY_TENANT_NOT_RESOLVED';
