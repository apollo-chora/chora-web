/**
 * TenantIdpAdmin — wire shapes for the H+ IdP Federation admin surface
 * (CHO-1694 Wave 4).
 *
 * Source of truth:
 *   - chora-contracts/openapi/identity-admin.yaml v1.3 —
 *       listMyTenantIdpProviders / upsertMyTenantIdpProvider /
 *       deleteMyTenantIdpProvider
 *   - services/chora-identity/internal/adapter/http/me_idp_providers_handler.go
 *
 * `client_secret` is `writeOnly` per the contract — sent on upsert,
 * NEVER returned on list. The `HydrationIdentity` invariant from
 * CHO-1692 carries over: the FE never holds a plaintext secret in
 * memory after an upsert succeeds.
 */

export type ProviderType = 'oidc' | 'saml' | 'singpass';

/** One row from the list / upsert response. Mirrors `TenantIdpProviderResponse`. */
export interface IdpProviderRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly provider_type: ProviderType;
  readonly client_id?: string;
  readonly client_secret_name?: string;
  readonly discovery_url?: string;
  readonly singpass_enabled: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

/** GET list response envelope. `items` is ALWAYS present (possibly empty). */
export interface IdpProviderListResponse {
  readonly items: ReadonlyArray<IdpProviderRow>;
}

/** POST upsert payload. */
export interface IdpProviderUpsertPayload {
  readonly provider_type: ProviderType;
  readonly client_id?: string;
  /** Plaintext — stored in Secret Manager server-side, never echoed back. */
  readonly client_secret?: string;
  readonly discovery_url?: string;
  readonly singpass_enabled?: boolean;
}

/** Path constants. */
export const IDP_PROVIDERS_BASE_PATH = '/api/v1/tenants/me/idp-providers';
export const idpProviderDeletePath = (providerType: ProviderType): string =>
  `${IDP_PROVIDERS_BASE_PATH}/${encodeURIComponent(providerType)}`;

/**
 * Discriminated result the service surfaces to the component.
 * Component stays out of HTTP minutiae and switches on `kind`.
 */
export type IdpListResult =
  | { readonly kind: 'success'; readonly rows: ReadonlyArray<IdpProviderRow> }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

export type IdpUpsertResult =
  | { readonly kind: 'success'; readonly row: IdpProviderRow }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'secret-manager-failed'; readonly message: string }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

export type IdpDeleteResult =
  | { readonly kind: 'success' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };
