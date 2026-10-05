import { test, expect, Page, Response } from '@playwright/test';

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

function attachLogs(page: Page): { network: Array<{url:string,status:number,method:string,body?:unknown}>, errors: string[] } {
  const network: Array<{url:string,status:number,method:string,body?:unknown}> = [];
  const errors: string[] = [];
  page.on('response', async (r: Response) => {
    const u = r.url();
    if (u.includes('/api/')) {
      let body: unknown;
      try { body = await r.json(); } catch { body = '(not json)'; }
      network.push({ url: u.replace(APP,'').replace(GATEWAY,''), status: r.status(), method: r.request().method(), body });
    }
  });
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  return { network, errors };
}

test.describe('Notifications Page Diagnostic', () => {
  let token: string;
  test.beforeAll(async () => { token = await getToken(); });

  test('Full page audit', async ({ page }) => {
    const { network, errors } = attachLogs(page);
    await setup(page, token);

    await page.goto(`${APP}/settings/notifications`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'e2e/screenshots/notif-page.png', fullPage: true });

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

    // All visible elements
    const buttons = await page.locator('button:visible').allTextContents();
    console.log('\nButtons:', buttons.map(b => b.trim()).filter(Boolean));

    const toggles = await page.locator('input[type="checkbox"], input[type="radio"], [role="switch"], [role="checkbox"]').count();
    console.log('Toggles/checkboxes:', toggles);

    const selects = await page.locator('select:visible').count();
    console.log('Selects:', selects);

    // Console errors
    if (errors.length > 0) {
      console.log('\n=== CONSOLE ERRORS ===');
      errors.forEach(e => console.log('  ', e.slice(0, 300)));
    }

    // API calls
    console.log('\n=== API CALLS ===');
    for (const c of network) {
      const preview = typeof c.body === 'object' ? JSON.stringify(c.body).slice(0, 200) : '';
      console.log(`  ${c.method} ${c.url} → ${c.status} ${preview}`);
    }
  });
});
