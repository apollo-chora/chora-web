/**
 * Investigation & incident models for the ops observability workspace.
 *
 * These interfaces model service health, error logs, and incident tracking
 * for the super_admin investigation dashboard.
 */

// ---------------------------------------------------------------------------
// Service Health
// ---------------------------------------------------------------------------

export type ServiceHealthState = 'healthy' | 'degraded' | 'unhealthy';

export interface ServiceHealthStatus {
  serviceName: string;
  status: ServiceHealthState;
  lastChecked: string;
  responseTimeMs: number;
}

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentStatus = 'open' | 'acknowledged' | 'investigating' | 'resolved';

export interface Incident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  affectedServices: string[];
  createdAt: string;
  updatedAt: string;
  assignedTo?: string;
}

// ---------------------------------------------------------------------------
// Error Logs
// ---------------------------------------------------------------------------

export type ErrorLogLevel = 'error' | 'warn';

export interface ErrorLogEntry {
  timestamp: string;
  service: string;
  level: ErrorLogLevel;
  message: string;
  correlationId: string;
  tenantId?: string;
}

// ---------------------------------------------------------------------------
// Entity Search
// ---------------------------------------------------------------------------

export type EntityType = 'gcid' | 'atom' | 'tenant';

export interface EntitySearchResult {
  entityType: EntityType;
  entityId: string;
  label: string;
  service: string;
}

// ---------------------------------------------------------------------------
// Resolution Timeline
// ---------------------------------------------------------------------------

export interface ResolutionTimelineEntry {
  timestamp: string;
  action: string;
  actor: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALL_INCIDENT_SEVERITIES: IncidentSeverity[] = [
  'critical',
  'high',
  'medium',
  'low',
];

export const ALL_INCIDENT_STATUSES: IncidentStatus[] = [
  'open',
  'acknowledged',
  'investigating',
  'resolved',
];

export const SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  critical: 'admin.investigation.severity_critical',
  high: 'admin.investigation.severity_high',
  medium: 'admin.investigation.severity_medium',
  low: 'admin.investigation.severity_low',
};

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  open: 'admin.investigation.status_open',
  acknowledged: 'admin.investigation.status_acknowledged',
  investigating: 'admin.investigation.status_investigating',
  resolved: 'admin.investigation.status_resolved',
};
