import { describe, it, expect } from 'vitest';
import { resolveTurnAction, type MapsReadView } from './turn-action';

const ready = (count: number): MapsReadView => ({ reported: true, mapCount: count });
const unread: MapsReadView = { reported: false, mapCount: 0 };

describe('resolveTurnAction', () => {
  it('offers today dose as the ordinary turn', () => {
    expect(resolveTurnAction('/a/knowledge', ready(3))).toEqual({
      kind: 'dose',
      route: '/a/daily-dose',
      labelKey: 'aplus.shell.turn.dose',
    });
  });

  it('offers the seed on day one, when the read PROVED there are no maps', () => {
    const action = resolveTurnAction('/a/knowledge', ready(0));
    expect(action.kind).toBe('seed');
    expect(action.labelKey).toBe('aplus.shell.turn.seed');
  });

  it('sends the seed to the atlas, because /a/start is not built yet (C6)', () => {
    // The plan routes first run to /a/start. APLUS_ROUTES does not mount it, and
    // pointing the one primary action on the screen at a 404 is the dead-route
    // defect this codebase has already shipped twice. The atlas is where a map
    // is actually created today.
    expect(resolveTurnAction('/a/knowledge', ready(0)).route).toBe('/a/knowledge');
  });

  it('NEVER claims day one from a read that did not report', () => {
    // GoalService.goals() collapses to [] on loading AND on error. If the turn
    // action inherited that, an established learner whose read blipped would be
    // told to sow their first seed. An unreported read falls back to the dose,
    // which is always safe and always available.
    expect(resolveTurnAction('/a/knowledge', unread).kind).toBe('dose');
  });

  for (const url of [
    '/a/daily-dose',
    '/a/daily-dose/campaign-practice',
    '/a/atoms/abc-123/play',
    '/a/atoms/play',
  ]) {
    it(`suppresses itself inside a dose or an atom (${url})`, () => {
      // The dose and the player carry their own primary action. Two primary
      // actions on one screen is worse than one, and the HUD cannot drive the
      // dose's "next atom" without the dose exposing that seam (row C5).
      expect(resolveTurnAction(url, ready(3)).kind).toBe('suppressed');
    });
  }

  it('suppresses inside a dose even on day one', () => {
    expect(resolveTurnAction('/a/daily-dose', ready(0)).kind).toBe('suppressed');
  });

  it('is not fooled by a route that merely CONTAINS a dose segment', () => {
    // `/a/knowledge/daily-dose-planning` is not a dose. Matching on a bare
    // substring would suppress the action on an unrelated screen.
    expect(resolveTurnAction('/a/knowledge/daily-dose-planning', ready(3)).kind).toBe(
      'dose',
    );
  });

  it('ignores a query string and a fragment when reading the route', () => {
    expect(resolveTurnAction('/a/daily-dose?resume=1#top', ready(3)).kind).toBe(
      'suppressed',
    );
  });

  it('points the ordinary turn at a route that is actually mounted', () => {
    expect(resolveTurnAction('/a/wallet', ready(2)).route).toBe('/a/daily-dose');
  });
});
