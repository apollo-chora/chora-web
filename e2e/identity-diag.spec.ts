import { test, Page, Response } from '@playwright/test';

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

test.describe('Identity Page Diagnostic', () => {
  let token: string;
  test.beforeAll(async () => { token = await getToken(); });

  test('Full page audit', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

    await setup(page, token);
    await page.goto(`${APP}/settings/identity`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'e2e/screenshots/identity-page.png', fullPage: true });

    const text = await page.evaluate(() => document.body?.innerText ?? '');
    console.log('=== FULL PAGE TEXT ===');
    console.log(text);

    // Find raw i18n keys
    const rawKeys = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const keys: string[] = [];
      while (walker.nextNode()) {
        const t = (walker.currentNode.textContent ?? '').trim();
        if (/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z]/.test(t)) keys.push(t);
      }
      return [...new Set(keys)];
    });
    if (rawKeys.length > 0) {
      console.log('\n=== RAW i18n KEYS ===');
      rawKeys.forEach(k => console.log('  -', k));
    }

    // Check all links
    const links = await page.locator('a[routerLink], a[href^="/"]').all();
    console.log('\n=== LINKS ===');
    for (const link of links) {
      const vis = await link.isVisible().catch(() => false);
      if (vis) {
        const t = (await link.textContent())?.trim();
        const h = await link.getAttribute('href');
        console.log(`  "${t}" → ${h}`);
      }
    }

    if (errors.length > 0) {
      console.log('\n=== CONSOLE ERRORS ===');
      errors.forEach(e => console.log('  ', e.slice(0, 200)));
    }
  });

  // Also check sub-pages
  test('Check all identity sub-routes', async ({ page }) => {
    await setup(page, token);

    const routes = [
      '/settings/identity',
      '/settings/identity/tenants',
      '/settings/identity/data',
      '/settings/identity/merge',
    ];

    for (const route of routes) {
      console.log(`\n--- ${route} ---`);
      await page.goto(`${APP}${route}`, { waitUntil: 'networkidle', timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1000);
      const url = page.url();
      const text = (await page.evaluate(() => document.body?.innerText ?? '')).slice(0, 400);
      console.log(`URL: ${url}`);
      console.log(`Text: ${text}`);

      const rawKeys = await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const keys: string[] = [];
        while (walker.nextNode()) {
          const t = (walker.currentNode.textContent ?? '').trim();
          if (/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z]/.test(t)) keys.push(t);
        }
        return [...new Set(keys)];
      });
      if (rawKeys.length > 0) {
        console.log('Raw keys:', rawKeys);
      }
      await page.screenshot({ path: `e2e/screenshots/identity${route.replace(/\//g, '-')}.png`, fullPage: true });
    }
  });
});
