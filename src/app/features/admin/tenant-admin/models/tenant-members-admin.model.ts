/**
 * TenantMembersAdmin — H+ Members roster wire shapes (L1 Tenant lane,
 * CHO-1709).
 *
 * Source of truth:
 *   - `chora-contracts/openapi/identity-admin.yaml` v1.4.0
 *     (`searchTenantMembers` / `addTenantMemberByEmail` /
 *     `changeTenantMemberRole`)
 *   - `chora-contracts/openapi/bff-gateway.yaml` v0.6.0 (proxy surfaces)
 *   - chora-identity `tenant_members_admin_handler.go` (CHO-1707)
 *
 * The identity service emits a FLAT error envelope `{code, message}`
 * (NOT the nested `{error:{...}}` shape) — `classify()` reads `code`
 * off the flat body. Roles arrive UPPERCASE (canonical, ADR-141);
 * the roster renders the lowercase label keys that already exist under
 * `hplus.members.role.*`.
 */

/** Collection path — GET roster + POST add-by-email. */
export const ADMIN_TENANT_MEMBERS_PATH = '/api/v1/admin/tenant-members';

/** Item path builder — PATCH {gcid}/role. */
export function adminTenantMemberRolePath(gcid: string): string {
  return `${ADMIN_TENANT_MEMBERS_PATH}/${gcid}/role`;
}

/**
 * Multi-role REPLACE editor path — PUT {gcid}/roles (CHO-1809 follow-up).
 * Body: `{roles: ['LEARNER', 'INSTRUCTOR']}` — full role set.
 * chora-tenancy soft-deletes existing live rows NOT in `roles`; the
 * mirror does the same. Returns the full updated `TenantMemberSummary`.
 */
export function adminTenantMemberRolesPath(gcid: string): string {
  return `${ADMIN_TENANT_MEMBERS_PATH}/${gcid}/roles`;
}

/** PUT {gcid}/roles request body. */
export interface SetTenantMemberRolesRequest {
  readonly roles: readonly TenantMemberRole[];
}

/**
 * Display-name editor path — PATCH {gcid}/display-name (CHO-1817
 * follow-up). Body: `{display_name: 'Anika Tan'}`. Returns the
 * updated TenantMemberSummary (roles[] may be empty in the response —
 * the editor doesn't touch role state).
 */
export function adminTenantMemberDisplayNamePath(gcid: string): string {
  return `${ADMIN_TENANT_MEMBERS_PATH}/${gcid}/display-name`;
}

/** PATCH {gcid}/display-name request body. */
export interface SetTenantMemberDisplayNameRequest {
  readonly display_name: string;
}

/**
 * Grantable membership roles on the wire (UPPERCASE canonical, ADR-141).
 * LEARNER..AUDITOR map 1:1 to a `membership_role`; TRAINING_ADMIN is a label
 * alias the BE resolves to INSTRUCTOR (role_catalog mig 0014). OWNER /
 * PLATFORM_OPERATOR are JWT-only and not grantable here.
 */
export type TenantMemberRole =
  | 'LEARNER'
  | 'AUTHOR'
  | 'INSTRUCTOR'
  | 'ADMIN'
  | 'AUDITOR'
  | 'TRAINING_ADMIN';

export const TENANT_MEMBER_ROLES: readonly TenantMemberRole[] = [
  'LEARNER',
  'AUTHOR',
  'INSTRUCTOR',
  'ADMIN',
  'AUDITOR',
  'TRAINING_ADMIN',
];

/** Enriched member projection (TenantMemberSummary). */
export interface TenantMemberSummary {
  readonly gcid: string;
  readonly email: string;
  readonly display_name: string;
  /** Single-role membership — arrives as a one-element UPPERCASE array. */
  readonly roles: readonly string[];
  readonly last_active_at: string;
}

/** GET roster response envelope. */
export interface TenantMembersSearchResponse {
  readonly items: readonly TenantMemberSummary[];
  readonly next_page_token?: string | null;
  readonly total?: number;
}

/** POST add-by-email request body. */
export interface AddTenantMemberRequest {
  readonly email: string;
  readonly role: TenantMemberRole;
}

/** Discriminated result for the roster read. */
export type TenantMembersListResult =
  | { readonly kind: 'success'; readonly rows: readonly TenantMemberSummary[] }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

/**
 * One managed tenant (franchise) an operator can target for a cross-tenant
 * invite — a row from the operator-only managed-tenant directory. The
 * directory carries no member count (unlike the deletion hierarchy), so the
 * picker labels by name alone.
 */
export interface ManagedTenant {
  readonly id: string;
  readonly name: string;
}

/** Discriminated result for the operator managed-tenant directory read. */
export type ManagedTenantsListResult =
  | { readonly kind: 'success'; readonly tenants: readonly ManagedTenant[] }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

/**
 * Why an ownership refusal is its own result kind (S7-B1 / UX refactor R21).
 *
 * The backend refuses to strip or empty tenant ownership with 409 and a named
 * code. Both of the older classifiers would have hidden that: every 409 folded
 * into `duplicate` for mutations, and into `server-error` for acks. The admin
 * would be told "already a member" or "something broke" about a refusal they
 * can act on by handing ownership over.
 *
 * `last-owner`  the member holds the tenant's only owner row, so removing them
 *               would leave the organisation unowned.
 * `owner-role`  the requested role set would drop their owner row, and no API
 *               can grant it back.
 */
export type OwnerProtectedReason = 'last-owner' | 'owner-role';

/**
 * Discriminated result for add + role-change mutations. The business-rule
 * rejections the modal renders inline:
 *   - `user-not-found`   404 IDENTITY_USER_NOT_FOUND (must register first)
 *   - `duplicate`        409 IDENTITY_MEMBERSHIP_DUPLICATE
 *   - `owner-protected`  409 IDENTITY_{LAST_OWNER,OWNER_ROLE}_PROTECTED
 */
export type TenantMemberMutationResult =
  | { readonly kind: 'success'; readonly member: TenantMemberSummary }
  | { readonly kind: 'user-not-found' }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'owner-protected'; readonly reason: OwnerProtectedReason }
  | { readonly kind: 'invalid'; readonly code: string }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

// =====================================================================
// WS4 / ADR-194 — operator cross-tenant grant (D1) + cold-invite (D2)
// + member-remove (WS2b). Source of truth:
//   - chora-contracts/openapi/identity-admin.yaml (grantTenantMembership
//     :164, removeTenantMember :403) + bff-gateway.yaml v0.7.3
//     (gatewayGrantTenantMembership :1732, tenant-invites :1751-1807,
//     tenant-members/{gcid} DELETE :1710)
//   - chora-identity tenant_invites_handler.go (the discriminated
//     `kind:"granted"|"invited"` create response)
// All emit the FLAT `{code, message}` envelope (classify reads `code`).
// =====================================================================

/**
 * chora-master tenant — fixed UUIDv7 (ADR-182 two-tier tenancy). The
 * operator's default cross-tenant target ("Chora main").
 */
export const CHORA_MASTER_TENANT_ID = '00000000-0000-7000-8000-000000000001';

/** Operator cross-tenant grant collection — POST {gcid, tenant_id, roles[]}. */
export const ADMIN_TENANT_MEMBERSHIPS_PATH = '/api/v1/admin/tenant-memberships';

/** Cold-invite collection — GET list + POST create/unify-with-grant. */
export const ADMIN_TENANT_INVITES_PATH = '/api/v1/admin/tenant-invites';

/**
 * Operator managed-tenant directory — GET the recursive franchise subtree
 * (MASTER / platform_operator ONLY). This is the correct source for the
 * operator invite-target picker: it returns chora-master's whole descendant
 * subtree regardless of the operator's current session tenant, whereas
 * `/current/hierarchy` returns only the CURRENT tenant's direct children —
 * always empty for an operator (a member of leaf franchises only, ADR-217).
 */
export const ADMIN_FRANCHISEES_PATH = '/api/v1/admin/transactions/franchisees';

/** Cold-invite item path — DELETE revoke (204; 404 if not pending). */
export function adminTenantInvitePath(inviteId: string): string {
  return `${ADMIN_TENANT_INVITES_PATH}/${inviteId}`;
}

/**
 * Member-remove item path — DELETE {gcid} (WS2b). Soft-deletes every live
 * role for (gcid, caller tenant) in both stores. NB the same base path as
 * the roster collection, with the gcid appended (distinct from the
 * `/role` and `/roles` sub-paths).
 */
export function adminTenantMemberPath(gcid: string): string {
  return `${ADMIN_TENANT_MEMBERS_PATH}/${gcid}`;
}

/** POST /tenant-memberships body — operator cross-tenant grant (D1). */
export interface GrantTenantMembershipRequest {
  readonly gcid: string;
  readonly tenant_id: string;
  readonly roles: readonly TenantMemberRole[];
}

/**
 * Bare TenantMembership row — the grant response and the `granted` branch
 * of the unified create-invite response (contract `TenantMembership`).
 */
export interface TenantMembershipRow {
  readonly membership_id: string;
  readonly gcid: string;
  readonly tenant_id: string;
  readonly roles: readonly string[];
  readonly granted_at: string;
  readonly revoked_at?: string | null;
}

/**
 * POST /tenant-invites body. A present `tenant_id` selects the operator
 * cross-tenant path (platform_operator, tenant from body); omit it for the
 * tenant-scoped admin path (tenant from the session JWT).
 */
export interface CreateTenantInviteRequest {
  readonly email: string;
  readonly roles: readonly TenantMemberRole[];
  readonly tenant_id?: string;
}

/**
 * Pending cold-invite projection — a `GET /tenant-invites` list item and
 * the `invited` branch of the create response. `status` is one of
 * pending|accepted|revoked|expired (list returns pending only).
 */
export interface PendingInvite {
  readonly invite_id: string;
  readonly email: string;
  readonly tenant_id: string;
  readonly roles: readonly string[];
  readonly status: string;
  readonly expires_at: string;
  readonly created_at: string;
}

/**
 * POST /tenant-invites discriminated response. An existing user is granted
 * immediately (`kind:"granted"`, retiring the old 404); a never-registered
 * email persists a pending invite (`kind:"invited"`) auto-applied at first
 * login.
 */
export type CreateInviteResponse =
  | ({ readonly kind: 'granted' } & TenantMembershipRow)
  | ({ readonly kind: 'invited' } & PendingInvite);

/** GET /tenant-invites list envelope. */
export interface PendingInvitesListResponse {
  readonly items: readonly PendingInvite[];
}

/** grantMembership() discriminated result. */
export type GrantMembershipResult =
  | { readonly kind: 'success'; readonly membership: TenantMembershipRow }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'invalid'; readonly code: string }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

/**
 * createInvite() result — the two success branches mirror the server's
 * `kind` discriminator (`granted` = existing user added now; `invited` =
 * cold pending invite). 409 ⇒ duplicate (pending invite already exists /
 * membership suspended).
 */
export type CreateInviteResult =
  | { readonly kind: 'granted'; readonly membership: TenantMembershipRow }
  | { readonly kind: 'invited'; readonly invite: PendingInvite }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'invalid'; readonly code: string }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

/** listInvites() result. */
export type InvitesListResult =
  | { readonly kind: 'success'; readonly invites: readonly PendingInvite[] }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

/** revokeInvite() + removeMember() share a simple ack / not-found result. */
export type AdminAckResult =
  | { readonly kind: 'success' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'owner-protected'; readonly reason: OwnerProtectedReason }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };
