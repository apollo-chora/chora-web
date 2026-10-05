/**
 * MigrationFlowComponent — Tenant departure, arrival, and data transfer.
 *
 * Route: /settings/identity/migration
 *
 * Features:
 *   - Departure: leave tenant, set left_at, grey out in switcher
 *   - Arrival: select target tenant, choose portable data, confirm transfer
 *   - Status timeline showing migration progress
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
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { PortabilityService } from '../../services/portability.service';
import type {
  TenantMembership,
  DataSelection,
  MigrationStatus,
} from '../../models/portability.model';
import {
  ALL_DATA_SELECTIONS,
  DATA_SELECTION_LABELS,
} from '../../models/portability.model';

type MigrationMode = 'select' | 'departure' | 'transfer';

const STATUS_ORDER: MigrationStatus[] = [
  'initiated',
  'consent_pending',
  'transferring',
  'completed',
];

const STATUS_LABELS: Record<MigrationStatus, string> = {
  initiated: 'identity.portability.status_initiated',
  consent_pending: 'identity.portability.status_consent_pending',
  transferring: 'identity.portability.status_transferring',
  completed: 'identity.portability.status_completed',
  cancelled: 'identity.portability.status_cancelled',
};

@Component({
  selector: 'chora-migration-flow',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './migration-flow.component.html',
  styleUrl: './migration-flow.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MigrationFlowComponent implements OnInit, OnDestroy {
  private readonly portabilityService = inject(PortabilityService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // --- State ---
  readonly mode = signal<MigrationMode>('select');
  readonly sourceTenantId = signal<string | null>(null);
  readonly targetTenantId = signal<string | null>(null);
  readonly selectedData = signal<Set<DataSelection>>(new Set());
  readonly submitting = signal(false);

  // --- Service state ---
  readonly membershipsState = this.portabilityService.membershipsState;
  readonly memberships = this.portabilityService.memberships;
  readonly migrationState = this.portabilityService.migrationState;
  readonly migrationData = this.portabilityService.migrationData;

  // --- Constants ---
  readonly allDataSelections = ALL_DATA_SELECTIONS;
  readonly dataSelectionLabels = DATA_SELECTION_LABELS;
  readonly statusOrder = STATUS_ORDER;
  readonly statusLabels = STATUS_LABELS;

  // --- Computed ---
  readonly sourceTenant = computed<TenantMembership | null>(() => {
    const id = this.sourceTenantId();
    if (!id) return null;
    return this.memberships().find((m) => m.tenant_id === id) ?? null;
  });

  readonly availableTargets = computed(() => {
    const sourceId = this.sourceTenantId();
    return this.memberships().filter((m) => m.tenant_id !== sourceId);
  });

  readonly canInitiateDeparture = computed(() => {
    return this.sourceTenantId() !== null && !this.submitting();
  });

  readonly canInitiateTransfer = computed(() => {
    return (
      this.sourceTenantId() !== null &&
      this.targetTenantId() !== null &&
      this.selectedData().size > 0 &&
      !this.submitting()
    );
  });

  readonly hasMigration = computed(() => this.migrationData() !== null);

  readonly isLoading = computed(() => this.membershipsState().status === 'loading');

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadMemberships();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.portabilityService.resetMigrationState();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadMemberships(): void {
    this.subscriptions.add(
      this.portabilityService.loadMemberships().subscribe({
        next: (result) => {
          if (!result) {
            this.toast.show('identity.portability.memberships_load_error', 'error');
          }
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Mode selection
  // -------------------------------------------------------------------------

  selectDeparture(tenantId: string): void {
    this.sourceTenantId.set(tenantId);
    this.mode.set('departure');
  }

  selectTransfer(tenantId: string): void {
    this.sourceTenantId.set(tenantId);
    this.mode.set('transfer');
  }

  backToSelect(): void {
    this.mode.set('select');
    this.sourceTenantId.set(null);
    this.targetTenantId.set(null);
    this.selectedData.set(new Set());
    this.portabilityService.resetMigrationState();
  }

  // -------------------------------------------------------------------------
  // Data selection
  // -------------------------------------------------------------------------

  toggleDataSelection(selection: DataSelection): void {
    const current = new Set(this.selectedData());
    if (current.has(selection)) {
      current.delete(selection);
    } else {
      current.add(selection);
    }
    this.selectedData.set(current);
  }

  isDataSelected(selection: DataSelection): boolean {
    return this.selectedData().has(selection);
  }

  // -------------------------------------------------------------------------
  // Departure
  // -------------------------------------------------------------------------

  async onInitiateDeparture(): Promise<void> {
    const sourceId = this.sourceTenantId();
    if (!sourceId) return;

    const confirmed = await this.confirmDialog.confirm({
      title: 'identity.portability.departure_confirm_title',
      message: 'identity.portability.departure_confirm_message',
      confirmText: 'identity.portability.departure_confirm_button',
      variant: 'danger',
    });

    if (!confirmed) return;

    this.submitting.set(true);

    this.subscriptions.add(
      this.portabilityService.initiateMigration({
        source_tenant_id: sourceId,
        migration_type: 'departure',
      }).subscribe({
        next: (result) => {
          this.submitting.set(false);
          if (result) {
            this.toast.show('identity.portability.departure_initiated', 'success');
          } else {
            this.toast.show('identity.portability.departure_error', 'error');
          }
        },
        error: () => {
          this.submitting.set(false);
          this.toast.show('identity.portability.departure_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Transfer
  // -------------------------------------------------------------------------

  async onInitiateTransfer(): Promise<void> {
    const sourceId = this.sourceTenantId();
    const targetId = this.targetTenantId();
    if (!sourceId || !targetId) return;

    const confirmed = await this.confirmDialog.confirm({
      title: 'identity.portability.transfer_confirm_title',
      message: 'identity.portability.transfer_confirm_message',
      confirmText: 'identity.portability.transfer_confirm_button',
      variant: 'danger',
    });

    if (!confirmed) return;

    this.submitting.set(true);

    const dataSelections = Array.from(this.selectedData());

    this.subscriptions.add(
      this.portabilityService.initiateMigration({
        source_tenant_id: sourceId,
        target_tenant_id: targetId,
        migration_type: 'transfer',
        data_selections: dataSelections,
      }).subscribe({
        next: (result) => {
          this.submitting.set(false);
          if (result) {
            this.toast.show('identity.portability.transfer_initiated', 'success');
          } else {
            this.toast.show('identity.portability.transfer_error', 'error');
          }
        },
        error: () => {
          this.submitting.set(false);
          this.toast.show('identity.portability.transfer_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Confirm migration (consent)
  // -------------------------------------------------------------------------

  async onConfirmMigration(): Promise<void> {
    const migration = this.migrationData();
    if (!migration) return;

    const confirmed = await this.confirmDialog.confirm({
      title: 'identity.portability.consent_confirm_title',
      message: 'identity.portability.consent_confirm_message',
      confirmText: 'identity.portability.consent_confirm_button',
      variant: 'info',
    });

    if (!confirmed) return;

    this.submitting.set(true);

    this.subscriptions.add(
      this.portabilityService.confirmMigration(migration.id, {
        consent_granted: true,
      }).subscribe({
        next: (result) => {
          this.submitting.set(false);
          if (result) {
            this.toast.show('identity.portability.migration_confirmed', 'success');
          } else {
            this.toast.show('identity.portability.migration_confirm_error', 'error');
          }
        },
        error: () => {
          this.submitting.set(false);
          this.toast.show('identity.portability.migration_confirm_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Timeline helpers
  // -------------------------------------------------------------------------

  isStatusReached(status: MigrationStatus): boolean {
    const migration = this.migrationData();
    if (!migration) return false;
    const currentIdx = STATUS_ORDER.indexOf(migration.status);
    const targetIdx = STATUS_ORDER.indexOf(status);
    return targetIdx <= currentIdx;
  }

  isCurrentStatus(status: MigrationStatus): boolean {
    return this.migrationData()?.status === status;
  }

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return isoString;
    }
  }
}
