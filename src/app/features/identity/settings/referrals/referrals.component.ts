/**
 * ReferralsComponent — Referral dashboard with code display, sharing,
 * credit tracking, and tier milestones.
 *
 * Route: /settings/referrals
 *
 * Features:
 *   - Referral code display with copy-to-clipboard button
 *   - Share buttons (copy link)
 *   - Earned credits balance
 *   - Credit redemption tracking table
 *   - Referral tiers / milestones
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
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  ReferralInfo,
  ReferralState,
  ReferralCredit,
  ReferralTier,
} from '../../../billing/models/marketplace.model';
import { REFERRAL_CREDIT_STATUS_LABELS } from '../../../billing/models/marketplace.model';

@Component({
  selector: 'chora-referrals',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './referrals.component.html',
  styleUrl: './referrals.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReferralsComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);
  private readonly toast = inject(ToastService);

  // --- State ---
  private readonly _state = signal<ReferralState>({ status: 'idle' });
  readonly state = this._state.asReadonly();

  readonly referralInfo = computed(() => {
    const s = this._state();
    return s.status === 'success' ? s.data : null;
  });

  readonly isLoading = computed(() => this._state().status === 'loading');
  readonly isError = computed(() => this._state().status === 'error');

  // --- Derived ---
  readonly referralCode = computed(() => this.referralInfo()?.referral_code ?? '');
  readonly referralLink = computed(() => this.referralInfo()?.referral_link ?? '');
  readonly earnedCredits = computed(() => this.referralInfo()?.earned_credits_cents ?? 0);
  readonly currency = computed(() => this.referralInfo()?.currency ?? 'usd');
  readonly credits = computed<ReferralCredit[]>(() => this.referralInfo()?.credits ?? []);
  readonly tiers = computed<ReferralTier[]>(() => this.referralInfo()?.tiers ?? []);

  // --- Copy state ---
  readonly codeCopied = signal(false);
  readonly linkCopied = signal(false);

  // --- Constants ---
  readonly creditStatusLabels = REFERRAL_CREDIT_STATUS_LABELS;

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadReferralInfo();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadReferralInfo(): void {
    this._state.set({ status: 'loading' });
    this.subscriptions.add(
      this.bff.get<ReferralInfo>('/api/v1/identity/referrals').subscribe({
        next: (data) => this._state.set({ status: 'success', data }),
        error: (err: Error) =>
          this._state.set({
            status: 'error',
            error: { code: 'REFERRALS_LOAD_FAILED', message: err.message },
          }),
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Clipboard
  // -------------------------------------------------------------------------

  async copyCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.referralCode());
      this.codeCopied.set(true);
      this.toast.show('settings.referral_code_copied', 'success');
      setTimeout(() => this.codeCopied.set(false), 2000);
    } catch {
      this.toast.show('settings.copy_failed', 'error');
    }
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.referralLink());
      this.linkCopied.set(true);
      this.toast.show('settings.referral_link_copied', 'success');
      setTimeout(() => this.linkCopied.set(false), 2000);
    } catch {
      this.toast.show('settings.copy_failed', 'error');
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  formatPrice(amountCents: number, cur: string): string {
    const amount = amountCents / 100;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: cur.toUpperCase(),
      }).format(amount);
    } catch {
      return `${cur.toUpperCase()} ${amount.toFixed(2)}`;
    }
  }

  creditStatusClass(status: string): string {
    return `referrals__credit-status--${status}`;
  }

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }
}
