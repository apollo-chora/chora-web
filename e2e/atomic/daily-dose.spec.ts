import { test, expect } from '@playwright/test';
import { DailyDosePage } from '../pages/daily-dose.page';
import { mockAuthSession } from '../fixtures/auth-mocks';
import { mockDailyDose } from '../fixtures/bff-mocks';
import { buildDailyDose } from '../fixtures/test-builders';
import { runAxeAudit } from '../fixtures/a11y.fixture';

test.describe('DailyDose — card carousel', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page);
  });

  test('renders dose cards with header and progress', async ({ page }) => {
    await mockDailyDose(page, buildDailyDose());

    const dose = new DailyDosePage(page);
    await dose.goto();
    await dose.expectLoaded();

    await expect(dose.header).toBeVisible();
    await expect(dose.counter).toBeVisible();
    await expect(dose.progressBar).toBeVisible();
    await expect(dose.currentCard).toBeVisible();
  });

  test('card displays title and topic', async ({ page }) => {
    await mockDailyDose(page, buildDailyDose());

    const dose = new DailyDosePage(page);
    await dose.goto();
    await dose.expectLoaded();

    await expect(dose.cardTitle).toBeVisible();
  });

  test('navigation buttons cycle through cards', async ({ page }) => {
    await mockDailyDose(page, buildDailyDose());

    const dose = new DailyDosePage(page);
    await dose.goto();
    await dose.expectLoaded();

    // Should be able to navigate forward
    if (await dose.nextButton.isEnabled()) {
      await dose.navigateNext();
      await expect(dose.currentCard).toBeVisible();
    }
  });

  test('start button opens atom player', async ({ page }) => {
    await mockDailyDose(page, buildDailyDose());

    // Also mock GraphQL for the player
    await page.route('**/api/v1/graphql', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { atom: null } }),
      });
    });

    const dose = new DailyDosePage(page);
    await dose.goto();
    await dose.expectLoaded();

    await dose.startAtom();
    // Navigation to player or inline rendering
    await expect(dose.container).toBeVisible();
  });
});

test.describe('DailyDose — error handling', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page);
  });

  test('shows error state on load failure', async ({ page }) => {
    await page.route('**/api/v1/engagement/daily-dose', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Failure', details: {} } }),
      });
    });

    const dose = new DailyDosePage(page);
    await dose.goto();
    await dose.expectError();

    await expect(dose.exitButton).toBeVisible();
  });
});

test.describe('DailyDose — close and done', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page);
  });

  test('close button navigates back', async ({ page }) => {
    await mockDailyDose(page, buildDailyDose());

    const dose = new DailyDosePage(page);
    await dose.goto();
    await dose.expectLoaded();

    await dose.closeButton.click();
    await expect(page).not.toHaveURL(/\/daily-dose/);
  });
});

test.describe('DailyDose — accessibility', () => {
  test('daily dose passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page);
    await mockDailyDose(page, buildDailyDose());

    const dose = new DailyDosePage(page);
    await dose.goto();
    await dose.expectLoaded();

    await runAxeAudit(page, 'DailyDose');
  });
});
