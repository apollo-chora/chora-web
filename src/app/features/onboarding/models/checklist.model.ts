/**
 * Learner-facing onboarding checklist models.
 *
 * Source of truth: chora-contracts/openapi/onboarding.yaml
 */

// ---------------------------------------------------------------------------
// Enums / Literal Unions
// ---------------------------------------------------------------------------

export type ChecklistItemStatus = 'pending' | 'in_progress' | 'completed' | 'overdue';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ChecklistItemProgress {
  id: string;
  name: string;
  description: string;
  type: string;
  required: boolean;
  status: ChecklistItemStatus;
  due_date: string | null;
  completed_at: string | null;
  linked_resource_url: string | null;
}

export interface LearnerChecklist {
  id: string;
  template_id: string;
  template_name: string;
  items: ChecklistItemProgress[];
  completed_count: number;
  total_count: number;
}

export interface ChecklistSummary {
  checklist_id: string;
  template_name: string;
  completed_count: number;
  total_count: number;
  percentage: number;
  has_overdue: boolean;
}

// ---------------------------------------------------------------------------
// Discriminated Union States
// ---------------------------------------------------------------------------

export type LearnerChecklistState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: LearnerChecklist }
  | { status: 'error'; error: string };

export type ChecklistSummaryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: ChecklistSummary }
  | { status: 'error'; error: string };
