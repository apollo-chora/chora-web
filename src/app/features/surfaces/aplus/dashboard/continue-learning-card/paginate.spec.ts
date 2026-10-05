import { describe, it, expect } from 'vitest';

import { paginate, type Page } from './paginate';

/**
 * `paginate` — the pure, order-agnostic collection-pagination primitive behind
 * the A+ dashboard "continue learning" wrapper (SP2.6) and reusable by any
 * >3-item collection wrapper (the generic collection pattern). It slices an
 * already-ordered array into a stable page window and reports the navigation
 * affordances (prev/next enabled, page-of-N) so the view stays dumb.
 *
 * Contract highlights the specs pin down:
 *  - `pageCount` is always >= 1 (an empty collection is still "Page 1 of 1").
 *  - `pageIndex` is CLAMPED into `[0, pageCount-1]` (out-of-range never throws).
 *  - `pageSize` < 1 is coerced to 1 (a render helper must never divide by zero).
 *  - `hasPrev`/`hasNext` derive from the CLAMPED index, so ‹ › disable at ends.
 */
describe('paginate', () => {
  const items = (n: number): readonly number[] =>
    Array.from({ length: n }, (_, i) => i);

  it('returns a single empty page for an empty collection', () => {
    const p: Page<number> = paginate([], 10, 0);
    expect(p.items).toEqual([]);
    expect(p.total).toBe(0);
    expect(p.pageCount).toBe(1);
    expect(p.pageIndex).toBe(0);
    expect(p.hasPrev).toBe(false);
    expect(p.hasNext).toBe(false);
  });

  it('fits a below-page-size collection on one page (no prev/next)', () => {
    const p = paginate(items(3), 10, 0);
    expect(p.items).toEqual([0, 1, 2]);
    expect(p.pageCount).toBe(1);
    expect(p.hasPrev).toBe(false);
    expect(p.hasNext).toBe(false);
  });

  it('splits an exact multiple into full pages', () => {
    const first = paginate(items(20), 10, 0);
    expect(first.items).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(first.pageCount).toBe(2);
    expect(first.hasPrev).toBe(false);
    expect(first.hasNext).toBe(true);

    const second = paginate(items(20), 10, 1);
    expect(second.items).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(second.hasPrev).toBe(true);
    expect(second.hasNext).toBe(false);
  });

  it('puts the remainder on a short final page', () => {
    const last = paginate(items(25), 10, 2);
    expect(last.items).toEqual([20, 21, 22, 23, 24]);
    expect(last.pageCount).toBe(3);
    expect(last.pageIndex).toBe(2);
    expect(last.hasNext).toBe(false);
    expect(last.hasPrev).toBe(true);
  });

  it('clamps an over-range pageIndex to the last page', () => {
    const p = paginate(items(25), 10, 99);
    expect(p.pageIndex).toBe(2);
    expect(p.items).toEqual([20, 21, 22, 23, 24]);
    expect(p.hasNext).toBe(false);
  });

  it('clamps a negative pageIndex to the first page', () => {
    const p = paginate(items(25), 10, -5);
    expect(p.pageIndex).toBe(0);
    expect(p.items).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(p.hasPrev).toBe(false);
  });

  it('coerces a non-positive pageSize to 1 (never divides by zero)', () => {
    const p = paginate(items(3), 0, 0);
    expect(p.pageSize).toBe(1);
    expect(p.pageCount).toBe(3);
    expect(p.items).toEqual([0]);
    expect(p.hasNext).toBe(true);
  });

  it('does not mutate the input array', () => {
    const src = items(12);
    const copy = [...src];
    paginate(src, 10, 1);
    expect(src).toEqual(copy);
  });
});
