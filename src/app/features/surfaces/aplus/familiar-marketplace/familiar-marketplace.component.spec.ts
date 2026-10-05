import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';

import { FamiliarMarketplaceComponent } from './familiar-marketplace.component';
import { TranslateService } from '../../../../core/services/translate.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';

/**
 * Per the 2026-05-16 no-stubs / no-mock-fallback directive,
 * FamiliarGrowthService is fail-loud — the catalog must be flushed with
 * a real `{ data: EggCatalogResponse }` envelope. Once the catalog
 * resolves, the grid renders the chora-egg-card list AND each card's
 * EggOddsTable lazily fires its own /odds GET only when "show odds" is
 * clicked. The default render path here does NOT request odds, so we
 * only need to flush the catalog GET; the `[data-testid="egg-card-*"]`
 * test IDs are emitted by EggCardComponent itself (no inner http).
 */
const CATALOG_PAYLOAD = {
  data: {
    skus: [
      {
        sku: 'egg.standard.v1',
        displayName: 'Standard Egg',
        description: 'Eight breeds possible.',
        priceMicros: 9_990_000,
        currency: 'USD',
        includedInManaTier: 'standard',
      },
      {
        sku: 'egg.legendary.v1',
        displayName: 'Legendary Egg',
        description: 'Dragon and Phoenix weighted higher.',
        priceMicros: 49_990_000,
        currency: 'USD',
      },
      {
        sku: 'egg.trial.v1',
        displayName: 'Trial Egg',
        description: 'Your first egg is free.',
        priceMicros: 0,
        currency: 'USD',
      },
      {
        sku: 'egg.skillflow-cspo.v1',
        displayName: 'SkillFlow CSPO Egg',
        description: 'Tenant-branded for SkillFlow Academy.',
        priceMicros: 9_990_000,
        currency: 'USD',
        brandedTenantName: 'SkillFlow Academy',
      },
    ],
  },
};

function flushCatalog(httpMock: HttpTestingController): void {
  for (const r of httpMock.match((r) => r.url.includes('/catalog'))) {
    r.flush(CATALOG_PAYLOAD);
  }
}

describe('FamiliarMarketplaceComponent', () => {
  let fixture: ComponentFixture<FamiliarMarketplaceComponent>;
  let el: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [FamiliarMarketplaceComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        TranslateService,
      ],
    });
    fixture = TestBed.createComponent(FamiliarMarketplaceComponent);
    httpMock = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('renders 4 SKUs after the catalog GET resolves', () => {
    fixture.detectChanges();
    flushCatalog(httpMock);
    fixture.detectChanges();

    const cards = el.querySelectorAll('chora-egg-card');
    expect(cards.length).toBe(4);
  });

  it('renders the lootbox-transparency footer', () => {
    fixture.detectChanges();
    flushCatalog(httpMock);
    fixture.detectChanges();
    expect(
      el.querySelector('[data-testid="aplus-marketplace-footer"]'),
    ).not.toBeNull();
    expect(
      el.querySelector('[data-testid="aplus-marketplace-policy-link"]'),
    ).not.toBeNull();
  });

  it('exposes the standard / legendary / trial / skillflow SKUs as test IDs', () => {
    fixture.detectChanges();
    flushCatalog(httpMock);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="egg-card-egg.standard.v1"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="egg-card-egg.legendary.v1"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="egg-card-egg.trial.v1"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="egg-card-egg.skillflow-cspo.v1"]')).not.toBeNull();
  });

  // ── CHO-2034: the free Trial Egg (priceMicros 0) must NOT hit the paid
  // Stripe checkout (403 sku_not_purchasable). It routes to the sovereign
  // free-claim lane (fetch a target map → dev_hatched acquire) and surfaces
  // every outcome as a friendly toast — never a console-only 403. ──

  it('trial claim (free) fetches a target map then POSTs the dev_hatched acquire (not Stripe checkout) and navigates to that map', () => {
    fixture.detectChanges();
    flushCatalog(httpMock);
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    el.querySelector<HTMLButtonElement>(
      '[data-testid="egg-card-checkout-egg.trial.v1"]',
    )!.click();

    // 1. resolve a target map (a map with no Familiar yet).
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/maps') && r.method === 'GET')
      .flush({ items: [{ goalId: 'g-1', title: 'Photosynthesis' }] });

    // 2. acquire+bind WITHOUT Stripe (dev_hatched), NOT the paid checkout.
    const acq = httpMock.expectOne(
      (r) =>
        r.url.includes('/api/v1/me/familiars/acquire') && r.method === 'POST',
    );
    const body = acq.request.body as { goalId: string; mode: string };
    expect(body.goalId).toBe('g-1');
    expect(body.mode).toBe('dev_hatched');
    acq.flush({ familiarId: 'f-new', goalId: 'g-1', growthStage: 1 });

    // The paid checkout lane is never touched for a free egg.
    httpMock.expectNone((r) => r.url.includes('/familiar-eggs/checkout'));
    expect(nav).toHaveBeenCalledWith('/a/knowledge/g-1');
  });

  it('paid egg still POSTs the Stripe checkout (unchanged) — not the free-claim acquire lane', () => {
    fixture.detectChanges();
    flushCatalog(httpMock);
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    el.querySelector<HTMLButtonElement>(
      '[data-testid="egg-card-checkout-egg.standard.v1"]',
    )!.click();

    const co = httpMock.expectOne(
      (r) =>
        r.url.includes('/api/v1/familiar-eggs/checkout') && r.method === 'POST',
    );
    expect((co.request.body as { sku: string }).sku).toBe('egg.standard.v1');
    // In-app mock URL keeps the redirect on the Angular router (no window.assign).
    co.flush({
      data: { stripeCheckoutUrl: '/a/companion/egg/mock-1', purchaseId: 'p-1' },
    });

    httpMock.expectNone((r) => r.url.includes('/me/familiars/acquire'));
  });

  it('trial claim with no eligible map shows a friendly toast (never a console-only 403) and does not acquire', () => {
    fixture.detectChanges();
    flushCatalog(httpMock);
    fixture.detectChanges();

    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    el.querySelector<HTMLButtonElement>(
      '[data-testid="egg-card-checkout-egg.trial.v1"]',
    )!.click();

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/maps'))
      .flush({ items: [] });

    // No map to bind → no acquire attempt; a friendly error toast is shown.
    httpMock.expectNone((r) => r.url.includes('/me/familiars/acquire'));
    expect(toastSpy).toHaveBeenCalledWith(
      'aplus.familiar_marketplace.claim_no_map',
      'error',
    );
  });

  it('trial claim rejected by the server (409 one-per-learner) surfaces a friendly error toast, not a console-only 403 — AC2', () => {
    fixture.detectChanges();
    flushCatalog(httpMock);
    fixture.detectChanges();

    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    el.querySelector<HTMLButtonElement>(
      '[data-testid="egg-card-checkout-egg.trial.v1"]',
    )!.click();

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/maps'))
      .flush({ items: [{ goalId: 'g-1', title: 'Photosynthesis' }] });
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/familiars/acquire'))
      .flush(
        { error: { code: 'FAMILIAR_CAP_REACHED', message: 'already claimed' } },
        { status: 409, statusText: 'Conflict' },
      );

    expect(toastSpy).toHaveBeenCalledWith(
      'aplus.familiar_marketplace.claim_error',
      'error',
    );
    // A server rejection keeps the learner on the marketplace (no bounce).
    expect(nav).not.toHaveBeenCalled();
  });

  it('paid checkout failure surfaces a friendly error toast (was previously swallowed)', () => {
    fixture.detectChanges();
    flushCatalog(httpMock);
    fixture.detectChanges();

    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    el.querySelector<HTMLButtonElement>(
      '[data-testid="egg-card-checkout-egg.standard.v1"]',
    )!.click();

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/familiar-eggs/checkout'))
      .flush(
        { error: { code: 'server_error', message: 'boom' } },
        { status: 500, statusText: 'Server Error' },
      );

    expect(toastSpy).toHaveBeenCalledWith(
      'aplus.familiar_marketplace.checkout_error',
      'error',
    );
  });
});
