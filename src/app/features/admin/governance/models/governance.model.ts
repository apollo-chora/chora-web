/**
 * Governance admin models for restrictions, appeals, KYC, and moderation.
 *
 * Source of truth: chora-contracts/openapi/governance-admin.yaml
 * All interfaces match backend snake_case JSON directly.
 */

// ---------------------------------------------------------------------------
// Restriction Types
// ---------------------------------------------------------------------------

export type RestrictionTier = 'warning' | 'limited' | 'suspended' | 'banned';
export type RestrictionStatus = 'active' | 'lifted' | 'expired';

// ---------------------------------------------------------------------------
// Appeal Types
// ---------------------------------------------------------------------------

export type AppealStatus = 'pending' | 'under_review' | 'approved' | 'denied';

// ---------------------------------------------------------------------------
// KYC Types
// ---------------------------------------------------------------------------

export type KYCDocumentType = 'national_id' | 'passport' | 'drivers_license';
export type KYCStatus = 'pending' | 'verified' | 'failed' | 'expired';

// ---------------------------------------------------------------------------
// Moderation Types
// ---------------------------------------------------------------------------

export type ModerationActionType = 'warn' | 'hide' | 'restrict' | 'escalate';

// ---------------------------------------------------------------------------
// Domain Interfaces
// ---------------------------------------------------------------------------

export interface Restriction {
  id: string;
  tenant_id: string;
  target_gcid: string;
  tier: RestrictionTier;
  reason: string;
  applied_by: string;
  applied_at: string;
  lifted_at: string | null;
  status: RestrictionStatus;
}

export interface Appeal {
  id: string;
  restriction_id: string;
  appellant_gcid: string;
  reason: string;
  status: AppealStatus;
  reviewer_gcid: string | null;
  reviewer_notes: string | null;
  submitted_at: string;
  resolved_at: string | null;
}

export interface KYCVerification {
  id: string;
  gcid: string;
  document_type: KYCDocumentType;
  status: KYCStatus;
  submitted_at: string;
  verified_at: string | null;
  expires_at: string | null;
}

export interface ContentModerationAction {
  id: string;
  content_id: string;
  content_type: string;
  action: ModerationActionType;
  reason: string;
  moderator_gcid: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALL_RESTRICTION_TIERS: RestrictionTier[] = [
  'warning',
  'limited',
  'suspended',
  'banned',
];

export const ALL_RESTRICTION_STATUSES: RestrictionStatus[] = [
  'active',
  'lifted',
  'expired',
];

export const ALL_APPEAL_STATUSES: AppealStatus[] = [
  'pending',
  'under_review',
  'approved',
  'denied',
];

export const ALL_KYC_STATUSES: KYCStatus[] = [
  'pending',
  'verified',
  'failed',
  'expired',
];

export const ALL_MODERATION_ACTIONS: ModerationActionType[] = [
  'warn',
  'hide',
  'restrict',
  'escalate',
];

// ---------------------------------------------------------------------------
// Label Maps (i18n keys)
// ---------------------------------------------------------------------------

export const TIER_LABELS: Record<RestrictionTier, string> = {
  warning: 'admin.governance.tier_warning',
  limited: 'admin.governance.tier_limited',
  suspended: 'admin.governance.tier_suspended',
  banned: 'admin.governance.tier_banned',
};

export const STATUS_LABELS: Record<RestrictionStatus, string> = {
  active: 'admin.governance.status_active',
  lifted: 'admin.governance.status_lifted',
  expired: 'admin.governance.status_expired',
};

export const APPEAL_STATUS_LABELS: Record<AppealStatus, string> = {
  pending: 'admin.governance.appeal_pending',
  under_review: 'admin.governance.appeal_under_review',
  approved: 'admin.governance.appeal_approved',
  denied: 'admin.governance.appeal_denied',
};

export const KYC_STATUS_LABELS: Record<KYCStatus, string> = {
  pending: 'admin.governance.kyc_pending',
  verified: 'admin.governance.kyc_verified',
  failed: 'admin.governance.kyc_failed',
  expired: 'admin.governance.kyc_expired',
};

export const MODERATION_ACTION_LABELS: Record<ModerationActionType, string> = {
  warn: 'admin.governance.moderation_warn',
  hide: 'admin.governance.moderation_hide',
  restrict: 'admin.governance.moderation_restrict',
  escalate: 'admin.governance.moderation_escalate',
};

// ---------------------------------------------------------------------------
// Discriminated Union States
// ---------------------------------------------------------------------------

export type RestrictionListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: Restriction[] }
  | { status: 'error'; error: { code: string; message: string } };

export type AppealListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: Appeal[] }
  | { status: 'error'; error: { code: string; message: string } };

export type KYCListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: KYCVerification[] }
  | { status: 'error'; error: { code: string; message: string } };

export type ModerationLogState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: ContentModerationAction[] }
  | { status: 'error'; error: { code: string; message: string } };
