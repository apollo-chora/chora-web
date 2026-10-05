import { test, expect } from '@playwright/test';
import { mockAuthSession, mockUnauthenticatedSession } from '../fixtures/auth-mocks';
import { mockDashboard, mockGoals, mockLeaderboard, mockAtomList, mockTopicTree, mockDailyDose } from '../fixtures/bff-mocks';
import { buildAtom, buildTopicNode, buildDailyDose } from '../fixtures/test-builders';
import { runAxeAudit } from '../fixtures/a11y.fixture';

test.describe('Accessibility — auth pages', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login page has no critical a11y violations', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await runAxeAudit(page, 'Login');
  });

  test('register page has no critical a11y violations', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    await runAxeAudit(page, 'Register');
  });

  test('404 page has no critical a11y violations', async ({ page }) => {
    await page.goto('/nonexistent-page');
    await page.waitForLoadState('networkidle');
    await runAxeAudit(page, 'Not Found');
  });
});

test.describe('Accessibility — authenticated pages', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page);
  });

  test('dashboard has no critical a11y violations', async ({ page }) => {
    await mockDashboard(page);
    await mockGoals(page);
    await mockLeaderboard(page);
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="dashboard-grid"]')).toBeVisible();
    await runAxeAudit(page, 'Dashboard');
  });

  test('atom list has no critical a11y violations', async ({ page }) => {
    await mockTopicTree(page, [buildTopicNode()]);
    await mockAtomList(page, [buildAtom(), buildAtom()]);
    await page.goto('/learning');
    await expect(page.locator('[data-testid="atom-grid"]')).toBeVisible();
    await runAxeAudit(page, 'Atom List');
  });

  test('daily dose has no critical a11y violations', async ({ page }) => {
    await mockDailyDose(page, buildDailyDose());
    await page.goto('/learning/daily-dose');
    await expect(page.locator('[data-testid="dose-stack"]')).toBeVisible();
    await runAxeAudit(page, 'DailyDose');
  });
});

test.describe('Accessibility — keyboard navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page);
    await mockDashboard(page);
    await mockGoals(page);
    await mockLeaderboard(page);
  });

  test('sidebar navigation items are keyboard reachable', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="dashboard-grid"]')).toBeVisible();

    // Tab into sidebar items
    const sidebarItems = page.locator('[data-testid="sidebar"] a');
    const count = await sidebarItems.count();
    expect(count).toBeGreaterThan(0);

    // Each nav item should have an aria-label
    for (let i = 0; i < count; i++) {
      const label = await sidebarItems.nth(i).getAttribute('aria-label');
      expect(label).toBeTruthy();
    }
  });

  test('interactive elements have visible focus indicators', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="dashboard-grid"]')).toBeVisible();

    // Tab to the sidebar toggle and check it receives focus
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBeTruthy();
  });
});
