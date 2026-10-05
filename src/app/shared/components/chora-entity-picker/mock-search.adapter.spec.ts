import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  MockEntitySearchAdapter,
  provideMockEntitySearchPorts,
} from './mock-search.adapter';
import {
  EntitySearchRegistry,
  ENTITY_SEARCH_PORTS,
} from './entity-search.registry';
import type {
  EntityFacets,
  EntityRef,
  EntitySearchPage,
} from './entity-picker.model';

const ROWS: readonly EntityRef[] = [
  { id: 'c1', label: 'Algebra Foundations', sublabel: 'MATH', meta: { level: 'beginner' } },
  { id: 'c2', label: 'Algebra Advanced', sublabel: 'MATH', meta: { level: 'advanced' } },
  { id: 'c3', label: 'Singapore History', sublabel: 'HUM', meta: { level: 'beginner' } },
  { id: 'c4', label: 'Organic Chemistry', sublabel: 'SCI', meta: { level: 'advanced' } },
];

function collect(obs: ReturnType<MockEntitySearchAdapter['search']>): EntitySearchPage {
  let page: EntitySearchPage | null = null;
  obs.subscribe((p) => (page = p));
  if (page === null) throw new Error('no synchronous emission');
  return page;
}

describe('MockEntitySearchAdapter', () => {
  it('exposes the configured entityType', () => {
    const adapter = new MockEntitySearchAdapter({ entityType: 'course', rows: ROWS });
    expect(adapter.entityType).toBe('course');
  });

  it('filters rows by case-insensitive substring on label', () => {
    const adapter = new MockEntitySearchAdapter({ entityType: 'course', rows: ROWS });
    const page = collect(adapter.search('algebra', {}, null));
    expect(page.items.map((r) => r.id)).toEqual(['c1', 'c2']);
  });

  it('also matches on sublabel', () => {
    const adapter = new MockEntitySearchAdapter({ entityType: 'course', rows: ROWS });
    const page = collect(adapter.search('hum', {}, null));
    expect(page.items.map((r) => r.id)).toEqual(['c3']);
  });

  it('returns an empty page when nothing matches', () => {
    const adapter = new MockEntitySearchAdapter({ entityType: 'course', rows: ROWS });
    const page = collect(adapter.search('zzz-nomatch', {}, null));
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it('applies facets as meta-equality filters', () => {
    const adapter = new MockEntitySearchAdapter({ entityType: 'course', rows: ROWS });
    const facets: EntityFacets = { level: 'advanced' };
    const page = collect(adapter.search('algebra', facets, null));
    expect(page.items.map((r) => r.id)).toEqual(['c2']);
  });

  it('paginates by cursor and reports nextCursor until exhausted', () => {
    const adapter = new MockEntitySearchAdapter({
      entityType: 'course',
      rows: ROWS,
      pageSize: 2,
    });
    const first = collect(adapter.search('a', {}, null));
    expect(first.items.map((r) => r.id)).toEqual(['c1', 'c2']);
    expect(first.nextCursor).toBe('2');
    const second = collect(adapter.search('a', {}, first.nextCursor));
    // 'a' matches Algebra x2, Singapore (has 'a'), Organic Chemistry (has 'a') = all 4
    expect(second.items.map((r) => r.id)).toEqual(['c3', 'c4']);
    expect(second.nextCursor).toBeNull();
  });

  it('records the last query / facets / cursor and call count (spy state)', () => {
    const adapter = new MockEntitySearchAdapter({ entityType: 'course', rows: ROWS });
    const facets: EntityFacets = { level: 'beginner' };
    collect(adapter.search('hist', facets, '0'));
    expect(adapter.searchCallCount).toBe(1);
    expect(adapter.lastQuery).toBe('hist');
    expect(adapter.lastFacets).toEqual(facets);
    expect(adapter.lastCursor).toBe('0');
  });

  it('emits an error observable when failWith is set', () => {
    const adapter = new MockEntitySearchAdapter({
      entityType: 'course',
      rows: ROWS,
      failWith: 'boom',
    });
    let errored: unknown = null;
    adapter.search('algebra', {}, null).subscribe({ error: (e) => (errored = e) });
    expect(errored).toBeInstanceOf(Error);
    expect((errored as Error).message).toBe('boom');
  });

  it('resolve() hydrates refs for the given ids and records the call', () => {
    const adapter = new MockEntitySearchAdapter({ entityType: 'course', rows: ROWS });
    let out: readonly EntityRef[] = [];
    adapter.resolve(['c3', 'c1', 'missing']).subscribe((r) => (out = r));
    expect(out.map((r) => r.id)).toEqual(['c3', 'c1']);
    expect(adapter.resolveCallCount).toBe(1);
    expect(adapter.lastResolveIds).toEqual(['c3', 'c1', 'missing']);
  });

  describe('delayMs (async emission under fake timers)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('defers the search emission by delayMs', () => {
      const adapter = new MockEntitySearchAdapter({
        entityType: 'course',
        rows: ROWS,
        delayMs: 250,
      });
      let page: EntitySearchPage | null = null;
      adapter.search('algebra', {}, null).subscribe((p) => (page = p));
      expect(page).toBeNull();
      vi.advanceTimersByTime(300);
      expect(page).not.toBeNull();
      expect(page!.items.map((r) => r.id)).toEqual(['c1', 'c2']);
    });
  });

  describe('provideMockEntitySearchPorts (dev/Storybook registration)', () => {
    beforeEach(() => TestBed.resetTestingModule());

    it('registers adapters under the ENTITY_SEARCH_PORTS multi-token', () => {
      const courseAdapter = new MockEntitySearchAdapter({
        entityType: 'course',
        rows: ROWS,
      });
      TestBed.configureTestingModule({
        providers: [provideMockEntitySearchPorts(courseAdapter)],
      });
      const registry = TestBed.inject(EntitySearchRegistry);
      expect(registry.resolve('course')).toBe(courseAdapter);
      const ports = TestBed.inject(ENTITY_SEARCH_PORTS);
      expect(ports).toContain(courseAdapter);
    });
  });
});
