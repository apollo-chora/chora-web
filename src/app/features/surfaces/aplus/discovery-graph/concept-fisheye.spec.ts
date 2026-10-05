import { describe, it, expect } from 'vitest';

import {
  HEX_ORDER,
  MAX_NEIGHBORS,
  buildConceptFisheye,
  deriveRootId,
} from './concept-fisheye';
import type {
  ConceptEdge,
  ConceptGraph,
  ConceptNode,
} from './concept-graph.model';

function concept(
  conceptId: string,
  title: string,
  atomRefs: readonly string[] = [],
): ConceptNode {
  return { conceptId, title, atomRefs };
}

function edge(
  edgeId: string,
  sourceConceptId: string,
  targetConceptId: string,
  cls: 'hierarchy' | 'lateral',
): ConceptEdge {
  return {
    edgeId,
    sourceConceptId,
    targetConceptId,
    class: cls,
    provenance: 'learner_authored',
  };
}

describe('deriveRootId', () => {
  it('returns null for an empty graph', () => {
    expect(deriveRootId({ concepts: [], edges: [] })).toBeNull();
  });

  it('returns the single concept id when there are no edges (unique root)', () => {
    const graph: ConceptGraph = { concepts: [concept('a', 'A')], edges: [] };
    expect(deriveRootId(graph)).toBe('a');
  });

  it('returns the concept with no incoming hierarchy edge', () => {
    const graph: ConceptGraph = {
      concepts: [concept('a', 'A'), concept('b', 'B'), concept('c', 'C')],
      edges: [edge('e1', 'a', 'b', 'hierarchy'), edge('e2', 'b', 'c', 'hierarchy')],
    };
    expect(deriveRootId(graph)).toBe('a');
  });

  it('ignores lateral edges when computing the root', () => {
    const graph: ConceptGraph = {
      concepts: [concept('a', 'A'), concept('b', 'B')],
      edges: [edge('e1', 'b', 'a', 'lateral')],
    };
    // Lateral edge does not make `a` a hierarchy child ⇒ both are roots ⇒ ambiguous.
    expect(deriveRootId(graph)).toBeNull();
  });

  it('returns null when the root is ambiguous (>1 candidates)', () => {
    const graph: ConceptGraph = {
      concepts: [concept('a', 'A'), concept('b', 'B')],
      edges: [],
    };
    expect(deriveRootId(graph)).toBeNull();
  });
});

describe('buildConceptFisheye', () => {
  it('returns null when the focal id is not in the graph', () => {
    const graph: ConceptGraph = { concepts: [concept('a', 'A')], edges: [] };
    expect(buildConceptFisheye(graph, 'missing')).toBeNull();
  });

  it('builds a focal with the correct atom count and no neighbours for an isolated concept', () => {
    const graph: ConceptGraph = {
      concepts: [concept('a', 'Fractions', ['atom-1', 'atom-2'])],
      edges: [],
    };
    const fisheye = buildConceptFisheye(graph, 'a');
    expect(fisheye).not.toBeNull();
    expect(fisheye?.focal).toEqual({
      conceptId: 'a',
      title: 'Fractions',
      atomCount: 2,
    });
    expect(fisheye?.neighbors).toEqual([]);
    // A lone concept is its own unique root.
    expect(fisheye?.isRoot).toBe(true);
  });

  it('classifies a hierarchy child (focal is the source)', () => {
    const graph: ConceptGraph = {
      concepts: [concept('a', 'A'), concept('b', 'B', ['x'])],
      edges: [edge('e1', 'a', 'b', 'hierarchy')],
    };
    const fisheye = buildConceptFisheye(graph, 'a');
    expect(fisheye?.neighbors).toHaveLength(1);
    expect(fisheye?.neighbors[0]).toMatchObject({
      conceptId: 'b',
      relation: 'child',
      position: 'N',
      atomCount: 1,
      edgeId: 'e1',
      edgeClass: 'hierarchy',
    });
  });

  it('classifies a hierarchy parent (focal is the target) and marks focal not-root', () => {
    const graph: ConceptGraph = {
      concepts: [concept('a', 'A'), concept('b', 'B')],
      edges: [edge('e1', 'a', 'b', 'hierarchy')],
    };
    const fisheye = buildConceptFisheye(graph, 'b');
    expect(fisheye?.neighbors[0]).toMatchObject({
      conceptId: 'a',
      relation: 'parent',
    });
    expect(fisheye?.isRoot).toBe(false);
  });

  it('classifies lateral edges in either direction', () => {
    const graph: ConceptGraph = {
      concepts: [concept('a', 'A'), concept('b', 'B'), concept('c', 'C')],
      edges: [edge('e1', 'a', 'b', 'lateral'), edge('e2', 'c', 'a', 'lateral')],
    };
    const fisheye = buildConceptFisheye(graph, 'a');
    const rels = fisheye?.neighbors.map((n) => n.relation);
    expect(rels).toEqual(['lateral', 'lateral']);
  });

  it('orders parents first, then children, then laterals (parent at N)', () => {
    const graph: ConceptGraph = {
      concepts: [
        concept('focal', 'Focal'),
        concept('p', 'Parent'),
        concept('c', 'Child'),
        concept('l', 'Lateral'),
      ],
      edges: [
        edge('e1', 'p', 'focal', 'hierarchy'), // parent
        edge('e2', 'focal', 'c', 'hierarchy'), // child
        edge('e3', 'focal', 'l', 'lateral'), // lateral
      ],
    };
    const fisheye = buildConceptFisheye(graph, 'focal');
    expect(fisheye?.neighbors.map((n) => n.relation)).toEqual([
      'parent',
      'child',
      'lateral',
    ]);
    expect(fisheye?.neighbors[0].position).toBe('N');
  });

  it('dedupes multiple edges to the same concept (first edge wins)', () => {
    const graph: ConceptGraph = {
      concepts: [concept('a', 'A'), concept('b', 'B')],
      edges: [
        edge('e1', 'a', 'b', 'hierarchy'),
        edge('e2', 'a', 'b', 'lateral'),
      ],
    };
    const fisheye = buildConceptFisheye(graph, 'a');
    expect(fisheye?.neighbors).toHaveLength(1);
    expect(fisheye?.neighbors[0].edgeId).toBe('e1');
    expect(fisheye?.neighbors[0].relation).toBe('child');
  });

  it('caps neighbours at 6 and assigns them to the hex ring order', () => {
    const neighbours = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8'];
    const graph: ConceptGraph = {
      concepts: [
        concept('focal', 'Focal'),
        ...neighbours.map((n) => concept(n, n.toUpperCase())),
      ],
      edges: neighbours.map((n, i) =>
        edge(`e${i}`, 'focal', n, 'lateral'),
      ),
    };
    const fisheye = buildConceptFisheye(graph, 'focal');
    expect(fisheye?.neighbors).toHaveLength(MAX_NEIGHBORS);
    expect(fisheye?.neighbors.map((n) => n.position)).toEqual([...HEX_ORDER]);
  });

  it('ignores dangling edges that reference a missing concept', () => {
    const graph: ConceptGraph = {
      concepts: [concept('a', 'A')],
      edges: [edge('e1', 'a', 'ghost', 'hierarchy')],
    };
    const fisheye = buildConceptFisheye(graph, 'a');
    expect(fisheye?.neighbors).toEqual([]);
  });

  it('ignores self-loop edges', () => {
    const graph: ConceptGraph = {
      concepts: [concept('a', 'A')],
      edges: [edge('e1', 'a', 'a', 'lateral')],
    };
    const fisheye = buildConceptFisheye(graph, 'a');
    expect(fisheye?.neighbors).toEqual([]);
  });

  // WS-C: the 6-face cap must NOT silently drop the rest — the overflow feeds
  // the "+N more" drawer (ADR-212 D2 soft-cap intent).
  it('exposes neighbours beyond 6 as overflow (never silently dropped)', () => {
    const neighbours = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8'];
    const graph: ConceptGraph = {
      concepts: [
        concept('focal', 'Focal'),
        ...neighbours.map((n) => concept(n, n.toUpperCase())),
      ],
      edges: neighbours.map((n, i) => edge(`e${i}`, 'focal', n, 'lateral')),
    };
    const fisheye = buildConceptFisheye(graph, 'focal');
    expect(fisheye?.neighbors).toHaveLength(MAX_NEIGHBORS);
    expect(fisheye?.overflow).toHaveLength(neighbours.length - MAX_NEIGHBORS);
    // Overflow items carry the concept detail but NO hex position (drawer list).
    const of0 = fisheye?.overflow[0];
    expect(of0).toMatchObject({ relation: 'lateral', edgeClass: 'lateral' });
    expect(of0 && 'position' in of0).toBe(false);
    // On-face + overflow together account for every neighbour, no duplicates.
    const ids = [
      ...(fisheye?.neighbors ?? []).map((n) => n.conceptId),
      ...(fisheye?.overflow ?? []).map((o) => o.conceptId),
    ];
    expect(new Set(ids).size).toBe(neighbours.length);
  });

  it('has empty overflow when there are 6 or fewer neighbours', () => {
    const graph: ConceptGraph = {
      concepts: [concept('a', 'A'), concept('b', 'B')],
      edges: [edge('e1', 'a', 'b', 'hierarchy')],
    };
    expect(buildConceptFisheye(graph, 'a')?.overflow).toEqual([]);
  });

  // WS-C: a map's root is EXPLICIT (Goal.RootConceptID, ADR-214 D1) — stop
  // relying on deriveRootId ("the one rootless concept"), which breaks across maps.
  it('honours an explicit root id over the derived root', () => {
    // Two rootless concepts ⇒ deriveRootId is ambiguous (null), but the map
    // tells us the explicit root.
    const graph: ConceptGraph = {
      concepts: [concept('a', 'A'), concept('b', 'B')],
      edges: [edge('e1', 'a', 'b', 'lateral')],
    };
    expect(buildConceptFisheye(graph, 'a', 'a')?.isRoot).toBe(true);
    expect(buildConceptFisheye(graph, 'b', 'a')?.isRoot).toBe(false);
  });

  it('falls back to the derived root when no explicit root is given', () => {
    const graph: ConceptGraph = {
      concepts: [concept('a', 'A'), concept('b', 'B')],
      edges: [edge('e1', 'a', 'b', 'hierarchy')],
    };
    // Back-compat: existing callers pass no explicit root.
    expect(buildConceptFisheye(graph, 'a')?.isRoot).toBe(true);
    expect(buildConceptFisheye(graph, 'b')?.isRoot).toBe(false);
  });
});
