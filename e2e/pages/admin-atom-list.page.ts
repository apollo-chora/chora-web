import { type Locator, type Page, expect } from '@playwright/test';

/**
 * Page Object Model for the admin atom list page.
 * Route: /admin/content/atoms
 */
export class AdminAtomListPage {
  readonly page: Page;
  readonly container: Locator;
  readonly title: Locator;
  readonly createButton: Locator;
  readonly filters: Locator;
  readonly searchInput: Locator;
  readonly statusFilter: Locator;
  readonly difficultyFilter: Locator;
  readonly typeFilter: Locator;
  readonly bulkActions: Locator;
  readonly selectionCount: Locator;
  readonly bulkPublishButton: Locator;
  readonly bulkArchiveButton: Locator;
  readonly selectAll: Locator;
  readonly loadingState: Locator;
  readonly emptyState: Locator;
  readonly table: Locator;
  readonly pagination: Locator;
  readonly pageInfo: Locator;
  readonly prevPageButton: Locator;
  readonly nextPageButton: Locator;
  readonly pageSizeSelect: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="atom-list"]');
    this.title = page.locator('[data-testid="atom-list-title"]');
    this.createButton = page.locator('[data-testid="btn-create-atom"]');
    this.filters = page.locator('[data-testid="atom-list-filters"]');
    this.searchInput = page.locator('[data-testid="search-input"]');
    this.statusFilter = page.locator('[data-testid="status-filter"]');
    this.difficultyFilter = page.locator('[data-testid="difficulty-filter"]');
    this.typeFilter = page.locator('[data-testid="type-filter"]');
    this.bulkActions = page.locator('[data-testid="bulk-actions"]');
    this.selectionCount = page.locator('[data-testid="selection-count"]');
    this.bulkPublishButton = page.locator('[data-testid="btn-bulk-publish"]');
    this.bulkArchiveButton = page.locator('[data-testid="btn-bulk-archive"]');
    this.selectAll = page.locator('[data-testid="select-all"]');
    this.loadingState = page.locator('[data-testid="atom-list-loading"]');
    this.emptyState = page.locator('[data-testid="atom-list-empty"]');
    this.table = page.locator('[data-testid="atom-table"]');
    this.pagination = page.locator('[data-testid="atom-pagination"]');
    this.pageInfo = page.locator('[data-testid="page-info"]');
    this.prevPageButton = page.locator('[data-testid="btn-prev-page"]');
    this.nextPageButton = page.locator('[data-testid="btn-next-page"]');
    this.pageSizeSelect = page.locator('[data-testid="page-size-select"]');
  }

  async goto(): Promise<this> {
    await this.page.goto('/admin/content/atoms');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectLoaded(): Promise<this> {
    await expect(this.container).toBeVisible();
    await expect(this.table).toBeVisible();
    return this;
  }

  async expectEmpty(): Promise<this> {
    await expect(this.emptyState).toBeVisible();
    return this;
  }

  async expectLoading(): Promise<this> {
    await expect(this.loadingState).toBeVisible();
    return this;
  }

  async search(query: string): Promise<this> {
    await this.searchInput.fill(query);
    // Wait for debounce
    await this.page.waitForTimeout(400);
    return this;
  }

  async filterByStatus(status: string): Promise<this> {
    await this.statusFilter.selectOption(status);
    return this;
  }

  async filterByDifficulty(difficulty: string): Promise<this> {
    await this.difficultyFilter.selectOption(difficulty);
    return this;
  }

  async clickTypeChip(type: string): Promise<this> {
    await this.page.locator(`[data-testid="type-chip-${type}"]`).click();
    return this;
  }

  async selectAtom(atomId: string): Promise<this> {
    await this.page.locator(`[data-testid="select-${atomId}"]`).check();
    return this;
  }

  async clickSelectAll(): Promise<this> {
    await this.selectAll.click();
    return this;
  }

  async clickBulkArchive(): Promise<this> {
    await this.bulkArchiveButton.click();
    return this;
  }

  async clickBulkPublish(): Promise<this> {
    await this.bulkPublishButton.click();
    return this;
  }

  async clickCreateAtom(): Promise<void> {
    await this.createButton.click();
  }

  async clickAtomRow(atomId: string): Promise<void> {
    await this.page.locator(`[data-testid="atom-row-${atomId}"]`).click();
  }

  getAtomStatus(atomId: string): Locator {
    return this.page.locator(`[data-testid="atom-status-${atomId}"]`);
  }

  getAtomTitle(atomId: string): Locator {
    return this.page.locator(`[data-testid="atom-title-${atomId}"]`);
  }

  getAtomRow(atomId: string): Locator {
    return this.page.locator(`[data-testid="atom-row-${atomId}"]`);
  }

  async getRowCount(): Promise<number> {
    return this.table.locator('tbody tr').count();
  }
}
