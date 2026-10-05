/**
 * RbacAdminService — REST adapter for tenant RBAC management.
 *
 * Source of truth: chora-contracts/openapi/iam.yaml
 * All HTTP calls go through BffClientService.
 *
 * Endpoints:
 *   GET  /api/v1/rbac/capabilities       — list all capabilities by role
 *   GET  /api/v1/rbac/effective-permissions?gcid={gcid} — effective permissions for a user
 *   GET  /api/v1/admin/users              — list tenant users with roles
 *   POST /api/v1/admin/users/roles        — assign role to user
 *   DELETE /api/v1/admin/users/roles/{role}?gcid={gcid} — revoke role from user
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  RoleCapabilities,
  EffectivePermissionsResponse,
  TenantUserListResponse,
  RoleAssignmentRequest,
  RbacRole,
} from '../models/rbac.model';

const CAPABILITIES_PATH = '/api/v1/rbac/capabilities';
const EFFECTIVE_PERMISSIONS_PATH = '/api/v1/rbac/effective-permissions';
const ADMIN_USERS_PATH = '/api/v1/admin/users';
const ADMIN_USERS_ROLES_PATH = '/api/v1/admin/users/roles';

@Injectable({ providedIn: 'root' })
export class RbacAdminService {
  private readonly bff = inject(BffClientService);

  // -------------------------------------------------------------------------
  // Capabilities
  // -------------------------------------------------------------------------

  /**
   * List all capabilities grouped by role.
   * GET /api/v1/rbac/capabilities
   */
  getCapabilities(): Observable<RoleCapabilities[]> {
    return this.bff.get<RoleCapabilities[]>(CAPABILITIES_PATH);
  }

  // -------------------------------------------------------------------------
  // Effective Permissions
  // -------------------------------------------------------------------------

  /**
   * Get effective permissions for a specific user.
   * GET /api/v1/rbac/effective-permissions?gcid={gcid}
   */
  getEffectivePermissions(gcid: string): Observable<EffectivePermissionsResponse> {
    const params = new HttpParams().set('gcid', gcid);
    return this.bff.get<EffectivePermissionsResponse>(EFFECTIVE_PERMISSIONS_PATH, params);
  }

  // -------------------------------------------------------------------------
  // Tenant Users
  // -------------------------------------------------------------------------

  /**
   * List users within the current tenant, including their roles.
   * GET /api/v1/admin/users?page={page}&pageSize={pageSize}&search={search}
   */
  getUsers(page = 1, pageSize = 25, search?: string): Observable<TenantUserListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    if (search) {
      params = params.set('search', search);
    }

    return this.bff.get<TenantUserListResponse>(ADMIN_USERS_PATH, params);
  }

  // -------------------------------------------------------------------------
  // Role Assignment / Revocation
  // -------------------------------------------------------------------------

  /**
   * Assign a role to a user.
   * POST /api/v1/admin/users/roles
   */
  assignRole(request: RoleAssignmentRequest): Observable<void> {
    return this.bff.post<void>(ADMIN_USERS_ROLES_PATH, request);
  }

  /**
   * Revoke a role from a user.
   * DELETE /api/v1/admin/users/roles/{role}?gcid={gcid}
   */
  revokeRole(gcid: string, role: RbacRole): Observable<void> {
    return this.bff.delete<void>(`${ADMIN_USERS_ROLES_PATH}/${encodeURIComponent(role)}?gcid=${encodeURIComponent(gcid)}`);
  }
}
