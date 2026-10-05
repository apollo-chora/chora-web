/**
 * RED spec for the Roads toggle in the lens bar (C4 frontend slice 1).
 *
 * Three states, and the third is the one worth the spec:
 *
 * a map WITH a road offers the toggle;
 * a map with no road does not, because a switch that changes nothing is a
 * switch the learner has to try before learning it does nothing;
 * a map whose roads could NOT be read says so, instead of looking like the
 * second case. `roadsPartial` is the backend telling us the layer was never
 * computed, and rendering that as "this map has no roads" would be a claim
 * built from a read that did not happen.
 */
import { describe, expect, it } from 'vitest';

import type { ConceptNode } from '../../discovery-graph/concept-graph.model';

import { mapHasRoads } from './map-roads';

function concept(id: string, roads?: ConceptNode['roads']): ConceptNode {
  return { conceptId: id, title: id, atomRefs: [], roads };
}

const ROAD = {
  pathId: 'p-cert',
  courseId: 'c-algebra',
  courseTitle: 'Algebra I',
  atomPosition: 2,
  atomCount: 1,
};

describe('mapHasRoads', () => {
  it('is true when any concept carries a road', () => {
    expect(mapHasRoads([concept('a'), concept('b', [ROAD])])).toBe(true);
  });

  it('is false when no concept carries one', () => {
    expect(mapHasRoads([concept('a'), concept('b', [])])).toBe(false);
  });

  it('is false for an empty map', () => {
    expect(mapHasRoads([])).toBe(false);
  });

  it('is false when every concept omits the field entirely', () => {
    // The flat /concept-graph read never sends roads. A map painted from it has
    // no roads layer to offer, and that is not the same as a course-less map:
    // the caller pairs this with roadsPartial to tell the two apart.
    expect(mapHasRoads([concept('a'), concept('b')])).toBe(false);
  });
});
