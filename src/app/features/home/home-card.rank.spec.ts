import { describe, expect, it } from 'vitest';

import {
  compareHomeCards,
  rankHomeCards,
  absentHomeCards,
  normalizeHomeCard,
  type HomeCard,
  type HomeCardWire,
} from './home-card.rank';

/**
 * The `(urgency, warmth)` rank key (Track U Phase C, C1).
 *
 * Contract: `docs/references/home-rank-key.md`. The home is ONE list, so a
 * governance dimension going red, an exam that opens in twenty minutes and an
 * unwon hex on a map have to be comparable. One key per card makes them
 * comparable; one key per card TYPE does not.
 *
 * Ordering is `urgency` desc, then `warmth` desc, then `deadline_at` asc, then
 * `count` desc. The last two are not decoration: the contract says they exist
 * so the order is TOTAL, and that two cards must never swap places between two
 * renders of the same data. A comparator that leaves ties unresolved passes a
 * naive "is it sorted" assertion and still reshuffles the page under the
 * learner on every poll, so the property is tested directly here.
 */

/** A card with every rank input explicit; overrides per test. */
function card(over: Partial<HomeCard> = {}): HomeCard {
  return {
    cardId: 'c-1',
    kind: 'growth_edge_review',
    surface: 'a',
    route: '/a/knowledge',
    count: 1,
    deadlineAt: null,
    urgency: 0,
    warmth: 0,
    state: 'live',
    ...over,
  };
}

describe('compareHomeCards', () => {
  it('puts higher urgency first, whatever the warmth', () => {
    // The whole point of the pair: an overdue hand-off with zero warmth still
    // outranks the warmest curiosity card on the page.
    const overdue = card({ cardId: 'overdue', urgency: 5, warmth: 0 });
    const warm = card({ cardId: 'warm', urgency: 0, warmth: 100 });
    expect(rankHomeCards([warm, overdue]).map((c) => c.cardId)).toEqual([
      'overdue',
      'warm',
    ]);
  });

  it('breaks an urgency tie on warmth, descending', () => {
    const cold = card({ cardId: 'cold', urgency: 3, warmth: 10 });
    const warm = card({ cardId: 'warm', urgency: 3, warmth: 60 });
    expect(rankHomeCards([cold, warm]).map((c) => c.cardId)).toEqual([
      'warm',
      'cold',
    ]);
  });

  it('breaks a warmth tie on the EARLIER deadline', () => {
    // Ascending here, unlike the two keys above. A sooner deadline is more
    // pressing, so this one tiebreak runs the other way.
    const later = card({ cardId: 'later', urgency: 4, warmth: 20, deadlineAt: '2026-09-03T10:00:00Z' });
    const sooner = card({ cardId: 'sooner', urgency: 4, warmth: 20, deadlineAt: '2026-09-03T08:00:00Z' });
    expect(rankHomeCards([later, sooner]).map((c) => c.cardId)).toEqual([
      'sooner',
      'later',
    ]);
  });

  it('sorts a card WITH a deadline ahead of one without, at equal warmth', () => {
    // A null deadline is "nothing is due", which cannot be more pressing than
    // a real moment. Treating null as zero would invert this and float every
    // deadline-free card to the top of its band.
    const dated = card({ cardId: 'dated', urgency: 1, warmth: 20, deadlineAt: '2026-09-03T08:00:00Z' });
    const undated = card({ cardId: 'undated', urgency: 1, warmth: 20, deadlineAt: null });
    expect(rankHomeCards([undated, dated]).map((c) => c.cardId)).toEqual([
      'dated',
      'undated',
    ]);
  });

  it('breaks a deadline tie on the larger count', () => {
    const few = card({ cardId: 'few', urgency: 3, warmth: 5, deadlineAt: null, count: 1 });
    const many = card({ cardId: 'many', urgency: 3, warmth: 5, deadlineAt: null, count: 9 });
    expect(rankHomeCards([few, many]).map((c) => c.cardId)).toEqual([
      'many',
      'few',
    ]);
  });

  it('is a TOTAL order: the same data ranks identically from any input order', () => {
    // The contract's actual requirement, and the one a "is it sorted" check
    // cannot see. If any pair compares equal, the result depends on the input
    // permutation and the page reshuffles under the learner between polls.
    const cards = [
      card({ cardId: 'a', urgency: 5, warmth: 40, deadlineAt: '2026-09-03T08:00:00Z', count: 2 }),
      card({ cardId: 'b', urgency: 5, warmth: 40, deadlineAt: '2026-09-03T08:00:00Z', count: 7 }),
      card({ cardId: 'c', urgency: 5, warmth: 40, deadlineAt: '2026-09-03T09:00:00Z', count: 7 }),
      card({ cardId: 'd', urgency: 5, warmth: 90, deadlineAt: null, count: 1 }),
      card({ cardId: 'e', urgency: 2, warmth: 90, deadlineAt: null, count: 1 }),
      card({ cardId: 'f', urgency: 0, warmth: 0, deadlineAt: null, count: 0 }),
    ];
    const expected = rankHomeCards(cards).map((c) => c.cardId);

    // Every rotation and the reverse must land on the same order.
    for (let i = 0; i < cards.length; i++) {
      const rotated = [...cards.slice(i), ...cards.slice(0, i)];
      expect(rankHomeCards(rotated).map((c) => c.cardId)).toEqual(expected);
      expect(rankHomeCards([...rotated].reverse()).map((c) => c.cardId)).toEqual(expected);
    }
  });

  it('never reports two distinct cards as equal', () => {
    const cards = [
      card({ cardId: 'a', urgency: 5, warmth: 40, deadlineAt: '2026-09-03T08:00:00Z', count: 2 }),
      card({ cardId: 'b', urgency: 5, warmth: 40, deadlineAt: '2026-09-03T08:00:00Z', count: 7 }),
      card({ cardId: 'c', urgency: 5, warmth: 40, deadlineAt: null, count: 7 }),
    ];
    for (const x of cards) {
      for (const y of cards) {
        if (x.cardId === y.cardId) continue;
        expect(
          compareHomeCards(x, y),
          `${x.cardId} and ${y.cardId} compare equal, so their order depends on ` +
            `the input permutation and the page reshuffles between renders`,
        ).not.toBe(0);
      }
    }
  });

  it('does not mutate the array it was given', () => {
    const cards = [card({ cardId: 'lo', urgency: 0 }), card({ cardId: 'hi', urgency: 5 })];
    rankHomeCards(cards);
    expect(cards.map((c) => c.cardId)).toEqual(['lo', 'hi']);
  });
});

describe('rankHomeCards and the unread rule', () => {
  it('holds an unread card OUT of the list rather than ranking it as empty', () => {
    // Section 5, the distinction the whole field exists for. Empty because
    // there is nothing is a FACT; empty because we could not look is a GAP.
    // Ranking an unread card as count 0 is how a dark upstream silently
    // deletes the highest-value card on the page and the home still looks fine.
    const live = card({ cardId: 'live', state: 'live', count: 0 });
    const unread = card({ cardId: 'unread', state: 'unread', count: 0, urgency: 5 });
    expect(rankHomeCards([live, unread]).map((c) => c.cardId)).toEqual(['live']);
  });

  it('keeps an unread card at its LAST KNOWN position when one is given', () => {
    const live = card({ cardId: 'live', state: 'live', urgency: 5 });
    const unread = card({ cardId: 'unread', state: 'unread', urgency: 0 });
    // Previously ranked first; a failed read must not silently demote it.
    const ranked = rankHomeCards([live, unread], { lastKnown: ['unread', 'live'] });
    expect(ranked.map((c) => c.cardId)).toEqual(['unread', 'live']);
  });

  it('keeps an absent card OUT of the ranked list', () => {
    // It has no read model, so it has no count and no meaningful rank. It is
    // not dropped from the payload though; see absentHomeCards below.
    const ranked = rankHomeCards([card({ cardId: 'gone', state: 'absent' })]);
    expect(ranked).toEqual([]);
  });
});

describe('absentHomeCards', () => {
  /**
   * ⚠ CORRECTED against the shipped aggregator, 2026-09-02. The first version
   * of this module DROPPED absent cards, on section 5's table row, which reads
   * "Not emitted". Section 7.5 and `cards.go:144` both say the opposite and are
   * the newer truth: rows 2 and 6 are emitted WITH `state: absent` and a reason
   * in `known_gaps`, so the card exists in the contract, the frontend renders
   * its empty state once, and each lights up when its read model lands with no
   * envelope change and no frontend change. Dropping them would have made each
   * arrive later as a new contract instead. The doc contradiction is raised
   * with the coordinator; the code is the authority here.
   */
  it('surfaces the absent cards the ranked list leaves out', () => {
    const cards = [
      card({ cardId: 'live-1', state: 'live' }),
      card({ cardId: 'grading_queue', state: 'absent' }),
      card({ cardId: 'tenants_needing_setup', state: 'absent' }),
    ];
    expect(absentHomeCards(cards).map((c) => c.cardId)).toEqual([
      'grading_queue',
      'tenants_needing_setup',
    ]);
  });

  it('orders them stably, so their empty states do not shuffle between renders', () => {
    const cards = [
      card({ cardId: 'b', state: 'absent' }),
      card({ cardId: 'a', state: 'absent' }),
    ];
    expect(absentHomeCards(cards).map((c) => c.cardId)).toEqual(['a', 'b']);
    expect(absentHomeCards([...cards].reverse()).map((c) => c.cardId)).toEqual(['a', 'b']);
  });

  it('returns nothing when every card was read', () => {
    expect(absentHomeCards([card({ state: 'live' }), card({ state: 'unread' })])).toEqual([]);
  });
});

describe('normalizeHomeCard', () => {
  it('reads the snake_case wire shape the contract specifies', () => {
    const wire: HomeCardWire = {
      card_id: 'grading-1',
      kind: 'grading_queue',
      surface: 'r',
      route: '/r/grading',
      count: 4,
      deadline_at: '2026-09-03T08:00:00Z',
      urgency: 3,
      warmth: 0,
      state: 'live',
    };
    expect(normalizeHomeCard(wire)).toEqual({
      cardId: 'grading-1',
      kind: 'grading_queue',
      surface: 'r',
      route: '/r/grading',
      count: 4,
      deadlineAt: '2026-09-03T08:00:00Z',
      urgency: 3,
      warmth: 0,
      state: 'live',
    });
  });

  it('treats a card with NO state as unread, never as live', () => {
    // An aggregator that has not shipped the field yet, or a card whose state
    // was dropped in transit. Defaulting to `live` would assert a successful
    // read that never happened, and `count: 0` would then read as a fact.
    const wire = { card_id: 'x', kind: 'k', surface: 'a', route: '/a', count: 0 } as HomeCardWire;
    expect(normalizeHomeCard(wire).state).toBe('unread');
  });

  it('floors a missing urgency and warmth at zero rather than dropping the card', () => {
    const wire = { card_id: 'x', kind: 'k', surface: 'a', route: '/a', count: 2, state: 'live' } as HomeCardWire;
    const c = normalizeHomeCard(wire);
    expect(c.urgency).toBe(0);
    expect(c.warmth).toBe(0);
    expect(c.deadlineAt).toBeNull();
  });
});
