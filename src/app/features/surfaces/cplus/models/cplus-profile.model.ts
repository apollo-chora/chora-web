/**
 * C+ (Circle+) profile models — Wave 2 in-memory mock shapes.
 *
 * Mirrors the eventual `GET /v1/sharing/me/profile` (own) and
 * `GET /v1/sharing/profiles/{gcid}` (peer) BFF responses.
 * Source of truth for shape: cplus-profile.service.ts fixture.
 */

export type CPlusProfileViewMode = 'own' | 'peer';

export type CPlusReputationTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface CPlusCurrency {
  readonly xp: number;
  readonly xp_delta_week: number;
  readonly coins: number;
  readonly coins_delta_week: number;
  readonly reputation: number;
  readonly reputation_tier: CPlusReputationTier;
  readonly reputation_tier_progress_percent: number;
}

export interface CPlusFamiliarSummary {
  readonly name: string;
  readonly level: number;
  readonly bond_meter_percent: number;
  readonly tagline: string;
}

export interface CPlusRecentCompletion {
  readonly course_id: string;
  readonly course_title: string;
  readonly issuer_display_name: string;
  readonly completed_at: string;
  readonly atoms_mastered: number;
}

export interface CPlusContributedAtom {
  readonly atom_id: string;
  readonly title: string;
  readonly icon: string;
  readonly published_relative: string;
}

export interface CPlusDuelRecord {
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly win_rate_percent: number;
}

export interface CPlusReputationBreakdown {
  readonly authoring: number;
  readonly review: number;
  readonly mentorship: number;
}

export interface CPlusProfile {
  readonly gcid: string;
  readonly display_name: string;
  readonly tenants: readonly string[];
  readonly level: number;
  readonly is_following: boolean | null;
  readonly view_mode: CPlusProfileViewMode;
  readonly familiar: CPlusFamiliarSummary;
  readonly currency: CPlusCurrency;
  readonly reputation: CPlusReputationBreakdown;
  readonly recent_completions: readonly CPlusRecentCompletion[];
  readonly contributed_atoms: readonly CPlusContributedAtom[];
  readonly duel_record: CPlusDuelRecord | null;
  readonly followers_count: number;
  readonly connections_count: number;
  readonly duel_score: number;
  readonly contributions_count: number;
  readonly quality_score: number;
}

export type CPlusProfileState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly profile: CPlusProfile }
  | {
      readonly status: 'error';
      readonly error: { readonly code: string; readonly message: string };
    };
