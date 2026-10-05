/**
 * The `(urgency, warmth)` rank key for the dynamic home (Track U Phase C, C1).
 *
 * Contract: `docs/references/home-rank-key.md`, sections 2 to 5. Owner rulings
 * R2 (the home is composed from data, never a fixed UI per audience and never a
 * toggle) and R4 (one ranked list, served by the existing `/api/me/dashboard`
 * aggregator, no second aggregator).
 *
 * The home is ONE list, so a governance dimension going red, an exam that opens
 * in twenty minutes and an unwon hex on a learner's map have to be comparable.
 * Urgency is time-derived and objective; warmth is the curiosity-first thumb on
 * the scale, applied as a WEIGHT and never offered as a mode the learner
 * switches. That is how the no-toggle invariant and the RPG feel are satisfied
 * by one mechanism.
 *
 * ⚠ The aggregator does not emit these cards yet. `dashboardDTO` carries no
 * `cards` array and not one field of the section 2 envelope, so this module is
 * built to the CONTRACT and the home ranks nothing until C1a lands. That is
 * also why `normalizeHomeCard` defaults a missing `state` to `unread`: a card
 * arriving without one has not been read successfully, and calling it `live`
 * would assert a read that never happened.
 */

/** Which surface OWNS the work. Anything other than `a` is a hand-off card. */
export type HomeCardSurface = 'a' | 'c' | 'h' | 'o' | 'r';

/**
 * Section 5. The distinction this type exists for: **empty because there is
 * nothing** is a fact, and **empty because we could not look** is a gap.
 * Collapsing them is how a ranker cheerfully demotes a credential learner to a
 * pure explorer on one transient blip.
 */
export type HomeCardState = 'live' | 'unread' | 'absent';

/** The section 2 envelope, exactly as the aggregator puts it on the wire. */
export interface HomeCardWire {
  readonly card_id: string;
  readonly kind: string;
  readonly surface: HomeCardSurface;
  readonly route: string;
  readonly count: number;
  readonly deadline_at?: string | null;
  readonly urgency?: number;
  readonly warmth?: number;
  readonly state?: HomeCardState;
}

/** The same card in the app's own casing. */
export interface HomeCard {
  readonly cardId: string;
  readonly kind: string;
  readonly surface: HomeCardSurface;
  readonly route: string;
  readonly count: number;
  /** The moment that makes it urgent. Null when nothing is due. */
  readonly deadlineAt: string | null;
  /** Ordinal band 0 to 5, section 3. */
  readonly urgency: number;
  /** Capped weighted sum 0 to 100, section 4. */
  readonly warmth: number;
  readonly state: HomeCardState;
}

export interface RankOptions {
  /**
   * Card ids in their last rendered order. An `unread` card holds its previous
   * position rather than being demoted by a read that failed; without one it is
   * held out of the list entirely, and NEVER ranked as `count: 0`.
   */
  readonly lastKnown?: readonly string[];
}

/** Epoch millis for a deadline, or null when nothing is due. */
function deadlineMs(card: HomeCard): number | null {
  if (card.deadlineAt === null) return null;
  const t = Date.parse(card.deadlineAt);
  return Number.isNaN(t) ? null : t;
}

/**
 * Total order over cards: `urgency` desc, `warmth` desc, `deadline_at` asc,
 * `count` desc, and finally `cardId` asc.
 *
 * The last three keys are not decoration. The contract requires the order to be
 * TOTAL so that two cards never swap places between two renders of the same
 * data, and a comparator that leaves any pair equal satisfies "is it sorted"
 * while still reshuffling the page under the learner on every poll. `cardId` is
 * the final backstop: it is stable per identity and per subject, so two cards
 * agreeing on all four ranked keys still order deterministically.
 *
 * A null deadline sorts AFTER any real one. "Nothing is due" cannot be more
 * pressing than a moment, and treating null as zero would float every
 * deadline-free card to the top of its band.
 */
export function compareHomeCards(a: HomeCard, b: HomeCard): number {
  if (a.urgency !== b.urgency) return b.urgency - a.urgency;
  if (a.warmth !== b.warmth) return b.warmth - a.warmth;

  const da = deadlineMs(a);
  const db = deadlineMs(b);
  if (da !== db) {
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  }

  if (a.count !== b.count) return b.count - a.count;
  return a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0;
}

/**
 * Rank the cards the home should render, applying section 5 first.
 *
 * `absent` is left OUT of this list because it has no read model and therefore
 * no count and no meaningful rank. It is NOT dropped from the payload: see
 * `absentHomeCards`. `unread` keeps its last known
 * position if it had one and is otherwise held out, because ranking a failed
 * read as an empty one is how a dark upstream silently deletes the
 * highest-value card on the page while the home still looks healthy.
 *
 * Degrade per card, never per page: a home that 500s because one upstream
 * blinked is worse than the pinboard it replaces.
 */
export function rankHomeCards(
  cards: readonly HomeCard[],
  opts: RankOptions = {},
): readonly HomeCard[] {
  const lastKnown = opts.lastKnown ?? [];
  const held = cards.filter(
    (c) => c.state === 'live' || (c.state === 'unread' && lastKnown.includes(c.cardId)),
  );
  const ranked = [...held.filter((c) => c.state === 'live')].sort(compareHomeCards);

  const stale = held.filter((c) => c.state === 'unread');
  if (stale.length === 0) return ranked;

  // Re-seat each unread card at the index it last occupied, so a failed read
  // moves nothing. Later insertions account for earlier ones by construction:
  // the list only grows as we walk lastKnown in order.
  const out = [...ranked];
  for (const id of lastKnown) {
    const card = stale.find((c) => c.cardId === id);
    if (!card) continue;
    const at = Math.min(lastKnown.indexOf(id), out.length);
    out.splice(at, 0, card);
  }
  return out;
}

/**
 * Read one card off the wire.
 *
 * A missing `state` becomes `unread`, deliberately. The alternative is to
 * assert a successful read that never happened, after which a `count` of zero
 * reads as the fact that there is nothing to do.
 */
export function normalizeHomeCard(wire: HomeCardWire): HomeCard {
  return {
    cardId: wire.card_id,
    kind: wire.kind,
    surface: wire.surface,
    route: wire.route,
    count: wire.count ?? 0,
    deadlineAt: wire.deadline_at ?? null,
    urgency: wire.urgency ?? 0,
    warmth: wire.warmth ?? 0,
    state: wire.state ?? 'unread',
  };
}

/**
 * The cards that are structurally absent, for the empty states the home renders
 * beside the ranked list.
 *
 * ⚠ CORRECTED 2026-09-02, against the shipped aggregator rather than the doc.
 * Section 5's table row still reads "Not emitted", and this module first
 * believed it. Section 7.5 and `medashboard/cards.go:144` both say the
 * opposite, and they are the newer truth: rows 2 and 6 (`grading_queue`,
 * `tenants_needing_setup`) are emitted WITH `state: absent` and a reason in
 * `known_gaps`. Emitting them from day one means the card exists in the
 * contract, the frontend renders its empty state once, and each lights up when
 * its read model lands with no envelope change and no frontend change. Dropping
 * them here would have made each arrive later as a NEW contract, which is the
 * outcome the aggregator went out of its way to avoid.
 *
 * Ordered by `cardId` so two renders of the same payload place the empty states
 * identically, for the same reason the ranked list has a total order.
 */
export function absentHomeCards(cards: readonly HomeCard[]): readonly HomeCard[] {
  return cards
    .filter((c) => c.state === 'absent')
    .sort((a, b) => (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0));
}
