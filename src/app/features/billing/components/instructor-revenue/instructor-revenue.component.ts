/**
 * InstructorRevenueComponent — Revenue dashboard for content instructors.
 *
 * Route: /billing/instructor-revenue
 *
 * Features:
 *   - Revenue summary cards (total earned, pending payout, lifetime)
 *   - Revenue share breakdown chart (CSS bars)
 *   - Promo code performance table
 *   - Payout history list with status badges
 *   - Promo code generator form
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
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  InstructorRevenue,
  InstructorRevenueState,
  PayoutEntry,
  PromoCodePerformance,
  RevenueShareBreakdown,
} from '../../models/marketplace.model';
import { PAYOUT_STATUS_LABELS } from '../../models/marketplace.model';

@Component({
  selector: 'chora-instructor-revenue',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './instructor-revenue.component.html',
  styleUrl: './instructor-revenue.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstructorRevenueComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);
  private readonly toast = inject(ToastService);

  // --- State ---
  private readonly _state = signal<InstructorRevenueState>({ status: 'idle' });
  readonly state = this._state.asReadonly();

  readonly revenue = computed(() => {
    const s = this._state();
    return s.status === 'success' ? s.data : null;
  });

  readonly isLoading = computed(() => this._state().status === 'loading');
  readonly isError = computed(() => this._state().status === 'error');

  // --- Derived ---
  readonly summary = computed(() => this.revenue()?.summary ?? null);
  readonly revenueShares = computed<RevenueShareBreakdown[]>(
    () => this.revenue()?.revenue_shares ?? [],
  );
  readonly promoPerformance = computed<PromoCodePerformance[]>(
    () => this.revenue()?.promo_performance ?? [],
  );
  readonly payouts = computed<PayoutEntry[]>(() => this.revenue()?.payouts ?? []);

  readonly maxShareAmount = computed(() => {
    const shares = this.revenueShares();
    if (shares.length === 0) return 1;
    return Math.max(...shares.map((s) => s.amount_cents));
  });

  // --- Promo generator ---
  readonly newPromoCode = signal('');
  readonly generatingPromo = signal(false);

  // --- Constants ---
  readonly payoutStatusLabels = PAYOUT_STATUS_LABELS;

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadRevenue();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadRevenue(): void {
    this._state.set({ status: 'loading' });
    this.subscriptions.add(
      this.bff
        .get<InstructorRevenue>('/api/v1/billing/instructor-revenue')
        .subscribe({
          next: (data) => this._state.set({ status: 'success', data }),
          error: (err: Error) =>
            this._state.set({
              status: 'error',
              error: { code: 'REVENUE_LOAD_FAILED', message: err.message },
            }),
        }),
    );
  }

  // -------------------------------------------------------------------------
  // Promo code generation
  // -------------------------------------------------------------------------

  generatePromoCode(): void {
    const code = this.newPromoCode().trim();
    if (!code) return;

    this.generatingPromo.set(true);
    this.subscriptions.add(
      this.bff
        .post<void>('/api/v1/billing/instructor-revenue/promo-codes', { code })
        .subscribe({
          next: () => {
            this.generatingPromo.set(false);
            this.newPromoCode.set('');
            this.toast.show('billing.promo_code_generated', 'success');
            this.loadRevenue();
          },
          error: () => {
            this.generatingPromo.set(false);
            this.toast.show('billing.promo_code_generate_error', 'error');
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

  shareBarWidth(amountCents: number): number {
    const max = this.maxShareAmount();
    if (max === 0) return 0;
    return (amountCents / max) * 100;
  }

  payoutStatusClass(status: string): string {
    return `instructor-revenue__payout-status--${status}`;
  }

  formatDate(isoString: string | null): string {
    if (!isoString) return '-';
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }
}
