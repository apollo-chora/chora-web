/**
 * Account lifecycle service — REST calls for account deletion, reactivation,
 * and data export (GDPR Art. 17 & Art. 20).
 * Source of truth: chora-contracts/openapi/identity-admin.yaml
 *
 * Admin CRUD uses REST (OpenAPI). All HTTP calls go through BffClientService.
 */
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type DataExportScope = 'gcid_scoped' | 'tenant_scoped' | 'full';
export type DataExportFormat = 'json' | 'csv';
export type DataExportStatus = 'pending' | 'processing' | 'ready' | 'expired' | 'failed';

export interface DataExportRequest {
  id: string;
  gcid: string;
  scope: DataExportScope;
  tenant_id: string | null;
  status: DataExportStatus;
  format: DataExportFormat;
  download_url: string | null;
  requested_at: string;
  ready_at: string | null;
  expires_at: string | null;
}

export interface CreateDataExportPayload {
  scope: DataExportScope;
  format: DataExportFormat;
  tenant_id?: string;
}

export interface AccountDeletionStatus {
  account_state: string;
  deleted_at: string | null;
  grace_period_ends_at: string | null;
}

export interface AccountImpactSummary {
  authored_atoms: number;
  active_enrollments: number;
  assessment_records: number;
  has_familiar: boolean;
}

// ---------------------------------------------------------------------------
// Tenant deletion types
// ---------------------------------------------------------------------------

export type TenantDeletionStatus =
  | 'pending_first_approval'
  | 'pending_second_approval'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'cancelled';

export interface TenantDeletionRequest {
  id: string;
  tenant_id: string;
  initiated_by: string;
  second_approver_gcid: string | null;
  status: TenantDeletionStatus;
  grace_period_ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InitiateTenantDeletionPayload {
  reason: string;
}

export interface NominateApproverPayload {
  approver_gcid: string;
}

export interface TenantAdmin {
  gcid: string;
  display_name: string;
  email: string;
  roles: string[];
}

export interface TenantDeletionAuditEntry {
  id: string;
  action: string;
  performed_by: string;
  performed_at: string;
  details: string;
}

// ---------------------------------------------------------------------------
// Tenant deletion impact & hierarchy types (Phase 48.3)
// ---------------------------------------------------------------------------

export interface TenantDeletionImpact {
  total_users: number;
  total_atoms: number;
  total_enrollments: number;
  total_assessments: number;
  total_media_assets: number;
  total_familiars: number;
  data_retention_days: number;
  cold_storage_policy: 'archive' | 'purge';
}

export interface ChildTenantSummary {
  tenant_id: string;
  tenant_name: string;
  user_count: number;
  atom_count: number;
}

export interface TenantHierarchy {
  is_parent: boolean;
  children: ChildTenantSummary[];
}

const GCID_PATH = '/api/v1/gcid';
const DATA_PATH = '/api/v1/gcid/data';
const TENANT_DELETION_PATH = '/api/v1/tenancy/tenants/current/deletion';

@Injectable({ providedIn: 'root' })
export class AccountLifecycleService {
  private readonly bff = inject(BffClientService);

  // -------------------------------------------------------------------------
  // Account impact summary
  // -------------------------------------------------------------------------

  /**
   * Get deletion impact summary for the authenticated user.
   * GET /api/v1/gcid/deletion-impact
   */
  getAccountImpactSummary(): Observable<AccountImpactSummary> {
    return this.bff.get<AccountImpactSummary>(`${GCID_PATH}/deletion-impact`);
  }

  // -------------------------------------------------------------------------
  // Account deletion (GDPR Art. 17)
  // -------------------------------------------------------------------------

  /**
   * Soft-delete the authenticated user's GCID.
   * DELETE /api/v1/gcid/{gcid}
   */
  deleteAccount(gcid: string): Observable<void> {
    return this.bff.delete<void>(
      `${GCID_PATH}/${encodeURIComponent(gcid)}`,
    );
  }

  /**
   * Reactivate a GCID that is in pending_deletion state (cancel deletion).
   * POST /api/v1/gcid/{gcid}/reactivate
   */
  cancelDeletion(gcid: string): Observable<void> {
    return this.bff.post<void>(
      `${GCID_PATH}/${encodeURIComponent(gcid)}/reactivate`,
      {},
    );
  }

  // -------------------------------------------------------------------------
  // Data export (GDPR Art. 20)
  // -------------------------------------------------------------------------

  /**
   * Request an asynchronous data export.
   * POST /api/v1/gcid/data/export
   */
  requestDataExport(payload: CreateDataExportPayload): Observable<DataExportRequest> {
    return this.bff.post<DataExportRequest>(`${DATA_PATH}/export`, payload);
  }

  /**
   * Get data export status and download URL.
   * GET /api/v1/gcid/data/export/{exportId}
   */
  getDataExport(exportId: string): Observable<DataExportRequest> {
    return this.bff.get<DataExportRequest>(
      `${DATA_PATH}/export/${encodeURIComponent(exportId)}`,
    );
  }

  // -------------------------------------------------------------------------
  // Tenant deletion (two-person approval)
  // -------------------------------------------------------------------------

  /**
   * Initiate tenant deletion (tenant_owner only).
   * POST /api/v1/tenancy/tenants/current/deletion
   */
  initiateTenantDeletion(payload: InitiateTenantDeletionPayload): Observable<TenantDeletionRequest> {
    return this.bff.post<TenantDeletionRequest>(TENANT_DELETION_PATH, payload);
  }

  /**
   * Get current tenant deletion request status.
   * GET /api/v1/tenancy/tenants/current/deletion
   */
  getTenantDeletionStatus(): Observable<TenantDeletionRequest | null> {
    return this.bff.get<TenantDeletionRequest | null>(TENANT_DELETION_PATH);
  }

  /**
   * Nominate a second approver for tenant deletion.
   * POST /api/v1/tenancy/tenants/current/deletion/approver
   */
  nominateApprover(payload: NominateApproverPayload): Observable<TenantDeletionRequest> {
    return this.bff.post<TenantDeletionRequest>(
      `${TENANT_DELETION_PATH}/approver`,
      payload,
    );
  }

  /**
   * Confirm tenant deletion (second approver).
   * POST /api/v1/tenancy/tenants/current/deletion/confirm
   */
  confirmTenantDeletion(): Observable<TenantDeletionRequest> {
    return this.bff.post<TenantDeletionRequest>(
      `${TENANT_DELETION_PATH}/confirm`,
      {},
    );
  }

  /**
   * Cancel tenant deletion request.
   * DELETE /api/v1/tenancy/tenants/current/deletion
   */
  cancelTenantDeletion(): Observable<void> {
    return this.bff.delete<void>(TENANT_DELETION_PATH);
  }

  /**
   * Request bulk tenant data export.
   * POST /api/v1/tenancy/tenants/current/deletion/export
   */
  requestTenantDataExport(format: DataExportFormat): Observable<DataExportRequest> {
    return this.bff.post<DataExportRequest>(
      `${TENANT_DELETION_PATH}/export`,
      { format },
    );
  }

  /**
   * List eligible admins for second approver role.
   * GET /api/v1/tenants/members?role=tenant_admin,tenant_owner
   */
  getEligibleApprovers(): Observable<{ data: TenantAdmin[] }> {
    return this.bff.get<{ data: TenantAdmin[] }>(
      '/api/v1/tenants/members?role=tenant_admin&role=tenant_owner',
    );
  }

  /**
   * Get tenant deletion audit trail.
   * GET /api/v1/tenancy/tenants/current/deletion/audit
   */
  getTenantDeletionAudit(): Observable<{ items: TenantDeletionAuditEntry[] }> {
    return this.bff.get<{ items: TenantDeletionAuditEntry[] }>(
      `${TENANT_DELETION_PATH}/audit`,
    );
  }

  // -------------------------------------------------------------------------
  // Phase 48.3: Impact summary & tenant hierarchy
  // -------------------------------------------------------------------------

  /**
   * Get deletion impact summary showing what will be deleted.
   * GET /api/v1/tenancy/tenants/current/deletion/impact
   */
  getTenantDeletionImpact(): Observable<TenantDeletionImpact> {
    return this.bff.get<TenantDeletionImpact>(
      `${TENANT_DELETION_PATH}/impact`,
    );
  }

  /**
   * Get tenant franchise hierarchy (children if parent).
   * GET /api/v1/tenancy/tenants/current/hierarchy
   */
  getTenantHierarchy(): Observable<TenantHierarchy> {
    return this.bff.get<TenantHierarchy>(
      '/api/v1/tenancy/tenants/current/hierarchy',
    );
  }
}
