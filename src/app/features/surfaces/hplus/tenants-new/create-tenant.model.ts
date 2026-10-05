/**
 * Create-organisation wire types (UX Track U, package E1, screen S2).
 *
 * Mirrors `CreateSubTenantRequest` in `chora-contracts/openapi/tenancy-admin.yaml`
 * and the gateway's `createSubTenantBody`. Field names are the wire names on
 * purpose: this body reaches chora-tenancy's `Tenancy/CreateSubTenant` through a
 * proxy that does not rename anything.
 */

/** The one create route. Operator-gated at the gateway, JWT-gated in `DefaultJWTGatedPrefixes`. */
export const SUB_TENANTS_PATH = '/api/v1/tenancy/sub-tenants';

/**
 * chora-master, the root every v1 organisation hangs off. Read-only in the UI:
 * nested parents are a horizon per ADR-217, and the field exists on the wire
 * because the backend already supports what the UI does not yet offer.
 */
export const CHORA_MASTER_TENANT_ID = '00000000-0000-7000-8000-000000000001';

/**
 * The domain layer refuses a name under three characters
 * (`bootstrap.go` Input validation) while the gateway checks only non-empty and
 * 256. The UI holds the stricter floor so the operator learns it here rather
 * than through an upstream refusal that names no field.
 */
export const DISPLAY_NAME_MIN = 3;
export const DISPLAY_NAME_MAX = 256;

export type HostingMode =
  | 'PLATFORM_HOSTED'
  | 'WHITE_LABEL'
  | 'FRANCHISE'
  | 'SELF_HOST';

export const HOSTING_MODES: readonly HostingMode[] = [
  'PLATFORM_HOSTED',
  'WHITE_LABEL',
  'FRANCHISE',
  'SELF_HOST',
];

/** Franchise is the default the backend also assumes for an empty value. */
export const DEFAULT_HOSTING_MODE: HostingMode = 'FRANCHISE';

export interface CreateSubTenantRequest {
  readonly parent_tenant_id: string;
  readonly display_name: string;
  readonly hosting_mode: string;
  readonly owner_gcid: string;
  readonly add_on_codes: readonly string[];
}

/** The 201 body. chora-tenancy returns the created tenant, not a bare id. */
export interface CreatedTenant {
  readonly tenant_id: string;
  readonly display_name?: string;
  readonly hosting_mode?: string;
  readonly parent_tenant_id?: string;
}

/**
 * Where "continue setup" goes.
 *
 * E5 moved the wizard onto this surface, so this now points at `/h/setup`,
 * gated by the same `platformOperatorGuard` this screen uses. The old admin
 * path redirects here, so an older link still lands correctly. The spec beside
 * this file asserts the path against the H+ route table rather than trusting
 * the string, which is what made the move safe to do in one pass.
 */
export const CONTINUE_SETUP_PATH = '/h/setup';

export const CREATE_TENANT_ERROR_FALLBACK = 'hplus.tenants_new.errors.unexpected';

/**
 * Envelope code to copy key.
 *
 * These are the codes `writeSubTenantErr` and `validateSubTenant` actually
 * emit, checked against the handler rather than assumed. Note what is absent:
 * there is no distinct code for an unknown add-on code. Local validation and an
 * upstream InvalidArgument both land as `GATEWAY_INVALID_REQUEST`, so the code
 * alone cannot say which field was wrong and the screen shows the envelope's
 * message beside the mapped copy. The picker offers only catalogue codes, so a
 * rejected add-on from this screen means the catalogue and the table have
 * drifted, not that the operator mistyped.
 */
export const CREATE_TENANT_ERROR_KEYS: Readonly<Record<string, string>> = {
  GATEWAY_INVALID_REQUEST: 'hplus.tenants_new.errors.invalid',
  GATEWAY_UNAUTHENTICATED: 'hplus.tenants_new.errors.unauthenticated',
  GATEWAY_FORBIDDEN: 'hplus.tenants_new.errors.forbidden',
  GATEWAY_NOT_FOUND: 'hplus.tenants_new.errors.parent_precondition',
  GATEWAY_PRECONDITION_FAILED: 'hplus.tenants_new.errors.parent_precondition',
  GATEWAY_ALREADY_EXISTS: 'hplus.tenants_new.errors.already_exists',
  GATEWAY_UPSTREAM_UNAVAILABLE: 'hplus.tenants_new.errors.upstream',
  GATEWAY_UPSTREAM_ERROR: CREATE_TENANT_ERROR_FALLBACK,
};

/** Status fallback for a body that carries no recognised code. */
export const CREATE_TENANT_STATUS_KEYS: Readonly<Record<number, string>> = {
  400: 'hplus.tenants_new.errors.invalid',
  401: 'hplus.tenants_new.errors.unauthenticated',
  403: 'hplus.tenants_new.errors.forbidden',
  404: 'hplus.tenants_new.errors.parent_precondition',
  409: 'hplus.tenants_new.errors.already_exists',
  503: 'hplus.tenants_new.errors.upstream',
};
