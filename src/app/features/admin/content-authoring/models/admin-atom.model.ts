/**
 * Admin-facing TypeScript interfaces for LearningAtom CRUD.
 * Source of truth: chora-contracts/openapi/atomic.yaml
 *
 * These models are used by the admin content-authoring module.
 * The learner-facing models live in features/atomic/models/atom.models.ts
 * and use GraphQL (ADR-025). Admin CRUD uses REST (OpenAPI).
 */

// ---------------------------------------------------------------------------
// Enums (match OpenAPI atomic.yaml AtomType / AtomStatus / ValidationRuleType)
// ---------------------------------------------------------------------------

export type AdminAtomType =
  | 'multiple_choice'
  | 'fill_blank'
  | 'true_false'
  | 'short_answer'
  | 'matching'
  | 'ordering'
  | 'code'
  | 'essay'
  | 'multimedia'
  | 'simulation';

export type VisibilityStatus = 'draft' | 'published' | 'archived';

export type RevisionVisibility = 'draft' | 'published' | 'archived' | 'withdrawn';

export type ValidationRuleType =
  | 'exact_match'
  | 'regex'
  | 'range'
  | 'keyword'
  | 'manual'
  | 'llm_graded';

// ---------------------------------------------------------------------------
// Domain Entities
// ---------------------------------------------------------------------------

export interface AdminAtom {
  id: string;
  tenant_id: string;
  atom_type: AdminAtomType;
  difficulty: number;
  language_code: string;
  tags: string[];
  status: VisibilityStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  latest_revision?: AtomRevision | null;
}

export interface AtomRevision {
  id: string;
  atom_id: string;
  revision_number: number;
  content: Record<string, unknown>;
  validation_rules: AnswerValidationRule[];
  visibility_status: RevisionVisibility;
  metadata?: Record<string, unknown> | null;
  published_at: string | null;
  created_by: string;
  created_at: string;
}

export interface AnswerValidationRule {
  rule_type: ValidationRuleType;
  expected: unknown;
  tolerance?: number | null;
  case_sensitive: boolean;
}

// ---------------------------------------------------------------------------
// Atom Content Types (JSONB, type-specific)
// ---------------------------------------------------------------------------

export interface McqOption {
  id: number;
  text: string;
  is_correct: boolean;
}

export interface McqContent {
  stem: string;
  options: McqOption[];
  explanation?: string;
  hints?: string[];
}

export interface FillBlankContent {
  stem: string;
  blanks: string[];
  acceptable_answers?: string[][];
  hints?: string[];
}

export interface FlashcardContent {
  front: string;
  back: string;
}

export interface SlideContent {
  title: string;
  body: string;
  media_url?: string;
}

export interface ShortAnswerContent {
  stem: string;
  expected_answers?: string[];
  tolerance?: number;
  max_length?: number;
  hints?: string[];
}

export interface MatchingContent {
  stem: string;
  pairs: MatchingPair[];
  hints?: string[];
}

export interface MatchingPair {
  left: string;
  right: string;
}

export interface OrderingContent {
  stem: string;
  items: string[];
  hints?: string[];
}

export interface HotspotContent {
  image_url: string;
  hotspots: HotspotArea[];
}

export interface HotspotArea {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

// ---------------------------------------------------------------------------
// Request / Response DTOs (match OpenAPI atomic.yaml)
// ---------------------------------------------------------------------------

export interface CreateAtomRequest {
  atom_type: AdminAtomType;
  difficulty: number;
  language_code: string;
  tags?: string[];
}

export interface UpdateAtomRequest {
  difficulty?: number;
  language_code?: string;
  tags?: string[];
  status?: VisibilityStatus;
}

export interface CreateRevisionRequest {
  content: Record<string, unknown>;
  validation_rules: AnswerValidationRule[];
  metadata?: Record<string, unknown> | null;
  publish?: boolean;
}

export interface AtomListParams {
  cursor?: string;
  limit?: number;
  atom_type?: AdminAtomType;
  status?: VisibilityStatus;
  topic_id?: string;
  difficulty?: number;
}

export interface AdminAtomListResponse {
  data: AdminAtom[];
  page_info: AdminPageInfo;
}

// ---------------------------------------------------------------------------
// Learner-safe atom projection + author illustration slice (CHO-1638)
//
// The assessment-builder preview renders MCQ illustrations per atom. The
// admin atom catalog (`GET /api/v1/atoms`) does NOT carry the embedded
// Question UUID nor the author-generated illustration URLs, so the preview
// resolves them in two hops, mirroring the test-set editor / picker pattern:
//   1. GET /api/atoms/{id}            → learner-safe projection (question_id)
//   2. GET /api/atoms/{id}/questions/{qid} → author projection (both images)
// Step 2 is author-gated; the assessment-builder is an author surface, so the
// model-answer illustration is in-scope here (never on a learner-take path).
// ---------------------------------------------------------------------------

export interface AdminAtomProjectionMcqPayload {
  readonly question_id: string;
  readonly prompt?: string;
}

export interface AdminAtomProjection {
  readonly atom_id: string;
  readonly atom_type?: string;
  readonly mcq_payload?: AdminAtomProjectionMcqPayload | null;
}

/** BFF wraps the learner-safe projection in an `{ atom: ... }` envelope. */
export interface AdminAtomProjectionResponse {
  readonly atom: AdminAtomProjection;
}

/** Durable-signed illustration URLs from the AUTHOR question projection. */
export interface AuthorQuestionImages {
  readonly image_url: string | null;
  readonly answer_image_url: string | null;
}

/** Minimal slice of `GET /api/atoms/{id}/questions/{qid}` (operationId getQuestion). */
export interface GetQuestionResponse {
  readonly question?: {
    readonly mcq?: {
      readonly image_url?: string | null;
      readonly answer_image_url?: string | null;
    } | null;
  } | null;
}

export interface AdminPageInfo {
  next_cursor: string | null;
  has_next: boolean;
}

export interface RevisionListResponse {
  data: AtomRevision[];
  page_info: AdminPageInfo;
}

// ---------------------------------------------------------------------------
// Atom Type Metadata (for admin UI display)
// ---------------------------------------------------------------------------

export const ADMIN_ATOM_TYPE_LABELS: Record<AdminAtomType, string> = {
  multiple_choice: 'admin.atoms.types.multiple_choice',
  fill_blank: 'admin.atoms.types.fill_blank',
  true_false: 'admin.atoms.types.true_false',
  short_answer: 'admin.atoms.types.short_answer',
  matching: 'admin.atoms.types.matching',
  ordering: 'admin.atoms.types.ordering',
  code: 'admin.atoms.types.code',
  essay: 'admin.atoms.types.essay',
  multimedia: 'admin.atoms.types.multimedia',
  simulation: 'admin.atoms.types.simulation',
};

export const ADMIN_ATOM_TYPE_ICONS: Record<AdminAtomType, string> = {
  multiple_choice: 'check_circle',
  fill_blank: 'edit_note',
  true_false: 'toggle_on',
  short_answer: 'short_text',
  matching: 'compare_arrows',
  ordering: 'sort',
  code: 'code',
  essay: 'article',
  multimedia: 'play_circle',
  simulation: 'science',
};

export const VALIDATION_RULE_LABELS: Record<ValidationRuleType, string> = {
  exact_match: 'admin.atoms.rules.exact_match',
  regex: 'admin.atoms.rules.regex',
  range: 'admin.atoms.rules.range',
  keyword: 'admin.atoms.rules.keyword',
  manual: 'admin.atoms.rules.manual',
  llm_graded: 'admin.atoms.rules.llm_graded',
};

export const ALL_ATOM_TYPES: AdminAtomType[] = [
  'multiple_choice',
  'fill_blank',
  'true_false',
  'short_answer',
  'matching',
  'ordering',
  'code',
  'essay',
  'multimedia',
  'simulation',
];

export const ALL_VISIBILITY_STATUSES: VisibilityStatus[] = [
  'draft',
  'published',
  'archived',
];

// ---------------------------------------------------------------------------
// Discriminated Union State (AsyncState pattern)
// ---------------------------------------------------------------------------

export type AdminAtomState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; atom: AdminAtom }
  | { status: 'error'; error: { code: string; message: string } };

export type AdminAtomListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; atoms: AdminAtom[]; pageInfo: AdminPageInfo }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

export function isAdminAtomType(value: string): value is AdminAtomType {
  return ALL_ATOM_TYPES.includes(value as AdminAtomType);
}

export function isVisibilityStatus(value: string): value is VisibilityStatus {
  return ALL_VISIBILITY_STATUSES.includes(value as VisibilityStatus);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getAtomTitle(atom: AdminAtom): string {
  const rev = atom.latest_revision;
  if (!rev) return 'Untitled Atom';
  const content = rev.content;
  return (content['stem'] as string)
    ?? (content['front'] as string)
    ?? (content['title'] as string)
    ?? 'Untitled Atom';
}

export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
