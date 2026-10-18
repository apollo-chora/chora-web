/**
 * TypeScript interfaces matching IAM OpenAPI schemas.
 * Source of truth: chora-contracts/openapi/auth-gateway.yaml
 */

export type AccountState = 'active' | 'suspended' | 'pending_deletion' | 'deleted' | 'merged';

export interface GlobalChoraID {
  id: string;
  email: string;
  display_name: string;
  account_state: AccountState;
  created_at: string;
  updated_at: string;
  avatar_url?: string | null;
  timezone?: string;
  language_code?: string;
}

export interface CreateGCIDRequest {
  email: string;
  display_name: string;
}

/**
 * Per-tenant membership returned inline by the mint endpoint after the
 * Stage-2 cutover (2026-05-14). Mirrors the Go shape
 * `clients.ResolveTenantMembership` in
 * services/chora-gateway/internal/adapter/clients/identity_resolve_client.go.
 */
export interface ResolveTenantMembership {
  tenant_id: string;
  tenant_slug: string;
  roles: string[];
  surfaces: string[];
  is_default: boolean;
}

export interface AuthTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  /**
   * Durable renewal credential for POST /api/v1/auth/session/refresh.
   * Persisted in localStorage by AuthService so the session survives
   * reloads; rotated on every refresh (the old value stops working).
   */
  refresh_token?: string;
  refresh_expires_in?: number;
  gcid: string;
  /**
   * Tenant memberships resolved during mint. Present after the Stage-2
   * cutover; absent on legacy responses (FE falls back to the
   * `/api/v1/tenants` round-trip when this is undefined). Also absent on
   * refresh responses — the SPA keeps its already-seeded tenant context.
   */
  memberships?: ResolveTenantMembership[];
}

export interface WebAuthnRegisterBeginRequest {
  gcid: string;
}

export interface WebAuthnRegistrationOptions {
  options: Record<string, unknown>;
}

export interface WebAuthnRegisterFinishRequest {
  gcid: string;
  attestation_response: Record<string, unknown>;
}

export interface WebAuthnCredentialResponse {
  id: string;
  gcid: string;
  created_at: string;
}

export interface WebAuthnLoginBeginRequest {
  email?: string;
}

export interface WebAuthnLoginOptions {
  options: Record<string, unknown>;
}

export interface WebAuthnLoginFinishRequest {
  assertion_response: Record<string, unknown>;
}

export interface TenantMembership {
  id: string;
  gcid: string;
  tenant_id: string;
  role: string;
  joined_at: string;
}

export interface TenantMembershipListResponse {
  items: TenantMembership[];
  pagination: CursorPagination;
}

export interface CursorPagination {
  next_cursor: string | null;
  has_more: boolean;
}
