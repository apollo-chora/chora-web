/**
 * Collections models — A+ personal collections (WS-6b).
 *
 * Wire shape mirrors the Collection aggregate in
 * `chora-contracts/openapi/creation-admin.yaml` §Collection /
 * CollectionAtomRef / CollectionListResponse.
 *
 * BFF gateway endpoint status (2026-05-26):
 *   GET /api/v1/me/collections     — NOT yet proxied in chora-gateway
 *   GET /api/v1/collections/{id}   — NOT yet proxied in chora-gateway
 *   POST /api/v1/collections       — NOT yet proxied in chora-gateway
 *   PATCH /api/v1/collections/{id} — NOT yet proxied in chora-gateway
 *   DELETE /api/v1/collections/{id}— NOT yet proxied in chora-gateway
 *   POST /api/v1/collections/{id}/atoms            — NOT yet proxied
 *   DELETE /api/v1/collections/{id}/atoms/{atomId} — NOT yet proxied
 *
 * The service calls the expected paths and fails loud (contract-gap banner)
 * until WS-6a-gateway-proxy ships. No mock fallback (per memory
 * feedback_no_stubs_real_wiring).
 *
 * Domain vocabulary: a Collection is a curated, ordered list of
 * LearningAtoms. Never "playlist", "folder", or "album".
 * LearningAtom remains the PRIMARY AGGREGATE ROOT — Collections query
 * atoms, they NEVER own atom content (CLAUDE.md §1 + ddd-enforcement §1).
 */

// ── Visibility ──────────────────────────────────────────────────────────────

/**
 * Audience of a personal Collection — ADR-233 D7.
 *
 * ONE shared audience vocabulary across the platform: these are the SAME three
 * values an atom carries in `reuse_visibility`, so `friends` resolves against
 * the SAME friend set the reuse gate uses (ADR-230). Storage is
 * `TEXT CHECK (visibility IN ('private','friends','tenant'))` — migration
 * `chora-creation/0031_collection_audience` retired the old PG enum, and the Go
 * value object (`internal/domain/audience`) REJECTS the legacy uppercase values
 * outright. Speaking `PRIVATE` / `TENANT_INTERNAL` here is a 400, not a warning.
 *
 * `PUBLIC` is RETIRED. RLS on `collections` is
 * `tenant_id = current_setting('chora.tenant_id')`, so a "public" collection was
 * never readable across tenants — the row is simply invisible. Cross-tenant
 * distribution is a SYNDICATION concern (ADR-229 fork (a): clone + provenance),
 * never a visibility level. Legacy rows were collapsed `PUBLIC → tenant`, which
 * preserves their effective audience exactly.
 *
 * Mirrors `creation-admin.yaml §CollectionVisibility`.
 */
export type CollectionVisibility = 'private' | 'friends' | 'tenant';

// ── Wire DTOs (mirror wire shape exactly — no synthetic fields) ─────────────

/**
 * Child membership row — references a LearningAtom by UUID.
 * Mirrors `creation-admin.yaml §CollectionAtomRef`.
 */
export interface CollectionAtomRef {
  readonly collection_id: string;
  readonly atom_id: string;
  /** 0-based ordering slot within the Collection. */
  readonly position: number;
  readonly added_at: string;
}

/**
 * Collection aggregate DTO.
 * Mirrors `creation-admin.yaml §Collection` exactly.
 * atom_count is derived client-side from atoms.length when atoms is present.
 */
export interface Collection {
  readonly collection_id: string;
  readonly tenant_id: string;
  readonly owner_gcid: string;
  readonly title: string;
  readonly description?: string;
  readonly visibility: CollectionVisibility;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at?: string | null;
  /** Ordered atom membership rows — present on detail GET, absent on list GET. */
  readonly atoms?: readonly CollectionAtomRef[];
}

/** List response envelope from `GET /api/v1/me/collections`. */
export interface CollectionListResponse {
  readonly items: readonly Collection[];
  readonly total: number;
}

// ── Request shapes ──────────────────────────────────────────────────────────

export interface CreateCollectionRequest {
  readonly title: string;
  readonly description?: string;
  /** Defaults to `private` when omitted. */
  readonly visibility?: CollectionVisibility;
}

export interface PatchCollectionRequest {
  readonly title?: string;
  readonly description?: string;
  readonly visibility?: CollectionVisibility;
}

export interface AddCollectionAtomRequest {
  readonly atom_id: string;
  /** Optional 0-based ordering slot. Omitted ⇒ append at next free position. */
  readonly position?: number;
}

// ── Convert to study list (WS-4 · ADR-233) ──────────────────────────────────

/**
 * Why a curated atom did NOT make it into the derived study list.
 *
 * ADR-233 D11: entitlement is re-evaluated PER ATOM at conversion time, against
 * the CONVERTING learner's GCID. An atom the learner curated earlier can fail
 * the gate now because the author has since narrowed / unpublished / unshared
 * it. Those atoms are dropped and NAMED — never dropped silently.
 *
 * These are the four codes the backend actually emits. The reason set is still
 * not treated as closed at the RENDER boundary — the renderer falls back to a
 * generic human line for any code it does not know, so a raw reason code can
 * never reach the learner even if a future code ships ahead of the UI.
 */
export type StudyListExclusionReason =
  | 'REUSE_VISIBILITY_NARROWED'
  | 'ATOM_NOT_PUBLISHED'
  | 'NOT_IN_FRIEND_SET'
  | 'ATOM_NOT_FOUND';

/**
 * One named exclusion from a conversion.
 * `reason` is typed as `string` (not the union) because the wire is the source
 * of truth and may carry a code this build does not know yet — mirror the wire
 * honestly and render defensively.
 */
export interface StudyListExclusion {
  readonly atom_id: string;
  readonly reason: string;
}

/**
 * 201 response of POST /api/v1/collections/{id}/convert-to-study-list.
 *
 * This is a PARTIAL SUCCESS envelope (ADR-233 D11): `atom_count` atoms were
 * added to the learner's study list, and every atom that was left behind is
 * named in `excluded` with a reason. The Collection itself is NOT mutated — the
 * excluded atoms stay curated, so if the author re-widens access a later
 * convert picks them up.
 *
 * Zero survivors is NOT this shape — it is a 409
 * (CREATION_COLLECTION_NO_ENTITLED_ATOMS). An empty study list is never emitted.
 */
export interface ConvertToStudyListResponse {
  readonly study_list_event_id: string;
  readonly atom_count: number;
  readonly excluded: readonly StudyListExclusion[];
}

// ── AsyncState discriminated unions ─────────────────────────────────────────

/** AsyncState for the collections list page. */
export type CollectionListState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly items: readonly Collection[]; readonly total: number }
  | { readonly status: 'error'; readonly error: string };

/** AsyncState for the collection detail page. */
export type CollectionDetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly collection: Collection }
  | { readonly status: 'error'; readonly error: string };

/**
 * AsyncState for the collections-edit form.
 * Covers both create-mode (no initial collection) and edit-mode (existing).
 */
export type CollectionEditState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly collection: Collection }
  | { readonly status: 'error'; readonly error: string };

/** AsyncState for atom add/remove operations on detail page. */
export type CollectionAtomOpState =
  | { readonly status: 'idle' }
  | { readonly status: 'pending'; readonly atomId: string }
  | { readonly status: 'error'; readonly error: string; readonly atomId: string };

/**
 * AsyncState for the convert-to-study-list transition (WS-4 · ADR-233).
 * `success` carries the full partial-success envelope so the UI can report both
 * what converted AND what was left behind.
 */
export type CollectionConvertState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly result: ConvertToStudyListResponse }
  | { readonly status: 'error'; readonly error: string };
