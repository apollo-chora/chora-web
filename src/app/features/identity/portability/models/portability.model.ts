/**
 * Identity Portability models — GCID merge, portable data, tenant migration.
 * Source of truth: chora-contracts/openapi/identity-admin.yaml
 *
 * BFF endpoints:
 *   POST /api/v1/gcid/merge
 *   GET  /api/v1/gcid/merge/{mergeId}
 *   POST /api/v1/gcid/merge/{mergeId}/confirm
 *   GET  /api/v1/gcid/data/summary
 *   POST /api/v1/gcid/migration
 *   GET  /api/v1/gcid/migration/{migrationId}
 *   POST /api/v1/gcid/migration/{migrationId}/confirm
 *   GET  /api/v1/tenants/memberships
 */

// ---------------------------------------------------------------------------
// GCID Merge (ADR-133)
// ---------------------------------------------------------------------------

export type GCIDMergeStatus =
  | 'initiated'
  | 'pending_confirmation'
  | 'previewing'
  | 'confirmed'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type MergeInitiatedBy = 'self_service' | 'admin';

export type MergeConflictType = 'role_conflict' | 'data_overlap' | 'active_session';
export type MergeConflictResolution = 'keep_target' | 'keep_source' | 'merge_both' | 'manual';

export interface MergeConflict {
  type: MergeConflictType;
  description: string;
  resolution: MergeConflictResolution;
}

export interface MergePreview {
  tenant_memberships: number;
  assessment_results: number;
  knowledge_graph_nodes: number;
  familiar_observations: number;
  digital_skins: number;
  conflicts: MergeConflict[];
}

export interface GCIDMerge {
  id: string;
  source_gcid: string;
  target_gcid: string;
  status: GCIDMergeStatus;
  initiated_by: MergeInitiatedBy;
  merge_preview?: MergePreview;
  initiated_at: string;
  confirmed_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface InitiateGCIDMergeRequest {
  target_email?: string;
  target_gcid?: string;
}

export interface ConfirmGCIDMergeRequest {
  confirmation_text: string;
  conflict_resolutions?: {
    conflict_index: number;
    chosen_resolution: MergeConflictResolution;
  }[];
}

// ---------------------------------------------------------------------------
// Portable Data (GDPR Art. 20)
// ---------------------------------------------------------------------------

export interface GCIDScopedData {
  knowledge_graph_nodes: number;
  familiar_observations: number;
  digital_skins: number;
  rag_persona_entries: number;
  consent_preferences: number;
}

export interface TenantScopedData {
  tenant_id: string;
  tenant_name: string;
  is_active: boolean;
  enrollment_count: number;
  assessment_count: number;
  authored_content_count: number;
  roles: string[];
}

export interface PortableDataSummary {
  gcid: string;
  gcid_scoped: GCIDScopedData;
  tenant_scoped: TenantScopedData[];
}

// ---------------------------------------------------------------------------
// Tenant Migration (CHO-1117)
// ---------------------------------------------------------------------------

export type MigrationType = 'departure' | 'transfer';

export type MigrationStatus =
  | 'initiated'
  | 'consent_pending'
  | 'transferring'
  | 'completed'
  | 'cancelled';

export type DataSelection =
  | 'enrollments'
  | 'assessments'
  | 'authored_content'
  | 'knowledge_graph'
  | 'familiar_data';

export const ALL_DATA_SELECTIONS: DataSelection[] = [
  'enrollments',
  'assessments',
  'authored_content',
  'knowledge_graph',
  'familiar_data',
];

export const DATA_SELECTION_LABELS: Record<DataSelection, string> = {
  enrollments: 'identity.portability.data_enrollments',
  assessments: 'identity.portability.data_assessments',
  authored_content: 'identity.portability.data_authored_content',
  knowledge_graph: 'identity.portability.data_knowledge_graph',
  familiar_data: 'identity.portability.data_familiar',
};

export interface TenantMigration {
  id: string;
  gcid: string;
  source_tenant_id: string;
  target_tenant_id: string | null;
  migration_type: MigrationType;
  data_selections: string[];
  status: MigrationStatus;
  consent_expires_at: string;
  initiated_at: string;
  completed_at: string | null;
}

export interface InitiateTenantMigrationRequest {
  source_tenant_id: string;
  target_tenant_id?: string;
  migration_type: MigrationType;
  data_selections?: DataSelection[];
}

export interface ConfirmTenantMigrationRequest {
  consent_granted: boolean;
  acknowledgement?: string;
}

// ---------------------------------------------------------------------------
// Tenant Membership (subset for portability UI)
// ---------------------------------------------------------------------------

export interface TenantMembership {
  id: string;
  gcid: string;
  tenant_id: string;
  roles: string[];
  joined_at: string;
}

export interface TenantMembershipListResponse {
  data: TenantMembership[];
  page_info: { has_next: boolean };
}

// ---------------------------------------------------------------------------
// Discriminated Union States
// ---------------------------------------------------------------------------

export type MergeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: GCIDMerge }
  | { status: 'error'; error: { code: string; message: string } };

export type PortableDataState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: PortableDataSummary }
  | { status: 'error'; error: { code: string; message: string } };

export type MigrationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: TenantMigration }
  | { status: 'error'; error: { code: string; message: string } };

export type MembershipsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: TenantMembership[] }
  | { status: 'error'; error: { code: string; message: string } };

export type MigrationListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: TenantMigration[] }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Data Export (GDPR Art. 20 — Per-Tenant Export)
// ---------------------------------------------------------------------------

export type ExportFormat = 'json' | 'csv';

export type ExportStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface DataExportRequest {
  scope: 'tenant_scoped';
  tenant_id: string;
  format: ExportFormat;
}

export interface DataExportResponse {
  export_id: string;
  status: ExportStatus;
  download_url: string | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export type ExportState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: DataExportResponse }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Admin-Assisted Merge Request (ADR-133 — non-self-service path)
// ---------------------------------------------------------------------------

export type AdminMergeRequestStatus =
  | 'submitted'
  | 'admin_review'
  | 'approved'
  | 'denied';

export interface AdminMergeRequest {
  id: string;
  requester_gcid: string;
  target_email: string;
  reason: string;
  evidence_urls: string[];
  status: AdminMergeRequestStatus;
  denial_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  resolved_at: string | null;
}

export interface AdminMergeRequestTimelineStep {
  key: AdminMergeRequestStatus;
  label: string;
  timestamp: string | null;
  completed: boolean;
  current: boolean;
  icon: string;
}

export type AdminMergeRequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: AdminMergeRequest }
  | { status: 'error'; error: { code: string; message: string } };
