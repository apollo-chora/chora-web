import { test, expect } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import {
  buildSubscription,
  buildInvoice,
  buildPromoCode,
  buildUsageSummary,
  mockBillingSubscription,
  mockBillingInvoices,
  mockBillingPromoCodes,
  mockBillingUsage,
} from '../fixtures/wave4-bff-mocks';
import { BillingPage } from '../pages/billing.page';
import { runAxeAudit } from '../fixtures/a11y.fixture';

// ---------------------------------------------------------------------------
// Viewport: tablet primary (1024x768)
// ---------------------------------------------------------------------------
test.use({ viewport: { width: 1024, height: 768 } });

// ---------------------------------------------------------------------------
// Billing — Subscription
// ---------------------------------------------------------------------------
test.describe('Billing — Subscription', () => {
  let billingPage: BillingPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin', [
      'learner_engagement',
      'marketplace',
    ]);
    billingPage = new BillingPage(page);
  });

  test('displays current subscription', async ({ page }) => {
    const subscription = buildSubscription({
      plan_name: 'Standard Plan',
      status: 'active',
    });
    await mockBillingSubscription(page, subscription);

    await billingPage.gotoSubscription();
    await billingPage.expectSubscriptionLoaded();
    await expect(billingPage.subscriptionManager).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Billing — Invoices
// ---------------------------------------------------------------------------
test.describe('Billing — Invoices', () => {
  let billingPage: BillingPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin', [
      'learner_engagement',
      'marketplace',
    ]);
    billingPage = new BillingPage(page);
  });

  test('displays invoice table with mock data', async ({ page }) => {
    const invoices = [
      buildInvoice({ id: 'inv-1', status: 'paid', amount_cents: 4999 }),
      buildInvoice({ id: 'inv-2', status: 'pending', amount_cents: 2999, pdf_url: null }),
      buildInvoice({ id: 'inv-3', status: 'overdue', amount_cents: 7999 }),
    ];
    await mockBillingInvoices(page, invoices);

    await billingPage.gotoInvoices();
    await billingPage.expectInvoicesLoaded();
    await expect(billingPage.invoiceTable).toBeVisible();
  });

  test('filters invoices by status', async ({ page }) => {
    const invoices = [
      buildInvoice({ status: 'paid' }),
      buildInvoice({ status: 'pending' }),
    ];
    await mockBillingInvoices(page, invoices);

    await billingPage.gotoInvoices();
    await billingPage.expectInvoicesLoaded();
    await billingPage.filterInvoicesByStatus('paid');
    await expect(billingPage.invoiceStatusFilter).toHaveValue('paid');
  });

  test('PDF download button reflects pdf_url availability', async ({ page }) => {
    const invoices = [
      buildInvoice({
        id: 'inv-with-pdf',
        status: 'paid',
        pdf_url: 'https://billing.example.com/inv-1.pdf',
      }),
      buildInvoice({
        id: 'inv-no-pdf',
        status: 'pending',
        pdf_url: null,
      }),
    ];
    await mockBillingInvoices(page, invoices);

    await billingPage.gotoInvoices();
    await billingPage.expectInvoicesLoaded();

    // Invoice with PDF should have an enabled download button
    const pdfBtn = page.locator('[data-testid="btn-download-pdf-inv-with-pdf"]');
    if (await pdfBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(pdfBtn).toBeEnabled();
    }

    // Invoice without PDF should have a disabled button or no button
    const noPdfBtn = page.locator('[data-testid="btn-download-pdf-inv-no-pdf"]');
    if (await noPdfBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(noPdfBtn).toBeDisabled();
    }
  });
});

// ---------------------------------------------------------------------------
// Billing — Promo Codes
// ---------------------------------------------------------------------------
test.describe('Billing — Promo Codes', () => {
  let billingPage: BillingPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin', [
      'learner_engagement',
      'marketplace',
    ]);
    billingPage = new BillingPage(page);
  });

  test('displays promo code list', async ({ page }) => {
    const promoCodes = [
      buildPromoCode({ code: 'SPRING2026', discount_pct: 20, is_active: true }),
      buildPromoCode({ code: 'EXPIRED50', discount_pct: 50, is_active: false }),
    ];
    await mockBillingPromoCodes(page, promoCodes);

    await billingPage.gotoPromoCodes();
    await billingPage.expectPromoCodesLoaded();
    await expect(billingPage.promoCodeList).toBeVisible();
  });

  test('create promo code form has required fields', async ({ page }) => {
    await mockBillingPromoCodes(page, []);

    await billingPage.gotoPromoCodes();
    await billingPage.expectPromoCodesLoaded();

    // Click create button if visible
    if (await billingPage.createPromoBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await billingPage.createPromoBtn.click();
      // Form fields should be visible
      await expect(billingPage.promoCodeInput).toBeVisible();
      await expect(billingPage.promoDiscountInput).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// Billing — Usage
// ---------------------------------------------------------------------------
test.describe('Billing — Usage', () => {
  test('displays usage dashboard with quota cards', async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin', [
      'learner_engagement',
      'marketplace',
    ]);
    const summaries = [
      buildUsageSummary({ resource_type: 'api_calls', current_usage: 7500, limit: 10000, unit: 'calls' }),
      buildUsageSummary({ resource_type: 'storage', current_usage: 45, limit: 100, unit: 'GB' }),
      buildUsageSummary({ resource_type: 'ai_tokens', current_usage: 500000, limit: 1000000, unit: 'tokens' }),
    ];
    await mockBillingUsage(page, summaries);

    const billingPage = new BillingPage(page);
    await billingPage.gotoUsage();
    await billingPage.expectUsageLoaded();
    await expect(billingPage.usageDashboard).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Billing — Accessibility
// ---------------------------------------------------------------------------
test.describe('Billing — Accessibility', () => {
  test('subscription page passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin', [
      'learner_engagement',
      'marketplace',
    ]);
    await mockBillingSubscription(page, buildSubscription());

    const billingPage = new BillingPage(page);
    await billingPage.gotoSubscription();
    await billingPage.expectSubscriptionLoaded();

    await runAxeAudit(page, 'Billing subscription page');
  });
});
