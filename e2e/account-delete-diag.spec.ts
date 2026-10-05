import { test, Page } from '@playwright/test';

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

test.describe('Account Delete Page Diagnostic', () => {
  let token: string;
  test.beforeAll(async () => { token = await getToken(); });

  test('Full page audit', async ({ page }) => {
    await setup(page, token);
    await page.goto(`${APP}/settings/account/delete`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'e2e/screenshots/account-delete.png', fullPage: true });

    const text = await page.evaluate(() => document.body?.innerText ?? '');
    console.log('=== FULL PAGE TEXT ===');
    console.log(text);

    const rawKeys = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const keys: string[] = [];
      while (walker.nextNode()) {
        const t = (walker.currentNode.textContent ?? '').trim();
        if (/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*/.test(t) && t.includes('.')) keys.push(t);
      }
      return [...new Set(keys)];
    });
    if (rawKeys.length > 0) {
      console.log('\n=== RAW i18n KEYS ===');
      rawKeys.forEach(k => console.log('  -', k));
    } else {
      console.log('\nNo raw i18n keys found.');
    }
  });
});
