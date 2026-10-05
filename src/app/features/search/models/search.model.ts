/**
 * Search domain models for full-text search with faceted filtering.
 *
 * Source of truth: chora-contracts/openapi/gateway.yaml (Search endpoints)
 * Backend returns snake_case JSON — these interfaces match directly.
 */

// ---------------------------------------------------------------------------
// Enums / Literal Unions
// ---------------------------------------------------------------------------

export type SearchCategory = 'atoms' | 'topics' | 'paths';

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

export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

export type SearchSortField = 'relevance' | 'difficulty:asc' | 'difficulty:desc' | 'title:asc' | 'title:desc';

// ---------------------------------------------------------------------------
// Search Query
// ---------------------------------------------------------------------------

export interface SearchQuery {
  q: string;
  category: SearchCategory;
  type?: string;
  difficulty?: string;
  topic?: string;
  sort?: SearchSortField;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface SearchPagination {
  total_hits: number;
  limit: number;
  offset: number;
  estimated_total?: number;
}

// ---------------------------------------------------------------------------
// Atom Search
// ---------------------------------------------------------------------------

export interface AtomSearchHit {
  id: string;
  title: string;
  content_excerpt?: string;
  atom_type: AtomType;
  difficulty: DifficultyLevel;
  labels?: string[];
  topic_names?: string[];
}

export interface AtomSearchFacets {
  atom_type: Record<string, number>;
  difficulty: Record<string, number>;
}

export interface AtomSearchResponse {
  hits: AtomSearchHit[];
  facets: AtomSearchFacets;
  pagination: SearchPagination;
  processing_time_ms: number;
  query: string;
}

// ---------------------------------------------------------------------------
// Topic Search
// ---------------------------------------------------------------------------

export interface TopicSearchHit {
  id: string;
  name: string;
  description?: string;
  path?: string;
  atom_count?: number;
}

export interface TopicSearchResponse {
  hits: TopicSearchHit[];
  pagination: SearchPagination;
  processing_time_ms: number;
  query: string;
}

// ---------------------------------------------------------------------------
// Path Search
// ---------------------------------------------------------------------------

export interface PathSearchHit {
  id: string;
  title: string;
  description?: string;
  topic_names?: string[];
  total_steps?: number;
  enrollment_count?: number;
}

export interface PathSearchResponse {
  hits: PathSearchHit[];
  pagination: SearchPagination;
  processing_time_ms: number;
  query: string;
}

// ---------------------------------------------------------------------------
// Unified Search Result (for rendering)
// ---------------------------------------------------------------------------

export type SearchHit = AtomSearchHit | TopicSearchHit | PathSearchHit;

// ---------------------------------------------------------------------------
// Active Filters
// ---------------------------------------------------------------------------

export interface ActiveFilters {
  types: string[];
  difficulties: DifficultyLevel[];
  topic: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALL_ATOM_TYPES: AtomType[] = [
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

export const ALL_DIFFICULTY_LEVELS: DifficultyLevel[] = [1, 2, 3, 4, 5];

export const ALL_SEARCH_CATEGORIES: SearchCategory[] = ['atoms', 'topics', 'paths'];

export const DEFAULT_PAGE_SIZE = 20;

export const DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// Label Maps (i18n keys)
// ---------------------------------------------------------------------------

export const ATOM_TYPE_LABELS: Record<AtomType, string> = {
  multiple_choice: 'search.atom_type_multiple_choice',
  fill_blank: 'search.atom_type_fill_blank',
  true_false: 'search.atom_type_true_false',
  short_answer: 'search.atom_type_short_answer',
  matching: 'search.atom_type_matching',
  ordering: 'search.atom_type_ordering',
  code: 'search.atom_type_code',
  essay: 'search.atom_type_essay',
  multimedia: 'search.atom_type_multimedia',
  simulation: 'search.atom_type_simulation',
};

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  1: 'search.difficulty_1',
  2: 'search.difficulty_2',
  3: 'search.difficulty_3',
  4: 'search.difficulty_4',
  5: 'search.difficulty_5',
};

export const SEARCH_CATEGORY_LABELS: Record<SearchCategory, string> = {
  atoms: 'search.category_atoms',
  topics: 'search.category_topics',
  paths: 'search.category_paths',
};

// ---------------------------------------------------------------------------
// Discriminated Union States
// ---------------------------------------------------------------------------

export type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; response: AtomSearchResponse }
  | { status: 'error'; error: { code: string; message: string } };

export type TopicSearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; response: TopicSearchResponse }
  | { status: 'error'; error: { code: string; message: string } };

export type PathSearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; response: PathSearchResponse }
  | { status: 'error'; error: { code: string; message: string } };
