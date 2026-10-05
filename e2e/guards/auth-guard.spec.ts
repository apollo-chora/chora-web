import { test, expect } from '@playwright/test';
import { mockAuthSession, mockUnauthenticatedSession } from '../fixtures/auth-mocks';
import { mockDashboard, mockGoals, mockLeaderboard, mockAtomList } from '../fixtures/bff-mocks';
import { buildAtom } from '../fixtures/test-builders';

test.describe('Auth guard — unauthenticated redirects', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('unauthenticated user redirected from /dashboard to /login', async ({ page }) => {
    await mockUnauthenticatedSession(page);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated user redirected from /learning to /login', async ({ page }) => {
    await mockUnauthenticatedSession(page);
    await page.goto('/learning');
    await expect(page).toHaveURL(/\/login/);
  });

  test('redirect preserves returnUrl parameter', async ({ page }) => {
    await mockUnauthenticatedSession(page);
    await page.goto('/learning');
    await expect(page).toHaveURL(/\/login\?returnUrl=/);
  });

  test('unauthenticated user can access /login without redirect', async ({ page }) => {
    await mockUnauthenticatedSession(page);
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('[data-testid="login-page"]')).toBeVisible();
  });

  test('unauthenticated user can access /register without redirect', async ({ page }) => {
    await mockUnauthenticatedSession(page);
    await page.goto('/register');
    await expect(page).toHaveURL(/\/register/);
    await expect(page.locator('[data-testid="register-page"]')).toBeVisible();
  });
});

test.describe('Auth guard — authenticated access', () => {
  test('authenticated user can access /dashboard', async ({ page }) => {
    await mockAuthSession(page);
    await mockDashboard(page);
    await mockGoals(page);
    await mockLeaderboard(page);

    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
  });

  test('authenticated user can access /learning', async ({ page }) => {
    await mockAuthSession(page);
    await mockAtomList(page, [buildAtom()]);

    await page.goto('/learning');
    await expect(page.locator('[data-testid="atom-list-page"]')).toBeVisible();
  });
});

test.describe('Not Found route', () => {
  test('unknown route shows 404 page', async ({ page }) => {
    await mockAuthSession(page);
    await page.goto('/this-route-does-not-exist');

    await expect(page.locator('[data-testid="not-found-page"]')).toBeVisible();
  });

  test('404 page has home link', async ({ page }) => {
    await mockAuthSession(page);
    await page.goto('/this-route-does-not-exist');

    const homeLink = page.locator('[data-testid="not-found-home-link"]');
    await expect(homeLink).toBeVisible();
  });
});
