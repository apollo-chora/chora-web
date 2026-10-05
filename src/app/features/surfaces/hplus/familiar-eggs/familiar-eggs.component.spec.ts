import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { FamiliarEggsComponent } from './familiar-eggs.component';
import { TranslateService } from '../../../../core/services/translate.service';
import type { EggCatalogResponse } from '../../../../core/familiar/familiar-growth.model';

/**
 * Per ADR-149 §"Breed lootbox + transparency" — 4 canonical SKUs in
 * the catalog including the free Trial Egg. The mock fallback in
 * FamiliarGrowthService was stripped 2026-05-16 per the no-debts
 * directive, so specs now flush an envelope-wrapped success response
 * via HttpTestingController instead of relying on a fail-loud fallback.
 */
const MOCK_CATALOG: EggCatalogResponse = {
  skus: [
    {
      sku: 'egg.trial.v1',
      displayName: 'Trial Egg',
      description: 'Free first Familiar — no breed weighting.',
      priceMicros: 0,
      currency: 'USD',
      includedInManaTier: 'basic',
    },
    {
      sku: 'egg.standard.v1',
      displayName: 'Standard Egg',
      description: 'Balanced 8-breed distribution.',
      priceMicros: 4_990_000,
      currency: 'USD',
      includedInManaTier: 'standard',
    },
    {
      sku: 'egg.premium.v1',
      displayName: 'Premium Egg',
      description: 'Higher rare/legendary odds.',
      priceMicros: 9_990_000,
      currency: 'USD',
      includedInManaTier: 'premium',
    },
    {
      sku: 'egg.branded.acme.v1',
      displayName: 'ACME Branded Egg',
      description: 'Tenant-branded reskin of standard odds.',
      priceMicros: 4_990_000,
      currency: 'USD',
      brandedTenantName: 'ACME',
    },
  ],
};

function flushCatalog(
  httpMock: HttpTestingController,
  body: EggCatalogResponse = MOCK_CATALOG,
): void {
  for (const r of httpMock.match((req) =>
    req.url.endsWith('/api/v1/familiar-eggs/catalog'),
  )) {
    r.flush({ data: body });
  }
}

describe('FamiliarEggsComponent (H+ admin SKU list)', () => {
  let httpMock: HttpTestingController;
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [FamiliarEggsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        TranslateService,
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });
  afterEach(() => httpMock.verify());

  it('renders all 4 mock SKUs in the table', () => {
    const fixture = TestBed.createComponent(FamiliarEggsComponent);
    fixture.detectChanges();
    flushCatalog(httpMock);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('[data-testid^="hplus-eggs-row-"]').length).toBe(4);
  });

  it('exposes an edit link per row', () => {
    const fixture = TestBed.createComponent(FamiliarEggsComponent);
    fixture.detectChanges();
    flushCatalog(httpMock);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const edit = el.querySelector(
      '[data-testid="hplus-eggs-edit-egg.standard.v1"]',
    );
    expect(edit?.getAttribute('href')).toBe('/h/marketplace/companion-eggs/egg.standard.v1');
  });
});
