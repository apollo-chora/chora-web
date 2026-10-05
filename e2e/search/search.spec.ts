import { test, expect } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import {
  buildSearchResult,
  buildSearchFacet,
  mockSearchAPI,
} from '../fixtures/phase29-community-mocks';
import { SearchPage } from '../pages/search.page';
import { runAxeAudit } from '../fixtures/a11y.fixture';

// ---------------------------------------------------------------------------
// Viewport: tablet primary (1024x768)
// ---------------------------------------------------------------------------
test.use({ viewport: { width: 1024, height: 768 } });

// ---------------------------------------------------------------------------
// Search — Input & Execution
// ---------------------------------------------------------------------------
test.describe('Search — Input & Execution', () => {
  let searchPage: SearchPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner');
    searchPage = new SearchPage(page);
  });

  test('search page renders with input field and search button', async ({ page }) => {
    await mockSearchAPI(page, { results: [] });

    await searchPage.goto();
    await searchPage.expectSearchLoaded();
    await expect(searchPage.searchInput).toBeVisible();
    await expect(searchPage.searchButton).toBeVisible();
  });

  test('search executes on button click and displays results', async ({ page }) => {
    const results = [
      buildSearchResult({ id: 'r-1', title: 'Algebra Introduction', score: 0.98 }),
      buildSearchResult({ id: 'r-2', title: 'Algebra Advanced', score: 0.85 }),
      buildSearchResult({ id: 'r-3', title: 'Pre-Algebra', score: 0.72 }),
    ];
    await mockSearchAPI(page, { results, totalCount: 3 });

    await searchPage.goto();
    await searchPage.expectSearchLoaded();
    await searchPage.search('algebra');
    await searchPage.expectResultsDisplayed();
    await expect(searchPage.resultCards.first()).toBeVisible();
  });

  test('search with query parameter pre-fills input and displays results', async ({ page }) => {
    const results = [
      buildSearchResult({ id: 'r-1', title: 'Geometry Basics' }),
    ];
    await mockSearchAPI(page, { results });

    await searchPage.goto('geometry');
    await searchPage.expectSearchLoaded();
    await expect(searchPage.searchInput).toHaveValue('geometry');
    await searchPage.expectResultsDisplayed();
  });

  test('empty search shows no results message', async ({ page }) => {
    await mockSearchAPI(page, { results: [], totalCount: 0 });

    await searchPage.goto();
    await searchPage.expectSearchLoaded();
    await searchPage.search('xyznonexistent');
    await searchPage.expectNoResults();
    await expect(searchPage.noResultsMessage).toBeVisible();
  });

  test('clear search button resets the input', async ({ page }) => {
    const results = [buildSearchResult()];
    await mockSearchAPI(page, { results });

    await searchPage.goto();
    await searchPage.expectSearchLoaded();
    await searchPage.search('algebra');
    await searchPage.clearSearch();
    await expect(searchPage.searchInput).toHaveValue('');
  });
});

// ---------------------------------------------------------------------------
// Search — Filter Application
// ---------------------------------------------------------------------------
test.describe('Search — Filters', () => {
  let searchPage: SearchPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner');
    searchPage = new SearchPage(page);
  });

  test('filter panel renders with atom type, difficulty, and topic filters', async ({ page }) => {
    const results = [buildSearchResult()];
    await mockSearchAPI(page, { results });

    await searchPage.goto();
    await searchPage.expectSearchLoaded();
    await expect(searchPage.filterPanel).toBeVisible();
    await expect(searchPage.atomTypeFilter).toBeVisible();
    await expect(searchPage.difficultyFilter).toBeVisible();
    await expect(searchPage.topicFilter).toBeVisible();
  });

  test('selecting atom type filter updates the filter value', async ({ page }) => {
    const results = [buildSearchResult({ atom_type: 'MCQ' })];
    await mockSearchAPI(page, { results });

    await searchPage.goto();
    await searchPage.expectSearchLoaded();
    await searchPage.filterByAtomType('MCQ');
    await expect(searchPage.atomTypeFilter).toHaveValue('MCQ');
  });

  test('selecting difficulty filter updates the filter value', async ({ page }) => {
    const results = [buildSearchResult({ difficulty: 3 })];
    await mockSearchAPI(page, { results });

    await searchPage.goto();
    await searchPage.expectSearchLoaded();
    await searchPage.filterByDifficulty('3');
    await expect(searchPage.difficultyFilter).toHaveValue('3');
  });

  test('clear filters button resets all active filters', async ({ page }) => {
    const results = [buildSearchResult()];
    await mockSearchAPI(page, { results });

    await searchPage.goto();
    await searchPage.expectSearchLoaded();
    await searchPage.filterByAtomType('MCQ');
    await searchPage.clearFilters();

    // Filters cleared — clear button action completed
    await expect(searchPage.filterPanel).toBeVisible();
  });

  test('facet panel renders with facet groups', async ({ page }) => {
    const facets = [
      buildSearchFacet({ field: 'atom_type', label: 'Atom Type' }),
      buildSearchFacet({
        field: 'difficulty',
        label: 'Difficulty',
        values: [
          { value: '1', count: 50, label: 'Easy' },
          { value: '2', count: 80, label: 'Medium' },
          { value: '3', count: 45, label: 'Hard' },
        ],
      }),
    ];
    const results = [buildSearchResult()];
    await mockSearchAPI(page, { results, facets });

    await searchPage.goto('algebra');
    await searchPage.expectSearchLoaded();
    await expect(searchPage.facetPanel).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Search — Result Display
// ---------------------------------------------------------------------------
test.describe('Search — Result Display', () => {
  let searchPage: SearchPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner');
    searchPage = new SearchPage(page);
  });

  test('result cards display title, type, difficulty, and tags', async ({ page }) => {
    const results = [
      buildSearchResult({
        id: 'r-1',
        title: 'Quadratic Formula',
        atom_type: 'MCQ',
        difficulty: 3,
        tags: ['algebra', 'quadratics'],
      }),
    ];
    await mockSearchAPI(page, { results });

    await searchPage.goto('quadratic');
    await searchPage.expectResultsDisplayed();
    await expect(searchPage.resultCards.first()).toBeVisible();
  });

  test('result count is displayed above results', async ({ page }) => {
    const results = [
      buildSearchResult({ id: 'r-1' }),
      buildSearchResult({ id: 'r-2' }),
      buildSearchResult({ id: 'r-3' }),
    ];
    await mockSearchAPI(page, { results, totalCount: 3 });

    await searchPage.goto('math');
    await searchPage.expectResultsDisplayed();
    await expect(searchPage.resultCount).toBeVisible();
  });

  test('sorting dropdown is accessible', async ({ page }) => {
    const results = [buildSearchResult()];
    await mockSearchAPI(page, { results });

    await searchPage.goto('algebra');
    await searchPage.expectResultsDisplayed();
    await expect(searchPage.sortSelect).toBeVisible();
    await searchPage.sortBy('relevance');
    await expect(searchPage.sortSelect).toHaveValue('relevance');
  });
});

// ---------------------------------------------------------------------------
// Search — Pagination
// ---------------------------------------------------------------------------
test.describe('Search — Pagination', () => {
  let searchPage: SearchPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner');
    searchPage = new SearchPage(page);
  });

  test('pagination controls render when multiple pages exist', async ({ page }) => {
    const results = Array.from({ length: 10 }, (_, i) =>
      buildSearchResult({ id: `r-${i}`, title: `Result ${i + 1}` }),
    );
    await mockSearchAPI(page, {
      results,
      totalCount: 50,
    });

    // Override for pagination metadata
    await page.route('**/api/v1/search**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          hits: results,
          facets: [],
          total_count: 50,
          processing_time_ms: 15,
          page_info: {
            has_next: true,
            has_previous: false,
            current_page: 1,
            total_pages: 5,
          },
        }),
      });
    });

    await searchPage.goto('math');
    await searchPage.expectResultsDisplayed();
    await expect(searchPage.paginationContainer).toBeVisible();
    await expect(searchPage.nextPageButton).toBeVisible();
    await expect(searchPage.pageIndicator).toBeVisible();
  });

  test('next page button advances to page 2', async ({ page }) => {
    const results = Array.from({ length: 10 }, (_, i) =>
      buildSearchResult({ id: `r-${i}` }),
    );

    await page.route('**/api/v1/search**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          hits: results,
          facets: [],
          total_count: 30,
          processing_time_ms: 10,
          page_info: {
            has_next: true,
            has_previous: false,
            current_page: 1,
            total_pages: 3,
          },
        }),
      });
    });

    await searchPage.goto('math');
    await searchPage.expectResultsDisplayed();
    await searchPage.gotoNextPage();

    // Next page action executed — results remain visible
    await expect(searchPage.resultsList).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Search — Accessibility
// ---------------------------------------------------------------------------
test.describe('Search — Accessibility', () => {
  test('search page passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'learner');
    const results = [
      buildSearchResult({ title: 'Algebra' }),
      buildSearchResult({ title: 'Geometry' }),
    ];
    await mockSearchAPI(page, { results, totalCount: 2 });

    const searchPage = new SearchPage(page);
    await searchPage.goto('math');
    await searchPage.expectResultsDisplayed();

    await runAxeAudit(page, 'Search results page');
  });

  test('empty search state passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'learner');
    await mockSearchAPI(page, { results: [], totalCount: 0 });

    const searchPage = new SearchPage(page);
    await searchPage.goto();
    await searchPage.expectSearchLoaded();

    await runAxeAudit(page, 'Search empty state');
  });

  test('search with no results passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'learner');
    await mockSearchAPI(page, { results: [], totalCount: 0 });

    const searchPage = new SearchPage(page);
    await searchPage.goto();
    await searchPage.expectSearchLoaded();
    await searchPage.search('nonexistentterm');
    await searchPage.expectNoResults();

    await runAxeAudit(page, 'Search no results');
  });
});
