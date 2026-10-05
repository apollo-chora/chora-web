import { describe, it, expect, beforeEach } from 'vitest';
import { Observable, type Subscriber } from 'rxjs';

import { CollectionStore } from './collection-store';
import {
  COLLECTION_ERROR_CODE,
  EMPTY_QUERY,
  type CollectionDataSource,
  type CollectionPage,
  type CollectionQuery,
} from './collection-view.model';

interface Row {
  readonly id: string;
  readonly name: string;
}

const r = (id: string): Row => ({ id, name: `row-${id}` });

/**
 * Fake source recording each `search` call's query + observer. It deliberately
 * installs no teardown, so an UNSUBSCRIBED request can still be emitted — this
 * is what exercises the store's sequence guard (not just RxJS unsubscribe).
 */
class FakeSource implements CollectionDataSource<Row> {
  readonly key = 'fake';
  readonly calls: { query: CollectionQuery; observer: Subscriber<CollectionPage<Row>> }[] = [];

  search(query: CollectionQuery): Observable<CollectionPage<Row>> {
    return new Observable<CollectionPage<Row>>((observer) => {
      this.calls.push({ query, observer });
    });
  }

  get count(): number {
    return this.calls.length;
  }

  lastQuery(): CollectionQuery {
    return this.calls[this.calls.length - 1].query;
  }

  emit(page: Partial<CollectionPage<Row>>, index = this.calls.length - 1): void {
    const observer = this.calls[index].observer;
    observer.next({ items: [], facets: [], nextCursor: null, totalEstimate: 0, ...page });
    observer.complete();
  }

  fail(index = this.calls.length - 1): void {
    this.calls[index].observer.error(new Error('boom'));
  }
}

describe('CollectionStore', () => {
  let source: FakeSource;
  let store: CollectionStore<Row>;

  beforeEach(() => {
    source = new FakeSource();
    store = new CollectionStore<Row>(source);
  });

  it('starts idle with no items and no more pages', () => {
    expect(store.status()).toBe('idle');
    expect(store.items()).toEqual([]);
    expect(store.hasMore()).toBe(false);
  });

  describe('init / page 1', () => {
    it('loads page 1, exposes items + facets + totalEstimate + hasMore', () => {
      store.init(EMPTY_QUERY);
      expect(source.count).toBe(1);
      expect(store.status()).toBe('loading');

      source.emit({
        items: [r('1'), r('2')],
        facets: [{ field: 'state', values: [{ value: 'DRAFT', label: 'DRAFT', count: 2 }] }],
        nextCursor: 'cursor-2',
        totalEstimate: 42,
      });

      expect(store.status()).toBe('loaded');
      expect(store.items()).toEqual([r('1'), r('2')]);
      expect(store.facets().length).toBe(1);
      expect(store.totalEstimate()).toBe(42);
      expect(store.hasMore()).toBe(true);
      expect(store.error()).toBeNull();
    });

    it('forces the initial query to page 1 (cursor reset)', () => {
      store.init({ ...EMPTY_QUERY, cursor: 'should-be-dropped', q: 'graph' });
      expect(source.lastQuery().cursor).toBeNull();
      expect(source.lastQuery().q).toBe('graph');
    });
  });

  describe('loadMore', () => {
    beforeEach(() => {
      store.init(EMPTY_QUERY);
      source.emit({ items: [r('1'), r('2')], nextCursor: 'cursor-2', totalEstimate: 3 });
    });

    it('appends the next page using the cursor and updates hasMore', () => {
      store.loadMore();
      expect(source.count).toBe(2);
      expect(store.status()).toBe('loadingMore');
      expect(source.lastQuery().cursor).toBe('cursor-2');

      source.emit({ items: [r('3')], nextCursor: null, totalEstimate: 3 });
      expect(store.items()).toEqual([r('1'), r('2'), r('3')]);
      expect(store.hasMore()).toBe(false);
      expect(store.status()).toBe('loaded');
    });

    it('is a no-op when there is no next cursor', () => {
      store.reload(); // fresh page-1 request on a new observer
      source.emit({ items: [r('1')], nextCursor: null });
      expect(store.hasMore()).toBe(false);
      const before = source.count;
      store.loadMore();
      expect(source.count).toBe(before);
    });

    it('is a no-op while a load is already in flight', () => {
      store.loadMore(); // now loadingMore, page-2 in flight
      const before = source.count;
      store.loadMore();
      expect(source.count).toBe(before);
    });
  });

  describe('query mutations reset the cursor and replace page 1', () => {
    beforeEach(() => {
      store.init(EMPTY_QUERY);
      source.emit({ items: [r('1'), r('2')], nextCursor: 'cursor-2', totalEstimate: 9 });
    });

    it('setSearch replaces items and resets the cursor', () => {
      store.setSearch('graph');
      expect(source.lastQuery().q).toBe('graph');
      expect(source.lastQuery().cursor).toBeNull();
      source.emit({ items: [r('9')], nextCursor: null });
      expect(store.items()).toEqual([r('9')]); // replaced, not appended
    });

    it('toggleFilter adds then removes a value', () => {
      store.toggleFilter('delivery_type', 'graduate');
      expect(source.lastQuery().filters).toEqual({ delivery_type: ['graduate'] });
      source.emit({ items: [r('5')] });

      store.toggleFilter('delivery_type', 'graduate');
      expect(source.lastQuery().filters).toEqual({});
    });

    it('setSort cycles the primary sort key', () => {
      store.setSort('label');
      expect(source.lastQuery().sort).toEqual([{ field: 'label', dir: 'asc' }]);
      expect(source.lastQuery().cursor).toBeNull();
    });

    it('clearFilters wipes keyword + filters', () => {
      store.setSearch('x');
      source.emit({ items: [] });
      store.toggleFilter('state', 'DRAFT');
      source.emit({ items: [] });

      store.clearFilters();
      expect(source.lastQuery().q).toBe('');
      expect(source.lastQuery().filters).toEqual({});
    });
  });

  describe('fail-loud error handling', () => {
    it('surfaces an error code + status and PRESERVES prior items', () => {
      store.init(EMPTY_QUERY);
      source.emit({ items: [r('1'), r('2')], nextCursor: null, totalEstimate: 2 });

      store.reload();
      source.fail();

      expect(store.status()).toBe('error');
      expect(store.error()).toBe(COLLECTION_ERROR_CODE);
      expect(store.items()).toEqual([r('1'), r('2')]); // not blanked
    });

    it('reload clears the prior error', () => {
      store.init(EMPTY_QUERY);
      source.fail();
      expect(store.status()).toBe('error');

      store.reload();
      expect(store.status()).toBe('loading');
      expect(store.error()).toBeNull();
      source.emit({ items: [r('7')] });
      expect(store.status()).toBe('loaded');
    });
  });

  describe('race safety (sequence guard)', () => {
    it('drops a stale response from a superseded request', () => {
      store.init(EMPTY_QUERY); // request #0 (seq 1)
      store.setSearch('b'); // request #1 (seq 2) — supersedes #0

      // newer request resolves first
      source.emit({ items: [r('b')], totalEstimate: 1 }, 1);
      expect(store.items()).toEqual([r('b')]);

      // stale earlier request resolves late — must be ignored
      source.emit({ items: [r('a')], totalEstimate: 99 }, 0);
      expect(store.items()).toEqual([r('b')]);
      expect(store.totalEstimate()).toBe(1);
    });
  });

  it('destroy() cancels in flight work without throwing', () => {
    store.init(EMPTY_QUERY);
    expect(() => store.destroy()).not.toThrow();
  });
});
