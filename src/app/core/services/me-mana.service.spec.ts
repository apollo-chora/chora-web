import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { MeManaService, appendQueryParam } from './me-mana.service';
import { RealtimeChannelService } from '../realtime/realtime-channel.service';
import {
  hasEnoughMana,
  MANA_ACTION_COSTS,
  MANA_PACKS,
  recommendedManaPackSku,
} from './me-mana.model';
import type {
  InsufficientManaErrorResponse,
  ManaTopupRequest,
  ManaTopupResponse,
  UserMana,
} from './me-mana.model';

/**
 * MeManaService spec — `/api/v1/me/mana` + `/api/v1/me/mana/topup` per
 * `learner-economy.yaml`. Strict TDD per chora-web CLAUDE.md §6 —
 * `httpMock.verify()` in afterEach; exact-path assertion; success / 402
 * (with upsell) / 5xx / 401/403 / network branches; optimistic
 * debit/credit ledger semantics.
 */

function buildMana(overrides: Partial<UserMana> = {}): UserMana {
  return {
    gcid: '00000000-0000-7000-8000-000000001999',
    balance_units: 240,
    lifetime_earned: 1500,
    lifetime_spent: 1260,
    last_credited_at: '2026-05-10T12:00:00Z',
    subsidy_breakdown: [
      { units: 100, source: 'personal' },
      {
        units: 140,
        source: 'tenant_subsidy',
        tenant_id: '11111111-1111-7111-8111-111111111111',
        expires_at: '2026-06-01T00:00:00Z',
      },
    ],
    ...overrides,
  };
}

function buildTopupRequest(): ManaTopupRequest {
  return {
    amount_cents: 1000,
    currency: 'SGD',
    payment_method_id: 'pm_test_123',
  };
}

function buildTopupResponse(overrides: Partial<ManaTopupResponse> = {}): ManaTopupResponse {
  return {
    topup_id: 'topup-123',
    gcid: '00000000-0000-7000-8000-000000001999',
    units_credited: 100,
    charged_cents: 1000,
    currency: 'SGD',
    stripe_payment_intent_id: 'pi_test_xyz',
    ledger_entry_id: 'entry-xyz',
    recorded_at: '2026-05-15T11:00:00Z',
    ...overrides,
  };
}

function build402Body(overrides: Partial<InsufficientManaErrorResponse['error']> = {}): InsufficientManaErrorResponse {
  return {
    error: {
      code: 'insufficient_mana',
      message: 'Not enough mana',
      correlation_id: 'cid-abc',
      upsell: {
        required_units: 50,
        current_balance_units: 25,
        recommended_topup_units: 100,
      },
      ...overrides,
    },
  };
}

function setup(): { service: MeManaService; httpMock: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(MeManaService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('MeManaService — load()', () => {
  let service: MeManaService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ service, httpMock } = setup());
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('issues GET /api/v1/me/mana', () => {
    service.load();
    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/me/mana'));
    expect(req.request.method).toBe('GET');
    req.flush(buildMana());
  });

  it('starts in loading state before flush', () => {
    expect(service.loadState().status).toBe('loading');
    service.load();
    expect(service.loadState().status).toBe('loading');
    httpMock.expectOne((r) => r.url.includes('/api/v1/me/mana')).flush(buildMana());
  });

  it('transitions to success with real wire shape', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/mana'))
      .flush(buildMana({ balance_units: 999 }));
    const s = service.loadState();
    expect(s.status).toBe('success');
    if (s.status === 'success') {
      expect(s.mana.balance_units).toBe(999);
      expect(s.mana.subsidy_breakdown?.length).toBe(2);
    }
    expect(service.mana()?.balance_units).toBe(999);
    expect(service.balanceUnits()).toBe(999);
  });

  it('retains the last-known balance during a RE-load (stale-while-revalidate)', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/mana'))
      .flush(buildMana({ balance_units: 28742 }));
    expect(service.balanceUnits()).toBe(28742);

    // Post-spend refresh: balance must NOT flash to 0 while in flight.
    service.load();
    expect(service.loadState().status).toBe('loading');
    expect(service.balanceUnits()).toBe(28742);

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/mana'))
      .flush(buildMana({ balance_units: 28737 }));
    expect(service.balanceUnits()).toBe(28737);
  });

  it('mana() returns null while loading / on error', () => {
    expect(service.mana()).toBeNull();
    expect(service.balanceUnits()).toBe(0);
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/mana'))
      .flush(null, { status: 500, statusText: 'Internal Server Error' });
    expect(service.mana()).toBeNull();
  });

  it('maps 404 to error_not_found', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/mana'))
      .flush(null, { status: 404, statusText: 'Not Found' });
    const s = service.loadState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('core.mana.error_not_found');
    }
  });

  it('maps 5xx to error_upstream', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/mana'))
      .flush(null, { status: 502, statusText: 'Bad Gateway' });
    const s = service.loadState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('core.mana.error_upstream');
    }
  });

  it('maps 401/403 to error_unauthorised', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/mana'))
      .flush(null, { status: 403, statusText: 'Forbidden' });
    const s = service.loadState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('core.mana.error_unauthorised');
    }
  });

  it('load() is idempotent — re-call after error recovers', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/mana'))
      .flush(null, { status: 500, statusText: 'Internal Server Error' });
    expect(service.loadState().status).toBe('error');

    service.load();
    expect(service.loadState().status).toBe('loading');
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/mana'))
      .flush(buildMana());
    expect(service.loadState().status).toBe('success');
  });
});

describe('MeManaService — topup()', () => {
  let service: MeManaService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ service, httpMock } = setup());
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('issues POST /api/v1/me/mana/topup with the Idempotency-Key header', () => {
    service.topup(buildTopupRequest(), 'idem-key-abc');
    const req = httpMock.expectOne((r) => r.url.endsWith('/api/v1/me/mana/topup'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(buildTopupRequest());
    expect(req.request.headers.get('Idempotency-Key')).toBe('idem-key-abc');
    req.flush(buildTopupResponse());
  });

  it('transitions idle → submitting → success', () => {
    expect(service.topupState().status).toBe('idle');
    service.topup(buildTopupRequest(), 'key-1');
    expect(service.topupState().status).toBe('submitting');
    httpMock
      .expectOne((r) => r.url.endsWith('/api/v1/me/mana/topup'))
      .flush(buildTopupResponse({ units_credited: 200 }));
    const s = service.topupState();
    expect(s.status).toBe('success');
    if (s.status === 'success') {
      expect(s.result.units_credited).toBe(200);
    }
  });

  it('credits the optimistic balance on successful topup', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/mana'))
      .flush(buildMana({ balance_units: 50, lifetime_earned: 100 }));
    expect(service.balanceUnits()).toBe(50);

    service.topup(buildTopupRequest(), 'key-2');
    httpMock
      .expectOne((r) => r.url.endsWith('/api/v1/me/mana/topup'))
      .flush(buildTopupResponse({ units_credited: 100 }));
    expect(service.balanceUnits()).toBe(150);
    expect(service.mana()?.lifetime_earned).toBe(200);
  });

  it('surfaces 402 InsufficientManaErrorResponse as insufficient state with the upsell block', () => {
    service.topup(buildTopupRequest(), 'key-3');
    httpMock
      .expectOne((r) => r.url.endsWith('/api/v1/me/mana/topup'))
      .flush(build402Body(), { status: 402, statusText: 'Payment Required' });

    const s = service.topupState();
    expect(s.status).toBe('insufficient');
    if (s.status === 'insufficient') {
      expect(s.upsell.required_units).toBe(50);
      expect(s.upsell.current_balance_units).toBe(25);
      expect(s.upsell.recommended_topup_units).toBe(100);
      expect(s.message).toBe('Not enough mana');
    }
  });

  it('maps a 402 with NO upsell block to a generic error (defensive)', () => {
    service.topup(buildTopupRequest(), 'key-4');
    httpMock
      .expectOne((r) => r.url.endsWith('/api/v1/me/mana/topup'))
      .flush(
        { error: { code: 'insufficient_mana', message: 'no upsell' } },
        { status: 402, statusText: 'Payment Required' },
      );
    const s = service.topupState();
    expect(s.status).toBe('error');
  });

  it('maps 423 Locked to topup_error_locked', () => {
    service.topup(buildTopupRequest(), 'key-5');
    httpMock
      .expectOne((r) => r.url.endsWith('/api/v1/me/mana/topup'))
      .flush(null, { status: 423, statusText: 'Locked' });
    const s = service.topupState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('core.mana.topup_error_locked');
    }
  });

  it('maps 422 to topup_error_validation', () => {
    service.topup(buildTopupRequest(), 'key-6');
    httpMock
      .expectOne((r) => r.url.endsWith('/api/v1/me/mana/topup'))
      .flush(null, { status: 422, statusText: 'Unprocessable Entity' });
    const s = service.topupState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('core.mana.topup_error_validation');
    }
  });

  it('maps 5xx to topup_error_upstream', () => {
    service.topup(buildTopupRequest(), 'key-7');
    httpMock
      .expectOne((r) => r.url.endsWith('/api/v1/me/mana/topup'))
      .flush(null, { status: 502, statusText: 'Bad Gateway' });
    const s = service.topupState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('core.mana.topup_error_upstream');
    }
  });

  it('clearTopupState() resets to idle', () => {
    service.topup(buildTopupRequest(), 'key-8');
    httpMock
      .expectOne((r) => r.url.endsWith('/api/v1/me/mana/topup'))
      .flush(buildTopupResponse());
    expect(service.topupState().status).toBe('success');

    service.clearTopupState();
    expect(service.topupState().status).toBe('idle');
  });
});

describe('MeManaService — optimistic debit', () => {
  let service: MeManaService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ service, httpMock } = setup());
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('decrements the local balance on applyOptimisticDebit', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/mana'))
      .flush(buildMana({ balance_units: 100, lifetime_spent: 500 }));
    expect(service.balanceUnits()).toBe(100);

    service.applyOptimisticDebit(25);
    expect(service.balanceUnits()).toBe(75);
    expect(service.mana()?.lifetime_spent).toBe(525);
  });

  it('clamps to zero on over-spend (defensive)', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/mana'))
      .flush(buildMana({ balance_units: 10 }));
    service.applyOptimisticDebit(100);
    expect(service.balanceUnits()).toBe(0);
  });

  it('is a no-op when nothing is loaded yet', () => {
    service.applyOptimisticDebit(25);
    expect(service.mana()).toBeNull();
  });

  it('is a no-op for non-positive units', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/mana'))
      .flush(buildMana({ balance_units: 100 }));
    service.applyOptimisticDebit(0);
    service.applyOptimisticDebit(-5);
    expect(service.balanceUnits()).toBe(100);
  });
});

describe('hasEnoughMana() helper', () => {
  it('returns false when mana is null', () => {
    expect(hasEnoughMana(null, 'question_authoring_model_answer')).toBe(false);
  });

  it('returns true when balance ≥ action cost', () => {
    const mana = buildMana({ balance_units: 5 });
    expect(hasEnoughMana(mana, 'question_authoring_model_answer')).toBe(true);
  });

  it('returns false when balance < action cost', () => {
    const mana = buildMana({ balance_units: 4 });
    expect(hasEnoughMana(mana, 'question_authoring_model_answer')).toBe(false);
  });

  it('uses the per-action cost from MANA_ACTION_COSTS', () => {
    const mana = buildMana({ balance_units: 9 });
    expect(hasEnoughMana(mana, 'question_authoring_model_answer')).toBe(true); // 9 ≥ 5
    expect(hasEnoughMana(mana, 'question_authoring_ai_draft')).toBe(false); // 9 < 10
    expect(MANA_ACTION_COSTS.question_authoring_model_answer).toBe(5);
    expect(MANA_ACTION_COSTS.question_authoring_ai_draft).toBe(10);
    expect(MANA_ACTION_COSTS.question_authoring_batch_parse).toBe(50);
    expect(MANA_ACTION_COSTS.question_authoring_batch_per_item).toBe(5);
  });
});

describe('MeManaService — checkoutMana()', () => {
  let service: MeManaService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ service, httpMock } = setup());
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('POSTs /api/v1/checkout/user-mana with sku + return URLs, then redirects to Stripe', () => {
    const redirectSpy = vi
      .spyOn(service as unknown as { redirectTo(u: string): void }, 'redirectTo')
      .mockImplementation(() => { /* noop */ });
    vi.spyOn(
      service as unknown as { currentUrl(): string },
      'currentUrl',
    ).mockReturnValue('https://chora.site/aplus');

    service.checkoutMana('mana_pack_5000');
    expect(service.checkoutState().status).toBe('submitting');

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/checkout/user-mana'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      sku: 'mana_pack_5000',
      // success_url carries the marker the wallet view polls on after Stripe return.
      success_url: 'https://chora.site/aplus?mana_topup=success',
      cancel_url: 'https://chora.site/aplus',
    });
    req.flush({
      purchase_id: 'umt-1',
      stripe_session_id: 'cs_test_1',
      stripe_checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_1',
      state: 'checkout_started',
    });

    expect(redirectSpy).toHaveBeenCalledWith(
      'https://checkout.stripe.com/c/pay/cs_test_1',
    );
    const s = service.checkoutState();
    expect(s.status).toBe('redirecting');
    if (s.status === 'redirecting') {
      expect(s.checkoutUrl).toContain('checkout.stripe.com');
    }
  });

  it('does NOT redirect + surfaces error state on 503 (catalogue unconfigured)', () => {
    const redirectSpy = vi
      .spyOn(service as unknown as { redirectTo(u: string): void }, 'redirectTo')
      .mockImplementation(() => { /* noop */ });

    service.checkoutMana('mana_pack_5000');
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/checkout/user-mana'))
      .flush(
        { error: { code: 'GATEWAY_UPSTREAM_UNAVAILABLE' } },
        { status: 503, statusText: 'Service Unavailable' },
      );

    expect(redirectSpy).not.toHaveBeenCalled();
    expect(service.checkoutState().status).toBe('error');
  });
});

describe('recommendedManaPackSku()', () => {
  it('picks the smallest pack covering the gap', () => {
    expect(recommendedManaPackSku(500)).toBe('mana_pack_1000');
    expect(recommendedManaPackSku(1000)).toBe('mana_pack_1000');
    expect(recommendedManaPackSku(1001)).toBe('mana_pack_5000');
    expect(recommendedManaPackSku(5000)).toBe('mana_pack_5000');
    expect(recommendedManaPackSku(5001)).toBe('mana_pack_20000');
  });

  it('falls back to the largest pack when no single pack covers the gap', () => {
    expect(recommendedManaPackSku(999_999)).toBe('mana_pack_20000');
  });

  it('covers a zero gap with the smallest pack', () => {
    expect(recommendedManaPackSku(0)).toBe('mana_pack_1000');
    // sanity: the static catalogue mirrors the three SKUs used above
    expect(MANA_PACKS.map((p) => p.sku)).toEqual([
      'mana_pack_1000',
      'mana_pack_5000',
      'mana_pack_20000',
    ]);
  });
});

describe('MeManaService — load() error fallback', () => {
  let service: MeManaService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ service, httpMock } = setup());
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('maps a network error (status 0, no HTTP status code) to error_generic', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/mana'))
      .error(new ProgressEvent('Network error'));
    const s = service.loadState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      // status 0 is not 404 / >=500 / 401 / 403 → generic fallback
      expect(s.error).toBe('core.mana.error_generic');
    }
  });

  it('maps an unmatched 4xx (e.g. 418) to error_generic', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/mana'))
      .flush(null, { status: 418, statusText: "I'm a teapot" });
    const s = service.loadState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('core.mana.error_generic');
    }
  });
});

describe('MeManaService — topup() error fallback branches', () => {
  let service: MeManaService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ service, httpMock } = setup());
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('maps 401/403 to topup_error_unauthorised', () => {
    service.topup(buildTopupRequest(), 'key-401');
    httpMock
      .expectOne((r) => r.url.endsWith('/api/v1/me/mana/topup'))
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    const s = service.topupState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('core.mana.topup_error_unauthorised');
    }
  });

  it('maps an unmatched status (e.g. 400) to topup_error_generic', () => {
    service.topup(buildTopupRequest(), 'key-400');
    httpMock
      .expectOne((r) => r.url.endsWith('/api/v1/me/mana/topup'))
      .flush(null, { status: 400, statusText: 'Bad Request' });
    const s = service.topupState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('core.mana.topup_error_generic');
    }
  });

  it('maps a network error (no status) to topup_error_generic', () => {
    service.topup(buildTopupRequest(), 'key-net');
    httpMock
      .expectOne((r) => r.url.endsWith('/api/v1/me/mana/topup'))
      .error(new ProgressEvent('Network error'));
    const s = service.topupState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('core.mana.topup_error_generic');
    }
  });

  it('does NOT credit the optimistic balance on a failed topup', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/mana'))
      .flush(buildMana({ balance_units: 50, lifetime_earned: 100 }));

    service.topup(buildTopupRequest(), 'key-fail');
    httpMock
      .expectOne((r) => r.url.endsWith('/api/v1/me/mana/topup'))
      .flush(null, { status: 502, statusText: 'Bad Gateway' });

    // balance untouched — credit only fires on success
    expect(service.balanceUnits()).toBe(50);
    expect(service.mana()?.lifetime_earned).toBe(100);
  });

  it('credits nothing when topup succeeds but no balance is loaded yet (no-op credit)', () => {
    // no load() — mana() is null, applyOptimisticCredit short-circuits
    service.topup(buildTopupRequest(), 'key-nocredit');
    httpMock
      .expectOne((r) => r.url.endsWith('/api/v1/me/mana/topup'))
      .flush(buildTopupResponse({ units_credited: 100 }));
    expect(service.topupState().status).toBe('success');
    expect(service.mana()).toBeNull();
    expect(service.balanceUnits()).toBe(0);
  });

  it('credits nothing when units_credited is zero (no-op credit guard)', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/mana'))
      .flush(buildMana({ balance_units: 50, lifetime_earned: 100 }));

    service.topup(buildTopupRequest(), 'key-zero');
    httpMock
      .expectOne((r) => r.url.endsWith('/api/v1/me/mana/topup'))
      .flush(buildTopupResponse({ units_credited: 0 }));

    expect(service.balanceUnits()).toBe(50);
    expect(service.mana()?.lifetime_earned).toBe(100);
  });
});

describe('MeManaService — checkoutMana() error + edge branches', () => {
  let service: MeManaService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ service, httpMock } = setup());
  });

  afterEach(() => {
    httpMock.verify();
  });

  function flushCheckout(status: number, statusText: string): void {
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/checkout/user-mana'))
      .flush({ error: { code: 'x' } }, { status, statusText });
  }

  it('maps 400 to checkout_error_validation', () => {
    vi.spyOn(
      service as unknown as { redirectTo(u: string): void },
      'redirectTo',
    ).mockImplementation(() => { /* noop */ });
    service.checkoutMana('mana_pack_5000');
    flushCheckout(400, 'Bad Request');
    const s = service.checkoutState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('core.mana.checkout_error_validation');
    }
  });

  it('maps 503 to checkout_error_unavailable', () => {
    service.checkoutMana('mana_pack_5000');
    flushCheckout(503, 'Service Unavailable');
    const s = service.checkoutState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('core.mana.checkout_error_unavailable');
    }
  });

  it('maps a non-503 5xx to checkout_error_upstream', () => {
    service.checkoutMana('mana_pack_5000');
    flushCheckout(500, 'Internal Server Error');
    const s = service.checkoutState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('core.mana.checkout_error_upstream');
    }
  });

  it('maps 401/403 to checkout_error_unauthorised', () => {
    service.checkoutMana('mana_pack_5000');
    flushCheckout(403, 'Forbidden');
    const s = service.checkoutState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('core.mana.checkout_error_unauthorised');
    }
  });

  it('maps a network error (no status) to checkout_error_generic', () => {
    service.checkoutMana('mana_pack_5000');
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/checkout/user-mana'))
      .error(new ProgressEvent('Network error'));
    const s = service.checkoutState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('core.mana.checkout_error_generic');
    }
  });

  it('stashes the pre-top-up balance in sessionStorage before redirecting', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    vi.spyOn(
      service as unknown as { redirectTo(u: string): void },
      'redirectTo',
    ).mockImplementation(() => { /* noop */ });
    vi.spyOn(
      service as unknown as { currentUrl(): string },
      'currentUrl',
    ).mockReturnValue('https://chora.site/aplus');

    // load a balance so balanceUnits() is non-zero
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/mana'))
      .flush(buildMana({ balance_units: 240 }));

    service.checkoutMana('mana_pack_5000');
    expect(setItemSpy).toHaveBeenCalledWith('chora.mana.preTopup', '240');

    httpMock.expectOne((r) => r.url.includes('/api/v1/checkout/user-mana')).flush({
      purchase_id: 'umt-1',
      stripe_session_id: 'cs_1',
      stripe_checkout_url: 'https://checkout.stripe.com/c/pay/cs_1',
      state: 'checkout_started',
    });
    setItemSpy.mockRestore();
  });

  it('tolerates sessionStorage failures (private mode / SSR) and still redirects', () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });
    const redirectSpy = vi
      .spyOn(service as unknown as { redirectTo(u: string): void }, 'redirectTo')
      .mockImplementation(() => { /* noop */ });
    vi.spyOn(
      service as unknown as { currentUrl(): string },
      'currentUrl',
    ).mockReturnValue('https://chora.site/aplus');

    service.checkoutMana('mana_pack_5000');
    httpMock.expectOne((r) => r.url.includes('/api/v1/checkout/user-mana')).flush({
      purchase_id: 'umt-2',
      stripe_session_id: 'cs_2',
      stripe_checkout_url: 'https://checkout.stripe.com/c/pay/cs_2',
      state: 'checkout_started',
    });

    expect(redirectSpy).toHaveBeenCalledWith(
      'https://checkout.stripe.com/c/pay/cs_2',
    );
    setItemSpy.mockRestore();
  });

  it('does NOT redirect when the 200 response carries an empty checkout URL', () => {
    const redirectSpy = vi
      .spyOn(service as unknown as { redirectTo(u: string): void }, 'redirectTo')
      .mockImplementation(() => { /* noop */ });
    vi.spyOn(
      service as unknown as { currentUrl(): string },
      'currentUrl',
    ).mockReturnValue('https://chora.site/aplus');

    service.checkoutMana('mana_pack_5000');
    httpMock.expectOne((r) => r.url.includes('/api/v1/checkout/user-mana')).flush({
      purchase_id: 'umt-3',
      stripe_session_id: 'cs_3',
      stripe_checkout_url: '',
      state: 'checkout_started',
    });

    // state flips to redirecting (mapped off the response), but the empty
    // URL guard short-circuits the actual window redirect.
    const s = service.checkoutState();
    expect(s.status).toBe('redirecting');
    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it('clearCheckoutState() resets to idle', () => {
    vi.spyOn(
      service as unknown as { redirectTo(u: string): void },
      'redirectTo',
    ).mockImplementation(() => { /* noop */ });
    vi.spyOn(
      service as unknown as { currentUrl(): string },
      'currentUrl',
    ).mockReturnValue('https://chora.site/aplus');

    service.checkoutMana('mana_pack_5000');
    httpMock.expectOne((r) => r.url.includes('/api/v1/checkout/user-mana')).flush({
      purchase_id: 'umt-4',
      stripe_session_id: 'cs_4',
      stripe_checkout_url: 'https://checkout.stripe.com/c/pay/cs_4',
      state: 'checkout_started',
    });
    expect(service.checkoutState().status).toBe('redirecting');

    service.clearCheckoutState();
    expect(service.checkoutState().status).toBe('idle');
  });
});

describe('MeManaService — real redirectTo / currentUrl bodies', () => {
  let service: MeManaService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ service, httpMock } = setup());
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('uses the real currentUrl() (jsdom window.location.href) for the return URLs', () => {
    // Do NOT spy currentUrl — exercise the real `typeof window !== "undefined"`
    // true arm that reads window.location.href.
    const redirectSpy = vi
      .spyOn(service as unknown as { redirectTo(u: string): void }, 'redirectTo')
      .mockImplementation(() => { /* noop */ });

    const here = window.location.href; // jsdom default origin
    service.checkoutMana('mana_pack_5000');

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/checkout/user-mana'));
    const body = req.request.body as { cancel_url: string; success_url: string };
    // cancel_url is the verbatim current URL; success_url is it + the marker.
    expect(body.cancel_url).toBe(here);
    expect(body.success_url).toBe(appendQueryParam(here, 'mana_topup', 'success'));
    req.flush({
      purchase_id: 'umt-real',
      stripe_session_id: 'cs_real',
      stripe_checkout_url: 'https://checkout.stripe.com/c/pay/cs_real',
      state: 'checkout_started',
    });
    expect(redirectSpy).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_real');
  });

  it('drives the real redirectTo() body — sets window.location.href on a 200', () => {
    // Do NOT spy redirectTo — exercise the real `if (typeof window !== "undefined")`
    // true arm. Override window.location with a writable href so jsdom does not
    // attempt a real (unimplemented) navigation.
    const original = window.location;
    let assigned = '';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...original,
        get href() {
          return assigned || original.href;
        },
        set href(v: string) {
          assigned = v;
        },
      },
    });
    try {
      service.checkoutMana('mana_pack_5000');
      httpMock.expectOne((r) => r.url.includes('/api/v1/checkout/user-mana')).flush({
        purchase_id: 'umt-loc',
        stripe_session_id: 'cs_loc',
        stripe_checkout_url: 'https://checkout.stripe.com/c/pay/cs_loc',
        state: 'checkout_started',
      });
      expect(assigned).toBe('https://checkout.stripe.com/c/pay/cs_loc');
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: original,
      });
    }
  });
});

describe('MeManaService — toTopupErrorState 402 message fallback', () => {
  let service: MeManaService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ service, httpMock } = setup());
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('falls back to the default message when a 402 upsell carries no message', () => {
    // 402 with an upsell block but message omitted → `message ?? default` falsy arm.
    service.topup(buildTopupRequest(), 'key-no-msg');
    httpMock.expectOne((r) => r.url.endsWith('/api/v1/me/mana/topup')).flush(
      {
        error: {
          code: 'insufficient_mana',
          upsell: {
            required_units: 80,
            current_balance_units: 10,
            recommended_topup_units: 1000,
          },
        },
      },
      { status: 402, statusText: 'Payment Required' },
    );
    const s = service.topupState();
    expect(s.status).toBe('insufficient');
    if (s.status === 'insufficient') {
      expect(s.upsell.required_units).toBe(80);
      expect(s.message).toBe('core.mana.error_insufficient_default');
    }
  });

  it('treats a 402 with NO error body as a generic top-up error (e.error ?? {} nullish arm)', () => {
    // 402 but the parsed error body itself is null/absent → `e.error ?? {}` falls
    // back to {}, upsell is undefined, drops through to topupErrorKey → generic.
    service.topup(buildTopupRequest(), 'key-no-body');
    httpMock
      .expectOne((r) => r.url.endsWith('/api/v1/me/mana/topup'))
      .flush(null, { status: 402, statusText: 'Payment Required' });
    const s = service.topupState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('core.mana.topup_error_generic');
    }
  });
});

describe('appendQueryParam()', () => {
  it('appends to an absolute URL with no existing query', () => {
    expect(appendQueryParam('https://chora.site/aplus', 'mana_topup', 'success')).toBe(
      'https://chora.site/aplus?mana_topup=success',
    );
  });

  it('merges with an existing query and preserves the hash on an absolute URL', () => {
    const out = appendQueryParam(
      'https://chora.site/aplus?foo=bar#frag',
      'mana_topup',
      'success',
    );
    expect(out).toContain('foo=bar');
    expect(out).toContain('mana_topup=success');
    expect(out).toContain('#frag');
  });

  it('overwrites a duplicate key rather than appending it twice', () => {
    const out = appendQueryParam(
      'https://chora.site/aplus?mana_topup=old',
      'mana_topup',
      'success',
    );
    expect(out).toBe('https://chora.site/aplus?mana_topup=success');
    expect(out).not.toContain('old');
  });

  it('re-emits a relative path for a relative input (no origin leaked)', () => {
    const out = appendQueryParam('/aplus/wallet', 'mana_topup', 'success');
    expect(out).toBe('/aplus/wallet?mana_topup=success');
    expect(out).not.toContain('https://');
  });

  it('preserves an existing query + hash on a relative input', () => {
    const out = appendQueryParam('/aplus?x=1#h', 'mana_topup', 'success');
    expect(out).toContain('x=1');
    expect(out).toContain('mana_topup=success');
    expect(out).toContain('#h');
    expect(out).not.toContain('https://');
  });
});

describe('MeManaService — connectRealtime() (ADR-183)', () => {
  let service: MeManaService;
  let httpMock: HttpTestingController;
  let realtime: RealtimeChannelService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ service, httpMock } = setup());
    realtime = TestBed.inject(RealtimeChannelService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('re-fetches the balance on a mana.balance.changed push', () => {
    service.connectRealtime();
    httpMock.expectNone((r) => r.url.includes('/api/v1/me/mana')); // not on wire-up

    realtime.emit({
      topic: 'mana.balance.changed',
      occurred_at: 't',
      payload: { reason: 'credit', ledger_seq: 1 },
    });

    httpMock
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/v1/me/mana'))
      .flush(buildMana({ balance_units: 321 }));
    expect(service.balanceUnits()).toBe(321);
  });

  it('is idempotent — a second connectRealtime() does not double-wire the reload', () => {
    service.connectRealtime();
    service.connectRealtime(); // no-op

    realtime.emit({
      topic: 'mana.balance.changed',
      occurred_at: 't',
      payload: { reason: 'debit', ledger_seq: 2 },
    });

    // Exactly ONE reload, not two.
    const reqs = httpMock.match((r) => r.url.includes('/api/v1/me/mana'));
    expect(reqs.length).toBe(1);
    reqs[0].flush(buildMana());
  });
});

