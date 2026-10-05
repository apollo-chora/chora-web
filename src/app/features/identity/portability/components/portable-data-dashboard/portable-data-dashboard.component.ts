/**
 * PortableDataDashboardComponent — Split-panel GCID-scoped vs tenant-scoped data view.
 *
 * Route: /settings/identity/data
 *
 * Layout:
 *   Summary bar: GCID-scoped count vs tenant-scoped count
 *   Left panel:  GCID-scoped data (knowledge graph, Familiar, skins, persona, consent)
 *                Each item gets a "Follows You Everywhere" pill badge
 *   Right panel: Tenant-scoped tabbed view (per-tenant enrollments, grades, assessments)
 *                Each item gets a tenant name badge, per-tenant export button
 *   Stacked on tablet, side-by-side at 1280px.
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, timer, switchMap, takeWhile, tap } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { PortabilityService } from '../../services/portability.service';
import type {
  GCIDScopedData,
  TenantScopedData,
  ExportFormat,
  DataExportResponse,
} from '../../models/portability.model';

@Component({
  selector: 'chora-portable-data-dashboard',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './portable-data-dashboard.component.html',
  styleUrl: './portable-data-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortableDataDashboardComponent implements OnInit, OnDestroy {
  private readonly portabilityService = inject(PortabilityService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly dataState = this.portabilityService.portableDataState;
  readonly portableData = this.portabilityService.portableData;
  readonly selectedTenantId = signal<string | null>(null);

  // --- Export state ---
  readonly exportDialogOpen = signal(false);
  readonly exportFormat = signal<ExportFormat>('json');
  readonly exportState = this.portabilityService.exportState;
  readonly exportData = this.portabilityService.exportData;
  readonly exportingTenantId = signal<string | null>(null);

  // --- Computed ---
  readonly gcidScoped = computed<GCIDScopedData | null>(() => {
    return this.portableData()?.gcid_scoped ?? null;
  });

  readonly tenantScoped = computed<TenantScopedData[]>(() => {
    return this.portableData()?.tenant_scoped ?? [];
  });

  readonly activeTenants = computed(() => {
    return this.tenantScoped().filter((t) => t.is_active);
  });

  readonly historicalTenants = computed(() => {
    return this.tenantScoped().filter((t) => !t.is_active);
  });

  readonly selectedTenant = computed<TenantScopedData | null>(() => {
    const id = this.selectedTenantId();
    if (!id) return null;
    return this.tenantScoped().find((t) => t.tenant_id === id) ?? null;
  });

  readonly isLoading = computed(() => this.dataState().status === 'loading');
  readonly isEmpty = computed(
    () => this.dataState().status === 'success' && this.tenantScoped().length === 0,
  );

  // --- Summary bar counts ---
  readonly gcidScopedCount = computed(() => {
    const gcid = this.gcidScoped();
    if (!gcid) return 0;
    return gcid.knowledge_graph_nodes
      + gcid.familiar_observations
      + gcid.digital_skins
      + gcid.rag_persona_entries
      + gcid.consent_preferences;
  });

  readonly tenantScopedCount = computed(() => {
    return this.tenantScoped().reduce(
      (sum, t) => sum + t.enrollment_count + t.assessment_count + t.authored_content_count,
      0,
    );
  });

  readonly isExporting = computed(() => this.exportState().status === 'loading');
  readonly isExportComplete = computed(() => {
    const data = this.exportData();
    return data?.status === 'completed' && data.download_url !== null;
  });

  readonly exportingTenantName = computed(() => {
    const id = this.exportingTenantId();
    if (!id) return '';
    const tenant = this.tenantScoped().find((t) => t.tenant_id === id);
    return tenant?.tenant_name ?? '';
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.portabilityService.resetExportState();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadData(): void {
    this.subscriptions.add(
      this.portabilityService.loadPortableData().subscribe({
        next: (result) => {
          if (!result) {
            this.toast.show('identity.portability.data_load_error', 'error');
          } else if (result.tenant_scoped.length > 0) {
            this.selectedTenantId.set(result.tenant_scoped[0].tenant_id);
          }
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Tab selection
  // -------------------------------------------------------------------------

  selectTenant(tenantId: string): void {
    this.selectedTenantId.set(tenantId);
  }

  isSelectedTenant(tenantId: string): boolean {
    return this.selectedTenantId() === tenantId;
  }

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  openExportDialog(tenantId: string): void {
    this.exportingTenantId.set(tenantId);
    this.exportFormat.set('json');
    this.portabilityService.resetExportState();
    this.exportDialogOpen.set(true);
  }

  closeExportDialog(): void {
    this.exportDialogOpen.set(false);
    this.exportingTenantId.set(null);
    this.portabilityService.resetExportState();
  }

  onExportFormatChange(format: string): void {
    this.exportFormat.set(format as ExportFormat);
  }

  startExport(): void {
    const tenantId = this.exportingTenantId();
    if (!tenantId) return;

    this.subscriptions.add(
      this.portabilityService
        .exportTenantData(tenantId, this.exportFormat())
        .pipe(
          switchMap((result: DataExportResponse | null) => {
            if (!result) {
              this.toast.show('identity.portability.export_error', 'error');
              throw new Error('Export initiation failed');
            }
            // Poll for completion every 3 seconds, up to ~60 seconds
            return timer(0, 3000).pipe(
              switchMap(() => this.portabilityService.getExportStatus(result.export_id)),
              takeWhile(
                (status: DataExportResponse | null) =>
                  status !== null && status.status !== 'completed' && status.status !== 'failed',
                true,
              ),
              tap((status: DataExportResponse | null) => {
                if (status?.status === 'completed') {
                  this.toast.show('identity.portability.export_complete', 'success');
                } else if (status?.status === 'failed') {
                  this.toast.show('identity.portability.export_error', 'error');
                }
              }),
            );
          }),
        )
        .subscribe(),
    );
  }

  downloadExport(): void {
    const data = this.exportData();
    if (data?.download_url) {
      window.open(data.download_url, '_blank', 'noopener,noreferrer');
    }
  }
}
