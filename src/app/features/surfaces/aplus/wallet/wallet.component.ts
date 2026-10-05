/**
 * WalletComponent — THE learner wallet (/a/wallet, CHO-2238 one-wallet ruling
 * 2026-07-17; reverses the CHO-1886 route rename to /a/mana-pool, which this
 * dir/selector/i18n namespace never followed).
 *
 * Mana is the umbrella prepaid-credit currency for every LLM activity
 * (ADR-142). This is the proactive, DDD-aligned home for managing it: the
 * Identity-domain wallet (balance + subsidy breakdown) plus a proactive
 * top-up that initiates the Payments-domain Stripe checkout
 * (MeManaService.checkoutMana → POST /api/v1/checkout/user-mana). The 402
 * upsell modal in atom-authoring / familiar-chat remains the SECONDARY,
 * in-context "you ran out mid-task" affordance; both converge on the same
 * checkout. Previously there was no proactive entry point — the only path to
 * top up was a 402 modal that cannot fire at balance 0 (authoring disables the
 * action client-side; familiar chat is fail-open server-side).
 *
 * Transaction history: the standalone mana ledger (CHO-1883) was folded into
 * the unified timeline (ADR-205 / CHO-1948), which briefly lived on its own
 * page at /a/transactions; the one-wallet ruling brings it HOME — the shared
 * <chora-transaction-history> mounts inline at learner scope (this surface
 * owns the scope decision, ADR-205 D1), and /a/transactions redirects here.
 * ONE page answers "what do I have, how do I get more, where did it go".
 * Star credits (Choraverse, build-gated) converge here when they ship — C+
 * never re-grows a wallet nav (its mock wallet debris was retired with this).
 *
 * Post-Stripe return: Stripe's success_url lands back here with
 * `?mana_topup=success`. The credit is asynchronous (webhook → outbox → push
 * → identity CreditMana), so the page polls GET /api/v1/me/mana until the
 * balance exceeds the pre-checkout value stashed in sessionStorage, then
 * confirms. On timeout it reports "processing" (NOT an error — the credit is
 * reliable, just delayed).
 *
 * Per chora-web CLAUDE.md §3 — BFF-only via MeManaService; fail-loud; signals.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TransactionHistoryComponent } from '../../../../shared/components/transaction-history/transaction-history.component';
import { MeManaService } from '../../../../core/services/me-mana.service';
import { MANA_PACKS, type ManaPack } from '../../../../core/services/me-mana.model';

/** Post-top-up confirmation poll: every 3s, up to ~10 attempts (~30s). */
const TOPUP_POLL_INTERVAL_MS = 3_000;
const TOPUP_POLL_MAX_ATTEMPTS = 10;
const PRE_TOPUP_KEY = 'chora.mana.preTopup';

type ConfirmState =
  | { status: 'idle' }
  | { status: 'confirming'; attempt: number }
  | { status: 'credited'; newUnits: number }
  | { status: 'processing' }; // timed out waiting; credit still pending

@Component({
  selector: 'chora-aplus-wallet',
  standalone: true,
  imports: [TranslatePipe, TransactionHistoryComponent],
  templateUrl: './wallet.component.html',
  styleUrl: './wallet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletComponent implements OnInit {
  private readonly mana = inject(MeManaService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /** Purchasable packs (display catalogue; gateway resolves the real price). */
  readonly packs: readonly ManaPack[] = MANA_PACKS;

  // Re-expose the service's reactive wallet state to the template.
  readonly loadState = this.mana.loadState;
  readonly checkoutState = this.mana.checkoutState;
  readonly balanceUnits = this.mana.balanceUnits;
  readonly wallet = this.mana.mana;

  readonly subsidies = computed(() => this.wallet()?.subsidy_breakdown ?? []);

  /**
   * Balance-breakdown accordion — collapsed by default (CHO-1886 UX pass). The
   * breakdown explains where the balance number comes from, so it lives inside
   * the balance card as a contextual disclosure the learner opens on demand
   * rather than an always-on section competing with the history below.
   */
  readonly breakdownOpen = signal<boolean>(false);
  toggleBreakdown(): void {
    this.breakdownOpen.update((v) => !v);
  }

  /**
   * Friendly i18n key for a balance-breakdown source (Personal / From your
   * tenant / Top-up / …); falls back to the raw source for any unknown value
   * so nothing is hidden. CHO-1883 — replaces the raw `subscription_grant`
   * label that mislabelled the personal base balance.
   */
  sourceLabelKey(source: string): string {
    const known = new Set([
      'personal',
      'tenant_subsidy',
      'topup',
      'subscription_grant',
      'promo',
      'refund',
      'rollover',
      'mint',
    ]);
    return known.has(source) ? `aplus.wallet.source_${source}` : source;
  }

  private readonly _confirm = signal<ConfirmState>({ status: 'idle' });
  readonly confirm = this._confirm.asReadonly();

  readonly isCheckingOut = computed(
    () =>
      this.checkoutState().status === 'submitting' ||
      this.checkoutState().status === 'redirecting',
  );
  readonly checkoutError = computed(() => {
    const s = this.checkoutState();
    return s.status === 'error' ? s.error : null;
  });

  private pollTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.pollTimer);
    });
    this.mana.load();
    if (this.route.snapshot.queryParamMap.get('mana_topup') === 'success') {
      this.beginConfirmPoll();
    }
  }

  /** Proactive top-up CTA — mint a Stripe Checkout Session for the pack. */
  topUp(sku: string): void {
    this.mana.checkoutMana(sku);
  }

  /** Format a price in cents to a display string (e.g. 799 → "$7.99"). */
  priceLabel(pack: ManaPack): string {
    const amount = (pack.price_cents / 100).toFixed(2);
    return `${pack.currency === 'USD' ? '$' : ''}${amount} ${pack.currency}`;
  }

  private beginConfirmPoll(): void {
    const pre = this.readPreTopup();
    this._confirm.set({ status: 'confirming', attempt: 0 });
    this.scheduleConfirmPoll(0, pre);
  }

  private scheduleConfirmPoll(attempt: number, preUnits: number): void {
    this.pollTimer = setTimeout(() => {
      if (this.destroyed) return;
      this.mana.load();
      // load() updates the signal asynchronously; check on the next macrotask.
      setTimeout(() => {
        if (this.destroyed) return;
        const now = this.balanceUnits();
        if (now > preUnits) {
          this._confirm.set({ status: 'credited', newUnits: now });
          this.clearPreTopup();
          return;
        }
        if (attempt + 1 >= TOPUP_POLL_MAX_ATTEMPTS) {
          this._confirm.set({ status: 'processing' });
          this.clearPreTopup();
          return;
        }
        this._confirm.set({ status: 'confirming', attempt: attempt + 1 });
        this.scheduleConfirmPoll(attempt + 1, preUnits);
      }, 50);
    }, attempt === 0 ? 0 : TOPUP_POLL_INTERVAL_MS);
  }

  private readPreTopup(): number {
    try {
      const v = sessionStorage.getItem(PRE_TOPUP_KEY);
      return v != null ? Number(v) || 0 : 0;
    } catch {
      return 0;
    }
  }

  private clearPreTopup(): void {
    try {
      sessionStorage.removeItem(PRE_TOPUP_KEY);
    } catch {
      /* ignore */
    }
  }
}
