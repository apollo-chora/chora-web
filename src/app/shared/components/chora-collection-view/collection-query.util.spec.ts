import { describe, it, expect } from 'vitest';

import {
  parseSort,
  serializeSort,
  toggleSort,
  queryToHttpParams,
  queryToRouterParams,
  queryFromRouterParams,
} from './collection-query.util';
import {
  DEFAULT_PAGE_LIMIT,
  EMPTY_QUERY,
  type CollectionQuery,
} from './collection-view.model';

function query(over: Partial<CollectionQuery> = {}): CollectionQuery {
  return { ...EMPTY_QUERY, ...over };
}

describe('parseSort', () => {
  it('parses a single field:dir token', () => {
    expect(parseSort('created_at:desc')).toEqual([{ field: 'created_at', dir: 'desc' }]);
  });

  it('parses multiple comma-separated keys preserving order', () => {
    expect(parseSort('label:asc,created_at:desc')).toEqual([
      { field: 'label', dir: 'asc' },
      { field: 'created_at', dir: 'desc' },
    ]);
  });

  it('ignores blank tokens and surrounding whitespace', () => {
    expect(parseSort(' label:asc , , created_at:desc ')).toEqual([
      { field: 'label', dir: 'asc' },
      { field: 'created_at', dir: 'desc' },
    ]);
  });

  it('drops tokens with an invalid or missing direction', () => {
    expect(parseSort('label:sideways,created_at,foo:asc')).toEqual([
      { field: 'foo', dir: 'asc' },
    ]);
  });

  it('returns [] for empty / whitespace input', () => {
    expect(parseSort('')).toEqual([]);
    expect(parseSort('   ')).toEqual([]);
  });
});

describe('serializeSort', () => {
  it('round-trips with parseSort', () => {
    const raw = 'label:asc,created_at:desc';
    expect(serializeSort(parseSort(raw))).toBe(raw);
  });

  it('serialises [] to empty string', () => {
    expect(serializeSort([])).toBe('');
  });
});

describe('toggleSort', () => {
  it('none → asc when the field is new', () => {
    expect(toggleSort([], 'label')).toEqual([{ field: 'label', dir: 'asc' }]);
  });

  it('asc → desc on the same field', () => {
    expect(toggleSort([{ field: 'label', dir: 'asc' }], 'label')).toEqual([
      { field: 'label', dir: 'desc' },
    ]);
  });

  it('desc → none on the same field', () => {
    expect(toggleSort([{ field: 'label', dir: 'desc' }], 'label')).toEqual([]);
  });

  it('clicking a different field replaces the primary with asc', () => {
    expect(toggleSort([{ field: 'label', dir: 'desc' }], 'created_at')).toEqual([
      { field: 'created_at', dir: 'asc' },
    ]);
  });
});

describe('queryToHttpParams', () => {
  it('omits q when blank and always sends limit', () => {
    const params = queryToHttpParams(query());
    expect(params.has('q')).toBe(false);
    expect(params.get('limit')).toBe(String(DEFAULT_PAGE_LIMIT));
  });

  it('sends trimmed q when present', () => {
    expect(queryToHttpParams(query({ q: '  graph  ' })).get('q')).toBe('graph');
  });

  it('emits one filter[<field>] entry per selected value', () => {
    const params = queryToHttpParams(
      query({ filters: { delivery_type: ['graduate', 'short'], state: ['DRAFT'] } }),
    );
    expect(params.getAll('filter[delivery_type]')).toEqual(['graduate', 'short']);
    expect(params.getAll('filter[state]')).toEqual(['DRAFT']);
  });

  it('emits sort only when non-empty', () => {
    expect(queryToHttpParams(query()).has('sort')).toBe(false);
    expect(
      queryToHttpParams(query({ sort: [{ field: 'label', dir: 'asc' }] })).get('sort'),
    ).toBe('label:asc');
  });

  it('omits cursor when null and sends it verbatim when present', () => {
    expect(queryToHttpParams(query()).has('cursor')).toBe(false);
    expect(queryToHttpParams(query({ cursor: 'OPAQUE==' })).get('cursor')).toBe('OPAQUE==');
  });
});

describe('queryToRouterParams', () => {
  it('nulls absent durable params and excludes cursor entirely', () => {
    const params = queryToRouterParams(query({ cursor: 'IGNORED' }));
    expect(params).toEqual({ q: null, filters: null, sort: null, limit: null });
    expect('cursor' in params).toBe(false);
  });

  it('encodes q, filters, sort and a non-default limit', () => {
    const params = queryToRouterParams(
      query({
        q: 'graph',
        filters: { state: ['DRAFT'], delivery_type: ['graduate', 'short'] },
        sort: [{ field: 'label', dir: 'asc' }],
        limit: 50,
      }),
    );
    expect(params['q']).toBe('graph');
    // fields are sorted for deterministic URLs
    expect(params['filters']).toBe('delivery_type:graduate,short;state:DRAFT');
    expect(params['sort']).toBe('label:asc');
    expect(params['limit']).toBe('50');
  });

  it('nulls limit when it equals the default', () => {
    expect(queryToRouterParams(query({ limit: DEFAULT_PAGE_LIMIT }))['limit']).toBeNull();
  });
});

describe('queryFromRouterParams', () => {
  it('reconstructs q + filters + sort and resets cursor to null', () => {
    const q = queryFromRouterParams({
      q: 'graph',
      filters: 'delivery_type:graduate,short;state:DRAFT',
      sort: 'label:asc',
      limit: '50',
    });
    expect(q.q).toBe('graph');
    expect(q.filters).toEqual({ delivery_type: ['graduate', 'short'], state: ['DRAFT'] });
    expect(q.sort).toEqual([{ field: 'label', dir: 'asc' }]);
    expect(q.limit).toBe(50);
    expect(q.cursor).toBeNull();
  });

  it('defaults missing params (and a bad limit) gracefully', () => {
    const q = queryFromRouterParams({});
    expect(q).toEqual(EMPTY_QUERY);
    expect(queryFromRouterParams({ limit: 'NaN' }).limit).toBe(DEFAULT_PAGE_LIMIT);
    expect(queryFromRouterParams({ limit: '0' }).limit).toBe(DEFAULT_PAGE_LIMIT);
  });

  it('ignores malformed filter groups', () => {
    expect(queryFromRouterParams({ filters: ';bad;state:DRAFT;:orphan' }).filters).toEqual({
      state: ['DRAFT'],
    });
  });
});

describe('router params round-trip', () => {
  it('queryFromRouterParams(queryToRouterParams(q)) preserves the durable slice', () => {
    const original = query({
      q: 'discovery',
      filters: { delivery_type: ['async'], state: ['LAUNCHED', 'RUNNING'] },
      sort: [{ field: 'created_at', dir: 'desc' }],
      limit: 50,
      cursor: 'DROP-ME',
    });
    const restored = queryFromRouterParams(queryToRouterParams(original));
    expect(restored).toEqual({ ...original, cursor: null });
  });

  it('round-trips the pristine query to EMPTY_QUERY', () => {
    expect(queryFromRouterParams(queryToRouterParams(EMPTY_QUERY))).toEqual(EMPTY_QUERY);
  });
});
