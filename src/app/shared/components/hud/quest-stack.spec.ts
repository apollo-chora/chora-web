import { describe, it, expect } from 'vitest';
import {
  resolveQuestStack,
  QUEST_STACK_LIMIT,
  type HudQuest,
} from './quest-stack';
import type { HomeCard } from '../../../features/home/home-card.rank';

/**
 * The HUD quest stack (C2). It shows the top five RANKED cards and nothing
 * else, and it does not re-decide anything the home already decided.
 */
function card(over: Partial<HomeCard> = {}): HomeCard {
  return {
    cardId: 'c1',
    kind: 'unseen_results',
    surface: 'a',
    route: '/a/me/assessments',
    count: 2,
    deadlineAt: null,
    urgency: 3,
    warmth: 40,
    state: 'live',
    ...over,
  };
}

const NO_CONTEXT: Readonly<Record<string, unknown>> = {};

describe('resolveQuestStack', () => {
  it('takes the first five and drops the rest', () => {
    const cards = Array.from({ length: 9 }, (_, i) =>
      card({ cardId: `c${i}`, route: '/a/me/assessments' }),
    );
    const stack = resolveQuestStack(cards, NO_CONTEXT);
    expect(stack).toHaveLength(QUEST_STACK_LIMIT);
    expect(stack.map((q) => q.cardId)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4']);
  });

  it('PRESERVES the order it was given and never re-sorts', () => {
    // The rank is the home aggregator's, arrived at through urgency, warmth,
    // deadline, count and id. A stack that re-sorted would be a second ranker
    // disagreeing with the first on the same page.
    const cards = [
      card({ cardId: 'low', urgency: 0, warmth: 1 }),
      card({ cardId: 'high', urgency: 5, warmth: 99 }),
      card({ cardId: 'mid', urgency: 2, warmth: 50 }),
    ];
    expect(resolveQuestStack(cards, NO_CONTEXT).map((q) => q.cardId)).toEqual([
      'low',
      'high',
      'mid',
    ]);
  });

  it('returns an empty stack for an empty read, and does not throw', () => {
    expect(resolveQuestStack([], NO_CONTEXT)).toEqual([]);
  });

  it('takes fewer than five when fewer exist', () => {
    const stack = resolveQuestStack([card({ cardId: 'only' })], NO_CONTEXT);
    expect(stack.map((q) => q.cardId)).toEqual(['only']);
  });

  it('titles a count-bearing kind with its singular and plural key', () => {
    const one = resolveQuestStack([card({ kind: 'unseen_results', count: 1 })], NO_CONTEXT);
    const many = resolveQuestStack([card({ kind: 'unseen_results', count: 4 })], NO_CONTEXT);
    expect(one[0].titleKey).toBe('home.quests.kind.unseen_results_one');
    expect(many[0].titleKey).toBe('home.quests.kind.unseen_results_other');
    expect(one[0].titleParams).toEqual({ count: 1 });
  });

  it('titles a singular kind with its one form, count or no count', () => {
    const stack = resolveQuestStack(
      [card({ kind: 'continue_learning', count: 3 })],
      NO_CONTEXT,
    );
    expect(stack[0].titleKey).toBe('home.quests.kind.continue_learning');
  });

  it('falls back to the generic title for a kind it does not know', () => {
    // The property the fallback exists to prove: an unknown kind still renders.
    const stack = resolveQuestStack([card({ kind: 'invented_by_upstream', count: 2 })], NO_CONTEXT);
    expect(stack[0].titleKey).toBe('home.quests.kind.unknown_other');
  });

  // ── defend_hex: the one kind titled from card_context ────────────────────
  it('titles defend_hex from its context, keyed by CARD ID', () => {
    const stack = resolveQuestStack(
      [card({ cardId: 'dh1', kind: 'defend_hex', count: 1 })],
      { dh1: { hex_label: 'Numerator', companion_name: 'Vex' } },
    );
    expect(stack[0].titleKey).toBe('home.quests.defend_hex.title_defended');
    expect(stack[0].titleParams).toEqual({ companion: 'Vex', hex: 'Numerator' });
  });

  it('takes the undefended arm when no companion is stationed', () => {
    // `companion_name` is OMITTED rather than sent empty, because "nobody is
    // defending this" and "we did not look" are different facts.
    const stack = resolveQuestStack(
      [card({ cardId: 'dh1', kind: 'defend_hex' })],
      { dh1: { hex_label: 'Numerator' } },
    );
    expect(stack[0].titleKey).toBe('home.quests.defend_hex.title_undefended');
    expect(stack[0].titleParams).toEqual({ hex: 'Numerator' });
  });

  it('falls back to the generic title when the context cannot support a sentence', () => {
    // Both sentences are built around `hex_label`; without one there is no
    // defend copy to render, and a sentence with a hole in it is worse.
    const stack = resolveQuestStack(
      [card({ cardId: 'dh1', kind: 'defend_hex', count: 1 })],
      { dh1: { companion_name: 'Vex' } },
    );
    expect(stack[0].titleKey).toBe('home.quests.kind.unknown_one');
  });

  it('falls back when the context map has no entry for this card at all', () => {
    const stack = resolveQuestStack(
      [card({ cardId: 'dh1', kind: 'defend_hex', count: 2 })],
      { someone_else: { hex_label: 'Numerator' } },
    );
    expect(stack[0].titleKey).toBe('home.quests.kind.unknown_other');
  });

  // ── route liveness ────────────────────────────────────────────────────────
  it('marks a mounted route as mounted', () => {
    const stack = resolveQuestStack([card({ route: '/a/me/assessments' })], NO_CONTEXT);
    expect(stack[0].mounted).toBe(true);
  });

  it('marks an unmounted route as NOT mounted, so the HUD draws no link', () => {
    const stack = resolveQuestStack(
      [card({ route: '/a/this-was-never-mounted' })],
      NO_CONTEXT,
    );
    expect(stack[0].mounted).toBe(false);
    // The route is still carried: the quest is still news, it just is not a link.
    expect(stack[0].route).toBe('/a/this-was-never-mounted');
  });

  it('carries count and urgency through untouched', () => {
    const stack = resolveQuestStack([card({ count: 7, urgency: 5 })], NO_CONTEXT);
    expect(stack[0].count).toBe(7);
    expect(stack[0].urgency).toBe(5);
  });

  it('honours an explicit limit, including zero', () => {
    const cards = [card({ cardId: 'a' }), card({ cardId: 'b' })];
    expect(resolveQuestStack(cards, NO_CONTEXT, 1).map((q) => q.cardId)).toEqual(['a']);
    expect(resolveQuestStack(cards, NO_CONTEXT, 0)).toEqual([]);
    // A negative limit clamps to empty rather than slicing from the end, which
    // is what a bare `slice(0, -1)` would silently do.
    expect(resolveQuestStack(cards, NO_CONTEXT, -1)).toEqual([]);
  });

  it('is a projection: it never mutates the cards it was given', () => {
    const cards = [card({ cardId: 'a' }), card({ cardId: 'b' })];
    const before = JSON.stringify(cards);
    resolveQuestStack(cards, NO_CONTEXT, 1);
    expect(JSON.stringify(cards)).toBe(before);
  });

  it('produces one quest per card, with no id invented or lost', () => {
    const cards = [card({ cardId: 'x' }), card({ cardId: 'y' }), card({ cardId: 'z' })];
    const stack: readonly HudQuest[] = resolveQuestStack(cards, NO_CONTEXT);
    expect(new Set(stack.map((q) => q.cardId))).toEqual(new Set(['x', 'y', 'z']));
  });
});
