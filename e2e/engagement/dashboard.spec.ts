import { test, expect } from '@playwright/test';
import { DashboardPage } from '../pages/dashboard.page';
import { mockAuthSession } from '../fixtures/auth-mocks';
import { mockDashboard, mockLeaderboard, mockGoals } from '../fixtures/bff-mocks';
import { mock500 } from '../fixtures/bff-errors';
import { runAxeAudit } from '../fixtures/a11y.fixture';

test.describe('Dashboard — widgets', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page);
  });

  test('dashboard renders all widgets on success', async ({ page }) => {
    await mockDashboard(page);
    await mockGoals(page);
    await mockLeaderboard(page);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();

    // DailyDose widget visible with start button
    await dashboard.expectDoseAvailable();

    // Grid contains widget sections
    await expect(dashboard.grid).toBeVisible();
  });

  test('dashboard shows completed state when dose done', async ({ page }) => {
    await mockDashboard(page, { daily_dose_status: 'completed' });

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();
    await dashboard.expectDoseCompleted();
  });

  test('DailyDose start button navigates to /learning/daily-dose', async ({ page }) => {
    await mockDashboard(page);
    await mockGoals(page);
    await mockLeaderboard(page);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();
    await dashboard.clickDoseStart();

    await expect(page).toHaveURL(/\/learning\/daily-dose/);
  });
});

test.describe('Dashboard — error handling', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page);
  });

  test('shows error state with retry on server error', async ({ page }) => {
    let requestCount = 0;

    await page.route('**/api/v1/engagement/dashboard', async (route) => {
      requestCount++;
      if (requestCount <= 1) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Failure', details: {} } }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            streak: { current_days: 1, status: 'active', longest_streak: 1, last_activity_at: null },
            xp: { total_xp: 0, level: 1, xp_to_next_level: 100, combo_multiplier: 1 },
            level: 1,
            daily_dose_status: 'not_configured',
            active_goals_count: 0,
            path_progress: [],
          }),
        });
      }
    });

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectError();

    await dashboard.retry();
    await dashboard.expectLoaded();
  });
});

test.describe('Dashboard — accessibility', () => {
  test('dashboard passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page);
    await mockDashboard(page);
    await mockGoals(page);
    await mockLeaderboard(page);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();

    await runAxeAudit(page, 'Dashboard');
  });
});
