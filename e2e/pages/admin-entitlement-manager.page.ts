import { type Locator, type Page, expect } from '@playwright/test';

/**
 * Page Object Model for the admin entitlement manager page.
 * Route: /admin/tenant/entitlements
 */
export class AdminEntitlementManagerPage {
  readonly page: Page;
  readonly container: Locator;
  readonly title: Locator;
  readonly categoryFilters: Locator;
  readonly loadingState: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="entitlement-manager"]');
    this.title = page.locator('[data-testid="entitlement-manager-title"]');
    this.categoryFilters = page.locator('[data-testid="category-filters"]');
    this.loadingState = page.locator('[data-testid="entitlement-loading"]');
    this.emptyState = page.locator('[data-testid="entitlement-empty"]');
  }

  async goto(): Promise<this> {
    await this.page.goto('/admin/tenant/entitlements');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectLoaded(): Promise<this> {
    await expect(this.container).toBeVisible();
    return this;
  }

  async expectEmpty(): Promise<this> {
    await expect(this.emptyState).toBeVisible();
    return this;
  }

  async clickCategoryChip(category: string): Promise<this> {
    await this.page.locator(`[data-testid="category-chip-${category}"]`).click();
    return this;
  }

  isCategoryChipActive(category: string): Locator {
    return this.page.locator(`[data-testid="category-chip-${category}"]`);
  }

  // Add-on card interactions
  getAddonCard(code: string): Locator {
    return this.page.locator(`[data-testid="addon-card-${code}"]`);
  }

  getAddonCategory(code: string): Locator {
    return this.page.locator(`[data-testid="addon-category-${code}"]`);
  }

  getAddonToggle(code: string): Locator {
    return this.page.locator(`[data-testid="toggle-${code}"]`);
  }

  async toggleAddOn(code: string): Promise<this> {
    await this.getAddonToggle(code).locator('input').click();
    return this;
  }

  async expectAddonEnabled(code: string): Promise<this> {
    const card = this.getAddonCard(code);
    await expect(card).toBeVisible();
    await expect(card.locator('[data-testid="addon-status-enabled"]')).toBeVisible();
    return this;
  }

  async expectAddonDisabled(code: string): Promise<this> {
    const card = this.getAddonCard(code);
    await expect(card).toBeVisible();
    await expect(card.locator('[data-testid="addon-status-disabled"]')).toBeVisible();
    return this;
  }

  getGroup(category: string): Locator {
    return this.page.locator(`[data-testid="group-${category}"]`);
  }
}
