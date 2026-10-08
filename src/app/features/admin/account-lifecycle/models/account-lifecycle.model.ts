/**
 * Account lifecycle models for the Admin Account Management Dashboard.
 *
 * Source of truth: chora-contracts/openapi/identity-admin.yaml
 * These interfaces model account states, lifecycle events,
 * and admin actions for the account management dashboard.
 */

// ---------------------------------------------------------------------------
// Account State
// ---------------------------------------------------------------------------

export type AccountState = 'active' | 'suspended' | 'pending_deletion' | 'deleted';

export const ALL_ACCOUNT_STATES: AccountState[] = [
  'active',
  'suspended',
  'pending_deletion',
  'deleted',
];

export const ACCOUNT_STATE_LABELS: Record<AccountState, string> = {
  active: 'admin.account_lifecycle.state_active',
  suspended: 'admin.account_lifecycle.state_suspended',
  pending_deletion: 'admin.account_lifecycle.state_pending_deletion',
  deleted: 'admin.account_lifecycle.state_deleted',
};

// ---------------------------------------------------------------------------
// Admin Account
// ---------------------------------------------------------------------------

export interface AdminAccount {
  gcid: string;
  email: string;
  displayName: string;
  state: AccountState;
  roles: string[];
  createdAt: string;
  updatedAt: string;
  suspendedAt?: string;
  deletionRequestedAt?: string;
  deletedAt?: string;
  suspensionReason?: string;
}

export interface AdminAccountListResponse {
  accounts: AdminAccount[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Lifecycle Events (Immutable Audit Trail)
// ---------------------------------------------------------------------------

export type LifecycleEventType =
  | 'account_created'
  | 'account_activated'
  | 'account_suspended'
  | 'account_reactivated'
  | 'account_deletion_requested'
  | 'account_deleted'
  | 'account_closed_by_admin'
  | 'role_assigned'
  | 'role_revoked'
  | 'password_reset'
  | 'email_changed';

export const LIFECYCLE_EVENT_LABELS: Record<LifecycleEventType, string> = {
  account_created: 'admin.account_lifecycle.event_account_created',
  account_activated: 'admin.account_lifecycle.event_account_activated',
  account_suspended: 'admin.account_lifecycle.event_account_suspended',
  account_reactivated: 'admin.account_lifecycle.event_account_reactivated',
  account_deletion_requested: 'admin.account_lifecycle.event_deletion_requested',
  account_deleted: 'admin.account_lifecycle.event_account_deleted',
  account_closed_by_admin: 'admin.account_lifecycle.event_closed_by_admin',
  role_assigned: 'admin.account_lifecycle.event_role_assigned',
  role_revoked: 'admin.account_lifecycle.event_role_revoked',
  password_reset: 'admin.account_lifecycle.event_password_reset',
  email_changed: 'admin.account_lifecycle.event_email_changed',
};

export interface LifecycleEvent {
  id: string;
  gcid: string;
  eventType: LifecycleEventType;
  actor: string;
  actorType: 'admin' | 'system' | 'user';
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface LifecycleEventListResponse {
  events: LifecycleEvent[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Admin Actions
// ---------------------------------------------------------------------------

export interface SuspendAccountRequest {
  gcid: string;
  reason: string;
}

export interface ReactivateAccountRequest {
  gcid: string;
}

export interface AdminCloseAccountRequest {
  gcid: string;
  reason: string;
}
