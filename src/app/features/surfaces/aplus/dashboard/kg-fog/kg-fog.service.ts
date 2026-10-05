/**
 * KgFogService — chora-gateway client for KG-fog endpoints.
 *
 * Wired through `BffClientService` per chora-web/CLAUDE.md §3. Wave-1
 * scope: just §1.1 listClusters + §1.2 createCluster (dashboard panel).
 * §1.3-§1.7 (hexagon GET, focal-move, archive, junction decide,
 * subscriptions) land when the canvas screens get built.
 *
 * Until the BFF endpoint lands, requests will fail with net::ERR or
 * 404. The dashboard panel renders the empty state on any error so the
 * UX degrades to "no active explorations" — not a hard break.
 *
 * Reference: docs/m13/kg-fog-aplus-integration-backend-handoff-2026-05-13.md
 * (sent to chaos session 2026-05-13).
 */
import { Injectable, inject } from '@angular/core';
import { Observable, Subject, map } from 'rxjs';

import { BffClientService } from '../../../../../core/services/bff-client.service';
import type {
  ClusterCreateRequest,
  ClusterCreateResponse,
  ClusterListResponse,
  ClusterManagementSummary,
  ClusterRenameRequest,
  FocalMoveRequest,
  HexagonLayout,
  JunctionDecideRequest,
  KgRealtimeEvent,
  TenantKgConfig,
} from './kg-fog.model';

interface BffEnvelope<T> {
  readonly data?: T;
  readonly error?: { readonly code: string; readonly message: string };
}

/**
 * Pre-§7-step-3 chora-gateway POST /api/v1/me/knowledge-graph/clusters
 * response shape (snake_case, no envelope). Adapter normalises this to
 * the §1.2 contract. See backend handoff brief for the eventual shape.
 */
interface LegacyClusterCreateBody {
  cluster?: {
    cluster_id?: string;
    seed_topic?: string;
    seed_atom_id?: string;
    created_at?: string;
  };
  initial_exploration?: {
    exploration_id?: string;
    focal_atom_id?: string;
    generated_at?: string;
    total_cost_micros?: number;
  };
}

const EMPTY_LIST: ClusterListResponse = {
  clusters: [],
  capRemaining: 3,
  capMax: 3,
};

/**
 * Envelope unwrap helper — throws if `env.data` is undefined so the
 * Observable emits a real error rather than synthesising fake data.
 * Preserves the BFF-provided error message when present.
 */
function unwrap<T>(env: BffEnvelope<T>, fallbackMessage: string): T {
  if (env.data === undefined) {
    throw new Error(env.error?.message ?? fallbackMessage);
  }
  return env.data;
}

@Injectable({ providedIn: 'root' })
export class KgFogService {
  private readonly bff = inject(BffClientService);

  /**
   * §1.1 list active clusters. Fail-loud — errors propagate to the
   * subscriber so the dashboard panel renders an honest error state
   * (BFF unreachable / 4xx / 5xx). `env.data ?? EMPTY_LIST` is the
   * legitimate envelope fallback for a no-clusters-seeded response.
   */
  listClusters(): Observable<ClusterListResponse> {
    return this.bff
      .get<BffEnvelope<ClusterListResponse>>('/api/v1/me/knowledge-graph/clusters')
      .pipe(map((env) => env.data ?? EMPTY_LIST));
  }

  /**
   * §1.2 create new cluster. Returns the first hex layout on success.
   * Errors propagate so the panel can map them to ClusterCreateError.
   */
  createCluster(request: ClusterCreateRequest): Observable<ClusterCreateResponse> {
    return this.bff
      .post<BffEnvelope<ClusterCreateResponse> | LegacyClusterCreateBody>(
        '/api/v1/me/knowledge-graph/clusters',
        request,
      )
      .pipe(
        map((raw) => {
          // Modern envelope path.
          const env = raw as BffEnvelope<ClusterCreateResponse>;
          if (env && env.data) return env.data;
          // BACKWARDS-COMPAT shim: between 2026-05-13 and §7 step 3
          // landing, chora-gateway returns the legacy snake_case body
          // `{ cluster, initial_exploration }` (no envelope, no
          // neighbors until fog-orchestrator MVP). We normalize here so
          // the FE template + panel stay stable. Drops out when the
          // BFF response is upgraded — the camelCase envelope path
          // takes precedence above.
          const legacy = raw as LegacyClusterCreateBody;
          if (legacy && (legacy.cluster || legacy.initial_exploration)) {
            const clusterId = legacy.cluster?.cluster_id ?? '';
            const explorationId =
              legacy.initial_exploration?.exploration_id ?? '';
            const focalAtomId =
              legacy.initial_exploration?.focal_atom_id ??
              legacy.cluster?.seed_atom_id ??
              '';
            return {
              clusterId,
              explorationId,
              seedAtomId: legacy.cluster?.seed_atom_id ?? focalAtomId,
              focalAtomId,
              neighbors: [],
              generatedAt:
                legacy.initial_exploration?.generated_at ??
                new Date().toISOString(),
              totalCostMicros:
                legacy.initial_exploration?.total_cost_micros ?? 0,
            };
          }
          throw new Error(
            env?.error?.message ?? 'KG fog: unrecognised create response shape',
          );
        }),
      );
  }

  // ===================================================================
  // CANVAS endpoints (§1.3-§1.7) — mock-backed v1 with a clean adapter
  // seam to flip to the real BFF.
  // The handoff brief at docs/m13/kg-fog-aplus-integration-backend-handoff-2026-05-13.md
  // documents the real wire format. FE templates / components don't
  // need to change when the chaos session lands the endpoints.
  // ===================================================================

  /**
   * §1.3 get current hex layout for an exploration. Fail-loud —
   * subscriber sees the real BFF error if the endpoint isn't live.
   * Backend ask: E2E-BE-KG-1 (hexagon layout GET).
   */
  getHexagonLayout(
    clusterId: string,
    explorationId: string,
  ): Observable<HexagonLayout> {
    return this.bff
      .get<BffEnvelope<HexagonLayout>>(
        `/api/v1/me/knowledge-graph/clusters/${encodeURIComponent(clusterId)}/explorations/${encodeURIComponent(explorationId)}/hexagon`,
      )
      .pipe(map((env) => unwrap(env, 'kg-fog: getHexagonLayout missing data')));
  }

  /**
   * §1.4 move focal (click-to-graduate). Server returns the new
   * layout (cache-hit or fog-regen). Backend ask: E2E-BE-KG-2.
   */
  moveFocal(
    clusterId: string,
    explorationId: string,
    request: FocalMoveRequest,
  ): Observable<HexagonLayout> {
    return this.bff
      .post<BffEnvelope<HexagonLayout>>(
        `/api/v1/me/knowledge-graph/clusters/${encodeURIComponent(clusterId)}/explorations/${encodeURIComponent(explorationId)}/focal:move`,
        request,
      )
      .pipe(map((env) => unwrap(env, 'kg-fog: moveFocal missing data')));
  }

  /** §1.5 archive cluster (soft-delete). Errors propagate. */
  archiveCluster(clusterId: string): Observable<void> {
    return this.bff.post<void>(
      `/api/v1/me/knowledge-graph/clusters/${encodeURIComponent(clusterId)}/archive`,
      {},
    );
  }

  /**
   * §1.6 accept / decline a junction. Returns null when the server
   * has no follow-up layout to send (data field genuinely absent —
   * legitimate envelope state, NOT a fallback).
   */
  decideJunction(
    junctionId: string,
    request: JunctionDecideRequest,
  ): Observable<HexagonLayout | null> {
    return this.bff
      .post<BffEnvelope<HexagonLayout>>(
        `/api/v1/me/knowledge-graph/junctions/${encodeURIComponent(junctionId)}/decide`,
        request,
      )
      .pipe(map((env) => env.data ?? null));
  }

  /** List management summaries for the user's clusters. Fail-loud. */
  listManagement(): Observable<readonly ClusterManagementSummary[]> {
    return this.bff
      .get<BffEnvelope<readonly ClusterManagementSummary[]>>(
        '/api/v1/me/knowledge-graph/clusters/management',
      )
      .pipe(map((env) => unwrap(env, 'kg-fog: listManagement missing data')));
  }

  /** Rename a cluster's display name. Errors propagate. */
  renameCluster(clusterId: string, request: ClusterRenameRequest): Observable<void> {
    return this.bff.patch<void>(
      `/api/v1/me/knowledge-graph/clusters/${encodeURIComponent(clusterId)}`,
      request,
    );
  }

  /** Get H+ tenant KG config. Fail-loud. */
  getTenantConfig(tenantId: string): Observable<TenantKgConfig> {
    return this.bff
      .get<BffEnvelope<TenantKgConfig>>(
        `/api/v1/tenants/${encodeURIComponent(tenantId)}/knowledge-graph/config`,
      )
      .pipe(map((env) => unwrap(env, 'kg-fog: getTenantConfig missing data')));
  }

  /** Update H+ tenant KG config. Fail-loud. */
  updateTenantConfig(
    tenantId: string,
    config: Partial<TenantKgConfig>,
  ): Observable<TenantKgConfig> {
    return this.bff
      .patch<BffEnvelope<TenantKgConfig>>(
        `/api/v1/tenants/${encodeURIComponent(tenantId)}/knowledge-graph/config`,
        config,
      )
      .pipe(map((env) => unwrap(env, 'kg-fog: updateTenantConfig missing data')));
  }

  /**
   * §1.7 real-time event stream (junction_detected + hexagon_regenerated).
   * Mock: returns an empty Subject for v1. Real implementation will
   * subscribe to a WebSocket / SSE at chora-realtime.
   */
  private readonly realtimeStream$ = new Subject<KgRealtimeEvent>();

  observeRealtime(): Observable<KgRealtimeEvent> {
    return this.realtimeStream$.asObservable();
  }

  /**
   * Test / demo seam — push a synthetic realtime event into the stream.
   * Used by component specs and the developer console (when wired).
   */
  emitRealtime(event: KgRealtimeEvent): void {
    this.realtimeStream$.next(event);
  }

}
