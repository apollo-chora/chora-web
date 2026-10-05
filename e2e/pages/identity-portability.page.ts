import { type Locator, type Page, expect } from '@playwright/test';

export class IdentityPortabilityPage {
  readonly page: Page;

  // Merge wizard
  readonly mergeWizard: Locator;
  readonly stepIndicator: Locator;
  readonly nextStepBtn: Locator;
  readonly prevStepBtn: Locator;
  readonly confirmInput: Locator;
  readonly confirmMergeBtn: Locator;

  // Portable data dashboard
  readonly portableDataDashboard: Locator;
  readonly gcidScopedPanel: Locator;
  readonly tenantScopedPanel: Locator;

  // Migration flow
  readonly migrationFlow: Locator;
  readonly tenantList: Locator;

  constructor(page: Page) {
    this.page = page;

    this.mergeWizard = page.locator('[data-testid="merge-wizard"]');
    this.stepIndicator = page.locator('[data-testid="step-indicator"]');
    this.nextStepBtn = page.locator('[data-testid="btn-next-step"]');
    this.prevStepBtn = page.locator('[data-testid="btn-prev-step"]');
    this.confirmInput = page.locator('[data-testid="merge-confirm-input"]');
    this.confirmMergeBtn = page.locator('[data-testid="btn-confirm-merge"]');

    this.portableDataDashboard = page.locator('[data-testid="portable-data-dashboard"]');
    this.gcidScopedPanel = page.locator('[data-testid="gcid-scoped-panel"]');
    this.tenantScopedPanel = page.locator('[data-testid="tenant-scoped-panel"]');

    this.migrationFlow = page.locator('[data-testid="migration-flow"]');
    this.tenantList = page.locator('[data-testid="tenant-list"]');
  }

  async gotoMerge(): Promise<this> {
    await this.page.goto('/settings/identity');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoData(): Promise<this> {
    await this.page.goto('/settings/identity/data');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoMigration(): Promise<this> {
    await this.page.goto('/settings/identity/migration');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectMergeWizardLoaded(): Promise<this> {
    await expect(this.mergeWizard).toBeVisible();
    return this;
  }

  async expectPortableDataLoaded(): Promise<this> {
    await expect(this.portableDataDashboard).toBeVisible();
    return this;
  }

  async expectMigrationLoaded(): Promise<this> {
    await expect(this.migrationFlow).toBeVisible();
    return this;
  }

  async clickNextStep(): Promise<this> {
    await this.nextStepBtn.click();
    return this;
  }

  async clickPrevStep(): Promise<this> {
    await this.prevStepBtn.click();
    return this;
  }

  async getCurrentStep(): Promise<string> {
    return (await this.stepIndicator.getAttribute('data-step')) ?? '';
  }

  async typeConfirmation(text: string): Promise<this> {
    await this.confirmInput.fill(text);
    return this;
  }

  async getTenantCount(): Promise<number> {
    return this.tenantList.locator('[data-testid^="tenant-row"]').count();
  }
}
