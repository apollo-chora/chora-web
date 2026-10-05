/**
 * RED spec for the Roads layer ON THE CANVAS (C4 frontend slice 1).
 *
 * `map-roads.spec.ts` pins the inversion and the labelling. This one pins what
 * the fisheye renderer does with the result: a road drawn while the layer is
 * switched off, a lone marker claiming a route that was never drawn, and a
 * course id rendered as though it were a course name.
 *
 * The first draft of this spec also asserted that a stop off the map is dropped.
 * That case does not exist: the backend paints roads onto the concepts it
 * returns, and buildLensLayout places every concept it is given, orphans
 * included. The orphan test below pins what actually happens instead.
 *
 * Renderer-level, so it drives the component's computed rather than the DOM: the
 * geometry is the contract, and Chromatic owns the pixels.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';

import type {
  ConceptEdge,
  ConceptNode,
} from '../../discovery-graph/concept-graph.model';

import { ConceptLensMapComponent } from './concept-lens-map.component';

const CERT = 'p-cert';
const COURSE = 'c-algebra';

function road(atomPosition: number, courseTitle?: string) {
  return {
    pathId: CERT,
    courseId: COURSE,
    ...(courseTitle === undefined ? {} : { courseTitle }),
    atomPosition,
    atomCount: 1,
  };
}

/** root -> a -> b, with the road running through root, a and b. */
function graph(): { concepts: ConceptNode[]; edges: ConceptEdge[] } {
  return {
    concepts: [
      { conceptId: 'root', title: 'Algebra', atomRefs: [], roads: [road(1, 'Algebra I')] },
      { conceptId: 'a', title: 'Linear', atomRefs: [], roads: [road(3, 'Algebra I')] },
      { conceptId: 'b', title: 'Quadratics', atomRefs: [], roads: [road(5, 'Algebra I')] },
    ],
    edges: [
      { edgeId: 'e1', sourceConceptId: 'root', targetConceptId: 'a', class: 'hierarchy', provenance: 'learner_authored' },
      { edgeId: 'e2', sourceConceptId: 'root', targetConceptId: 'b', class: 'hierarchy', provenance: 'learner_authored' },
    ],
  };
}

describe('ConceptLensMapComponent roads layer', () => {
  let fixture: ComponentFixture<ConceptLensMapComponent>;
  let component: ConceptLensMapComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ConceptLensMapComponent] });
    fixture = TestBed.createComponent(ConceptLensMapComponent);
    component = fixture.componentInstance;
    const g = graph();
    fixture.componentRef.setInput('concepts', g.concepts);
    fixture.componentRef.setInput('edges', g.edges);
    fixture.componentRef.setInput('focusId', 'root');
    fixture.componentRef.setInput('rootId', 'root');
    fixture.componentRef.setInput('roadsVisible', true);
    fixture.detectChanges();
  });

  it('draws one run with a marker per stop, in travel order', () => {
    const runs = component.renderRoads();

    expect(runs).toHaveLength(1);
    expect(runs[0].pathId).toBe(CERT);
    expect(runs[0].markers.map((m) => m.text)).toEqual(['1', '3', '5']);
  });

  it('draws a segment between each consecutive pair of stops', () => {
    const runs = component.renderRoads();

    // Three stops on the map means two segments, and each must be a real path.
    expect(runs[0].segments).toHaveLength(2);
    for (const seg of runs[0].segments) {
      expect(seg.d).toMatch(/^M [\d.-]+ [\d.-]+ L [\d.-]+ [\d.-]+$/);
    }
  });

  it('labels the road with the resolved course name', () => {
    const runs = component.renderRoads();

    expect(runs[0].label).toBe('Algebra I');
    expect(runs[0].isCourseId).toBe(false);
  });

  it('flags an unresolved label so the canvas never shows an id as a name', () => {
    fixture.componentRef.setInput('concepts', [
      { conceptId: 'root', title: 'Algebra', atomRefs: [], roads: [road(1)] },
      { conceptId: 'a', title: 'Linear', atomRefs: [], roads: [road(3)] },
    ] satisfies ConceptNode[]);
    fixture.detectChanges();

    const runs = component.renderRoads();
    expect(runs[0].label).toBe(COURSE);
    expect(runs[0].isCourseId).toBe(true);
  });

  it('still draws a stop that is an ORPHAN in the hierarchy', () => {
    // Surprising but correct, and worth pinning because the first draft of this
    // spec assumed the opposite. buildLensLayout places EVERY concept it is
    // given, putting a node unreachable from the root on a ring past the tree,
    // so a road running through an orphan is a road the learner can see. A stop
    // therefore cannot be "not on this map": the backend paints roads onto the
    // concepts it returns, and all of them get placed.
    const g = graph();
    fixture.componentRef.setInput('concepts', [
      ...g.concepts,
      { conceptId: 'orphan', title: 'Unlinked', atomRefs: [], roads: [road(9, 'Algebra I')] },
    ] satisfies ConceptNode[]);
    fixture.detectChanges();

    const runs = component.renderRoads();
    expect(runs[0].markers.map((m) => m.text)).toEqual(['1', '3', '5', '9']);
    expect(runs[0].segments).toHaveLength(3);
  });

  it('draws nothing at all when the layer is switched off', () => {
    fixture.componentRef.setInput('roadsVisible', false);
    fixture.detectChanges();

    expect(component.renderRoads()).toEqual([]);
  });

  it('draws no run for a road with a single stop on this map', () => {
    // One stop is a fact the DRAWER reports; on the canvas there is no road to
    // see, and a lone marker floating by a hex claims a route that is not drawn.
    fixture.componentRef.setInput('concepts', [
      { conceptId: 'root', title: 'Algebra', atomRefs: [], roads: [road(1, 'Algebra I')] },
      { conceptId: 'a', title: 'Linear', atomRefs: [], roads: [] },
      { conceptId: 'b', title: 'Quadratics', atomRefs: [], roads: [] },
    ] satisfies ConceptNode[]);
    fixture.detectChanges();

    expect(component.renderRoads()).toEqual([]);
  });
});
