/**
 * A+ Search Hub — model types (WS-8).
 *
 * Federated search across three result kinds:
 *   - 'atom'       → GET /api/v1/search/atoms  (Meilisearch, LIVE per gateway.yaml)
 *   - 'course'     → GET /api/catalog?public=true  (BFF fan-out, LIVE)
 *   - 'collection' → GET /api/v1/collections/search  (WS-6a — NOT YET WIRED;
 *                    follow-up BE ask #1)
 *
 * Wire shapes mirror the deployed gateway.yaml AtomSearchHit +
 * catalog.model CatalogCourse + the anticipated collection shape
 * (mirrors the task spec for WS-6a). The search service fails loud
 * per feedback_no_stubs_real_wiring — no in-memory fallbacks.
 *
 * Domain vocabulary:
 *   LearningAtom  — smallest knowledge unit (never "question/item/lesson")
 *   Course/Class  — Content Delivery aggregate
 *   Collection    — NOT a core domain aggregate (WS-6a in flight)
 *
 * localStorage key: `chora.aplus.search.recent` (max 10 items, plain string[])
 */

// ─── Kind discriminator ──────────────────────────────────────────────────────

export type SearchResultKind = 'atom' | 'course' | 'collection';

// ─── Per-kind result shapes (mirror real wire DTOs) ──────────────────────────

/**
 * Atom result from GET /api/v1/search/atoms (gateway.yaml#AtomSearchHit).
 * Content excerpt may include `<em>` highlight tags from Meilisearch.
 */
export interface AtomSearchResult {
  readonly kind: 'atom';
  readonly id: string;
  readonly title: string;
  readonly content_excerpt?: string;
  readonly atom_type: string;
  readonly difficulty: number;
  readonly labels?: readonly string[];
  readonly topic_names?: readonly string[];
}

/**
 * Course result from GET /api/catalog?public=true (catalog.model#CatalogCourse).
 * Subset of the catalog DTO — only fields needed for the search card.
 */
export interface CourseSearchResult {
  readonly kind: 'course';
  readonly id: string;
  readonly title: string;
  readonly instructor_name?: string;
  readonly enrolled_count: number;
  readonly is_free: boolean;
  readonly price_sgd_cents: number;
  readonly tags: readonly string[];
}

/**
 * Collection result — anticipated shape for GET /api/v1/collections/search.
 * WS-6a is building the Collection aggregate in parallel; endpoint does NOT
 * exist yet. The search service calls it and fails loud (404 → error state).
 * Follow-up BE ask #1: wire GET /api/v1/collections/search on chora-consumption.
 */
export interface CollectionSearchResult {
  readonly kind: 'collection';
  readonly id: string;
  readonly title: string;
  readonly atom_count: number;
  readonly owner_display_name?: string;
}

// ─── Federated envelope ──────────────────────────────────────────────────────

export type FederatedSearchResult =
  | AtomSearchResult
  | CourseSearchResult
  | CollectionSearchResult;

/**
 * Merged federated results from all three endpoints.
 * Sorted by relevance: BFF-provided `score` where available, else recency
 * (most-recently-created first within each kind).
 */
export interface FederatedSearchResponse {
  readonly atoms: readonly AtomSearchResult[];
  readonly courses: readonly CourseSearchResult[];
  readonly collections: readonly CollectionSearchResult[];
}

// ─── Async discriminated load state ─────────────────────────────────────────

export type SearchState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly results: FederatedSearchResponse;
      readonly query: string;
    }
  | { readonly status: 'error'; readonly error: string };

// ─── BFF wire response shapes ────────────────────────────────────────────────

/** Raw shape returned by GET /api/v1/search/atoms */
export interface GatewayAtomSearchResponse {
  readonly hits: readonly GatewayAtomHit[];
  readonly pagination: GatewaySearchPagination;
  readonly processing_time_ms: number;
  readonly query: string;
  readonly facets?: Record<string, unknown>;
}

export interface GatewayAtomHit {
  readonly id: string;
  readonly title: string;
  readonly content_excerpt?: string;
  readonly atom_type: string;
  readonly difficulty: number;
  readonly labels?: readonly string[];
  readonly topic_names?: readonly string[];
}

export interface GatewaySearchPagination {
  readonly total_hits: number;
  readonly limit: number;
  readonly offset: number;
  readonly estimated_total?: number;
}

/** Raw shape returned by GET /api/catalog?public=true */
export interface GatewayCatalogResponse {
  readonly items: readonly GatewayCatalogItem[];
}

export interface GatewayCatalogItem {
  readonly id: string;
  readonly title: string;
  readonly instructor_name?: string;
  readonly enrolled_count: number;
  readonly is_free: boolean;
  readonly price_sgd_cents: number;
  readonly tags: readonly string[];
}

/** Anticipated raw shape from GET /api/v1/collections/search (WS-6a — not yet live) */
export interface GatewayCollectionSearchResponse {
  readonly items: readonly GatewayCollectionItem[];
}

export interface GatewayCollectionItem {
  readonly id: string;
  readonly title: string;
  readonly atom_count: number;
  readonly owner_display_name?: string;
}

// ─── localStorage helpers ────────────────────────────────────────────────────

export const RECENT_SEARCHES_KEY = 'chora.aplus.search.recent' as const;
export const RECENT_SEARCHES_MAX = 10 as const;

/**
 * Persist a search query to localStorage (max 10, dedup, most recent first).
 * Safe to call from non-browser environments — catches Storage exceptions.
 */
export function pushRecentSearch(query: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    const existing: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    const deduped = [query, ...existing.filter((q) => q !== query)].slice(
      0,
      RECENT_SEARCHES_MAX,
    );
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(deduped));
  } catch {
    // Storage full or private mode — fail silently
  }
}

/**
 * Read recent searches from localStorage. Returns `[]` on any error.
 */
export function loadRecentSearches(): readonly string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}
