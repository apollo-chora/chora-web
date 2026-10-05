/**
 * chora-collection-view — universal finder primitive (W2.C, P0).
 *
 * The reusable cross-surface list/search primitive (UX spec
 * `docs/design/ux_universal_search_collection.md`). P0 ships ONE query model
 * (`CollectionQuery`) + a router-agnostic per-instance `CollectionStore` +
 * the `table` renderer with cursor "load more", multi-sort affordance and a
 * facet rail, over a single live entity (R+ Offerings). It is designed so a
 * renderer switch (card-grid / picker) and P1/P2 features (typeahead combobox,
 * saved views, bulk actions, column management) can be ADDED later without
 * reworking these seams.
 *
 * Sibling of the shipped `chora-entity-picker` (B0): the picker is the
 * *selection* renderer of the same family, this is the *browse* primitive. The
 * fail-loud, no-stub, per-instance-state conventions are mirrored from B0.
 */
import type { Observable } from 'rxjs';

/** Sort direction for a single sort key. */
export type SortDir = 'asc' | 'desc';

/** One server-side sort key: a backend sort field + direction. */
export interface SortKey {
  readonly field: string;
  readonly dir: SortDir;
}

/**
 * The single reactive query model the store owns and the URL mirrors.
 *
 * `cursor` is opaque keyset pagination (pass back verbatim) and is EPHEMERAL —
 * it is never synced to the URL (a shared link starts at page 1 with the same
 * q/filters/sort/limit). All fields are deeply readonly; mutations produce a
 * fresh object (see `collection-query.util.ts`).
 */
export interface CollectionQuery {
  /** Free-text keyword (empty string = no keyword). */
  readonly q: string;
  /** Facet selections keyed by field; each field carries 1..n selected values. */
  readonly filters: Readonly<Record<string, readonly string[]>>;
  /** Multi-sort keys (primary first). P0 toggles a single primary key. */
  readonly sort: readonly SortKey[];
  /** Opaque keyset cursor; null = page 1 / no more pages. */
  readonly cursor: string | null;
  /** Page size. */
  readonly limit: number;
}

/** A single facet value bucket: server-computed value + label + count. */
export interface CollectionFacetValue {
  /** The raw facet token sent back as a filter value (e.g. `graduate`). */
  readonly value: string;
  /**
   * Display label. At the FE boundary an entity's data source MAY map this to
   * an i18n KEY (the renderer pipes facet chip labels through `translate`); a
   * free-text label degrades gracefully (translate returns it unchanged).
   */
  readonly label: string;
  /** Result count for this value under the current query (minus this facet). */
  readonly count: number;
}

/** One facet dimension (e.g. `delivery_type`) plus its value buckets. */
export interface CollectionFacet {
  readonly field: string;
  readonly values: readonly CollectionFacetValue[];
}

/** One page of results: items + server-computed facets + forward cursor. */
export interface CollectionPage<T> {
  readonly items: readonly T[];
  readonly facets: readonly CollectionFacet[];
  /** Opaque forward cursor; null = last page. */
  readonly nextCursor: string | null;
  /** Cheap count estimate ("~N"); never an exact expensive count. */
  readonly totalEstimate: number;
}

/**
 * Per-entity data source: one adapter per entity, calling its
 * `/api/v1/search/<entity>` endpoint via the BFF. Fail-loud — the adapter lets
 * HTTP errors propagate; the store renders them (never a silent empty list).
 */
export interface CollectionDataSource<T> {
  /** Stable entity key (e.g. `offering`) — diagnostic / future registry use. */
  readonly key: string;
  search(query: CollectionQuery): Observable<CollectionPage<T>>;
}

/** Table cell renderer kind. `badge` values are treated as i18n keys. */
export type CellKind = 'text' | 'badge' | 'date' | 'number';

/**
 * Config-driven column descriptor for the table renderer.
 *
 * `value` is a pure projector row → cell value. For `cell: 'badge'` the
 * projector MUST return an i18n KEY (the renderer translates it); for
 * `text`/`date`/`number` it returns the raw display value (rendered via the
 * Angular `date`/`number` pipes — never hand-formatted).
 *
 * `field` doubles as the sort id when `sortable` (it MUST then be a backend
 * sort field). `priority` drives tablet-first responsive collapse: lower =
 * always visible; higher numbers fold into an expandable detail row below the
 * desktop breakpoint.
 */
export interface ColumnDef<T> {
  readonly field: string;
  readonly labelKey: string;
  readonly sortable: boolean;
  readonly cell: CellKind;
  readonly value: (row: T) => string | number | null;
  readonly align?: 'start' | 'end';
  readonly priority?: number;
}

/**
 * Facet rail descriptor. `labelKey` is the i18n key for the section header;
 * per-value chip labels come from `CollectionFacetValue.label` (an i18n key at
 * the FE boundary), so a `FacetDef` stays minimal and entity-agnostic.
 */
export interface FacetDef {
  readonly field: string;
  readonly labelKey: string;
}

/** Default page size (BFF default; max 100). */
export const DEFAULT_PAGE_LIMIT = 20;

/** Pristine query — page 1, no keyword / filters / sort. Deeply frozen. */
export const EMPTY_QUERY: CollectionQuery = Object.freeze({
  q: '',
  filters: Object.freeze({}),
  sort: Object.freeze([]),
  cursor: null,
  limit: DEFAULT_PAGE_LIMIT,
}) as CollectionQuery;

/** Stable machine code stored in `CollectionStore.error` on a failed search. */
export const COLLECTION_ERROR_CODE = 'collection_search_failed';
