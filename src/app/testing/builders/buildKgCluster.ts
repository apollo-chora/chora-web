import type {
  ClusterCreateResponse,
  GrowthEdgeRef,
  MapClusterSummary,
} from '../../features/surfaces/aplus/dashboard/kg-fog/kg-fog.model';

/**
 * Test data builders for the KG-fog wire shapes consumed by the A+ dashboard
 * map hero + the reusable seed form (ADR-204 §10).
 *
 * Per `chora-web/CLAUDE.md` §6 — never inline object literals in specs. The
 * defaults are a single healthy active cluster with a shaky growth-edge so a
 * spec only overrides the fields it asserts on.
 */

/** The W5 weakness overlay (ADR-204 §5). `strength` ∈ [0,1], 1 = shakiest. */
export function buildGrowthEdgeRef(
  overrides: Partial<GrowthEdgeRef> = {},
): GrowthEdgeRef {
  return {
    edgeId: '05000000-0000-7000-8000-0000000e0001',
    conceptKey: 'fractions',
    strength: 0.8,
    ...overrides,
  };
}

/** A single active `MapClusterSummary` (§1.1 listClusters item). */
export function buildClusterSummary(
  overrides: Partial<MapClusterSummary> = {},
): MapClusterSummary {
  return {
    clusterId: '05000000-0000-7000-8000-0000000c0001',
    seedTopic: 'fractions',
    currentFocalAtomId: '05000000-0000-7000-8000-0000000a0001',
    currentFocalTitle: 'Adding fractions',
    currentFocalTopic: 'Fractions',
    neighborCount: 6,
    trailDepth: 1,
    lastVisitedAt: '2026-06-28T08:00:00Z',
    createdAt: '2026-06-20T08:00:00Z',
    isStale: false,
    junctionPending: false,
    activeExplorationId: '05000000-0000-7000-8000-0000000d0001',
    ...overrides,
  };
}

/** A §1.2 createCluster success response (the new cluster's first hex). */
export function buildClusterCreateResponse(
  overrides: Partial<ClusterCreateResponse> = {},
): ClusterCreateResponse {
  return {
    clusterId: '05000000-0000-7000-8000-0000000c0009',
    explorationId: '05000000-0000-7000-8000-0000000d0009',
    seedAtomId: '05000000-0000-7000-8000-0000000a0009',
    focalAtomId: '05000000-0000-7000-8000-0000000a0009',
    neighbors: [],
    generatedAt: '2026-06-29T08:00:00Z',
    totalCostMicros: 0,
    ...overrides,
  };
}
