/**
 * C+ (Circle+) bounties models — Wave 3 in-memory mock shapes.
 *
 * Mirrors the eventual `GET /v1/sharing/bounties` BFF response.
 * Source of truth for shape: cplus-bounties.service.ts fixture.
 */

export type BountyKind =
  | 'refer_a_friend'
  | 'familiar_mission'
  | 'community';

export type BountyCurrency = 'xp' | 'coins' | 'reputation' | 'mana';

export type BountyClaimState = 'open' | 'claimed' | 'expired';

export interface BountyReward {
  readonly amount: number;
  readonly currency: BountyCurrency;
}

export interface Bounty {
  readonly bounty_id: string;
  readonly kind: BountyKind;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly reward: BountyReward;
  readonly expires_at: string;
  readonly claim_state: BountyClaimState;
  readonly sponsor_display_name: string;
}

export interface CPlusBountiesSnapshot {
  readonly active_count: number;
  readonly weekly_streak_days: number;
  readonly bounties: readonly Bounty[];
}

export type CPlusBountiesState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly snapshot: CPlusBountiesSnapshot }
  | {
      readonly status: 'error';
      readonly error: { readonly code: string; readonly message: string };
    };
