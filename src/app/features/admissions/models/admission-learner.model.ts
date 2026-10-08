/**
 * Admission learner models — learner-facing interfaces for application
 * overview, stage progress, decisions, and document uploads.
 *
 * Source of truth: chora-contracts/openapi/course-application.yaml
 */

// ---------------------------------------------------------------------------
// Enums / Literal Unions
// ---------------------------------------------------------------------------

export type StageStatus =
  | 'pending'
  | 'active'
  | 'completed'
  | 'timed_out'
  | 'skipped';

export type VirusScanStatus = 'pending' | 'scanning' | 'clean' | 'rejected';

export type DecisionResultType = 'approved' | 'rejected' | 'deferred';

export type LearnerStageType =
  | 'document_upload'
  | 'form'
  | 'prerequisite_check'
  | 'assessment'
  | 'interview'
  | 'decision';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface PipelineOverview {
  id: string;
  name: string;
  description: string;
  programme_name: string | null;
  open_date: string;
  close_date: string | null;
  total_stages: number;
  estimated_completion_minutes: number;
  already_applied: boolean;
}

export interface StageProgress {
  id: string;
  name: string;
  type: LearnerStageType;
  order: number;
  status: StageStatus;
  required: boolean;
  timeout_hours: number | null;
  timeout_deadline: string | null;
  instructions: string;
  completed_at: string | null;
}

export interface ApplicationOverview {
  id: string;
  pipeline_id: string;
  pipeline_name: string;
  programme_name: string | null;
  stages: StageProgress[];
  current_stage_index: number;
  started_at: string;
  updated_at: string;
}

export interface UploadedDocument {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  scan_status: VirusScanStatus;
  uploaded_at: string;
}

export interface StageDetail {
  stage_id: string;
  stage_name: string;
  stage_type: LearnerStageType;
  instructions: string;
  documents: UploadedDocument[];
  form_fields: LearnerFormField[];
  form_responses: Record<string, unknown>;
  assessment_session_id: string | null;
  interview_slot: InterviewSlot | null;
  available_interview_slots: InterviewSlot[];
  prerequisite_results: PrerequisiteResult[];
  accepted_file_types: string[];
  max_file_size_mb: number;
}

export interface LearnerFormField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'date' | 'number';
  required: boolean;
  options: string[];
  placeholder: string;
  value: unknown;
}

export interface InterviewSlot {
  id: string;
  start_time: string;
  end_time: string;
  location: string | null;
  meeting_url: string | null;
  booked: boolean;
}

export interface PrerequisiteResult {
  id: string;
  description: string;
  passed: boolean;
  detail: string;
}

export interface DecisionResult {
  decision: DecisionResultType;
  message: string;
  decided_at: string;
  reason_summary: string | null;
  next_steps: string[];
  enrollment_action_url: string | null;
  next_intake_date: string | null;
  auto_carry_forward: boolean;
  reapplication_eligible: boolean;
  reapplication_earliest_date: string | null;
}

export interface StageSubmission {
  stage_id: string;
  form_responses?: Record<string, unknown>;
  interview_slot_id?: string;
}

// ---------------------------------------------------------------------------
// Discriminated Union States
// ---------------------------------------------------------------------------

export type PipelineListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: PipelineOverview[] }
  | { status: 'error'; error: string };

export type ApplicationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: ApplicationOverview }
  | { status: 'error'; error: string };

export type StageDetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: StageDetail }
  | { status: 'error'; error: string };

export type DecisionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: DecisionResult }
  | { status: 'error'; error: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  pending: 'admissions.stage_status_pending',
  active: 'admissions.stage_status_active',
  completed: 'admissions.stage_status_completed',
  timed_out: 'admissions.stage_status_timed_out',
  skipped: 'admissions.stage_status_skipped',
};

export const DECISION_LABELS: Record<DecisionResultType, string> = {
  approved: 'admissions.decision_approved',
  rejected: 'admissions.decision_rejected',
  deferred: 'admissions.decision_deferred',
};

export const DECISION_ICONS: Record<DecisionResultType, string> = {
  approved: 'check_circle',
  rejected: 'cancel',
  deferred: 'schedule',
};
