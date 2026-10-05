/**
 * Admin onboarding models — checklist templates, items, and cohort progress tracking.
 *
 * Source of truth: chora-contracts/openapi/onboarding.yaml
 */

// ---------------------------------------------------------------------------
// Enums / Literal Unions
// ---------------------------------------------------------------------------

export type ItemType =
  | 'document_upload'
  | 'form_completion'
  | 'assessment'
  | 'orientation_video'
  | 'profile_setup'
  | 'custom';

export type ItemStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';

export type CohortStatus = 'on_track' | 'at_risk' | 'overdue';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ChecklistItem {
  id: string;
  name: string;
  description: string;
  type: ItemType;
  required: boolean;
  due_date_offset_days: number | null;
  linked_resource_url: string | null;
  order: number;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  description: string;
  items: ChecklistItem[];
  target_roles: string[];
  created_at: string;
  updated_at: string;
}

export interface CohortLearner {
  gcid: string;
  display_name: string;
  email: string;
  completion_percentage: number;
  items_remaining: number;
  total_items: number;
  last_activity_at: string | null;
  status: CohortStatus;
}

export interface CohortProgress {
  template_id: string;
  template_name: string;
  learners: CohortLearner[];
  total_learners: number;
  average_completion: number;
}

// ---------------------------------------------------------------------------
// Discriminated Union States
// ---------------------------------------------------------------------------

export type ChecklistTemplateState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: ChecklistTemplate }
  | { status: 'error'; error: string };

export type CohortProgressState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: CohortProgress }
  | { status: 'error'; error: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALL_ITEM_TYPES: ItemType[] = [
  'document_upload',
  'form_completion',
  'assessment',
  'orientation_video',
  'profile_setup',
  'custom',
];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  document_upload: 'admin.onboarding.item_type_document_upload',
  form_completion: 'admin.onboarding.item_type_form_completion',
  assessment: 'admin.onboarding.item_type_assessment',
  orientation_video: 'admin.onboarding.item_type_orientation_video',
  profile_setup: 'admin.onboarding.item_type_profile_setup',
  custom: 'admin.onboarding.item_type_custom',
};

export const ITEM_TYPE_ICONS: Record<ItemType, string> = {
  document_upload: 'upload',
  form_completion: 'description',
  assessment: 'quiz',
  orientation_video: 'play_circle',
  profile_setup: 'person',
  custom: 'tune',
};

export const COHORT_STATUS_LABELS: Record<CohortStatus, string> = {
  on_track: 'admin.onboarding.status_on_track',
  at_risk: 'admin.onboarding.status_at_risk',
  overdue: 'admin.onboarding.status_overdue',
};
