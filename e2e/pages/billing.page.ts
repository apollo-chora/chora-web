import { type Locator, type Page, expect } from '@playwright/test';

export class BillingPage {
  readonly page: Page;

  // Subscription
  readonly subscriptionManager: Locator;
  readonly planName: Locator;
  readonly planStatus: Locator;

  // Invoices
  readonly invoiceList: Locator;
  readonly invoiceTable: Locator;
  readonly invoiceStatusFilter: Locator;

  // Promo codes
  readonly promoCodeManager: Locator;
  readonly promoCodeList: Locator;
  readonly createPromoBtn: Locator;
  readonly promoCodeInput: Locator;
  readonly promoDiscountInput: Locator;
  readonly promoSubmitBtn: Locator;

  // Usage
  readonly usageDashboard: Locator;
  readonly quotaCards: Locator;

  constructor(page: Page) {
    this.page = page;

    this.subscriptionManager = page.locator('[data-testid="subscription-manager"]');
    this.planName = page.locator('[data-testid="plan-name"]');
    this.planStatus = page.locator('[data-testid="plan-status"]');

    this.invoiceList = page.locator('[data-testid="invoice-list"]');
    this.invoiceTable = page.locator('[data-testid="invoice-table"]');
    this.invoiceStatusFilter = page.locator('[data-testid="invoice-status-filter"]');

    this.promoCodeManager = page.locator('[data-testid="promo-code-manager"]');
    this.promoCodeList = page.locator('[data-testid="promo-code-list"]');
    this.createPromoBtn = page.locator('[data-testid="btn-create-promo"]');
    this.promoCodeInput = page.locator('[data-testid="promo-code-input"]');
    this.promoDiscountInput = page.locator('[data-testid="promo-discount-input"]');
    this.promoSubmitBtn = page.locator('[data-testid="btn-submit-promo"]');

    this.usageDashboard = page.locator('[data-testid="usage-dashboard"]');
    this.quotaCards = page.locator('[data-testid^="quota-card"]');
  }

  async gotoSubscription(): Promise<this> {
    await this.page.goto('/billing/subscription');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoInvoices(): Promise<this> {
    await this.page.goto('/billing/invoices');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoPromoCodes(): Promise<this> {
    await this.page.goto('/billing/promo-codes');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoUsage(): Promise<this> {
    await this.page.goto('/billing/usage');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectSubscriptionLoaded(): Promise<this> {
    await expect(this.subscriptionManager).toBeVisible();
    return this;
  }

  async expectInvoicesLoaded(): Promise<this> {
    await expect(this.invoiceList).toBeVisible();
    return this;
  }

  async expectPromoCodesLoaded(): Promise<this> {
    await expect(this.promoCodeManager).toBeVisible();
    return this;
  }

  async expectUsageLoaded(): Promise<this> {
    await expect(this.usageDashboard).toBeVisible();
    return this;
  }

  async filterInvoicesByStatus(status: string): Promise<this> {
    await this.invoiceStatusFilter.selectOption(status);
    return this;
  }

  async getInvoiceRowCount(): Promise<number> {
    return this.invoiceTable.locator('[data-testid^="invoice-row"]').count();
  }

  getPdfDownloadButton(invoiceId: string): Locator {
    return this.page.locator(`[data-testid="btn-download-pdf-${invoiceId}"]`);
  }

  async getPromoCodeCount(): Promise<number> {
    return this.promoCodeList.locator('[data-testid^="promo-code-row"]').count();
  }

  async getQuotaCardCount(): Promise<number> {
    return this.quotaCards.count();
  }
}
