/**
 * Knowledge-Graph weakness-terrain helpers (ADR-204 §5, Slice A).
 *
 * The KG fog now carries the W5 `growthEdge` overlay the front-end used to
 * drop. Each hexagon / cluster shows terrain colour banded by the edge's
 * `strength` (∈ [0,1], 1 = shakiest):
 *
 *   🔴 shaky  — strength ≥ 0.66  (weakest; drill here)
 *   🟠 wobbly — 0.33 ≤ strength < 0.66
 *   🟢 solid  — strength < 0.33, OR no active edge (mastered / fresh)
 *
 * This makes the dose's 40/30/30 universe spatial and finally renders the
 * long-promised §4.2.3 mastery-on-graph state (PLAN.md). It deliberately
 * reuses the Growth-Edges `masteryPercent` helper (mastery = 1 − strength)
 * so the on-map aria text matches the off-map meters exactly.
 *
 * Pure functions — shared by the dashboard explorations panel + the hexagon
 * canvas so the thresholds live in exactly one place.
 */
import { masteryPercent } from '../../growth-edges/growth-edge-mastery';
import type { GrowthEdgeRef } from './kg-fog.model';

export type { GrowthEdgeRef };

/** Terrain bands rendered on the map. */
export type TerrainBand = 'shaky' | 'wobbly' | 'solid';

/** Shaky at/above this; below `WOBBLY_MIN` is solid. */
const SHAKY_MIN = 0.66;
const WOBBLY_MIN = 0.33;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** i18n keys for the per-band legend + chip label (shared across surfaces). */
export const TERRAIN_LABEL_KEY: Readonly<Record<TerrainBand, string>> = {
  shaky: 'aplus.kg_terrain.shaky',
  wobbly: 'aplus.kg_terrain.wobbly',
  solid: 'aplus.kg_terrain.solid',
};

/**
 * i18n key for the orthogonal due-⏰ overlay (ADR-204 P2). "Due" is NOT a fourth
 * colour band — it is an independent axis layered over whatever band an edge is
 * in, so it has its own label rather than living in TERRAIN_LABEL_KEY.
 */
export const TERRAIN_DUE_LABEL_KEY = 'aplus.kg_terrain.due';

/**
 * Orthogonal due-⏰ check (ADR-204 P2, CHO-1950). True when the backend's
 * retention join flagged the edge's topic as due for review. Deliberately
 * INDEPENDENT of `terrainBand` (which reads `strength`): a concept can be any
 * colour AND due. A missing edge / absent flag reads as not due.
 */
export function isDue(edge?: Pick<GrowthEdgeRef, 'isDue'> | null): boolean {
  return !!edge?.isDue;
}

/**
 * Band an edge by shakiness. A missing edge (null / undefined) is `solid`
 * — no active weakness means mastered / fresh terrain. Strengths outside
 * [0,1] are clamped before banding.
 */
export function terrainBand(
  edge?: Pick<GrowthEdgeRef, 'strength'> | null,
): TerrainBand {
  if (!edge) return 'solid';
  const s = clamp01(edge.strength);
  if (s >= SHAKY_MIN) return 'shaky';
  if (s >= WOBBLY_MIN) return 'wobbly';
  return 'solid';
}

/** Convenience: the i18n key for an edge's band. */
export function terrainLabelKey(
  edge?: Pick<GrowthEdgeRef, 'strength'> | null,
): string {
  return TERRAIN_LABEL_KEY[terrainBand(edge)];
}

/**
 * Mastery percent (0–100) for the on-map aria text, mirroring the
 * Growth-Edges meter (mastery = 1 − strength). A missing edge reads as
 * fully mastered (100).
 */
export function terrainMasteryPercent(
  edge?: Pick<GrowthEdgeRef, 'strength'> | null,
): number {
  return edge ? masteryPercent(edge.strength) : 100;
}

/**
 * Deterministic next-best-edge ranker (ADR-204 §6, Slice C-base). Returns
 * the index of the single shakiest (highest-strength) VISIBLE edge — the
 * "start here" highlight. Honest v1: it ranks only what is on screen, with
 * no LLM and no off-screen/global ranker. Entries without an edge are
 * skipped; ties resolve to the earliest index (stable). Returns -1 when
 * nothing on screen carries an edge (⇒ no highlight).
 */
export function nextBestIndex(
  edges: readonly (Pick<GrowthEdgeRef, 'strength'> | null | undefined)[],
): number {
  let bestIndex = -1;
  let bestStrength = -Infinity;
  edges.forEach((edge, i) => {
    if (!edge) return;
    const s = clamp01(edge.strength);
    if (s > bestStrength) {
      bestStrength = s;
      bestIndex = i;
    }
  });
  return bestIndex;
}
