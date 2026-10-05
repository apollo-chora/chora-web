/**
 * Parent domain models for guardian-learner links, activity digests,
 * progress dashboards, digest preferences, and progress alerts.
 *
 * Source of truth: chora-contracts/openapi/parent.yaml
 * Backend returns snake_case JSON — these interfaces match directly.
 */

// ---------------------------------------------------------------------------
// Enums / Literal Unions
// ---------------------------------------------------------------------------

export type GuardianRelationship = 'parent' | 'legal_guardian' | 'caretaker';

export type GuardianLinkStatus = 'pending' | 'active' | 'revoked';

export type DigestFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'disabled';

export type DeliveryChannel = 'email' | 'push' | 'sms';

export type AlertType = 'streak_broken' | 'grade_drop' | 'inactivity' | 'milestone_reached';

export type AlertSeverity = 'info' | 'warning' | 'critical';

// ---------------------------------------------------------------------------
// Page Info (cursor-based pagination)
// ---------------------------------------------------------------------------

export interface PageInfo {
  next_cursor: string | null;
  has_next: boolean;
}

// ---------------------------------------------------------------------------
// Guardian Link
// ---------------------------------------------------------------------------

export interface GuardianLink {
  id: string;
  tenant_id: string;
  guardian_gcid: string;
  learner_gcid: string;
  relationship: GuardianRelationship;
  status: GuardianLinkStatus;
  consent_granted_at: string | null;
  consent_revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GuardianLinkList {
  data: GuardianLink[];
  page_info?: PageInfo;
}

export interface CreateGuardianLinkRequest {
  learner_gcid: string;
  relationship: GuardianRelationship;
}

// ---------------------------------------------------------------------------
// Parent Dashboard
// ---------------------------------------------------------------------------

export interface ParentDashboard {
  learner_gcid: string;
  guardian_gcid: string;
  learner_display_name?: string;
  total_atoms_completed: number;
  current_streak_days: number;
  longest_streak_days: number;
  total_xp: number;
  average_score_pct: number;
  active_paths_count: number;
  completed_paths_count: number;
  last_activity_at: string | null;
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Activity Digest
// ---------------------------------------------------------------------------

export interface ActivityDigest {
  id: string;
  tenant_id: string;
  guardian_gcid: string;
  learner_gcid: string;
  period_start: string;
  period_end: string;
  atoms_completed: number;
  xp_earned: number;
  streak_days: number;
  average_score_pct: number;
  highlights: string[];
  sent_at: string | null;
  created_at: string;
}

export interface ActivityDigestList {
  data: ActivityDigest[];
  page_info?: PageInfo;
}

// ---------------------------------------------------------------------------
// Digest Preferences
// ---------------------------------------------------------------------------

export interface DigestPreference {
  id: string;
  tenant_id: string;
  guardian_gcid: string;
  frequency: DigestFrequency;
  channels: DeliveryChannel[];
  updated_at: string;
}

export interface UpdateDigestPreferencesRequest {
  frequency: DigestFrequency;
  channels: DeliveryChannel[];
}

// ---------------------------------------------------------------------------
// Progress Alert
// ---------------------------------------------------------------------------

export interface ProgressAlert {
  id: string;
  tenant_id: string;
  guardian_gcid: string;
  learner_gcid: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  message: string;
  details: Record<string, unknown>;
  acknowledged_at: string | null;
  created_at: string;
}

export interface ProgressAlertList {
  data: ProgressAlert[];
  page_info?: PageInfo;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALL_GUARDIAN_RELATIONSHIPS: GuardianRelationship[] = [
  'parent',
  'legal_guardian',
  'caretaker',
];

export const ALL_GUARDIAN_LINK_STATUSES: GuardianLinkStatus[] = [
  'pending',
  'active',
  'revoked',
];

export const ALL_DIGEST_FREQUENCIES: DigestFrequency[] = [
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'disabled',
];

export const ALL_DELIVERY_CHANNELS: DeliveryChannel[] = [
  'email',
  'push',
  'sms',
];

export const ALL_ALERT_TYPES: AlertType[] = [
  'streak_broken',
  'grade_drop',
  'inactivity',
  'milestone_reached',
];

export const ALL_ALERT_SEVERITIES: AlertSeverity[] = [
  'info',
  'warning',
  'critical',
];

// ---------------------------------------------------------------------------
// Label Maps (i18n keys)
// ---------------------------------------------------------------------------

export const GUARDIAN_LINK_STATUS_LABELS: Record<GuardianLinkStatus, string> = {
  pending: 'parent.status_pending',
  active: 'parent.status_active',
  revoked: 'parent.status_revoked',
};

export const GUARDIAN_RELATIONSHIP_LABELS: Record<GuardianRelationship, string> = {
  parent: 'parent.relationship_parent',
  legal_guardian: 'parent.relationship_legal_guardian',
  caretaker: 'parent.relationship_caretaker',
};

export const DIGEST_FREQUENCY_LABELS: Record<DigestFrequency, string> = {
  daily: 'parent.frequency_daily',
  weekly: 'parent.frequency_weekly',
  biweekly: 'parent.frequency_biweekly',
  monthly: 'parent.frequency_monthly',
  disabled: 'parent.frequency_disabled',
};

export const DELIVERY_CHANNEL_LABELS: Record<DeliveryChannel, string> = {
  email: 'parent.channel_email',
  push: 'parent.channel_push',
  sms: 'parent.channel_sms',
};

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  streak_broken: 'parent.alert_streak_broken',
  grade_drop: 'parent.alert_grade_drop',
  inactivity: 'parent.alert_inactivity',
  milestone_reached: 'parent.alert_milestone_reached',
};

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  info: 'parent.severity_info',
  warning: 'parent.severity_warning',
  critical: 'parent.severity_critical',
};

// ---------------------------------------------------------------------------
// Discriminated Union States
// ---------------------------------------------------------------------------

export type GuardianLinkListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; links: GuardianLink[] }
  | { status: 'error'; error: { code: string; message: string } };

export type ParentDashboardState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: ParentDashboard }
  | { status: 'error'; error: { code: string; message: string } };

export type ActivityDigestListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; digests: ActivityDigest[] }
  | { status: 'error'; error: { code: string; message: string } };

export type DigestPreferenceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: DigestPreference }
  | { status: 'error'; error: { code: string; message: string } };

export type ProgressAlertListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; alerts: ProgressAlert[] }
  | { status: 'error'; error: { code: string; message: string } };
