/**
 * The station derivation, shared by the roster screen and the dashboard's
 * party strip (C3).
 *
 * ⚠ WHY IT IS SHARED RATHER THAN DERIVED TWICE. Both surfaces answer the same
 * question, "where is this companion stationed", from the same bond
 * (`attachedFamiliarId`, ADR-212 D5). Two derivations drift, and the one that
 * drifts is the one fewer people look at. This is the same reason S3 routed
 * the pointer drop and the keyboard move into one `moveStep`.
 *
 * ⚠ WHY IT TAKES A REPORT RATHER THAN A LIST. A bare array cannot express "the
 * read failed": an empty one then means both "no maps" and "I could not find
 * out", and the caller renders "not on a map" for a companion that may be
 * marching. That is a confident false claim about the learner's own roster,
 * and it is exactly the failure the dashboard's existing bond derivation has
 * today, because `GoalService.goals()` returns `[]` on loading AND on error.
 * The service's own `lead` counter already takes the opposite approach for the
 * same reason, returning null rather than zero so the ranker "has to be able
 * to tell no signal from no goals".
 */
import { describe, expect, it } from 'vitest';

import { stationFrom } from './station';

const FID = 'f-1';
const OTHER = 'f-2';

function card(over: Record<string, unknown> = {}) {
  return {
    goalId: 'g1',
    title: 'Fractions',
    northStarNote: '',
    kind: 'goal',
    status: 'active',
    attachedFamiliarId: FID,
    conceptCount: 1,
    shakyCount: 0,
    masteredCount: 0,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    ...over,
  } as never;
}

describe('stationFrom', () => {
  it('names the map a companion is bound to', () => {
    expect(stationFrom({ reported: true, cards: [card()] }, FID)).toEqual({
      kind: 'stationed',
      mapTitle: 'Fractions',
      goalId: 'g1',
    });
  });

  it('reports UNSTATIONED when the read succeeded and found no bond', () => {
    expect(
      stationFrom({ reported: true, cards: [card({ attachedFamiliarId: OTHER })] }, FID),
    ).toEqual({ kind: 'unstationed' });
  });

  it('reports UNSTATIONED for a learner with no maps at all', () => {
    // Reported and empty is a real answer: this learner has drawn no maps.
    expect(stationFrom({ reported: true, cards: [] }, FID)).toEqual({
      kind: 'unstationed',
    });
  });

  it('reports UNKNOWN when the read did not report, even with no cards', () => {
    // The distinction the whole type exists for. Same empty array, different
    // answer, because the difference is whether anyone asked and got a reply.
    expect(stationFrom({ reported: false, cards: [] }, FID)).toEqual({
      kind: 'unknown',
    });
  });

  it('reports UNKNOWN even if a stale card would have matched', () => {
    // An unreported read must not be rescued by whatever happens to be in the
    // list: if the read failed, the SPA does not know, and half-knowing is the
    // state that produces confident wrong answers.
    expect(stationFrom({ reported: false, cards: [card()] }, FID)).toEqual({
      kind: 'unknown',
    });
  });

  it('takes the FIRST binding when two maps claim the same companion', () => {
    // The bond is 1:1 server-side, so two claims mean the data is wrong. It
    // picks one deterministically rather than throwing, because a broken bond
    // should not blank a learner's whole roster strip.
    const first = card({ goalId: 'g1', title: 'Fractions' });
    const second = card({ goalId: 'g2', title: 'Decimals' });
    expect(stationFrom({ reported: true, cards: [first, second] }, FID)).toEqual({
      kind: 'stationed',
      mapTitle: 'Fractions',
      goalId: 'g1',
    });
  });

  it('still reports STATIONED when the bound map has no resolvable title', () => {
    // The companion IS on a map, so claiming otherwise would be false. The
    // helper reports the truth it knows and hands the caller an empty title to
    // render around; hiding the binding because its name did not resolve would
    // lose a real fact to a cosmetic one.
    expect(stationFrom({ reported: true, cards: [card({ title: '' })] }, FID)).toEqual({
      kind: 'stationed',
      mapTitle: '',
      goalId: 'g1',
    });
  });
});
