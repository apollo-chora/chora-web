import { type Locator, type Page, expect } from '@playwright/test';

export class RewardStorePage {
  readonly page: Page;

  // Reward store
  readonly rewardStore: Locator;
  readonly skinsTab: Locator;
  readonly itemsTab: Locator;
  readonly bountiesTab: Locator;

  // Skin gallery
  readonly skinGallery: Locator;
  readonly skinGrid: Locator;
  readonly rarityFilter: Locator;

  // Transaction history
  readonly transactionHistory: Locator;
  readonly transactionList: Locator;

  // Bounties
  readonly bountyList: Locator;

  constructor(page: Page) {
    this.page = page;

    this.rewardStore = page.locator('[data-testid="reward-store"]');
    this.skinsTab = page.locator('[data-testid="tab-skins"]');
    this.itemsTab = page.locator('[data-testid="tab-items"]');
    this.bountiesTab = page.locator('[data-testid="tab-bounties"]');

    this.skinGallery = page.locator('[data-testid="skin-gallery"]');
    this.skinGrid = page.locator('[data-testid="skin-grid"]');
    this.rarityFilter = page.locator('[data-testid="rarity-filter"]');

    this.transactionHistory = page.locator('[data-testid="transaction-history"]');
    this.transactionList = page.locator('[data-testid="transaction-list"]');

    this.bountyList = page.locator('[data-testid="bounty-list"]');
  }

  async gotoStore(): Promise<this> {
    await this.page.goto('/choraverse/store');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoSkins(): Promise<this> {
    await this.page.goto('/choraverse/skins');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoTransactions(): Promise<this> {
    await this.page.goto('/choraverse/transactions');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectStoreLoaded(): Promise<this> {
    await expect(this.rewardStore).toBeVisible();
    return this;
  }

  async expectSkinsLoaded(): Promise<this> {
    await expect(this.skinGallery).toBeVisible();
    return this;
  }

  async expectTransactionsLoaded(): Promise<this> {
    await expect(this.transactionHistory).toBeVisible();
    return this;
  }

  async clickTab(tab: 'skins' | 'items' | 'bounties'): Promise<this> {
    const locators = { skins: this.skinsTab, items: this.itemsTab, bounties: this.bountiesTab };
    await locators[tab].click();
    return this;
  }

  async filterByRarity(rarity: string): Promise<this> {
    await this.rarityFilter.selectOption(rarity);
    return this;
  }

  async getSkinCardCount(): Promise<number> {
    return this.skinGrid.locator('[data-testid^="skin-card"]').count();
  }

  async getTransactionCount(): Promise<number> {
    return this.transactionList.locator('[data-testid^="transaction-row"]').count();
  }
}
