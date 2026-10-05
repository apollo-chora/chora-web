/**
 * Admin-facing TypeScript interfaces for LockedPath CRUD.
 * Source of truth: chora-contracts/openapi/atomic.yaml §LockedPath
 *
 * LockedPath is a collection aggregate that QUERIES atoms — it does NOT own them.
 * Steps represent an ordered sequence with optional prerequisite enforcement.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type EnrollmentType = 'open' | 'invite_only' | 'approval_required';

export type PathStatus = 'draft' | 'published' | 'archived';

// ---------------------------------------------------------------------------
// Domain Entities
// ---------------------------------------------------------------------------

export interface LockedPath {
  id: string;
  tenant_id: string;
  title: string;
  description: string;
  estimated_duration_ms: number | null;
  enrollment_type: EnrollmentType;
  status: PathStatus;
  steps: LockedPathStep[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface LockedPathStep {
  id: string;
  path_id: string;
  atom_id: string;
  atom_title?: string;
  atom_type?: string;
  step_order: number;
  prerequisite_step_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Builder Interfaces (local draft state for PathBuilderComponent)
// ---------------------------------------------------------------------------

export interface PathDraft {
  title: string;
  description: string;
  estimated_duration_ms: number | null;
  enrollment_type: EnrollmentType;
  steps: PathStepDraft[];
}

export interface PathStepDraft {
  id: string;
  atom_id: string;
  atom_title: string;
  atom_type: string;
  step_order: number;
  requires_previous: boolean;
}

// ---------------------------------------------------------------------------
// Request DTOs (match OpenAPI)
// ---------------------------------------------------------------------------

export interface CreateLockedPathRequest {
  title: string;
  description?: string;
  estimated_duration_ms?: number | null;
  enrollment_type?: EnrollmentType;
}

export interface CreateLockedPathStepRequest {
  atom_id: string;
  step_order?: number;
}

export interface ReorderStepsRequest {
  step_ids: string[];
}

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

export interface LockedPathListResponse {
  data: LockedPath[];
  page_info: { next_cursor: string | null; has_next: boolean };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ENROLLMENT_TYPE_LABELS: Record<EnrollmentType, string> = {
  open: 'admin.paths.enrollment.open',
  invite_only: 'admin.paths.enrollment.invite_only',
  approval_required: 'admin.paths.enrollment.approval_required',
};

export const ALL_ENROLLMENT_TYPES: EnrollmentType[] = [
  'open',
  'invite_only',
  'approval_required',
];

export const PATH_STATUS_LABELS: Record<PathStatus, string> = {
  draft: 'admin.paths.status.draft',
  published: 'admin.paths.status.published',
  archived: 'admin.paths.status.archived',
};

// ---------------------------------------------------------------------------
// Discriminated Union State
// ---------------------------------------------------------------------------

export type PathState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; path: LockedPath }
  | { status: 'error'; error: { code: string; message: string } };
