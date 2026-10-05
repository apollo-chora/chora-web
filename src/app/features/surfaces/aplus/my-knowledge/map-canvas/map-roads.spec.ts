/**
 * RED spec for the Roads layer's pure geometry (C4 frontend slice 1).
 *
 * The wire gives roads PER CONCEPT: each concept carries the course-bound paths
 * that touch it. To DRAW a road we need the inverse, one run per path with its
 * concepts in travel order, so this module inverts the index and nothing else.
 *
 * Two things it must never do, because both would put a false claim on the map:
 * reorder a road's stops by anything but their position on the path, and print a
 * course id where a course NAME is expected. The backend deliberately omits
 * courseTitle when the course_directory projection has no row, so an id reaching
 * the canvas is an honest "not resolved", not a name.
 */
import { describe, expect, it } from 'vitest';

import type { ConceptNode } from '../../discovery-graph/concept-graph.model';

import { buildRoadRuns, conceptRoadEntries, roadLabel } from './map-roads';

const CERT = 'p-cert';
const ELECTIVE = 'p-elective';
const COURSE_A = 'c-algebra';
const COURSE_B = 'c-poetry';

function concept(
  conceptId: string,
  roads: ConceptNode['roads'] = undefined,
): ConceptNode {
  return { conceptId, title: conceptId, atomRefs: [], roads };
}

describe('buildRoadRuns', () => {
  it('groups concepts into one run per path, in atomPosition order', () => {
    // Deliberately supplied out of order: the run must be sorted by POSITION on
    // the path, never by the order concepts arrived in the graph payload.
    const concepts = [
      concept('c-quad', [
        { pathId: CERT, courseId: COURSE_A, courseTitle: 'Algebra I', atomPosition: 7, atomCount: 1 },
      ]),
      concept('c-lin', [
        { pathId: CERT, courseId: COURSE_A, courseTitle: 'Algebra I', atomPosition: 2, atomCount: 2 },
      ]),
    ];

    const runs = buildRoadRuns(concepts);

    expect(runs).toHaveLength(1);
    expect(runs[0].pathId).toBe(CERT);
    expect(runs[0].courseId).toBe(COURSE_A);
    expect(runs[0].courseTitle).toBe('Algebra I');
    expect(runs[0].stops.map((s) => s.conceptId)).toEqual(['c-lin', 'c-quad']);
    expect(runs[0].stops.map((s) => s.atomPosition)).toEqual([2, 7]);
  });

  it('keeps two roads through one concept apart', () => {
    const concepts = [
      concept('c-lin', [
        { pathId: CERT, courseId: COURSE_A, atomPosition: 2, atomCount: 1 },
        { pathId: ELECTIVE, courseId: COURSE_B, atomPosition: 1, atomCount: 1 },
      ]),
      concept('c-quad', [
        { pathId: CERT, courseId: COURSE_A, atomPosition: 5, atomCount: 1 },
      ]),
    ];

    const runs = buildRoadRuns(concepts);

    expect(runs.map((r) => r.pathId)).toEqual([CERT, ELECTIVE]);
    expect(runs[0].stops).toHaveLength(2);
    expect(runs[1].stops).toHaveLength(1);
  });

  it('orders runs by pathId so two renders of one map agree', () => {
    const forward = buildRoadRuns([
      concept('a', [{ pathId: 'p-b', courseId: COURSE_A, atomPosition: 1, atomCount: 1 }]),
      concept('b', [{ pathId: 'p-a', courseId: COURSE_B, atomPosition: 1, atomCount: 1 }]),
    ]);
    const reversed = buildRoadRuns([
      concept('b', [{ pathId: 'p-a', courseId: COURSE_B, atomPosition: 1, atomCount: 1 }]),
      concept('a', [{ pathId: 'p-b', courseId: COURSE_A, atomPosition: 1, atomCount: 1 }]),
    ]);

    expect(forward.map((r) => r.pathId)).toEqual(['p-a', 'p-b']);
    expect(reversed.map((r) => r.pathId)).toEqual(forward.map((r) => r.pathId));
  });

  it('breaks an atomPosition tie by conceptId so the order is total', () => {
    const runs = buildRoadRuns([
      concept('c-zeta', [{ pathId: CERT, courseId: COURSE_A, atomPosition: 3, atomCount: 1 }]),
      concept('c-alpha', [{ pathId: CERT, courseId: COURSE_A, atomPosition: 3, atomCount: 1 }]),
    ]);

    expect(runs[0].stops.map((s) => s.conceptId)).toEqual(['c-alpha', 'c-zeta']);
  });

  it('is empty when no concept carries a road', () => {
    expect(buildRoadRuns([concept('c-lin'), concept('c-quad', [])])).toEqual([]);
  });

  it('takes the course title from whichever stop resolved one', () => {
    // The projection resolves per COURSE, so every stop on a road should agree.
    // If one stop is missing it (an older cached payload), the run must still
    // carry the name rather than falling back to the id for the whole road.
    const runs = buildRoadRuns([
      concept('c-lin', [
        { pathId: CERT, courseId: COURSE_A, atomPosition: 1, atomCount: 1 },
      ]),
      concept('c-quad', [
        { pathId: CERT, courseId: COURSE_A, courseTitle: 'Algebra I', atomPosition: 2, atomCount: 1 },
      ]),
    ]);

    expect(runs[0].courseTitle).toBe('Algebra I');
  });
});

describe('roadLabel', () => {
  it('prefers the resolved course title and says it is a name', () => {
    const label = roadLabel({ courseId: COURSE_A, courseTitle: 'Algebra I' });

    expect(label.text).toBe('Algebra I');
    expect(label.isCourseId).toBe(false);
  });

  it('falls back to the course id and FLAGS it as an id, never a name', () => {
    // The backend omits courseTitle when the course_directory projection has no
    // row. The canvas must be able to render that differently and announce it
    // differently, or a raw UUID reads to the learner as a course name.
    const label = roadLabel({ courseId: COURSE_A });

    expect(label.text).toBe(COURSE_A);
    expect(label.isCourseId).toBe(true);
  });

  it('treats a blank title as unresolved rather than printing nothing', () => {
    const label = roadLabel({ courseId: COURSE_A, courseTitle: '   ' });

    expect(label.text).toBe(COURSE_A);
    expect(label.isCourseId).toBe(true);
  });
});

/**
 * The drawer's "also on" list (C4 frontend slice 2).
 *
 * `buildRoadRuns` answers "what runs across this MAP"; the Overview tab asks the
 * inverse question about one node, "what else does THIS concept sit on", which
 * the wire already answers per concept. This is the presentation order + label
 * rule for that list, kept here so the drawer template holds no policy.
 *
 * The ordinal is `atomPosition`, the concept's first atom on the path, which is
 * the "module N" the learner sees. It is TEXT, never a deep link: the learn
 * route reads `courseId` and nothing else (course-learn.component.ts:73), and
 * there is no path-scoped route at all, so a module anchor would be a link to a
 * parameter no route reads.
 */
describe('conceptRoadEntries', () => {
  it('is empty for a concept with no roads, and for no concept at all', () => {
    expect(conceptRoadEntries(concept('c-lin'))).toEqual([]);
    expect(conceptRoadEntries(concept('c-lin', []))).toEqual([]);
    expect(conceptRoadEntries(null)).toEqual([]);
  });

  it('carries the module ordinal and the atom count off the wire', () => {
    const entries = conceptRoadEntries(
      concept('c-lin', [
        { pathId: CERT, courseId: COURSE_A, courseTitle: 'Algebra I', atomPosition: 4, atomCount: 3 },
      ]),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].pathId).toBe(CERT);
    expect(entries[0].courseId).toBe(COURSE_A);
    expect(entries[0].atomPosition).toBe(4);
    expect(entries[0].atomCount).toBe(3);
    expect(entries[0].label.text).toBe('Algebra I');
    expect(entries[0].label.isCourseId).toBe(false);
  });

  it('flags an unresolved course as an id so the drawer never calls it a name', () => {
    const entries = conceptRoadEntries(
      concept('c-lin', [
        { pathId: CERT, courseId: COURSE_A, atomPosition: 1, atomCount: 1 },
        { pathId: ELECTIVE, courseId: COURSE_B, courseTitle: '  ', atomPosition: 2, atomCount: 1 },
      ]),
    );

    expect(entries.map((e) => e.label.text)).toEqual([COURSE_A, COURSE_B]);
    expect(entries.map((e) => e.label.isCourseId)).toEqual([true, true]);
  });

  it('orders by pathId so the drawer reads the same on every open', () => {
    const forward = conceptRoadEntries(
      concept('c-lin', [
        { pathId: 'p-b', courseId: COURSE_A, atomPosition: 1, atomCount: 1 },
        { pathId: 'p-a', courseId: COURSE_B, atomPosition: 9, atomCount: 1 },
      ]),
    );
    const reversed = conceptRoadEntries(
      concept('c-lin', [
        { pathId: 'p-a', courseId: COURSE_B, atomPosition: 9, atomCount: 1 },
        { pathId: 'p-b', courseId: COURSE_A, atomPosition: 1, atomCount: 1 },
      ]),
    );

    expect(forward.map((e) => e.pathId)).toEqual(['p-a', 'p-b']);
    expect(reversed.map((e) => e.pathId)).toEqual(forward.map((e) => e.pathId));
  });

  it('keeps one course reached by two paths as two entries', () => {
    // Same course, two paths through it: the learner is on both, and collapsing
    // them would drop a module ordinal that differs between the two.
    const entries = conceptRoadEntries(
      concept('c-lin', [
        { pathId: CERT, courseId: COURSE_A, courseTitle: 'Algebra I', atomPosition: 2, atomCount: 1 },
        { pathId: ELECTIVE, courseId: COURSE_A, courseTitle: 'Algebra I', atomPosition: 6, atomCount: 1 },
      ]),
    );

    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.atomPosition)).toEqual([2, 6]);
  });
});
