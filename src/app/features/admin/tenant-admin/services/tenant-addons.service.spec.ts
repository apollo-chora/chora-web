/**
 * TenantAddonsService spec — RED-phase tests for CHO-1665 Phase B FE.
 *
 * Strict TDD per chora/.claude/rules/development-execution.md: this
 * file is written BEFORE tenant-addons.service.ts exists. Compile
 * must fail with "Cannot find module './tenant-addons.service'" —
 * that's the observed RED phase. Implementation lands next and turns
 * these GREEN.
 *
 * Drives the service through HttpTestingController against the
 * canonical BFF URL + body shape. Per chora-web/CLAUDE.md §6, every
 * test calls `httpMock.verify()` in afterEach.
 *
 * Mirrors the TenantBrandingService spec shape (CHO-1655). The service
 * is the single FE → BFF surface for Setup Wizard step 2, returning a
 * discriminated `AddonsApplyResult` so the wizard component stays out
 * of HTTP minutiae.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { TenantAddonsService } from './tenant-addons.service';
import {
  AddonsApplyResponse,
  TENANT_ADDONS_PATH,
} from '../models/tenant-addons.model';
import { environment } from '../../../../../environments/environment';

const URL = `${environment.bffBaseUrl}${TENANT_ADDONS_PATH}`;

function setup(): {
  service: TenantAddonsService;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const service = TestBed.inject(TenantAddonsService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

describe('TenantAddonsService', () => {
  let mock: HttpTestingController;

  afterEach(() => {
    mock?.verify();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('sends POST to /api/v1/tenants/me/addons with {add_on_codes: [...]}', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.applyAddons({ add_on_codes: ['tms', 'cms', 'marketplace'] }),
    );

    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      add_on_codes: ['tms', 'cms', 'marketplace'],
    });

    const flushed: AddonsApplyResponse = {
      subscriptions: [
        {
          subscription_id: '0197...001',
          add_on_code: 'tms',
          status: 'pending_activation',
          created_at: '2026-06-05T00:00:00Z',
          newly_subscribed: true,
        },
        {
          subscription_id: '0197...002',
          add_on_code: 'cms',
          status: 'pending_activation',
          created_at: '2026-06-05T00:00:00Z',
          newly_subscribed: true,
        },
        {
          subscription_id: '0197...003',
          add_on_code: 'marketplace',
          status: 'pending_activation',
          created_at: '2026-06-05T00:00:00Z',
          newly_subscribed: true,
        },
      ],
    };
    req.flush(flushed, { status: 200, statusText: 'OK' });

    const result = await promise;
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.response.subscriptions).toHaveLength(3);
      expect(result.response.subscriptions[0].add_on_code).toBe('tms');
      expect(result.response.subscriptions[0].newly_subscribed).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // CHO-1692 — empty list IS sent over the wire (REPLACE semantics).
  // Replaces the previous short-circuit which silently dropped un-ticks.
  // -------------------------------------------------------------------------

  it('sends the empty array to the BFF so REPLACE semantics can wipe wizard selections', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.applyAddons({ add_on_codes: [] }));
    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ add_on_codes: [] });
    req.flush({ subscriptions: [] }, { status: 200, statusText: 'OK' });

    const result = await promise;
    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.response.subscriptions).toEqual([]);
    }
  });

  // -------------------------------------------------------------------------
  // 400 — unknown_addon_code maps to discriminated 'unknown-code' with detail
  // -------------------------------------------------------------------------

  it('maps 400 unknown_addon_code → kind: "unknown-code" carrying the upstream message', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.applyAddons({ add_on_codes: ['bogus'] }),
    );

    const req = httpMock.expectOne(URL);
    req.flush(
      { error: { code: 'unknown_addon_code', message: 'unknown add-on code(s): bogus' } },
      { status: 400, statusText: 'Bad Request' },
    );

    const result = await promise;
    expect(result.kind).toBe('unknown-code');
    if (result.kind === 'unknown-code') {
      expect(result.message).toContain('bogus');
    }
  });

  // -------------------------------------------------------------------------
  // 400 — other validation errors map to 'invalid' with the upstream message
  // -------------------------------------------------------------------------

  it('maps generic 400 (non-unknown_addon_code) → kind: "invalid"', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.applyAddons({ add_on_codes: ['tms'] }),
    );

    const req = httpMock.expectOne(URL);
    req.flush(
      { error: { code: 'empty_add_on_codes', message: 'add_on_codes must contain at least one code' } },
      { status: 400, statusText: 'Bad Request' },
    );

    const result = await promise;
    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.message).toContain('add_on_codes must');
    }
  });

  // -------------------------------------------------------------------------
  // 401 / 403
  // -------------------------------------------------------------------------

  it('maps 401 → kind: "unauthenticated"', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.applyAddons({ add_on_codes: ['tms'] }),
    );

    const req = httpMock.expectOne(URL);
    req.flush(null, { status: 401, statusText: 'Unauthorized' });

    const result = await promise;
    expect(result.kind).toBe('unauthenticated');
  });

  it('maps 403 → kind: "unauthenticated"', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.applyAddons({ add_on_codes: ['tms'] }),
    );

    const req = httpMock.expectOne(URL);
    req.flush(null, { status: 403, statusText: 'Forbidden' });

    const result = await promise;
    expect(result.kind).toBe('unauthenticated');
  });

  // -------------------------------------------------------------------------
  // 5xx + network error
  // -------------------------------------------------------------------------

  it('maps 500 → kind: "server-error"', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.applyAddons({ add_on_codes: ['tms'] }),
    );

    const req = httpMock.expectOne(URL);
    req.flush(null, { status: 500, statusText: 'Internal Server Error' });

    const result = await promise;
    expect(result.kind).toBe('server-error');
  });

  it('maps status 0 (no connection) → kind: "network-error"', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(
      service.applyAddons({ add_on_codes: ['tms'] }),
    );

    const req = httpMock.expectOne(URL);
    req.flush(null, { status: 0, statusText: 'Network error' });

    const result = await promise;
    expect(result.kind).toBe('network-error');
  });
});
