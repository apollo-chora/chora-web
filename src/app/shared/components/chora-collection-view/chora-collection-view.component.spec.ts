import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { Observable, type Subscriber } from 'rxjs';

import { ChoraCollectionViewComponent } from './chora-collection-view.component';
import { CollectionStore } from './collection-store';
import {
  EMPTY_QUERY,
  type CollectionDataSource,
  type CollectionPage,
  type CollectionQuery,
  type ColumnDef,
  type FacetDef,
} from './collection-view.model';

interface Row {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly count: number;
  readonly when: string;
}

const ROWS: readonly Row[] = [
  {
    id: 'o1',
    label: 'Graduate Cohort A',
    kind: 'rplus.k.graduate',
    count: 30,
    when: '2026-06-01T00:00:00Z',
  },
  {
    id: 'o2',
    label: 'Short Course B',
    kind: 'rplus.k.short',
    count: 12,
    when: '2026-06-10T00:00:00Z',
  },
  {
    id: 'o3',
    label: 'Async Track C',
    kind: 'rplus.k.async',
    count: 99,
    when: '2026-06-20T00:00:00Z',
  },
];

const COLUMNS: readonly ColumnDef<Row>[] = [
  {
    field: 'label',
    labelKey: 'col.label',
    sortable: true,
    cell: 'text',
    value: (r) => r.label,
    priority: 1,
  },
  {
    field: 'kind',
    labelKey: 'col.kind',
    sortable: false,
    cell: 'badge',
    value: (r) => r.kind,
    priority: 2,
  },
  {
    field: 'count',
    labelKey: 'col.count',
    sortable: false,
    cell: 'number',
    value: (r) => r.count,
    align: 'end',
    priority: 3,
  },
  {
    field: 'when',
    labelKey: 'col.when',
    sortable: true,
    cell: 'date',
    value: (r) => r.when,
    priority: 3,
  },
];

const FACET_DEFS: readonly FacetDef[] = [{ field: 'kind', labelKey: 'facet.kind' }];

const FACETS = [
  {
    field: 'kind',
    values: [
      { value: 'graduate', label: 'rplus.k.graduate', count: 1 },
      { value: 'short', label: 'rplus.k.short', count: 1 },
      { value: 'async', label: 'rplus.k.async', count: 1 },
    ],
  },
];

class FakeSource implements CollectionDataSource<Row> {
  readonly key = 'fake';
  readonly calls: { query: CollectionQuery; observer: Subscriber<CollectionPage<Row>> }[] = [];

  search(query: CollectionQuery): Observable<CollectionPage<Row>> {
    return new Observable<CollectionPage<Row>>((observer) => {
      this.calls.push({ query, observer });
    });
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

interface Harness {
  fixture: ComponentFixture<ChoraCollectionViewComponent<Row>>;
  element: HTMLElement;
  store: CollectionStore<Row>;
  source: FakeSource;
}

function mount(initial: CollectionQuery = EMPTY_QUERY): Harness {
  const source = new FakeSource();
  const store = new CollectionStore<Row>(source);

  TestBed.configureTestingModule({
    imports: [ChoraCollectionViewComponent],
    providers: [provideHttpClient(), provideRouter([])],
  });

  const fixture = TestBed.createComponent<ChoraCollectionViewComponent<Row>>(
    ChoraCollectionViewComponent,
  );
  fixture.componentRef.setInput('store', store);
  fixture.componentRef.setInput('columns', COLUMNS);
  fixture.componentRef.setInput('rowIdentity', (row: Row) => row.id);
  fixture.componentRef.setInput('facetDefs', FACET_DEFS);
  fixture.componentRef.setInput('rowLink', (row: Row) => ['/r/offerings', row.id]);
  fixture.detectChanges(); // ngOnInit

  store.init(initial);

  return { fixture, element: fixture.nativeElement as HTMLElement, store, source };
}

function loaded(h: Harness, page: Partial<CollectionPage<Row>> = {}): void {
  h.source.emit({
    items: ROWS,
    facets: FACETS,
    nextCursor: null,
    totalEstimate: ROWS.length,
    ...page,
  });
  h.fixture.detectChanges();
}

function qa(el: HTMLElement, testid: string): HTMLElement | null {
  return el.querySelector(`[data-testid="${testid}"]`);
}

function rows(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll('[data-testid^="cv-row-"]')).filter(
    (e) =>
      !e.getAttribute('data-testid')!.startsWith('cv-row-link') &&
      !e.getAttribute('data-testid')!.startsWith('cv-row-toggle') &&
      !e.getAttribute('data-testid')!.startsWith('cv-row-detail'),
  ) as HTMLElement[];
}

describe('ChoraCollectionViewComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => vi.restoreAllMocks());

  describe('rendering', () => {
    it('renders one table row per item and the result count', () => {
      const h = mount();
      loaded(h);
      expect(qa(h.element, 'cv-table')).toBeTruthy();
      expect(rows(h.element).length).toBe(ROWS.length);
      expect(qa(h.element, 'cv-count')?.textContent).toContain('~3');
    });

    it('renders a sortable header button only for sortable columns', () => {
      const h = mount();
      loaded(h);
      expect(qa(h.element, 'cv-sort-label')).toBeTruthy();
      expect(qa(h.element, 'cv-sort-when')).toBeTruthy();
      expect(qa(h.element, 'cv-sort-kind')).toBeNull(); // not sortable
    });

    it('reflects the active sort direction via aria-sort', () => {
      const h = mount({ ...EMPTY_QUERY, sort: [{ field: 'label', dir: 'asc' }] });
      loaded(h);
      const labelTh = qa(h.element, 'cv-sort-label')!.closest('th');
      expect(labelTh?.getAttribute('aria-sort')).toBe('ascending');
    });

    it('renders facet chips from the store facets', () => {
      const h = mount();
      loaded(h);
      expect(qa(h.element, 'cv-chip-kind-graduate')).toBeTruthy();
      expect(qa(h.element, 'cv-chip-kind-short')).toBeTruthy();
    });
  });

  describe('interactions delegate to the store', () => {
    it('clicking a sortable header calls store.setSort', () => {
      const h = mount();
      loaded(h);
      const spy = vi.spyOn(h.store, 'setSort').mockImplementation(() => undefined);
      (qa(h.element, 'cv-sort-label') as HTMLButtonElement).click();
      expect(spy).toHaveBeenCalledWith('label');
    });

    it('clicking a facet chip calls store.toggleFilter', () => {
      const h = mount();
      loaded(h);
      const spy = vi.spyOn(h.store, 'toggleFilter').mockImplementation(() => undefined);
      (qa(h.element, 'cv-chip-kind-short') as HTMLButtonElement).click();
      expect(spy).toHaveBeenCalledWith('kind', 'short');
    });

    it('marks a chip aria-pressed when its filter is active', () => {
      const h = mount({ ...EMPTY_QUERY, filters: { kind: ['short'] } });
      loaded(h);
      expect(qa(h.element, 'cv-chip-kind-short')?.getAttribute('aria-pressed')).toBe('true');
      expect(qa(h.element, 'cv-chip-kind-graduate')?.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('load more', () => {
    it('shows the control when there is a next page and appends on click', () => {
      const h = mount();
      loaded(h, { nextCursor: 'cursor-2', items: [ROWS[0]] });
      expect(qa(h.element, 'cv-load-more')).toBeTruthy();

      (qa(h.element, 'cv-load-more') as HTMLButtonElement).click();
      h.fixture.detectChanges();
      // loadingMore: button disabled, table still visible
      expect((qa(h.element, 'cv-load-more') as HTMLButtonElement).disabled).toBe(true);

      h.source.emit({ items: [ROWS[1]], nextCursor: null });
      h.fixture.detectChanges();
      expect(rows(h.element).length).toBe(2); // appended
      expect(qa(h.element, 'cv-load-more')).toBeNull(); // no more pages
    });
  });

  describe('fail-loud states', () => {
    it('renders skeletons while loading (no table)', () => {
      const h = mount(); // init fired, no emit yet
      h.fixture.detectChanges();
      expect(qa(h.element, 'cv-loading')).toBeTruthy();
      expect(qa(h.element, 'cv-table')).toBeNull();
    });

    it('renders an empty state with a clear-filters CTA', () => {
      const h = mount();
      loaded(h, { items: [], totalEstimate: 0 });
      expect(qa(h.element, 'cv-empty')).toBeTruthy();
      const spy = vi.spyOn(h.store, 'clearFilters').mockImplementation(() => undefined);
      (qa(h.element, 'cv-clear-filters') as HTMLButtonElement).click();
      expect(spy).toHaveBeenCalled();
    });

    it('renders a role=alert error banner with retry (never a silent empty table)', () => {
      const h = mount();
      h.source.fail();
      h.fixture.detectChanges();
      const banner = qa(h.element, 'cv-error');
      expect(banner?.getAttribute('role')).toBe('alert');
      const spy = vi.spyOn(h.store, 'reload').mockImplementation(() => undefined);
      (qa(h.element, 'cv-retry') as HTMLButtonElement).click();
      expect(spy).toHaveBeenCalled();
    });

    it('keeps prior rows visible beneath the error banner on a failed reload', () => {
      const h = mount();
      loaded(h, { items: ROWS, nextCursor: null });
      h.store.reload();
      h.source.fail();
      h.fixture.detectChanges();
      expect(qa(h.element, 'cv-error')).toBeTruthy();
      expect(qa(h.element, 'cv-table')).toBeTruthy(); // prior items preserved
    });
  });

  describe('responsive collapse', () => {
    it('marks secondary columns and expands a detail row via the toggle', () => {
      const h = mount();
      loaded(h);
      // count + when carry the collapse class
      expect(h.element.querySelectorAll('td.cv__col--secondary').length).toBeGreaterThan(0);
      const toggle = qa(h.element, 'cv-row-toggle-o1') as HTMLButtonElement;
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      toggle.click();
      h.fixture.detectChanges();
      expect(qa(h.element, 'cv-row-detail-o1')).toBeTruthy();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });
  });

  describe('accessibility (axe)', () => {
    it('has no critical/serious violations in the loaded state', async () => {
      const h = mount();
      loaded(h);
      const axe = (await import('axe-core')).default;
      const results = await axe.run(h.element);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    });
  });
});
