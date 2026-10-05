/**
 * N8: the composed price, mirrored client-side (spec a.6).
 *
 * The learner freezes this number at publish and is charged it flat per run,
 * and today they cannot see it until after they have frozen it: the price
 * renders only on an already-published ritual. Mirroring the three constants is
 * the shape the spec recommends and the one the model file already sets for the
 * step cap, the quota and the unlock stage. The rejected alternative was a
 * quote endpoint, which would add a round trip on every drag for a pure
 * function of data the client already holds.
 *
 * ⚠ THE RULE THAT MATTERS. A step whose `policyClass` is unknown makes the set
 * UNPRICEABLE, and the estimate must say so rather than total the rest. An
 * unknown class is not a standard one: standard adds nothing, so treating
 * unknown as standard silently UNDERSTATES what the learner is about to freeze,
 * and it does so in the one direction that costs them mana. The server takes
 * the same position and returns an error rather than guessing
 * (`ritual.go:359-368`, unknown catalogue Skill).
 */
import { describe, expect, it } from 'vitest';

import {
  RITUAL_BASE_PRICE_UNITS,
  RITUAL_EGRESS_UPLIFT_UNITS,
  RITUAL_GENERATIVE_UPLIFT_UNITS,
  composeRitualPrice,
  ritualStepUplift,
} from './familiar-ritual.model';

/** A policy-class lookup of the shape the composer builds from its loadout. */
function classes(m: Record<string, string | undefined>) {
  return (skillKey: string) => m[skillKey];
}

describe('composeRitualPrice mirrors the domain', () => {
  it('carries the three constants the domain actually uses', () => {
    // Mirrored, so they are asserted here rather than assumed. If the domain
    // moves, this file is the one that has to move with it.
    expect(RITUAL_BASE_PRICE_UNITS).toBe(20);
    expect(RITUAL_GENERATIVE_UPLIFT_UNITS).toBe(15);
    expect(RITUAL_EGRESS_UPLIFT_UNITS).toBe(40);
  });

  it('prices an empty draft at the base alone', () => {
    expect(composeRitualPrice([], classes({}))).toEqual({
      kind: 'priced',
      units: 20,
    });
  });

  it('adds nothing for standard and autonomy steps', () => {
    const steps = [{ skillKey: 'a' }, { skillKey: 'b' }];
    expect(
      composeRitualPrice(steps, classes({ a: 'standard', b: 'autonomy' })),
    ).toEqual({ kind: 'priced', units: 20 });
  });

  it('adds the generative and egress uplifts per step', () => {
    const steps = [{ skillKey: 'g' }, { skillKey: 'e' }, { skillKey: 's' }];
    expect(
      composeRitualPrice(
        steps,
        classes({ g: 'generative', e: 'external_egress', s: 'standard' }),
      ),
    ).toEqual({ kind: 'priced', units: 20 + 15 + 40 });
  });

  it('charges the uplift ONCE PER STEP, not once per distinct Skill', () => {
    // The same Skill twice is two steps and two turns, so it is two uplifts.
    const steps = [{ skillKey: 'g' }, { skillKey: 'g' }];
    expect(composeRitualPrice(steps, classes({ g: 'generative' }))).toEqual({
      kind: 'priced',
      units: 20 + 15 + 15,
    });
  });

  it('REFUSES to total when a step has no known policy class', () => {
    // The whole point. Returning 35 here would tell the learner a price that is
    // too low by whatever the unknown Skill turns out to cost.
    const steps = [{ skillKey: 'g' }, { skillKey: 'mystery' }];
    expect(
      composeRitualPrice(steps, classes({ g: 'generative' })),
    ).toEqual({ kind: 'unpriceable', skillKeys: ['mystery'] });
  });

  it('names EVERY unpriceable step, not just the first', () => {
    const steps = [{ skillKey: 'x' }, { skillKey: 'g' }, { skillKey: 'y' }];
    expect(composeRitualPrice(steps, classes({ g: 'generative' }))).toEqual({
      kind: 'unpriceable',
      skillKeys: ['x', 'y'],
    });
  });

  it('treats an unrecognised class as unpriceable, never as free', () => {
    // A class the FE does not know is a class whose uplift the FE cannot know.
    // Falling through to "adds nothing" is the same understatement wearing a
    // different hat, and it is how a new server-side class would arrive here.
    const steps = [{ skillKey: 'n' }];
    expect(composeRitualPrice(steps, classes({ n: 'some_new_class' }))).toEqual({
      kind: 'unpriceable',
      skillKeys: ['n'],
    });
  });

  it('treats an empty-string class as unknown rather than standard', () => {
    // The Go zero value reaches the wire as "" for a grant whose catalogue row
    // is gone, which is precisely the retired-but-owned Skill case N2 was
    // careful not to fabricate fields for.
    const steps = [{ skillKey: 'r' }];
    expect(composeRitualPrice(steps, classes({ r: '' }))).toEqual({
      kind: 'unpriceable',
      skillKeys: ['r'],
    });
  });
});

/**
 * Per-step cost contribution, which is the actionable half of the price: the
 * total tells a learner what a routine costs, this tells them WHICH step is
 * the expensive one, and that is the part they can act on.
 */
describe('ritualStepUplift', () => {
  it('reports the uplift each premium class adds', () => {
    expect(ritualStepUplift('generative')).toBe(15);
    expect(ritualStepUplift('external_egress')).toBe(40);
  });

  it('reports zero, NOT undefined, for the classes that add nothing', () => {
    // Zero and unknown must not collapse: "included in the base" and "I cannot
    // tell you" are different answers and the card renders them differently.
    expect(ritualStepUplift('standard')).toBe(0);
    expect(ritualStepUplift('autonomy')).toBe(0);
  });

  it('reports undefined for an absent, empty or unrecognised class', () => {
    expect(ritualStepUplift(undefined)).toBeUndefined();
    expect(ritualStepUplift('')).toBeUndefined();
    expect(ritualStepUplift('some_new_class')).toBeUndefined();
  });
});
