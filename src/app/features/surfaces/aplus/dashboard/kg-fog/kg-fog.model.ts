/**
 * KG-fog client-side models — front-end shapes mirror the chora-gateway
 * contract documented in
 *   docs/m13/kg-fog-aplus-integration-backend-handoff-2026-05-13.md §1-§2
 *
 * Per ADR-143: per-user Knowledge Graph (NOT per-tenant shared), owned
 * by chora-consumption. Each user has N disconnected `MapCluster`
 * aggregates capped at `tenant_entitlements.config_overrides.max_concurrent_kg_clusters_per_user`
 * (default 3).
 */

export type HexagonPosition = 'N' | 'NE' | 'SE' | 'S' | 'SW' | 'NW';

export type NeighborRelation =
  | 'prerequisite_of'
  | 'extends'
  | 'analogy_of'
  | 'contrasts_with'
  | 'applied_in'
  | 'curiosity_jump';

export type NeighborConfidence = 'low' | 'med' | 'high';

/**
 * The W5 weakness overlay (ADR-204 §5, ADR-196). Painted onto fog neighbors,
 * the focal, and cluster cards by chora-consumption's `kg_growth_overlay`.
 * Cross-service contract — **camelCase**, `omitempty` when the learner has no
 * active edge on the concept. `strength` ∈ [0,1] where 1 = shakiest.
 */
export interface GrowthEdgeRef {
  readonly edgeId: string;
  readonly conceptKey: string;
  readonly strength: number;
  /**
   * Orthogonal due-⏰ terrain (ADR-204 P2, CHO-1950): true when the edge's
   * resolved topic has decayed below the review threshold. Independent of
   * `strength` — a concept can be weak AND due, or solid AND due. Absent ⇒ not
   * due (the backend omits it unless the topic resolved and is due).
   */
  readonly isDue?: boolean;
  /**
   * Topic retention at read time (0..1), present only when the edge resolves to
   * a scored topic. Powers the "X% retained" accessible label; absent ⇒ no
   * retention data (unresolved topic).
   */
  readonly retentionScore?: number;
}

export interface HexagonNeighbor {
  readonly atomId: string;
  readonly title: string;
  readonly topic: string;
  readonly position: HexagonPosition;
  readonly relation: NeighborRelation;
  readonly confidence: NeighborConfidence;
  readonly previewSnippet?: string;
  readonly generatedByModelId?: string;
  /** Weakness terrain for this neighbor's concept (omitted when no edge). */
  readonly growthEdge?: GrowthEdgeRef;
}

export interface MapClusterSummary {
  readonly clusterId: string;
  readonly seedTopic: string;
  readonly currentFocalAtomId: string;
  readonly currentFocalTitle: string;
  readonly currentFocalTopic: string;
  readonly neighborCount: number;
  readonly trailDepth: number;
  readonly lastVisitedAt: string;
  readonly createdAt: string;
  readonly isStale: boolean;
  readonly junctionPending: boolean;
  /** Weakness terrain for this cluster's focal concept (omitted when no edge). */
  readonly growthEdge?: GrowthEdgeRef;
  /**
   * The cluster's live exploration id (cross-stream contract, anchor-ux).
   * When present, "open" routes to
   * `.../clusters/:clusterId/explorations/:activeExplorationId`; when absent
   * (omitempty) callers fall back to the cluster's manage screen via
   * `clusterOpenLink()` — never a 404 nor a fabricated `<clusterId>-current` id.
   */
  readonly activeExplorationId?: string;
}

export interface ClusterListResponse {
  readonly clusters: readonly MapClusterSummary[];
  readonly capRemaining: number;
  readonly capMax: number;
}

export interface ClusterCreateRequest {
  readonly seedTopic: string;
}

export interface ClusterCreateResponse {
  readonly clusterId: string;
  readonly explorationId: string;
  readonly seedAtomId: string;
  readonly focalAtomId: string;
  readonly neighbors: readonly HexagonNeighbor[];
  readonly generatedAt: string;
  readonly totalCostMicros: number;
}

/** Failure modes the FE renders distinctly. */
export type ClusterCreateError =
  | { readonly kind: 'cap_reached'; readonly capMax: number }
  | { readonly kind: 'insufficient_mana'; readonly required: number }
  | { readonly kind: 'invalid_seed'; readonly reason: string }
  | { readonly kind: 'fog_insufficient_catalogue' }
  | { readonly kind: 'service_unavailable' }
  | { readonly kind: 'unknown'; readonly message: string };

/** Backend code that signals "no atoms to fan a fog out of" (ADR-204 §F). */
const FOG_INSUFFICIENT_CATALOGUE = 'FOG_INSUFFICIENT_CATALOGUE';

/**
 * Pull a `code`/`message` blob out of an HttpErrorResponse-shaped error so we
 * can sniff backend error codes. Handles the BFF envelope (`{error:{code,
 * message}}`), a flat `{code,message}`, and a plain-string body.
 */
function errorBodyText(err: unknown): string {
  if (!err || typeof err !== 'object') return '';
  const body = (err as { error?: unknown }).error;
  if (typeof body === 'string') return body;
  if (!body || typeof body !== 'object') return '';
  const flat = body as { code?: unknown; message?: unknown; error?: unknown };
  const parts: string[] = [];
  if (typeof flat.code === 'string') parts.push(flat.code);
  if (typeof flat.message === 'string') parts.push(flat.message);
  if (flat.error && typeof flat.error === 'object') {
    const nested = flat.error as { code?: unknown; message?: unknown };
    if (typeof nested.code === 'string') parts.push(nested.code);
    if (typeof nested.message === 'string') parts.push(nested.message);
  }
  return parts.join(' ');
}

/** True when the error body carries the FOG_INSUFFICIENT_CATALOGUE code. */
export function fogErrorIsInsufficientCatalogue(err: unknown): boolean {
  return errorBodyText(err).toUpperCase().includes(FOG_INSUFFICIENT_CATALOGUE);
}

/**
 * Map a cluster-create / seed HTTP failure to a discriminated FE error so the
 * template can render the right inline message + remediation. Shared by the
 * dashboard panel and the canvas shell (was duplicated in both). A 502 whose
 * body carries FOG_INSUFFICIENT_CATALOGUE becomes its own remediable kind;
 * any other 502 (and 503) degrades to `service_unavailable`.
 */
export function mapClusterCreateError(
  err: unknown,
  capMax: number,
): ClusterCreateError {
  const status =
    err && typeof err === 'object' && 'status' in err
      ? (err as { status: number }).status
      : 0;
  if (status === 402) return { kind: 'insufficient_mana', required: 100 };
  if (status === 409) return { kind: 'cap_reached', capMax };
  if (status === 422) return { kind: 'invalid_seed', reason: 'invalid' };
  if (status === 502) {
    return fogErrorIsInsufficientCatalogue(err)
      ? { kind: 'fog_insufficient_catalogue' }
      : { kind: 'service_unavailable' };
  }
  if (status === 503) return { kind: 'service_unavailable' };
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message)
      : 'Unknown error';
  return { kind: 'unknown', message };
}

// =====================================================================
// Canvas screens (USR-A-KG-2, USR-A-KG-6) — extended models for the
// focused-canvas FE prebuild (chora-gateway endpoints §1.3-§1.7).
// =====================================================================

export interface TrailEntry {
  readonly atomId: string;
  readonly title: string;
  readonly topic: string;
  readonly explorationId: string;
}

export interface HexagonLayout {
  readonly clusterId: string;
  readonly explorationId: string;
  readonly focalAtomId: string;
  readonly focalTitle: string;
  readonly focalTopic: string;
  /** First 2 lines of focal-atom content. */
  readonly focalPreview?: string;
  /** Weakness terrain for the focal concept (omitted when no active edge). */
  readonly focalGrowthEdge?: GrowthEdgeRef;
  readonly neighbors: readonly HexagonNeighbor[];
  readonly trail: readonly TrailEntry[];
  readonly generatedAt: string;
  readonly invalidatedAt?: string;
  readonly isCacheFresh: boolean;
  readonly generatedByModelId?: string;
  /** Set when the server detected this fog regen creates a junction. */
  readonly junctionCandidate?: JunctionCandidate;
  /** Mana spent for this regen (display as IMDA D2 disclosure). */
  readonly totalCostMicros: number;
}

export interface JunctionCandidate {
  readonly junctionId: string;
  readonly otherClusterId: string;
  readonly otherClusterSeedTopic: string;
  readonly viaAtomId: string;
  readonly viaAtomTitle: string;
}

export interface FocalMoveRequest {
  readonly targetAtomId: string;
}

export interface JunctionDecideRequest {
  readonly decision: 'accept' | 'decline';
}

export interface ClusterManagementSummary {
  readonly clusterId: string;
  readonly seedTopic: string;
  readonly displayName: string;
  readonly currentFocalAtomId: string;
  readonly currentFocalTitle: string;
  readonly trailDepth: number;
  readonly createdAt: string;
  readonly lastVisitedAt: string;
  readonly totalCostMicros: number;
  readonly isStale: boolean;
  /**
   * Live exploration id (anchor-ux) — drives the "jump to canvas" link via
   * `clusterOpenLink()`; falls back to the manage screen when absent.
   */
  readonly activeExplorationId?: string;
}

export interface ClusterRenameRequest {
  readonly displayName: string;
}

export interface TenantKgConfig {
  readonly maxConcurrentKgClustersPerUser: number;
  readonly kgFogInvalidationGraceSeconds: number;
  /** Updated-at + updated-by (audit trail surfaced on the form). */
  readonly updatedAt: string;
  readonly updatedByDisplayName?: string;
}

/** Subscription event envelopes (chora-realtime push). */
export interface JunctionDetectedEvent {
  readonly type: 'junction_detected';
  readonly junction: JunctionCandidate;
  readonly explorationId: string;
}

export interface HexagonRegeneratedEvent {
  readonly type: 'hexagon_regenerated';
  readonly explorationId: string;
  readonly layout: HexagonLayout;
}

export type KgRealtimeEvent =
  | JunctionDetectedEvent
  | HexagonRegeneratedEvent;

/**
 * Router commands for opening a cluster's live exploration (anchor-ux).
 *
 * Routes to the active hexagon canvas when `activeExplorationId` is present,
 * else falls back to the cluster's manage screen. NEVER returns a bare
 * `/clusters/:clusterId` (no such route → 404) nor a fabricated
 * `<clusterId>-current` exploration id. Shared by the dashboard KG panel, the
 * canvas-shell grid, and the cluster-management jump link.
 */
export function clusterOpenLink(cluster: {
  readonly clusterId: string;
  readonly activeExplorationId?: string;
}): string[] {
  return cluster.activeExplorationId
    ? [
        '/a/map/clusters',
        cluster.clusterId,
        'explorations',
        cluster.activeExplorationId,
      ]
    : ['/a/map/clusters', cluster.clusterId, 'manage'];
}
