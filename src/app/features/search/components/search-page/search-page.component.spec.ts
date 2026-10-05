import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { SearchPageComponent } from './search-page.component';
import { environment } from '../../../../../environments/environment';
import type { AtomSearchResponse } from '../../models/search.model';

const ATOMS_URL = `${environment.bffBaseUrl}/api/v1/search/atoms`;

function makeResponse(overrides: Partial<AtomSearchResponse> = {}): AtomSearchResponse {
  return {
    hits: [
      {
        id: 'atom-1',
        title: 'Newton First Law',
        atom_type: 'multiple_choice',
        difficulty: 2,
      },
      {
        id: 'atom-2',
        title: 'Newton Second Law',
        atom_type: 'short_answer',
        difficulty: 3,
      },
    ],
    facets: {
      atom_type: { multiple_choice: 1, short_answer: 1 },
      difficulty: { '2': 1, '3': 1 },
    },
    pagination: { total_hits: 2, limit: 20, offset: 0 },
    processing_time_ms: 4,
    query: 'newton',
    ...overrides,
  };
}

describe('SearchPageComponent', () => {
  let component: SearchPageComponent;
  let fixture: ComponentFixture<SearchPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(SearchPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="search-page"]');
    expect(el).toBeTruthy();
  });

  it('should have search input', () => {
    const input = fixture.nativeElement.querySelector('[data-testid="search-input"]');
    expect(input).toBeTruthy();
  });

  it('should have category tabs', () => {
    const tabs = fixture.nativeElement.querySelector('[data-testid="category-tabs"]');
    expect(tabs).toBeTruthy();
  });

  it('should have three category tab buttons', () => {
    const atomTab = fixture.nativeElement.querySelector('[data-testid="tab-atoms"]');
    const topicTab = fixture.nativeElement.querySelector('[data-testid="tab-topics"]');
    const pathTab = fixture.nativeElement.querySelector('[data-testid="tab-paths"]');
    expect(atomTab).toBeTruthy();
    expect(topicTab).toBeTruthy();
    expect(pathTab).toBeTruthy();
  });

  it('should start with atoms category selected', () => {
    expect(component.category()).toBe('atoms');
  });

  it('should start with empty query', () => {
    expect(component.query()).toBe('');
    expect(component.hasQuery()).toBe(false);
  });

  it('should show initial state when no query', () => {
    const initial = fixture.nativeElement.querySelector('[data-testid="search-initial"]');
    expect(initial).toBeTruthy();
  });

  it('should change category on tab click', () => {
    component.onCategoryChange('topics');
    expect(component.category()).toBe('topics');
  });

  it('should update sort on change', () => {
    const event = { target: { value: 'difficulty:asc' } } as unknown as Event;
    component.onSortChange(event);
    expect(component.sort()).toBe('difficulty:asc');
  });

  it('should update active filters on filtersChanged', () => {
    const newFilters = { types: ['code'], difficulties: [] as never[], topic: null };
    component.onFiltersChanged(newFilters);
    expect(component.activeFilters().types).toEqual(['code']);
  });

  it('should clear filters on filtersCleared', () => {
    component.onFiltersChanged({ types: ['code'], difficulties: [] as never[], topic: 'math' });
    component.onFiltersCleared();
    expect(component.activeFilters().types).toEqual([]);
    expect(component.activeFilters().topic).toBeNull();
  });

  it('should reset offset on category change', () => {
    component.onCategoryChange('paths');
    expect(component.currentOffset()).toBe(0);
  });

  it('should compute currentPage correctly', () => {
    expect(component.currentPage()).toBe(1);
  });

  it('should compute totalPages as 1 when no pagination', () => {
    expect(component.totalPages()).toBe(1);
  });

  it('should start with sort set to relevance', () => {
    expect(component.sort()).toBe('relevance');
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Computed defaults (no pagination yet)
  // -------------------------------------------------------------------------

  it('should compute totalHits as 0 when no pagination', () => {
    expect(component.totalHits()).toBe(0);
  });

  it('should compute hasResults as false initially', () => {
    expect(component.hasResults()).toBe(false);
  });

  it('should compute showPagination as false when no pagination', () => {
    expect(component.showPagination()).toBe(false);
  });

  it('should compute canGoBack as false at offset 0', () => {
    expect(component.canGoBack()).toBe(false);
  });

  it('should compute canGoForward as false when no pagination', () => {
    expect(component.canGoForward()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // trackBy helpers
  // -------------------------------------------------------------------------

  it('trackByHitId returns the hit id', () => {
    const hit = {
      id: 'atom-xyz',
      title: 'T',
      atom_type: 'code' as const,
      difficulty: 1 as const,
    };
    expect(component.trackByHitId(0, hit)).toBe('atom-xyz');
  });

  it('trackByCategory returns the category itself', () => {
    expect(component.trackByCategory(2, 'paths')).toBe('paths');
  });

  // -------------------------------------------------------------------------
  // executeSearch: empty query short-circuit
  // -------------------------------------------------------------------------

  it('does NOT fire an HTTP call when query is empty (sort change)', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    // query is empty by default → executeSearch returns early
    component.onSortChange({ target: { value: 'title:asc' } } as unknown as Event);
    httpMock.verify(); // no outstanding requests
    expect(component.sort()).toBe('title:asc');
  });

  it('does NOT fire an HTTP call on filtersChanged with empty query', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    component.onFiltersChanged({ types: ['code'], difficulties: [], topic: null });
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // executeSearch: HTTP success path
  // -------------------------------------------------------------------------

  it('fires the atom search GET and renders results on success', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    component.query.set('newton');
    fixture.detectChanges();

    component.onSortChange({ target: { value: 'difficulty:asc' } } as unknown as Event);

    const req = httpMock.expectOne((r) => r.url === ATOMS_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('q')).toBe('newton');
    expect(req.request.params.get('sort')).toBe('difficulty:asc');
    req.flush(makeResponse());
    fixture.detectChanges();

    expect(component.hasResults()).toBe(true);
    expect(component.totalHits()).toBe(2);
    expect(component.atomHits().length).toBe(2);

    const results = fixture.nativeElement.querySelector('[data-testid="search-results"]');
    expect(results).toBeTruthy();
    const count = fixture.nativeElement.querySelector('[data-testid="result-count"]');
    expect(count?.textContent).toContain('2');

    httpMock.verify();
  });

  it('renders the empty state when search succeeds with zero hits', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    component.query.set('zznothing');
    fixture.detectChanges();

    component.onSortChange({ target: { value: 'relevance' } } as unknown as Event);

    const req = httpMock.expectOne((r) => r.url === ATOMS_URL);
    req.flush(makeResponse({ hits: [], pagination: { total_hits: 0, limit: 20, offset: 0 } }));
    fixture.detectChanges();

    expect(component.hasResults()).toBe(false);
    const empty = fixture.nativeElement.querySelector('[data-testid="search-empty"]');
    expect(empty).toBeTruthy();
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // executeSearch: HTTP error path
  // -------------------------------------------------------------------------

  it('renders the error state when the atom search returns 500', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    component.query.set('boom');
    fixture.detectChanges();

    component.onFiltersChanged({ types: ['code'], difficulties: [], topic: null });

    const req = httpMock.expectOne((r) => r.url === ATOMS_URL);
    req.flush({ error: 'server exploded' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(component.atomSearchState().status).toBe('error');
    const err = fixture.nativeElement.querySelector('[data-testid="search-error"]');
    expect(err).toBeTruthy();
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // Filter params on the wire
  // -------------------------------------------------------------------------

  it('sends type/difficulty/topic params when filters are active', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    component.query.set('physics');
    fixture.detectChanges();

    component.onFiltersChanged({
      types: ['code', 'essay'],
      difficulties: [2, 4],
      topic: 'mechanics',
    });

    const req = httpMock.expectOne((r) => r.url === ATOMS_URL);
    expect(req.request.params.get('type')).toBe('code,essay');
    expect(req.request.params.get('difficulty')).toBe('2,4');
    expect(req.request.params.get('topic')).toBe('mechanics');
    expect(component.activeFilters().types).toEqual(['code', 'essay']);
    req.flush(makeResponse());
    httpMock.verify();
  });

  it('onFiltersCleared resets filters and re-searches', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    component.query.set('physics');
    fixture.detectChanges();

    component.onFiltersCleared();

    const req = httpMock.expectOne((r) => r.url === ATOMS_URL);
    // No filter params after a clear
    expect(req.request.params.has('type')).toBe(false);
    expect(req.request.params.has('difficulty')).toBe(false);
    expect(req.request.params.has('topic')).toBe(false);
    expect(component.activeFilters()).toEqual({ types: [], difficulties: [], topic: null });
    req.flush(makeResponse());
    httpMock.verify();
  });

  it('category change with a non-empty query fires a search', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    component.query.set('newton');
    fixture.detectChanges();

    component.onCategoryChange('topics');

    const req = httpMock.expectOne((r) => r.url === ATOMS_URL);
    expect(component.category()).toBe('topics');
    expect(component.currentOffset()).toBe(0);
    req.flush(makeResponse());
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // Pagination interactions + computed
  // -------------------------------------------------------------------------

  it('nextPage advances the offset and re-searches with the new offset', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    component.query.set('newton');
    fixture.detectChanges();

    component.nextPage();
    expect(component.currentOffset()).toBe(20);

    const req = httpMock.expectOne((r) => r.url === ATOMS_URL);
    expect(req.request.params.get('offset')).toBe('20');
    req.flush(makeResponse({ pagination: { total_hits: 50, limit: 20, offset: 20 } }));
    fixture.detectChanges();

    expect(component.currentPage()).toBe(2);
    expect(component.canGoBack()).toBe(true);
    httpMock.verify();
  });

  it('previousPage never drops the offset below zero', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    component.query.set('newton');
    component.currentOffset.set(10);
    fixture.detectChanges();

    component.previousPage();
    expect(component.currentOffset()).toBe(0);

    const req = httpMock.expectOne((r) => r.url === ATOMS_URL);
    expect(req.request.params.get('offset')).toBe('0');
    req.flush(makeResponse());
    httpMock.verify();
  });

  it('computes pagination signals from a large result set', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    component.query.set('newton');
    fixture.detectChanges();

    component.onSortChange({ target: { value: 'relevance' } } as unknown as Event);
    const req = httpMock.expectOne((r) => r.url === ATOMS_URL);
    req.flush(makeResponse({ pagination: { total_hits: 45, limit: 20, offset: 0 } }));
    fixture.detectChanges();

    expect(component.showPagination()).toBe(true); // 45 > 20
    expect(component.totalPages()).toBe(3); // ceil(45/20)
    expect(component.canGoForward()).toBe(true); // 0 + 20 < 45
    expect(component.canGoBack()).toBe(false); // offset 0

    const pagination = fixture.nativeElement.querySelector('[data-testid="pagination"]');
    expect(pagination).toBeTruthy();
    httpMock.verify();
  });

  it('hides pagination when total hits fit one page', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    component.query.set('newton');
    fixture.detectChanges();

    component.onSortChange({ target: { value: 'relevance' } } as unknown as Event);
    const req = httpMock.expectOne((r) => r.url === ATOMS_URL);
    req.flush(makeResponse({ pagination: { total_hits: 2, limit: 20, offset: 0 } }));
    fixture.detectChanges();

    expect(component.showPagination()).toBe(false);
    const pagination = fixture.nativeElement.querySelector('[data-testid="pagination"]');
    expect(pagination).toBeNull();
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // Debounced search input (RxJS debounceTime via fakeAsync)
  // -------------------------------------------------------------------------

  it('debounces the search input and executes a search after the delay', fakeAsync(() => {
    const httpMock = TestBed.inject(HttpTestingController);
    component.onSearchInput({ target: { value: 'quantum' } } as unknown as Event);

    // Before the debounce window elapses, nothing should have fired.
    httpMock.expectNone((r) => r.url === ATOMS_URL);

    tick(300);
    expect(component.query()).toBe('quantum');

    const req = httpMock.expectOne((r) => r.url === ATOMS_URL);
    expect(req.request.params.get('q')).toBe('quantum');
    req.flush(makeResponse({ query: 'quantum' }));
    httpMock.verify();
  }));

  it('debounced empty input sets query but short-circuits the search', fakeAsync(() => {
    const httpMock = TestBed.inject(HttpTestingController);
    component.onSearchInput({ target: { value: '   ' } } as unknown as Event);
    tick(300);
    expect(component.query()).toBe('   ');
    // trimmed query is empty → executeSearch returns early, no HTTP
    httpMock.verify();
  }));

  // -------------------------------------------------------------------------
  // Template: query → filters/toolbar rendered, initial state hidden
  // -------------------------------------------------------------------------

  it('renders the filters panel + toolbar once a query is present', () => {
    component.query.set('newton');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="search-initial"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="filters-panel"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="search-toolbar"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="sort-select"]')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Lifecycle: ngOnDestroy tears down without error
  // -------------------------------------------------------------------------

  it('cleans up subscriptions on destroy', () => {
    expect(() => fixture.destroy()).not.toThrow();
  });
});
