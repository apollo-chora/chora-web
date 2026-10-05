/**
 * C+ (Circle+) leaderboards models — Atom Sharing Redesign (Phase 2).
 *
 * Mirrors the exact wire DTOs emitted by chora-sharing
 * `GET /v1/leaderboard` (via the chora-gateway social aggregator).
 * Source: `services/chora-sharing/internal/adapter/http/social_handlers.go`
 * `leaderboardEntryJSON` (L236) + `getLeaderboardResponse` (L243).
 *
 * Scope/metric/period enums mirror the query-param contract documented on
 * `getLeaderboard` (L249-253): scope global|tenant|class|course, metric
 * xp|duel_wins|duel_elo|reputation|streak_days, period weekly|monthly|all-time.
 */

/** Ranked scope — drives the active tab + the backend `scope` query param. */
export type LeaderboardScope = 'global' | 'tenant' | 'class' | 'course';

/** Ranking metric — drives the backend `metric` query param. */
export type LeaderboardMetric =
  | 'xp'
  | 'duel_wins'
  | 'duel_elo'
  | 'reputation'
  | 'streak_days';

/** Ranking window — drives the backend `period` query param. */
export type LeaderboardPeriod = 'weekly' | 'monthly' | 'all-time';

/** A single ranked row on the wire — mirrors `leaderboardEntryJSON` 1:1. */
export interface LeaderboardEntry {
  readonly gcid: string;
  readonly display_name?: string;
  readonly score: number;
  readonly rank: number;
}

/** `GET /v1/leaderboard` response envelope — keyset cursor pagination. */
export interface LeaderboardPage {
  readonly entries: readonly LeaderboardEntry[];
  /** Opaque keyset cursor; absent/empty when no more pages. */
  readonly next_cursor?: string;
  /** RFC 3339 timestamp of the last board recomputation. */
  readonly computed_at: string;
}

/** Discriminated-union state for leaderboards loading. */
export type LeaderboardsState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly page: LeaderboardPage;
    }
  | {
      readonly status: 'error';
      readonly error: { readonly code: string; readonly message: string };
    };
