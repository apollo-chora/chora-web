export type DuelStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'forfeited' | 'expired';
export type DuelScope = 'friendly' | 'ranked';
export type DuelMode = 'classic' | 'blitz';
export type BlitzVariant = 'timed' | 'race';

export interface DuelDetail {
  readonly duel_id: string;
  readonly status: DuelStatus;
  readonly scope: DuelScope;
  readonly challenger_gcid: string;
  readonly opponent_gcid: string;
  readonly score_challenger: number;
  readonly score_opponent: number;
  readonly combo_challenger: number;
  readonly combo_opponent: number;
  readonly winner_gcid?: string;
  readonly interest_tags?: readonly string[];
  readonly round_count: number;
}

export type DuelCategory =
  | 'overall'
  | 'programming'
  | 'mathematics'
  | 'science'
  | 'humanities'
  | 'arts'
  | 'languages';

export type MatchmakingStatus = 'finding' | 'matched' | 'cancelled' | 'expired' | 'abandoned';

export interface QueueResponse {
  readonly status: MatchmakingStatus;
  readonly expires_at?: string;
  readonly now?: string;
  readonly duel_id?: string;
}

export type QueueState =
  | { readonly status: 'idle' }
  | { readonly status: 'finding'; readonly expires_at?: string }
  | { readonly status: 'matched'; readonly duel_id: string }
  | { readonly status: 'error'; readonly error: { readonly code: string; readonly message: string } };

export interface DuelRating {
  readonly gcid: string;
  readonly rating: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly peak_elo: number;
  readonly completed_courses: number;
  readonly course_bonus: number;
  readonly proficiency: number;
}

export interface DuelLeaderboardEntry {
  readonly gcid: string;
  readonly display_name?: string;
  readonly rating: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly peak_elo: number;
  readonly category?: string;
}

export type RatingState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly rating: DuelRating }
  | { readonly status: 'error'; readonly error: { readonly code: string; readonly message: string } };

export type LeaderboardState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly entries: readonly DuelLeaderboardEntry[] }
  | { readonly status: 'error'; readonly error: { readonly code: string; readonly message: string } };

export type DuelListState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly duels: readonly DuelDetail[] }
  | { readonly status: 'error'; readonly error: { readonly code: string; readonly message: string } };
