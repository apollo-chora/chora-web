import { type Locator, type Page, expect } from '@playwright/test';

export class SearchPage {
  readonly page: Page;

  // Search input
  readonly searchContainer: Locator;
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly clearSearchButton: Locator;

  // Search filters
  readonly filterPanel: Locator;
  readonly atomTypeFilter: Locator;
  readonly difficultyFilter: Locator;
  readonly topicFilter: Locator;
  readonly tagFilter: Locator;
  readonly dateRangeFilter: Locator;
  readonly applyFiltersButton: Locator;
  readonly clearFiltersButton: Locator;
  readonly activeFilterChips: Locator;

  // Search results
  readonly resultsList: Locator;
  readonly resultCards: Locator;
  readonly resultCount: Locator;
  readonly noResultsMessage: Locator;
  readonly loadingSpinner: Locator;

  // Sorting
  readonly sortSelect: Locator;

  // Pagination
  readonly paginationContainer: Locator;
  readonly nextPageButton: Locator;
  readonly previousPageButton: Locator;
  readonly pageIndicator: Locator;

  // Facets
  readonly facetPanel: Locator;
  readonly facetGroups: Locator;

  constructor(page: Page) {
    this.page = page;

    // Search input
    this.searchContainer = page.locator('[data-testid="search-container"]');
    this.searchInput = page.locator('[data-testid="search-input"]');
    this.searchButton = page.locator('[data-testid="search-button"]');
    this.clearSearchButton = page.locator('[data-testid="clear-search-button"]');

    // Search filters
    this.filterPanel = page.locator('[data-testid="search-filter-panel"]');
    this.atomTypeFilter = page.locator('[data-testid="filter-atom-type"]');
    this.difficultyFilter = page.locator('[data-testid="filter-difficulty"]');
    this.topicFilter = page.locator('[data-testid="filter-topic"]');
    this.tagFilter = page.locator('[data-testid="filter-tag"]');
    this.dateRangeFilter = page.locator('[data-testid="filter-date-range"]');
    this.applyFiltersButton = page.locator('[data-testid="apply-filters-button"]');
    this.clearFiltersButton = page.locator('[data-testid="clear-filters-button"]');
    this.activeFilterChips = page.locator('[data-testid^="filter-chip"]');

    // Search results
    this.resultsList = page.locator('[data-testid="search-results-list"]');
    this.resultCards = page.locator('[data-testid^="search-result-card"]');
    this.resultCount = page.locator('[data-testid="search-result-count"]');
    this.noResultsMessage = page.locator('[data-testid="no-results-message"]');
    this.loadingSpinner = page.locator('[data-testid="search-loading-spinner"]');

    // Sorting
    this.sortSelect = page.locator('[data-testid="search-sort-select"]');

    // Pagination
    this.paginationContainer = page.locator('[data-testid="search-pagination"]');
    this.nextPageButton = page.locator('[data-testid="search-next-page"]');
    this.previousPageButton = page.locator('[data-testid="search-previous-page"]');
    this.pageIndicator = page.locator('[data-testid="search-page-indicator"]');

    // Facets
    this.facetPanel = page.locator('[data-testid="search-facet-panel"]');
    this.facetGroups = page.locator('[data-testid^="facet-group"]');
  }

  async goto(query?: string): Promise<this> {
    const url = query ? `/search?q=${encodeURIComponent(query)}` : '/search';
    await this.page.goto(url);
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectSearchLoaded(): Promise<this> {
    await expect(this.searchContainer).toBeVisible();
    return this;
  }

  async expectResultsDisplayed(): Promise<this> {
    await expect(this.resultsList).toBeVisible();
    return this;
  }

  async expectNoResults(): Promise<this> {
    await expect(this.noResultsMessage).toBeVisible();
    return this;
  }

  async search(query: string): Promise<this> {
    await this.searchInput.fill(query);
    await this.searchButton.click();
    return this;
  }

  async clearSearch(): Promise<this> {
    await this.clearSearchButton.click();
    return this;
  }

  async filterByAtomType(type: string): Promise<this> {
    await this.atomTypeFilter.selectOption(type);
    return this;
  }

  async filterByDifficulty(difficulty: string): Promise<this> {
    await this.difficultyFilter.selectOption(difficulty);
    return this;
  }

  async filterByTopic(topic: string): Promise<this> {
    await this.topicFilter.selectOption(topic);
    return this;
  }

  async applyFilters(): Promise<this> {
    await this.applyFiltersButton.click();
    return this;
  }

  async clearFilters(): Promise<this> {
    await this.clearFiltersButton.click();
    return this;
  }

  async sortBy(option: string): Promise<this> {
    await this.sortSelect.selectOption(option);
    return this;
  }

  async gotoNextPage(): Promise<this> {
    await this.nextPageButton.click();
    return this;
  }

  async gotoPreviousPage(): Promise<this> {
    await this.previousPageButton.click();
    return this;
  }

  async getResultCount(): Promise<number> {
    return this.resultCards.count();
  }

  async getActiveFilterCount(): Promise<number> {
    return this.activeFilterChips.count();
  }

  async getFacetGroupCount(): Promise<number> {
    return this.facetGroups.count();
  }
}
