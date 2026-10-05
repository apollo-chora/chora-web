/**
 * InvestigationService — REST adapter for the ops investigation workspace.
 *
 * Source of truth: chora-contracts/openapi/gateway.yaml (health endpoint)
 * Incident management and Cloud Logging integration are placeholders
 * pending backend implementation.
 *
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  ServiceHealthStatus,
  ErrorLogEntry,
  Incident,
  IncidentStatus,
  EntitySearchResult,
  EntityType,
  ResolutionTimelineEntry,
} from '../models/investigation.model';

const HEALTH_PATH = '/health';

@Injectable({ providedIn: 'root' })
export class InvestigationService {
  private readonly bff = inject(BffClientService);

  // -------------------------------------------------------------------------
  // Service Health
  // -------------------------------------------------------------------------

  /**
   * Fetch gateway aggregate health.
   * GET /health
   */
  getGatewayHealth(): Observable<Record<string, unknown>> {
    return this.bff.get<Record<string, unknown>>(HEALTH_PATH);
  }

  /**
   * Aggregate service health from the gateway /health endpoint.
   * Returns mock data until the gateway exposes per-service health.
   */
  getServiceHealth(): Observable<ServiceHealthStatus[]> {
    // TODO: Replace with real gateway per-service health aggregation
    return of(MOCK_SERVICE_HEALTH);
  }

  // -------------------------------------------------------------------------
  // Error Logs
  // -------------------------------------------------------------------------

  /**
   * Fetch recent error log entries.
   * Placeholder for Cloud Logging API integration.
   */
  getRecentErrors(): Observable<ErrorLogEntry[]> {
    // TODO: Replace with real Cloud Logging API call via BFF
    return of(MOCK_ERROR_LOGS);
  }

  // -------------------------------------------------------------------------
  // Incidents
  // -------------------------------------------------------------------------

  /**
   * List active incidents.
   * Placeholder for incident management system integration.
   */
  getActiveIncidents(): Observable<Incident[]> {
    // TODO: Replace with real incident API
    // return this.bff.get<Incident[]>(INCIDENTS_PATH);
    return of(MOCK_INCIDENTS);
  }

  /**
   * Transition an incident to a new status.
   * POST /api/v1/admin/incidents/{id}/transition
   */
  transitionIncident(_id: string, _newStatus: IncidentStatus): Observable<void> {
    // TODO: Replace with real API call
    // return this.bff.post<void>(`${INCIDENTS_PATH}/${encodeURIComponent(id)}/transition`, { status: newStatus });
    return of(undefined);
  }

  /**
   * Get timeline entries for a specific incident.
   */
  getIncidentTimeline(_id: string): Observable<ResolutionTimelineEntry[]> {
    // TODO: Replace with real API call
    // return this.bff.get<ResolutionTimelineEntry[]>(`${INCIDENTS_PATH}/${encodeURIComponent(id)}/timeline`);
    return of(MOCK_TIMELINE);
  }

  // -------------------------------------------------------------------------
  // Entity Search
  // -------------------------------------------------------------------------

  /**
   * Search for entities by ID across services.
   * Placeholder for cross-service entity lookup.
   */
  searchEntity(entityType: EntityType, entityId: string): Observable<EntitySearchResult[]> {
    // TODO: Replace with real cross-service lookup via BFF
    // return this.bff.get<EntitySearchResult[]>(`/api/v1/admin/entities/search`, new HttpParams().set('type', entityType).set('id', entityId));
    return of([
      {
        entityType,
        entityId,
        label: `${entityType.toUpperCase()}: ${entityId}`,
        service: entityType === 'gcid' ? 'chora-iam' : entityType === 'atom' ? 'chora-atomic' : 'chora-tenancy',
      },
    ]);
  }
}

// ---------------------------------------------------------------------------
// Mock data (removed once real APIs are integrated)
// ---------------------------------------------------------------------------

const MOCK_SERVICE_HEALTH: ServiceHealthStatus[] = [
  { serviceName: 'chora-gateway', status: 'healthy', lastChecked: new Date().toISOString(), responseTimeMs: 12 },
  { serviceName: 'chora-iam', status: 'healthy', lastChecked: new Date().toISOString(), responseTimeMs: 18 },
  { serviceName: 'chora-atomic', status: 'healthy', lastChecked: new Date().toISOString(), responseTimeMs: 25 },
  { serviceName: 'chora-engagement', status: 'degraded', lastChecked: new Date().toISOString(), responseTimeMs: 450 },
  { serviceName: 'chora-tenancy', status: 'healthy', lastChecked: new Date().toISOString(), responseTimeMs: 15 },
  { serviceName: 'chora-cms', status: 'healthy', lastChecked: new Date().toISOString(), responseTimeMs: 22 },
  { serviceName: 'chora-media-processor', status: 'unhealthy', lastChecked: new Date().toISOString(), responseTimeMs: 0 },
  { serviceName: 'chora-training-admin', status: 'healthy', lastChecked: new Date().toISOString(), responseTimeMs: 30 },
  { serviceName: 'chora-gamification', status: 'healthy', lastChecked: new Date().toISOString(), responseTimeMs: 20 },
  { serviceName: 'chora-billing', status: 'healthy', lastChecked: new Date().toISOString(), responseTimeMs: 35 },
];

const MOCK_ERROR_LOGS: ErrorLogEntry[] = [
  {
    timestamp: new Date(Date.now() - 120000).toISOString(),
    service: 'chora-media-processor',
    level: 'error',
    message: 'Failed to connect to Cloud Storage bucket: context deadline exceeded',
    correlationId: 'corr-a1b2c3d4',
    tenantId: 'tenant-001',
  },
  {
    timestamp: new Date(Date.now() - 300000).toISOString(),
    service: 'chora-engagement',
    level: 'warn',
    message: 'Streak calculation query took 2.3s (threshold: 500ms)',
    correlationId: 'corr-e5f6g7h8',
  },
  {
    timestamp: new Date(Date.now() - 600000).toISOString(),
    service: 'chora-iam',
    level: 'error',
    message: 'OIDC token validation failed: invalid issuer claim',
    correlationId: 'corr-i9j0k1l2',
    tenantId: 'tenant-003',
  },
  {
    timestamp: new Date(Date.now() - 900000).toISOString(),
    service: 'chora-atomic',
    level: 'warn',
    message: 'pgvector similarity search fallback to sequential scan (index missing)',
    correlationId: 'corr-m3n4o5p6',
  },
  {
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    service: 'chora-media-processor',
    level: 'error',
    message: 'FFmpeg transcode failed: unsupported codec in uploaded file',
    correlationId: 'corr-q7r8s9t0',
    tenantId: 'tenant-002',
  },
];

const MOCK_INCIDENTS: Incident[] = [
  {
    id: 'inc-001',
    title: 'Media Processor: Cloud Storage connectivity failure',
    severity: 'high',
    status: 'investigating',
    affectedServices: ['chora-media-processor', 'chora-cms'],
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 600000).toISOString(),
    assignedTo: 'ops-team-alpha',
  },
  {
    id: 'inc-002',
    title: 'Engagement service: elevated query latency',
    severity: 'medium',
    status: 'acknowledged',
    affectedServices: ['chora-engagement'],
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
    assignedTo: 'ops-team-beta',
  },
  {
    id: 'inc-003',
    title: 'IAM: sporadic OIDC validation failures',
    severity: 'low',
    status: 'open',
    affectedServices: ['chora-iam'],
    createdAt: new Date(Date.now() - 14400000).toISOString(),
    updatedAt: new Date(Date.now() - 14400000).toISOString(),
  },
];

const MOCK_TIMELINE: ResolutionTimelineEntry[] = [
  {
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    action: 'Incident created',
    actor: 'system',
    note: 'Auto-detected via health check failure',
  },
  {
    timestamp: new Date(Date.now() - 3000000).toISOString(),
    action: 'Acknowledged',
    actor: 'ops-team-alpha',
  },
  {
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    action: 'Investigating',
    actor: 'ops-team-alpha',
    note: 'Cloud Storage IAM credentials expired: rotating service account key',
  },
];
