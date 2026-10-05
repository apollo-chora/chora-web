/**
 * PartnerSuspensionComponent — partner suspension admin for platform_ops.
 *
 * Provides suspension form with reason validation, impact preview,
 * confirmation dialog, status management, and suspension history log.
 *
 * @see docs/design/ux_a2a_protocol.md (Partner suspension flow)
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  input,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { A2AService } from '../../services/a2a.service';
import {
  PartnerStatus,
  PartnerSuspension,
  PARTNER_STATUS_LABELS,
} from '../../models/a2a.model';

const MIN_REASON_LENGTH = 50;

@Component({
  selector: 'chora-partner-suspension',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './partner-suspension.component.html',
  styleUrl: './partner-suspension.component.scss',
})
export class PartnerSuspensionComponent implements OnInit, OnDestroy {
  private readonly a2aService = inject(A2AService);
  private subscriptions = new Subscription();

  // ---------------------------------------------------------------------------
  // Inputs
  // ---------------------------------------------------------------------------

  readonly partnerId = input.required<string>();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** Suspension reason text */
  readonly reason = signal('');

  /** Effective immediately checkbox */
  readonly effectiveImmediately = signal(true);

  /** Confirmation dialog */
  readonly showConfirmDialog = signal(false);

  /** Label maps */
  readonly statusLabels = PARTNER_STATUS_LABELS;

  /** Min reason length constant */
  readonly minReasonLength = MIN_REASON_LENGTH;

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  readonly partner = this.a2aService.partnerDetail;
  readonly partnerDetailState = this.a2aService.partnerDetailState;
  readonly isSubmitting = this.a2aService.isSubmitting;

  readonly suspensionImpact = computed(() => {
    const s = this.a2aService.suspensionImpactState();
    return s.status === 'success' ? s.data : null;
  });

  readonly suspensionHistory = computed(() => {
    const s = this.a2aService.suspensionHistoryState();
    return s.status === 'success' ? s.data : [];
  });

  readonly isSuspended = computed(() => {
    const p = this.partner();
    return p?.status === PartnerStatus.Suspended;
  });

  readonly isVerified = computed(() => {
    const p = this.partner();
    return p?.status === PartnerStatus.Verified;
  });

  readonly reasonLength = computed(() => this.reason().length);

  readonly isReasonValid = computed(
    () => this.reason().trim().length >= MIN_REASON_LENGTH,
  );

  readonly reasonCharCountClass = computed(() =>
    this.isReasonValid()
      ? 'partner-suspension__char-count--valid'
      : 'partner-suspension__char-count--invalid',
  );

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  ngOnInit(): void {
    const id = this.partnerId();
    this.subscriptions.add(
      this.a2aService.getPartnerDetail(id).subscribe(),
    );
    this.subscriptions.add(
      this.a2aService.getSuspensionImpact(id).subscribe(),
    );
    this.subscriptions.add(
      this.a2aService.getSuspensionHistory(id).subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  updateReason(event: Event): void {
    this.reason.set((event.target as HTMLTextAreaElement).value);
  }

  toggleEffectiveImmediately(): void {
    this.effectiveImmediately.update((v) => !v);
  }

  openConfirmDialog(): void {
    if (!this.isReasonValid()) return;
    this.showConfirmDialog.set(true);
  }

  closeConfirmDialog(): void {
    this.showConfirmDialog.set(false);
  }

  confirmSuspend(): void {
    const suspension: PartnerSuspension = {
      reason: this.reason().trim(),
      effectiveImmediately: this.effectiveImmediately(),
    };

    this.subscriptions.add(
      this.a2aService.suspendPartner(this.partnerId(), suspension).subscribe({
        next: () => {
          this.showConfirmDialog.set(false);
          this.reason.set('');
          // Refresh history
          this.a2aService.getSuspensionHistory(this.partnerId()).subscribe();
        },
      }),
    );
  }

  restorePartner(): void {
    this.subscriptions.add(
      this.a2aService.restorePartner(this.partnerId()).subscribe({
        next: () => {
          // Refresh history
          this.a2aService.getSuspensionHistory(this.partnerId()).subscribe();
        },
      }),
    );
  }

  // ---- Utility ----

  statusBadgeClass(status: PartnerStatus): string {
    return `partner-suspension__badge--${status}`;
  }

  formatDateTime(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }

  actionLabel(action: string): string {
    return action === 'suspended'
      ? 'a2a.suspension.action_suspended'
      : 'a2a.suspension.action_restored';
  }

  actionBadgeClass(action: string): string {
    return action === 'suspended'
      ? 'partner-suspension__action-badge--suspended'
      : 'partner-suspension__action-badge--restored';
  }
}
