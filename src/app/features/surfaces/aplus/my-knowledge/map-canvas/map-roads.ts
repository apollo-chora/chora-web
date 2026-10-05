/**
 * Roads layer geometry (C4 frontend slice 1, plan section 8).
 *
 * Pure and framework-free, in the style of `concept-lens.ts`: the canvas renders
 * whatever this produces, and every rule about ORDER and LABELLING is tested
 * here rather than asserted through a component fixture.
 *
 * The wire indexes roads by CONCEPT, because that is what a drawer asks for
 * ("what else runs through this node"). Drawing a road needs the inverse: one
 * run per path, with its concepts in travel order. That inversion is all this
 * module does.
 *
 * Two rules it exists to hold:
 *
 * Order is by position ON THE PATH, never by the order concepts arrived in the
 * payload, and the sort is TOTAL (conceptId breaks a tie). A road that
 * reshuffles between two renders of the same map is a road the learner cannot
 * trust to mean anything.
 *
 * A course id is never presented as a course NAME. The backend omits
 * `courseTitle` when the `course_directory` projection has no row, which is an
 * honest "not resolved"; printing that raw UUID where a name belongs would read
 * to the learner as a course actually called that. `roadLabel` is the one place
 * that choice is made, and it tells the caller which of the two it returned.
 */
import type { ConceptNode, ConceptRoad } from '../../discovery-graph/concept-graph.model';

/** One concept's place on a road. */
export interface RoadStop {
  readonly conceptId: string;
  /** 1-based ordinal of the concept's first atom on the path (the "module N"). */
  readonly atomPosition: number;
  /** How many of the concept's atoms sit on this road. */
  readonly atomCount: number;
}

/** One course-bound path, with every concept of this map that it runs through. */
export interface RoadRun {
  readonly pathId: string;
  readonly courseId: string;
  readonly courseTitle?: string;
  readonly pathLabel?: string;
  readonly stops: readonly RoadStop[];
}

/** What to print for a road, and whether it is a name or a bare id. */
export interface RoadLabel {
  readonly text: string;
  /**
   * True when `text` is a raw course id because the projection resolved no
   * title. The caller MUST render and announce it differently: it is an
   * identifier the learner may recognise, never a course name.
   */
  readonly isCourseId: boolean;
}

/**
 * Invert the per-concept road index into one run per path.
 *
 * Runs come back ordered by `pathId` and each run's stops by `atomPosition`,
 * both total orders, so two renders of the same graph draw the same map.
 */
export function buildRoadRuns(concepts: readonly ConceptNode[]): readonly RoadRun[] {
  const byPath = new Map<string, { road: ConceptRoad; stops: RoadStop[] }>();

  for (const concept of concepts) {
    for (const road of concept.roads ?? []) {
      let run = byPath.get(road.pathId);
      if (!run) {
        run = { road, stops: [] };
        byPath.set(road.pathId, run);
      } else if (!hasTitle(run.road) && hasTitle(road)) {
        // The projection resolves per COURSE, so every stop should agree. When
        // one stop is missing the title (an older cached payload), keep the
        // resolved one rather than dropping the whole road back to its id.
        run = { road, stops: run.stops };
        byPath.set(road.pathId, run);
      }
      run.stops.push({
        conceptId: concept.conceptId,
        atomPosition: road.atomPosition,
        atomCount: road.atomCount,
      });
    }
  }

  return [...byPath.entries()]
    .sort(([a], [b]) => compare(a, b))
    .map(([pathId, { road, stops }]) => ({
      pathId,
      courseId: road.courseId,
      ...(hasTitle(road) ? { courseTitle: road.courseTitle } : {}),
      ...(road.pathLabel ? { pathLabel: road.pathLabel } : {}),
      stops: [...stops].sort(
        (x, y) =>
          x.atomPosition - y.atomPosition || compare(x.conceptId, y.conceptId),
      ),
    }));
}

/** One row of the drawer's "also on" list for a single concept. */
export interface ConceptRoadEntry {
  readonly pathId: string;
  readonly courseId: string;
  /** What to print for the course, and whether it is a raw id. */
  readonly label: RoadLabel;
  /** 1-based ordinal of the concept's first atom on the path (the "module N"). */
  readonly atomPosition: number;
  /** How many of the concept's atoms sit on this road. */
  readonly atomCount: number;
}

/**
 * The roads through ONE concept, as the drawer's Overview lists them.
 *
 * `buildRoadRuns` answers "what runs across this map"; this answers the drawer's
 * question about a single node, which the wire already indexes that way, so all
 * this adds is the presentation ORDER and the label rule.
 *
 * Ordered by `pathId` alone, which is a total order here: the wire carries one
 * entry per (concept, path), with `atomPosition` naming the concept's FIRST atom
 * on that path and `atomCount` collapsing the rest, so two roads through one
 * concept never share a pathId. No tie-break is written for a tie that cannot
 * happen.
 */
export function conceptRoadEntries(
  concept: ConceptNode | null | undefined,
): readonly ConceptRoadEntry[] {
  return [...(concept?.roads ?? [])]
    .sort((a, b) => compare(a.pathId, b.pathId))
    .map((road) => ({
      pathId: road.pathId,
      courseId: road.courseId,
      label: roadLabel(road),
      atomPosition: road.atomPosition,
      atomCount: road.atomCount,
    }));
}

/**
 * What to print for a road. The resolved course title when there is one, else
 * the course id FLAGGED as an id.
 *
 * Takes the minimum a label needs rather than a whole `RoadRun`, so the map's
 * runs and one concept's roads cannot drift into two different rules about when
 * an unresolved course may be printed as a name.
 */
export function roadLabel(run: Pick<RoadRun, 'courseId' | 'courseTitle'>): RoadLabel {
  const title = run.courseTitle?.trim();
  return title
    ? { text: title, isCourseId: false }
    : { text: run.courseId, isCourseId: true };
}

/** A road carries a usable name only when the title is present and not blank. */
function hasTitle(road: ConceptRoad): boolean {
  return (road.courseTitle?.trim().length ?? 0) > 0;
}

/** Locale-independent ordering: two clients must agree on the same map. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Does this map carry any road at all.
 *
 * Drives whether the lens bar offers the Roads toggle: a switch that changes
 * nothing is a switch the learner has to try before learning it does nothing.
 *
 * FALSE here is NOT "this map has no course": it is also what a graph painted by
 * the flat `/concept-graph` read looks like, since that read never sends roads.
 * The caller pairs this with `MapGraph.roadsPartial` to tell "no roads" from
 * "the roads were never read".
 */
export function mapHasRoads(concepts: readonly ConceptNode[]): boolean {
  return concepts.some((c) => (c.roads?.length ?? 0) > 0);
}
