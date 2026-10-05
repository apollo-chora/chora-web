/**
 * PromoCodeManagerComponent — Data table listing all promo codes with management actions.
 *
 * Route: /billing/promo-codes
 *
 * Features:
 *   - Tabular promo code list (code, discount, usage, validity, status, actions)
 *   - Create promo code form (inline toggle)
 *   - Revoke promo code with confirmation dialog
 *   - Status badges (active, revoked, expired)
 *   - Loading skeleton and empty state
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
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { BillingService } from '../../services/billing.service';
import { PromoCodeFormComponent } from '../promo-code-form/promo-code-form.component';
import type { PromoCode } from '../../models/billing.model';

@Component({
  selector: 'chora-promo-code-manager',
  standalone: true,
  imports: [TranslatePipe, PromoCodeFormComponent],
  templateUrl: './promo-code-manager.component.html',
  styleUrl: './promo-code-manager.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromoCodeManagerComponent implements OnInit, OnDestroy {
  private readonly billingService = inject(BillingService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // --- State ---
  readonly promoCodeState = this.billingService.promoCodeState;
  readonly promoCodes = this.billingService.promoCodes;
  readonly showCreateForm = signal(false);

  // --- Computed ---
  readonly isEmpty = computed(
    () => this.promoCodeState().status === 'success' && this.promoCodes().length === 0,
  );

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.billingService.loadPromoCodes().subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  toggleCreateForm(): void {
    this.showCreateForm.update((v) => !v);
  }

  onPromoCreated(): void {
    this.showCreateForm.set(false);
    this.subscriptions.add(
      this.billingService.loadPromoCodes().subscribe(),
    );
  }

  async revokePromoCode(id: string): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'billing.revoke_promo_title',
      message: 'billing.revoke_promo_message',
      confirmText: 'billing.revoke_confirm',
      variant: 'danger',
    });

    if (!confirmed) return;

    this.subscriptions.add(
      this.billingService.revokePromoCode(id).subscribe({
        next: (result) => {
          if (result) {
            this.toast.show('billing.promo_code_revoked', 'success');
          }
        },
        error: () => {
          this.toast.show('billing.promo_code_revoke_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }

  discountDisplay(promo: PromoCode): string {
    if (promo.discount_type === 'percentage') {
      return `${promo.discount_value}%`;
    }
    const amount = promo.discount_value / 100;
    return `$${amount.toFixed(2)}`;
  }

  isExpired(promo: PromoCode): boolean {
    try {
      return new Date(promo.valid_until) < new Date();
    } catch {
      return false;
    }
  }

  usageDisplay(promo: PromoCode): string {
    return `${promo.current_redemptions} / ${promo.max_redemptions}`;
  }

  statusClass(promo: PromoCode): string {
    if (!promo.is_active) return 'promo-code-manager__badge--revoked';
    if (this.isExpired(promo)) return 'promo-code-manager__badge--expired';
    return 'promo-code-manager__badge--active';
  }

  statusLabel(promo: PromoCode): string {
    if (!promo.is_active) return 'billing.status_revoked';
    if (this.isExpired(promo)) return 'billing.status_expired';
    return 'billing.status_active';
  }

  canRevoke(promo: PromoCode): boolean {
    return promo.is_active && !this.isExpired(promo);
  }
}
