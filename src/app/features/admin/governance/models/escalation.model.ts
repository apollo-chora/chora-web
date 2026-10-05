/**
 * Escalation and governance tier models for restriction tracking,
 * appeal timelines, KYC learner verification, and warning state.
 *
 * Source of truth: chora-contracts/openapi/governance.yaml
 * All interfaces match backend snake_case JSON directly.
 */

// ---------------------------------------------------------------------------
// Enums / Literal Unions
// ---------------------------------------------------------------------------

export type GovernanceTier = 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4';

export type AppealStageStatus = 'completed' | 'active' | 'pending';

export type AppealDecision = 'upheld' | 'overturned';

export type KycLearnerStatus = 'pending_review' | 'verified' | 'rejected';

export type KycDocType = 'national_id' | 'passport' | 'drivers_license';

// ---------------------------------------------------------------------------
// Warning State (for Tier 1 banner)
// ---------------------------------------------------------------------------

export interface WarningState {
  current_count: number;
  max_before_escalation: number;
  acknowledged: boolean;
  latest_message: string;
}

// ---------------------------------------------------------------------------
// Restricted Navigation (for Tier 3)
// ---------------------------------------------------------------------------

export interface RestrictedCapability {
  route: string;
  label_key: string;
  reason: string;
  is_restricted: boolean;
}

// ---------------------------------------------------------------------------
// Escalation Entry (for admin tracker)
// ---------------------------------------------------------------------------

export interface EscalationEntry {
  id: string;
  target_gcid: string;
  from_tier: GovernanceTier;
  to_tier: GovernanceTier;
  reason: string;
  escalated_at: string;
  escalated_by: string;
}

export interface EscalationThreshold {
  tier: GovernanceTier;
  label_key: string;
  warnings_required: number;
  description_key: string;
}

export interface EscalationState {
  current_tier: GovernanceTier;
  warning_count: number;
  thresholds: EscalationThreshold[];
  history: EscalationEntry[];
}

// ---------------------------------------------------------------------------
// Appeal Timeline (for learner appeal status view)
// ---------------------------------------------------------------------------

export interface AppealStage {
  label_key: string;
  status: AppealStageStatus;
  date: string | null;
  notes: string | null;
  decision: AppealDecision | null;
}

export interface AppealTimeline {
  appeal_id: string;
  restriction_id: string;
  stages: AppealStage[];
  current_stage_index: number;
}

// ---------------------------------------------------------------------------
// KYC Learner Verification (for learner wizard)
// ---------------------------------------------------------------------------

export interface KycVerificationLearner {
  id: string;
  document_type: KycDocType | null;
  document_file_name: string | null;
  selfie_file_name: string | null;
  status: KycLearnerStatus;
  rejection_reason: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  timeline: KycTimelineEntry[];
}

export interface KycTimelineEntry {
  label_key: string;
  date: string | null;
  status: AppealStageStatus;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALL_GOVERNANCE_TIERS: GovernanceTier[] = [
  'tier_1',
  'tier_2',
  'tier_3',
  'tier_4',
];

export const GOVERNANCE_TIER_LABELS: Record<GovernanceTier, string> = {
  tier_1: 'governance.tier_1_warning',
  tier_2: 'governance.tier_2_limited',
  tier_3: 'governance.tier_3_restricted',
  tier_4: 'governance.tier_4_readonly',
};

export const APPEAL_DECISION_LABELS: Record<AppealDecision, string> = {
  upheld: 'governance.appeal_decision_upheld',
  overturned: 'governance.appeal_decision_overturned',
};

export const KYC_LEARNER_STATUS_LABELS: Record<KycLearnerStatus, string> = {
  pending_review: 'governance.kyc_pending_review',
  verified: 'governance.kyc_verified',
  rejected: 'governance.kyc_rejected',
};

// ---------------------------------------------------------------------------
// Discriminated Union States
// ---------------------------------------------------------------------------

export type EscalationTrackerState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: EscalationState }
  | { status: 'error'; error: { code: string; message: string } };

export type AppealTimelineState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: AppealTimeline }
  | { status: 'error'; error: { code: string; message: string } };

export type KycLearnerState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: KycVerificationLearner }
  | { status: 'error'; error: { code: string; message: string } };
