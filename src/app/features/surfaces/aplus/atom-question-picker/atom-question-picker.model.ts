/**
 * Atom Question Picker — model types (X.1, ADR-155 D1).
 *
 * Standalone reusable component embedded inside the test-set editor (X.2).
 *
 * Domain anchors:
 *   - Atom (the "question") lives in `chora_creation.learning_atoms`
 *     today. Per BE round-22: questions ARE atoms intra-domain — the pg
 *     adapter queries `learning_atoms` directly (the questions table is
 *     empty in the Phyllis seed).
 *   - The picker reads via the BFF gateway:
 *     `GET /api/atoms/questions/search` (live on `chora-creation:qs5552a2a`;
 *     gateway claim at Lane D `25ca2944`).
 *   - The picker EMITS a lightweight `QuestionRef` (single `id` field)
 *     upward; the host (test-set-editor) wires that into
 *     `POST /api/v1/test-sets/:id/questions` as `question_atom_id` with
 *     the chosen points.
 *
 * Wire-shape note: the live BE handler returns a flat
 * `{id, title, stem, question_type, tenant_id, author_gcid, ...}` shape,
 * NOT the richer `chora-contracts/openapi/creation-questions.yaml` shape
 * with `question_id`/`atom_id`/`atom_title`/`prompt_preview`/`difficulty`
 * etc. FE conforms to deployed BE (per user directive 2026-05-16); the
 * contract drift is filed back.
 *
 * Pagination is PAGE-NUMBER, and only page-number. The live handler
 * (`services/chora-creation/internal/adapter/http/questions_handler.go`) reads
 * `page` (1-based, default 1) + `per` (default 20, max 100) and always writes
 * `{items, page, per, total, partial_result, saved_truncated}`.
 *
 * ⚠ There is NO cursor. A previous revision of this comment claimed the BE
 * supported "cursor (`next_page_token`) AND page-number ... both", and the FE
 * was built to the cursor half: it sent `page_size`/`page_token`, which no
 * handler has ever parsed, and read `next_page_token`, which no handler has
 * ever written. The effects were invisible because `page_size=20` happened to
 * equal the BE's own default `per=20` — so page 1 looked correct while asking
 * for 50 silently returned 20 and "load more" could never appear. The cursor
 * dialect is deleted here rather than deprecated; `total` arrives on every
 * response, so end-of-list is `page * per >= total`.
 *
 * Page size is an explicit enum {10, 20, 50, 100} surfaced via a native
 * `<select>` (Angular Material is not in chora-web deps).
 */

/** Canonical Phyllis-scope question types per creation-questions.yaml. */
export type QuestionType =
  | 'mcq'
  | 'oe'
  | 'reserved_code_execution'
  | 'reserved_completion'
  | 'reserved_drag_drop'
  | 'reserved_fill_blank'
  | 'reserved_matching'
  | 'reserved_multi_select'
  | 'reserved_multimedia'
  | 'reserved_oral'
  | 'reserved_ordering'
  | 'reserved_peer_graded'
  | 'reserved_short_answer'
  | 'reserved_simulation'
  | 'reserved_table_completion'
  | 'reserved_true_false';

/** Cognitive level enum (Bloom's taxonomy) per QuestionMetadata. */
export type CognitiveLevel =
  | 'remembering'
  | 'understanding'
  | 'applying'
  | 'analyzing'
  | 'evaluating'
  | 'creating';

/** Atom lifecycle state filter values. */
export type AtomState = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/**
 * Picker source filter (ux_unified_atom_picker.md). Controls which atoms the
 * search returns:
 *   - `mine`  — atoms authored by the caller.
 *   - `saved` — atoms the caller bookmarked via C+.
 *   - `all`   — union of mine + saved (default).
 */
// 'enrolled' is a DIFFERENT ENTITLEMENT MODEL from the others (ADR-243): the
// rest ask "may this learner REUSE this atom?" (ADR-229 author consent), while
// 'enrolled' asks "does this learner already have access?" (they are on a
// LearningPath containing it). The two are deliberately never merged silently:
// every row carries a badge saying which one admitted it.
export type PickerSource = 'mine' | 'saved' | 'all' | 'enrolled';

/** Explicit enum for page_size per ADR-155 D4. */
export type PageSize = 10 | 20 | 50 | 100;

export const PAGE_SIZE_OPTIONS: readonly PageSize[] = [10, 20, 50, 100] as const;

/** Default page size per ADR-155 D4. */
export const DEFAULT_PAGE_SIZE: PageSize = 20;

/** Default sort per ADR-155 D4 — newest first. */
export const DEFAULT_SORT = 'created_at:desc';

/**
 * The question types an author can actually CREATE and OPEN.
 *
 * The other 14 `reserved_*` members of QuestionType exist in the contract but
 * have no authoring surface, so listing them would show rows the author cannot
 * open. This narrowing used to be a bare `['mcq','oe']` literal inside
 * StudioAtomsComponent.composeQuery(); naming it makes the invariant explicit,
 * testable, and reusable by the type filter (which narrows WITHIN this set,
 * never outside it).
 */
export const AUTHORABLE_QUESTION_TYPES: readonly QuestionType[] = [
  'mcq',
  'oe',
] as const;

/**
 * Sort options the Studio inventory offers.
 *
 * 🔴 Every `field` here MUST be whitelisted by the BE — `sortFieldColumns` in
 * services/chora-creation/internal/domain/question/search.go (created_at,
 * updated_at, title, question_type, prompt). An unlisted field is rejected at
 * the boundary with a 400, so this list and that map are two copies of one
 * contract: they cannot be unified from the FE, so `atom-question-picker.model.spec.ts`
 * TESTS that every value here is in the BE whitelist. Live-probed 2026-07-16
 * against deployed prod: updated_at:asc|desc and title:asc all 200 and reorder;
 * bogus_field:desc → 400.
 */
export type SortOption =
  | 'created_at:desc'
  | 'updated_at:desc'
  | 'title:asc';

export const SORT_OPTIONS: readonly SortOption[] = [
  'created_at:desc',
  'updated_at:desc',
  'title:asc',
] as const;

/**
 * The BE's sort-field whitelist, mirrored for the drift guard above. Keep in
 * lockstep with question.sortFieldColumns; a value absent here that the FE
 * offers would 400 at runtime.
 */
export const BE_WHITELISTED_SORT_FIELDS: readonly string[] = [
  'created_at',
  'updated_at',
  'title',
  'question_type',
  'prompt',
] as const;

/**
 * Lightweight question projection from the chora-creation search endpoint.
 *
 * Wire shape per the live `GET /api/atoms/questions/search` BE handler
 * (smoke-verified 2026-05-16 against `chora-creation:qs5552a2a` on
 * api.chora.site). Per BE round-22: "questions ARE atoms intra-domain"
 * — the pg adapter queries `learning_atoms` directly (questions table
 * is empty in the Phyllis seed). The flat shape below is the canonical
 * source of truth; `chora-contracts/openapi/creation-questions.yaml`
 * trails BE today (its richer schema with `question_id`/`atom_id`/
 * `atom_title`/`prompt_preview`/`difficulty`/etc. is unfulfilled —
 * filed back to BE).
 */
export interface QuestionSearchResult {
  /** UUIDv7 of the atom (also serves as the question_id since
   *  questions ARE atoms in the current intra-domain implementation). */
  readonly id: string;
  /** Atom title — rendered as the picker card heading. */
  readonly title: string;
  /** Atom stem — rendered as the picker card preview text. */
  readonly stem: string;
  readonly question_type: QuestionType;
  readonly tenant_id: string;
  readonly author_gcid: string;
  /**
   * Picker provenance hint (ADR-229 WS-2, CHO-2133) — WHY the row is usable:
   * `mine` = authored by caller; `saved` = bookmarked by caller; `granted` =
   * active AtomUsageGrant (includes repointed orphan editions); `tenant` =
   * author opted the atom into tenant-wide reuse. Server priority:
   * mine > saved > granted > tenant.
   */
  readonly source?: 'mine' | 'saved' | 'granted' | 'tenant' | 'enrolled';
  /** ADR-229 author-consent audience label (private | friends | tenant). */
  readonly reuse_visibility?: string;
  /**
   * Orphan-edition provenance (ADR-229 A1.1/A1.3, sibling lane CHO-2132) —
   * the ORIGINAL atom id when this row is a frozen "no longer shared" orphan
   * edition. Additive: absent until the orphan machinery deploys; absence is
   * normal, never an error. Bridges may camelise — coalesce via
   * `orphanedFrom(row)`.
   */
  readonly orphaned_from_atom_id?: string | null;
  readonly orphanedFromAtomId?: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Coalesce the orphan-edition provenance across wire variants: canonical
 * snake_case (`orphaned_from_atom_id`) first, then the camelised bridge
 * variant (`orphanedFromAtomId` — e.g. gateway FamiliarBridge-style
 * camelisation). Returns null when the row is not an orphan edition —
 * absence is normal (the field only appears once CHO-2132 deploys).
 */
export function orphanedFrom(row: {
  readonly orphaned_from_atom_id?: string | null;
  readonly orphanedFromAtomId?: string | null;
}): string | null {
  const snake = row.orphaned_from_atom_id;
  if (typeof snake === 'string' && snake.length > 0) return snake;
  const camel = row.orphanedFromAtomId;
  if (typeof camel === 'string' && camel.length > 0) return camel;
  return null;
}

/**
 * The response envelope the live handler writes — `questionSearchResponse` in
 * questions_handler.go. `total` is unconditional (no opt-in param gates it).
 */
export interface QuestionSearchResponse {
  readonly items: readonly QuestionSearchResult[];
  /** Echo of the 1-based page served. */
  readonly page?: number;
  /** Echo of the page size served (the BE clamps to max 100). */
  readonly per?: number;
  /** Total matching rows across all pages — always present. */
  readonly total?: number | null;
  /** True when the chora-sharing gRPC fan-out failed — `saved` may be incomplete. */
  readonly partial_result?: boolean;
  /** True when the caller's saved-atom count exceeded the 500-row cap. */
  readonly saved_truncated?: boolean;
}

/**
 * Query knobs that fire a search (debounced 300ms).
 *
 * Every field here maps to a param the BE actually reads. `page_size`,
 * `page_token` and `include_total` are deliberately ABSENT — see the cursor
 * note in this file's header.
 */
export interface QuestionSearchQuery {
  readonly q?: string;
  readonly question_type?: readonly QuestionType[];
  readonly topic_node_id?: readonly string[];
  readonly tag?: readonly string[];
  readonly atom_id?: readonly string[];
  readonly state?: readonly AtomState[];
  readonly source?: PickerSource;
  /** Exact match on the atom author (`gcid` column). BE 400s a non-UUID. */
  readonly author_gcid?: string;
  readonly sort?: string;
  /** 1-based page index. Omitted ⇒ the BE serves page 1. */
  readonly page?: number;
  /** Page size. Omitted ⇒ the BE serves its own default of 20. */
  readonly per?: PageSize;
}

/**
 * Emitted by the picker on row click. The host (test-set-editor) takes
 * this + chosen points and POSTs to /api/v1/test-sets/:id/questions.
 *
 * Single `id` field — per BE round-22 questions ARE atoms intra-domain,
 * so question_id and atom_id are the same UUID. `points_suggestion` is
 * unused today (BE doesn't return `difficulty` on the search wire);
 * kept on the type as an optional hint hook for when BE enriches.
 */
export interface QuestionRef {
  readonly id: string;
  readonly title: string;
  readonly stem: string;
  readonly question_type: QuestionType;
  readonly points_suggestion?: number;
}

/** Fail-loud discriminated load state — same shape as catalog / familiar-chat. */
export type QuestionPickerLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'success';
      results: readonly QuestionSearchResult[];
      /** 1-based index of the last page loaded (rows accumulate on Load more). */
      page: number;
      per: number;
      total: number | null;
    }
  | { status: 'error'; error: string };

/**
 * Whether another page exists behind the one loaded. Page-number arithmetic
 * over the unconditional `total` — this is what replaces the cursor token the
 * BE never sent. An absent total (a BE that stopped writing it) reads as
 * end-of-list rather than an infinite "Load more".
 */
export function hasMorePages(
  page: number,
  per: number,
  total: number | null,
): boolean {
  if (total === null || per <= 0) return false;
  return page * per < total;
}

/**
 * Map a `QuestionSearchResult` row to the lightweight `QuestionRef`
 * the host consumes. Pure function — no side effects.
 */
export function toQuestionRef(row: QuestionSearchResult): QuestionRef {
  return {
    id: row.id,
    title: row.title,
    stem: row.stem,
    question_type: row.question_type,
  };
}

/**
 * ADR-243 Source A wire shape, served by chora-consumption at
 * GET /api/v1/me/concept-graph/attachable-atoms.
 *
 * `source` is the ENTITLEMENT REASON, not a category. It is non-optional on the
 * wire on purpose: an unlabelled candidate is precisely the failure this design
 * exists to avoid, since the picker shows two different entitlement models side
 * by side.
 */
export interface AttachableAtom {
  readonly atomId: string;
  readonly title: string;
  readonly atomType?: string;
  readonly topic?: string;
  readonly topics?: readonly string[];
  readonly courseId?: string;
  /** RFC3339, or absent. Never fabricated by the server. */
  readonly publishedAt?: string;
  readonly source: 'enrolled';
}

export interface AttachableAtomsResponse {
  readonly items: readonly AttachableAtom[];
}
