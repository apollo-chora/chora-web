/**
 * KycReviewComponent — KYC verification review with approve/reject workflow.
 *
 * Route: /admin/governance/kyc
 *
 * Features:
 *   - Card grid layout (2-col tablet, 3-col desktop)
 *   - Filter by KYC status
 *   - Approve/reject KYC verifications (with confirm dialog)
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
  KYCVerification,
  KYCStatus,
} from '../../models/governance.model';
import {
  ALL_KYC_STATUSES,
  KYC_STATUS_LABELS,
} from '../../models/governance.model';

@Component({
  selector: 'chora-kyc-review',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './kyc-review.component.html',
  styleUrl: './kyc-review.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KycReviewComponent implements OnInit, OnDestroy {
  private readonly governanceService = inject(GovernanceService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // --- State ---
  readonly loading = computed(() => this.governanceService.kycState().status === 'loading');
  readonly filterStatus = signal<KYCStatus | null>(null);

  // --- Constants ---
  readonly allStatuses = ALL_KYC_STATUSES;
  readonly kycStatusLabels = KYC_STATUS_LABELS;

  // --- Computed ---
  readonly filteredVerifications = computed(() => {
    let result = this.governanceService.kycVerifications();
    const status = this.filterStatus();

    if (status) {
      result = result.filter((v) => v.status === status);
    }

    return result;
  });

  readonly isEmpty = computed(
    () => !this.loading() && this.filteredVerifications().length === 0,
  );

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadVerifications();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadVerifications(): void {
    this.subscriptions.add(
      this.governanceService.loadKYCVerifications().subscribe({
        error: () => {
          this.toast.show('admin.governance.kyc_load_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  onStatusFilter(value: string): void {
    this.filterStatus.set(value === '' ? null : value as KYCStatus);
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async approveKYC(verification: KYCVerification): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'admin.governance.approve_kyc_title',
      message: 'admin.governance.approve_kyc_message',
      confirmText: 'admin.governance.approve',
      variant: 'info',
    });

    if (!confirmed) return;

    this.subscriptions.add(
      this.governanceService.reviewKYC(verification.id, { status: 'verified' }).subscribe({
        next: (result) => {
          if (result) {
            this.toast.show('admin.governance.kyc_approved', 'success');
          } else {
            this.toast.show('admin.governance.approve_kyc_error', 'error');
          }
        },
        error: () => {
          this.toast.show('admin.governance.approve_kyc_error', 'error');
        },
      }),
    );
  }

  async rejectKYC(verification: KYCVerification): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'admin.governance.reject_kyc_title',
      message: 'admin.governance.reject_kyc_message',
      confirmText: 'admin.governance.reject',
      variant: 'danger',
    });

    if (!confirmed) return;

    this.subscriptions.add(
      this.governanceService.reviewKYC(verification.id, { status: 'failed' }).subscribe({
        next: (result) => {
          if (result) {
            this.toast.show('admin.governance.kyc_rejected', 'success');
          } else {
            this.toast.show('admin.governance.reject_kyc_error', 'error');
          }
        },
        error: () => {
          this.toast.show('admin.governance.reject_kyc_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  statusClass(status: string): string {
    return `kyc-review__status--${status}`;
  }

  canReview(verification: KYCVerification): boolean {
    return verification.status === 'pending';
  }

  formatDateTime(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }
}
