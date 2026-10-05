/**
 * TenantManaAdminService spec — TDD RED for the L1 Tenant lane
 * (CHO-1709 WP-4): H+ tenant mana-pool read + create-if-absent +
 * monthly auto-renew quota + Stripe top-up checkout, against the
 * gateway proxies. Mirrors tenant-members-admin.service.spec.ts
 * (HttpTestingController against the canonical BFF URL;
 * httpMock.verify() in afterEach per chora-web/CLAUDE.md §6).
 *
 * Error envelopes vary by upstream: tenancy v2 emits the NESTED
 * `{"error":{"code","message"}}` shape while the gateway's own errors
 * are FLAT `{code,message}` — classify() must tolerate both
 * (`body.error?.code ?? body.code`). Both shapes are exercised below.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { firstValueFrom, throwError } from 'rxjs';

import { TenantManaAdminService } from './tenant-mana-admin.service';
import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  ADMIN_TENANT_MANA_POOL_AUTO_RENEW_PATH,
  ADMIN_TENANT_MANA_POOL_PATH,
  CHECKOUT_MANA_TOPUP_PATH,
  ManaTopUpPack,
  TenantManaPool,
} from '../models/tenant-mana-admin.model';
import { environment } from '../../../../../environments/environment';
import { errorInterceptor } from '../../../../core/interceptors/error.interceptor';

const POOL_URL = `${environment.bffBaseUrl}${ADMIN_TENANT_MANA_POOL_PATH}`;
const AUTO_RENEW_URL = `${environment.bffBaseUrl}${ADMIN_TENANT_MANA_POOL_AUTO_RENEW_PATH}`;
const CHECKOUT_URL = `${environment.bffBaseUrl}${CHECKOUT_MANA_TOPUP_PATH}`;

const mtmPool: TenantManaPool = {
  pool_id: '00000000-0000-7000-8000-00000000a001',
  tenant_id: '00000000-0000-7000-8000-0000000000t1',
  balance_units: 12500,
  monthly_topup_units: 1000,
  lifetime_topped_up_units: 40000,
  lifetime_allocated_units: 27500,
  version: 7,
  created_at: '2026-06-01T08:00:00Z',
  last_topped_up_at: '2026-06-08T03:30:00Z',
  low_balance_threshold: 500,
  is_low_balance: false,
};

const pack: ManaTopUpPack = {
  sku: 'tenant-mana-5000',
  mana_units: 5000,
  amount_cents: 799,
  currency: 'SGD',
};

function setup(): {
  service: TenantManaAdminService;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(TenantManaAdminService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('TenantManaAdminService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  // ── pool() — GET the tenant mana pool ──────────────────────────────

  it('pool() GETs the mana-pool resource and surfaces the DTO', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.pool());
    const req = httpMock.expectOne(POOL_URL);
    expect(req.request.method).toBe('GET');
    req.flush(mtmPool);
    const res = await p;
    expect(res.kind).toBe('success');
    if (res.kind === 'success') {
      expect(res.pool.pool_id).toBe(mtmPool.pool_id);
      expect(res.pool.balance_units).toBe(12500);
      expect(res.pool.is_low_balance).toBe(false);
    }
  });

  it('pool() maps 404 to no-pool (create CTA, NOT an error)', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.pool());
    httpMock.expectOne(POOL_URL).flush(
      { error: { code: 'TENANCY_MANA_POOL_NOT_FOUND', message: 'no pool' } },
      { status: 404, statusText: 'Not Found' },
    );
    expect((await p).kind).toBe('no-pool');
  });

  it('pool() maps 401 to error carrying the FLAT gateway envelope code', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.pool());
    httpMock.expectOne(POOL_URL).flush(
      { code: 'GATEWAY_UNAUTHENTICATED', message: 'session expired' },
      { status: 401, statusText: 'Unauthorized' },
    );
    const res = await p;
    expect(res.kind).toBe('error');
    if (res.kind === 'error') expect(res.code).toBe('GATEWAY_UNAUTHENTICATED');
  });

  it('pool() maps 5xx to error carrying the NESTED tenancy-v2 envelope code', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.pool());
    httpMock.expectOne(POOL_URL).flush(
      { error: { code: 'TENANCY_POOL_STORE_DOWN', message: 'pg down' } },
      { status: 500, statusText: 'Internal Server Error' },
    );
    const res = await p;
    expect(res.kind).toBe('error');
    if (res.kind === 'error') expect(res.code).toBe('TENANCY_POOL_STORE_DOWN');
  });

  it('pool() falls back to an HTTP_{status} code when the body has no code', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.pool());
    httpMock
      .expectOne(POOL_URL)
      .flush('upstream timeout', { status: 503, statusText: 'Service Unavailable' });
    const res = await p;
    expect(res.kind).toBe('error');
    if (res.kind === 'error') expect(res.code).toBe('HTTP_503');
  });

  it('pool() maps a transport failure to error with NETWORK_ERROR', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.pool());
    httpMock.expectOne(POOL_URL).error(new ProgressEvent('error'));
    const res = await p;
    expect(res.kind).toBe('error');
    if (res.kind === 'error') expect(res.code).toBe('NETWORK_ERROR');
  });

  // ── create() — POST create-if-absent ───────────────────────────────

  it('create() POSTs an empty body and surfaces the 201 pool DTO', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.create());
    const req = httpMock.expectOne(POOL_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ ...mtmPool, balance_units: 0 }, { status: 201, statusText: 'Created' });
    const res = await p;
    expect(res.kind).toBe('success');
    if (res.kind === 'success') expect(res.pool.balance_units).toBe(0);
  });

  it('create() treats 409 (already exists) as success, hydrating from the body', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.create());
    httpMock
      .expectOne(POOL_URL)
      .flush(mtmPool, { status: 409, statusText: 'Conflict' });
    const res = await p;
    expect(res.kind).toBe('success');
    if (res.kind === 'success') expect(res.pool.pool_id).toBe(mtmPool.pool_id);
  });

  it('create() maps a 409 WITHOUT a pool body to error (defensive)', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.create());
    httpMock.expectOne(POOL_URL).flush(
      { error: { code: 'TENANCY_POOL_CONFLICT', message: 'racing create' } },
      { status: 409, statusText: 'Conflict' },
    );
    const res = await p;
    expect(res.kind).toBe('error');
    if (res.kind === 'error') expect(res.code).toBe('TENANCY_POOL_CONFLICT');
  });

  it('create() maps 5xx to error with the envelope code', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.create());
    httpMock.expectOne(POOL_URL).flush(
      { code: 'GATEWAY_UPSTREAM_ERROR', message: 'boom' },
      { status: 500, statusText: 'Internal Server Error' },
    );
    const res = await p;
    expect(res.kind).toBe('error');
    if (res.kind === 'error') expect(res.code).toBe('GATEWAY_UPSTREAM_ERROR');
  });

  // ── setAutoRenew() — POST :auto-renew ───────────────────────────────

  it('setAutoRenew() POSTs {monthly_topup_units} to the :auto-renew path', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.setAutoRenew(2500));
    const req = httpMock.expectOne(AUTO_RENEW_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ monthly_topup_units: 2500 });
    req.flush({ ...mtmPool, monthly_topup_units: 2500, version: 8 });
    const res = await p;
    expect(res.kind).toBe('success');
    if (res.kind === 'success') expect(res.pool.monthly_topup_units).toBe(2500);
  });

  it('setAutoRenew(0) disables auto-renew (0 is a valid quota)', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.setAutoRenew(0));
    const req = httpMock.expectOne(AUTO_RENEW_URL);
    expect(req.request.body).toEqual({ monthly_topup_units: 0 });
    req.flush({ ...mtmPool, monthly_topup_units: 0 });
    expect((await p).kind).toBe('success');
  });

  it('setAutoRenew() maps 422 to invalid with the NESTED envelope code', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.setAutoRenew(-1));
    httpMock.expectOne(AUTO_RENEW_URL).flush(
      { error: { code: 'TENANCY_QUOTA_NEGATIVE', message: 'must be >= 0' } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    const res = await p;
    expect(res.kind).toBe('invalid');
    if (res.kind === 'invalid') expect(res.code).toBe('TENANCY_QUOTA_NEGATIVE');
  });

  it('setAutoRenew() maps 404 to no-pool', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.setAutoRenew(1000));
    httpMock.expectOne(AUTO_RENEW_URL).flush(
      { code: 'GATEWAY_NOT_FOUND', message: 'no pool' },
      { status: 404, statusText: 'Not Found' },
    );
    expect((await p).kind).toBe('no-pool');
  });

  it('setAutoRenew() maps 5xx to error', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.setAutoRenew(1000));
    httpMock.expectOne(AUTO_RENEW_URL).flush(
      { code: 'GATEWAY_UPSTREAM_ERROR', message: 'boom' },
      { status: 502, statusText: 'Bad Gateway' },
    );
    const res = await p;
    expect(res.kind).toBe('error');
    if (res.kind === 'error') expect(res.code).toBe('GATEWAY_UPSTREAM_ERROR');
  });

  // ── checkoutTopUp() — POST /api/v1/checkout/mana-topup ─────────────

  it('checkoutTopUp() POSTs the pack + return URLs and surfaces stripe_checkout_url', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(
      service.checkoutTopUp(
        pack,
        'https://hplus.chora.site/h/mana?topup=success',
        'https://hplus.chora.site/h/mana?topup=cancelled',
      ),
    );
    const req = httpMock.expectOne(CHECKOUT_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      sku: 'tenant-mana-5000',
      mana_units: 5000,
      amount_cents: 799,
      currency: 'SGD',
      success_url: 'https://hplus.chora.site/h/mana?topup=success',
      cancel_url: 'https://hplus.chora.site/h/mana?topup=cancelled',
    });
    req.flush({
      purchase_id: '00000000-0000-7000-8000-00000000p001',
      stripe_session_id: 'cs_test_123',
      stripe_checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      state: 'CHECKOUT_PENDING',
    });
    const res = await p;
    expect(res.kind).toBe('success');
    if (res.kind === 'success') {
      expect(res.checkout.stripe_checkout_url).toBe(
        'https://checkout.stripe.com/c/pay/cs_test_123',
      );
    }
  });

  it('checkoutTopUp() maps an upstream failure to error with the FLAT envelope code', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.checkoutTopUp(pack, 'https://x/s', 'https://x/c'));
    httpMock.expectOne(CHECKOUT_URL).flush(
      { code: 'GATEWAY_UPSTREAM_UNAVAILABLE', message: 'payments down' },
      { status: 503, statusText: 'Service Unavailable' },
    );
    const res = await p;
    expect(res.kind).toBe('error');
    if (res.kind === 'error') expect(res.code).toBe('GATEWAY_UPSTREAM_UNAVAILABLE');
  });

  it('checkoutTopUp() maps a transport failure to error with NETWORK_ERROR', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.checkoutTopUp(pack, 'https://x/s', 'https://x/c'));
    httpMock.expectOne(CHECKOUT_URL).error(new ProgressEvent('error'));
    const res = await p;
    expect(res.kind).toBe('error');
    if (res.kind === 'error') expect(res.code).toBe('NETWORK_ERROR');
  });

  // ── Non-HTTP failures (e.g. an interceptor throwing) ───────────────

  describe('non-HttpErrorResponse failures classify as NETWORK_ERROR', () => {
    function setupThrowingBff(): TenantManaAdminService {
      TestBed.configureTestingModule({
        providers: [
          // Keep the HTTP testing providers so the file-level afterEach
          // verify() can still inject HttpTestingController (no requests
          // ever reach it — the BFF adapter below is stubbed).
          provideHttpClient(),
          provideHttpClientTesting(),
          {
            provide: BffClientService,
            useValue: {
              get: () => throwError(() => new Error('interceptor boom')),
              post: () => throwError(() => new Error('interceptor boom')),
            },
          },
        ],
      });
      return TestBed.inject(TenantManaAdminService);
    }

    it('pool()', async () => {
      const res = await firstValueFrom(setupThrowingBff().pool());
      expect(res).toEqual({ kind: 'error', code: 'NETWORK_ERROR' });
    });

    it('create()', async () => {
      const res = await firstValueFrom(setupThrowingBff().create());
      expect(res).toEqual({ kind: 'error', code: 'NETWORK_ERROR' });
    });

    it('setAutoRenew()', async () => {
      const res = await firstValueFrom(setupThrowingBff().setAutoRenew(1));
      expect(res).toEqual({ kind: 'error', code: 'NETWORK_ERROR' });
    });

    it('checkoutTopUp()', async () => {
      const res = await firstValueFrom(
        setupThrowingBff().checkoutTopUp(pack, 'https://x/s', 'https://x/c'),
      );
      expect(res).toEqual({ kind: 'error', code: 'NETWORK_ERROR' });
    });
  });
});

/**
 * Runtime-fidelity regression (L1 CHO-1705 walk-caught): in production
 * every HTTP failure passes through the global errorInterceptor, which
 * re-throws ApiError — NOT HttpErrorResponse. The walk found classify()
 * mapping every status to NETWORK_ERROR because the original specs ran
 * without the interceptor chain. This block registers the REAL
 * interceptor so the classify paths are exercised against the exact
 * runtime error shape.
 */
describe('TenantManaAdminService (through the real errorInterceptor)', () => {
  let service: TenantManaAdminService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        BffClientService,
        TenantManaAdminService,
      ],
    });
    service = TestBed.inject(TenantManaAdminService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('classifies a 404 load as no-pool through ApiError', async () => {
    const resultP = firstValueFrom(service.pool());
    httpMock
      .expectOne(POOL_URL)
      .flush(
        { error: { code: 'pool_not_found', message: 'no mana pool for tenant' } },
        { status: 404, statusText: 'Not Found' },
      );
    expect(await resultP).toEqual({ kind: 'no-pool' });
  });

  it('hydrates the existing pool from a 409 create through ApiError', async () => {
    const resultP = firstValueFrom(service.create());
    httpMock
      .expectOne(POOL_URL)
      .flush(mtmPool, { status: 409, statusText: 'Conflict' });
    const result = await resultP;
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.pool.pool_id).toBe(mtmPool.pool_id);
    }
  });

  it('classifies a 422 auto-renew as invalid with the nested code', async () => {
    const resultP = firstValueFrom(service.setAutoRenew(-1));
    httpMock
      .expectOne(AUTO_RENEW_URL)
      .flush(
        { error: { code: 'validation_failed', message: 'monthly_topup_units must be >= 0' } },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    expect(await resultP).toEqual({ kind: 'invalid', code: 'validation_failed' });
  });
});
