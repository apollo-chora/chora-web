/**
 * Pure, framework-light helpers over `CollectionQuery` — sort (de)serialise +
 * toggle, BFF `HttpParams` builder, and bidirectional URL (Router `Params`)
 * sync. All functions are pure (no I/O, no mutation of inputs) and fully unit
 * tested in `collection-query.util.spec.ts`.
 */
import { HttpParams } from '@angular/common/http';
import type { Params } from '@angular/router';

import {
  DEFAULT_PAGE_LIMIT,
  type CollectionQuery,
  type SortDir,
  type SortKey,
} from './collection-view.model';

const VALID_DIRS: ReadonlySet<string> = new Set<SortDir>(['asc', 'desc']);

// URL filter encoding separators. Offering facet values are constrained
// identifiers (`graduate`/`DRAFT`/…) so these never collide with a value.
const FILTER_GROUP_SEP = ';';
const FILTER_KV_SEP = ':';
const FILTER_VALUE_SEP = ',';

/**
 * Parse a `field:dir,field:dir` sort string into keys. Blank tokens and any
 * token without a valid `asc|desc` direction are ignored (never throws).
 */
export function parseSort(raw: string): SortKey[] {
  if (!raw) {
    return [];
  }
  const keys: SortKey[] = [];
  for (const token of raw.split(',')) {
    const trimmed = token.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const sep = trimmed.indexOf(FILTER_KV_SEP);
    if (sep <= 0) {
      continue;
    }
    const field = trimmed.slice(0, sep).trim();
    const dir = trimmed.slice(sep + 1).trim();
    if (field.length === 0 || !VALID_DIRS.has(dir)) {
      continue;
    }
    keys.push({ field, dir: dir as SortDir });
  }
  return keys;
}

/** Serialise sort keys to the `field:dir,field:dir` wire/URL form. */
export function serializeSort(sort: readonly SortKey[]): string {
  return sort.map((key) => `${key.field}${FILTER_KV_SEP}${key.dir}`).join(FILTER_VALUE_SEP);
}

/**
 * Toggle the primary sort for `field`, cycling none → asc → desc → none.
 *
 * P0 keeps multi-sort simple: there is one primary key. Clicking a DIFFERENT
 * field replaces the primary (asc); clicking the current primary cycles its
 * direction and drops it on the third click. The `CollectionQuery.sort` array
 * type stays multi-key so P1 can extend this without a breaking change.
 */
export function toggleSort(sort: readonly SortKey[], field: string): SortKey[] {
  const primary = sort.length > 0 ? sort[0] : null;
  if (!primary || primary.field !== field) {
    return [{ field, dir: 'asc' }];
  }
  if (primary.dir === 'asc') {
    return [{ field, dir: 'desc' }];
  }
  return [];
}

/**
 * Build the BFF query string for `GET /api/v1/search/<entity>`:
 * `q` (omitted when blank), repeated `filter[<field>]`, `sort` (omitted when
 * empty so the BE applies its default), `cursor` (omitted when null), `limit`
 * (always sent).
 */
export function queryToHttpParams(query: CollectionQuery): HttpParams {
  let params = new HttpParams();
  const q = query.q.trim();
  if (q.length > 0) {
    params = params.set('q', q);
  }
  for (const field of Object.keys(query.filters)) {
    for (const value of query.filters[field]) {
      params = params.append(`filter[${field}]`, value);
    }
  }
  const sort = serializeSort(query.sort);
  if (sort.length > 0) {
    params = params.set('sort', sort);
  }
  if (query.cursor !== null && query.cursor.length > 0) {
    params = params.set('cursor', query.cursor);
  }
  params = params.set('limit', String(query.limit));
  return params;
}

/**
 * Project the durable (shareable) slice of a query to Router `Params`:
 * `q` + `filters` + `sort` + non-default `limit`. The cursor is ephemeral and
 * intentionally excluded. Each owned key is either set or explicitly `null`
 * (which clears it) so the finder can navigate with
 * `queryParamsHandling: 'merge'` without leaking a stale filter.
 */
export function queryToRouterParams(query: CollectionQuery): Params {
  const q = query.q.trim();
  const filters = encodeFilters(query.filters);
  const sort = serializeSort(query.sort);
  return {
    q: q.length > 0 ? q : null,
    filters: filters.length > 0 ? filters : null,
    sort: sort.length > 0 ? sort : null,
    limit: query.limit !== DEFAULT_PAGE_LIMIT ? String(query.limit) : null,
  };
}

/**
 * Rebuild a query from Router `Params` (page 1 — cursor reset to null). Unknown
 * / malformed params degrade to defaults; never throws.
 */
export function queryFromRouterParams(params: Params): CollectionQuery {
  const q = typeof params['q'] === 'string' ? params['q'] : '';
  const filters = decodeFilters(typeof params['filters'] === 'string' ? params['filters'] : '');
  const sort = parseSort(typeof params['sort'] === 'string' ? params['sort'] : '');
  const limit = parseLimit(params['limit']);
  return { q, filters, sort, cursor: null, limit };
}

// ── Internal: filter (de)serialisation ───────────────────────────────────────

/** `{delivery_type:['graduate','short'], state:['DRAFT']}` → `delivery_type:graduate,short;state:DRAFT`. */
function encodeFilters(filters: Readonly<Record<string, readonly string[]>>): string {
  return Object.keys(filters)
    .filter((field) => filters[field] && filters[field].length > 0)
    .sort() // stable, deterministic URLs
    .map((field) => `${field}${FILTER_KV_SEP}${filters[field].join(FILTER_VALUE_SEP)}`)
    .join(FILTER_GROUP_SEP);
}

function decodeFilters(raw: string): Record<string, readonly string[]> {
  const out: Record<string, readonly string[]> = {};
  if (raw.length === 0) {
    return out;
  }
  for (const group of raw.split(FILTER_GROUP_SEP)) {
    const sep = group.indexOf(FILTER_KV_SEP);
    if (sep <= 0) {
      continue;
    }
    const field = group.slice(0, sep).trim();
    const values = group
      .slice(sep + 1)
      .split(FILTER_VALUE_SEP)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (field.length > 0 && values.length > 0) {
      out[field] = values;
    }
  }
  return out;
}

function parseLimit(raw: unknown): number {
  if (typeof raw !== 'string') {
    return DEFAULT_PAGE_LIMIT;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PAGE_LIMIT;
}
