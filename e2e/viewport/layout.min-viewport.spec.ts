import { test, expect } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import { mockDashboard, mockGoals, mockLeaderboard, mockAtomList, mockTopicTree, mockDailyDose } from '../fixtures/bff-mocks';
import { buildAtom, buildTopicNode, buildDailyDose } from '../fixtures/test-builders';

/**
 * Minimum viewport verification (1280x720).
 * All pages MUST render without horizontal scroll.
 * Runs only in the "Minimum Viewport" project.
 */

test.describe('Minimum viewport — no horizontal scroll', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page);
  });

  const assertNoHorizontalScroll = async (page: import('@playwright/test').Page) => {
    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  };

  test('/dashboard renders without horizontal scroll at 1280x720', async ({ page }) => {
    await mockDashboard(page);
    await mockGoals(page);
    await mockLeaderboard(page);
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
    await assertNoHorizontalScroll(page);
  });

  test('/learning renders without horizontal scroll at 1280x720', async ({ page }) => {
    await mockTopicTree(page, [buildTopicNode()]);
    await mockAtomList(page, [buildAtom()]);
    await page.goto('/learning');
    await expect(page.locator('[data-testid="atom-list-page"]')).toBeVisible();
    await assertNoHorizontalScroll(page);
  });

  test('/learning/daily-dose renders without horizontal scroll at 1280x720', async ({ page }) => {
    await mockDailyDose(page, buildDailyDose());
    await page.goto('/learning/daily-dose');
    await expect(page.locator('[data-testid="daily-dose"]')).toBeVisible();
    await assertNoHorizontalScroll(page);
  });
});

test.describe('Minimum viewport — layout elements visible', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page);
    await mockDashboard(page);
    await mockGoals(page);
    await mockLeaderboard(page);
  });

  test('sidebar and top nav visible at 1280x720', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="main-layout"]')).toBeVisible();
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
    await expect(page.locator('[data-testid="top-nav"]')).toBeVisible();
  });

  test('main content area fills available space', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible();

    const mainContent = page.locator('[data-testid="main-content"]');
    const box = await mainContent.boundingBox();
    expect(box).toBeTruthy();
    // Main content should have meaningful width
    expect(box!.width).toBeGreaterThan(500);
  });
});
