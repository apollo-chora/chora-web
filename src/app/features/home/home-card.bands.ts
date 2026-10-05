/**
 * Timezone refinement of the deadline-derived urgency bands (Phase C, C1b).
 *
 * Contract: `home-rank-key.md` section 7.4. Section 3 defines due-today as
 * `deadline_at` falling inside THE VIEWER'S local day, which the aggregator
 * cannot know on its own, so the client sends its IANA zone as `?tz=` and the
 * aggregator echoes back the zone it actually used as `bands_tz`. No parameter,
 * or a zone the server cannot load, computes in UTC and echoes `"UTC"`.
 *
 * The echo is the contract rather than a courtesy: a silent UTC fallback would
 * leave the client believing due-today was computed in its own day, wrong by up
 * to a full day at the edges and undetectable. With the echo, a client whose
 * zone was NOT the one used may refine the bands itself.
 *
 * The same-zone guard is the load-bearing half. If the client refined
 * unconditionally, two viewers in the same zone could disagree about due-today
 * from the same payload, each recomputing against its own clock at a slightly
 * different moment. The server's answer is the shared one and it is
 * authoritative whenever it was computed in the right zone.
 */

import type { HomeCard } from './home-card.rank';

/** Overdue: `deadline_at < now`. Section 3 band 5. */
const BAND_OVERDUE = 5;
/** Due today: the deadline falls inside the viewer's local day. Band 4. */
const BAND_DUE_TODAY = 4;

export interface BandRefinementOptions {
  /** The zone the aggregator says it computed the day-derived bands in. */
  readonly bandsTz: string | undefined;
  /** The viewer's own IANA zone, normally from `viewerTimeZone()`. */
  readonly viewerTz: string;
  /** Injected so tests never race a real clock. */
  readonly now: Date;
}

/**
 * The viewer's IANA zone, the value the dashboard request sends as `?tz=`.
 *
 * Returns the empty string rather than throwing or yielding `undefined`: an
 * `undefined` reaching a query string is serialised as the literal text
 * "undefined" and read server-side as a zone name, which then fails to load and
 * silently computes in UTC. An empty string is a value the caller can test.
 */
export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

/**
 * Re-decide bands 4 and 5 from `deadline_at` when, and only when, the echoed
 * zone is not the viewer's.
 *
 * Overdue is the one band that needs no zone at all: a moment is either past or
 * it is not, whoever is looking. So the refinement is a straight comparison
 * against the clock, applied only to cards the server already placed in the
 * deadline-derived pair.
 *
 * ⚠ It never moves a card OUT of {4, 5}. Bands 3, 2 and 1 are "blocks another
 * identity", "streak at risk" and "continuation", none of them a function of
 * the deadline, so nothing here can compute what a demoted card should become.
 * The server decided this card's band comes from its deadline; the zone only
 * changes which of the two it is.
 *
 * ⚠ KNOWN LIMIT, raised with the coordinator rather than papered over: a card
 * the server called due-today whose deadline lands TOMORROW in the viewer's
 * zone stays at 4. That is the wrong-by-a-day error section 7.4 says the echo
 * exists to let the client fix, and fixing it would mean demoting below 4,
 * which is the invention this function refuses to make. The conservative
 * reading is deliberate; widen it only on a contract change.
 */
export function refineUrgencyBands(
  cards: readonly HomeCard[],
  opts: BandRefinementOptions,
): readonly HomeCard[] {
  const { bandsTz, viewerTz, now } = opts;

  // No echo, no viewer zone, or the zones agree: the server's answer stands.
  // An absent `bands_tz` is a contract violation (section 2 says it is ALWAYS
  // present), and the safe response to one is to trust the server rather than
  // to second-guess it from a mismatch that cannot be proven.
  if (!bandsTz || !viewerTz || bandsTz === viewerTz) return cards;

  const nowMs = now.getTime();
  return cards.map((card) => {
    if (card.urgency !== BAND_DUE_TODAY && card.urgency !== BAND_OVERDUE) return card;
    if (card.deadlineAt === null) return card;
    const at = Date.parse(card.deadlineAt);
    if (Number.isNaN(at)) return card;

    const refined = at < nowMs ? BAND_OVERDUE : BAND_DUE_TODAY;
    return refined === card.urgency ? card : { ...card, urgency: refined };
  });
}
