import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { FamiliarEggsEditComponent } from './familiar-eggs-edit.component';
import { TranslateService } from '../../../../core/services/translate.service';
import type { AdminEggCatalogEntry } from '../../../../core/familiar/familiar-growth.model';

const ENTRY_URL = '/api/v1/familiar-eggs/admin/catalog/egg.standard.v1';
const SAVE_URL = '/api/v1/familiar-eggs/admin/catalog';

/**
 * The FULL catalogue entry, as chora-tenancy's admin read returns it. The
 * editor round-trips this whole object back through the upsert, so the spec
 * carries every field: anything the component drops on save is a field it
 * silently wipes off a live SKU.
 */
const ENTRY: AdminEggCatalogEntry = {
  sku: 'egg.standard.v1',
  displayName: 'Standard Pod',
  description: 'The starter pod',
  priceCents: 999,
  currency: 'SGD',
  suggestedFocalAtomId: '',
  breedDistribution: { owl: 28, fox: 27, penguin: 25, dragon: 12, phoenix: 8 },
  purchasable: true,
  isTrial: false,
  softExpiryDays: 30,
  hardExpiryDays: 60,
  odds: [
    { species: 'owl', probability: 28, rarity: 'common' },
    { species: 'fox', probability: 27, rarity: 'common' },
    { species: 'penguin', probability: 25, rarity: 'common' },
    { species: 'dragon', probability: 12, rarity: 'rare' },
    { species: 'phoenix', probability: 8, rarity: 'legendary' },
  ],
  distributionUpdatedAt: '2026-08-30T00:00:00Z',
};

function flushEntry(httpMock: HttpTestingController, body: AdminEggCatalogEntry = ENTRY): void {
  httpMock.expectOne((r) => r.url.endsWith(ENTRY_URL)).flush({ data: body });
}

function setup(sku = 'egg.standard.v1') {
  TestBed.configureTestingModule({
    imports: [FamiliarEggsEditComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({ sku })),
          snapshot: { paramMap: convertToParamMap({ sku }) },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(FamiliarEggsEditComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, el: fixture.nativeElement as HTMLElement, httpMock };
}

describe('FamiliarEggsEditComponent (H+ admin SKU editor)', () => {
  let httpMock: HttpTestingController;
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  function ready() {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushEntry(httpMock);
    s.fixture.detectChanges();
    return s;
  }

  // ── D6a: the slider list ────────────────────────────────────────────────
  // The screen offered eight sliders drawn from the PRE-CHO-2032 gacha roster.
  // Four of those breeds were retired from the roll authority, and penguin, one
  // of the five live hero species, had no slider at all. A distribution saved
  // through it either failed validation on an unknown species or silently
  // dropped penguin from the SKU.
  it('renders a slider for each of the five canonical hero species', () => {
    const s = ready();
    for (const breed of ['owl', 'fox', 'dragon', 'phoenix', 'penguin']) {
      expect(
        s.el.querySelector(`[data-testid="hplus-eggs-edit-range-${breed}"]`),
        `missing slider for hero species ${breed}`,
      ).not.toBeNull();
    }
  });

  it('offers NO slider for a breed CHO-2032 retired from the roll', () => {
    const s = ready();
    for (const retired of ['cat', 'turtle', 'wolf', 'raven']) {
      expect(
        s.el.querySelector(`[data-testid="hplus-eggs-edit-range-${retired}"]`),
        `retired breed ${retired} still has a slider`,
      ).toBeNull();
    }
  });

  // ── D6b: the save ───────────────────────────────────────────────────────
  // save() used to be a setTimeout that flipped a "saved" pill and called
  // nothing at all.
  it('POSTs the edited distribution to the admin upsert', () => {
    const s = ready();
    const dragon = s.el.querySelector(
      '[data-testid="hplus-eggs-edit-num-dragon"]',
    ) as HTMLInputElement;
    dragon.value = '20';
    dragon.dispatchEvent(new Event('input'));
    const owl = s.el.querySelector(
      '[data-testid="hplus-eggs-edit-num-owl"]',
    ) as HTMLInputElement;
    owl.value = '20';
    owl.dispatchEvent(new Event('input'));
    s.fixture.detectChanges();

    (s.el.querySelector('[data-testid="hplus-eggs-edit-save"]') as HTMLButtonElement).click();
    s.fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url.endsWith(SAVE_URL));
    expect(req.request.method).toBe('POST');
    const sent = req.request.body as Record<string, unknown>;
    expect((sent['breedDistribution'] as Record<string, number>)['dragon']).toBe(20);
    expect((sent['breedDistribution'] as Record<string, number>)['penguin']).toBe(25);
    req.flush({ data: ENTRY });
    s.fixture.detectChanges();
  });

  // The upsert replaces the WHOLE row, so anything the editor fails to send
  // back is wiped off a live SKU. This is the guard for that.
  it('round-trips every field the upsert consumes, not just the odds', () => {
    const s = ready();
    (s.el.querySelector('[data-testid="hplus-eggs-edit-save"]') as HTMLButtonElement).click();
    s.fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url.endsWith(SAVE_URL));
    const sent = req.request.body as Record<string, unknown>;
    expect(sent['sku']).toBe('egg.standard.v1');
    expect(sent['displayName']).toBe('Standard Pod');
    expect(sent['description']).toBe('The starter pod');
    expect(sent['priceCents']).toBe(999);
    expect(sent['currency']).toBe('SGD');
    expect(sent['purchasable']).toBe(true);
    expect(sent['isTrial']).toBe(false);
    expect(sent['softExpiryDays']).toBe(30);
    expect(sent['hardExpiryDays']).toBe(60);
    req.flush({ data: ENTRY });
    s.fixture.detectChanges();
  });

  it('reports a refused save honestly and claims no success', () => {
    const s = ready();
    (s.el.querySelector('[data-testid="hplus-eggs-edit-save"]') as HTMLButtonElement).click();
    s.fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url.endsWith(SAVE_URL))
      .flush(
        { error: { code: 'validation_failed', message: 'distribution must total 100' } },
        { status: 400, statusText: 'Bad Request' },
      );
    s.fixture.detectChanges();

    expect(s.el.querySelector('[data-testid="hplus-eggs-edit-error"]')).not.toBeNull();
    expect(s.el.querySelector('[data-testid="hplus-eggs-edit-saved"]')).toBeNull();
    expect(s.fixture.componentInstance.savedAt()).toBeNull();
  });

  it('marks saved only after the backend confirms', () => {
    const s = ready();
    (s.el.querySelector('[data-testid="hplus-eggs-edit-save"]') as HTMLButtonElement).click();
    s.fixture.detectChanges();
    expect(s.fixture.componentInstance.savedAt()).toBeNull();
    httpMock.expectOne((r) => r.url.endsWith(SAVE_URL)).flush({ data: ENTRY });
    s.fixture.detectChanges();
    expect(s.fixture.componentInstance.savedAt()).not.toBeNull();
  });

  // ── preserved behaviour ─────────────────────────────────────────────────
  it('shows balanced state at 100', () => {
    const s = ready();
    const total = s.el.querySelector('[data-testid="hplus-eggs-edit-total"]');
    expect(total?.classList.contains('is-balanced')).toBe(true);
  });

  it('disables Save when the total is not 100', () => {
    const s = ready();
    const dragon = s.el.querySelector(
      '[data-testid="hplus-eggs-edit-num-dragon"]',
    ) as HTMLInputElement;
    dragon.value = '50';
    dragon.dispatchEvent(new Event('input'));
    s.fixture.detectChanges();
    expect(
      (s.el.querySelector('[data-testid="hplus-eggs-edit-save"]') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('rebalance brings the total back to 100', () => {
    const s = ready();
    const dragon = s.el.querySelector(
      '[data-testid="hplus-eggs-edit-num-dragon"]',
    ) as HTMLInputElement;
    dragon.value = '50';
    dragon.dispatchEvent(new Event('input'));
    s.fixture.detectChanges();
    (s.el.querySelector('[data-testid="hplus-eggs-edit-rebalance"]') as HTMLButtonElement).click();
    s.fixture.detectChanges();
    expect(s.fixture.componentInstance.totalWeight()).toBe(100);
  });
});
