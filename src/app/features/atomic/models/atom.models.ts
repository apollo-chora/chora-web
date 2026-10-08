/**
 * TypeScript interfaces matching Atomic Content Engine contracts.
 * Source of truth: chora-contracts/openapi/creation-admin.yaml + chora-contracts/graphql/creation.graphql
 *
 * Learner-facing reads use GraphQL via POST /api/v1/graphql (ADR-025).
 * Admin CRUD uses REST (OpenAPI).
 * Answer validation uses REST: POST /api/v1/atoms/{atomId}/validate.
 */

// ---------------------------------------------------------------------------
// Enums (match both OpenAPI snake_case and GraphQL UPPER_CASE representations)
// ---------------------------------------------------------------------------

export type AtomType =
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

export type AtomStatus = 'draft' | 'published' | 'archived';

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

export interface LearningAtom {
  id: string;
  tenant_id: string;
  atom_type: AtomType;
  difficulty: number;
  language_code: string;
  tags: string[];
  status: AtomStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  latest_revision?: AtomRevision | null;
}

export interface AtomRevision {
  id: string;
  atom_id: string;
  revision_number: number;
  content: AtomContent;
  validation_rules: AnswerValidationRule[];
  published_at: string | null;
  created_at: string;
}

export interface AnswerValidationRule {
  rule_type: ValidationRuleType;
  expected: unknown;
  tolerance?: number | null;
  case_sensitive: boolean;
}

// ---------------------------------------------------------------------------
// Atom Content (JSONB, type-specific)
// ---------------------------------------------------------------------------

export type AtomContent = Record<string, unknown>;

export interface McqContent {
  stem: string;
  options: McqOption[];
  hints?: string[];
}

export interface McqOption {
  id: number;
  text: string;
}

export interface FillBlankContent {
  stem: string;
  blanks: string[];
  hints?: string[];
}

export interface TrueFalseContent {
  stem: string;
  hints?: string[];
}

export interface ShortAnswerContent {
  stem: string;
  max_length?: number;
  hints?: string[];
}

export interface FlashcardContent {
  front: string;
  back: string;
}

export interface CodeContent {
  stem: string;
  language: string;
  starter_code?: string;
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

export interface EssayContent {
  stem: string;
  word_limit?: number;
  rubric?: string;
  hints?: string[];
}

export interface MultimediaContent {
  stem: string;
  media_url: string;
  media_type: 'video' | 'audio' | 'image';
  question?: string;
  hints?: string[];
}

// ---------------------------------------------------------------------------
// Topic Nodes (Knowledge Graph Tree)
// ---------------------------------------------------------------------------

/**
 * Wire projection — EXACTLY what GET /api/v1/topics[/{id}] returns per node
 * (chora-creation `topic_handler.go` `topicNodeDTO`). The tree is FLAT on the
 * wire and assembled client-side from `parent_id`. `tenant_id` is deliberately
 * NOT exposed by the backend (it is implicit in the caller's context — never
 * leaked as a second axis of identity), so it is absent here too.
 */
export interface TopicNodeDTO {
  readonly id: string;
  readonly parent_id: string | null;
  readonly name: string;
  readonly sort_order: number;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Client-built tree node: a wire DTO plus the `children` assembled from the flat list. */
export interface TopicNode extends TopicNodeDTO {
  children: TopicNode[];
  /**
   * Optional atom tally. NOT returned by the topic-tree endpoint — absent unless
   * a richer projection supplies it. Never fabricate it from the tree response.
   */
  atom_count?: number;
}

// ---------------------------------------------------------------------------
// Answer Validation
// ---------------------------------------------------------------------------

export interface ValidateAnswerRequest {
  answer: Record<string, unknown>;
  revision_id?: string | null;
  session_id?: string | null;
  time_spent_seconds?: number;
}

export interface ValidationResult {
  correct: boolean;
  atom_id: string;
  revision_id: string;
  explanation: string | null;
  expected_answer: Record<string, unknown> | null;
  confidence: number | null;
  rule_type: ValidationRuleType;
}

// ---------------------------------------------------------------------------
// Pagination (Relay-style for GraphQL, cursor-based for REST)
// ---------------------------------------------------------------------------

export interface PageInfo {
  has_next_page: boolean;
  has_previous_page: boolean;
  start_cursor: string | null;
  end_cursor: string | null;
}

export interface AtomEdge {
  node: LearningAtom;
  cursor: string;
}

export interface AtomConnection {
  edges: AtomEdge[];
  page_info: PageInfo;
  total_count: number | null;
}

export interface RestPageInfo {
  next_cursor: string | null;
  has_next: boolean;
}

export interface AtomListResponse {
  data: LearningAtom[];
  page_info: RestPageInfo;
}

// ---------------------------------------------------------------------------
// GraphQL Query/Mutation Payloads
// ---------------------------------------------------------------------------

export interface GraphQLRequest {
  query: string;
  variables?: Record<string, unknown>;
}

export interface GraphQLResponse<T> {
  data: T | null;
  errors?: GraphQLError[];
}

export interface GraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Atom Type Metadata (for UI display)
// ---------------------------------------------------------------------------

export const ATOM_TYPE_LABELS: Record<AtomType, string> = {
  multiple_choice: 'Multiple Choice',
  fill_blank: 'Fill in the Blank',
  true_false: 'True / False',
  short_answer: 'Short Answer',
  matching: 'Matching',
  ordering: 'Ordering',
  code: 'Code',
  essay: 'Essay',
  multimedia: 'Multimedia',
  simulation: 'Simulation',
};

export const VALIDATION_RULE_LABELS: Record<ValidationRuleType, string> = {
  exact_match: 'Exact Match',
  regex: 'Pattern Match',
  range: 'Range Check',
  keyword: 'Keyword Match',
  manual: 'Manual Review',
  llm_graded: 'AI Graded',
};

export const ATOM_TYPE_ICONS: Record<AtomType, string> = {
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

// ---------------------------------------------------------------------------
// Discriminated Union State (AsyncState pattern)
// ---------------------------------------------------------------------------

export type AtomState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; atom: LearningAtom }
  | { status: 'error'; error: { code: string; message: string; correlationId?: string } };

export type AtomListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; atoms: LearningAtom[]; pageInfo: PageInfo; totalCount: number | null }
  | { status: 'error'; error: { code: string; message: string } };

export type TopicTreeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; topics: TopicNode[] }
  | { status: 'error'; error: { code: string; message: string } };

export type ValidationState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; result: ValidationResult }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

export function isAtomType(value: string): value is AtomType {
  return [
    'multiple_choice', 'fill_blank', 'true_false', 'short_answer',
    'matching', 'ordering', 'code', 'essay', 'multimedia', 'simulation',
  ].includes(value);
}

export function isAtomStatus(value: string): value is AtomStatus {
  return ['draft', 'published', 'archived'].includes(value);
}

// ---------------------------------------------------------------------------
// DailyDose (Card Stack — UX §7)
// ---------------------------------------------------------------------------

export type ComboTier = 1 | 2 | 3 | 4;

export interface DailyDoseCard {
  atom: LearningAtom;
  topic_label: string;
  estimated_seconds: number;
  is_goal_aligned: boolean;
  source: 'ebbinghaus' | 'curiosity' | 'weakness';
}

export interface DailyDoseSession {
  cards: DailyDoseCard[];
  combo: ComboTier;
  xp_earned: number;
  completed_count: number;
}

export type DailyDoseState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; session: DailyDoseSession }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// KnowledgeGraph (Graph Visualization — UX §1)
// ---------------------------------------------------------------------------

export type RetentionLevel = 'high' | 'medium' | 'low' | 'unknown';

export interface GraphTopicNode extends TopicNode {
  retention_percent: number | null;
  retention_level: RetentionLevel;
  x?: number;
  y?: number;
}

export type KnowledgeGraphState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; nodes: GraphTopicNode[]; edges: GraphEdge[] }
  | { status: 'error'; error: { code: string; message: string } };

export interface GraphEdge {
  source_id: string;
  target_id: string;
}

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

export function hasHints(content: Record<string, unknown>): content is Record<string, unknown> & { hints: string[] } {
  return Array.isArray(content['hints']);
}

export function hasStem(content: Record<string, unknown>): content is Record<string, unknown> & { stem: string } {
  return typeof content['stem'] === 'string';
}
