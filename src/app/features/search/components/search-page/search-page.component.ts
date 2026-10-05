/**
 * SearchPageComponent — Main search page with debounced input, faceted filters,
 * and search result cards.
 *
 * Route: /search
 *
 * Features:
 *   - Debounced search input (300ms)
 *   - Integrates SearchFiltersComponent for faceted filtering
 *   - Integrates SearchResultCardComponent for result display
 *   - Category tabs (atoms, topics, paths)
 *   - Sort selector
 *   - Pagination
 *   - Empty, loading, and error states
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { SearchService } from '../../services/search.service';
import { SearchFiltersComponent } from '../search-filters/search-filters.component';
import { SearchResultCardComponent } from '../search-result-card/search-result-card.component';
import type { ActiveFilters, SearchCategory, SearchSortField, AtomSearchHit } from '../../models/search.model';
import {
  ALL_SEARCH_CATEGORIES,
  SEARCH_CATEGORY_LABELS,
  DEBOUNCE_MS,
  DEFAULT_PAGE_SIZE,
} from '../../models/search.model';

@Component({
  selector: 'chora-search-page',
  standalone: true,
  imports: [TranslatePipe, SearchFiltersComponent, SearchResultCardComponent],
  templateUrl: './search-page.component.html',
  styleUrl: './search-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchPageComponent implements OnInit, OnDestroy {
  private readonly searchService = inject(SearchService);

  // --- State ---
  readonly atomSearchState = this.searchService.atomSearchState;
  readonly atomHits = this.searchService.atomHits;
  readonly atomFacets = this.searchService.atomFacets;
  readonly atomPagination = this.searchService.atomPagination;
  readonly isLoading = this.searchService.isLoading;

  // --- Local state ---
  readonly query = signal('');
  readonly category = signal<SearchCategory>('atoms');
  readonly sort = signal<SearchSortField>('relevance');
  readonly activeFilters = signal<ActiveFilters>({
    types: [],
    difficulties: [],
    topic: null,
  });
  readonly currentOffset = signal(0);

  // --- Constants ---
  readonly allCategories = ALL_SEARCH_CATEGORIES;
  readonly categoryLabels = SEARCH_CATEGORY_LABELS;

  // --- Debounce ---
  private readonly searchSubject = new Subject<string>();

  // --- Computed ---
  readonly hasQuery = computed(() => this.query().trim().length > 0);

  readonly totalHits = computed(() => {
    const pagination = this.atomPagination();
    return pagination?.total_hits ?? 0;
  });

  readonly hasResults = computed(() => this.atomHits().length > 0);

  readonly showPagination = computed(() => {
    const pagination = this.atomPagination();
    if (!pagination) return false;
    return pagination.total_hits > DEFAULT_PAGE_SIZE;
  });

  readonly currentPage = computed(() =>
    Math.floor(this.currentOffset() / DEFAULT_PAGE_SIZE) + 1,
  );

  readonly totalPages = computed(() => {
    const pagination = this.atomPagination();
    if (!pagination) return 1;
    return Math.ceil(pagination.total_hits / DEFAULT_PAGE_SIZE);
  });

  readonly canGoBack = computed(() => this.currentOffset() > 0);

  readonly canGoForward = computed(() => {
    const pagination = this.atomPagination();
    if (!pagination) return false;
    return this.currentOffset() + DEFAULT_PAGE_SIZE < pagination.total_hits;
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.searchSubject.pipe(
        debounceTime(DEBOUNCE_MS),
        distinctUntilChanged(),
      ).subscribe((term) => {
        this.query.set(term);
        this.currentOffset.set(0);
        this.executeSearch();
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.searchSubject.complete();
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchSubject.next(value);
  }

  onCategoryChange(newCategory: SearchCategory): void {
    this.category.set(newCategory);
    this.currentOffset.set(0);
    this.executeSearch();
  }

  onSortChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as SearchSortField;
    this.sort.set(value);
    this.currentOffset.set(0);
    this.executeSearch();
  }

  onFiltersChanged(filters: ActiveFilters): void {
    this.activeFilters.set(filters);
    this.currentOffset.set(0);
    this.executeSearch();
  }

  onFiltersCleared(): void {
    this.activeFilters.set({ types: [], difficulties: [], topic: null });
    this.currentOffset.set(0);
    this.executeSearch();
  }

  nextPage(): void {
    this.currentOffset.update((offset) => offset + DEFAULT_PAGE_SIZE);
    this.executeSearch();
  }

  previousPage(): void {
    this.currentOffset.update((offset) => Math.max(0, offset - DEFAULT_PAGE_SIZE));
    this.executeSearch();
  }

  // -------------------------------------------------------------------------
  // Search Execution
  // -------------------------------------------------------------------------

  private executeSearch(): void {
    const q = this.query().trim();
    if (!q) return;

    this.subscriptions.add(
      this.searchService.searchAtoms(
        q,
        this.activeFilters(),
        this.sort(),
        DEFAULT_PAGE_SIZE,
        this.currentOffset(),
      ).subscribe(),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  trackByHitId(_index: number, hit: AtomSearchHit): string {
    return hit.id;
  }

  trackByCategory(_index: number, cat: SearchCategory): string {
    return cat;
  }
}
