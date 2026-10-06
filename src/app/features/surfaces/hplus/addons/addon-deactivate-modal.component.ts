/**
 * H+ Add-on Deactivation Modal (CHO-1731 STITCH-H-ADD-2).
 *
 * Opens from the dashboard tile's "Deactivate" action (sibling
 * AddonManagementComponent). Posts to the gateway alias
 *   POST /api/v1/admin/tenants/me/addons/{addonPlanId}:deactivate
 * via TenantAddonsAdminService.deactivate (landed CHO-1731 PR 1).
 *
 * Inputs:
 *   - addonPlanId        — UUID of the subscription to deactivate.
 *   - displayName        — used in the title + the type-to-confirm match.
 *   - addonCode          — shown next to the title for unambiguity.
 *   - billingCycleEnd    — drives the refund-timing notice copy + the
 *                          end_of_cycle effective_at value.
 *
 * Outputs:
 *   - deactivated  — emits the discriminated DeactivateAddonResult on
 *                    success (immediate or scheduled).
 *   - dismissed    — emits void when the user cancels or Esc dismisses
 *                    (so the host can tear the modal down + restore focus).
 *
 * Out of scope (deferred sub-stories on epic CHO-1697):
 *   - partial-revoke warning (depends on BE flag in dashboard row).
 *   - Stripe-correlation copy beyond the basic refund notice.
 */
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  Output,
  EventEmitter,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TenantAddonsAdminService } from '../../../admin/tenant-admin/services/tenant-addons-admin.service';
import {
  DEACTIVATE_REASONS,
  DeactivateAddonRequest,
  DeactivateAddonResult,
  DeactivateEffectiveAt,
  DeactivateReason,
} from '../../../admin/tenant-admin/models/tenant-addons-admin.model';

const REASON_TEXT_MAX = 1024;

@Component({
  selector: 'chora-hplus-addon-deactivate-modal',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './addon-deactivate-modal.component.html',
  styleUrl: './addon-deactivate-modal.component.scss',
})
export class AddonDeactivateModalComponent {
  private readonly addonsSvc = inject(TenantAddonsAdminService);

  // ---------------------------------------------------------------------------
  // Inputs / outputs
  // ---------------------------------------------------------------------------

  readonly addonPlanId = input.required<string>();
  readonly displayName = input.required<string>();
  readonly addonCode = input.required<string>();
  readonly billingCycleEnd = input<string | null>(null);

  @Output() readonly deactivated = new EventEmitter<DeactivateAddonResult>();
  @Output() readonly dismissed = new EventEmitter<void>();

  // ---------------------------------------------------------------------------
  // Local state
  // ---------------------------------------------------------------------------

  readonly reasons: readonly DeactivateReason[] = DEACTIVATE_REASONS;
  readonly reason = signal<DeactivateReason | ''>('');
  readonly reasonText = signal('');
  readonly effectiveAt = signal<DeactivateEffectiveAt>('end_of_cycle');
  readonly typeToConfirm = signal('');

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  readonly reasonTextMax = REASON_TEXT_MAX;

  // ---------------------------------------------------------------------------
  // Computed guards
  // ---------------------------------------------------------------------------

  /** Case-insensitive trim match against displayName. */
  readonly nameMatches = computed(
    () =>
      this.typeToConfirm().trim().toLowerCase() ===
      this.displayName().trim().toLowerCase(),
  );

  /** Other free-text required iff reason === 'other'. */
  readonly otherRequiredOk = computed(
    () => this.reason() !== 'other' || this.reasonText().trim().length > 0,
  );

  readonly canSubmit = computed(
    () =>
      !this.submitting() &&
      this.reason() !== '' &&
      this.nameMatches() &&
      this.otherRequiredOk(),
  );

  // ---------------------------------------------------------------------------
  // Bindings
  // ---------------------------------------------------------------------------

  setReason(value: string): void {
    this.reason.set(value as DeactivateReason | '');
    if (value !== 'other') this.reasonText.set('');
  }

  setEffectiveAt(value: DeactivateEffectiveAt): void {
    this.effectiveAt.set(value);
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  submit(): void {
    if (!this.canSubmit()) return;
    const reason = this.reason();
    if (reason === '') return;
    this.submitting.set(true);
    this.error.set(null);
    const payload: DeactivateAddonRequest = {
      reason,
      ...(reason === 'other' ? { reason_text: this.reasonText().trim() } : {}),
      effective_at: this.computeEffectiveAt(),
    };
    this.addonsSvc.deactivate(this.addonPlanId(), payload).subscribe({
      next: (result) => {
        this.submitting.set(false);
        switch (result.kind) {
          case 'success-immediate':
          case 'success-scheduled':
            this.deactivated.emit(result);
            return;
          case 'compliance-locked':
            this.error.set('hplus.addons.deactivate.error.complianceLocked');
            return;
          case 'not-found':
            this.error.set('hplus.addons.deactivate.error.notFound');
            return;
          case 'already-deactivated':
            this.error.set('hplus.addons.deactivate.error.alreadyDeactivated');
            return;
          case 'unauthenticated':
            this.error.set('hplus.addons.deactivate.error.unauthenticated');
            return;
          case 'server-error':
          case 'network-error':
            this.error.set('hplus.addons.deactivate.error.serverError');
            return;
        }
      },
      error: () => {
        this.submitting.set(false);
        this.error.set('hplus.addons.deactivate.error.serverError');
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Dismiss
  // ---------------------------------------------------------------------------

  cancel(): void {
    this.dismissed.emit();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Maps the radio choice to the BE's effective_at field.
   *
   * - `immediate` → null. The BE (`handleAdminDeactivateAddon`) reads
   *   nil EffectiveAt as immediate.
   * - `end_of_cycle` → billingCycleEnd ISO if the parent supplied it.
   *   When it didn't (no BE-emitted `billing_cycle_end` field today),
   *   fall back to now + 30 days so the BE still schedules. The
   *   previous `?? null` fallback silently degraded end_of_cycle to
   *   immediate, defeating the whole flow (CHO-1782 follow-up).
   *
   * 30 days matches the grace-window default in
   * `handleAdminRequestDeactivation`'s sibling path; once the BE
   * surfaces `next_renewal_at` on the snapshot we can replace the
   * approximation with the real cycle anchor.
   */
  private computeEffectiveAt(): string | null {
    if (this.effectiveAt() === 'immediate') return null;
    const cycleEnd = this.billingCycleEnd();
    if (cycleEnd) return cycleEnd;
    const fallback = new Date();
    fallback.setUTCDate(fallback.getUTCDate() + 30);
    return fallback.toISOString();
  }
}
