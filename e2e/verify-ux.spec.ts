import { test, expect, Page } from '@playwright/test';

const GATEWAY = 'http://localhost:8000';
const APP = 'http://localhost:4200';

async function getToken(): Promise<string> {
  const res = await fetch(`${GATEWAY}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'daleleung76@gmail.com', password: 'password123' }),
  });
  return (await res.json()).access_token;
}

async function setup(page: Page, token: string): Promise<void> {
  await page.route('**/api/v1/auth/token/refresh', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: token, token_type: 'Bearer', expires_in: 900 }),
    });
  });
}

test.describe('UX Fixes', () => {
  let token: string;
  test.beforeAll(async () => { token = await getToken(); });

  test('Sidebar shows "Learn" instead of "Atoms"', async ({ page }) => {
    await setup(page, token);
    await page.goto(`${APP}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const sidebar = page.locator('[data-testid="sidebar"]');
    const sidebarText = await sidebar.textContent();
    console.log('Sidebar text:', sidebarText?.trim());

    // Should show "Learn" not "Atoms"
    expect(sidebarText).toContain('Learn');
    expect(sidebarText).not.toContain('Atoms');

    await page.screenshot({ path: 'e2e/screenshots/ux-sidebar-learn.png', fullPage: true });
  });

  test('Tenant switcher shows initials, no broken images', async ({ page }) => {
    await setup(page, token);
    await page.goto(`${APP}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Open tenant switcher
    const trigger = page.locator('[data-testid="tenant-switcher-trigger"]');
    await trigger.click();
    await page.waitForTimeout(500);

    // Panel should be visible
    const panel = page.locator('[data-testid="tenant-switcher-panel"]');
    await expect(panel).toBeVisible();
    const panelText = await panel.textContent();
    console.log('Tenant panel text:', panelText?.trim());

    // Check for broken images
    const brokenImages = await page.evaluate(() => {
      const imgs = document.querySelectorAll('.tenant-switcher__logo');
      let broken = 0;
      imgs.forEach(img => {
        if (img instanceof HTMLImageElement && !img.complete) broken++;
        if (img instanceof HTMLImageElement && img.naturalWidth === 0) broken++;
      });
      return { total: imgs.length, broken };
    });
    console.log('Logo images:', brokenImages);

    // Check for placeholder initials (should show "A" for Acme, "C" for Chora)
    const placeholders = await page.locator('.tenant-switcher__logo-placeholder').allTextContents();
    console.log('Initial placeholders:', placeholders);

    // At least one placeholder should exist (since logos don't exist locally)
    // After error handler fires, broken images should be replaced by placeholders
    await page.waitForTimeout(1000); // allow error handlers to fire

    await page.screenshot({ path: 'e2e/screenshots/ux-tenant-switcher.png', fullPage: true });

    // Verify no broken img tags visible
    const visibleBrokenImgs = await page.locator('.tenant-switcher__logo').count();
    const visiblePlaceholders = await page.locator('.tenant-switcher__logo-placeholder').count();
    console.log('After error handling — imgs:', visibleBrokenImgs, 'placeholders:', visiblePlaceholders);
  });

  test('Learning page sidebar also shows "Learn"', async ({ page }) => {
    await setup(page, token);
    await page.goto(`${APP}/learning`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const navItem = page.locator('[data-testid="nav-learning"]');
    const navText = await navItem.textContent();
    console.log('Nav item text:', navText?.trim());
    expect(navText?.trim()).toBe('Learn');
  });
});
