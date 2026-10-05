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

test.describe('Nav & Profile Fixes', () => {
  let token: string;
  test.beforeAll(async () => { token = await getToken(); });

  test('Tenant switcher shows building icon, not truncated text', async ({ page }) => {
    await setup(page, token);
    await page.goto(`${APP}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const trigger = page.locator('[data-testid="tenant-switcher-trigger"]');
    await expect(trigger).toBeVisible();

    // Should contain a material icon "domain" (building)
    const iconEl = trigger.locator('.material-icons-outlined');
    await expect(iconEl).toBeVisible();
    const iconText = await iconEl.textContent();
    console.log('Tenant trigger icon:', iconText?.trim());
    expect(iconText?.trim()).toBe('domain');

    // Tooltip should show tenant name on hover
    const title = await trigger.getAttribute('title');
    console.log('Trigger title (tooltip):', title);
    expect(title).toContain('Acme Learning');

    await page.screenshot({ path: 'e2e/screenshots/nav-tenant-icon.png', fullPage: true });
  });

  test('Tenant switcher dropdown still works', async ({ page }) => {
    await setup(page, token);
    await page.goto(`${APP}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Click tenant trigger
    await page.locator('[data-testid="tenant-switcher-trigger"]').click();
    await page.waitForTimeout(500);

    // Panel should open with tenants
    const panel = page.locator('[data-testid="tenant-switcher-panel"]');
    await expect(panel).toBeVisible();
    const panelText = await panel.textContent();
    console.log('Tenant panel:', panelText?.trim());
    expect(panelText).toContain('Acme Learning');

    await page.screenshot({ path: 'e2e/screenshots/nav-tenant-dropdown.png', fullPage: true });
  });

  test('Profile avatar is clickable and navigates to settings', async ({ page }) => {
    await setup(page, token);
    await page.goto(`${APP}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const avatar = page.locator('[data-testid="user-avatar"]');
    await expect(avatar).toBeVisible();

    // Should be a link (not just a span)
    const tagName = await avatar.evaluate(el => el.tagName.toLowerCase());
    console.log('Avatar tag:', tagName);
    expect(tagName).toBe('a');

    // Should have href to /settings
    const href = await avatar.getAttribute('href');
    console.log('Avatar href:', href);
    expect(href).toBe('/settings');

    // Click it
    await avatar.click();
    await page.waitForTimeout(1500);

    // Should navigate to settings page
    console.log('URL after click:', page.url());
    expect(page.url()).toContain('/settings');

    await page.screenshot({ path: 'e2e/screenshots/nav-settings-page.png', fullPage: true });
  });

  test('Settings page shows profile info', async ({ page }) => {
    await setup(page, token);
    await page.goto(`${APP}/settings`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Page should load (not placeholder)
    const settingsPage = page.locator('[data-testid="settings-page"]');
    await expect(settingsPage).toBeVisible();

    // Profile section
    const name = page.locator('[data-testid="settings-name"]');
    await expect(name).toBeVisible();
    const nameText = await name.textContent();
    console.log('Display name:', nameText?.trim());
    expect(nameText?.trim()).toBe('Dale Leung');

    const email = page.locator('[data-testid="settings-email"]');
    const emailText = await email.textContent();
    console.log('Email:', emailText?.trim());
    expect(emailText?.trim()).toBe('daleleung76@gmail.com');

    // Org section
    const tenant = page.locator('[data-testid="settings-tenant"]');
    const tenantText = await tenant.textContent();
    console.log('Tenant:', tenantText?.trim());
    expect(tenantText?.trim()).toBe('Acme Learning');

    // Roles
    const roles = page.locator('[data-testid="settings-roles"]');
    const rolesText = await roles.textContent();
    console.log('Roles:', rolesText?.trim());

    // Quick links
    const links = page.locator('.settings__link');
    const linkCount = await links.count();
    console.log('Quick links:', linkCount);
    expect(linkCount).toBe(3);

    await page.screenshot({ path: 'e2e/screenshots/settings-page.png', fullPage: true });
  });
});
