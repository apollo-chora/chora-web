/**
 * MockEntitySearchAdapter — in-memory `EntitySearchPort` for chora-entity-picker
 * (CHO-1833 B0). Backs the component specs, the Storybook stories, and a
 * dev-registered default. NO real BFF (that is B2).
 *
 * Configurable to exercise every state the picker must render: substring
 * filtering, facet filtering, cursor pagination, simulated latency, and
 * fail-loud errors. Also a lightweight spy (records the last call) so specs can
 * assert what the picker forwarded.
 */
import { type Provider } from '@angular/core';
import { type Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';

import { ENTITY_SEARCH_PORTS } from './entity-search.registry';
import type {
  EntityFacets,
  EntityRef,
  EntitySearchPage,
  EntitySearchPort,
  EntityType,
} from './entity-picker.model';

/** Construction config for {@link MockEntitySearchAdapter}. */
export interface MockSearchConfig {
  /** Entity kind this adapter answers for. */
  readonly entityType: EntityType;
  /** Full in-memory corpus; `search` filters this by query + facets. */
  readonly rows: readonly EntityRef[];
  /** Page size for cursor pagination (default: whole corpus = single page). */
  readonly pageSize?: number;
  /** Simulated latency in ms before emission (default: 0 = synchronous). */
  readonly delayMs?: number;
  /** When set, `search` emits an error carrying this message (fail-loud test). */
  readonly failWith?: string | null;
}

export class MockEntitySearchAdapter implements EntitySearchPort {
  readonly entityType: EntityType;

  /** Mutable so a single instance can be re-pointed across stories/specs. */
  rows: readonly EntityRef[];
  pageSize: number;
  delayMs: number;
  failWith: string | null;

  // ── Spy state ────────────────────────────────────────────────────────────
  searchCallCount = 0;
  resolveCallCount = 0;
  lastQuery: string | null = null;
  lastFacets: EntityFacets | null = null;
  lastCursor: string | null = null;
  lastResolveIds: readonly string[] | null = null;

  constructor(config: MockSearchConfig) {
    this.entityType = config.entityType;
    this.rows = config.rows;
    this.pageSize = config.pageSize ?? Math.max(config.rows.length, 1);
    this.delayMs = config.delayMs ?? 0;
    this.failWith = config.failWith ?? null;
  }

  search(
    q: string,
    facets: EntityFacets,
    cursor: string | null,
  ): Observable<EntitySearchPage> {
    this.searchCallCount += 1;
    this.lastQuery = q;
    this.lastFacets = facets;
    this.lastCursor = cursor;

    if (this.failWith) {
      const message = this.failWith;
      return this.maybeDelay(throwError(() => new Error(message)));
    }

    const needle = q.trim().toLowerCase();
    const matched = this.rows.filter(
      (row) => this.matchesQuery(row, needle) && this.matchesFacets(row, facets),
    );
    const offset = this.parseCursor(cursor);
    const items = matched.slice(offset, offset + this.pageSize);
    const nextOffset = offset + this.pageSize;
    const nextCursor = nextOffset < matched.length ? String(nextOffset) : null;

    return this.maybeDelay(of<EntitySearchPage>({ items, nextCursor }));
  }

  resolve(ids: readonly string[]): Observable<readonly EntityRef[]> {
    this.resolveCallCount += 1;
    this.lastResolveIds = ids;
    const byId = new Map(this.rows.map((row) => [row.id, row]));
    const hydrated = ids
      .map((id) => byId.get(id))
      .filter((row): row is EntityRef => row !== undefined);
    return this.maybeDelay(of<readonly EntityRef[]>(hydrated));
  }

  private maybeDelay<T>(obs: Observable<T>): Observable<T> {
    return this.delayMs > 0 ? obs.pipe(delay(this.delayMs)) : obs;
  }

  private matchesQuery(row: EntityRef, needle: string): boolean {
    if (needle.length === 0) {
      return true;
    }
    if (row.label.toLowerCase().includes(needle)) {
      return true;
    }
    return row.sublabel?.toLowerCase().includes(needle) ?? false;
  }

  private matchesFacets(row: EntityRef, facets: EntityFacets): boolean {
    const keys = Object.keys(facets);
    if (keys.length === 0) {
      return true;
    }
    return keys.every((key) => {
      const want = facets[key];
      const have = row.meta?.[key];
      return have !== undefined && String(have) === want;
    });
  }

  private parseCursor(cursor: string | null): number {
    if (!cursor) {
      return 0;
    }
    const parsed = Number.parseInt(cursor, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
}

/**
 * Register one or more mock adapters under the `ENTITY_SEARCH_PORTS`
 * multi-provider — for dev bootstrapping and Storybook `moduleMetadata`.
 */
export function provideMockEntitySearchPorts(
  ...adapters: readonly MockEntitySearchAdapter[]
): Provider[] {
  return adapters.map((adapter) => ({
    provide: ENTITY_SEARCH_PORTS,
    useValue: adapter,
    multi: true,
  }));
}
