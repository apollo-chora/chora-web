/**
 * C+ (Circle+) connections models — Atom Sharing Redesign (Phase 3).
 *
 * Mirrors the exact wire DTOs emitted by chora-sharing
 * `GET /v1/connections?type=following|followers|blocked`
 * (via the chora-gateway social aggregator). Source:
 * `services/chora-sharing/internal/adapter/http/connection_handlers.go`.
 *
 * Snake_case on the wire — mirrors the Go handler exactly. No view-model
 * smoothing here; components apply honest fallbacks at render time
 * (absent display name → GCID short handle, never fabricated).
 */

/** A single connection entry on the wire — `gcid` + optional `display_name` + `created_at`. */
export interface ConnectionEntry {
  readonly gcid: string;
  readonly display_name?: string;
  /** RFC 3339 timestamp — when the connection was established. */
  readonly created_at: string;
}

/** `GET /v1/connections?type=...` response envelope — keyset cursor pagination. */
export interface ConnectionsPage {
  readonly connections: readonly ConnectionEntry[];
  /** Opaque keyset cursor; absent/empty when no more pages. */
  readonly next_cursor?: string;
}

/** Which connection list to load — mirrors the `?type=` query param. */
export type ConnectionType = 'following' | 'followers' | 'blocked';

/** Discriminated-union state for the connections loading flow. */
export type ConnectionsState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly page: ConnectionsPage }
  | {
      readonly status: 'error';
      readonly error: { readonly code: string; readonly message: string };
    };

/** One relationship write the learner can perform on another member. */
export type RelationshipAction =
  | 'follow'
  | 'unfollow'
  | 'block'
  | 'unblock';

/**
 * State of the most recent relationship write. `pending` disables that row's
 * buttons; `error` carries the fail-loud i18n key (409 refusals stay
 * deliberately unspecific — the backend never discloses block existence).
 */
export type RelationshipActionState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'pending';
      readonly action: RelationshipAction;
      readonly gcid: string;
    }
  | {
      readonly status: 'error';
      readonly action: RelationshipAction;
      readonly gcid: string;
      readonly error: { readonly code: string; readonly message: string };
    };

/**
 * Lookup sets for deriving which actions apply to a person row (loaded from
 * the following + blocked lists). Honest derivation only — an absent GCID
 * means "not known to be related", never a fabricated state.
 */
export interface RelationSets {
  readonly following: ReadonlySet<string>;
  readonly blocked: ReadonlySet<string>;
}

/** Empty relation sets (initial + post-error state). */
export const EMPTY_RELATION_SETS: RelationSets = {
  following: new Set<string>(),
  blocked: new Set<string>(),
};

// ---------------------------------------------------------------------------
// Hybrid suggestions (Phase 1 — backend-side candidate ranking by shared
// interest tags + mutual follows; replaces the old FoF mutual_friends list).
// ---------------------------------------------------------------------------

/**
 * One ranked hybrid suggestion on the wire — mirrors the Phase 1
 * `GET /v1/connections/suggestions` response entry exactly.
 *
 * `shared_tags` are the taxonomy tags the viewer and the candidate both
 * follow; `mutual_follows` is how many people the viewer follows who also
 * follow this candidate (zero when none — absent signal, never fabricated).
 */
export interface FollowSuggestionEntry {
  readonly gcid: string;
  readonly display_name?: string;
  readonly shared_tags: readonly string[];
  readonly mutual_follows: number;
}

/** Discriminated-union state for the suggestions tab. */
export type SuggestionsState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly suggestions: readonly FollowSuggestionEntry[];
    }
  | {
      readonly status: 'error';
      readonly error: { readonly code: string; readonly message: string };
    };
