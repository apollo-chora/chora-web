import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { CPlusBountiesService } from './cplus-bounties.service';

/**
 * Wave 3 bounties service is an in-memory mock (`of(INITIAL)`) — no HTTP,
 * so no HttpTestingController needed.
 */
describe('CPlusBountiesService', () => {
  let service: CPlusBountiesService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CPlusBountiesService],
    });
    service = TestBed.inject(CPlusBountiesService);
  });

  describe('initial state', () => {
    it('starts idle with no snapshot', () => {
      expect(service.state().status).toBe('idle');
      expect(service.snapshot()).toBeNull();
    });
  });

  describe('loadBountiesMock', () => {
    it('transitions loading → success and exposes the Wave-3 fixture', async () => {
      const promise = service.loadBountiesMock();
      expect(service.state().status).toBe('loading');

      const snapshot = await promise;
      expect(service.state().status).toBe('success');
      expect(service.snapshot()).toBe(snapshot);
      // Fixture invariants (docs/m13 audit-touchpoints §bounties).
      expect(snapshot.active_count).toBe(3);
      expect(snapshot.weekly_streak_days).toBe(7);
      expect(snapshot.bounties.length).toBe(4);
      expect(snapshot.bounties[0].bounty_id).toBe('bounty-refer-mtm-friend');
      expect(snapshot.bounties[0].claim_state).toBe('open');
      // [P0] Refer-a-Friend bounty carries the 500-coin reward.
      expect(snapshot.bounties[0].reward).toEqual({ amount: 500, currency: 'coins' });
      // [P0] Familiar Missions surfaced.
      expect(
        snapshot.bounties.some((b) => b.kind === 'familiar_mission'),
      ).toBe(true);
    });
  });

  describe('claim (optimistic, idempotent)', () => {
    it('is a no-op before a snapshot is loaded', () => {
      // state() is 'idle' → `current.status !== 'success'` early-return.
      service.claim('bounty-refer-mtm-friend');
      expect(service.state().status).toBe('idle');
      expect(service.snapshot()).toBeNull();
    });

    it('flips an open bounty to claimed', async () => {
      await service.loadBountiesMock();

      service.claim('bounty-refer-mtm-friend');
      const snapshot = service.snapshot();
      expect(snapshot).not.toBeNull();
      expect(snapshot!.bounties.find((b) => b.bounty_id === 'bounty-refer-mtm-friend')?.claim_state)
        .toBe('claimed');
      // Other bounties untouched.
      expect(snapshot!.bounties.find((b) => b.bounty_id === 'bounty-eira-mission-help-3-peers')?.claim_state)
        .toBe('open');
      expect(service.state().status).toBe('success');
    });

    it('is idempotent — claiming an already-claimed bounty is a no-op', async () => {
      await service.loadBountiesMock();

      service.claim('bounty-refer-mtm-friend');
      const afterFirst = service.snapshot();
      service.claim('bounty-refer-mtm-friend');
      const afterSecond = service.snapshot();

      // Re-claiming is semantically idempotent: the refer-a-friend bounty
      // stays claimed, no other bounty is touched, and no error surfaces.
      expect(afterSecond).toEqual(afterFirst);
      expect(afterSecond!.bounties.filter((b) => b.claim_state === 'claimed')).toHaveLength(1);
    });

    it('ignores an unknown bounty id', async () => {
      await service.loadBountiesMock();

      service.claim('bounty-does-not-exist');
      const snapshot = service.snapshot();
      expect(snapshot!.bounties.every((b) => b.claim_state === 'open')).toBe(true);
      expect(snapshot!.active_count).toBe(3);
    });
  });
});