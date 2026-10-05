/**
 * C+ (Circle+) bookmark models — atom save-to-collection.
 *
 * Mirrors the wire DTOs from chora-sharing
 * `GET /v1/me/bookmarks` + `POST/DELETE /v1/atoms/{atom_id}/bookmark`.
 */

/** A single bookmark entry on the wire. */
export interface BookmarkEntry {
  readonly id: string;
  readonly atom_id: string;
  readonly atom_revision_id: string;
  readonly created_at: string;
}

/** `GET /v1/me/bookmarks` response envelope — keyset cursor pagination. */
export interface BookmarksPage {
  readonly bookmarks: readonly BookmarkEntry[];
  readonly next_cursor?: string;
}

/** Discriminated-union state for bookmark operations. */
export type BookmarkState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'saved' }
  | { readonly status: 'removing' }
  | { readonly status: 'removed' }
  | { readonly status: 'error'; readonly error: { readonly code: string; readonly message: string } };
