/**
 * RBAC admin models for the User Access Matrix.
 *
 * Source of truth: chora-contracts/openapi/identity-admin.yaml
 * These interfaces model the 11 RBAC roles and their capabilities
 * for tenant-scoped user role management.
 */

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export type RbacRole =
  | 'learner'
  | 'instructor'
  | 'content_author'
  | 'content_reviewer'
  | 'assessor'
  | 'tenant_admin'
  | 'support_agent'
  | 'analytics_viewer'
  | 'finance_admin'
  | 'platform_ops'
  | 'super_admin';

export const ALL_RBAC_ROLES: RbacRole[] = [
  'learner',
  'instructor',
  'content_author',
  'content_reviewer',
  'assessor',
  'tenant_admin',
  'support_agent',
  'analytics_viewer',
  'finance_admin',
  'platform_ops',
  'super_admin',
];

export const ROLE_LABELS: Record<RbacRole, string> = {
  learner: 'admin.rbac.role_learner',
  instructor: 'admin.rbac.role_instructor',
  content_author: 'admin.rbac.role_content_author',
  content_reviewer: 'admin.rbac.role_content_reviewer',
  assessor: 'admin.rbac.role_assessor',
  tenant_admin: 'admin.rbac.role_tenant_admin',
  support_agent: 'admin.rbac.role_support_agent',
  analytics_viewer: 'admin.rbac.role_analytics_viewer',
  finance_admin: 'admin.rbac.role_finance_admin',
  platform_ops: 'admin.rbac.role_platform_ops',
  super_admin: 'admin.rbac.role_super_admin',
};

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export interface Capability {
  code: string;
  label: string;
  description: string;
}

export interface RoleCapabilities {
  role: RbacRole;
  capabilities: Capability[];
}

// ---------------------------------------------------------------------------
// Effective Permissions
// ---------------------------------------------------------------------------

export interface EffectivePermission {
  capability: string;
  grantedBy: RbacRole[];
}

export interface EffectivePermissionsResponse {
  gcid: string;
  permissions: EffectivePermission[];
}

// ---------------------------------------------------------------------------
// Tenant User with roles
// ---------------------------------------------------------------------------

export interface TenantUser {
  gcid: string;
  email: string;
  displayName: string;
  roles: RbacRole[];
  lastActiveAt: string;
  createdAt: string;
}

export interface TenantUserListResponse {
  users: TenantUser[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Role Assignment / Revocation
// ---------------------------------------------------------------------------

export interface RoleAssignmentRequest {
  gcid: string;
  role: RbacRole;
}

export interface RoleRevocationRequest {
  gcid: string;
  role: RbacRole;
}
