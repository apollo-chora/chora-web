import { expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { KgFogService } from './kg-fog.service';
import { environment } from '../../../../../../environments/environment';
import type {
  ClusterCreateResponse,
  ClusterListResponse,
  ClusterManagementSummary,
  HexagonLayout,
  KgRealtimeEvent,
  TenantKgConfig,
} from './kg-fog.model';

const BASE = environment.bffBaseUrl;

function makeLayout(overrides: Partial<HexagonLayout> = {}): HexagonLayout {
  return {
    clusterId: 'cl-1',
    explorationId: 'ex-1',
    focalAtomId: 'atom-1',
    focalTitle: 'Newton',
    focalTopic: 'physics',
    neighbors: [],
    trail: [],
    generatedAt: '2026-05-13T00:00:00Z',
    isCacheFresh: true,
    totalCostMicros: 0,
    ...overrides,
  };
}

describe('KgFogService', () => {
  let service: KgFogService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(KgFogService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -------------------------------------------------------------------
  // §1.1 listClusters
  // -------------------------------------------------------------------
  describe('listClusters', () => {
    it('GETs the clusters endpoint and unwraps env.data', async () => {
      const promise = firstValueFrom(service.listClusters());

      const req = httpMock.expectOne(
        `${BASE}/api/v1/me/knowledge-graph/clusters`,
      );
      expect(req.request.method).toBe('GET');

      const payload: ClusterListResponse = {
        clusters: [
          {
            clusterId: 'cl-1',
            seedTopic: 'physics',
            currentFocalAtomId: 'atom-1',
            currentFocalTitle: 'Newton',
            currentFocalTopic: 'physics',
            neighborCount: 6,
            trailDepth: 2,
            lastVisitedAt: '2026-05-13T00:00:00Z',
            createdAt: '2026-05-12T00:00:00Z',
            isStale: false,
            junctionPending: false,
          },
        ],
        capRemaining: 2,
        capMax: 3,
      };
      req.flush({ data: payload });

      const result = await promise;
      expect(result.clusters).toHaveLength(1);
      expect(result.capRemaining).toBe(2);
      expect(result.capMax).toBe(3);
    });

    it('falls back to EMPTY_LIST when envelope has no data', async () => {
      const promise = firstValueFrom(service.listClusters());

      httpMock
        .expectOne(`${BASE}/api/v1/me/knowledge-graph/clusters`)
        .flush({});

      const result = await promise;
      expect(result.clusters).toEqual([]);
      expect(result.capRemaining).toBe(3);
      expect(result.capMax).toBe(3);
    });

    it('propagates a 5xx error (fail-loud)', async () => {
      const promise = firstValueFrom(service.listClusters());

      httpMock
        .expectOne(`${BASE}/api/v1/me/knowledge-graph/clusters`)
        .flush('boom', { status: 503, statusText: 'Service Unavailable' });

      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  // -------------------------------------------------------------------
  // §1.2 createCluster
  // -------------------------------------------------------------------
  describe('createCluster', () => {
    it('POSTs the seed and returns the modern envelope data', async () => {
      const promise = firstValueFrom(
        service.createCluster({ seedTopic: 'thermodynamics' }),
      );

      const req = httpMock.expectOne(
        `${BASE}/api/v1/me/knowledge-graph/clusters`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ seedTopic: 'thermodynamics' });

      const data: ClusterCreateResponse = {
        clusterId: 'cl-9',
        explorationId: 'ex-9',
        seedAtomId: 'seed-9',
        focalAtomId: 'focal-9',
        neighbors: [],
        generatedAt: '2026-05-13T01:00:00Z',
        totalCostMicros: 1200,
      };
      req.flush({ data });

      const result = await promise;
      expect(result.clusterId).toBe('cl-9');
      expect(result.totalCostMicros).toBe(1200);
    });

    it('normalises the legacy snake_case body via the back-compat shim', async () => {
      const promise = firstValueFrom(
        service.createCluster({ seedTopic: 'optics' }),
      );

      httpMock
        .expectOne(`${BASE}/api/v1/me/knowledge-graph/clusters`)
        .flush({
          cluster: {
            cluster_id: 'legacy-cl',
            seed_topic: 'optics',
            seed_atom_id: 'legacy-seed',
            created_at: '2026-05-13T02:00:00Z',
          },
          initial_exploration: {
            exploration_id: 'legacy-ex',
            focal_atom_id: 'legacy-focal',
            generated_at: '2026-05-13T02:00:01Z',
            total_cost_micros: 999,
          },
        });

      const result = await promise;
      expect(result.clusterId).toBe('legacy-cl');
      expect(result.explorationId).toBe('legacy-ex');
      expect(result.focalAtomId).toBe('legacy-focal');
      expect(result.seedAtomId).toBe('legacy-seed');
      expect(result.neighbors).toEqual([]);
      expect(result.generatedAt).toBe('2026-05-13T02:00:01Z');
      expect(result.totalCostMicros).toBe(999);
    });

    it('legacy shim falls back to seed_atom_id for focal and synthesises generatedAt', async () => {
      const promise = firstValueFrom(
        service.createCluster({ seedTopic: 'waves' }),
      );

      httpMock
        .expectOne(`${BASE}/api/v1/me/knowledge-graph/clusters`)
        .flush({
          cluster: {
            cluster_id: 'cl-min',
            seed_atom_id: 'seed-only',
          },
        });

      const result = await promise;
      expect(result.clusterId).toBe('cl-min');
      expect(result.explorationId).toBe('');
      // focalAtomId falls through to cluster.seed_atom_id
      expect(result.focalAtomId).toBe('seed-only');
      expect(result.seedAtomId).toBe('seed-only');
      expect(result.totalCostMicros).toBe(0);
      // generatedAt synthesised to a valid ISO timestamp
      expect(() => new Date(result.generatedAt).toISOString()).not.toThrow();
      expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);
    });

    it('throws on an unrecognised response shape, preserving the BFF error message', async () => {
      const promise = firstValueFrom(
        service.createCluster({ seedTopic: 'nope' }),
      );

      httpMock
        .expectOne(`${BASE}/api/v1/me/knowledge-graph/clusters`)
        .flush({ error: { code: 'BAD', message: 'create blew up' } });

      await expect(promise).rejects.toThrow('create blew up');
    });

    it('throws the default message when shape is unrecognised and no error provided', async () => {
      const promise = firstValueFrom(
        service.createCluster({ seedTopic: 'nope' }),
      );

      httpMock
        .expectOne(`${BASE}/api/v1/me/knowledge-graph/clusters`)
        .flush({});

      await expect(promise).rejects.toThrow(
        'KG fog: unrecognised create response shape',
      );
    });

    it('propagates an HTTP 4xx error', async () => {
      const promise = firstValueFrom(
        service.createCluster({ seedTopic: 'cap' }),
      );

      httpMock
        .expectOne(`${BASE}/api/v1/me/knowledge-graph/clusters`)
        .flush('cap reached', { status: 429, statusText: 'Too Many Requests' });

      await expect(promise).rejects.toMatchObject({ status: 429 });
    });
  });

  // -------------------------------------------------------------------
  // §1.3 getHexagonLayout
  // -------------------------------------------------------------------
  describe('getHexagonLayout', () => {
    it('GETs the hexagon endpoint with url-encoded ids and unwraps data', async () => {
      const promise = firstValueFrom(
        service.getHexagonLayout('cl a/b', 'ex#1'),
      );

      const req = httpMock.expectOne(
        `${BASE}/api/v1/me/knowledge-graph/clusters/${encodeURIComponent('cl a/b')}/explorations/${encodeURIComponent('ex#1')}/hexagon`,
      );
      expect(req.request.method).toBe('GET');
      req.flush({ data: makeLayout({ clusterId: 'cl a/b' }) });

      const layout = await promise;
      expect(layout.clusterId).toBe('cl a/b');
      expect(layout.isCacheFresh).toBe(true);
    });

    it('throws the fail-loud message when data is absent', async () => {
      const promise = firstValueFrom(
        service.getHexagonLayout('cl-1', 'ex-1'),
      );

      httpMock
        .expectOne(
          `${BASE}/api/v1/me/knowledge-graph/clusters/cl-1/explorations/ex-1/hexagon`,
        )
        .flush({});

      await expect(promise).rejects.toThrow(
        'kg-fog: getHexagonLayout missing data',
      );
    });
  });

  // -------------------------------------------------------------------
  // §1.4 moveFocal
  // -------------------------------------------------------------------
  describe('moveFocal', () => {
    it('POSTs the focal:move endpoint and unwraps the new layout', async () => {
      const promise = firstValueFrom(
        service.moveFocal('cl-1', 'ex-1', { targetAtomId: 'atom-2' }),
      );

      const req = httpMock.expectOne(
        `${BASE}/api/v1/me/knowledge-graph/clusters/cl-1/explorations/ex-1/focal:move`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ targetAtomId: 'atom-2' });
      req.flush({ data: makeLayout({ focalAtomId: 'atom-2' }) });

      const layout = await promise;
      expect(layout.focalAtomId).toBe('atom-2');
    });

    it('throws the fail-loud message when data is absent', async () => {
      const promise = firstValueFrom(
        service.moveFocal('cl-1', 'ex-1', { targetAtomId: 'atom-2' }),
      );

      httpMock
        .expectOne(
          `${BASE}/api/v1/me/knowledge-graph/clusters/cl-1/explorations/ex-1/focal:move`,
        )
        .flush({});

      await expect(promise).rejects.toThrow('kg-fog: moveFocal missing data');
    });

    it('unwrap preserves the BFF-provided error message when present', async () => {
      const promise = firstValueFrom(
        service.moveFocal('cl-1', 'ex-1', { targetAtomId: 'atom-2' }),
      );

      httpMock
        .expectOne(
          `${BASE}/api/v1/me/knowledge-graph/clusters/cl-1/explorations/ex-1/focal:move`,
        )
        .flush({ error: { code: 'X', message: 'fog regen failed' } });

      await expect(promise).rejects.toThrow('fog regen failed');
    });
  });

  // -------------------------------------------------------------------
  // §1.5 archiveCluster
  // -------------------------------------------------------------------
  describe('archiveCluster', () => {
    it('POSTs the archive endpoint with an empty body', async () => {
      const promise = firstValueFrom(service.archiveCluster('cl-1'));

      const req = httpMock.expectOne(
        `${BASE}/api/v1/me/knowledge-graph/clusters/cl-1/archive`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(null);

      await expect(promise).resolves.toBeNull();
    });

    it('propagates an archive error', async () => {
      const promise = firstValueFrom(service.archiveCluster('cl-1'));

      httpMock
        .expectOne(`${BASE}/api/v1/me/knowledge-graph/clusters/cl-1/archive`)
        .flush('gone', { status: 404, statusText: 'Not Found' });

      await expect(promise).rejects.toMatchObject({ status: 404 });
    });
  });

  // -------------------------------------------------------------------
  // §1.6 decideJunction
  // -------------------------------------------------------------------
  describe('decideJunction', () => {
    it('POSTs the decide endpoint and returns the follow-up layout', async () => {
      const promise = firstValueFrom(
        service.decideJunction('j-1', { decision: 'accept' }),
      );

      const req = httpMock.expectOne(
        `${BASE}/api/v1/me/knowledge-graph/junctions/j-1/decide`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ decision: 'accept' });
      req.flush({ data: makeLayout() });

      const layout = await promise;
      expect(layout).not.toBeNull();
      expect(layout!.clusterId).toBe('cl-1');
    });

    it('returns null when the server sends no follow-up layout (data absent)', async () => {
      const promise = firstValueFrom(
        service.decideJunction('j-1', { decision: 'decline' }),
      );

      httpMock
        .expectOne(`${BASE}/api/v1/me/knowledge-graph/junctions/j-1/decide`)
        .flush({});

      const result = await promise;
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // listManagement
  // -------------------------------------------------------------------
  describe('listManagement', () => {
    it('GETs the management endpoint and unwraps the summaries', async () => {
      const promise = firstValueFrom(service.listManagement());

      const req = httpMock.expectOne(
        `${BASE}/api/v1/me/knowledge-graph/clusters/management`,
      );
      expect(req.request.method).toBe('GET');

      const summaries: ClusterManagementSummary[] = [
        {
          clusterId: 'cl-1',
          seedTopic: 'physics',
          displayName: 'My Physics Map',
          currentFocalAtomId: 'atom-1',
          currentFocalTitle: 'Newton',
          trailDepth: 3,
          createdAt: '2026-05-12T00:00:00Z',
          lastVisitedAt: '2026-05-13T00:00:00Z',
          totalCostMicros: 5000,
          isStale: false,
        },
      ];
      req.flush({ data: summaries });

      const result = await promise;
      expect(result).toHaveLength(1);
      expect(result[0]!.displayName).toBe('My Physics Map');
    });

    it('throws the fail-loud message when data is absent', async () => {
      const promise = firstValueFrom(service.listManagement());

      httpMock
        .expectOne(`${BASE}/api/v1/me/knowledge-graph/clusters/management`)
        .flush({});

      await expect(promise).rejects.toThrow(
        'kg-fog: listManagement missing data',
      );
    });
  });

  // -------------------------------------------------------------------
  // renameCluster
  // -------------------------------------------------------------------
  describe('renameCluster', () => {
    it('PATCHes the cluster endpoint with the new display name', async () => {
      const promise = firstValueFrom(
        service.renameCluster('cl-1', { displayName: 'Renamed' }),
      );

      const req = httpMock.expectOne(
        `${BASE}/api/v1/me/knowledge-graph/clusters/cl-1`,
      );
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ displayName: 'Renamed' });
      req.flush(null);

      await expect(promise).resolves.toBeNull();
    });

    it('url-encodes the cluster id', async () => {
      const promise = firstValueFrom(
        service.renameCluster('cl/weird id', { displayName: 'X' }),
      );

      const req = httpMock.expectOne(
        `${BASE}/api/v1/me/knowledge-graph/clusters/${encodeURIComponent('cl/weird id')}`,
      );
      req.flush(null);
      await promise;
      expect(req.request.method).toBe('PATCH');
    });
  });

  // -------------------------------------------------------------------
  // getTenantConfig / updateTenantConfig
  // -------------------------------------------------------------------
  describe('getTenantConfig', () => {
    it('GETs the tenant config endpoint and unwraps data', async () => {
      const promise = firstValueFrom(service.getTenantConfig('tenant-001'));

      const req = httpMock.expectOne(
        `${BASE}/api/v1/tenants/tenant-001/knowledge-graph/config`,
      );
      expect(req.request.method).toBe('GET');

      const cfg: TenantKgConfig = {
        maxConcurrentKgClustersPerUser: 5,
        kgFogInvalidationGraceSeconds: 30,
        updatedAt: '2026-05-13T00:00:00Z',
        updatedByDisplayName: 'Admin',
      };
      req.flush({ data: cfg });

      const result = await promise;
      expect(result.maxConcurrentKgClustersPerUser).toBe(5);
      expect(result.kgFogInvalidationGraceSeconds).toBe(30);
    });

    it('throws the fail-loud message when data is absent', async () => {
      const promise = firstValueFrom(service.getTenantConfig('tenant-001'));

      httpMock
        .expectOne(`${BASE}/api/v1/tenants/tenant-001/knowledge-graph/config`)
        .flush({});

      await expect(promise).rejects.toThrow(
        'kg-fog: getTenantConfig missing data',
      );
    });
  });

  describe('updateTenantConfig', () => {
    it('PATCHes the tenant config endpoint and unwraps data', async () => {
      const promise = firstValueFrom(
        service.updateTenantConfig('tenant-001', {
          maxConcurrentKgClustersPerUser: 4,
        }),
      );

      const req = httpMock.expectOne(
        `${BASE}/api/v1/tenants/tenant-001/knowledge-graph/config`,
      );
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ maxConcurrentKgClustersPerUser: 4 });

      req.flush({
        data: {
          maxConcurrentKgClustersPerUser: 4,
          kgFogInvalidationGraceSeconds: 30,
          updatedAt: '2026-05-13T03:00:00Z',
        },
      });

      const result = await promise;
      expect(result.maxConcurrentKgClustersPerUser).toBe(4);
    });

    it('throws the fail-loud message when data is absent', async () => {
      const promise = firstValueFrom(
        service.updateTenantConfig('tenant-001', {}),
      );

      httpMock
        .expectOne(`${BASE}/api/v1/tenants/tenant-001/knowledge-graph/config`)
        .flush({});

      await expect(promise).rejects.toThrow(
        'kg-fog: updateTenantConfig missing data',
      );
    });
  });

  // -------------------------------------------------------------------
  // §1.7 realtime stream (mock Subject seam — no HTTP)
  // -------------------------------------------------------------------
  describe('realtime stream', () => {
    it('emitRealtime pushes an event observed by observeRealtime subscribers', async () => {
      const received: KgRealtimeEvent[] = [];
      const sub = service.observeRealtime().subscribe((e) => received.push(e));

      const event: KgRealtimeEvent = {
        type: 'junction_detected',
        explorationId: 'ex-1',
        junction: {
          junctionId: 'j-1',
          otherClusterId: 'cl-2',
          otherClusterSeedTopic: 'chemistry',
          viaAtomId: 'atom-x',
          viaAtomTitle: 'Bonding',
        },
      };
      service.emitRealtime(event);

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(event);

      sub.unsubscribe();
    });

    it('does not replay events emitted before subscription (hot Subject)', () => {
      const before: KgRealtimeEvent = {
        type: 'hexagon_regenerated',
        explorationId: 'ex-1',
        layout: makeLayout(),
      };
      service.emitRealtime(before);

      const received: KgRealtimeEvent[] = [];
      const sub = service.observeRealtime().subscribe((e) => received.push(e));
      expect(received).toHaveLength(0);

      const after: KgRealtimeEvent = {
        type: 'hexagon_regenerated',
        explorationId: 'ex-2',
        layout: makeLayout({ explorationId: 'ex-2' }),
      };
      service.emitRealtime(after);
      expect(received).toEqual([after]);

      sub.unsubscribe();
    });
  });
});
