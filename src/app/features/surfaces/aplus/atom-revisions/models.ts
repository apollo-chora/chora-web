/**
 * Atom Revisions models — A+ revision timeline view (WS-7).
 *
 * Wire shape mirrors `GET /api/v1/atoms/{atomId}/revisions` as contracted in
 * `chora-contracts/openapi/creation-admin.yaml` §AtomRevision /
 * AtomRevisionPage.
 *
 * BFF gateway endpoint status: NOT yet wired in chora-gateway
 * (no `ListAtomRevisions` handler in gatewayproxy.go as of 2026-05-26).
 * The service calls the expected path `/api/atoms/{atomId}/revisions` and
 * fails loud (A17-style contract-gap banner) until the BE ships the proxy
 * handler. Follow-up BE ask filed as WS-7-BE-A1 in the handoff doc.
 *
 * AtomRevision is append-only per ddd-enforcement.md §Aggregate Invariants
 * invariant #4 — never UPDATE or DELETE in place.
 */

/** Atom-type-specific content snapshot (JSONB, opaque at FE layer). */
export type RevisionContent = Record<string, unknown>;

/**
 * AtomRevision wire DTO.
 * Matches `creation-admin.yaml` §AtomRevision schema exactly.
 * Fields mirror the contract; no synthetic additions.
 */
export interface AtomRevision {
  /** Revision aggregate id (UUIDv7). */
  readonly revision_id: string;
  /** Atom aggregate id (UUIDv7). */
  readonly atom_id: string;
  /**
   * Monotonically increasing revision counter within an atom.
   * AtomRevision is append-only — this number never decreases.
   */
  readonly revision_number: number;
  /**
   * Atom-type-specific content snapshot (JSONB).
   * Optional — may be absent when the listing endpoint elides content
   * to reduce payload size.
   */
  readonly content?: RevisionContent;
  /** Hex SHA-256 of the canonical content JSONB. */
  readonly content_hash: string;
  /** Validation rule type applied to this revision (opaque string). */
  readonly validation_rule_type: string;
  /** GCID of the author who published this revision. */
  readonly published_by_gcid: string;
  /** ISO-8601 UTC timestamp of when this revision was published. */
  readonly published_at: string;
  /**
   * Optional author summary / commit message written at publish time.
   * Not in the OpenAPI schema but expected to be added as an additive
   * field by BE; treated as optional + absent-safe.
   */
  readonly summary?: string;
}

/** Page envelope from `GET /api/atoms/{atomId}/revisions`. */
export interface AtomRevisionPage {
  readonly revisions: readonly AtomRevision[];
  /** Opaque UUIDv7-based cursor for the next page (absent when exhausted). */
  readonly cursor?: string;
}

// ── AsyncState discriminated union ─────────────────────────────────────────

/** Loading state for the revision timeline. */
export type AtomRevisionListState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly page: AtomRevisionPage }
  | { readonly status: 'error'; readonly error: string };

/**
 * Diff view state for a single revision card.
 * The FE computes a simplified before/after diff from the content snapshot —
 * no separate diff endpoint required.
 */
export interface RevisionDiff {
  /** Human-readable before snapshot (revision N-1 content JSON string). */
  readonly before: string;
  /** Human-readable after snapshot (this revision's content JSON string). */
  readonly after: string;
}
