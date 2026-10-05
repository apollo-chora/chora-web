/**
 * Admin-facing TypeScript interfaces for AssessmentSession CRUD.
 * Source of truth: chora-contracts/openapi/atomic.yaml §AssessmentSession
 *
 * AssessmentSession is a collection aggregate that QUERIES atoms — it does NOT own them.
 */

// ---------------------------------------------------------------------------
// Enums (match OpenAPI atomic.yaml)
// ---------------------------------------------------------------------------

export type SessionType =
  | 'straight_up_exam'
  | 'daily_dose'
  | 'mock_exam'
  | 'practice_set'
  | 'wordle_quiz'
  | 'atom_playlist';

export type SessionStatus =
  | 'not_started'
  | 'active'
  | 'paused'
  | 'submitted'
  | 'graded';

export type StructureMode =
  | 'flat'
  | 'sections_only'
  | 'papers_only'
  | 'papers_and_sections';

export type NavigationMode = 'free' | 'sequential';

export type GradingMode = 'auto' | 'manual' | 'hybrid';

// ---------------------------------------------------------------------------
// Domain Entities
// ---------------------------------------------------------------------------

export interface AssessmentSession {
  id: string;
  gcid: string;
  tenant_id: string;
  title: string;
  description?: string | null;
  session_type: SessionType;
  status: SessionStatus;
  structure_mode: StructureMode;
  time_limit_ms?: number | null;
  total_points?: number | null;
  papers: AssessmentPaper[];
  sections: AssessmentSection[];
  atom_ids: string[];
  atom_revision_ids: string[];
  atom_points_map?: Record<string, number> | null;
  created_at: string;
  updated_at: string;
}

export interface AssessmentPaper {
  id: string;
  assessment_session_id: string;
  paper_number: number;
  title: string;
  time_limit_ms?: number | null;
  sections: AssessmentSection[];
}

export interface AssessmentSection {
  id: string;
  title: string;
  points?: number | null;
  grading_mode: GradingMode;
  atom_ids: string[];
  atom_revision_ids: string[];
  atom_points_map?: Record<string, number> | null;
}

// ---------------------------------------------------------------------------
// Builder Interfaces (used by AssessmentBuilderComponent for local state)
// ---------------------------------------------------------------------------

export interface AssessmentDraft {
  title: string;
  description: string;
  session_type: SessionType;
  structure_mode: StructureMode;
  time_limit_ms: number | null;
  papers: PaperDraft[];
  sections: SectionDraft[];
  atom_ids: string[];
}

export interface PaperDraft {
  id: string;
  title: string;
  time_limit_ms: number | null;
  sections: SectionDraft[];
  expanded: boolean;
}

export interface SectionDraft {
  id: string;
  title: string;
  points: number;
  grading_mode: GradingMode;
  atoms: AtomAssignment[];
  expanded: boolean;
}

export interface AtomAssignment {
  atom_id: string;
  atom_title: string;
  atom_type: string;
  revision_id: string | null;
  available_revisions: RevisionOption[];
  points: number;
}

export interface RevisionOption {
  id: string;
  revision_number: number;
  visibility_status: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Request DTOs (match OpenAPI)
// ---------------------------------------------------------------------------

export interface CreateAssessmentRequest {
  session_type: SessionType;
  title: string;
  description?: string;
  structure_mode: StructureMode;
  time_limit_ms?: number | null;
  atom_ids?: string[];
  atom_revision_ids?: string[];
  atom_points_map?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  straight_up_exam: 'admin.assessments.types.straight_up_exam',
  daily_dose: 'admin.assessments.types.daily_dose',
  mock_exam: 'admin.assessments.types.mock_exam',
  practice_set: 'admin.assessments.types.practice_set',
  wordle_quiz: 'admin.assessments.types.wordle_quiz',
  atom_playlist: 'admin.assessments.types.atom_playlist',
};

export const STRUCTURE_MODE_LABELS: Record<StructureMode, string> = {
  flat: 'admin.assessments.structure.flat',
  sections_only: 'admin.assessments.structure.sections_only',
  papers_only: 'admin.assessments.structure.papers_only',
  papers_and_sections: 'admin.assessments.structure.papers_and_sections',
};

export const GRADING_MODE_LABELS: Record<GradingMode, string> = {
  auto: 'admin.assessments.grading.auto',
  manual: 'admin.assessments.grading.manual',
  hybrid: 'admin.assessments.grading.hybrid',
};

export const ALL_SESSION_TYPES: SessionType[] = [
  'straight_up_exam',
  'daily_dose',
  'mock_exam',
  'practice_set',
  'wordle_quiz',
  'atom_playlist',
];

export const ALL_STRUCTURE_MODES: StructureMode[] = [
  'flat',
  'sections_only',
  'papers_only',
  'papers_and_sections',
];

export const ALL_GRADING_MODES: GradingMode[] = ['auto', 'manual', 'hybrid'];

// ---------------------------------------------------------------------------
// Discriminated Union State
// ---------------------------------------------------------------------------

export type AssessmentState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; session: AssessmentSession }
  | { status: 'error'; error: { code: string; message: string } };
