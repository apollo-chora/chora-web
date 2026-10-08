/**
 * Admission pipeline models — admin-facing interfaces for pipeline templates,
 * stages, applications, and decisions.
 *
 * Source of truth: chora-contracts/openapi/course-application.yaml
 */

// ---------------------------------------------------------------------------
// Enums / Literal Unions
// ---------------------------------------------------------------------------

export type StageType =
  | 'document_upload'
  | 'form'
  | 'prerequisite_check'
  | 'assessment'
  | 'interview'
  | 'decision';

export type PipelineStatus = 'draft' | 'published' | 'closed' | 'archived';

export type ApplicationStatus =
  | 'not_started'
  | 'in_progress'
  | 'under_review'
  | 'decided'
  | 'withdrawn';

export type DecisionType = 'approved' | 'rejected' | 'deferred';

export type RejectReasonCode =
  | 'incomplete_documents'
  | 'prerequisite_not_met'
  | 'assessment_below_threshold'
  | 'capacity_reached'
  | 'ineligible'
  | 'other';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface StageConfig {
  accepted_file_types?: string[];
  max_file_size_mb?: number;
  linked_assessment_id?: string;
  form_fields?: FormFieldConfig[];
  reviewer_gcids?: string[];
  prerequisite_rules?: PrerequisiteRule[];
}

export interface FormFieldConfig {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'date' | 'number';
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface PrerequisiteRule {
  id: string;
  description: string;
  rule_type: 'minimum_grade' | 'completed_path' | 'age_requirement' | 'custom';
  parameters: Record<string, unknown>;
}

export interface PipelineStage {
  id: string;
  name: string;
  type: StageType;
  order: number;
  required: boolean;
  timeout_hours: number | null;
  instructions: string;
  config: StageConfig;
}

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  programme_id: string | null;
  programme_name: string | null;
  stages: PipelineStage[];
  status: PipelineStatus;
  open_date: string | null;
  close_date: string | null;
  max_concurrent_applications: number;
  created_at: string;
  updated_at: string;
}

export interface ApplicationSummary {
  id: string;
  pipeline_id: string;
  pipeline_name: string;
  learner_gcid: string;
  learner_name: string;
  programme_name: string | null;
  status: ApplicationStatus;
  current_stage_id: string | null;
  current_stage_name: string | null;
  completed_stages: number;
  total_stages: number;
  submitted_at: string;
  updated_at: string;
}

export interface ApplicationDecision {
  id: string;
  application_id: string;
  decision: DecisionType;
  reason_code: RejectReasonCode | null;
  reason_detail: string | null;
  reviewer_gcid: string;
  reviewer_name: string;
  decided_at: string;
  next_intake_date: string | null;
}

export interface ApplicationDetail extends ApplicationSummary {
  stages: ApplicationStageDetail[];
  decision: ApplicationDecision | null;
  reviewer_notes: ReviewerNote[];
}

export interface ApplicationStageDetail {
  stage_id: string;
  stage_name: string;
  stage_type: StageType;
  status: 'pending' | 'active' | 'completed' | 'timed_out' | 'skipped';
  documents: UploadedDocumentAdmin[];
  assessment_score: number | null;
  form_responses: Record<string, unknown> | null;
  completed_at: string | null;
}

export interface UploadedDocumentAdmin {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  preview_url: string | null;
}

export interface ReviewerNote {
  id: string;
  reviewer_gcid: string;
  reviewer_name: string;
  note: string;
  created_at: string;
}

export interface BulkDecisionRequest {
  application_ids: string[];
  decision: DecisionType;
  reason_code: RejectReasonCode | null;
  reason_detail: string | null;
}

export interface PublicationRequest {
  open_date: string;
  notification_cohort_ids: string[];
}

// ---------------------------------------------------------------------------
// Discriminated Union States
// ---------------------------------------------------------------------------

export type PipelineTemplateState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: PipelineTemplate }
  | { status: 'error'; error: string };

export type ApplicationListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: ApplicationSummary[] }
  | { status: 'error'; error: string };

export type ApplicationDetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: ApplicationDetail }
  | { status: 'error'; error: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALL_STAGE_TYPES: StageType[] = [
  'document_upload',
  'form',
  'prerequisite_check',
  'assessment',
  'interview',
  'decision',
];

export const STAGE_TYPE_LABELS: Record<StageType, string> = {
  document_upload: 'admin.admissions.stage_type_document_upload',
  form: 'admin.admissions.stage_type_form',
  prerequisite_check: 'admin.admissions.stage_type_prerequisite_check',
  assessment: 'admin.admissions.stage_type_assessment',
  interview: 'admin.admissions.stage_type_interview',
  decision: 'admin.admissions.stage_type_decision',
};

export const STAGE_TYPE_ICONS: Record<StageType, string> = {
  document_upload: 'upload',
  form: 'description',
  prerequisite_check: 'checklist',
  assessment: 'quiz',
  interview: 'groups',
  decision: 'gavel',
};

export const REJECT_REASON_LABELS: Record<RejectReasonCode, string> = {
  incomplete_documents: 'admin.admissions.reject_incomplete_documents',
  prerequisite_not_met: 'admin.admissions.reject_prerequisite_not_met',
  assessment_below_threshold: 'admin.admissions.reject_assessment_below_threshold',
  capacity_reached: 'admin.admissions.reject_capacity_reached',
  ineligible: 'admin.admissions.reject_ineligible',
  other: 'admin.admissions.reject_other',
};

export const ALL_REJECT_REASONS: RejectReasonCode[] = [
  'incomplete_documents',
  'prerequisite_not_met',
  'assessment_below_threshold',
  'capacity_reached',
  'ineligible',
  'other',
];
