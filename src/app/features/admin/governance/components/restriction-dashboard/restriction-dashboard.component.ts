/**
 * RestrictionDashboardComponent — Restriction list with apply/lift workflow.
 *
 * Route: /admin/governance/restrictions
 *
 * Features:
 *   - Restriction list with tier and status filters
 *   - Apply new restriction (with confirm dialog)
 *   - Lift active restriction (with confirm dialog)
 *   - Tier and status badge coloring
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
import { GovernanceService } from '../../services/governance.service';
import type {
  Restriction,
  RestrictionTier,
  RestrictionStatus,
} from '../../models/governance.model';
import {
  ALL_RESTRICTION_TIERS,
  ALL_RESTRICTION_STATUSES,
  TIER_LABELS,
  STATUS_LABELS,
} from '../../models/governance.model';

@Component({
  selector: 'chora-restriction-dashboard',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './restriction-dashboard.component.html',
  styleUrl: './restriction-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RestrictionDashboardComponent implements OnInit, OnDestroy {
  private readonly governanceService = inject(GovernanceService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // --- State ---
  readonly loading = computed(() => this.governanceService.restrictionState().status === 'loading');
  readonly filterTier = signal<RestrictionTier | null>(null);
  readonly filterStatus = signal<RestrictionStatus | null>(null);

  // --- Constants ---
  readonly allTiers = ALL_RESTRICTION_TIERS;
  readonly allStatuses = ALL_RESTRICTION_STATUSES;
  readonly tierLabels = TIER_LABELS;
  readonly statusLabels = STATUS_LABELS;

  // --- Computed ---
  readonly filteredRestrictions = computed(() => {
    let result = this.governanceService.restrictions();
    const tier = this.filterTier();
    const status = this.filterStatus();

    if (tier) {
      result = result.filter((r) => r.tier === tier);
    }
    if (status) {
      result = result.filter((r) => r.status === status);
    }

    return result;
  });

  readonly isEmpty = computed(
    () => !this.loading() && this.filteredRestrictions().length === 0,
  );

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadRestrictions();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadRestrictions(): void {
    this.subscriptions.add(
      this.governanceService.loadRestrictions().subscribe({
        error: () => {
          this.toast.show('admin.governance.restrictions_load_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  onTierFilter(value: string): void {
    this.filterTier.set(value === '' ? null : value as RestrictionTier);
  }

  onStatusFilter(value: string): void {
    this.filterStatus.set(value === '' ? null : value as RestrictionStatus);
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async applyRestriction(): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'admin.governance.apply_restriction_title',
      message: 'admin.governance.apply_restriction_message',
      confirmText: 'admin.governance.apply',
      variant: 'danger',
    });

    if (!confirmed) return;

    // Placeholder — in real implementation, a form dialog would collect these values
    this.subscriptions.add(
      this.governanceService.applyRestriction({
        target_gcid: '',
        tier: 'warning',
        reason: '',
      }).subscribe({
        next: (result) => {
          if (result) {
            this.toast.show('admin.governance.restriction_applied', 'success');
          } else {
            this.toast.show('admin.governance.apply_restriction_error', 'error');
          }
        },
        error: () => {
          this.toast.show('admin.governance.apply_restriction_error', 'error');
        },
      }),
    );
  }

  async liftRestriction(restriction: Restriction): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'admin.governance.lift_restriction_title',
      message: 'admin.governance.lift_restriction_message',
      confirmText: 'admin.governance.lift',
      variant: 'info',
    });

    if (!confirmed) return;

    this.subscriptions.add(
      this.governanceService.liftRestriction(restriction.id).subscribe({
        next: () => {
          this.toast.show('admin.governance.restriction_lifted', 'success');
        },
        error: () => {
          this.toast.show('admin.governance.lift_restriction_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  tierClass(tier: string): string {
    return `restriction-dashboard__tier--${tier}`;
  }

  statusClass(status: string): string {
    return `restriction-dashboard__status--${status}`;
  }

  canLift(restriction: Restriction): boolean {
    return restriction.status === 'active';
  }

  formatDateTime(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }
}
