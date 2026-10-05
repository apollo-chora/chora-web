/**
 * MergeWizardComponent — 4-step GCID merge wizard.
 *
 * Route: /settings/identity
 *
 * Steps:
 *   1. Enter email/provider of the other GCID
 *   2. Authenticate with the other GCID (show authenticate button + confirmation)
 *   3. Preview merge impact (combined memberships, data summary)
 *   4. Type "MERGE" confirmation, submit
 */
import {
  Component,
  ChangeDetectionStrategy,
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
import type { MergePreview, MergeConflict } from '../../models/portability.model';

@Component({
  selector: 'chora-merge-wizard',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './merge-wizard.component.html',
  styleUrl: './merge-wizard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MergeWizardComponent implements OnDestroy {
  private readonly portabilityService = inject(PortabilityService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // --- Wizard state ---
  readonly currentStep = signal(1);
  readonly targetEmail = signal('');
  readonly authenticated = signal(false);
  readonly confirmationText = signal('');
  readonly submitting = signal(false);

  // --- Merge data ---
  readonly mergeState = this.portabilityService.mergeState;
  readonly mergeData = this.portabilityService.mergeData;

  // --- Computed ---
  readonly mergePreview = computed<MergePreview | null>(() => {
    const data = this.mergeData();
    return data?.merge_preview ?? null;
  });

  readonly conflicts = computed<MergeConflict[]>(() => {
    return this.mergePreview()?.conflicts ?? [];
  });

  readonly hasConflicts = computed(() => this.conflicts().length > 0);

  readonly canProceedStep1 = computed(() => {
    const email = this.targetEmail().trim();
    return email.length > 0 && email.includes('@');
  });

  readonly canProceedStep2 = computed(() => this.authenticated());

  readonly canSubmitMerge = computed(() => {
    return this.confirmationText().trim() === 'MERGE' && !this.submitting();
  });

  readonly stepLabels: string[] = [
    'identity.portability.merge_step_identify',
    'identity.portability.merge_step_authenticate',
    'identity.portability.merge_step_preview',
    'identity.portability.merge_step_confirm',
  ];

  private subscriptions = new Subscription();

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.portabilityService.resetMergeState();
  }

  // -------------------------------------------------------------------------
  // Step navigation
  // -------------------------------------------------------------------------

  goToStep(step: number): void {
    if (step >= 1 && step <= 4) {
      this.currentStep.set(step);
    }
  }

  // -------------------------------------------------------------------------
  // Step 1: Initiate merge
  // -------------------------------------------------------------------------

  onInitiateMerge(): void {
    const email = this.targetEmail().trim();
    if (!email) return;

    this.subscriptions.add(
      this.portabilityService.initiateMerge({ target_email: email }).subscribe({
        next: (result) => {
          if (result) {
            this.currentStep.set(2);
          } else {
            this.toast.show('identity.portability.merge_initiate_error', 'error');
          }
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Step 2: Authenticate
  // -------------------------------------------------------------------------

  onAuthenticate(): void {
    this.authenticated.set(true);
    this.currentStep.set(3);
  }

  // -------------------------------------------------------------------------
  // Step 3: Preview (already loaded from initiate)
  // -------------------------------------------------------------------------

  onProceedToConfirm(): void {
    this.currentStep.set(4);
  }

  // -------------------------------------------------------------------------
  // Step 4: Confirm merge
  // -------------------------------------------------------------------------

  async onConfirmMerge(): Promise<void> {
    const merge = this.mergeData();
    if (!merge || this.confirmationText().trim() !== 'MERGE') return;

    const confirmed = await this.confirmDialog.confirm({
      title: 'identity.portability.merge_final_confirm_title',
      message: 'identity.portability.merge_final_confirm_message',
      confirmText: 'identity.portability.merge_confirm_button',
      variant: 'danger',
    });

    if (!confirmed) return;

    this.submitting.set(true);

    this.subscriptions.add(
      this.portabilityService.confirmMerge(merge.id, {
        confirmation_text: 'MERGE',
      }).subscribe({
        next: (result) => {
          this.submitting.set(false);
          if (result) {
            this.toast.show('identity.portability.merge_confirmed', 'success');
          } else {
            this.toast.show('identity.portability.merge_confirm_error', 'error');
          }
        },
        error: () => {
          this.submitting.set(false);
          this.toast.show('identity.portability.merge_confirm_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Cancel
  // -------------------------------------------------------------------------

  async onCancelMerge(): Promise<void> {
    const merge = this.mergeData();
    if (!merge) {
      this.resetWizard();
      return;
    }

    const confirmed = await this.confirmDialog.confirm({
      title: 'identity.portability.merge_cancel_title',
      message: 'identity.portability.merge_cancel_message',
      confirmText: 'identity.portability.merge_cancel_confirm',
      variant: 'info',
    });

    if (!confirmed) return;

    this.subscriptions.add(
      this.portabilityService.cancelMerge(merge.id).subscribe({
        next: () => {
          this.resetWizard();
          this.toast.show('identity.portability.merge_cancelled', 'success');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  isStepCompleted(step: number): boolean {
    return step < this.currentStep();
  }

  isStepActive(step: number): boolean {
    return step === this.currentStep();
  }

  formatConflictType(type: string): string {
    return `identity.portability.conflict_${type}`;
  }

  formatResolution(resolution: string): string {
    return `identity.portability.resolution_${resolution}`;
  }

  private resetWizard(): void {
    this.currentStep.set(1);
    this.targetEmail.set('');
    this.authenticated.set(false);
    this.confirmationText.set('');
    this.submitting.set(false);
    this.portabilityService.resetMergeState();
  }
}
