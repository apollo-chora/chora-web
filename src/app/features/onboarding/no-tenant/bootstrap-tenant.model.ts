/**
 * BootstrapTenant — H+ Setup-Tenant Phase 4 MVP (CHO-1642).
 *
 * Wire shapes for `POST /api/v1/tenants/bootstrap` defined in
 * `chora-contracts/openapi/tenancy-admin.yaml` v1.3.0
 * (BootstrapTenantRequest / BootstrapTenantResponse / Conflict /
 * ValidationError responses).
 */

/** Request body — matches OpenAPI `BootstrapTenantRequest`. */
export interface BootstrapTenantRequest {
  /** 3..256 chars, trimmed, non-empty. */
  readonly name: string;
}

/** 201 success body — matches OpenAPI `BootstrapTenantResponse`. */
export interface BootstrapTenantResponse {
  readonly tenant_id: string;
  readonly owner_member_id: string;
  readonly entitlement_id: string;
  readonly created_at: string;
}

/**
 * Discriminated union the service surfaces to the component. The
 * component stays out of HTTP minutiae and switches on `kind`.
 */
export type BootstrapTenantResult =
  | { readonly kind: 'success'; readonly response: BootstrapTenantResponse }
  | { readonly kind: 'already-member' }
  | { readonly kind: 'invalid-name'; readonly message: string }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

/** Path constant — keep in lockstep with the OpenAPI contract. */
export const BOOTSTRAP_TENANT_PATH = '/api/v1/tenants/bootstrap';
