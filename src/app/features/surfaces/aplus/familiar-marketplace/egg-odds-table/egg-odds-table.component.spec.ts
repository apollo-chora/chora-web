import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { EggOddsTableComponent } from './egg-odds-table.component';
import { TranslateService } from '../../../../../core/services/translate.service';

/**
 * Per the 2026-05-16 no-stubs / no-mock-fallback directive, the
 * FamiliarGrowthService is fail-loud. Tests must flush a real envelope
 * `{ data: PreviewEggOddsResponse }` via HttpTestingController; erroring
 * the request would leave the table in the empty/loading state and the
 * row assertions would fail.
 */
const STANDARD_ODDS = {
  data: {
    eggSku: 'egg.standard.v1',
    odds: [
      { species: 'owl', probability: 25, rarity: 'common' },
      { species: 'fox', probability: 25, rarity: 'common' },
      { species: 'cat', probability: 15, rarity: 'common' },
      { species: 'turtle', probability: 12, rarity: 'common' },
      { species: 'wolf', probability: 10, rarity: 'uncommon' },
      { species: 'raven', probability: 8, rarity: 'uncommon' },
      { species: 'phoenix', probability: 4, rarity: 'rare' },
      { species: 'dragon', probability: 1, rarity: 'legendary' },
    ],
    totalWeight: 100,
    distributionUpdatedAt: '2026-05-13T00:00:00Z',
  },
};

const LEGENDARY_ODDS = {
  data: {
    eggSku: 'egg.legendary.v1',
    odds: [
      { species: 'dragon', probability: 30, rarity: 'legendary' },
      { species: 'phoenix', probability: 30, rarity: 'legendary' },
      { species: 'raven', probability: 15, rarity: 'rare' },
      { species: 'wolf', probability: 10, rarity: 'rare' },
      { species: 'owl', probability: 5, rarity: 'uncommon' },
      { species: 'fox', probability: 5, rarity: 'uncommon' },
      { species: 'cat', probability: 3, rarity: 'common' },
      { species: 'turtle', probability: 2, rarity: 'common' },
    ],
    totalWeight: 100,
    distributionUpdatedAt: '2026-05-13T00:00:00Z',
  },
};

/**
 * Odds payload carrying an UNKNOWN rarity string ("mythic" is not in
 * RARITY_ORDER). Drives the `RARITY_ORDER[x.rarity] ?? 99` fallback arm
 * when sorting by rarity. The wire is loosely typed (HttpTestingController
 * flush accepts arbitrary JSON), so the unknown rarity is permissible at
 * the boundary even though BreedOdds.rarity is a narrower compile-time type.
 */
const UNKNOWN_RARITY_ODDS = {
  data: {
    eggSku: 'egg.mystery.v1',
    odds: [
      { species: 'owl', probability: 40, rarity: 'mythic' },
      { species: 'fox', probability: 35, rarity: 'common' },
      { species: 'cat', probability: 25, rarity: 'rare' },
    ],
    totalWeight: 100,
    distributionUpdatedAt: '2026-05-13T00:00:00Z',
  },
};

/**
 * Odds payload with NO distributionUpdatedAt → the computed `?? ''`
 * fallback fires and the template `@if (distributionUpdatedAt())` takes
 * its false (no `<time>`) arm even though the response loaded.
 */
const NO_TIMESTAMP_ODDS = {
  data: {
    eggSku: 'egg.notimestamp.v1',
    odds: [{ species: 'owl', probability: 100, rarity: 'common' }],
    totalWeight: 100,
    distributionUpdatedAt: '',
  },
};

function flushOdds(
  httpMock: HttpTestingController,
  payload: Record<string, unknown>,
): void {
  for (const r of httpMock.match((r) => r.url.includes('/odds'))) {
    r.flush(payload);
  }
}

function errorOdds(httpMock: HttpTestingController): void {
  for (const r of httpMock.match((r) => r.url.includes('/odds'))) {
    r.flush(
      { error: { code: 'fam_odds_unavailable', message: 'odds backend down' } },
      { status: 503, statusText: 'Service Unavailable' },
    );
  }
}

describe('EggOddsTableComponent (IMDA D2 disclosure)', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [EggOddsTableComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TranslateService,
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function mount(sku: string) {
    const fixture = TestBed.createComponent(EggOddsTableComponent);
    fixture.componentRef.setInput('sku', sku);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('renders the standard-egg odds table with 8 rows, sorted descending', () => {
    const { fixture, el } = mount('egg.standard.v1');
    flushOdds(httpMock, STANDARD_ODDS);
    fixture.detectChanges();
    const rows = el.querySelectorAll('.odds-row');
    expect(rows.length).toBe(8);
    // First row should be the highest probability (25% — owl or fox).
    const firstPct = rows[0].querySelector('.odds-row__pct')?.textContent ?? '';
    expect(firstPct).toContain('25');
  });

  it('shows the compliance line', () => {
    const { fixture, el } = mount('egg.standard.v1');
    flushOdds(httpMock, STANDARD_ODDS);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="odds-compliance"]')).not.toBeNull();
  });

  it('switches to rarity sort and puts legendary first', () => {
    const { fixture, el } = mount('egg.standard.v1');
    flushOdds(httpMock, STANDARD_ODDS);
    fixture.detectChanges();
    (el.querySelector('[data-testid="sort-rarity"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const firstRow = el.querySelector('.odds-row');
    expect(firstRow?.getAttribute('data-rarity')).toBe('legendary');
  });

  it('switches to alphabetic sort by species', () => {
    const { fixture, el } = mount('egg.standard.v1');
    flushOdds(httpMock, STANDARD_ODDS);
    fixture.detectChanges();
    (el.querySelector('[data-testid="sort-species"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const firstRow = el.querySelector('.odds-row');
    expect(firstRow?.getAttribute('data-species')).toBe('cat');
  });

  it('legendary SKU weights DRAGON and PHOENIX highest in default sort', () => {
    const { fixture, el } = mount('egg.legendary.v1');
    flushOdds(httpMock, LEGENDARY_ODDS);
    fixture.detectChanges();
    const firstRow = el.querySelector('.odds-row');
    const species = firstRow?.getAttribute('data-species');
    expect(['dragon', 'phoenix']).toContain(species);
  });

  // --- error / empty-state arms (effect error cb + null-response guards) ---

  it('keeps the loading state and emits no rows when the odds fetch errors', () => {
    // Hits the effect.subscribe({ error }) branch → oddsResponse stays null,
    // which in turn drives the `if (!resp) return []` guard in odds(),
    // isLoaded() === false, and the totalWeight()/distributionUpdatedAt()
    // null-coalescing fallbacks.
    const { fixture, el } = mount('egg.standard.v1');
    errorOdds(httpMock);
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.isLoaded()).toBe(false);
    expect(cmp.odds()).toEqual([]);
    expect(cmp.totalWeight()).toBe(0);
    expect(cmp.distributionUpdatedAt()).toBe('');

    // Template takes the !isLoaded() arm: loading status shown, no rows.
    expect(el.querySelector('[role="status"]')).not.toBeNull();
    expect(el.querySelectorAll('.odds-row').length).toBe(0);
    expect(el.querySelector('[data-testid="odds-rows"]')).toBeNull();
  });

  it('falls back to weight 99 for an unknown rarity when sorting by rarity', () => {
    // Drives the `RARITY_ORDER[x.rarity] ?? 99` nullish-coalescing arm:
    // the "mythic" rarity is absent from RARITY_ORDER, so it sorts LAST
    // (weight 99) behind the known rare/common entries.
    const { fixture, el } = mount('egg.mystery.v1');
    flushOdds(httpMock, UNKNOWN_RARITY_ODDS);
    fixture.detectChanges();

    (el.querySelector('[data-testid="sort-rarity"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const rows = el.querySelectorAll('.odds-row');
    expect(rows.length).toBe(3);
    // rare (1) first, common (3) second, mythic (??99) pushed last.
    expect(rows[0].getAttribute('data-rarity')).toBe('rare');
    expect(rows[2].getAttribute('data-rarity')).toBe('mythic');
  });

  it('omits the updated-at line when the distribution timestamp is empty', () => {
    // distributionUpdatedAt() resolves to '' (falsy) → the template
    // `@if (distributionUpdatedAt())` takes its false arm: no <time>.
    const { fixture, el } = mount('egg.notimestamp.v1');
    flushOdds(httpMock, NO_TIMESTAMP_ODDS);
    fixture.detectChanges();

    expect(fixture.componentInstance.isLoaded()).toBe(true);
    expect(fixture.componentInstance.distributionUpdatedAt()).toBe('');
    expect(el.querySelector('.odds-table__updated')).toBeNull();
    // The total-weight + compliance lines still render in the loaded footer.
    expect(el.querySelector('.odds-table__total')).not.toBeNull();
    expect(el.querySelector('[data-testid="odds-compliance"]')).not.toBeNull();
  });

  it('re-fetches and re-renders when the sku input changes (effect re-run)', () => {
    // Exercises the effect's onCleanup/re-subscribe path when sku() changes.
    const { fixture, el } = mount('egg.standard.v1');
    flushOdds(httpMock, STANDARD_ODDS);
    fixture.detectChanges();
    expect(el.querySelectorAll('.odds-row').length).toBe(8);

    fixture.componentRef.setInput('sku', 'egg.legendary.v1');
    fixture.detectChanges();
    flushOdds(httpMock, LEGENDARY_ODDS);
    fixture.detectChanges();

    const firstRow = el.querySelector('.odds-row');
    expect(['dragon', 'phoenix']).toContain(firstRow?.getAttribute('data-species'));
  });

  it('isSort() reports the active mode true and the others false', () => {
    // Covers both arms of isSort()'s equality predicate.
    const { fixture } = mount('egg.standard.v1');
    flushOdds(httpMock, STANDARD_ODDS);
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.isSort('probability-desc')).toBe(true);
    expect(cmp.isSort('rarity')).toBe(false);

    cmp.setSortMode('species');
    expect(cmp.isSort('species')).toBe(true);
    expect(cmp.isSort('probability-desc')).toBe(false);
  });
});
