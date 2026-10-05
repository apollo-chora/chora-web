/**
 * A2A Protocol models — matches domain-vocabulary skill.
 *
 * @see PLAN.md §3.50 (A2A Gateway)
 * @see docs/design/ux_a2a_protocol.md
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum PartnerStatus {
  Pending = 'pending',
  Verified = 'verified',
  Suspended = 'suspended',
  Expired = 'expired',
}

export enum ConsentScope {
  TopicsOnly = 'topics_only',
  LearningStyle = 'learning_style',
  EbbinghausSchedule = 'ebbinghaus_schedule',
  FullPersona = 'full_persona',
}

export enum ConsentDuration {
  SingleSession = 'single_session',
  SevenDays = '7_days',
  ThirtyDays = '30_days',
  UntilRevoked = 'until_revoked',
}

export enum A2ASkill {
  StudyConversation = 'study_conversation',
  QuizGeneration = 'quiz_generation',
  PersonaSync = 'persona_sync',
  ScheduleAdvisor = 'schedule_advisor',
  ContentRecommendation = 'content_recommendation',
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface A2APartner {
  id: string;
  orgName: string;
  orgDomain: string;
  contactEmail: string;
  status: PartnerStatus;
  allowedSkills: A2ASkill[];
  maxAgents: number;
  rateLimitPerHour: number;
  dnsChallenge: string | null;
  verifiedAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface A2AConsent {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerStatus: PartnerStatus;
  agentName: string;
  skill: A2ASkill;
  scope: ConsentScope;
  duration: ConsentDuration;
  grantedAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface A2ATask {
  id: string;
  partnerId: string;
  partnerName: string;
  agentName: string;
  skill: A2ASkill;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt: string | null;
}

export interface A2AActivityEntry {
  id: string;
  consentId: string;
  partnerId: string;
  partnerName: string;
  agentName: string;
  skill: A2ASkill;
  action: string;
  timestamp: string;
  details: Record<string, unknown>;
}

export interface PartnerRegistration {
  orgName: string;
  orgDomain: string;
  contactEmail: string;
  allowedSkills: A2ASkill[];
  maxAgents: number;
  rateLimitPerHour: number;
}

export interface PartnerSuspension {
  reason: string;
  effectiveImmediately: boolean;
}

export interface SuspensionHistoryEntry {
  id: string;
  partnerId: string;
  action: 'suspended' | 'restored';
  reason: string;
  performedBy: string;
  timestamp: string;
}

export interface SuspensionImpact {
  affectedGrantCount: number;
  activeTaskCount: number;
}

export interface ConsentGrantRequest {
  partnerId: string;
  agentName: string;
  skill: A2ASkill;
  scope: ConsentScope;
  duration: ConsentDuration;
  webauthnCredential: string;
}

export interface ConsentScopeModification {
  consentId: string;
  newScope: ConsentScope;
  webauthnCredential: string;
}

// ---------------------------------------------------------------------------
// Async state helpers
// ---------------------------------------------------------------------------

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };

// ---------------------------------------------------------------------------
// Friendly display maps
// ---------------------------------------------------------------------------

export const CONSENT_SCOPE_LABELS: Record<ConsentScope, string> = {
  [ConsentScope.TopicsOnly]: 'a2a.consent.scope_topics_only',
  [ConsentScope.LearningStyle]: 'a2a.consent.scope_learning_style',
  [ConsentScope.EbbinghausSchedule]: 'a2a.consent.scope_ebbinghaus_schedule',
  [ConsentScope.FullPersona]: 'a2a.consent.scope_full_persona',
};

export const CONSENT_SCOPE_DESCRIPTIONS: Record<ConsentScope, string> = {
  [ConsentScope.TopicsOnly]: 'a2a.consent.scope_desc_topics_only',
  [ConsentScope.LearningStyle]: 'a2a.consent.scope_desc_learning_style',
  [ConsentScope.EbbinghausSchedule]: 'a2a.consent.scope_desc_ebbinghaus_schedule',
  [ConsentScope.FullPersona]: 'a2a.consent.scope_desc_full_persona',
};

export const CONSENT_DURATION_LABELS: Record<ConsentDuration, string> = {
  [ConsentDuration.SingleSession]: 'a2a.consent.duration_single_session',
  [ConsentDuration.SevenDays]: 'a2a.consent.duration_7_days',
  [ConsentDuration.ThirtyDays]: 'a2a.consent.duration_30_days',
  [ConsentDuration.UntilRevoked]: 'a2a.consent.duration_until_revoked',
};

export const A2A_SKILL_LABELS: Record<A2ASkill, string> = {
  [A2ASkill.StudyConversation]: 'a2a.skill.study_conversation',
  [A2ASkill.QuizGeneration]: 'a2a.skill.quiz_generation',
  [A2ASkill.PersonaSync]: 'a2a.skill.persona_sync',
  [A2ASkill.ScheduleAdvisor]: 'a2a.skill.schedule_advisor',
  [A2ASkill.ContentRecommendation]: 'a2a.skill.content_recommendation',
};

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  [PartnerStatus.Pending]: 'a2a.partner.status_pending',
  [PartnerStatus.Verified]: 'a2a.partner.status_verified',
  [PartnerStatus.Suspended]: 'a2a.partner.status_suspended',
  [PartnerStatus.Expired]: 'a2a.partner.status_expired',
};
