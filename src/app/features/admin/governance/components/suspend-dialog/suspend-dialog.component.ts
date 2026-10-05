/**
 * SuspendDialogComponent — Admin dialog for suspending a user account.
 *
 * Modal dialog with reason selection, duration picker, email notification toggle,
 * optional admin notes, and a confirmation step before executing the suspension.
 *
 * Usage:
 *   <chora-suspend-dialog
 *     [visible]="showDialog()"
 *     [targetGcid]="selectedUser().gcid"
 *     [targetDisplayName]="selectedUser().displayName"
 *     (suspended)="onSuspended($event)"
 *     (closed)="onDialogClosed()" />
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  signal,
  computed,
  effect,
  viewChild,
  ElementRef,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { GovernanceService } from '../../services/governance.service';

// ---------------------------------------------------------------------------
// Component-specific types
// ---------------------------------------------------------------------------

export type SuspensionReason =
  | 'policy_violation'
  | 'suspicious_activity'
  | 'payment_fraud'
  | 'harassment'
  | 'content_abuse'
  | 'other';

export type SuspensionDuration =
  | '7_days'
  | '30_days'
  | '90_days'
  | 'permanent';

export interface SuspendUserPayload {
  target_gcid: string;
  reason: SuspensionReason;
  duration: SuspensionDuration;
  notify_email: boolean;
  admin_notes: string;
}

export const ALL_SUSPENSION_REASONS: SuspensionReason[] = [
  'policy_violation',
  'suspicious_activity',
  'payment_fraud',
  'harassment',
  'content_abuse',
  'other',
];

export const SUSPENSION_REASON_LABELS: Record<SuspensionReason, string> = {
  policy_violation: 'admin.governance.suspend_reason_policy_violation',
  suspicious_activity: 'admin.governance.suspend_reason_suspicious_activity',
  payment_fraud: 'admin.governance.suspend_reason_payment_fraud',
  harassment: 'admin.governance.suspend_reason_harassment',
  content_abuse: 'admin.governance.suspend_reason_content_abuse',
  other: 'admin.governance.suspend_reason_other',
};

export const ALL_SUSPENSION_DURATIONS: SuspensionDuration[] = [
  '7_days',
  '30_days',
  '90_days',
  'permanent',
];

export const SUSPENSION_DURATION_LABELS: Record<SuspensionDuration, string> = {
  '7_days': 'admin.governance.suspend_duration_7_days',
  '30_days': 'admin.governance.suspend_duration_30_days',
  '90_days': 'admin.governance.suspend_duration_90_days',
  permanent: 'admin.governance.suspend_duration_permanent',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@Component({
  selector: 'chora-suspend-dialog',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './suspend-dialog.component.html',
  styleUrl: './suspend-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuspendDialogComponent implements OnDestroy {
  private readonly governanceService = inject(GovernanceService);
  private readonly toast = inject(ToastService);

  // --- Inputs ---
  readonly visible = input.required<boolean>();
  readonly targetGcid = input.required<string>();
  readonly targetDisplayName = input<string>('');

  // --- Outputs ---
  readonly suspended = output<SuspendUserPayload>();
  readonly closed = output<void>();

  // --- Internal state ---
  readonly selectedReason = signal<SuspensionReason | null>(null);
  readonly selectedDuration = signal<SuspensionDuration | null>(null);
  readonly notifyEmail = signal(true);
  readonly adminNotes = signal('');
  readonly step = signal<'form' | 'confirm'>('form');
  readonly submitting = signal(false);

  // --- Constants ---
  readonly allReasons = ALL_SUSPENSION_REASONS;
  readonly allDurations = ALL_SUSPENSION_DURATIONS;
  readonly reasonLabels = SUSPENSION_REASON_LABELS;
  readonly durationLabels = SUSPENSION_DURATION_LABELS;

  // --- View refs ---
  readonly dialogPanel = viewChild<ElementRef<HTMLElement>>('dialogPanel');

  // --- Computed ---
  readonly formValid = computed(() => {
    return this.selectedReason() !== null && this.selectedDuration() !== null;
  });

  private previouslyFocusedElement: Element | null = null;
  private subscriptions = new Subscription();

  constructor() {
    // Focus management when dialog opens
    effect(() => {
      if (this.visible()) {
        this.previouslyFocusedElement = document.activeElement;
        this.resetForm();
        queueMicrotask(() => {
          const panel = this.dialogPanel();
          if (panel) {
            panel.nativeElement.focus();
          }
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Form actions
  // -------------------------------------------------------------------------

  onReasonChange(value: string): void {
    this.selectedReason.set(value === '' ? null : value as SuspensionReason);
  }

  onDurationChange(value: string): void {
    this.selectedDuration.set(value === '' ? null : value as SuspensionDuration);
  }

  onNotifyEmailChange(checked: boolean): void {
    this.notifyEmail.set(checked);
  }

  onAdminNotesChange(value: string): void {
    this.adminNotes.set(value);
  }

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  goToConfirm(): void {
    if (!this.formValid()) return;
    this.step.set('confirm');
  }

  goBackToForm(): void {
    this.step.set('form');
  }

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  confirmSuspend(): void {
    const reason = this.selectedReason();
    const duration = this.selectedDuration();
    if (!reason || !duration) return;

    this.submitting.set(true);

    const payload: SuspendUserPayload = {
      target_gcid: this.targetGcid(),
      reason,
      duration,
      notify_email: this.notifyEmail(),
      admin_notes: this.adminNotes(),
    };

    this.subscriptions.add(
      this.governanceService.applyRestriction({
        target_gcid: payload.target_gcid,
        tier: 'suspended',
        reason: `${payload.reason}|${payload.duration}|notify:${payload.notify_email}|notes:${payload.admin_notes}`,
      }).subscribe({
        next: (result) => {
          this.submitting.set(false);
          if (result) {
            this.toast.show('admin.governance.suspend_success', 'success');
            this.suspended.emit(payload);
            this.closeDialog();
          } else {
            this.toast.show('admin.governance.suspend_error', 'error');
          }
        },
        error: () => {
          this.submitting.set(false);
          this.toast.show('admin.governance.suspend_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Dialog management
  // -------------------------------------------------------------------------

  closeDialog(): void {
    this.restoreFocus();
    this.closed.emit();
  }

  onBackdropClick(): void {
    if (!this.submitting()) {
      this.closeDialog();
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !this.submitting()) {
      event.preventDefault();
      this.closeDialog();
      return;
    }

    if (event.key === 'Tab') {
      this.trapFocus(event);
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private resetForm(): void {
    this.selectedReason.set(null);
    this.selectedDuration.set(null);
    this.notifyEmail.set(true);
    this.adminNotes.set('');
    this.step.set('form');
    this.submitting.set(false);
  }

  private trapFocus(event: KeyboardEvent): void {
    const panel = this.dialogPanel()?.nativeElement;
    if (!panel) return;

    const focusableElements = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );

    if (focusableElements.length === 0) return;

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === firstFocusable || document.activeElement === panel) {
        event.preventDefault();
        lastFocusable.focus();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    }
  }

  private restoreFocus(): void {
    if (this.previouslyFocusedElement instanceof HTMLElement) {
      this.previouslyFocusedElement.focus();
    }
    this.previouslyFocusedElement = null;
  }
}
