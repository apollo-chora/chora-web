/**
 * Moderation verdict models — shared across surfaces.
 *
 * Relocated from `features/surfaces/cplus/models/cplus-feed.model.ts` (Phase 4
 * cleanup) so the `ModerationFeedbackPanelComponent` (shared) doesn't import
 * from the C+ feature. The 422 body shape mirrors chora-sharing exactly.
 */

/** Moderation verdict taxonomy — `pass` never reaches the FE as a 422. */
export type PostVerdict = 'pass' | 'refine' | 'reject' | 'unknown';

/**
 * 422 body shape from chora-sharing. `suggested_rewrite` is only present for
 * `refine`. Snake_case on the wire — mirrors the Go handler exactly.
 */
export interface ModerationVerdict {
  readonly verdict: Exclude<PostVerdict, 'pass'>;
  readonly reason: string;
  readonly suggested_rewrite?: string;
}

/** Composer draft submitted to `POST /api/posts`. */
export interface PostDraft {
  readonly content: string;
  readonly hashtags: readonly string[];
}
