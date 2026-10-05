import { Injectable, computed, signal } from '@angular/core';
import { firstValueFrom, of } from 'rxjs';

import {
  Bounty,
  CPlusBountiesSnapshot,
  CPlusBountiesState,
} from '../models/cplus-bounties.model';

/**
 * C+ (Circle+) Wave 3 bounties service.
 *
 * Wave 3 contract: in-memory mock matching the eventual
 * `GET /v1/sharing/bounties` BFF shape. The claim CTA POSTs an idempotent
 * `claim_bounty` action — Wave 3 only flips the local `claim_state` to
 * 'claimed' for optimistic feedback; Wave 4 wires the real BFF call with a
 * `Idempotency-Key` header.
 *
 * Audit-touchpoint closures (per
 * `docs/m13/stitch-interaction-gaps-cplus-rplus-2026-05-12.md` §bounties):
 *  - [P0] Refer-a-Friend bounty visible for Phyllis ("Refer to MTM → 500 ⊙").
 *  - [P0] Familiar Missions surfaced (Eira "Help 3 peers" → 300 Reputation).
 *  - [P0] Daily Dose streak day 7 → 50 Mana bounty visible.
 *  - [P1] Claim CTA idempotent (Wave 3 optimistic; Wave 4 BFF wire).
 */
const INITIAL: CPlusBountiesSnapshot = {
  active_count: 3,
  weekly_streak_days: 7,
  bounties: [
    {
      bounty_id: 'bounty-refer-mtm-friend',
      kind: 'refer_a_friend',
      title: 'Refer a friend to MTM',
      description:
        'Invite a curious peer to join Mr. Chen’s MTM tenant. Payout settles 7 days after the new learner verifies.',
      icon: 'user-plus',
      reward: { amount: 500, currency: 'coins' },
      expires_at: '2026-06-30T00:00:00Z',
      claim_state: 'open',
      sponsor_display_name: 'MTM Tenant Pool',
    },
    {
      bounty_id: 'bounty-eira-mission-help-3-peers',
      kind: 'familiar_mission',
      title: 'Eira Mission: Help 3 peers this week',
      description:
        'Eira the Curious has spotted three peers stuck on Cell Mitosis. Drop a hint atom in their ChoraCircle.',
      icon: 'paw',
      reward: { amount: 300, currency: 'reputation' },
      expires_at: '2026-05-19T00:00:00Z',
      claim_state: 'open',
      sponsor_display_name: 'Eira the Curious',
    },
    {
      bounty_id: 'bounty-daily-dose-streak-7',
      kind: 'familiar_mission',
      title: 'Daily Dose streak: Day 7',
      description:
        'Hit a 7-day streak on Daily Dose to unlock a Mana boost. Eira will celebrate.',
      icon: 'fire',
      reward: { amount: 50, currency: 'mana' },
      expires_at: '2026-05-15T00:00:00Z',
      claim_state: 'open',
      sponsor_display_name: 'Eira the Curious',
    },
    {
      bounty_id: 'bounty-community-cspo-mentor',
      kind: 'community',
      title: 'Mentor a CSPO cohort peer',
      description:
        'Run a 30-min mentorship session in your ChoraCircle and earn community Reputation.',
      icon: 'handshake-angle',
      reward: { amount: 120, currency: 'reputation' },
      expires_at: '2026-05-26T00:00:00Z',
      claim_state: 'open',
      sponsor_display_name: 'MTM Community',
    },
  ],
};

@Injectable({ providedIn: 'root' })
export class CPlusBountiesService {
  private readonly _state = signal<CPlusBountiesState>({ status: 'idle' });
  readonly state = this._state.asReadonly();

  readonly snapshot = computed<CPlusBountiesSnapshot | null>(() => {
    const s = this._state();
    return s.status === 'success' ? s.snapshot : null;
  });

  async loadBountiesMock(): Promise<CPlusBountiesSnapshot> {
    this._state.set({ status: 'loading' });
    const snapshot = await firstValueFrom(of(INITIAL));
    this._state.set({ status: 'success', snapshot });
    return snapshot;
  }

  /**
   * Optimistically marks a bounty as `claimed`. Idempotent — calling twice
   * with the same `bounty_id` is a no-op.
   * Wave 4 will POST `/v1/sharing/bounties/{id}/claim` with
   * `Idempotency-Key: claim-{bounty_id}-{gcid}` via `BffClientService`.
   */
  claim(bountyId: string): void {
    const current = this._state();
    if (current.status !== 'success') return;
    const next: readonly Bounty[] = current.snapshot.bounties.map((b: Bounty) =>
      b.bounty_id === bountyId && b.claim_state === 'open'
        ? { ...b, claim_state: 'claimed' as const }
        : b,
    );
    this._state.set({
      status: 'success',
      snapshot: { ...current.snapshot, bounties: next },
    });
  }
}
