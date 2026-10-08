/**
 * PortabilityService — REST adapter for GCID merge, portable data, and migration.
 *
 * Source of truth: chora-contracts/openapi/identity-admin.yaml
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, of, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  GCIDMerge,
  InitiateGCIDMergeRequest,
  ConfirmGCIDMergeRequest,
  PortableDataSummary,
  TenantMigration,
  InitiateTenantMigrationRequest,
  ConfirmTenantMigrationRequest,
  TenantMembership,
  TenantMembershipListResponse,
  MergeState,
  PortableDataState,
  MigrationState,
  MembershipsState,
  MigrationListState,
  DataExportRequest,
  DataExportResponse,
  ExportState,
  AdminMergeRequest,
  AdminMergeRequestState,
} from '../models/portability.model';

const MERGE_PATH = '/api/v1/gcid/merge';
const PORTABLE_DATA_PATH = '/api/v1/gcid/data/summary';
const DATA_EXPORT_PATH = '/api/v1/gcid/data/export';
const MIGRATION_PATH = '/api/v1/gcid/migration';
const MEMBERSHIPS_PATH = '/api/v1/tenants/memberships';
const ADMIN_MERGE_REQUEST_PATH = '/api/v1/iam/gcid/merge/request';

@Injectable({ providedIn: 'root' })
export class PortabilityService {
  private readonly bff = inject(BffClientService);

  // --- State ---
  private readonly _mergeState = signal<MergeState>({ status: 'idle' });
  readonly mergeState = this._mergeState.asReadonly();

  private readonly _portableDataState = signal<PortableDataState>({ status: 'idle' });
  readonly portableDataState = this._portableDataState.asReadonly();

  private readonly _migrationState = signal<MigrationState>({ status: 'idle' });
  readonly migrationState = this._migrationState.asReadonly();

  private readonly _membershipsState = signal<MembershipsState>({ status: 'idle' });
  readonly membershipsState = this._membershipsState.asReadonly();

  private readonly _migrationListState = signal<MigrationListState>({ status: 'idle' });
  readonly migrationListState = this._migrationListState.asReadonly();

  private readonly _exportState = signal<ExportState>({ status: 'idle' });
  readonly exportState = this._exportState.asReadonly();

  private readonly _adminMergeRequestState = signal<AdminMergeRequestState>({ status: 'idle' });
  readonly adminMergeRequestState = this._adminMergeRequestState.asReadonly();

  // --- Computed ---
  readonly mergeData = computed(() => {
    const s = this._mergeState();
    return s.status === 'success' ? s.data : null;
  });

  readonly portableData = computed(() => {
    const s = this._portableDataState();
    return s.status === 'success' ? s.data : null;
  });

  readonly migrationData = computed(() => {
    const s = this._migrationState();
    return s.status === 'success' ? s.data : null;
  });

  readonly memberships = computed(() => {
    const s = this._membershipsState();
    return s.status === 'success' ? s.data : [];
  });

  readonly migrations = computed(() => {
    const s = this._migrationListState();
    return s.status === 'success' ? s.data : [];
  });

  readonly exportData = computed(() => {
    const s = this._exportState();
    return s.status === 'success' ? s.data : null;
  });

  readonly adminMergeRequest = computed(() => {
    const s = this._adminMergeRequestState();
    return s.status === 'success' ? s.data : null;
  });

  // -------------------------------------------------------------------------
  // GCID Merge
  // -------------------------------------------------------------------------

  initiateMerge(request: InitiateGCIDMergeRequest): Observable<GCIDMerge | null> {
    this._mergeState.set({ status: 'loading' });

    return this.bff.post<GCIDMerge>(MERGE_PATH, request).pipe(
      tap((data) => {
        this._mergeState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._mergeState.set({
          status: 'error',
          error: { code: 'MERGE_INITIATE_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  getMerge(mergeId: string): Observable<GCIDMerge | null> {
    this._mergeState.set({ status: 'loading' });

    return this.bff.get<GCIDMerge>(`${MERGE_PATH}/${encodeURIComponent(mergeId)}`).pipe(
      tap((data) => {
        this._mergeState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._mergeState.set({
          status: 'error',
          error: { code: 'MERGE_GET_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  confirmMerge(mergeId: string, request: ConfirmGCIDMergeRequest): Observable<GCIDMerge | null> {
    this._mergeState.set({ status: 'loading' });

    return this.bff.post<GCIDMerge>(
      `${MERGE_PATH}/${encodeURIComponent(mergeId)}/confirm`,
      request,
    ).pipe(
      tap((data) => {
        this._mergeState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._mergeState.set({
          status: 'error',
          error: { code: 'MERGE_CONFIRM_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  cancelMerge(mergeId: string): Observable<boolean> {
    return this.bff.delete<void>(`${MERGE_PATH}/${encodeURIComponent(mergeId)}`).pipe(
      tap(() => {
        this._mergeState.set({ status: 'idle' });
      }),
      map(() => true),
      catchError(() => of(false)),
    );
  }

  // -------------------------------------------------------------------------
  // Portable Data
  // -------------------------------------------------------------------------

  loadPortableData(): Observable<PortableDataSummary | null> {
    this._portableDataState.set({ status: 'loading' });

    return this.bff.get<PortableDataSummary>(PORTABLE_DATA_PATH).pipe(
      tap((data) => {
        this._portableDataState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._portableDataState.set({
          status: 'error',
          error: { code: 'PORTABLE_DATA_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Tenant Migration
  // -------------------------------------------------------------------------

  initiateMigration(request: InitiateTenantMigrationRequest): Observable<TenantMigration | null> {
    this._migrationState.set({ status: 'loading' });

    return this.bff.post<TenantMigration>(MIGRATION_PATH, request).pipe(
      tap((data) => {
        this._migrationState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._migrationState.set({
          status: 'error',
          error: { code: 'MIGRATION_INITIATE_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  getMigration(migrationId: string): Observable<TenantMigration | null> {
    this._migrationState.set({ status: 'loading' });

    return this.bff.get<TenantMigration>(
      `${MIGRATION_PATH}/${encodeURIComponent(migrationId)}`,
    ).pipe(
      tap((data) => {
        this._migrationState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._migrationState.set({
          status: 'error',
          error: { code: 'MIGRATION_GET_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  confirmMigration(
    migrationId: string,
    request: ConfirmTenantMigrationRequest,
  ): Observable<TenantMigration | null> {
    this._migrationState.set({ status: 'loading' });

    return this.bff.post<TenantMigration>(
      `${MIGRATION_PATH}/${encodeURIComponent(migrationId)}/confirm`,
      request,
    ).pipe(
      tap((data) => {
        this._migrationState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._migrationState.set({
          status: 'error',
          error: { code: 'MIGRATION_CONFIRM_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Tenant Memberships
  // -------------------------------------------------------------------------

  loadMemberships(): Observable<TenantMembership[] | null> {
    this._membershipsState.set({ status: 'loading' });

    return this.bff.get<TenantMembershipListResponse>(MEMBERSHIPS_PATH).pipe(
      tap((res) => {
        this._membershipsState.set({ status: 'success', data: res.data });
      }),
      map((res) => res.data),
      catchError((err: Error) => {
        this._membershipsState.set({
          status: 'error',
          error: { code: 'MEMBERSHIPS_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Data Export (GDPR Art. 20)
  // -------------------------------------------------------------------------

  exportTenantData(tenantId: string, format: string): Observable<DataExportResponse | null> {
    this._exportState.set({ status: 'loading' });

    const request: DataExportRequest = {
      scope: 'tenant_scoped',
      tenant_id: tenantId,
      format: format as DataExportRequest['format'],
    };

    return this.bff.post<DataExportResponse>(DATA_EXPORT_PATH, request).pipe(
      tap((data) => {
        this._exportState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._exportState.set({
          status: 'error',
          error: { code: 'EXPORT_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  getExportStatus(exportId: string): Observable<DataExportResponse | null> {
    return this.bff.get<DataExportResponse>(
      `${DATA_EXPORT_PATH}/${encodeURIComponent(exportId)}`,
    ).pipe(
      tap((data) => {
        this._exportState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._exportState.set({
          status: 'error',
          error: { code: 'EXPORT_STATUS_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  resetExportState(): void {
    this._exportState.set({ status: 'idle' });
  }

  // -------------------------------------------------------------------------
  // Admin-Assisted Merge Request
  // -------------------------------------------------------------------------

  submitAdminMergeRequest(formData: FormData): Observable<AdminMergeRequest | null> {
    this._adminMergeRequestState.set({ status: 'loading' });

    return this.bff.post<AdminMergeRequest>(ADMIN_MERGE_REQUEST_PATH, formData).pipe(
      tap((data) => {
        this._adminMergeRequestState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._adminMergeRequestState.set({
          status: 'error',
          error: { code: 'MERGE_REQUEST_SUBMIT_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  loadAdminMergeRequest(): Observable<AdminMergeRequest | null> {
    this._adminMergeRequestState.set({ status: 'loading' });

    return this.bff.get<AdminMergeRequest | null>(`${ADMIN_MERGE_REQUEST_PATH}/me`).pipe(
      tap((data) => {
        if (data) {
          this._adminMergeRequestState.set({ status: 'success', data });
        } else {
          this._adminMergeRequestState.set({ status: 'idle' });
        }
      }),
      catchError((err: Error) => {
        this._adminMergeRequestState.set({
          status: 'error',
          error: { code: 'MERGE_REQUEST_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  resetAdminMergeRequestState(): void {
    this._adminMergeRequestState.set({ status: 'idle' });
  }

  // -------------------------------------------------------------------------
  // State reset
  // -------------------------------------------------------------------------

  resetMergeState(): void {
    this._mergeState.set({ status: 'idle' });
  }

  resetMigrationState(): void {
    this._migrationState.set({ status: 'idle' });
  }

  resetAll(): void {
    this._mergeState.set({ status: 'idle' });
    this._portableDataState.set({ status: 'idle' });
    this._migrationState.set({ status: 'idle' });
    this._membershipsState.set({ status: 'idle' });
    this._migrationListState.set({ status: 'idle' });
    this._exportState.set({ status: 'idle' });
    this._adminMergeRequestState.set({ status: 'idle' });
  }
}
