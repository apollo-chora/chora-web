import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { BillingService } from './billing.service';
import type {
  PromoCode,
  Subscription,
  UsageSummary,
} from '../models/billing.model';

describe('BillingService', () => {
  let service: BillingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BillingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loadSubscription', () => {
    it('should set loading then success state', () => {
      const mockSub = { id: 'sub-1', plan_id: 'plan-1', status: 'active', cancel_at_period_end: false };

      service.loadSubscription().subscribe();
      expect(service.subscriptionState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/subscriptions'));
      expect(req.request.method).toBe('GET');
      req.flush(mockSub);

      expect(service.subscriptionState().status).toBe('success');
      expect(service.subscription()).toEqual(mockSub);
    });

    it('should set error state on failure', () => {
      service.loadSubscription().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/subscriptions'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.subscriptionState().status).toBe('error');
    });
  });

  describe('createSubscription', () => {
    it('should POST and set success state', () => {
      const mockSub = { id: 'sub-1', plan_id: 'plan-1', status: 'active' };

      service.createSubscription('plan-1').subscribe();
      expect(service.subscriptionState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/subscriptions') && r.method === 'POST');
      expect(req.request.body).toEqual({ plan_id: 'plan-1' });
      req.flush(mockSub);

      expect(service.subscriptionState().status).toBe('success');
    });
  });

  describe('updateSubscription', () => {
    it('should PUT and set success state', () => {
      service.updateSubscription('sub-1', 'plan-2').subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/subscriptions/sub-1') && r.method === 'PUT');
      expect(req.request.body).toEqual({ plan_id: 'plan-2' });
      req.flush({ id: 'sub-1', plan_id: 'plan-2', status: 'active' });

      expect(service.subscriptionState().status).toBe('success');
    });
  });

  describe('cancelSubscription', () => {
    it('should DELETE and set success state', () => {
      service.cancelSubscription('sub-1').subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/subscriptions/sub-1') && r.method === 'DELETE');
      req.flush({ id: 'sub-1', status: 'cancelled' });

      expect(service.subscriptionState().status).toBe('success');
    });

    it('should set error state on failure', () => {
      service.cancelSubscription('sub-1').subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/subscriptions/sub-1'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.subscriptionState().status).toBe('error');
    });
  });

  describe('loadInvoices', () => {
    it('should set loading then success state', () => {
      const mockInvoices = [{ id: 'inv-1', amount_cents: 1000, currency: 'usd', status: 'paid' }];

      service.loadInvoices().subscribe();
      expect(service.invoiceState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/invoices'));
      req.flush(mockInvoices);

      expect(service.invoiceState().status).toBe('success');
      expect(service.invoices()).toEqual(mockInvoices);
    });
  });

  describe('loadPromoCodes', () => {
    it('should set loading then success state', () => {
      const mockCodes = [{ id: 'pc-1', code: 'SAVE10', is_active: true }];

      service.loadPromoCodes().subscribe();
      expect(service.promoCodeState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/promo-codes'));
      req.flush(mockCodes);

      expect(service.promoCodeState().status).toBe('success');
      expect(service.promoCodes()).toEqual(mockCodes);
    });
  });

  describe('createPromoCode', () => {
    it('should POST and append to existing promo codes', () => {
      // First load existing codes
      service.loadPromoCodes().subscribe();
      const loadReq = httpMock.expectOne(r => r.url.includes('/api/v1/billing/promo-codes') && r.method === 'GET');
      loadReq.flush([{ id: 'pc-1', code: 'SAVE10', is_active: true }]);

      const newCode = { code: 'SAVE20', discount_type: 'percentage' as const, discount_value: 20, max_redemptions: 100, valid_from: '2026-01-01', valid_until: '2026-12-31', is_active: true };

      service.createPromoCode(newCode).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/promo-codes') && r.method === 'POST');
      req.flush({ id: 'pc-2', ...newCode, current_redemptions: 0, created_by: 'admin' });

      expect(service.promoCodes().length).toBe(2);
    });
  });

  describe('revokePromoCode', () => {
    it('should PUT to revoke a promo code', () => {
      // First load existing codes
      service.loadPromoCodes().subscribe();
      const loadReq = httpMock.expectOne(r => r.url.includes('/api/v1/billing/promo-codes') && r.method === 'GET');
      loadReq.flush([{ id: 'pc-1', code: 'SAVE10', is_active: true }]);

      service.revokePromoCode('pc-1').subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/promo-codes/pc-1') && r.method === 'PUT');
      expect(req.request.body).toEqual({ is_active: false });
      req.flush({ id: 'pc-1', code: 'SAVE10', is_active: false });

      expect(service.promoCodes()[0].is_active).toBe(false);
    });
  });

  describe('validatePromoCode', () => {
    it('should POST to validate a code', () => {
      service.validatePromoCode('SAVE10').subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/promo-codes/validate') && r.method === 'POST');
      expect(req.request.body).toEqual({ code: 'SAVE10' });
      req.flush({ id: 'pc-1', code: 'SAVE10', is_active: true });
    });
  });

  describe('loadUsage', () => {
    it('should set loading then success state', () => {
      const mockUsage = [{ resource_type: 'api_calls', current_usage: 50, limit: 100, unit: 'calls' }];

      service.loadUsage().subscribe();
      expect(service.usageState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/usage'));
      req.flush(mockUsage);

      expect(service.usageState().status).toBe('success');
    });
  });

  describe('resetState', () => {
    it('should reset all states to idle', () => {
      service.loadSubscription().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/billing/subscriptions')).flush({ id: 'sub-1' });

      service.resetState();

      expect(service.subscriptionState().status).toBe('idle');
      expect(service.invoiceState().status).toBe('idle');
      expect(service.promoCodeState().status).toBe('idle');
      expect(service.usageState().status).toBe('idle');
    });
  });

  describe('computed signals', () => {
    it('activePromoCodes should filter by is_active', () => {
      service.loadPromoCodes().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/promo-codes'));
      req.flush([
        { id: 'pc-1', code: 'SAVE10', is_active: true },
        { id: 'pc-2', code: 'OLD20', is_active: false },
      ]);

      expect(service.activePromoCodes().length).toBe(1);
      expect(service.activePromoCodes()[0].code).toBe('SAVE10');
    });
  });

  // -------------------------------------------------------------------------
  // Error branches — every load/mutation fails soft to `null` + an error state
  // with the canonical error code (computed projections degrade to [] / null).
  // -------------------------------------------------------------------------
  describe('error branches', () => {
    it('createSubscription maps 5xx to error state with SUBSCRIPTION_CREATE_FAILED and emits null', () => {
      let emitted: Subscription | null | undefined;
      service.createSubscription('plan-1').subscribe((v) => (emitted = v));
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/subscriptions') && r.method === 'POST');
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(emitted).toBeNull();
      const s = service.subscriptionState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error.code).toBe('SUBSCRIPTION_CREATE_FAILED');
    });

    it('updateSubscription maps 5xx to error state with SUBSCRIPTION_UPDATE_FAILED and emits null', () => {
      let emitted: Subscription | null | undefined;
      service.updateSubscription('sub-1', 'plan-2').subscribe((v) => (emitted = v));
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/subscriptions/sub-1') && r.method === 'PUT');
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(emitted).toBeNull();
      const s = service.subscriptionState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error.code).toBe('SUBSCRIPTION_UPDATE_FAILED');
    });

    it('loadInvoices maps 5xx to error state with INVOICES_LOAD_FAILED and degrades invoices() to []', () => {
      service.loadInvoices().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/invoices'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      const s = service.invoiceState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error.code).toBe('INVOICES_LOAD_FAILED');
      expect(service.invoices()).toEqual([]);
    });

    it('loadPromoCodes maps 5xx to error state with PROMO_CODES_LOAD_FAILED and degrades promoCodes() to []', () => {
      service.loadPromoCodes().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/promo-codes'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      const s = service.promoCodeState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error.code).toBe('PROMO_CODES_LOAD_FAILED');
      expect(service.promoCodes()).toEqual([]);
    });

    it('createPromoCode maps 5xx to error state with PROMO_CODE_CREATE_FAILED and emits null', () => {
      let emitted: PromoCode | null | undefined;
      service.createPromoCode({
        code: 'SAVE20',
        discount_type: 'percentage',
        discount_value: 20,
        max_redemptions: 100,
        valid_from: '2026-01-01',
        valid_until: '2026-12-31',
        is_active: true,
      }).subscribe((v) => (emitted = v));
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/promo-codes') && r.method === 'POST');
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(emitted).toBeNull();
      const s = service.promoCodeState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error.code).toBe('PROMO_CODE_CREATE_FAILED');
    });

    it('revokePromoCode maps 5xx to error state with PROMO_CODE_REVOKE_FAILED and emits null', () => {
      let emitted: PromoCode | null | undefined;
      service.revokePromoCode('pc-1').subscribe((v) => (emitted = v));
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/promo-codes/pc-1') && r.method === 'PUT');
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(emitted).toBeNull();
      const s = service.promoCodeState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error.code).toBe('PROMO_CODE_REVOKE_FAILED');
    });

    it('validatePromoCode swallows failures and emits null (validation is best-effort)', () => {
      let emitted: PromoCode | null | undefined;
      service.validatePromoCode('SAVE10').subscribe((v) => (emitted = v));
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/promo-codes/validate') && r.method === 'POST');
      req.flush('Error', { status: 400, statusText: 'Bad Request' });
      expect(emitted).toBeNull();
    });

    it('loadUsage maps 5xx to error state with USAGE_LOAD_FAILED and degrades usageSummaries() to []', () => {
      service.loadUsage().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/usage'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      const s = service.usageState();
      expect(s.status).toBe('error');
      if (s.status === 'error') expect(s.error.code).toBe('USAGE_LOAD_FAILED');
      expect(service.usageSummaries()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // State-preserving taps — the append/update tap only mutates when a
  // prior successful list was loaded; without one the state stays untouched.
  // -------------------------------------------------------------------------
  describe('state-preserving promo taps', () => {
    it('createPromoCode does not touch promoCodeState when no list was loaded', () => {
      service.createPromoCode({
        code: 'SAVE20',
        discount_type: 'percentage',
        discount_value: 20,
        max_redemptions: 100,
        valid_from: '2026-01-01',
        valid_until: '2026-12-31',
        is_active: true,
      }).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/promo-codes') && r.method === 'POST');
      req.flush({
        id: 'pc-2',
        code: 'SAVE20',
        discount_type: 'percentage',
        discount_value: 20,
        max_redemptions: 100,
        current_redemptions: 0,
        valid_from: '2026-01-01',
        valid_until: '2026-12-31',
        is_active: true,
        created_by: 'admin',
      });
      expect(service.promoCodeState().status).toBe('idle');
      expect(service.promoCodes()).toEqual([]);
    });

    it('revokePromoCode does not touch promoCodeState when no list was loaded', () => {
      service.revokePromoCode('pc-1').subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/promo-codes/pc-1') && r.method === 'PUT');
      req.flush({
        id: 'pc-1',
        code: 'SAVE10',
        discount_type: 'percentage',
        discount_value: 10,
        max_redemptions: 100,
        current_redemptions: 0,
        valid_from: '2026-01-01',
        valid_until: '2026-12-31',
        is_active: false,
        created_by: 'admin',
      });
      expect(service.promoCodeState().status).toBe('idle');
      expect(service.promoCodes()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // usageSummaries computed projection
  // -------------------------------------------------------------------------
  describe('usageSummaries computed', () => {
    it('returns [] before any load', () => {
      expect(service.usageSummaries()).toEqual([]);
    });

    it('returns the summaries after a successful load', () => {
      const mockUsage: UsageSummary = {
        resource_type: 'api_calls',
        current_usage: 50,
        limit: 100,
        unit: 'calls',
        period_start: '2026-06-01',
        period_end: '2026-06-30',
        overage_rate_cents: 10,
      };
      service.loadUsage().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/billing/usage'));
      req.flush([mockUsage]);
      expect(service.usageSummaries()).toEqual([mockUsage]);
    });
  });
});
