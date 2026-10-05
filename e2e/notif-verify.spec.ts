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

test.describe('Notifications Page Verify', () => {
  let token: string;
  test.beforeAll(async () => { token = await getToken(); });

  test('All labels are human-readable, no raw i18n keys', async ({ page }) => {
    await setup(page, token);
    await page.goto(`${APP}/settings/notifications`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    await page.screenshot({ path: 'e2e/screenshots/notif-fixed.png', fullPage: true });

    // Title
    const title = page.locator('[data-testid="preferences-title"]');
    const titleText = await title.textContent();
    console.log('Title:', titleText?.trim());
    expect(titleText?.trim()).toBe('Notification Preferences');

    // Column headers should be short human labels
    const headerCells = await page.locator('.notification-preferences__grid-cell--header').allTextContents();
    console.log('Column headers:', headerCells.map(h => h.trim()));
    expect(headerCells.map(h => h.trim())).toEqual(['In-App', 'Push', 'Email']);

    // Row labels should be friendly category names
    const rowLabels = await page.locator('.notification-preferences__grid-cell--label').allTextContents();
    console.log('Row labels:', rowLabels.map(l => l.trim()));
    // First is "Category" header, then 6 categories
    expect(rowLabels[0]?.trim()).toBe('Category');
    expect(rowLabels[1]?.trim()).toBe('Learning Activity');
    expect(rowLabels[2]?.trim()).toBe('Exams & Assessments');
    expect(rowLabels[3]?.trim()).toBe('Social & Community');
    expect(rowLabels[4]?.trim()).toBe('Account & Admin');
    expect(rowLabels[5]?.trim()).toBe('Billing & Payments');
    expect(rowLabels[6]?.trim()).toBe('Security Alerts');

    // Quiet hours section
    const quietTitle = await page.locator('.notification-preferences__section-title').textContent();
    console.log('Quiet hours title:', quietTitle?.trim());
    expect(quietTitle?.trim()).toBe('Quiet Hours');

    const quietDesc = await page.locator('.notification-preferences__section-desc').textContent();
    console.log('Quiet hours desc:', quietDesc?.trim());
    expect(quietDesc).toContain('Pause non-urgent');

    // Time labels
    const timeLabels = await page.locator('.notification-preferences__time-label').allTextContents();
    console.log('Time labels:', timeLabels.map(l => l.trim()));
    expect(timeLabels.map(l => l.trim())).toEqual(['From', 'Until']);

    // No raw i18n keys visible
    const rawKeys = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const keys: string[] = [];
      while (walker.nextNode()) {
        const t = (walker.currentNode.textContent ?? '').trim();
        if (/^admin\.communication\.[a-z]/.test(t)) keys.push(t);
      }
      return keys;
    });
    console.log('Remaining raw keys:', rawKeys.length === 0 ? 'NONE' : rawKeys);
    expect(rawKeys).toHaveLength(0);
  });

  test('Toggles are interactive', async ({ page }) => {
    await setup(page, token);
    await page.goto(`${APP}/settings/notifications`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Find engagement + in_app toggle
    const toggle = page.locator('[data-testid="toggle-engagement-in_app"]');
    await expect(toggle).toBeVisible();

    const initialState = await toggle.isChecked();
    console.log('Engagement in_app initial state:', initialState);

    // Click to toggle
    await toggle.click();
    await page.waitForTimeout(300);
    const newState = await toggle.isChecked();
    console.log('After click:', newState);
    expect(newState).toBe(!initialState);
  });
});
