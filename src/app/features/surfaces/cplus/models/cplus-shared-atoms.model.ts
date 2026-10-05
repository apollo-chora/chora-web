/**
 * C+ (Circle+) shared-atom feed models.
 */

export interface RoyaltyRate {
  readonly kind: string;
  readonly value: number;
}

export interface SharedAtomFeedEntry {
  readonly share_entry_id: string;
  readonly author_gcid: string;
  readonly author_display_name: string;
  readonly atom_id: string;
  readonly atom_revision_id: string;
  readonly atom_stem_preview: string;
  readonly atom_options?: readonly string[];
  readonly question_type: string;
  readonly caption?: string;
  readonly license_terms: string;
  readonly royalty_rate?: RoyaltyRate | null;
  readonly reaction_count: number;
  readonly reaction_counts?: Readonly<Record<string, number>>;
  readonly my_reaction?: string;
  readonly created_at: string;
}

export interface SharedAtomsFeedPage {
  readonly cards: readonly SharedAtomFeedEntry[];
  readonly next_cursor?: string;
}

export type FeedScope = 'following' | 'tenant' | 'global';

export type SharedAtomsFeedState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly cards: readonly SharedAtomFeedEntry[];
      readonly nextCursor: string;
    }
  | {
      readonly status: 'error';
      readonly error: { readonly code: string; readonly message: string };
    };
