import { type Locator, type Page, expect } from '@playwright/test';

export class AtomListPage {
  readonly page: Page;
  readonly container: Locator;
  readonly sidebar: Locator;
  readonly toolbar: Locator;
  readonly typeFilter: Locator;
  readonly difficultyFilter: Locator;
  readonly viewToggle: Locator;
  readonly clearTopicFilter: Locator;
  readonly atomGrid: Locator;
  readonly emptyState: Locator;
  readonly errorState: Locator;
  readonly loadMoreButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="atom-list-page"]');
    this.sidebar = page.locator('[data-testid="atom-list-sidebar"]');
    this.toolbar = page.locator('[data-testid="atom-list-toolbar"]');
    this.typeFilter = page.locator('[data-testid="type-filter"]');
    this.difficultyFilter = page.locator('[data-testid="difficulty-filter"]');
    this.viewToggle = page.locator('[data-testid="view-toggle"]');
    this.clearTopicFilter = page.locator('[data-testid="clear-topic-filter"]');
    this.atomGrid = page.locator('[data-testid="atom-grid"]');
    this.emptyState = page.locator('[data-testid="atom-list-empty"]');
    this.errorState = page.locator('[data-testid="atom-list-error"]');
    this.loadMoreButton = page.locator('[data-testid="load-more-btn"]');
  }

  async goto(): Promise<this> {
    await this.page.goto('/learning');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectLoaded(): Promise<this> {
    await expect(this.container).toBeVisible();
    await expect(this.atomGrid).toBeVisible();
    return this;
  }

  async expectEmpty(): Promise<this> {
    await expect(this.emptyState).toBeVisible();
    return this;
  }

  async expectError(): Promise<this> {
    await expect(this.errorState).toBeVisible();
    return this;
  }

  async selectTypeFilter(type: string): Promise<this> {
    await this.typeFilter.selectOption(type);
    return this;
  }

  async selectDifficultyFilter(difficulty: string): Promise<this> {
    await this.difficultyFilter.selectOption(difficulty);
    return this;
  }

  async toggleView(): Promise<this> {
    await this.viewToggle.click();
    return this;
  }

  async getAtomCardCount(): Promise<number> {
    return this.atomGrid.locator('[data-testid^="atom-card"]').count();
  }
}
