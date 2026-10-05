import { describe, it, expect } from 'vitest';

import { HOME_PIN_IDS } from './home-pin.registry';
import type { HomePin } from './home-pin.registry';
import { reconcilePins } from './home-pin.reconcile';

/**
 * ADR-240 D3 - the HOME reconcile, DISTINCT from A+ reconcileOrder.
 *
 * A home pin list is a user-curated SUBSET of a large pinnable registry, so the
 * reconcile must: drop pins whose id is not in knownIds, dedupe by id (first
 * wins), PRESERVE the user's subset and order, NEVER auto-add a known-but-absent
 * id, and keep an intentionally-empty home empty. This is exactly why the A+
 * reconcileOrder (total over its set, refills empty with DEFAULT_ORDER) cannot
 * be reused.
 */

const pins = (...ids: string[]): HomePin[] => ids.map((id) => ({ id }));

describe('reconcilePins - drop unknown ids', () => {
  it('drops an id that is not in knownIds', () => {
    const out = reconcilePins(pins('aplus-learning', 'ghost-pin'), HOME_PIN_IDS);
    expect(out).toEqual(pins('aplus-learning'));
  });

  it('keys on the PASSED knownIds, not the global registry', () => {
    // aplus-learning IS a real registry id, but it is absent from this caller's
    // known set, so it must drop. Proves reconcile is parametric over knownIds.
    const out = reconcilePins(pins('aplus-learning'), new Set(['something-else']));
    expect(out).toEqual([]);
  });
});

describe('reconcilePins - dedupe, first occurrence wins', () => {
  it('collapses duplicate ids to the first occurrence', () => {
    const out = reconcilePins(pins('rplus-exams', 'rplus-exams'), HOME_PIN_IDS);
    expect(out).toEqual(pins('rplus-exams'));
  });
});

describe('reconcilePins - preserve the user subset + order', () => {
  it('preserves a chosen subset in the chosen order, unchanged', () => {
    const chosen = pins('rplus-exams', 'aplus-wallet', 'oplus-costs');
    expect(reconcilePins(chosen, HOME_PIN_IDS)).toEqual(chosen);
  });

  it('NEVER auto-adds a known-but-absent id (the reconcileOrder anti-behaviour)', () => {
    // The whole registry is known, but the user pinned exactly one card. The
    // result must stay that one card - NOT refill to the full vocabulary.
    const out = reconcilePins(pins('aplus-learning'), HOME_PIN_IDS);
    expect(out).toEqual(pins('aplus-learning'));
    expect(out.length).toBe(1);
  });
});

describe('reconcilePins - empty stays empty (D7 legitimate empty home)', () => {
  it('returns [] for an explicitly emptied home', () => {
    expect(reconcilePins([], HOME_PIN_IDS)).toEqual([]);
  });

  it('returns [] for null / undefined (unset, not a value)', () => {
    expect(reconcilePins(null, HOME_PIN_IDS)).toEqual([]);
    expect(reconcilePins(undefined, HOME_PIN_IDS)).toEqual([]);
  });

  it('returns [] for a non-array candidate (corrupt storage)', () => {
    // The engine casts untyped JSON to TItem[]; reconcile must self-guard.
    expect(reconcilePins('nonsense' as unknown as HomePin[], HOME_PIN_IDS)).toEqual([]);
  });
});

describe('reconcilePins - capability-independence (ADR-240 D4)', () => {
  it('preserves a pin whose capability the session may have lost', () => {
    // aplus-studio is capability-gated at RENDER (assessment:author). Reconcile
    // takes only knownIds - no session - so a lapsed capability can never delete
    // the pin from the persisted layout. It reappears when the cap returns.
    const out = reconcilePins(pins('aplus-studio'), HOME_PIN_IDS);
    expect(out).toEqual(pins('aplus-studio'));
  });
});

describe('reconcilePins - guards + forward-extensibility', () => {
  it('drops junk elements (empty id, missing id, non-string id)', () => {
    const junk = [
      { id: '' },
      {},
      { id: 123 },
      null,
      { id: 'aplus-wallet' },
    ] as unknown as HomePin[];
    expect(reconcilePins(junk, HOME_PIN_IDS)).toEqual(pins('aplus-wallet'));
  });

  it('preserves extra fields on a pin (H5 will add position; key stays id)', () => {
    // HomePin is { id } for v1, but reconcile must pass the whole object through
    // so H5 position fields survive a reconcile untouched.
    const withPos = [{ id: 'aplus-wallet', x: 2, y: 1 }] as unknown as HomePin[];
    const out = reconcilePins(withPos, HOME_PIN_IDS);
    expect(out).toEqual(withPos);
    expect((out[0] as unknown as { x: number }).x).toBe(2);
  });
});
