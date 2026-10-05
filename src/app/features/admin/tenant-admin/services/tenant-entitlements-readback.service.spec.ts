/**
 * TenantEntitlementsReadbackService spec (E5 slice 2).
 *
 * The load-bearing assertions here are the two the ruling asked for: the
 * service reads the GRANT endpoint and no other, and it never accepts the
 * setup wizard's INTENT shape as if it were the plan.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';

import { throwError } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import { TenantEntitlementsReadbackService } from './tenant-entitlements-readback.service';
import type { EntitlementsReadbackResult } from '../models/tenant-entitlements-readback.model';
import {
  ADDONS_MANAGEMENT_PATH,
  ENTITLEMENTS_READBACK_PATH,
} from '../models/tenant-entitlements-readback.model';

/**
 * BffClientService wraps every path in `environment.bffBaseUrl`, so an exact
 * `expectOne('/api/feature-flags')` fails for the wrong reason and reads like
 * a routing bug. Match on the suffix, as the H+ siblings do.
 */
function expectPath(http: HttpTestingController, path: string): TestRequest {
  return http.expectOne((r) => r.url.endsWith(path));
}

/** One row in the shape chora-tenancy's entitlementDTO sends. */
function grantRow(code: string, status = 'active') {
  return {
    id: '01990000-0000-7000-8000-00000000000a',
    tenant_id: 't-1',
    addon_id: '01990000-0000-7000-8000-00000000000b',
    addon_code: code,
    monthly_price_cents_snapshot: 0,
    status,
    activated_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
  };
}

describe('TenantEntitlementsReadbackService', () => {
  let svc: TenantEntitlementsReadbackService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(TenantEntitlementsReadbackService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function read(): Promise<EntitlementsReadbackResult> {
    return new Promise((resolve) => {
      svc.readGrantedAddOns().subscribe((r) => resolve(r));
    });
  }

  it('reads the grant endpoint and never the wizard selection endpoint', async () => {
    const p = read();
    expectPath(http, ENTITLEMENTS_READBACK_PATH).flush({
      items: [grantRow('tms')],
      total: 1,
    });
    await p;
    // The hydration endpoint is the wizard's own INTENT store. Asking for it
    // here is the whole defect this slice exists to prevent, so pin that no
    // request for it was issued at all.
    http.expectNone((r) => r.url.includes('/tenants/me/addons'));
  });

  it('returns the granted codes verbatim and in server order', async () => {
    const p = read();
    expectPath(http, ENTITLEMENTS_READBACK_PATH).flush({
      items: [grantRow('base'), grantRow('tms'), grantRow('cms')],
      total: 3,
    });
    const result = await p;
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;
    expect([...result.readback.codes]).toEqual(['base', 'tms', 'cms']);
    expect(result.readback.uncodedCount).toBe(0);
  });

  it('keeps only rows the frontend treats as enabled', async () => {
    const p = read();
    expectPath(http, ENTITLEMENTS_READBACK_PATH).flush({
      items: [grantRow('tms'), grantRow('cms', 'cancelled'), grantRow('familiar', 'pending_activation')],
      total: 3,
    });
    const result = await p;
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;
    expect([...result.readback.codes]).toEqual(['tms']);
  });

  it('counts a granted row with no catalogue code rather than dropping it', async () => {
    // Legacy add_ons rows predating tenancy migration 0021 carry no code.
    // Dropping them would tell an operator their plan is smaller than it is.
    const p = read();
    expectPath(http, ENTITLEMENTS_READBACK_PATH).flush({
      items: [grantRow('tms'), grantRow(''), { status: 'active' }],
      total: 3,
    });
    const result = await p;
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;
    expect([...result.readback.codes]).toEqual(['tms']);
    expect(result.readback.uncodedCount).toBe(2);
  });

  it('treats an empty grant as an empty plan, not a failure', async () => {
    const p = read();
    expectPath(http, ENTITLEMENTS_READBACK_PATH).flush({ items: [], total: 0 });
    const result = await p;
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;
    expect(result.readback.codes.length).toBe(0);
    expect(result.readback.uncodedCount).toBe(0);
  });

  it('survives a response with no items array at all', async () => {
    const p = read();
    expectPath(http, ENTITLEMENTS_READBACK_PATH).flush({});
    const result = await p;
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;
    expect(result.readback.codes.length).toBe(0);
  });

  it('classifies the gateway 400 with no resolvable tenant as no-active-tenant', async () => {
    const p = read();
    expectPath(http, ENTITLEMENTS_READBACK_PATH).flush(
      { error: { code: 'GATEWAY_TENANT_NOT_RESOLVED', message: 'tenant_id missing from auth context' } },
      { status: 400, statusText: 'Bad Request' },
    );
    expect((await p).kind).toBe('no-active-tenant');
  });

  it('classifies the sibling services 409 no-active-tenant code the same way', async () => {
    const p = read();
    expectPath(http, ENTITLEMENTS_READBACK_PATH).flush(
      { error: { code: 'GATEWAY_NO_ACTIVE_TENANT', message: 'no active organisation' } },
      { status: 409, statusText: 'Conflict' },
    );
    expect((await p).kind).toBe('no-active-tenant');
  });

  it('classifies a 400 that is NOT a tenant problem as a server error', async () => {
    // Positive control for the branch above: a bare 400 must not be dressed
    // up as "you have no organisation", which sends an operator to fix
    // something that is not broken.
    const p = read();
    expectPath(http, ENTITLEMENTS_READBACK_PATH).flush(
      { error: { code: 'GATEWAY_BAD_REQUEST', message: 'nope' } },
      { status: 400, statusText: 'Bad Request' },
    );
    expect((await p).kind).toBe('server-error');
  });

  it('classifies 401 and 403 as unauthenticated', async () => {
    for (const status of [401, 403]) {
      const p = read();
      expectPath(http, ENTITLEMENTS_READBACK_PATH).flush(
        {},
        { status, statusText: 'denied' },
      );
      expect((await p).kind).toBe('unauthenticated');
    }
  });

  it('classifies 5xx as a server error and a transport failure as a network error', async () => {
    const p500 = read();
    expectPath(http, ENTITLEMENTS_READBACK_PATH).flush(
      {},
      { status: 503, statusText: 'Service Unavailable' },
    );
    expect((await p500).kind).toBe('server-error');

    const pNet = read();
    expectPath(http, ENTITLEMENTS_READBACK_PATH).error(
      new ProgressEvent('network error'),
    );
    expect((await pNet).kind).toBe('network-error');
  });

  it('never throws: every failure resolves to a kind the caller can render', async () => {
    const p = read();
    expectPath(http, ENTITLEMENTS_READBACK_PATH).flush(
      {},
      { status: 418, statusText: 'teapot' },
    );
    await expect(p).resolves.toBeTruthy();
  });

  it('treats a value that is not an HTTP failure at all as a network error', async () => {
    // The other failure cases arrive as HttpErrorResponse or ApiError. This is
    // the branch for anything else reaching the pipe, which is the only shape
    // httpErrorView cannot describe.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: BffClientService,
          useValue: { get: () => throwError(() => new Error('not an http failure')) },
        },
      ],
    });
    const bare = TestBed.inject(TenantEntitlementsReadbackService);
    const result = await new Promise<EntitlementsReadbackResult>((resolve) => {
      bare.readGrantedAddOns().subscribe((r) => resolve(r));
    });
    expect(result.kind).toBe('network-error');
  });

  it('points changes at the add-ons screen, not back at this wizard', () => {
    expect(ADDONS_MANAGEMENT_PATH).toBe('/h/addons');
  });
});
