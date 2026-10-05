/**
 * MeManaService — canonical Mana balance fetcher for the authenticated user.
 *
 * Wraps two BFF endpoints (per `learner-economy.yaml`):
 *   GET  /api/v1/me/mana         — fetch the current balance + subsidy breakdown
 *   POST /api/v1/me/mana/topup   — Stripe-backed mana purchase (idempotent)
 *
 * Consumers:
 *   - A+ atom-authoring AI assists (`features/surfaces/aplus/atom-authoring/`)
 *     — optimistic mana gate before any assist call; reconciles to BE
 *     `mana_charged` on response.
 *   - A+ wallet (`features/surfaces/aplus/wallet/wallet.component.ts`)
 *     once it migrates off the `PHYLLIS_WALLET` fixture (audit doc §C+5).
 *
 * Pattern: §2 signal-backed `AsyncState` discriminated union (catalog /
 * course-detail / tenant-overview / atomic-session reference impls).
 * Fail-loud — no mock fallback, no silent 402 swallow. The 402 path is a
 * distinct `insufficient` state so the consumer can open the top-up
 * modal directly off the typed shape.
 *
 * Both `load()` and `topup()` are idempotent for retry CTAs.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, map, of, take } from 'rxjs';
import { HttpHeaders } from '@angular/common/http';

import { BffClientService } from './bff-client.service';
import { RealtimeChannelService } from '../realtime/realtime-channel.service';
import type {
  InsufficientManaErrorResponse,
  InsufficientManaUpsell,
  ManaTopupRequest,
  ManaTopupResponse,
  MeManaCheckoutState,
  MeManaLoadState,
  MeManaTopupState,
  UserMana,
  UserManaCheckoutResponse,
} from './me-mana.model';

@Injectable({ providedIn: 'root' })
export class MeManaService {
  private readonly bff = inject(BffClientService);
  private readonly realtime = inject(RealtimeChannelService);
  private realtimeWired = false;

  // ── Load state (GET /api/v1/me/mana) ──────────────────────────────
  private readonly _loadState = signal<MeManaLoadState>({ status: 'loading' });
  readonly loadState = this._loadState.asReadonly();
  /**
   * The current balance when loaded, else `null`. While a RE-load is in
   * flight the last-known balance is retained (stale-while-revalidate) so
   * consumers never flash "0 mana" mid-refresh; the first load (no prior
   * balance) still reads `null`.
   */
  readonly mana = computed<UserMana | null>(() => {
    const s = this._loadState();
    if (s.status === 'success') {
      return s.mana;
    }
    if (s.status === 'loading') {
      return s.mana ?? null;
    }
    return null;
  });
  /** Convenience: spendable units (or 0 when not loaded). */
  readonly balanceUnits = computed<number>(() => this.mana()?.balance_units ?? 0);

  // ── Top-up state (POST /api/v1/me/mana/topup) ──────────────────────
  private readonly _topupState = signal<MeManaTopupState>({ status: 'idle' });
  readonly topupState = this._topupState.asReadonly();

  // ── Checkout state (POST /api/v1/checkout/user-mana → Stripe redirect) ──
  private readonly _checkoutState = signal<MeManaCheckoutState>({ status: 'idle' });
  readonly checkoutState = this._checkoutState.asReadonly();

  /**
   * Fetch the caller's mana balance. Safe to call repeatedly — re-call
   * after any mana-spending action returns to keep the FE in sync with
   * the BE-authoritative balance.
   */
  load(): void {
    // Stale-while-revalidate: carry the last-known balance into the loading
    // state so a post-spend refresh doesn't blank the header to "0 mana".
    const prev = this.mana();
    this._loadState.set(prev ? { status: 'loading', mana: prev } : { status: 'loading' });
    this.bff
      .get<UserMana>('/api/v1/me/mana')
      .pipe(
        take(1),
        map(
          (mana): MeManaLoadState => ({
            status: 'success',
            mana,
          }),
        ),
        catchError((err: unknown) =>
          of<MeManaLoadState>({
            status: 'error',
            error: this.loadErrorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._loadState.set(s));
  }

  /**
   * Bind the balance to the realtime channel (ADR-183). On a
   * `mana.balance.changed` push (an OUT-OF-BAND change — async Stripe top-up,
   * tenant subsidy, a spend on another device) re-fetch the authoritative
   * balance; likewise on every (re)connect, since the stream is lossy across
   * the 3600s GCLB cap + pod drains. Self-initiated spends in this tab are
   * already echoed optimistically by the caller (atom-authoring), so this
   * COMPLEMENTS — not replaces — that local echo. Idempotent: the app shell
   * calls it once. No-op until the channel is connected (flag-gated).
   */
  connectRealtime(): void {
    if (this.realtimeWired) return;
    this.realtimeWired = true;
    this.realtime.manaBalanceChanged$.subscribe(() => this.load());
    this.realtime.reconnected$.subscribe(() => this.load());
  }

  /**
   * Purchase a one-time mana top-up. Charges the caller's saved Stripe
   * payment method via `POST /api/v1/me/mana/topup` with the
   * Idempotency-Key header. On 402, surfaces the upsell block as a
   * typed state branch (NOT swallowed in errorKey) so the consumer can
   * open the top-up modal directly off the typed shape.
   */
  topup(request: ManaTopupRequest, idempotencyKey: string): void {
    this._topupState.set({ status: 'submitting' });
    const headers = new HttpHeaders({ 'Idempotency-Key': idempotencyKey });
    this.bff
      .post<ManaTopupResponse>('/api/v1/me/mana/topup', request, { headers })
      .pipe(
        take(1),
        map(
          (result): MeManaTopupState => ({
            status: 'success',
            result,
          }),
        ),
        catchError((err: unknown) => of<MeManaTopupState>(this.toTopupErrorState(err))),
      )
      .subscribe((s) => {
        this._topupState.set(s);
        if (s.status === 'success') {
          // Reflect the credit in the balance immediately so the consumer
          // doesn't double-spend before the next `load()`.
          this.applyOptimisticCredit(s.result.units_credited);
        }
      });
  }

  /**
   * Optimistic local debit — used by atom-authoring after a successful
   * assist call so the next gate-check sees the post-spend balance
   * before the next `load()` round-trip. The BE remains authoritative;
   * the next `load()` reconciles any drift.
   */
  applyOptimisticDebit(units: number): void {
    const current = this.mana();
    if (!current || units <= 0) return;
    this._loadState.set({
      status: 'success',
      mana: {
        ...current,
        balance_units: Math.max(0, current.balance_units - units),
        lifetime_spent: current.lifetime_spent + units,
      },
    });
  }

  private applyOptimisticCredit(units: number): void {
    const current = this.mana();
    if (!current || units <= 0) return;
    this._loadState.set({
      status: 'success',
      mana: {
        ...current,
        balance_units: current.balance_units + units,
        lifetime_earned: current.lifetime_earned + units,
      },
    });
  }

  /**
   * Mint a Stripe Checkout Session for a per-user mana top-up and redirect the
   * browser to it (WS-2.2 — replaces the retired POST /api/v1/me/mana/topup).
   * The browser sends ONLY the `sku`; the gateway resolves the authoritative
   * price + units server-side (CHORA_MANA_PACKS) — the FE never sets the price.
   * On the gateway's 200 the user is sent to the Stripe-hosted Checkout page;
   * on capture, the webhook → outbox → identity subscriber credits the wallet.
   * success_url / cancel_url return to the current page so the consumer can
   * re-load() the balance.
   */
  checkoutMana(sku: string): void {
    this._checkoutState.set({ status: 'submitting' });
    const here = this.currentUrl();
    // Stash the pre-top-up balance so the post-Stripe return page can detect
    // when the (asynchronous) webhook → CreditMana credit lands.
    try {
      sessionStorage.setItem('chora.mana.preTopup', String(this.balanceUnits()));
    } catch {
      /* sessionStorage unavailable (private mode / SSR) — poller falls back to
         a fixed window. */
    }
    const successUrl = appendQueryParam(here, 'mana_topup', 'success');
    this.bff
      .post<UserManaCheckoutResponse>('/api/v1/checkout/user-mana', {
        sku,
        success_url: successUrl,
        cancel_url: here,
      })
      .pipe(
        take(1),
        map(
          (res): MeManaCheckoutState => ({
            status: 'redirecting',
            checkoutUrl: res.stripe_checkout_url,
          }),
        ),
        catchError((err: unknown) =>
          of<MeManaCheckoutState>({ status: 'error', error: this.checkoutErrorKey(err) }),
        ),
      )
      .subscribe((s) => {
        this._checkoutState.set(s);
        if (s.status === 'redirecting' && s.checkoutUrl) {
          this.redirectTo(s.checkoutUrl);
        }
      });
  }

  /** Reset the checkout state. */
  clearCheckoutState(): void {
    this._checkoutState.set({ status: 'idle' });
  }

  /** window.location redirect — protected so unit tests can spy it. */
  protected redirectTo(url: string): void {
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  }

  /** Current page URL — protected so unit tests can stub it. */
  protected currentUrl(): string {
    return typeof window !== 'undefined' ? window.location.href : '';
  }

  private checkoutErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 503) return 'core.mana.checkout_error_unavailable';
      if (e.status === 400) return 'core.mana.checkout_error_validation';
      if (e.status >= 500) return 'core.mana.checkout_error_upstream';
      if (e.status === 401 || e.status === 403) return 'core.mana.checkout_error_unauthorised';
    }
    return 'core.mana.checkout_error_generic';
  }

  /** Reset the top-up state — call from the modal on dismiss. */
  clearTopupState(): void {
    this._topupState.set({ status: 'idle' });
  }

  // ── Error mapping ──────────────────────────────────────────────────
  private loadErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 404) return 'core.mana.error_not_found';
      if (e.status >= 500) return 'core.mana.error_upstream';
      if (e.status === 401 || e.status === 403) return 'core.mana.error_unauthorised';
    }
    return 'core.mana.error_generic';
  }

  private toTopupErrorState(err: unknown): MeManaTopupState {
    const e = err as {
      status?: number;
      error?: InsufficientManaErrorResponse | { error?: { code?: string; message?: string } };
    };
    if (e?.status === 402) {
      const errBody = (e.error ?? {}) as InsufficientManaErrorResponse;
      const upsell = (errBody.error as { upsell?: InsufficientManaUpsell } | undefined)
        ?.upsell;
      if (upsell) {
        return {
          status: 'insufficient',
          upsell,
          message: errBody.error?.message ?? 'core.mana.error_insufficient_default',
        };
      }
    }
    return {
      status: 'error',
      error: this.topupErrorKey(err),
    };
  }

  private topupErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 423) return 'core.mana.topup_error_locked';
      if (e.status === 422) return 'core.mana.topup_error_validation';
      if (e.status >= 500) return 'core.mana.topup_error_upstream';
      if (e.status === 401 || e.status === 403) {
        return 'core.mana.topup_error_unauthorised';
      }
    }
    return 'core.mana.topup_error_generic';
  }
}

/**
 * appendQueryParam returns `url` with `key=value` added to its query string,
 * preserving any existing query/hash. Falls back to a naive `?`/`&` concat when
 * URL parsing fails (e.g. a relative path in SSR).
 */
export function appendQueryParam(url: string, key: string, value: string): string {
  try {
    const u = new URL(url, 'https://chora.site');
    u.searchParams.set(key, value);
    // Re-emit relative when the input was relative (no origin in the original).
    return /^https?:\/\//i.test(url) ? u.toString() : u.pathname + u.search + u.hash;
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}${key}=${value}`;
  }
}
