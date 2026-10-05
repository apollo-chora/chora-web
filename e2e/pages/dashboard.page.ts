import { type Locator, type Page, expect } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly container: Locator;
  readonly loadingState: Locator;
  readonly errorState: Locator;
  readonly retryButton: Locator;
  readonly grid: Locator;
  readonly doseWidget: Locator;
  readonly doseStartButton: Locator;
  readonly doseCompleted: Locator;
  readonly doseEmpty: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="dashboard"]');
    this.loadingState = page.locator('[data-testid="dashboard-loading"]');
    this.errorState = page.locator('[data-testid="dashboard-error"]');
    this.retryButton = page.locator('[data-testid="dashboard-retry"]');
    this.grid = page.locator('[data-testid="dashboard-grid"]');
    this.doseWidget = page.locator('[data-testid="dashboard-dose-widget"]');
    this.doseStartButton = page.locator('[data-testid="dose-start-btn"]');
    this.doseCompleted = page.locator('[data-testid="dose-completed"]');
    this.doseEmpty = page.locator('[data-testid="dose-empty"]');
  }

  async goto(): Promise<this> {
    await this.page.goto('/dashboard');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectLoaded(): Promise<this> {
    await expect(this.grid).toBeVisible();
    return this;
  }

  async expectLoading(): Promise<this> {
    await expect(this.loadingState).toBeVisible();
    return this;
  }

  async expectError(): Promise<this> {
    await expect(this.errorState).toBeVisible();
    await expect(this.retryButton).toBeVisible();
    return this;
  }

  async retry(): Promise<this> {
    await this.retryButton.click();
    return this;
  }

  async clickDoseStart(): Promise<void> {
    await this.doseStartButton.click();
  }

  async expectDoseAvailable(): Promise<this> {
    await expect(this.doseWidget).toBeVisible();
    await expect(this.doseStartButton).toBeVisible();
    return this;
  }

  async expectDoseCompleted(): Promise<this> {
    await expect(this.doseCompleted).toBeVisible();
    return this;
  }
}
