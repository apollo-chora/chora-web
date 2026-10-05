/**
 * AppealQueueComponent — Appeal review queue with approve/deny workflow.
 *
 * Route: /admin/governance/appeals
 *
 * Features:
 *   - Appeal list with status filter
 *   - Approve appeal (with confirm dialog and reviewer notes)
 *   - Deny appeal (with confirm dialog and reviewer notes)
 *   - Status badge coloring
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
  Appeal,
  AppealStatus,
} from '../../models/governance.model';
import {
  ALL_APPEAL_STATUSES,
  APPEAL_STATUS_LABELS,
} from '../../models/governance.model';

@Component({
  selector: 'chora-appeal-queue',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './appeal-queue.component.html',
  styleUrl: './appeal-queue.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppealQueueComponent implements OnInit, OnDestroy {
  private readonly governanceService = inject(GovernanceService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // --- State ---
  readonly loading = computed(() => this.governanceService.appealState().status === 'loading');
  readonly filterStatus = signal<AppealStatus | null>(null);

  // --- Constants ---
  readonly allStatuses = ALL_APPEAL_STATUSES;
  readonly appealStatusLabels = APPEAL_STATUS_LABELS;

  // --- Computed ---
  readonly filteredAppeals = computed(() => {
    let result = this.governanceService.appeals();
    const status = this.filterStatus();

    if (status) {
      result = result.filter((a) => a.status === status);
    }

    return result;
  });

  readonly isEmpty = computed(
    () => !this.loading() && this.filteredAppeals().length === 0,
  );

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadAppeals();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadAppeals(): void {
    this.subscriptions.add(
      this.governanceService.loadAppeals().subscribe({
        error: () => {
          this.toast.show('admin.governance.appeals_load_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  onStatusFilter(value: string): void {
    this.filterStatus.set(value === '' ? null : value as AppealStatus);
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async approveAppeal(appeal: Appeal): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'admin.governance.approve_appeal_title',
      message: 'admin.governance.approve_appeal_message',
      confirmText: 'admin.governance.approve',
      variant: 'info',
    });

    if (!confirmed) return;

    this.subscriptions.add(
      this.governanceService.reviewAppeal(appeal.id, {
        status: 'approved',
        reviewer_notes: '',
      }).subscribe({
        next: (result) => {
          if (result) {
            this.toast.show('admin.governance.appeal_approved', 'success');
          } else {
            this.toast.show('admin.governance.approve_appeal_error', 'error');
          }
        },
        error: () => {
          this.toast.show('admin.governance.approve_appeal_error', 'error');
        },
      }),
    );
  }

  async denyAppeal(appeal: Appeal): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'admin.governance.deny_appeal_title',
      message: 'admin.governance.deny_appeal_message',
      confirmText: 'admin.governance.deny',
      variant: 'danger',
    });

    if (!confirmed) return;

    this.subscriptions.add(
      this.governanceService.reviewAppeal(appeal.id, {
        status: 'denied',
        reviewer_notes: '',
      }).subscribe({
        next: (result) => {
          if (result) {
            this.toast.show('admin.governance.appeal_denied', 'success');
          } else {
            this.toast.show('admin.governance.deny_appeal_error', 'error');
          }
        },
        error: () => {
          this.toast.show('admin.governance.deny_appeal_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  statusClass(status: string): string {
    return `appeal-queue__status--${status}`;
  }

  canReview(appeal: Appeal): boolean {
    return appeal.status === 'pending' || appeal.status === 'under_review';
  }

  formatDateTime(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }
}
