/**
 * Content Moderation models for the moderation dashboard.
 *
 * Source of truth: chora-contracts/openapi/governance.yaml
 * All interfaces match backend snake_case JSON directly.
 */

// ---------------------------------------------------------------------------
// Flagged Content Status
// ---------------------------------------------------------------------------

export type FlaggedContentStatus = 'pending' | 'reviewing' | 'resolved' | 'dismissed';

// ---------------------------------------------------------------------------
// Content Types
// ---------------------------------------------------------------------------

export type FlaggedContentType =
  | 'atom'
  | 'comment'
  | 'forum_post'
  | 'study_group_message'
  | 'profile'
  | 'media';

// ---------------------------------------------------------------------------
// Moderation Decision
// ---------------------------------------------------------------------------

export type ModerationDecision = 'approve' | 'request_edit' | 'remove' | 'restore';

// ---------------------------------------------------------------------------
// Domain Interfaces
// ---------------------------------------------------------------------------

export interface FlaggedContentItem {
  id: string;
  tenant_id: string;
  content_id: string;
  content_type: FlaggedContentType;
  content_title: string;
  content_excerpt: string;
  flagged_by_gcid: string;
  flagged_by_display_name: string;
  flag_reason: string;
  status: FlaggedContentStatus;
  assigned_moderator_gcid: string | null;
  assigned_moderator_name: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface ModerationAuditEntry {
  id: string;
  flagged_content_id: string;
  action: ModerationDecision;
  moderator_gcid: string;
  moderator_name: string;
  reason: string;
  notes: string | null;
  created_at: string;
}

export interface ModerationActionRequest {
  decision: ModerationDecision;
  reason: string;
  notes: string;
}

export interface FlaggedContentListResponse {
  data: FlaggedContentItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface ModerationAuditResponse {
  data: ModerationAuditEntry[];
  total: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALL_FLAGGED_CONTENT_STATUSES: FlaggedContentStatus[] = [
  'pending',
  'reviewing',
  'resolved',
  'dismissed',
];

export const ALL_FLAGGED_CONTENT_TYPES: FlaggedContentType[] = [
  'atom',
  'comment',
  'forum_post',
  'study_group_message',
  'profile',
  'media',
];

export const ALL_MODERATION_DECISIONS: ModerationDecision[] = [
  'approve',
  'request_edit',
  'remove',
  'restore',
];

// ---------------------------------------------------------------------------
// Label Maps (i18n keys)
// ---------------------------------------------------------------------------

export const FLAGGED_STATUS_LABELS: Record<FlaggedContentStatus, string> = {
  pending: 'admin.moderation.status_pending',
  reviewing: 'admin.moderation.status_reviewing',
  resolved: 'admin.moderation.status_resolved',
  dismissed: 'admin.moderation.status_dismissed',
};

export const FLAGGED_CONTENT_TYPE_LABELS: Record<FlaggedContentType, string> = {
  atom: 'admin.moderation.type_atom',
  comment: 'admin.moderation.type_comment',
  forum_post: 'admin.moderation.type_forum_post',
  study_group_message: 'admin.moderation.type_study_group_message',
  profile: 'admin.moderation.type_profile',
  media: 'admin.moderation.type_media',
};

export const MODERATION_DECISION_LABELS: Record<ModerationDecision, string> = {
  approve: 'admin.moderation.decision_approve',
  request_edit: 'admin.moderation.decision_request_edit',
  remove: 'admin.moderation.decision_remove',
  restore: 'admin.moderation.decision_restore',
};
