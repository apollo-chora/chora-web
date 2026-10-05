/**
 * TenantAddonsAdminService spec — RED-phase tests for CHO-1698 PR 2
 * (STITCH-H-ADD-1 post-setup management dashboard).
 *
 * Strict TDD per chora/.claude/rules/development-execution.md: this
 * file is written BEFORE tenant-addons-admin.service.ts exists.
 * Compile must fail with "Cannot find module './tenant-addons-admin.service'".
 *
 * Drives the service through HttpTestingController against the
 * canonical BFF URL. Per chora-web/CLAUDE.md §6, every test calls
 * `httpMock.verify()` in afterEach. Mirrors the
 * `tenant-idp-admin.service.spec.ts` shape (CHO-1694 PR 2).
 *
 * Wire scenarios for `list()`: happy / empty / 401 / 5xx / network /
 * `refresh()` alias that re-issues GET.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { TenantAddonsAdminService } from './tenant-addons-admin.service';
import {
  ADMIN_MARKETPLACE_ADDONS_PATH,
  ADMIN_TENANTS_ME_ADDONS_PATH,
  AddOnDetail,
  AddOnSubscriptionSnapshot,
  AdminAddonRow,
  AdminAddonsListResponse,
  AddOnUsage,
  CHECKOUT_TENANT_ADDON_PATH,
  ChangeAddonTierRequest,
  ChangeAddonTierResponse,
  CreateAddonCheckoutSessionResponse,
  DeactivateAddonRequest,
  DeactivateAddonResponse,
  MarketplaceAddonDetail,
  MarketplaceAddonListResponse,
  PreviewAddonTierRequest,
  PreviewAddonTierResponse,
  activateAddonPath,
  addonItemPath,
  addonUsagePath,
  cancelDeactivationPath,
  deactivateAddonPath,
  marketplaceAddonDetailPath,
  previewTierChangePath,
} from '../models/tenant-addons-admin.model';
import { environment } from '../../../../../environments/environment';

const URL = `${environment.bffBaseUrl}${ADMIN_TENANTS_ME_ADDONS_PATH}`;
const PLAN_ID = '019e0000-0000-7000-8000-bbbbbbbbbbbb';
const DEACTIVATE_URL = `${environment.bffBaseUrl}${deactivateAddonPath(PLAN_ID)}`;
const USAGE_URL = `${environment.bffBaseUrl}${addonUsagePath(PLAN_ID)}`;
const CHANGE_TIER_URL = `${environment.bffBaseUrl}${addonItemPath(PLAN_ID)}`;
// CHO-1734 STITCH-H-ADD-5 — `getDetail` uses the same bare-item URL as
// change-tier; the dispatch is by HTTP method (GET = detail, PATCH = change).
const DETAIL_URL = `${environment.bffBaseUrl}${addonItemPath(PLAN_ID)}`;
// CHO-1735 — H+ Marketplace catalog browse (tenant-agnostic, no `me`).
const MARKETPLACE_LIST_URL = `${environment.bffBaseUrl}${ADMIN_MARKETPLACE_ADDONS_PATH}`;
const MARKETPLACE_DETAIL_URL = `${environment.bffBaseUrl}${marketplaceAddonDetailPath(PLAN_ID)}`;
// CHO-1741 — H+ Marketplace Subscribe via Stripe Checkout.
const CHECKOUT_URL = `${environment.bffBaseUrl}${CHECKOUT_TENANT_ADDON_PATH}`;
// CHO-1742 — Activate-Free for $0 tiles.
const ACTIVATE_URL = `${environment.bffBaseUrl}${activateAddonPath(PLAN_ID)}`;
// CHO-1785 — undo a pending end-of-cycle deactivation (:cancel-deactivation).
const CANCEL_DEACTIVATION_URL = `${environment.bffBaseUrl}${cancelDeactivationPath(PLAN_ID)}`;
// CHO-1766 — preview the upcoming-invoice delta for a tier change.
const PREVIEW_TIER_URL = `${environment.bffBaseUrl}${previewTierChangePath(PLAN_ID)}`;

function setup(): {
  service: TenantAddonsAdminService;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const service = TestBed.inject(TenantAddonsAdminService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

const sampleRow: AdminAddonRow = {
  tenant_id: '01970000-0000-7000-8000-aaaaaaaaaaaa',
  addon_plan_id: '019e0000-0000-7000-8000-bbbbbbbbbbbb',
  addon_code: 'familiar',
  display_name: 'Familiar',
  status: 'ACTIVE',
  current_tier: 'pro',
  monthly_cost: 2400,
  seats_used: 5,
  activated_at: '2026-06-08T00:00:00Z',
  deactivated_at: null,
};

describe('TenantAddonsAdminService', () => {
  let mock: HttpTestingController;

  afterEach(() => {
    mock?.verify();
  });

  describe('list', () => {
    it('issues a GET to the BFF alias and surfaces rows verbatim on 200', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.list());
      const req = httpMock.expectOne(URL);
      expect(req.request.method).toBe('GET');
      req.flush(
        { items: [sampleRow] } satisfies AdminAddonsListResponse,
        { status: 200, statusText: 'OK' },
      );
      const result = await promise;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.rows).toEqual([sampleRow]);
      }
    });

    it('treats empty items array as success (fresh tenant, not 404)', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(URL).flush(
        { items: [] } satisfies AdminAddonsListResponse,
        { status: 200, statusText: 'OK' },
      );
      const result = await promise;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.rows).toEqual([]);
      }
    });

    it('maps 401 to kind:"unauthenticated"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(URL).flush(null, {
        status: 401,
        statusText: 'Unauthorized',
      });
      const result = await promise;
      expect(result.kind).toBe('unauthenticated');
    });

    it('maps 5xx to kind:"server-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(URL).flush(null, {
        status: 502,
        statusText: 'Bad Gateway',
      });
      const result = await promise;
      expect(result.kind).toBe('server-error');
    });

    it('maps status 0 to kind:"network-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(URL).flush(null, {
        status: 0,
        statusText: 'Network error',
      });
      const result = await promise;
      expect(result.kind).toBe('network-error');
    });

    it('tolerates a missing items array as success with empty rows', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(URL).flush({}, { status: 200, statusText: 'OK' });
      const result = await promise;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.rows).toEqual([]);
      }
    });
  });

  describe('refresh', () => {
    it('is a thin alias for list — issues the same GET', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.refresh());
      const req = httpMock.expectOne(URL);
      expect(req.request.method).toBe('GET');
      req.flush(
        { items: [] } satisfies AdminAddonsListResponse,
        { status: 200, statusText: 'OK' },
      );
      const result = await promise;
      expect(result.kind).toBe('success');
    });
  });

  // -------------------------------------------------------------------------
  // deactivate — CHO-1731 STITCH-H-ADD-2
  // -------------------------------------------------------------------------
  describe('deactivate', () => {
    const requestBody: DeactivateAddonRequest = {
      reason: 'cost',
      reason_text: 'too expensive',
      effective_at: null,
    };

    const immediateResponse: DeactivateAddonResponse = {
      tenant_id: '01970000-0000-7000-8000-aaaaaaaaaaaa',
      addon_plan_id: PLAN_ID,
      status: 'DEACTIVATED',
      requested_at: '2026-06-12T00:00:00Z',
      effective_at: null,
      reason: 'cost',
    };

    const scheduledResponse: DeactivateAddonResponse = {
      tenant_id: '01970000-0000-7000-8000-aaaaaaaaaaaa',
      addon_plan_id: PLAN_ID,
      status: 'DEACTIVATION_SCHEDULED',
      requested_at: '2026-06-12T00:00:00Z',
      effective_at: '2026-07-01T00:00:00Z',
      reason: 'cost',
    };

    it('issues a POST to the deactivate alias with the request body', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.deactivate(PLAN_ID, requestBody));
      const req = httpMock.expectOne(DEACTIVATE_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(requestBody);
      req.flush(immediateResponse, { status: 200, statusText: 'OK' });
      await promise;
    });

    it('maps 200 DEACTIVATED to kind:"success-immediate"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.deactivate(PLAN_ID, requestBody));
      httpMock
        .expectOne(DEACTIVATE_URL)
        .flush(immediateResponse, { status: 200, statusText: 'OK' });
      const result = await promise;
      expect(result.kind).toBe('success-immediate');
      if (result.kind === 'success-immediate') {
        expect(result.response.status).toBe('DEACTIVATED');
      }
    });

    it('maps 202 DEACTIVATION_SCHEDULED to kind:"success-scheduled"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.deactivate(PLAN_ID, requestBody));
      httpMock
        .expectOne(DEACTIVATE_URL)
        .flush(scheduledResponse, { status: 202, statusText: 'Accepted' });
      const result = await promise;
      expect(result.kind).toBe('success-scheduled');
      if (result.kind === 'success-scheduled') {
        expect(result.response.effective_at).toBe('2026-07-01T00:00:00Z');
      }
    });

    it('maps 423 Locked to kind:"compliance-locked"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.deactivate(PLAN_ID, requestBody));
      httpMock
        .expectOne(DEACTIVATE_URL)
        .flush(null, { status: 423, statusText: 'Locked' });
      const result = await promise;
      expect(result.kind).toBe('compliance-locked');
    });

    it('maps 404 to kind:"not-found"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.deactivate(PLAN_ID, requestBody));
      httpMock
        .expectOne(DEACTIVATE_URL)
        .flush(null, { status: 404, statusText: 'Not Found' });
      const result = await promise;
      expect(result.kind).toBe('not-found');
    });

    it('maps 409 already-deactivated to kind:"already-deactivated"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.deactivate(PLAN_ID, requestBody));
      httpMock
        .expectOne(DEACTIVATE_URL)
        .flush(null, { status: 409, statusText: 'Conflict' });
      const result = await promise;
      expect(result.kind).toBe('already-deactivated');
    });

    it('maps 401 to kind:"unauthenticated"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.deactivate(PLAN_ID, requestBody));
      httpMock
        .expectOne(DEACTIVATE_URL)
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      const result = await promise;
      expect(result.kind).toBe('unauthenticated');
    });

    it('maps 5xx to kind:"server-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.deactivate(PLAN_ID, requestBody));
      httpMock
        .expectOne(DEACTIVATE_URL)
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const result = await promise;
      expect(result.kind).toBe('server-error');
    });

    it('maps status 0 to kind:"network-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.deactivate(PLAN_ID, requestBody));
      httpMock
        .expectOne(DEACTIVATE_URL)
        .flush(null, { status: 0, statusText: 'Network error' });
      const result = await promise;
      expect(result.kind).toBe('network-error');
    });
  });

  // -------------------------------------------------------------------------
  // getUsage — CHO-1732 STITCH-H-ADD-3
  // -------------------------------------------------------------------------
  describe('getUsage', () => {
    const sampleUsage: AddOnUsage = {
      addon_plan_id: PLAN_ID,
      tenant_id: '01970000-0000-7000-8000-aaaaaaaaaaaa',
      period_from: '2026-05-13T00:00:00Z',
      period_to: '2026-06-12T00:00:00Z',
      granularity: 'day',
      seats_total: 50,
      seats_used: 12,
      seats_used_peak: 18,
      time_series: [],
      top_consumers: [],
    };

    it('issues a GET to the usage alias with no query when none provided', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.getUsage(PLAN_ID, {}));
      const req = httpMock.expectOne(USAGE_URL);
      expect(req.request.method).toBe('GET');
      req.flush(sampleUsage, { status: 200, statusText: 'OK' });
      await promise;
    });

    it('serialises from/to/granularity into the query string', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(
        service.getUsage(PLAN_ID, {
          from: '2026-05-13T00:00:00Z',
          to: '2026-06-12T00:00:00Z',
          granularity: 'day',
        }),
      );
      const req = httpMock.expectOne(
        `${USAGE_URL}?from=2026-05-13T00:00:00Z&to=2026-06-12T00:00:00Z&granularity=day`,
      );
      expect(req.request.method).toBe('GET');
      req.flush(sampleUsage, { status: 200, statusText: 'OK' });
      await promise;
    });

    it('maps 200 to kind:"success" with the envelope', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.getUsage(PLAN_ID, {}));
      httpMock.expectOne(USAGE_URL).flush(sampleUsage, { status: 200, statusText: 'OK' });
      const result = await promise;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.usage.addon_plan_id).toBe(PLAN_ID);
        expect(result.usage.granularity).toBe('day');
      }
    });

    it('maps 404 to kind:"not-found"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.getUsage(PLAN_ID, {}));
      httpMock.expectOne(USAGE_URL).flush(null, { status: 404, statusText: 'Not Found' });
      const result = await promise;
      expect(result.kind).toBe('not-found');
    });

    it('maps 401 to kind:"unauthenticated"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.getUsage(PLAN_ID, {}));
      httpMock.expectOne(USAGE_URL).flush(null, { status: 401, statusText: 'Unauthorized' });
      const result = await promise;
      expect(result.kind).toBe('unauthenticated');
    });

    it('maps 5xx to kind:"server-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.getUsage(PLAN_ID, {}));
      httpMock.expectOne(USAGE_URL).flush(null, { status: 502, statusText: 'Bad Gateway' });
      const result = await promise;
      expect(result.kind).toBe('server-error');
    });

    it('maps status 0 to kind:"network-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.getUsage(PLAN_ID, {}));
      httpMock.expectOne(USAGE_URL).flush(null, { status: 0, statusText: 'Network error' });
      const result = await promise;
      expect(result.kind).toBe('network-error');
    });
  });

  // -------------------------------------------------------------------------
  // changeTier — CHO-1733 STITCH-H-ADD-4
  // -------------------------------------------------------------------------
  describe('changeTier', () => {
    const requestBody: ChangeAddonTierRequest = {
      target_plan_id: '019e0000-0000-7000-8000-cccccccccccc',
      proration_mode: 'create_prorations',
      effective_at: null,
    };

    const immediateResponse: ChangeAddonTierResponse = {
      subscription_id: '01970000-0000-7000-8000-000000000010',
      billing_delta_cents: 24_000,
      effective_at: '2026-06-13T00:00:00Z',
      schedule_id: null,
      from_tier: 'starter',
      to_tier: 'pro',
    };

    const scheduledResponse: ChangeAddonTierResponse = {
      subscription_id: '01970000-0000-7000-8000-000000000010',
      billing_delta_cents: 0,
      effective_at: '2026-07-01T00:00:00Z',
      schedule_id: 'sub_sched_123',
      from_tier: 'pro',
      to_tier: 'starter',
    };

    it('issues a PATCH to the bare-item alias with the request body', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.changeTier(PLAN_ID, requestBody));
      const req = httpMock.expectOne(CHANGE_TIER_URL);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(requestBody);
      req.flush(immediateResponse, { status: 200, statusText: 'OK' });
      await promise;
    });

    it('maps 200 immediate to kind:"success-immediate"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.changeTier(PLAN_ID, requestBody));
      httpMock
        .expectOne(CHANGE_TIER_URL)
        .flush(immediateResponse, { status: 200, statusText: 'OK' });
      const result = await promise;
      expect(result.kind).toBe('success-immediate');
      if (result.kind === 'success-immediate') {
        expect(result.response.from_tier).toBe('starter');
        expect(result.response.to_tier).toBe('pro');
        expect(result.response.billing_delta_cents).toBe(24_000);
      }
    });

    it('maps 200 with schedule_id to kind:"success-scheduled"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.changeTier(PLAN_ID, requestBody));
      httpMock
        .expectOne(CHANGE_TIER_URL)
        .flush(scheduledResponse, { status: 200, statusText: 'OK' });
      const result = await promise;
      expect(result.kind).toBe('success-scheduled');
      if (result.kind === 'success-scheduled') {
        expect(result.response.schedule_id).toBe('sub_sched_123');
      }
    });

    it('maps 202 to kind:"success-scheduled" regardless of schedule_id', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.changeTier(PLAN_ID, requestBody));
      httpMock
        .expectOne(CHANGE_TIER_URL)
        .flush(scheduledResponse, { status: 202, statusText: 'Accepted' });
      const result = await promise;
      expect(result.kind).toBe('success-scheduled');
    });

    it('maps 409 to kind:"conflict"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.changeTier(PLAN_ID, requestBody));
      httpMock
        .expectOne(CHANGE_TIER_URL)
        .flush(null, { status: 409, statusText: 'Conflict' });
      const result = await promise;
      expect(result.kind).toBe('conflict');
    });

    it('maps 422 to kind:"validation-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.changeTier(PLAN_ID, requestBody));
      httpMock
        .expectOne(CHANGE_TIER_URL)
        .flush(null, { status: 422, statusText: 'Unprocessable Entity' });
      const result = await promise;
      expect(result.kind).toBe('validation-error');
    });

    it('maps 404 to kind:"not-found"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.changeTier(PLAN_ID, requestBody));
      httpMock
        .expectOne(CHANGE_TIER_URL)
        .flush(null, { status: 404, statusText: 'Not Found' });
      const result = await promise;
      expect(result.kind).toBe('not-found');
    });

    it('maps 401 to kind:"unauthenticated"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.changeTier(PLAN_ID, requestBody));
      httpMock
        .expectOne(CHANGE_TIER_URL)
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      const result = await promise;
      expect(result.kind).toBe('unauthenticated');
    });

    it('maps 5xx to kind:"server-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.changeTier(PLAN_ID, requestBody));
      httpMock
        .expectOne(CHANGE_TIER_URL)
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const result = await promise;
      expect(result.kind).toBe('server-error');
    });

    it('maps status 0 to kind:"network-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.changeTier(PLAN_ID, requestBody));
      httpMock
        .expectOne(CHANGE_TIER_URL)
        .flush(null, { status: 0, statusText: 'Network error' });
      const result = await promise;
      expect(result.kind).toBe('network-error');
    });
  });

  // -------------------------------------------------------------------------
  // getDetail — CHO-1734 STITCH-H-ADD-5 (epic close)
  // -------------------------------------------------------------------------
  describe('getDetail', () => {
    const fullDetail: AddOnDetail = {
      addon_plan_id: PLAN_ID,
      code: 'familiar',
      display_name: 'Familiar',
      category: 'AI',
      description: 'Companion AI add-on.',
      entitlements: [
        { feature_code: 'gemma_lora', label: 'Per-tenant LoRA', limit: null },
      ],
      integrations: [
        { type: 'webhook', label: 'Webhooks', status: 'available' },
      ],
      compliance: {
        gdpr: true,
        pdpa: true,
        ccpa: false,
        imda: true,
        data_residency_regions: ['SG'],
      },
      pricing_tiers: [
        {
          tier_code: 'pro',
          label: 'Pro',
          monthly_price_cents: 2400,
          currency: 'USD',
        },
      ],
      current_subscription: {
        activated_at: '2026-06-08T00:00:00Z',
        current_tier: 'pro',
        status: 'ACTIVE',
        billing_cycle: 'MONTHLY',
      },
    };

    it('issues a GET to the bare-item alias', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.getDetail(PLAN_ID));
      const req = httpMock.expectOne(DETAIL_URL);
      expect(req.request.method).toBe('GET');
      req.flush(fullDetail, { status: 200, statusText: 'OK' });
      await promise;
    });

    it('maps 200 to kind:"success" with the envelope', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.getDetail(PLAN_ID));
      httpMock.expectOne(DETAIL_URL).flush(fullDetail, { status: 200, statusText: 'OK' });
      const result = await promise;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.detail.display_name).toBe('Familiar');
        expect(result.detail.current_subscription?.current_tier).toBe('pro');
      }
    });

    it('maps 404 to kind:"not-found"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.getDetail(PLAN_ID));
      httpMock.expectOne(DETAIL_URL).flush(null, { status: 404, statusText: 'Not Found' });
      const result = await promise;
      expect(result.kind).toBe('not-found');
    });

    it('maps 401 to kind:"unauthenticated"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.getDetail(PLAN_ID));
      httpMock.expectOne(DETAIL_URL).flush(null, { status: 401, statusText: 'Unauthorized' });
      const result = await promise;
      expect(result.kind).toBe('unauthenticated');
    });

    it('maps 5xx to kind:"server-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.getDetail(PLAN_ID));
      httpMock.expectOne(DETAIL_URL).flush(null, { status: 502, statusText: 'Bad Gateway' });
      const result = await promise;
      expect(result.kind).toBe('server-error');
    });

    it('maps status 0 to kind:"network-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.getDetail(PLAN_ID));
      httpMock.expectOne(DETAIL_URL).flush(null, { status: 0, statusText: 'Network error' });
      const result = await promise;
      expect(result.kind).toBe('network-error');
    });
  });

  // -------------------------------------------------------------------------
  // CHO-1735 — H+ Marketplace catalog browse
  // -------------------------------------------------------------------------
  describe('listMarketplace', () => {
    const sampleItem: AddOnDetail = {
      addon_plan_id: '019e0000-0000-7000-8000-cccccccccccc',
      code: 'knowledge_graph',
      display_name: 'Knowledge Graph',
      category: 'learning',
      description: 'Per-user knowledge mapping',
      entitlements: [],
      integrations: [],
      pricing_tiers: [],
    };

    it('issues a GET to the tenant-agnostic catalog list URL with no query and surfaces items + nextCursor verbatim on 200', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.listMarketplace({}));
      const req = httpMock.expectOne(MARKETPLACE_LIST_URL);
      expect(req.request.method).toBe('GET');
      req.flush(
        { items: [sampleItem], next_cursor: 'cur-1' } satisfies MarketplaceAddonListResponse,
        { status: 200, statusText: 'OK' },
      );
      const result = await promise;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.items).toEqual([sampleItem]);
        expect(result.nextCursor).toBe('cur-1');
      }
    });

    it('forwards category/tier/cursor/limit as a query string on the BFF URL', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(
        service.listMarketplace({ category: 'learning', tier: 'pro', cursor: 'cur-0', limit: 25 }),
      );
      const req = httpMock.expectOne(
        `${MARKETPLACE_LIST_URL}?category=learning&tier=pro&cursor=cur-0&limit=25`,
      );
      expect(req.request.method).toBe('GET');
      req.flush(
        { items: [], next_cursor: null } satisfies MarketplaceAddonListResponse,
        { status: 200, statusText: 'OK' },
      );
      const result = await promise;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.items).toEqual([]);
        expect(result.nextCursor).toBeNull();
      }
    });

    it('defaults nextCursor to null when the BE omits it', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.listMarketplace({}));
      httpMock.expectOne(MARKETPLACE_LIST_URL).flush(
        { items: [sampleItem] } satisfies MarketplaceAddonListResponse,
        { status: 200, statusText: 'OK' },
      );
      const result = await promise;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.nextCursor).toBeNull();
      }
    });

    it('maps 401 to kind:"unauthenticated"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.listMarketplace({}));
      httpMock
        .expectOne(MARKETPLACE_LIST_URL)
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      const result = await promise;
      expect(result.kind).toBe('unauthenticated');
    });

    it('maps 5xx to kind:"server-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.listMarketplace({}));
      httpMock
        .expectOne(MARKETPLACE_LIST_URL)
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const result = await promise;
      expect(result.kind).toBe('server-error');
    });

    it('maps status 0 to kind:"network-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.listMarketplace({}));
      httpMock
        .expectOne(MARKETPLACE_LIST_URL)
        .flush(null, { status: 0, statusText: 'Network error' });
      const result = await promise;
      expect(result.kind).toBe('network-error');
    });
  });

  describe('getMarketplaceDetail', () => {
    const sampleDetail: MarketplaceAddonDetail = {
      addon_plan_id: PLAN_ID,
      code: 'knowledge_graph',
      display_name: 'Knowledge Graph',
      category: 'learning',
      description: 'Per-user knowledge mapping',
      entitlements: [],
      integrations: [],
      pricing_tiers: [],
      is_installed: true,
    };

    it('issues a GET to the marketplace detail URL and surfaces the detail (with is_installed) on 200', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.getMarketplaceDetail(PLAN_ID));
      const req = httpMock.expectOne(MARKETPLACE_DETAIL_URL);
      expect(req.request.method).toBe('GET');
      req.flush(sampleDetail, { status: 200, statusText: 'OK' });
      const result = await promise;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.detail).toEqual(sampleDetail);
        expect(result.detail.is_installed).toBe(true);
      }
    });

    it('maps 404 to kind:"not-found"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.getMarketplaceDetail(PLAN_ID));
      httpMock
        .expectOne(MARKETPLACE_DETAIL_URL)
        .flush(null, { status: 404, statusText: 'Not Found' });
      const result = await promise;
      expect(result.kind).toBe('not-found');
    });

    it('maps 401 to kind:"unauthenticated"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.getMarketplaceDetail(PLAN_ID));
      httpMock
        .expectOne(MARKETPLACE_DETAIL_URL)
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      const result = await promise;
      expect(result.kind).toBe('unauthenticated');
    });

    it('maps 5xx to kind:"server-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.getMarketplaceDetail(PLAN_ID));
      httpMock
        .expectOne(MARKETPLACE_DETAIL_URL)
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const result = await promise;
      expect(result.kind).toBe('server-error');
    });

    it('maps status 0 to kind:"network-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.getMarketplaceDetail(PLAN_ID));
      httpMock
        .expectOne(MARKETPLACE_DETAIL_URL)
        .flush(null, { status: 0, statusText: 'Network error' });
      const result = await promise;
      expect(result.kind).toBe('network-error');
    });
  });

  // -------------------------------------------------------------------------
  // CHO-1741 — H+ Marketplace Subscribe via Stripe Checkout
  // -------------------------------------------------------------------------
  describe('createCheckoutSession', () => {
    const sampleReq = {
      addonPlanId: PLAN_ID,
      addonCode: 'knowledge_graph',
      tierCode: 'pro',
      amountCents: 4900,
      currency: 'SGD',
    };

    it('issues a POST to the BFF tenant-addon checkout alias with the request body', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.createCheckoutSession(sampleReq));
      const req = httpMock.expectOne(CHECKOUT_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toMatchObject({
        addon_plan_id: PLAN_ID,
        addon_code: 'knowledge_graph',
        tier_code: 'pro',
        amount_cents: 4900,
        currency: 'SGD',
      });
      // success_url + cancel_url default to the catalog detail page.
      expect(typeof req.request.body.success_url).toBe('string');
      expect(req.request.body.success_url).toContain('/h/marketplace/');
      expect(req.request.body.success_url).toContain('checkout=success');
      expect(req.request.body.cancel_url).toContain('checkout=cancel');
      req.flush(
        {
          purchase_id: 'pur_abc',
          stripe_session_id: 'cs_test_123',
          stripe_checkout_url: 'https://checkout.stripe.com/c/pay/cs_test_123',
          state: 'checkout_started',
        } satisfies CreateAddonCheckoutSessionResponse,
        { status: 200, statusText: 'OK' },
      );
      const result = await promise;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.stripeCheckoutUrl).toBe(
          'https://checkout.stripe.com/c/pay/cs_test_123',
        );
        expect(result.purchaseId).toBe('pur_abc');
      }
    });

    it('honours custom success_url + cancel_url overrides', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(
        service.createCheckoutSession({
          ...sampleReq,
          successUrl: 'https://example.test/success',
          cancelUrl: 'https://example.test/cancel',
        }),
      );
      const req = httpMock.expectOne(CHECKOUT_URL);
      expect(req.request.body.success_url).toBe('https://example.test/success');
      expect(req.request.body.cancel_url).toBe('https://example.test/cancel');
      req.flush(
        {
          purchase_id: 'pur_x',
          stripe_session_id: 'cs_x',
          stripe_checkout_url: 'https://checkout.stripe.com/cs_x',
          state: 'checkout_started',
        } satisfies CreateAddonCheckoutSessionResponse,
        { status: 200, statusText: 'OK' },
      );
      await promise;
    });

    it('maps 422 to kind:"validation-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.createCheckoutSession(sampleReq));
      httpMock
        .expectOne(CHECKOUT_URL)
        .flush(null, { status: 422, statusText: 'Unprocessable Entity' });
      const result = await promise;
      expect(result.kind).toBe('validation-error');
    });

    it('maps 400 to kind:"validation-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.createCheckoutSession(sampleReq));
      httpMock
        .expectOne(CHECKOUT_URL)
        .flush(null, { status: 400, statusText: 'Bad Request' });
      const result = await promise;
      expect(result.kind).toBe('validation-error');
    });

    it('maps 401 to kind:"unauthenticated"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.createCheckoutSession(sampleReq));
      httpMock
        .expectOne(CHECKOUT_URL)
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      const result = await promise;
      expect(result.kind).toBe('unauthenticated');
    });

    it('maps 502 to kind:"payments-down"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.createCheckoutSession(sampleReq));
      httpMock
        .expectOne(CHECKOUT_URL)
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const result = await promise;
      expect(result.kind).toBe('payments-down');
    });

    it('maps 503 to kind:"payments-down"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.createCheckoutSession(sampleReq));
      httpMock
        .expectOne(CHECKOUT_URL)
        .flush(null, { status: 503, statusText: 'Service Unavailable' });
      const result = await promise;
      expect(result.kind).toBe('payments-down');
    });

    it('maps status 0 to kind:"network-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.createCheckoutSession(sampleReq));
      httpMock
        .expectOne(CHECKOUT_URL)
        .flush(null, { status: 0, statusText: 'Network error' });
      const result = await promise;
      expect(result.kind).toBe('network-error');
    });
  });

  // -------------------------------------------------------------------------
  // CHO-1742 — Activate-Free path for $0 marketplace tiles
  // -------------------------------------------------------------------------
  describe('activateAddon', () => {
    it('issues a POST to the BFF activate alias with an empty body and surfaces success on 200', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.activateAddon(PLAN_ID));
      const req = httpMock.expectOne(ACTIVATE_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ id: 'sub-1', status: 'active' }, { status: 200, statusText: 'OK' });
      const result = await promise;
      expect(result.kind).toBe('success');
    });

    it('maps 404 to kind:"not-found"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.activateAddon(PLAN_ID));
      httpMock.expectOne(ACTIVATE_URL).flush(null, { status: 404, statusText: 'Not Found' });
      const result = await promise;
      expect(result.kind).toBe('not-found');
    });

    it('maps 422 to kind:"validation-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.activateAddon(PLAN_ID));
      httpMock
        .expectOne(ACTIVATE_URL)
        .flush(null, { status: 422, statusText: 'Unprocessable Entity' });
      const result = await promise;
      expect(result.kind).toBe('validation-error');
    });

    it('maps 401 to kind:"unauthenticated"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.activateAddon(PLAN_ID));
      httpMock
        .expectOne(ACTIVATE_URL)
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      const result = await promise;
      expect(result.kind).toBe('unauthenticated');
    });

    it('maps 5xx to kind:"server-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.activateAddon(PLAN_ID));
      httpMock
        .expectOne(ACTIVATE_URL)
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const result = await promise;
      expect(result.kind).toBe('server-error');
    });

    it('maps status 0 to kind:"network-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.activateAddon(PLAN_ID));
      httpMock
        .expectOne(ACTIVATE_URL)
        .flush(null, { status: 0, statusText: 'Network error' });
      const result = await promise;
      expect(result.kind).toBe('network-error');
    });
  });

  // -------------------------------------------------------------------------
  // CHO-1785 — undo a pending end-of-cycle deactivation
  // -------------------------------------------------------------------------
  describe('cancelScheduledDeactivation', () => {
    const freshSnapshot: AddOnSubscriptionSnapshot = {
      activated_at: '2026-06-08T00:00:00Z',
      current_tier: 'pro',
      status: 'ACTIVE',
      next_renewal_at: '2026-07-08T00:00:00Z',
      billing_cycle: 'MONTHLY',
    };

    it('POSTs an empty body to the :cancel-deactivation alias and surfaces the fresh snapshot', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.cancelScheduledDeactivation(PLAN_ID));
      const req = httpMock.expectOne(CANCEL_DEACTIVATION_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(freshSnapshot, { status: 200, statusText: 'OK' });
      const result = await promise;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.snapshot.status).toBe('ACTIVE');
        expect(result.snapshot.current_tier).toBe('pro');
      }
    });

    it('maps 401 to kind:"unauthenticated"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.cancelScheduledDeactivation(PLAN_ID));
      httpMock
        .expectOne(CANCEL_DEACTIVATION_URL)
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      const result = await promise;
      expect(result.kind).toBe('unauthenticated');
    });

    it('maps 403 to kind:"forbidden"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.cancelScheduledDeactivation(PLAN_ID));
      httpMock
        .expectOne(CANCEL_DEACTIVATION_URL)
        .flush(null, { status: 403, statusText: 'Forbidden' });
      const result = await promise;
      expect(result.kind).toBe('forbidden');
    });

    it('maps 404 to kind:"not-found"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.cancelScheduledDeactivation(PLAN_ID));
      httpMock
        .expectOne(CANCEL_DEACTIVATION_URL)
        .flush(null, { status: 404, statusText: 'Not Found' });
      const result = await promise;
      expect(result.kind).toBe('not-found');
    });

    it('maps 409 to kind:"already-deactivated"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.cancelScheduledDeactivation(PLAN_ID));
      httpMock
        .expectOne(CANCEL_DEACTIVATION_URL)
        .flush(null, { status: 409, statusText: 'Conflict' });
      const result = await promise;
      expect(result.kind).toBe('already-deactivated');
    });

    it('maps 5xx to kind:"server-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.cancelScheduledDeactivation(PLAN_ID));
      httpMock
        .expectOne(CANCEL_DEACTIVATION_URL)
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const result = await promise;
      expect(result.kind).toBe('server-error');
    });

    it('maps status 0 to kind:"network-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.cancelScheduledDeactivation(PLAN_ID));
      httpMock
        .expectOne(CANCEL_DEACTIVATION_URL)
        .flush(null, { status: 0, statusText: 'Network error' });
      const result = await promise;
      expect(result.kind).toBe('network-error');
    });
  });

  // -------------------------------------------------------------------------
  // CHO-1766 — preview the upcoming-invoice delta for a tier change
  // -------------------------------------------------------------------------
  describe('previewTierChange', () => {
    const requestBody: PreviewAddonTierRequest = {
      target_tier_code: 'pro',
      proration_mode: 'create_prorations',
      effective_at: null,
    };

    const previewResponse: PreviewAddonTierResponse = {
      from_tier: 'starter',
      to_tier: 'pro',
      current_monthly_cents: 1200,
      target_monthly_cents: 2400,
      billing_delta_cents: 1200,
      next_invoice_total_cents: 2400,
      proration_mode: 'create_prorations',
      effective_at: '2026-06-13T00:00:00Z',
      deferred_to_cycle_end: false,
      schedule_id: null,
      currency: 'SGD',
    };

    it('POSTs the preview body to the :preview-tier-change alias and surfaces kind:"success"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.previewTierChange(PLAN_ID, requestBody));
      const req = httpMock.expectOne(PREVIEW_TIER_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(requestBody);
      req.flush(previewResponse, { status: 200, statusText: 'OK' });
      const result = await promise;
      expect(result.kind).toBe('success');
      if (result.kind === 'success') {
        expect(result.response.billing_delta_cents).toBe(1200);
        expect(result.response.to_tier).toBe('pro');
      }
    });

    it('maps 422 no_stripe_subscription to kind:"no-stripe-subscription"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.previewTierChange(PLAN_ID, requestBody));
      httpMock
        .expectOne(PREVIEW_TIER_URL)
        .flush(
          { error: { code: 'no_stripe_subscription', message: 'row predates mode=subscription' } },
          { status: 422, statusText: 'Unprocessable Entity' },
        );
      const result = await promise;
      expect(result.kind).toBe('no-stripe-subscription');
    });

    it('maps 422 stripe_price_missing to kind:"stripe-price-missing"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.previewTierChange(PLAN_ID, requestBody));
      httpMock
        .expectOne(PREVIEW_TIER_URL)
        .flush(
          { error: { code: 'stripe_price_missing', message: 'no Price ID' } },
          { status: 422, statusText: 'Unprocessable Entity' },
        );
      const result = await promise;
      expect(result.kind).toBe('stripe-price-missing');
    });

    it('maps 422 with an unknown error code to kind:"validation-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.previewTierChange(PLAN_ID, requestBody));
      httpMock
        .expectOne(PREVIEW_TIER_URL)
        .flush(
          { error: { code: 'OTHER_CODE', message: 'x' } },
          { status: 422, statusText: 'Unprocessable Entity' },
        );
      const result = await promise;
      expect(result.kind).toBe('validation-error');
    });

    it('treats a non-object 422 body as plain validation-error (no error-code read)', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.previewTierChange(PLAN_ID, requestBody));
      httpMock
        .expectOne(PREVIEW_TIER_URL)
        .flush(5, { status: 422, statusText: 'Unprocessable Entity' });
      const result = await promise;
      expect(result.kind).toBe('validation-error');
    });

    it('treats a non-object error field in the 422 body as plain validation-error', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.previewTierChange(PLAN_ID, requestBody));
      httpMock
        .expectOne(PREVIEW_TIER_URL)
        .flush({ error: 42 }, { status: 422, statusText: 'Unprocessable Entity' });
      const result = await promise;
      expect(result.kind).toBe('validation-error');
    });

    it('treats a non-string error code in the 422 body as plain validation-error', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.previewTierChange(PLAN_ID, requestBody));
      httpMock
        .expectOne(PREVIEW_TIER_URL)
        .flush(
          { error: { code: 9009, message: 'x' } },
          { status: 422, statusText: 'Unprocessable Entity' },
        );
      const result = await promise;
      expect(result.kind).toBe('validation-error');
    });

    it('maps 404 to kind:"not-found"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.previewTierChange(PLAN_ID, requestBody));
      httpMock
        .expectOne(PREVIEW_TIER_URL)
        .flush(null, { status: 404, statusText: 'Not Found' });
      const result = await promise;
      expect(result.kind).toBe('not-found');
    });

    it('maps 401 to kind:"unauthenticated"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.previewTierChange(PLAN_ID, requestBody));
      httpMock
        .expectOne(PREVIEW_TIER_URL)
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      const result = await promise;
      expect(result.kind).toBe('unauthenticated');
    });

    it('maps 5xx to kind:"server-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.previewTierChange(PLAN_ID, requestBody));
      httpMock
        .expectOne(PREVIEW_TIER_URL)
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const result = await promise;
      expect(result.kind).toBe('server-error');
    });

    it('maps status 0 to kind:"network-error"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.previewTierChange(PLAN_ID, requestBody));
      httpMock
        .expectOne(PREVIEW_TIER_URL)
        .flush(null, { status: 0, statusText: 'Network error' });
      const result = await promise;
      expect(result.kind).toBe('network-error');
    });
  });

  // -------------------------------------------------------------------------
  // CHO-1766 — change-tier 422 sentinel-code branches (no_stripe_subscription
  // / stripe_price_missing) — the generic 422 validation-error path is
  // covered in the changeTier describe above.
  // -------------------------------------------------------------------------
  describe('changeTier 422 sentinel code branches', () => {
    const requestBody: ChangeAddonTierRequest = {
      target_plan_id: '019e0000-0000-7000-8000-cccccccccccc',
      proration_mode: 'create_prorations',
      effective_at: null,
    };

    it('maps 422 no_stripe_subscription to kind:"no-stripe-subscription"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.changeTier(PLAN_ID, requestBody));
      httpMock
        .expectOne(CHANGE_TIER_URL)
        .flush(
          { error: { code: 'no_stripe_subscription', message: 'row predates mode=subscription' } },
          { status: 422, statusText: 'Unprocessable Entity' },
        );
      const result = await promise;
      expect(result.kind).toBe('no-stripe-subscription');
    });

    it('maps 422 stripe_price_missing to kind:"stripe-price-missing"', async () => {
      const { service, httpMock } = setup();
      mock = httpMock;
      const promise = firstValueFrom(service.changeTier(PLAN_ID, requestBody));
      httpMock
        .expectOne(CHANGE_TIER_URL)
        .flush(
          { error: { code: 'stripe_price_missing', message: 'no Price ID' } },
          { status: 422, statusText: 'Unprocessable Entity' },
        );
      const result = await promise;
      expect(result.kind).toBe('stripe-price-missing');
    });
  });
});
