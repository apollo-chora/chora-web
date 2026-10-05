/**
 * `paginate` — a pure, order-agnostic collection-pagination primitive.
 *
 * Born with the A+ dashboard "continue learning" wrapper (SP2.6) but written to
 * be the reusable GENERIC COLLECTION pattern: any >3-item wrapper that needs a
 * "See more → 10/page with a ‹ Page x of N › pager" affordance can slice its
 * (already-ordered) list through this and bind straight to the returned `Page`.
 * It owns none of the ordering — the caller supplies the array in display order.
 *
 * Invariants the callers rely on (so the view can stay dumb):
 *  - `pageCount` is always >= 1 — an empty collection is still "Page 1 of 1".
 *  - `pageIndex` is CLAMPED into `[0, pageCount - 1]` — an out-of-range request
 *    never throws and never yields an empty slice off the end.
 *  - `pageSize` < 1 is coerced to 1 — a render helper must never divide by zero.
 *  - `hasPrev` / `hasNext` derive from the CLAMPED index, so ‹ / › disable
 *    exactly at the ends.
 *  - The input array is never mutated (a fresh slice is returned).
 */
export interface Page<T> {
  /** The slice of items for the (clamped) current page. */
  readonly items: readonly T[];
  /** The clamped 0-based page index actually shown. */
  readonly pageIndex: number;
  /** Total number of pages — always >= 1. */
  readonly pageCount: number;
  /** The effective page size (coerced to >= 1). */
  readonly pageSize: number;
  /** Total items across all pages. */
  readonly total: number;
  /** True when a previous page exists (‹ is enabled). */
  readonly hasPrev: boolean;
  /** True when a next page exists (› is enabled). */
  readonly hasNext: boolean;
}

export function paginate<T>(
  items: readonly T[],
  pageSize: number,
  pageIndex: number,
): Page<T> {
  const size = Math.max(1, Math.floor(pageSize) || 1);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const clamped = Math.min(Math.max(0, Math.floor(pageIndex) || 0), pageCount - 1);
  const start = clamped * size;

  return {
    items: items.slice(start, start + size),
    pageIndex: clamped,
    pageCount,
    pageSize: size,
    total,
    hasPrev: clamped > 0,
    hasNext: clamped < pageCount - 1,
  };
}
