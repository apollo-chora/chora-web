/**
 * TenantMembersAdminService — H+ Members roster + add-by-email + role
 * change (L1 Tenant lane, CHO-1709).
 *
 * Three methods over the CHO-1708 gateway proxies:
 *  - `roster(q?)`            — GET  /api/v1/admin/tenant-members
 *  - `add(email, role)`      — POST /api/v1/admin/tenant-members
 *  - `changeRole(gcid, role)`— PATCH /api/v1/admin/tenant-members/{gcid}/role
 *
 * Per chora-web/CLAUDE.md §3 (BFF-only): all HTTP goes through
 * BffClientService. The identity service emits a FLAT `{code, message}`
 * error envelope — classify() discriminates the two business rejections
 * the invite modal renders inline (user-not-found / duplicate).
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import {
  HttpErrorView,
  httpErrorView,
} from '../../../../core/interceptors/api-error.model';
import { EMPTY, Observable, catchError, expand, map, of, reduce } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  ADMIN_FRANCHISEES_PATH,
  ADMIN_TENANT_INVITES_PATH,
  ADMIN_TENANT_MEMBERS_PATH,
  ADMIN_TENANT_MEMBERSHIPS_PATH,
  AddTenantMemberRequest,
  AdminAckResult,
  CreateInviteResponse,
  CreateInviteResult,
  CreateTenantInviteRequest,
  GrantMembershipResult,
  GrantTenantMembershipRequest,
  InvitesListResult,
  ManagedTenant,
  ManagedTenantsListResult,
  PendingInvitesListResponse,
  SetTenantMemberDisplayNameRequest,
  SetTenantMemberRolesRequest,
  OwnerProtectedReason,
  TenantMemberMutationResult,
  TenantMemberRole,
  TenantMembershipRow,
  TenantMemberSummary,
  TenantMembersListResult,
  TenantMembersSearchResponse,
  adminTenantInvitePath,
  adminTenantMemberDisplayNamePath,
  adminTenantMemberPath,
  adminTenantMemberRolePath,
  adminTenantMemberRolesPath,
} from '../models/tenant-members-admin.model';

/** One page of the operator franchisee directory (GET /admin/transactions/franchisees). */
interface FranchiseeDirectoryResponse {
  readonly franchisees?: readonly {
    readonly tenant_id: string;
    readonly name?: string | null;
  }[];
  readonly next_page_token?: string | null;
}

/** Max page size the directory accepts (validPageSize on the gateway). */
const FRANCHISEE_DIRECTORY_PAGE_SIZE = '100';

@Injectable({ providedIn: 'root' })
export class TenantMembersAdminService {
  private readonly bff = inject(BffClientService);

  roster(q?: string): Observable<TenantMembersListResult> {
    const path = q?.trim()
      ? `${ADMIN_TENANT_MEMBERS_PATH}?q=${encodeURIComponent(q.trim())}`
      : ADMIN_TENANT_MEMBERS_PATH;
    return this.bff.get<TenantMembersSearchResponse>(path).pipe(
      map(
        (response): TenantMembersListResult => ({
          kind: 'success',
          rows: response?.items ?? [],
        }),
      ),
      catchError((err: unknown) => of(this.classifyList(err))),
    );
  }

  add(email: string, role: TenantMemberRole): Observable<TenantMemberMutationResult> {
    const body: AddTenantMemberRequest = { email, role };
    return this.bff
      .post<TenantMemberSummary>(ADMIN_TENANT_MEMBERS_PATH, body)
      .pipe(
        map((member): TenantMemberMutationResult => ({ kind: 'success', member })),
        catchError((err: unknown) => of(this.classifyMutation(err))),
      );
  }

  changeRole(gcid: string, role: TenantMemberRole): Observable<TenantMemberMutationResult> {
    return this.bff
      .patch<TenantMemberSummary>(adminTenantMemberRolePath(gcid), { role })
      .pipe(
        map((member): TenantMemberMutationResult => ({ kind: 'success', member })),
        catchError((err: unknown) => of(this.classifyMutation(err))),
      );
  }

  /**
   * Multi-role REPLACE: PUT /api/v1/admin/tenant-members/{gcid}/roles
   * with the full target role set. chora-tenancy soft-deletes existing
   * live rows NOT in the request set; the chora-identity mirror does
   * the same. Returns the updated `TenantMemberSummary` carrying the
   * full active role list. CHO-1809 follow-up.
   */
  setRoles(
    gcid: string,
    roles: readonly TenantMemberRole[],
  ): Observable<TenantMemberMutationResult> {
    const body: SetTenantMemberRolesRequest = { roles };
    return this.bff
      .put<TenantMemberSummary>(adminTenantMemberRolesPath(gcid), body)
      .pipe(
        map((member): TenantMemberMutationResult => ({ kind: 'success', member })),
        catchError((err: unknown) => of(this.classifyMutation(err))),
      );
  }

  /**
   * Display-name editor — PATCH /api/v1/admin/tenant-members/{gcid}/display-name
   * with `{display_name: '...'}`. Returns the updated summary; the BE may
   * emit roles=[] in the response since this editor doesn't touch role
   * state. CHO-1817 follow-up.
   */
  setDisplayName(
    gcid: string,
    displayName: string,
  ): Observable<TenantMemberMutationResult> {
    const body: SetTenantMemberDisplayNameRequest = { display_name: displayName };
    return this.bff
      .patch<TenantMemberSummary>(adminTenantMemberDisplayNamePath(gcid), body)
      .pipe(
        map((member): TenantMemberMutationResult => ({ kind: 'success', member })),
        catchError((err: unknown) => of(this.classifyMutation(err))),
      );
  }

  /**
   * List the operator's managed tenants (franchises) for the cross-tenant
   * invite-target picker — GET /api/v1/admin/transactions/franchisees
   * (MASTER / platform_operator ONLY). The directory is recursive over
   * chora-master's whole descendant subtree, independent of the operator's
   * current session tenant — the CORRECT source for the picker, because an
   * operator is a member of leaf franchises only (so `/current/hierarchy`,
   * the current tenant's direct children, is always empty for them; ADR-217).
   *
   * Pages the FULL directory (page_size=100 following `next_page_token`) so
   * the picker `<select>` never silently truncates. Fail-loud: a transport
   * error classifies to a non-success kind the picker renders as an error
   * hint, never a silent empty list.
   */
  listManagedTenants(): Observable<ManagedTenantsListResult> {
    const fetchPage = (
      token: string | null,
    ): Observable<FranchiseeDirectoryResponse> => {
      let params = new HttpParams().set('page_size', FRANCHISEE_DIRECTORY_PAGE_SIZE);
      if (token) params = params.set('page_token', token);
      return this.bff.get<FranchiseeDirectoryResponse>(ADMIN_FRANCHISEES_PATH, params);
    };
    return fetchPage(null).pipe(
      expand((res) => (res.next_page_token ? fetchPage(res.next_page_token) : EMPTY)),
      reduce((acc: ManagedTenant[], res) => {
        for (const f of res.franchisees ?? []) {
          acc.push({ id: f.tenant_id, name: (f.name ?? '').trim() || f.tenant_id });
        }
        return acc;
      }, []),
      map((tenants): ManagedTenantsListResult => ({ kind: 'success', tenants })),
      catchError((err: unknown) => of(this.classifyManagedTenants(err))),
    );
  }

  // ── WS4 / ADR-194 — operator grant + cold-invite + member-remove ─────

  /**
   * Operator cross-tenant grant — POST /api/v1/admin/tenant-memberships
   * (ADR-194 D1). The body carries the TARGET `tenant_id` (not the session
   * tenant); the caller MUST hold `platform_operator`. RLS stays ENFORCED
   * server-side (the write runs inside `RunInTenantTx(tenant_id)`) — this
   * is NOT an RLS bypass. Returns the bare TenantMembership row.
   */
  grantMembership(
    gcid: string,
    tenantId: string,
    roles: readonly TenantMemberRole[],
  ): Observable<GrantMembershipResult> {
    const body: GrantTenantMembershipRequest = {
      gcid,
      tenant_id: tenantId,
      roles,
    };
    return this.bff
      .post<TenantMembershipRow>(ADMIN_TENANT_MEMBERSHIPS_PATH, body)
      .pipe(
        map((membership): GrantMembershipResult => ({ kind: 'success', membership })),
        catchError((err: unknown) => of(this.classifyGrant(err))),
      );
  }

  /**
   * Unified add-by-email + cold-invite — POST /api/v1/admin/tenant-invites
   * (ADR-194 D2). An existing user is granted NOW (`{kind:'granted'}`); a
   * never-registered email persists a pending invite the resolve seam
   * auto-applies at first login (`{kind:'invited'}`) — retiring the old 404
   * user-not-found dead-end. A `tenantId` selects the operator cross-tenant
   * path (`platform_operator`; tenant from body); omit it for the
   * tenant-scoped admin path (tenant from the session JWT). This SUPERSEDES
   * `add()` for the H+ add-member UI.
   */
  createInvite(
    email: string,
    roles: readonly TenantMemberRole[],
    tenantId?: string,
  ): Observable<CreateInviteResult> {
    const body: CreateTenantInviteRequest = tenantId
      ? { email, roles, tenant_id: tenantId }
      : { email, roles };
    return this.bff
      .post<CreateInviteResponse>(ADMIN_TENANT_INVITES_PATH, body)
      .pipe(
        map((res): CreateInviteResult =>
          res.kind === 'granted'
            ? { kind: 'granted', membership: res }
            : { kind: 'invited', invite: res },
        ),
        catchError((err: unknown) => of(this.classifyInvite(err))),
      );
  }

  /**
   * List pending cold-invites for the caller's tenant —
   * GET /api/v1/admin/tenant-invites (tenant-scoped; the BFF stamps
   * `X-Tenant-Id` from the session JWT).
   */
  listInvites(): Observable<InvitesListResult> {
    return this.bff
      .get<PendingInvitesListResponse>(ADMIN_TENANT_INVITES_PATH)
      .pipe(
        map((res): InvitesListResult => ({
          kind: 'success',
          invites: res?.items ?? [],
        })),
        catchError((err: unknown) => of(this.classifyInvitesList(err))),
      );
  }

  /** Revoke a pending invite — DELETE /tenant-invites/{inviteId} (204). */
  revokeInvite(inviteId: string): Observable<AdminAckResult> {
    return this.bff.delete<void>(adminTenantInvitePath(inviteId)).pipe(
      map((): AdminAckResult => ({ kind: 'success' })),
      catchError((err: unknown) => of(this.classifyAck(err))),
    );
  }

  /**
   * Remove a member from the caller's tenant — DELETE /tenant-members/{gcid}
   * (WS2b, 204). Soft-deletes every live role for (gcid, session tenant) in
   * both stores; 404 when the member holds no live membership here (already
   * removed / cross-tenant). NEVER hard-deletes.
   */
  removeMember(gcid: string): Observable<AdminAckResult> {
    return this.bff.delete<void>(adminTenantMemberPath(gcid)).pipe(
      map((): AdminAckResult => ({ kind: 'success' })),
      catchError((err: unknown) => of(this.classifyAck(err))),
    );
  }

  private classifyList(err: unknown): TenantMembersListResult {
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
        return { kind: 'unauthenticated' };
      case 403:
        return { kind: 'forbidden' };
      default:
        return { kind: 'server-error' };
    }
  }

  private classifyMutation(err: unknown): TenantMemberMutationResult {
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
        return { kind: 'unauthenticated' };
      case 403:
        return { kind: 'forbidden' };
      case 404:
        return { kind: 'user-not-found' };
      case 409:
        return this.ownerRefusal(view) ?? { kind: 'duplicate' };
      case 400:
      case 422:
        return { kind: 'invalid', code: this.flatCode(view) };
      default:
        return { kind: 'server-error' };
    }
  }

  private classifyGrant(err: unknown): GrantMembershipResult {
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
        return { kind: 'unauthenticated' };
      case 403:
        return { kind: 'forbidden' };
      case 404:
        return { kind: 'not-found' };
      case 409:
        return { kind: 'duplicate' };
      case 400:
      case 422:
        return { kind: 'invalid', code: this.flatCode(view) };
      default:
        return { kind: 'server-error' };
    }
  }

  private classifyInvite(err: unknown): CreateInviteResult {
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
        return { kind: 'unauthenticated' };
      case 403:
        return { kind: 'forbidden' };
      case 409:
        return { kind: 'duplicate' };
      case 400:
      case 422:
        return { kind: 'invalid', code: this.flatCode(view) };
      default:
        return { kind: 'server-error' };
    }
  }

  private classifyInvitesList(err: unknown): InvitesListResult {
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
        return { kind: 'unauthenticated' };
      case 403:
        return { kind: 'forbidden' };
      default:
        return { kind: 'server-error' };
    }
  }

  private classifyManagedTenants(err: unknown): ManagedTenantsListResult {
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
        return { kind: 'unauthenticated' };
      case 403:
        return { kind: 'forbidden' };
      default:
        return { kind: 'server-error' };
    }
  }

  private classifyAck(err: unknown): AdminAckResult {
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
        return { kind: 'unauthenticated' };
      case 403:
        return { kind: 'forbidden' };
      case 404:
        return { kind: 'not-found' };
      case 409:
        // Before S7-B1 there was no 409 arm here at all, so an ownership
        // refusal fell through to server-error and read as a platform fault.
        return this.ownerRefusal(view) ?? { kind: 'server-error' };
      default:
        return { kind: 'server-error' };
    }
  }

  /**
   * Recognises the two ownership refusals by their named code, returning null
   * for any other conflict so the caller keeps its existing behaviour. Keyed on
   * the code and not on the 409 itself: a duplicate membership is also a 409
   * and means something completely different, and a conflict this build does
   * not know must not be dressed up as an ownership problem.
   */
  private ownerRefusal(
    view: HttpErrorView,
  ): { kind: 'owner-protected'; reason: OwnerProtectedReason } | null {
    switch (this.flatCode(view)) {
      case 'IDENTITY_LAST_OWNER_PROTECTED':
        return { kind: 'owner-protected', reason: 'last-owner' };
      case 'IDENTITY_OWNER_ROLE_PROTECTED':
        return { kind: 'owner-protected', reason: 'owner-role' };
      default:
        return null;
    }
  }

  /** Reads `code` off the identity FLAT error envelope `{code, message}`. */
  private flatCode(err: HttpErrorView): string {
    const body: unknown = err.body;
    if (body && typeof body === 'object' && 'code' in body) {
      const code = (body as { code?: unknown }).code;
      if (typeof code === 'string') return code;
    }
    return 'IDENTITY_INVALID_BODY';
  }
}
