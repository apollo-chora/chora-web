/**
 * CollectionStore<T> — router-agnostic, per-finder query + result state.
 *
 * A plain class (NOT @Injectable) so each finder owns one instance — mirroring
 * the per-instance state of `chora-entity-picker` (inversion #2). Router sync
 * lives in the finder component, never here, keeping the store unit-testable
 * with a fake `CollectionDataSource` and no Angular Router.
 *
 * Fail-loud (no-stub): a failed search sets `status='error'` + a machine
 * `error` code and PRESERVES the prior items (never a silent empty list);
 * `reload()` / `retry` clears it. A request-sequence guard drops any stale
 * in-flight response so a slow earlier page can never overwrite a newer one.
 */
import { computed, signal } from '@angular/core';
import type { Subscription } from 'rxjs';

import { toggleSort } from './collection-query.util';
import {
  COLLECTION_ERROR_CODE,
  EMPTY_QUERY,
  type CollectionDataSource,
  type CollectionFacet,
  type CollectionQuery,
} from './collection-view.model';

/** Lifecycle status. `loadingMore` keeps the current table visible. */
export type CollectionStatus =
  | 'idle'
  | 'loading'
  | 'loadingMore'
  | 'loaded'
  | 'error';

export class CollectionStore<T> {
  private readonly source: CollectionDataSource<T>;

  // ── Backing signals ─────────────────────────────────────────────────────────
  private readonly _query = signal<CollectionQuery>(EMPTY_QUERY);
  private readonly _items = signal<readonly T[]>([]);
  private readonly _facets = signal<readonly CollectionFacet[]>([]);
  private readonly _totalEstimate = signal(0);
  private readonly _status = signal<CollectionStatus>('idle');
  private readonly _error = signal<string | null>(null);
  private readonly _nextCursor = signal<string | null>(null);

  // ── Public readonly surface ─────────────────────────────────────────────────
  readonly query = this._query.asReadonly();
  /** Accumulated rows across "load more" (replaced on any page-1 reload). */
  readonly items = this._items.asReadonly();
  readonly facets = this._facets.asReadonly();
  readonly totalEstimate = this._totalEstimate.asReadonly();
  readonly status = this._status.asReadonly();
  /** Machine error code (`COLLECTION_ERROR_CODE`) or null. */
  readonly error = this._error.asReadonly();
  readonly hasMore = computed(() => this._nextCursor() !== null);

  // ── Internals ────────────────────────────────────────────────────────────────
  private seq = 0;
  private sub: Subscription | null = null;

  constructor(source: CollectionDataSource<T>) {
    this.source = source;
  }

  /** Set the initial query (cursor forced to page 1) and load page 1. */
  init(query: CollectionQuery): void {
    this._query.set({ ...query, cursor: null });
    this.runPage1();
  }

  /** Replace the keyword and reload page 1. */
  setSearch(q: string): void {
    this._query.update((prev) => ({ ...prev, q, cursor: null }));
    this.runPage1();
  }

  /** Add/remove a facet value and reload page 1. */
  toggleFilter(field: string, value: string): void {
    this._query.update((prev) => ({
      ...prev,
      filters: toggleFilterValue(prev.filters, field, value),
      cursor: null,
    }));
    this.runPage1();
  }

  /** Cycle the primary sort for `field` (none→asc→desc→none) and reload page 1. */
  setSort(field: string): void {
    this._query.update((prev) => ({
      ...prev,
      sort: toggleSort(prev.sort, field),
      cursor: null,
    }));
    this.runPage1();
  }

  /** Clear keyword + filters (keep sort + limit) and reload — empty-state CTA. */
  clearFilters(): void {
    this._query.update((prev) => ({ ...prev, q: '', filters: {}, cursor: null }));
    this.runPage1();
  }

  /** Reload page 1 with the current query (replace items, clear any error). */
  reload(): void {
    this._query.update((prev) => ({ ...prev, cursor: null }));
    this.runPage1();
  }

  /** Append the next page; no-op when there is no next cursor or a load is in flight. */
  loadMore(): void {
    const cursor = this._nextCursor();
    if (cursor === null) {
      return;
    }
    const status = this._status();
    if (status === 'loading' || status === 'loadingMore') {
      return;
    }
    this._status.set('loadingMore');
    this.dispatch({ ...this._query(), cursor }, ++this.seq, true);
  }

  /** Cancel any in-flight request — call from the owning component's destroy. */
  destroy(): void {
    this.sub?.unsubscribe();
    this.sub = null;
  }

  // ── Internal dispatch ────────────────────────────────────────────────────────

  private runPage1(): void {
    this._status.set('loading');
    this._error.set(null);
    this.dispatch({ ...this._query(), cursor: null }, ++this.seq, false);
  }

  private dispatch(query: CollectionQuery, seq: number, append: boolean): void {
    this.sub?.unsubscribe();
    this.sub = this.source.search(query).subscribe({
      next: (page) => {
        if (seq !== this.seq) {
          return; // a newer request superseded this one
        }
        this._items.set(append ? [...this._items(), ...page.items] : page.items);
        this._facets.set(page.facets);
        this._totalEstimate.set(page.totalEstimate);
        this._nextCursor.set(page.nextCursor);
        this._error.set(null);
        this._status.set('loaded');
      },
      error: () => {
        if (seq !== this.seq) {
          return; // stale failure: ignore
        }
        // Fail-loud: surface the error, keep prior items/facets/total intact.
        this._error.set(COLLECTION_ERROR_CODE);
        this._status.set('error');
      },
    });
  }
}

/**
 * Immutably toggle `value` within `filters[field]`. Removing the last value
 * drops the field key entirely (keeps the filter map + URL encoding clean).
 */
function toggleFilterValue(
  filters: Readonly<Record<string, readonly string[]>>,
  field: string,
  value: string,
): Record<string, readonly string[]> {
  const current = filters[field] ?? [];
  const nextValues = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  const next: Record<string, readonly string[]> = { ...filters };
  if (nextValues.length > 0) {
    next[field] = nextValues;
  } else {
    delete next[field];
  }
  return next;
}
