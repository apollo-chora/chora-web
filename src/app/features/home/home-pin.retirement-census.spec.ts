import { describe, expect, it } from 'vitest';

import { HOME_PIN_REGISTRY } from './home-pin.registry';

/**
 * The pin-grid retirement census (Track U Phase C, written in C1 for C2).
 *
 * C1 adds the ranked quest log ABOVE the pin grid and leaves the grid standing.
 * C2 retires the grid, and the coordinator's condition for that is explicit:
 * only once every pin's destination is reachable through a card or the compass.
 * This file is that condition, expressed as a test rather than as a sentence in
 * a plan, so C2 inherits a gate it cannot pass by accident.
 *
 * WHY A CENSUS AND NOT A CHECKLIST
 * The failure mode is not forgetting to look. It is looking at a list that has
 * quietly grown: a sixth pin added by another package after the checklist was
 * written retires along with the rest and takes its destination off the home
 * with it. So the table below is asserted TOTAL over the live registry. Add a
 * pin without deciding its destiny and this file fails, in the commit that adds
 * it, naming the pin.
 *
 * WHAT `covered` MEANS
 * `card` the destination is reachable from a ranked card that the aggregator
 *        actually emits. NOT a card that is merely specified: section 7 of
 *        `home-rank-key.md` still lists three read models as missing, and a
 *        card with no read model is `absent` and never emitted at all.
 * `compass` reachable from the C2 compass, once that exists.
 * `none`  no route to it but the pin. Retiring the grid would strand it.
 */

/** How each pin's destination survives the grid, or that it does not yet. */
type Destiny = 'card' | 'compass' | 'none';

/**
 * The census. Every value is `none` today, which is the honest state: C1 ranks
 * nothing yet because the aggregator emits no `cards` array, and the compass is
 * C2's to build. Entries move to `card` or `compass` as those land, each in the
 * commit that lands it.
 */
const PIN_DESTINY: Readonly<Record<string, Destiny>> = {
  'aplus-learning': 'none',
  'aplus-knowledge': 'none',
  'aplus-familiar': 'none',
  'aplus-wallet': 'none',
  'aplus-studio': 'none',
  'cplus-feed': 'none',
  'hplus-tenant': 'none',
  'hplus-members': 'none',
  'hplus-billing': 'none',
  'oplus-dashboard': 'none',
  'oplus-governance': 'none',
  'oplus-costs': 'none',
  'rplus-offerings': 'none',
  'rplus-exams': 'none',
};

/**
 * C2 flips this when it retires the grid. It is here rather than in C2 so the
 * gate below is already standing when C2 arrives, instead of being written by
 * the same change that wants to pass it.
 */
const PIN_GRID_RETIRED = false;

describe('home pin retirement census', () => {
  it('accounts for EVERY pin in the live registry', () => {
    // Totality in both directions. A pin with no entry is an undecided
    // destination; an entry with no pin is a stale row that would let the gate
    // below pass on a destination nobody can reach any more.
    const pins = HOME_PIN_REGISTRY.map((p) => p.id).sort();
    const censused = Object.keys(PIN_DESTINY).sort();

    const undecided = pins.filter((id) => !censused.includes(id));
    expect(
      undecided,
      `these pins have no destiny recorded, so retiring the grid would strand ` +
        `them silently:\n` + undecided.map((id) => `  ${id}`).join('\n'),
    ).toEqual([]);

    const stale = censused.filter((id) => !pins.includes(id));
    expect(
      stale,
      `these census rows name pins that no longer exist:\n` +
        stale.map((id) => `  ${id}`).join('\n'),
    ).toEqual([]);
  });

  it('reads a plausible registry, so the totality check cannot pass vacuously', () => {
    // An empty registry satisfies "every pin is accounted for" trivially. That
    // is the same vacuity that let three untranslated i18n sections through.
    expect(HOME_PIN_REGISTRY.length).toBeGreaterThan(10);
    expect(HOME_PIN_REGISTRY.map((p) => p.id)).toContain('aplus-knowledge');
  });

  it('refuses to retire the grid while any destination is reachable only by pin', () => {
    // The gate C2 inherits. It is deliberately phrased as an implication rather
    // than a snapshot, so it stays true as entries move and only ever unlocks
    // when the last `none` is gone.
    const stranded = Object.entries(PIN_DESTINY)
      .filter(([, d]) => d === 'none')
      .map(([id]) => id);

    if (PIN_GRID_RETIRED) {
      expect(
        stranded,
        `PIN_GRID_RETIRED is set while ${stranded.length} destinations are ` +
          `reachable ONLY through the pin grid. Retiring it now removes the ` +
          `only route to each of these:\n` + stranded.map((id) => `  ${id}`).join('\n'),
      ).toEqual([]);
    } else {
      // Not yet retired, which is C1's state. Recorded rather than skipped, so
      // the file says what it is waiting for instead of going quiet.
      expect(stranded.length).toBeGreaterThan(0);
    }
  });
});
