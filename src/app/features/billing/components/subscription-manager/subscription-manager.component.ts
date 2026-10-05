/**
 * SubscriptionManagerComponent — Current subscription plan view with cancel workflow.
 *
 * Route: /billing/subscription
 *
 * Features:
 *   - Current plan display (name, price, interval, features)
 *   - Status badge (active, past_due, cancelled, trialing)
 *   - Billing period display
 *   - Cancel subscription with confirmation dialog
 *   - Empty state for no active subscription
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  computed,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { BillingService } from '../../services/billing.service';
import { SUBSCRIPTION_STATUS_LABELS } from '../../models/billing.model';

@Component({
  selector: 'chora-subscription-manager',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './subscription-manager.component.html',
  styleUrl: './subscription-manager.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionManagerComponent implements OnInit, OnDestroy {
  private readonly billingService = inject(BillingService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // --- State ---
  readonly subscriptionState = this.billingService.subscriptionState;
  readonly subscription = this.billingService.subscription;

  // --- Constants ---
  readonly statusLabels = SUBSCRIPTION_STATUS_LABELS;

  // --- Computed ---
  readonly isActive = computed(() => {
    const sub = this.subscription();
    return sub?.status === 'active';
  });

  readonly canCancel = computed(() => {
    const sub = this.subscription();
    if (!sub) return false;
    return (sub.status === 'active' || sub.status === 'trialing') && !sub.cancel_at_period_end;
  });

  readonly planFeatures = computed(() => {
    // Plan features will be populated once plan details are loaded with subscription
    return [] as string[];
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.billingService.loadSubscription().subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async cancelSubscription(): Promise<void> {
    const sub = this.subscription();
    if (!sub) return;

    const confirmed = await this.confirmDialog.confirm({
      title: 'billing.cancel_title',
      message: 'billing.cancel_message',
      confirmText: 'billing.cancel_confirm',
      variant: 'danger',
    });

    if (!confirmed) return;

    this.subscriptions.add(
      this.billingService.cancelSubscription(sub.id).subscribe({
        next: (result) => {
          if (result) {
            this.toast.show('billing.cancel_success', 'success');
          }
        },
        error: () => {
          this.toast.show('billing.cancel_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  formatPrice(amountCents: number, currency: string): string {
    const amount = amountCents / 100;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).format(amount);
    } catch {
      return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
    }
  }

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }

  statusClass(status: string): string {
    return `subscription-manager__status--${status}`;
  }
}
