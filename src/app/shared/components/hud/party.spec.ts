import { describe, it, expect } from 'vitest';
import { resolveParty, ROSTER_ROUTE } from './party';
import type { MapsReport } from '../../../core/familiar/station';
import type { FamiliarRosterItem } from '../../../features/surfaces/aplus/dashboard/dashboard.model';
import type { MapCard } from '../../../features/surfaces/aplus/my-knowledge/maps.model';

/**
 * The HUD party strip (C2). One portrait per companion, linking to the goal map
 * it is stationed on, or to the roster otherwise.
 *
 * The station itself is NOT tested here: it belongs to `core/familiar/station`,
 * which the roster and the cast card also call, and re-asserting its rules in a
 * third place is how three surfaces come to disagree. What IS tested here is
 * the strip's own concern, the DESTINATION, and specifically that all three
 * station arms produce a live one.
 */
function member(over: Partial<FamiliarRosterItem> = {}): FamiliarRosterItem {
  return {
    familiar_id: 'f1',
    name: 'Vex',
    species: 'fox',
    evolution_level: 2,
    stage_label: 'fledgling',
    ...over,
  };
}

function map(over: Partial<MapCard> = {}): MapCard {
  return {
    goalId: 'g1',
    title: 'Fractions',
    northStarNote: '',
    kind: 'concept',
    status: 'active',
    conceptCount: 4,
    shakyCount: 1,
    masteredCount: 2,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...over,
  };
}

/** A read that REPORTED, carrying these cards. */
function reported(cards: readonly MapCard[] = []): MapsReport {
  return { reported: true, cards };
}

/** A read that has NOT reported: in flight, or failed. */
const UNREPORTED: MapsReport = { reported: false, cards: [] };

describe('resolveParty', () => {
  it('links a stationed companion to ITS map', () => {
    const party = resolveParty(
      [member({ familiar_id: 'f1' })],
      reported([map({ goalId: 'g9', title: 'Fractions', attachedFamiliarId: 'f1' })]),
    );
    expect(party).toHaveLength(1);
    expect(party[0].route).toBe('/a/knowledge/g9');
    expect(party[0].station).toEqual({
      kind: 'stationed',
      goalId: 'g9',
      mapTitle: 'Fractions',
    });
  });

  it('links a confirmed-unstationed companion to the roster', () => {
    const party = resolveParty([member({ familiar_id: 'f1' })], reported([]));
    expect(party[0].route).toBe(ROSTER_ROUTE);
    expect(party[0].station).toEqual({ kind: 'unstationed' });
  });

  // ── The distinction the first draft of this file got WRONG ───────────────
  it('reports UNKNOWN, not unstationed, while the maps read has not reported', () => {
    // A bare `MapCard[]` cannot express "the read failed": an empty one would
    // mean both "no maps" and "could not find out", and every companion would
    // render as confirmed idle while it may be marching. This is why the strip
    // takes a `MapsReport` and delegates to `stationFrom`.
    const party = resolveParty([member({ familiar_id: 'f1' })], UNREPORTED);
    expect(party[0].station).toEqual({ kind: 'unknown' });
    expect(party[0].station.kind).not.toBe('unstationed');
  });

  it('still gives an unknown station a LIVE destination', () => {
    // The roster, which shows the same uncertainty honestly. Never a link built
    // from a map we are not sure exists.
    const party = resolveParty([member({ familiar_id: 'f1' })], UNREPORTED);
    expect(party[0].route).toBe(ROSTER_ROUTE);
  });

  it('answers unknown even when an unreported read happens to hold a match', () => {
    // Half-knowing is the state that produces confident wrong answers.
    const party = resolveParty(
      [member({ familiar_id: 'f1' })],
      { reported: false, cards: [map({ goalId: 'g1', attachedFamiliarId: 'f1' })] },
    );
    expect(party[0].station.kind).toBe('unknown');
    expect(party[0].route).toBe(ROSTER_ROUTE);
  });

  // ── The strip's own guarantees ───────────────────────────────────────────
  it('gives EVERY member a live destination, whatever its station', () => {
    const party = resolveParty(
      [
        member({ familiar_id: 'f1' }),
        member({ familiar_id: 'f2', name: 'Ash' }),
        member({ familiar_id: 'f3', name: 'Sol' }),
      ],
      reported([map({ goalId: 'g1', attachedFamiliarId: 'f2' })]),
    );
    expect(party).toHaveLength(3);
    for (const p of party) {
      expect(p.route.startsWith('/a/'), `${p.name} has no live route`).toBe(true);
    }
    expect(party.map((p) => p.route)).toEqual([
      ROSTER_ROUTE,
      '/a/knowledge/g1',
      ROSTER_ROUTE,
    ]);
  });

  it('follows the ROSTER order, so archiving a map does not reshuffle the strip', () => {
    const roster = [
      member({ familiar_id: 'f1', name: 'Vex' }),
      member({ familiar_id: 'f2', name: 'Ash' }),
    ];
    const withMaps = resolveParty(
      roster,
      reported([
        map({ goalId: 'gB', attachedFamiliarId: 'f2' }),
        map({ goalId: 'gA', attachedFamiliarId: 'f1' }),
      ]),
    );
    expect(withMaps.map((p) => p.name)).toEqual(['Vex', 'Ash']);
    expect(resolveParty(roster, reported([])).map((p) => p.name)).toEqual(['Vex', 'Ash']);
  });

  it('conjures NO portrait for a map naming a companion not in the roster', () => {
    expect(resolveParty([], reported([map({ attachedFamiliarId: 'ghost' })]))).toEqual([]);
  });

  it('is empty for an empty roster, reported or not', () => {
    expect(resolveParty([], reported([]))).toEqual([]);
    expect(resolveParty([], UNREPORTED)).toEqual([]);
  });

  it('carries the name, species and stage the portrait needs', () => {
    const party = resolveParty(
      [member({ familiar_id: 'f1', name: 'Vex', species: 'fox', stage_label: 'adept' })],
      reported([]),
    );
    expect(party[0]).toMatchObject({
      familiarId: 'f1',
      name: 'Vex',
      species: 'fox',
      stageLabel: 'adept',
    });
  });

  it('is a projection: it mutates neither input', () => {
    const roster = [member({ familiar_id: 'f1' })];
    const maps = reported([map({ goalId: 'g1', attachedFamiliarId: 'f1' })]);
    const before = JSON.stringify([roster, maps]);
    resolveParty(roster, maps);
    expect(JSON.stringify([roster, maps])).toBe(before);
  });
});
