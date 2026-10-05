import { type Locator, type Page, expect } from '@playwright/test';

export class GovernanceAdminPage {
  readonly page: Page;

  // Restriction dashboard
  readonly restrictionDashboard: Locator;
  readonly restrictionList: Locator;
  readonly tierFilter: Locator;
  readonly statusFilter: Locator;
  readonly applyRestrictionBtn: Locator;

  // Appeals
  readonly appealQueue: Locator;
  readonly appealList: Locator;

  // KYC
  readonly kycReview: Locator;
  readonly kycList: Locator;

  // Moderation
  readonly moderationLog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.restrictionDashboard = page.locator('[data-testid="restriction-dashboard"]');
    this.restrictionList = page.locator('[data-testid="restriction-list"]');
    this.tierFilter = page.locator('[data-testid="tier-filter"]');
    this.statusFilter = page.locator('[data-testid="status-filter"]');
    this.applyRestrictionBtn = page.locator('[data-testid="btn-apply-restriction"]');

    this.appealQueue = page.locator('[data-testid="appeal-queue"]');
    this.appealList = page.locator('[data-testid="appeal-list"]');

    this.kycReview = page.locator('[data-testid="kyc-review"]');
    this.kycList = page.locator('[data-testid="kyc-list"]');

    this.moderationLog = page.locator('[data-testid="moderation-log"]');
  }

  async gotoRestrictions(): Promise<this> {
    await this.page.goto('/admin/governance/restrictions');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoAppeals(): Promise<this> {
    await this.page.goto('/admin/governance/appeals');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoKYC(): Promise<this> {
    await this.page.goto('/admin/governance/kyc');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoModeration(): Promise<this> {
    await this.page.goto('/admin/governance/moderation');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectRestrictionsLoaded(): Promise<this> {
    await expect(this.restrictionDashboard).toBeVisible();
    return this;
  }

  async expectAppealsLoaded(): Promise<this> {
    await expect(this.appealQueue).toBeVisible();
    return this;
  }

  async expectKYCLoaded(): Promise<this> {
    await expect(this.kycReview).toBeVisible();
    return this;
  }

  async filterByTier(tier: string): Promise<this> {
    await this.tierFilter.selectOption(tier);
    return this;
  }

  async filterByStatus(status: string): Promise<this> {
    await this.statusFilter.selectOption(status);
    return this;
  }

  async getRestrictionCount(): Promise<number> {
    return this.restrictionList.locator('[data-testid^="restriction-row"]').count();
  }

  async getAppealCount(): Promise<number> {
    return this.appealList.locator('[data-testid^="appeal-row"]').count();
  }
}
