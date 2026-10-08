/**
 * BillingService — REST adapter for billing, subscriptions, invoices,
 * promo codes, and usage tracking.
 *
 * Source of truth: chora-contracts/openapi/payments-admin.yaml
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';
import type {
  Subscription,
  Invoice,
  PromoCode,
  UsageSummary,
  SubscriptionState,
  InvoiceListState,
  PromoCodeListState,
  UsageState,
} from '../models/billing.model';

// ---------------------------------------------------------------------------
// Endpoint paths
// ---------------------------------------------------------------------------

const SUBSCRIPTIONS_PATH = '/api/v1/billing/subscriptions';
const INVOICES_PATH = '/api/v1/billing/invoices';
const PROMO_CODES_PATH = '/api/v1/billing/promo-codes';
const USAGE_PATH = '/api/v1/billing/usage';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly bff = inject(BffClientService);

  // --- Signal state (private + readonly) ---
  private readonly _subscriptionState = signal<SubscriptionState>({ status: 'idle' });
  readonly subscriptionState = this._subscriptionState.asReadonly();

  private readonly _invoiceState = signal<InvoiceListState>({ status: 'idle' });
  readonly invoiceState = this._invoiceState.asReadonly();

  private readonly _promoCodeState = signal<PromoCodeListState>({ status: 'idle' });
  readonly promoCodeState = this._promoCodeState.asReadonly();

  private readonly _usageState = signal<UsageState>({ status: 'idle' });
  readonly usageState = this._usageState.asReadonly();

  // --- Computed ---
  readonly subscription = computed(() => {
    const s = this._subscriptionState();
    return s.status === 'success' ? s.data : null;
  });

  readonly invoices = computed(() => {
    const s = this._invoiceState();
    return s.status === 'success' ? s.invoices : [];
  });

  readonly promoCodes = computed(() => {
    const s = this._promoCodeState();
    return s.status === 'success' ? s.promo_codes : [];
  });

  readonly activePromoCodes = computed(() =>
    this.promoCodes().filter((pc) => pc.is_active),
  );

  readonly usageSummaries = computed(() => {
    const s = this._usageState();
    return s.status === 'success' ? s.summaries : [];
  });

  // -------------------------------------------------------------------------
  // Subscription methods
  // -------------------------------------------------------------------------

  loadSubscription(): Observable<Subscription | null> {
    this._subscriptionState.set({ status: 'loading' });

    return this.bff.get<Subscription>(SUBSCRIPTIONS_PATH).pipe(
      tap((data) => {
        this._subscriptionState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._subscriptionState.set({
          status: 'error',
          error: { code: 'SUBSCRIPTION_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  createSubscription(planId: string): Observable<Subscription | null> {
    this._subscriptionState.set({ status: 'loading' });

    return this.bff.post<Subscription>(SUBSCRIPTIONS_PATH, { plan_id: planId }).pipe(
      tap((data) => {
        this._subscriptionState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._subscriptionState.set({
          status: 'error',
          error: { code: 'SUBSCRIPTION_CREATE_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  updateSubscription(id: string, planId: string): Observable<Subscription | null> {
    this._subscriptionState.set({ status: 'loading' });

    return this.bff.put<Subscription>(
      `${SUBSCRIPTIONS_PATH}/${encodeURIComponent(id)}`,
      { plan_id: planId },
    ).pipe(
      tap((data) => {
        this._subscriptionState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._subscriptionState.set({
          status: 'error',
          error: { code: 'SUBSCRIPTION_UPDATE_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  cancelSubscription(id: string): Observable<Subscription | null> {
    this._subscriptionState.set({ status: 'loading' });

    return this.bff.delete<Subscription>(
      `${SUBSCRIPTIONS_PATH}/${encodeURIComponent(id)}`,
    ).pipe(
      tap((data) => {
        this._subscriptionState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._subscriptionState.set({
          status: 'error',
          error: { code: 'SUBSCRIPTION_CANCEL_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Invoice methods
  // -------------------------------------------------------------------------

  loadInvoices(): Observable<Invoice[] | null> {
    this._invoiceState.set({ status: 'loading' });

    return this.bff.get<Invoice[]>(INVOICES_PATH).pipe(
      tap((invoices) => {
        this._invoiceState.set({ status: 'success', invoices });
      }),
      catchError((err: Error) => {
        this._invoiceState.set({
          status: 'error',
          error: { code: 'INVOICES_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Promo Code methods
  // -------------------------------------------------------------------------

  loadPromoCodes(): Observable<PromoCode[] | null> {
    this._promoCodeState.set({ status: 'loading' });

    return this.bff.get<PromoCode[]>(PROMO_CODES_PATH).pipe(
      tap((promo_codes) => {
        this._promoCodeState.set({ status: 'success', promo_codes });
      }),
      catchError((err: Error) => {
        this._promoCodeState.set({
          status: 'error',
          error: { code: 'PROMO_CODES_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  createPromoCode(
    data: Omit<PromoCode, 'id' | 'current_redemptions' | 'created_by'>,
  ): Observable<PromoCode | null> {
    return this.bff.post<PromoCode>(PROMO_CODES_PATH, data).pipe(
      tap((created) => {
        const current = this._promoCodeState();
        if (current.status === 'success') {
          this._promoCodeState.set({
            ...current,
            promo_codes: [...current.promo_codes, created],
          });
        }
      }),
      catchError((err: Error) => {
        this._promoCodeState.set({
          status: 'error',
          error: { code: 'PROMO_CODE_CREATE_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  revokePromoCode(id: string): Observable<PromoCode | null> {
    return this.bff.put<PromoCode>(
      `${PROMO_CODES_PATH}/${encodeURIComponent(id)}`,
      { is_active: false },
    ).pipe(
      tap((updated) => {
        const current = this._promoCodeState();
        if (current.status === 'success') {
          this._promoCodeState.set({
            ...current,
            promo_codes: current.promo_codes.map((pc) =>
              pc.id === id ? updated : pc,
            ),
          });
        }
      }),
      catchError((err: Error) => {
        this._promoCodeState.set({
          status: 'error',
          error: { code: 'PROMO_CODE_REVOKE_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  validatePromoCode(code: string): Observable<PromoCode | null> {
    return this.bff.post<PromoCode>(
      `${PROMO_CODES_PATH}/validate`,
      { code },
    ).pipe(
      catchError(() => of(null)),
    );
  }

  // -------------------------------------------------------------------------
  // Usage methods
  // -------------------------------------------------------------------------

  loadUsage(): Observable<UsageSummary[] | null> {
    this._usageState.set({ status: 'loading' });

    return this.bff.get<UsageSummary[]>(USAGE_PATH).pipe(
      tap((summaries) => {
        this._usageState.set({ status: 'success', summaries });
      }),
      catchError((err: Error) => {
        this._usageState.set({
          status: 'error',
          error: { code: 'USAGE_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // State reset
  // -------------------------------------------------------------------------

  resetState(): void {
    this._subscriptionState.set({ status: 'idle' });
    this._invoiceState.set({ status: 'idle' });
    this._promoCodeState.set({ status: 'idle' });
    this._usageState.set({ status: 'idle' });
  }
}
