/**
 * AccountDeletionComponent — Multi-step self-service account deletion flow.
 * GDPR Art. 17 "Right to Erasure" compliance.
 *
 * Route: /settings/account/delete
 *
 * Steps:
 *   1. Warning — explain consequences, grace period, impact summary
 *   2. Data export — format/scope selector, progress polling, skip option
 *   3. Confirmation — case-sensitive "DELETE" + checkbox, grace period explainer
 *   4. Submitted — 30-day countdown, cancel deletion option
 *
 * After successful deletion request the user is logged out.
 * A 30-day grace period allows cancellation via GracePeriodBannerComponent.
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnDestroy,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { switchMap, takeWhile } from 'rxjs/operators';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { AuthService } from '../../../../../core/auth/auth.service';
import {
  AccountLifecycleService,
  AccountImpactSummary,
  DataExportRequest,
  DataExportFormat,
  DataExportScope,
} from '../../services/account-lifecycle.service';

export type DeletionStep = 'warning' | 'export' | 'confirm' | 'submitted';

const DELETION_STEPS: DeletionStep[] = ['warning', 'export', 'confirm', 'submitted'];
const GRACE_PERIOD_DAYS = 30;
const DELETE_CONFIRMATION_TEXT = 'DELETE';
const EXPORT_POLL_INTERVAL_MS = 3000;

@Component({
  selector: 'chora-account-deletion',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './account-deletion.component.html',
  styleUrl: './account-deletion.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountDeletionComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly lifecycleService = inject(AccountLifecycleService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // --- Step state ---
  readonly currentStepIndex = signal(0);
  readonly currentStep = computed<DeletionStep>(
    () => DELETION_STEPS[this.currentStepIndex()] ?? 'warning',
  );
  readonly steps = DELETION_STEPS;
  readonly gracePeriodDays = GRACE_PERIOD_DAYS;

  // --- Impact summary (Step 1 enhancement) ---
  readonly impactSummary = signal<AccountImpactSummary | null>(null);
  readonly impactLoading = signal(false);

  // --- Confirmation form state ---
  readonly confirmText = signal('');
  readonly confirmChecked = signal(false);
  readonly isConfirmValid = computed(
    () =>
      this.confirmText() === DELETE_CONFIRMATION_TEXT &&
      this.confirmChecked(),
  );

  // --- Loading / export state ---
  readonly submitting = signal(false);
  readonly exportRequested = signal(false);
  readonly exportRequest = signal<DataExportRequest | null>(null);
  readonly exportFormat = signal<DataExportFormat>('json');
  readonly exportScope = signal<DataExportScope>('full');
  readonly exportPolling = signal(false);

  // --- Submitted step state (Step 4 enhancement) ---
  readonly deletionCancelled = signal(false);
  readonly cancelling = signal(false);
  readonly gracePeriodDaysRemaining = computed(() => {
    // In a real scenario this would come from the deletion response,
    // but for the initial submission it starts at GRACE_PERIOD_DAYS
    return GRACE_PERIOD_DAYS;
  });
  readonly gracePeriodEndDate = computed(() => {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + GRACE_PERIOD_DAYS);
    return endDate;
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadImpactSummary();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Impact summary (Step 1)
  // -------------------------------------------------------------------------

  loadImpactSummary(): void {
    this.impactLoading.set(true);
    this.subscriptions.add(
      this.lifecycleService.getAccountImpactSummary().subscribe({
        next: (summary) => {
          this.impactSummary.set(summary);
          this.impactLoading.set(false);
        },
        error: () => {
          this.impactLoading.set(false);
          // Non-critical — impact summary is informational
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  nextStep(): void {
    const idx = this.currentStepIndex();
    if (idx < DELETION_STEPS.length - 1) {
      this.currentStepIndex.set(idx + 1);
    }
  }

  previousStep(): void {
    const idx = this.currentStepIndex();
    if (idx > 0) {
      this.currentStepIndex.set(idx - 1);
    }
  }

  goToStep(step: DeletionStep): void {
    const idx = DELETION_STEPS.indexOf(step);
    if (idx >= 0) {
      this.currentStepIndex.set(idx);
    }
  }

  // -------------------------------------------------------------------------
  // Data export (Step 2)
  // -------------------------------------------------------------------------

  onExportFormatChange(format: string): void {
    if (format === 'json' || format === 'csv') {
      this.exportFormat.set(format);
    }
  }

  onExportScopeChange(scope: string): void {
    if (scope === 'gcid_scoped' || scope === 'tenant_scoped' || scope === 'full') {
      this.exportScope.set(scope);
    }
  }

  requestExport(): void {
    this.exportRequested.set(true);

    this.subscriptions.add(
      this.lifecycleService.requestDataExport({
        scope: this.exportScope(),
        format: this.exportFormat(),
      }).subscribe({
        next: (exportReq) => {
          this.exportRequest.set(exportReq);
          this.toast.show('account_deletion.export_requested', 'success');
          if (exportReq.status !== 'ready') {
            this.startExportPolling(exportReq.id);
          }
        },
        error: () => {
          this.toast.show('account_deletion.export_error', 'error');
          this.exportRequested.set(false);
        },
      }),
    );
  }

  private startExportPolling(exportId: string): void {
    this.exportPolling.set(true);
    this.subscriptions.add(
      timer(EXPORT_POLL_INTERVAL_MS, EXPORT_POLL_INTERVAL_MS).pipe(
        switchMap(() => this.lifecycleService.getDataExport(exportId)),
        takeWhile(
          (req) => req.status === 'pending' || req.status === 'processing',
          true,
        ),
      ).subscribe({
        next: (req) => {
          this.exportRequest.set(req);
          if (req.status === 'ready' || req.status === 'failed' || req.status === 'expired') {
            this.exportPolling.set(false);
            if (req.status === 'ready') {
              this.toast.show('account_deletion.export_ready', 'success');
            } else if (req.status === 'failed') {
              this.toast.show('account_deletion.export_failed', 'error');
            }
          }
        },
        error: () => {
          this.exportPolling.set(false);
        },
      }),
    );
  }

  skipExport(): void {
    this.nextStep();
  }

  // -------------------------------------------------------------------------
  // Confirmation form (Step 3)
  // -------------------------------------------------------------------------

  onConfirmTextChange(value: string): void {
    this.confirmText.set(value);
  }

  onConfirmCheckedChange(checked: boolean): void {
    this.confirmChecked.set(checked);
  }

  // -------------------------------------------------------------------------
  // Submit deletion
  // -------------------------------------------------------------------------

  async submitDeletion(): Promise<void> {
    if (!this.isConfirmValid()) return;

    const confirmed = await this.confirmDialog.confirm({
      title: 'account_deletion.final_confirm_title',
      message: 'account_deletion.final_confirm_message',
      confirmText: 'account_deletion.final_confirm_button',
      variant: 'danger',
    });

    if (!confirmed) return;

    const gcid = this.authService.gcid();
    if (!gcid) {
      this.toast.show('account_deletion.no_session', 'error');
      return;
    }

    this.submitting.set(true);

    this.subscriptions.add(
      this.lifecycleService.deleteAccount(gcid).subscribe({
        next: () => {
          this.submitting.set(false);
          this.goToStep('submitted');
        },
        error: () => {
          this.submitting.set(false);
          this.toast.show('account_deletion.submit_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Cancel deletion (Step 4 enhancement)
  // -------------------------------------------------------------------------

  async cancelDeletion(): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'account_deletion.cancel_confirm_title',
      message: 'account_deletion.cancel_confirm_message',
      confirmText: 'account_deletion.cancel_confirm_button',
      variant: 'warning',
    });

    if (!confirmed) return;

    const gcid = this.authService.gcid();
    if (!gcid) {
      this.toast.show('account_deletion.no_session', 'error');
      return;
    }

    this.cancelling.set(true);

    this.subscriptions.add(
      this.lifecycleService.cancelDeletion(gcid).subscribe({
        next: () => {
          this.cancelling.set(false);
          this.deletionCancelled.set(true);
          this.toast.show('account_deletion.deletion_cancelled', 'success');
        },
        error: () => {
          this.cancelling.set(false);
          this.toast.show('account_deletion.cancel_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Navigation helpers
  // -------------------------------------------------------------------------

  goBack(): void {
    this.router.navigate(['/settings']);
  }

  formatDate(date: Date): string {
    try {
      return date.toLocaleDateString();
    } catch {
      return '';
    }
  }
}
