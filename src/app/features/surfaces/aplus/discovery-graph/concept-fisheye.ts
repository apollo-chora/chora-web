/**
 * Concept-model hex fisheye (ADR-212).
 *
 * Rebinds the hexagonal fog interaction — reused from the ADR-143 atom
 * canvas — onto the learner-sovereign concept model. A node is a focal
 * `ConceptNode`; its neighbours are the concepts reachable across ONE
 * learner-authored edge (hierarchy parent / child, or lateral). Up to 6
 * neighbours fan out on the hex grid; tapping one recentres the fisheye.
 *
 * Pure, framework-free, and fully unit-tested — the presentational
 * `ConceptHexMapComponent` renders whatever this produces.
 */
import type { ConceptGraph, EdgeClass } from './concept-graph.model';

/** The six hex slots at 60° intervals (matches the canvas SCSS data-position). */
export type HexagonPosition = 'N' | 'NE' | 'SE' | 'S' | 'SW' | 'NW';

/** Ring order neighbours are assigned to (parent-first ⇒ parent sits at N/top). */
export const HEX_ORDER: readonly HexagonPosition[] = ['N', 'NE', 'SE', 'S', 'SW', 'NW'];

/** A hex has 6 faces, so at most 6 neighbours are shown around the focal. */
export const MAX_NEIGHBORS = 6;

/** How the neighbour relates to the focal, derived from edge class + direction. */
export type ConceptRelation = 'parent' | 'child' | 'lateral';

export interface ConceptFocal {
  readonly conceptId: string;
  readonly title: string;
  readonly atomCount: number;
}

export interface ConceptNeighborView {
  readonly conceptId: string;
  readonly title: string;
  readonly atomCount: number;
  readonly position: HexagonPosition;
  readonly relation: ConceptRelation;
  readonly edgeId: string;
  readonly edgeClass: EdgeClass;
}

/**
 * A neighbour that spilled past the 6 hex faces (ADR-212 D2 soft cap). Same
 * detail as a shown neighbour but WITHOUT a hex position — it renders in the
 * "+N more" overflow drawer, not on the ring (WS-C).
 */
export interface ConceptOverflowView {
  readonly conceptId: string;
  readonly title: string;
  readonly atomCount: number;
  readonly relation: ConceptRelation;
  readonly edgeId: string;
  readonly edgeClass: EdgeClass;
}

export interface ConceptFisheye {
  readonly focal: ConceptFocal;
  readonly neighbors: readonly ConceptNeighborView[];
  /**
   * Neighbours beyond the 6 shown faces (the "+N more" drawer). Empty when the
   * focal has ≤6 relations. Never silently dropped (the WS-C fix).
   */
  readonly overflow: readonly ConceptOverflowView[];
  /** True when the focal is the map root. */
  readonly isRoot: boolean;
}

/** Parents render upward (N) first, then children, then laterals. */
const RELATION_RANK: Record<ConceptRelation, number> = {
  parent: 0,
  child: 1,
  lateral: 2,
};

/**
 * Derive the map root: the single concept that is never a hierarchy child
 * (has no incoming hierarchy edge). Returns null when there are no concepts
 * or the root is ambiguous (0 or >1 candidates) — callers then fall back to
 * the first concept and leave "make this my root" enabled.
 */
export function deriveRootId(graph: ConceptGraph): string | null {
  if (graph.concepts.length === 0) {
    return null;
  }
  const hasHierarchyParent = new Set<string>();
  for (const e of graph.edges) {
    if (e.class === 'hierarchy') {
      hasHierarchyParent.add(e.targetConceptId);
    }
  }
  const roots = graph.concepts.filter(
    (c) => !hasHierarchyParent.has(c.conceptId),
  );
  return roots.length === 1 ? roots[0].conceptId : null;
}

interface Candidate {
  readonly conceptId: string;
  readonly title: string;
  readonly atomCount: number;
  readonly relation: ConceptRelation;
  readonly edgeId: string;
  readonly edgeClass: EdgeClass;
}

/**
 * Build the fisheye around `focalId`: the focal concept plus up to 6 related
 * concepts. Each edge touching the focal contributes one neighbour —
 * `hierarchy` edges resolve to parent/child by direction, `lateral` edges to
 * lateral. Neighbours dedupe by concept (first edge wins), sort
 * parent → child → lateral then by title; the first 6 fill the hex faces and
 * any remainder spills into `overflow` (the "+N more" drawer). Returns null
 * when `focalId` is not in the graph.
 *
 * `explicitRootId` (WS-C, ADR-214 D1) sets which concept is the map root — when
 * given, `isRoot = focalId === explicitRootId`; when omitted, it falls back to
 * the derived "one rootless concept" (back-compat for the whole-graph canvas).
 */
export function buildConceptFisheye(
  graph: ConceptGraph,
  focalId: string,
  explicitRootId?: string,
): ConceptFisheye | null {
  const byId = new Map(graph.concepts.map((c) => [c.conceptId, c]));
  const focal = byId.get(focalId);
  if (!focal) {
    return null;
  }

  const seen = new Set<string>();
  const candidates: Candidate[] = [];

  for (const e of graph.edges) {
    let otherId: string | null = null;
    let relation: ConceptRelation | null = null;

    if (e.sourceConceptId === focalId) {
      otherId = e.targetConceptId;
      relation = e.class === 'hierarchy' ? 'child' : 'lateral';
    } else if (e.targetConceptId === focalId) {
      otherId = e.sourceConceptId;
      relation = e.class === 'hierarchy' ? 'parent' : 'lateral';
    }

    if (otherId === null || relation === null) continue;
    if (otherId === focalId) continue; // self-loop guard
    if (seen.has(otherId)) continue; // dedupe: first edge to a concept wins
    const other = byId.get(otherId);
    if (!other) continue; // dangling-edge guard (referential integrity)

    seen.add(otherId);
    candidates.push({
      conceptId: other.conceptId,
      title: other.title,
      atomCount: other.atomRefs.length,
      relation,
      edgeId: e.edgeId,
      edgeClass: e.class,
    });
  }

  candidates.sort((a, b) => {
    const byRank = RELATION_RANK[a.relation] - RELATION_RANK[b.relation];
    return byRank !== 0 ? byRank : a.title.localeCompare(b.title);
  });

  const neighbors: ConceptNeighborView[] = candidates
    .slice(0, MAX_NEIGHBORS)
    .map((c, i) => ({
      conceptId: c.conceptId,
      title: c.title,
      atomCount: c.atomCount,
      position: HEX_ORDER[i],
      relation: c.relation,
      edgeId: c.edgeId,
      edgeClass: c.edgeClass,
    }));

  // Everything past the 6 faces feeds the "+N more" drawer (no hex position).
  const overflow: ConceptOverflowView[] = candidates
    .slice(MAX_NEIGHBORS)
    .map((c) => ({
      conceptId: c.conceptId,
      title: c.title,
      atomCount: c.atomCount,
      relation: c.relation,
      edgeId: c.edgeId,
      edgeClass: c.edgeClass,
    }));

  // Root: explicit (the map's Goal.RootConceptID) when supplied, else derived.
  const explicit = explicitRootId?.trim();
  const isRoot = explicit
    ? explicit === focalId
    : deriveRootId(graph) === focalId;

  return {
    focal: {
      conceptId: focal.conceptId,
      title: focal.title,
      atomCount: focal.atomRefs.length,
    },
    neighbors,
    overflow,
    isRoot,
  };
}
