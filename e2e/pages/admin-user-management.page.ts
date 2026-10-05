import { type Locator, type Page, expect } from '@playwright/test';

/**
 * Page Object Model for the admin user management page.
 * Route: /admin/tenant/users
 */
export class AdminUserManagementPage {
  readonly page: Page;
  readonly container: Locator;
  readonly title: Locator;
  readonly filters: Locator;
  readonly searchEmailInput: Locator;
  readonly roleFilter: Locator;
  readonly stateFilter: Locator;
  readonly loadingState: Locator;
  readonly emptyState: Locator;
  readonly table: Locator;
  readonly pagination: Locator;
  readonly pageInfo: Locator;
  readonly prevPageButton: Locator;
  readonly nextPageButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="user-management"]');
    this.title = page.locator('[data-testid="user-management-title"]');
    this.filters = page.locator('[data-testid="user-filters"]');
    this.searchEmailInput = page.locator('[data-testid="search-email"]');
    this.roleFilter = page.locator('[data-testid="role-filter"]');
    this.stateFilter = page.locator('[data-testid="state-filter"]');
    this.loadingState = page.locator('[data-testid="user-list-loading"]');
    this.emptyState = page.locator('[data-testid="user-list-empty"]');
    this.table = page.locator('[data-testid="user-table"]');
    this.pagination = page.locator('[data-testid="user-pagination"]');
    this.pageInfo = page.locator('[data-testid="user-page-info"]');
    this.prevPageButton = page.locator('[data-testid="btn-prev-page"]');
    this.nextPageButton = page.locator('[data-testid="btn-next-page"]');
  }

  async goto(): Promise<this> {
    await this.page.goto('/admin/tenant/users');
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

  async searchByEmail(email: string): Promise<this> {
    await this.searchEmailInput.fill(email);
    await this.page.waitForTimeout(400);
    return this;
  }

  async filterByRole(role: string): Promise<this> {
    await this.roleFilter.selectOption(role);
    return this;
  }

  async filterByState(state: string): Promise<this> {
    await this.stateFilter.selectOption(state);
    return this;
  }

  // User row interactions
  getUserRow(gcid: string): Locator {
    return this.page.locator(`[data-testid="user-row-${gcid}"]`);
  }

  getUserEmail(gcid: string): Locator {
    return this.page.locator(`[data-testid="user-email-${gcid}"]`);
  }

  getUserState(gcid: string): Locator {
    return this.page.locator(`[data-testid="user-state-${gcid}"]`);
  }

  getRoleChip(role: string): Locator {
    return this.page.locator(`[data-testid="role-chip-${role}"]`);
  }

  async clickEditRoles(gcid: string): Promise<this> {
    await this.page.locator(`[data-testid="btn-edit-roles-${gcid}"]`).click();
    return this;
  }

  getRoleEditor(gcid: string): Locator {
    return this.page.locator(`[data-testid="role-editor-${gcid}"]`);
  }

  async toggleRole(gcid: string, role: string): Promise<this> {
    await this.page.locator(`[data-testid="role-toggle-${role}-${gcid}"]`).click();
    return this;
  }

  async suspendUser(gcid: string): Promise<this> {
    await this.page.locator(`[data-testid="btn-suspend-${gcid}"]`).click();
    return this;
  }

  async reactivateUser(gcid: string): Promise<this> {
    await this.page.locator(`[data-testid="btn-reactivate-${gcid}"]`).click();
    return this;
  }

  async revokeAccess(gcid: string): Promise<this> {
    await this.page.locator(`[data-testid="btn-revoke-${gcid}"]`).click();
    return this;
  }

  async getRowCount(): Promise<number> {
    return this.table.locator('tbody tr').count();
  }
}
