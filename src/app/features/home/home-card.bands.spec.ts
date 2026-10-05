import { describe, expect, it } from 'vitest';

import { refineUrgencyBands, viewerTimeZone } from './home-card.bands';
import type { HomeCard } from './home-card.rank';

/**
 * Timezone refinement of the deadline bands (Track U Phase C, C1b).
 *
 * Coordinator contract, from subagent5's C1a scope: the dashboard request
 * carries a `tz` query parameter (an IANA zone from
 * `Intl.DateTimeFormat().resolvedOptions().timeZone`), the envelope echoes it
 * as `bands_tz`, and urgency bands 4 and 5 are computed SERVER-side in that
 * zone. The client refines 4 versus 5 from `deadline_at` **only when the echoed
 * zone is not the viewer's**.
 *
 * WHY THE GUARD MATTERS MORE THAN THE REFINEMENT
 * If the client refined unconditionally, two viewers in the SAME zone could
 * disagree about "due today" from the same payload, because each would recompute
 * against its own clock at a slightly different moment. The server's answer is
 * the shared one, and it is authoritative whenever it was computed in the right
 * zone. The refinement exists for exactly one case: the echoed zone is not the
 * viewer's, so the server's "today" is not the viewer's today.
 *
 * WHY IT ONLY EVER MOVES A CARD BETWEEN 4 AND 5
 * Bands 5 (overdue) and 4 (due today) are the only deadline-derived ones.
 * Band 3 is "blocks another identity", 2 is "streak at risk", 1 is
 * "continuation": none is a function of the deadline, so nothing here can
 * compute them. The server has already decided this card's band comes from its
 * deadline; the zone only changes WHICH of the two it is. Demoting a card out
 * of the pair because its deadline lands tomorrow in the viewer's zone would be
 * inventing a band no one computed.
 */

const UTC = 'UTC';
const SGT = 'Asia/Singapore';

function card(over: Partial<HomeCard> = {}): HomeCard {
  return {
    cardId: 'c-1',
    kind: 'exam_sitting',
    surface: 'r',
    route: '/r/exams',
    count: 1,
    deadlineAt: null,
    urgency: 4,
    warmth: 0,
    state: 'live',
    ...over,
  };
}

/** A fixed clock, so the tests never race a real one. */
const NOW = new Date('2026-09-02T12:00:00Z');

describe('refineUrgencyBands, the same-zone guard', () => {
  it('changes NOTHING when the echoed zone matches the viewer, even when the deadline disagrees', () => {
    // The load-bearing case. The server said "due today"; the deadline is in
    // the past by this clock. The server computed in the viewer's own zone, so
    // its answer stands and every viewer in that zone sees the same band.
    const overdueLooking = card({ urgency: 4, deadlineAt: '2026-09-02T09:00:00Z' });
    const out = refineUrgencyBands([overdueLooking], {
      bandsTz: UTC,
      viewerTz: UTC,
      now: NOW,
    });
    expect(out[0]?.urgency).toBe(4);
  });

  it('changes nothing when the envelope echoed NO zone', () => {
    // An aggregator that has not shipped `bands_tz` yet. A mismatch cannot be
    // proven, so the server's answer is left alone rather than second-guessed.
    const c = card({ urgency: 4, deadlineAt: '2026-09-02T09:00:00Z' });
    const out = refineUrgencyBands([c], { bandsTz: undefined, viewerTz: SGT, now: NOW });
    expect(out[0]?.urgency).toBe(4);
  });

  it('changes nothing when the viewer zone itself is unknown', () => {
    const c = card({ urgency: 4, deadlineAt: '2026-09-02T09:00:00Z' });
    const out = refineUrgencyBands([c], { bandsTz: UTC, viewerTz: '', now: NOW });
    expect(out[0]?.urgency).toBe(4);
  });
});

describe('refineUrgencyBands, on a real zone mismatch', () => {
  const opts = { bandsTz: UTC, viewerTz: SGT, now: NOW } as const;

  it('promotes a past deadline to overdue', () => {
    const c = card({ urgency: 4, deadlineAt: '2026-09-02T09:00:00Z' });
    expect(refineUrgencyBands([c], opts)[0]?.urgency).toBe(5);
  });

  it('demotes a not-yet-passed deadline from overdue to due-today', () => {
    // The mirror case, and the reason this is a refinement rather than a
    // promotion pass: a server in UTC can call something overdue that has not
    // happened yet for a viewer further east.
    const c = card({ urgency: 5, deadlineAt: '2026-09-02T15:00:00Z' });
    expect(refineUrgencyBands([c], opts)[0]?.urgency).toBe(4);
  });

  it('leaves bands 3 and below alone', () => {
    // None of them is deadline-derived, so nothing here can recompute them.
    for (const urgency of [0, 1, 2, 3]) {
      const c = card({ urgency, deadlineAt: '2026-09-02T09:00:00Z' });
      expect(refineUrgencyBands([c], opts)[0]?.urgency).toBe(urgency);
    }
  });

  it('leaves a deadline-derived band alone when there is NO deadline to refine from', () => {
    // A card at band 4 with a null deadline is already inconsistent upstream.
    // Guessing a band from a moment that does not exist would replace one
    // upstream inconsistency with a fabricated client-side answer.
    const c = card({ urgency: 4, deadlineAt: null });
    expect(refineUrgencyBands([c], opts)[0]?.urgency).toBe(4);
  });

  it('leaves the band alone when the deadline will not parse', () => {
    const c = card({ urgency: 5, deadlineAt: 'not-a-date' });
    expect(refineUrgencyBands([c], opts)[0]?.urgency).toBe(5);
  });

  it('never moves a card OUT of the 4 and 5 pair', () => {
    // A deadline days away in the viewer's zone is still a deadline-derived
    // card. Demoting it to 3 or below would assert a band nobody computed.
    const c = card({ urgency: 4, deadlineAt: '2026-09-20T09:00:00Z' });
    const out = refineUrgencyBands([c], opts);
    expect([4, 5]).toContain(out[0]?.urgency);
  });

  it('does not mutate the cards it was given', () => {
    const c = card({ urgency: 4, deadlineAt: '2026-09-02T09:00:00Z' });
    const input = [c];
    refineUrgencyBands(input, opts);
    expect(input[0]?.urgency).toBe(4);
    expect(input[0]).toBe(c);
  });
});

describe('viewerTimeZone', () => {
  it('reports an IANA zone, the value the request sends as tz', () => {
    const tz = viewerTimeZone();
    expect(typeof tz).toBe('string');
    // Either a real zone or the empty string; never the string "undefined",
    // which would be sent verbatim as a query parameter and read as a zone.
    expect(tz).not.toBe('undefined');
  });
});
