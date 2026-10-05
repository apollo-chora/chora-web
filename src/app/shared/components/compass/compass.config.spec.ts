import { describe, it, expect } from 'vitest';
import { APLUS_COMPASS } from './compass.config';
import { APLUS_ROUTES } from '../../../features/surfaces/aplus/aplus.routes';

/**
 * Every compass destination must resolve. A compass entry pointing at an
 * unmounted path is the dead-route defect this codebase has shipped twice
 * (the `a/discovery/:atomId` canvas, and the profile's source-revelation
 * link that has always 404'd), so the destinations are checked against the
 * real route table rather than against a hand-kept list.
 */
function mountedAplusPaths(): ReadonlySet<string> {
  return new Set(
    APLUS_ROUTES.map((r) => r.path).filter((p): p is string => typeof p === 'string'),
  );
}

describe('APLUS_COMPASS', () => {
  it('is the six entries of the plan, in order', () => {
    expect(APLUS_COMPASS.map((i) => i.labelKey)).toEqual([
      'aplus.shell.compass.home',
      'aplus.shell.compass.map',
      'aplus.shell.compass.roster',
      'aplus.shell.compass.courses',
      'aplus.shell.compass.create',
      'aplus.shell.compass.wallet',
    ]);
  });

  it('gates Create on assessment:author and gates nothing else', () => {
    const gated = APLUS_COMPASS.filter((i) => i.capability);
    expect(gated.map((i) => i.labelKey)).toEqual(['aplus.shell.compass.create']);
    expect(gated[0]?.capability).toBe('assessment:author');
  });

  it('carries no add-on gate, so no compass entry can be a C+ door (R39)', () => {
    expect(APLUS_COMPASS.filter((i) => i.addOn)).toEqual([]);
  });

  it('points every entry inside the A+ surface', () => {
    for (const item of APLUS_COMPASS) {
      expect(item.route.startsWith('/a/')).toBe(true);
    }
  });

  it('points every entry at a route that is actually mounted', () => {
    const mounted = mountedAplusPaths();
    for (const item of APLUS_COMPASS) {
      const path = item.route.replace(/^\/a\//, '');
      expect(
        mounted.has(path),
        `${item.labelKey} points at /a/${path}, which APLUS_ROUTES does not mount`,
      ).toBe(true);
    }
  });

  // ── Rulings inherited from the retired APLUS_NAV (C2 slice 3) ───────────
  //
  // `aplus.nav.ts` was deleted when the A+ sidebar config was retired: it had
  // been dead code since the compass replaced the sidebar (the shell renders
  // `<chora-sidebar>` only under `@if (!usesCompass())`, and `usesCompass()`
  // is true for every A+-resolved URL). Its spec carried six owner rulings
  // that removed a destination from the A+ shell chrome, and those rulings
  // outlive the config that happened to encode them, so they move here rather
  // than dying with the file.
  //
  // The ordered six-entry test above already forbids a seventh entry. This
  // exists for the READER: when it fails, the message names the ruling, where
  // the destination lives instead, and who made the call, instead of a diff
  // between two arrays.
  it.each([
    [
      '/a/companion',
      'CHO-2313, owner 2026-07-21: reached from the cast card, the home pin and in-flow links; the route stays mounted. The compass Roster entry (/a/roster) is a LATER, separately ruled surface and is not this door coming back.',
    ],
    [
      '/a/study',
      'CHO-2217, owner 2026-07-16: a study list is the learner own curated material, so it belongs inside Learning, not beside it.',
    ],
    [
      '/a/me/transcript',
      'CHO-2237, owner 2026-07-17: the transcript is the OUTCOME of Learn assessments, so it lives inside Learn.',
    ],
    [
      '/a/map',
      'WS-F (ADR-212 to 216): folded into the one sovereign knowledge surface at /a/knowledge, which the compass carries as Map.',
    ],
    [
      '/a/discovery',
      'WS-F (ADR-212 to 216): folded into /a/knowledge; the old route redirects there.',
    ],
    [
      '/a/atoms/new',
      'CHO-2215: a create-a-new-thing FORM, so the authoring surface had no inventory. Folded into /a/studio.',
    ],
    [
      '/a/question-banks',
      'CHO-2215: a correctly-built authoring surface parked OUTSIDE the authoring section. Folded into /a/studio.',
    ],
    [
      '/choraverse',
      'WS-10 (2026-06-29): gated OFF at build (environment.gatedAreas), so a link would dead-end at /not-found. Restore with its addOn gate when it ships.',
    ],
  ])('carries no shell door to %s', (route, ruling) => {
    expect(
      APLUS_COMPASS.some((i) => i.route === route),
      `the compass grew a door to ${route}, which an owner ruling removed. ${ruling}`,
    ).toBe(false);
  });

  it('reaches the knowledge surface exactly once, at /a/knowledge', () => {
    // The WS-F fold is only honoured if there is ONE door, not if the old ones
    // are merely absent: two entries pointing into the same surface is the
    // shape the fold existed to remove.
    expect(APLUS_COMPASS.filter((i) => i.route === '/a/knowledge')).toHaveLength(1);
  });

  it('gives every entry a distinct route and a distinct label key', () => {
    expect(new Set(APLUS_COMPASS.map((i) => i.route)).size).toBe(APLUS_COMPASS.length);
    expect(new Set(APLUS_COMPASS.map((i) => i.labelKey)).size).toBe(APLUS_COMPASS.length);
  });
});
