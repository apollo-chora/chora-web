/**
 * H+ Mana Pool — L1 Tenant lane (CHO-1709 WP-4): tenant mana-pool admin.
 *
 * The tenant admin reviews the TenantManaPool (ADR-142 tenant subsidy
 * pool — balance, monthly auto-renew quota, lifetime topped-up /
 * allocated stats, low-balance warning), creates the pool when the
 * tenant has none yet (404 → create CTA; pools start EMPTY — no initial
 * balance is promised), sets the monthly auto-renew quota (0 disables),
 * and tops the pool up through Stripe Checkout (fixed packs → gateway
 * `/api/v1/checkout/mana-topup` → redirect to `stripe_checkout_url`).
 *
 * Returning from Stripe lands back on `/h/mana?topup=success|cancelled`
 * — the credit is asynchronous (webhook → outbox → tenancy subscriber),
 * so the success notice sets the expectation rather than asserting the
 * new balance.
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { TenantManaAdminService } from '../../../admin/tenant-admin/services/tenant-mana-admin.service';
import {
  ManaTopUpPack,
  TENANT_MANA_TOPUP_PACKS,
  TenantManaPool,
} from '../../../admin/tenant-admin/models/tenant-mana-admin.model';

type LoadState = 'loading' | 'ready' | 'no-pool' | 'error';
type TopupReturn = 'success' | 'cancelled' | null;

/** Mana-pool page path — anchors the Stripe success/cancel return URLs. */
const MANA_PAGE_PATH = '/h/mana';

@Component({
  selector: 'chora-hplus-mana-pool',
  standalone: true,
  imports: [TranslatePipe, DatePipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mana-pool.component.html',
  styleUrl: './mana-pool.component.scss',
})
export class ManaPoolComponent implements OnInit {
  private readonly manaApi = inject(TenantManaAdminService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  // ── Load state ───────────────────────────────────────────────────────
  private readonly _state = signal<LoadState>('loading');
  private readonly _pool = signal<TenantManaPool | null>(null);
  private readonly _errorCode = signal<string | null>(null);

  readonly state = this._state.asReadonly();
  readonly pool = this._pool.asReadonly();
  readonly errorCode = this._errorCode.asReadonly();

  // ── Create-if-absent state ───────────────────────────────────────────
  private readonly _createBusy = signal(false);
  private readonly _createErrorCode = signal<string | null>(null);

  readonly createBusy = this._createBusy.asReadonly();
  readonly createErrorCode = this._createErrorCode.asReadonly();

  // ── Monthly auto-renew quota form ────────────────────────────────────
  private readonly _quotaInput = signal('');
  private readonly _quotaBusy = signal(false);
  private readonly _quotaSaved = signal(false);
  private readonly _quotaErrorCode = signal<string | null>(null);

  readonly quotaInput = this._quotaInput.asReadonly();
  readonly quotaBusy = this._quotaBusy.asReadonly();
  readonly quotaSaved = this._quotaSaved.asReadonly();
  readonly quotaErrorCode = this._quotaErrorCode.asReadonly();

  /** Parsed quota — a non-negative integer, or null when invalid. */
  readonly parsedQuota = computed<number | null>(() => {
    const raw = this._quotaInput().trim();
    if (!/^\d+$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  });

  readonly canSubmitQuota = computed(
    () => this.parsedQuota() !== null && !this._quotaBusy(),
  );

  // ── Top-up packs → Stripe checkout ───────────────────────────────────
  readonly packs: readonly ManaTopUpPack[] = TENANT_MANA_TOPUP_PACKS;

  private readonly _topupBusySku = signal<string | null>(null);
  private readonly _topupErrorCode = signal<string | null>(null);

  readonly topupBusySku = this._topupBusySku.asReadonly();
  readonly topupErrorCode = this._topupErrorCode.asReadonly();

  // ── Post-Stripe return notice (?topup=success|cancelled) ─────────────
  private readonly _topupReturn = signal<TopupReturn>(null);
  readonly topupReturn = this._topupReturn.asReadonly();

  ngOnInit(): void {
    const returned = this.route.snapshot.queryParamMap.get('topup');
    if (returned === 'success' || returned === 'cancelled') {
      this._topupReturn.set(returned);
    }
    this.load();
  }

  load(): void {
    this._state.set('loading');
    this._errorCode.set(null);
    this.manaApi.pool().subscribe((res) => {
      switch (res.kind) {
        case 'success':
          this.hydrate(res.pool);
          return;
        case 'no-pool':
          this._pool.set(null);
          this._state.set('no-pool');
          return;
        default:
          this._errorCode.set(res.code);
          this._state.set('error');
      }
    });
  }

  createPool(): void {
    if (this._createBusy()) return;
    this._createBusy.set(true);
    this._createErrorCode.set(null);
    this.manaApi.create().subscribe((res) => {
      this._createBusy.set(false);
      if (res.kind === 'success') {
        this.hydrate(res.pool);
        this.toast.show('hplus.mana.toastCreated', 'success');
        return;
      }
      this._createErrorCode.set(res.code);
    });
  }

  onQuotaInput(event: Event): void {
    this._quotaInput.set((event.target as HTMLInputElement).value);
    this._quotaSaved.set(false);
    this._quotaErrorCode.set(null);
  }

  submitQuota(): void {
    const units = this.parsedQuota();
    if (units === null || this._quotaBusy()) return;
    this._quotaBusy.set(true);
    this._quotaSaved.set(false);
    this._quotaErrorCode.set(null);
    this.manaApi.setAutoRenew(units).subscribe((res) => {
      this._quotaBusy.set(false);
      switch (res.kind) {
        case 'success':
          this.hydrate(res.pool);
          this._quotaSaved.set(true);
          return;
        case 'no-pool':
          // The pool vanished underneath us — fall back to the create CTA.
          this._pool.set(null);
          this._state.set('no-pool');
          return;
        default:
          this._quotaErrorCode.set(res.code);
      }
    });
  }

  topUp(pack: ManaTopUpPack): void {
    if (this._topupBusySku() !== null) return;
    this._topupBusySku.set(pack.sku);
    this._topupErrorCode.set(null);
    const origin = this.currentOrigin();
    this.manaApi
      .checkoutTopUp(
        pack,
        `${origin}${MANA_PAGE_PATH}?topup=success`,
        `${origin}${MANA_PAGE_PATH}?topup=cancelled`,
      )
      .subscribe((res) => {
        if (res.kind === 'success') {
          // Leave the busy flag set — the browser is navigating away.
          this.redirectTo(res.checkout.stripe_checkout_url);
          return;
        }
        this._topupBusySku.set(null);
        this._topupErrorCode.set(res.code);
      });
  }

  dismissReturnNotice(): void {
    this._topupReturn.set(null);
  }

  /** Display price for a pack — all packs are SGD-denominated. */
  packPrice(pack: ManaTopUpPack): string {
    return `S$${(pack.amount_cents / 100).toFixed(2)}`;
  }

  /** Seed signals from a fresh server projection (load/create/quota). */
  private hydrate(pool: TenantManaPool): void {
    this._pool.set(pool);
    this._quotaInput.set(String(pool.monthly_topup_units));
    this._state.set('ready');
  }

  /** window.location redirect — protected so unit tests can spy it. */
  protected redirectTo(url: string): void {
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  }

  /** Current origin — protected so unit tests can stub it. */
  protected currentOrigin(): string {
    return typeof window !== 'undefined' ? window.location.origin : '';
  }
}
