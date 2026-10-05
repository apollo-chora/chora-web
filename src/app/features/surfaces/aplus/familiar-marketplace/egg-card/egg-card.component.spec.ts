import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { EggCardComponent } from './egg-card.component';
import { TranslateService } from '../../../../../core/services/translate.service';

function mount(sku: {
  sku: string;
  displayName: string;
  description: string;
  priceMicros: number;
  currency: string;
  brandedTenantName?: string;
  includedInManaTier?: 'basic' | 'standard' | 'premium';
}) {
  TestBed.configureTestingModule({
    imports: [EggCardComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), TranslateService],
  });
  const fixture = TestBed.createComponent(EggCardComponent);
  fixture.componentRef.setInput('sku', sku);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

function flushHttp(): void {
  const httpMock = TestBed.inject(HttpTestingController);
  for (let i = 0; i < 3; i++) {
    httpMock.match(() => true).forEach((r) =>
      r.error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' }),
    );
  }
}

describe('EggCardComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('renders Trial Egg with FREE price + claim CTA', () => {
    const { el } = mount({
      sku: 'egg.trial.v1',
      displayName: 'Trial Egg',
      description: 'Free first egg',
      priceMicros: 0,
      currency: 'USD',
    });
    expect(
      el.querySelector('[data-testid="egg-card-price"]')?.textContent ?? '',
    ).toContain('FREE');
    // The FREE TRIAL header badge was removed (owner 2026-07-16 — it pushed the
    // trial card's title below the paid tiers'); the free tier is still signalled
    // by the FREE price + claim CTA + dashed card border.
    expect(
      el.querySelector('[data-testid="egg-card-trial-chip"]'),
    ).toBeNull();
    expect(
      el.querySelector('[data-testid="egg-card-checkout-egg.trial.v1"]'),
    ).not.toBeNull();
  });

  it('renders Standard Egg with formatted dollar price', () => {
    const { el } = mount({
      sku: 'egg.standard.v1',
      displayName: 'Standard Egg',
      description: 'Eight breeds possible.',
      priceMicros: 9990000,
      currency: 'USD',
    });
    expect(
      el.querySelector('[data-testid="egg-card-price"]')?.textContent ?? '',
    ).toContain('$9.99');
    expect(
      el.querySelector('[data-testid="egg-card-trial-chip"]'),
    ).toBeNull();
  });

  it('renders per-tier POD art (trial / standard / premium)', () => {
    const artSrc = (sku: string, priceMicros: number): string => {
      TestBed.resetTestingModule();
      const { el } = mount({
        sku,
        displayName: 'X',
        description: 'd',
        priceMicros,
        currency: 'SGD',
      });
      return (
        el.querySelector<HTMLImageElement>('.egg-card__art')?.getAttribute('src') ??
        ''
      );
    };
    expect(artSrc('egg.trial.v1', 0)).toContain('pod-trial.png');
    expect(artSrc('egg.standard.v1', 9990000)).toContain('pod-standard.png');
    expect(artSrc('egg.premium.v1', 29990000)).toContain('pod-premium.png');
  });

  it('shows the tenant-branded chip when brandedTenantName is set', () => {
    const { el } = mount({
      sku: 'egg.skillflow.v1',
      displayName: 'SkillFlow Sprint Egg',
      description: 'Branded.',
      priceMicros: 9990000,
      currency: 'USD',
      brandedTenantName: 'SkillFlow Academy',
    });
    expect(
      el.querySelector('[data-testid="egg-card-tenant-chip"]')?.textContent ?? '',
    ).toContain('SkillFlow Academy');
  });

  it('reveals odds table on "Show odds" click', () => {
    const { fixture, el } = mount({
      sku: 'egg.standard.v1',
      displayName: 'Standard Egg',
      description: 'Eight breeds possible.',
      priceMicros: 9990000,
      currency: 'USD',
    });
    expect(el.querySelector('chora-egg-odds-table')).toBeNull();
    expect(el.querySelector('[data-testid="egg-card-show-odds"]')).not.toBeNull();
    (
      el.querySelector('[data-testid="egg-card-show-odds"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(el.querySelector('chora-egg-odds-table')).not.toBeNull();
    flushHttp();
  });

  it('emits checkoutRequested with the sku on Choose-this-egg click', () => {
    const { fixture, el } = mount({
      sku: 'egg.standard.v1',
      displayName: 'Standard Egg',
      description: 'Eight breeds possible.',
      priceMicros: 9990000,
      currency: 'USD',
    });
    let capturedSku: string | null = null;
    fixture.componentInstance.checkoutRequested.subscribe(
      (sku: { sku: string }) => (capturedSku = sku.sku),
    );
    (
      el.querySelector(
        '[data-testid="egg-card-checkout-egg.standard.v1"]',
      ) as HTMLButtonElement
    ).click();
    expect(capturedSku).toBe('egg.standard.v1');
  });

  // --- currencySymbol switch arms (reached via priceDisplay) ---

  it('formats SGD price with the S$ symbol', () => {
    const { el } = mount({
      sku: 'egg.sgd.v1',
      displayName: 'SGD Egg',
      description: 'Priced in SGD.',
      priceMicros: 12500000,
      currency: 'SGD',
    });
    expect(
      el.querySelector('[data-testid="egg-card-price"]')?.textContent ?? '',
    ).toContain('S$12.50');
  });

  it('formats EUR price with the € symbol', () => {
    const { el } = mount({
      sku: 'egg.eur.v1',
      displayName: 'EUR Egg',
      description: 'Priced in EUR.',
      priceMicros: 5000000,
      currency: 'EUR',
    });
    expect(
      el.querySelector('[data-testid="egg-card-price"]')?.textContent ?? '',
    ).toContain('€5.00');
  });

  it('formats GBP price with the £ symbol', () => {
    const { el } = mount({
      sku: 'egg.gbp.v1',
      displayName: 'GBP Egg',
      description: 'Priced in GBP.',
      priceMicros: 7990000,
      currency: 'GBP',
    });
    expect(
      el.querySelector('[data-testid="egg-card-price"]')?.textContent ?? '',
    ).toContain('£7.99');
  });

  it('formats an unknown currency with the code + space fallback (default switch arm)', () => {
    const { el } = mount({
      sku: 'egg.aud.v1',
      displayName: 'AUD Egg',
      description: 'Priced in an unmapped currency.',
      priceMicros: 3000000,
      currency: 'AUD',
    });
    // default arm returns the ORIGINAL-case `code` (not the toUpperCase'd value
    // used for matching) + a trailing space, e.g. "AUD 3.00".
    expect(
      el.querySelector('[data-testid="egg-card-price"]')?.textContent ?? '',
    ).toContain('AUD 3.00');
  });

  // --- mana-tier template @if truthy arm ---

  it('renders the mana-tier inclusion chip when includedInManaTier is set', () => {
    const { el } = mount({
      sku: 'egg.standard.v1',
      displayName: 'Standard Egg',
      description: 'Included in a mana tier.',
      priceMicros: 9990000,
      currency: 'USD',
      includedInManaTier: 'premium',
    });
    expect(
      el.querySelector('[data-testid="egg-card-mana-tier"]'),
    ).not.toBeNull();
  });

  it('omits the mana-tier chip when includedInManaTier is absent (falsy @if arm)', () => {
    const { el } = mount({
      sku: 'egg.standard.v1',
      displayName: 'Standard Egg',
      description: 'No mana tier.',
      priceMicros: 9990000,
      currency: 'USD',
    });
    expect(el.querySelector('[data-testid="egg-card-mana-tier"]')).toBeNull();
  });
});
