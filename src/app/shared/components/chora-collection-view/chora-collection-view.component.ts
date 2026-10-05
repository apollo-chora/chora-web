/**
 * ChoraCollectionViewComponent<T> — the universal finder orchestrator (W2.C P0).
 *
 * Renders a debounced keyword box, a config-driven facet rail, and the `table`
 * renderer (sortable headers with `aria-sort`, cursor "load more", tablet-first
 * responsive column collapse) over a parent-owned `CollectionStore<T>`. All
 * async states are FAIL-LOUD via the store status: `loading` → skeleton rows,
 * `error` → a `role="alert"` banner + retry (prior rows kept), `loaded` + empty
 * → an empty state with a clear-filters CTA, `loadingMore` → spinner on the
 * button. An error is NEVER swallowed into an empty table.
 *
 * Generic over the row type `T`; the consuming template binds `[store]`,
 * `[columns]`, `[rowIdentity]` (and optionally `[facetDefs]`, `[rowLink]`) and
 * Angular infers `T`. Selector `chora-collection-view` (no surface prefix —
 * cross-surface primitive). i18n: every user-facing string is a key piped
 * through the project `TranslatePipe`; `badge` cell values and facet chip
 * labels are themselves i18n keys (see `collection-view.model.ts`).
 */
import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { TranslatePipe } from '../../pipes/translate.pipe';
import type { CollectionStore } from './collection-store';
import type { ColumnDef, FacetDef } from './collection-view.model';

/** Columns with `priority >= this` collapse into the detail row below desktop. */
const COLLAPSE_PRIORITY_THRESHOLD = 3;

/** Monotonic source of unique element ids across instances on a page. */
let collectionViewSeq = 0;

@Component({
  selector: 'chora-collection-view',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, DatePipe, DecimalPipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chora-collection-view.component.html',
  styleUrl: './chora-collection-view.component.scss',
})
export class ChoraCollectionViewComponent<T> implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  // ── Required inputs ──────────────────────────────────────────────────────────
  readonly store = input.required<CollectionStore<T>>();
  readonly columns = input.required<readonly ColumnDef<T>[]>();
  /** Stable id projector — used for `@for` tracking + row test ids + expansion. */
  readonly rowIdentity = input.required<(row: T) => string>();

  // ── Optional inputs ──────────────────────────────────────────────────────────
  readonly facetDefs = input<readonly FacetDef[]>([]);
  /** Router link per row (null = no navigation). */
  readonly rowLink = input<((row: T) => unknown[] | null) | null>(null);

  // i18n key inputs (defaults live in the shared `collection.*` namespace; a
  // surface may override e.g. error/retry with its own existing keys).
  readonly searchPlaceholderKey = input<string>('collection.search_placeholder');
  readonly emptyTitleKey = input<string>('collection.empty_title');
  readonly loadMoreKey = input<string>('collection.load_more');
  readonly loadingMoreKey = input<string>('collection.loading_more');
  readonly resultsLabelKey = input<string>('collection.results');
  readonly clearFiltersKey = input<string>('collection.clear_filters');
  readonly loadErrorKey = input<string>('collection.load_error');
  readonly retryKey = input<string>('collection.retry');
  readonly searchAriaKey = input<string>('collection.search_aria');
  readonly facetsAriaKey = input<string>('collection.facets_aria');
  readonly loadingAriaKey = input<string>('collection.loading_aria');
  readonly tableAriaKey = input<string>('collection.table_aria');
  readonly rowDetailsKey = input<string>('collection.row_details');

  // ── Element ids (unique per instance) ────────────────────────────────────────
  private readonly uid = `chora-collection-view-${(collectionViewSeq += 1)}`;
  readonly searchInputId = `${this.uid}-search`;

  // ── Derived column groups ────────────────────────────────────────────────────
  /** First column → rendered as the row header `<th scope="row">`. */
  readonly primaryColumn = computed<ColumnDef<T> | null>(() => this.columns()[0] ?? null);
  readonly restColumns = computed<readonly ColumnDef<T>[]>(() => this.columns().slice(1));
  /** Rest columns that collapse on tablet (folded into the detail row). */
  readonly secondaryColumns = computed<readonly ColumnDef<T>[]>(() =>
    this.restColumns().filter((col) => this.isSecondary(col)),
  );

  /** Fixed-length skeleton placeholder rows for the loading state. */
  readonly skeletonRows: readonly number[] = [0, 1, 2, 3, 4];

  // ── Per-row expansion (tablet detail-row reveal) ─────────────────────────────
  private readonly expandedIds = signal<ReadonlySet<string>>(new Set());

  // ── Debounced keyword input ──────────────────────────────────────────────────
  private readonly searchInput$ = new Subject<string>();

  ngOnInit(): void {
    this.searchInput$
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => this.store().setSearch(value));
    // The store owns an in-flight subscription; cancel it with the component.
    this.destroyRef.onDestroy(() => this.store().destroy());
  }

  // ── Search ────────────────────────────────────────────────────────────────────
  onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  // ── Sorting ───────────────────────────────────────────────────────────────────
  /** `aria-sort` value for a header, or null for a non-sortable column. */
  ariaSortFor(col: ColumnDef<T>): 'ascending' | 'descending' | 'none' | null {
    if (!col.sortable) {
      return null;
    }
    const primary = this.store().query().sort[0];
    if (!primary || primary.field !== col.field) {
      return 'none';
    }
    return primary.dir === 'asc' ? 'ascending' : 'descending';
  }

  onSort(col: ColumnDef<T>): void {
    if (col.sortable) {
      this.store().setSort(col.field);
    }
  }

  // ── Facets ────────────────────────────────────────────────────────────────────
  facetValuesFor(field: string) {
    return this.store().facets().find((facet) => facet.field === field)?.values ?? [];
  }

  isFilterActive(field: string, value: string): boolean {
    return (this.store().query().filters[field] ?? []).includes(value);
  }

  onToggleFilter(field: string, value: string): void {
    this.store().toggleFilter(field, value);
  }

  // ── Rows ───────────────────────────────────────────────────────────────────────
  identityOf(row: T): string {
    return this.rowIdentity()(row);
  }

  rowLinkFor(row: T): unknown[] | null {
    return this.rowLink()?.(row) ?? null;
  }

  isSecondary(col: ColumnDef<T>): boolean {
    return (col.priority ?? 0) >= COLLAPSE_PRIORITY_THRESHOLD;
  }

  isExpanded(row: T): boolean {
    return this.expandedIds().has(this.identityOf(row));
  }

  toggleExpanded(row: T): void {
    const id = this.identityOf(row);
    const next = new Set(this.expandedIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.expandedIds.set(next);
  }

  // ── Cell projection ─────────────────────────────────────────────────────────────
  /** Raw projected value (text/date/number cells render this directly). */
  rawValue(col: ColumnDef<T>, row: T): string | number | null {
    return col.value(row);
  }

  /** i18n key for a `badge` cell (the projector returns the key). */
  badgeKey(col: ColumnDef<T>, row: T): string {
    const value = col.value(row);
    return value === null ? '' : String(value);
  }

  /** ISO string for a `date` cell's `datetime` attribute (null when absent). */
  dateAttr(col: ColumnDef<T>, row: T): string | null {
    const value = col.value(row);
    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}
