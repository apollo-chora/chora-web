import { test, expect, Page, Response } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GATEWAY = 'http://localhost:8000';
const APP = 'http://localhost:4200';

interface NetworkLog {
  url: string;
  status: number;
  method: string;
  body?: unknown;
}

async function loginAndGetToken(): Promise<{ token: string; gcid: string }> {
  const res = await fetch(`${GATEWAY}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'daleleung76@gmail.com', password: 'password123' }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Login failed: ${JSON.stringify(data)}`);
  return { token: data.access_token, gcid: data.gcid };
}

/** Inject auth into the Angular app by intercepting the silentRefresh call */
async function injectAuth(page: Page, token: string): Promise<void> {
  await page.route('**/api/v1/auth/token/refresh', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: token, token_type: 'Bearer', expires_in: 900 }),
    });
  });
}

/** Collect all API network requests/responses */
function attachNetworkLogger(page: Page): NetworkLog[] {
  const logs: NetworkLog[] = [];
  page.on('response', async (response: Response) => {
    const url = response.url();
    if (url.includes('/api/') || url.includes('/assets/i18n/')) {
      let body: unknown;
      try { body = await response.json(); } catch { body = '(not json)'; }
      logs.push({
        url: url.replace(APP, '').replace(GATEWAY, ''),
        status: response.status(),
        method: response.request().method(),
        body,
      });
    }
  });
  return logs;
}

/** Collect console errors */
function attachConsoleLogger(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

/** Get all visible text content from the page */
async function getPageText(page: Page): Promise<string> {
  return page.evaluate(() => document.body?.innerText ?? '');
}

/** Find elements showing raw i18n keys (e.g., "engagement.dashboard.title") */
async function findRawI18nKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const keys: string[] = [];
    while (walker.nextNode()) {
      const text = (walker.currentNode.textContent ?? '').trim();
      // Match patterns like "xxx.yyy.zzz" (2+ dots, no spaces in segment)
      if (/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*/.test(text)) {
        keys.push(text);
      }
    }
    return [...new Set(keys)];
  });
}

/** Take a labeled screenshot */
async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Deep Click-Through Diagnostic', () => {
  let token: string;

  test.beforeAll(async () => {
    const auth = await loginAndGetToken();
    token = auth.token;
    console.log('✓ Got auth token, gcid:', auth.gcid);
  });

  test('1. Dashboard — full page audit', async ({ page }) => {
    const network = attachNetworkLogger(page);
    const consoleErrors = attachConsoleLogger(page);
    await injectAuth(page, token);

    // Navigate to dashboard
    await page.goto(`${APP}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000); // let Angular render

    await screenshot(page, '01-dashboard-initial');

    // Capture ALL visible text
    const pageText = await getPageText(page);
    console.log('\n=== DASHBOARD VISIBLE TEXT ===');
    console.log(pageText);

    // Find raw i18n keys
    const rawKeys = await findRawI18nKeys(page);
    if (rawKeys.length > 0) {
      console.log('\n=== RAW i18n KEYS (untranslated) ===');
      rawKeys.forEach(k => console.log('  -', k));
    }

    // Check for error states
    const errorElements = await page.locator('[class*="error"], [class*="Error"], .alert-danger, .error-message, mat-error').all();
    console.log('\n=== ERROR ELEMENTS ===');
    for (const el of errorElements) {
      const text = await el.textContent();
      const classes = await el.getAttribute('class');
      console.log(`  [${classes}] "${text?.trim()}"`);
    }

    // Find all clickable items in the dashboard
    const buttons = await page.locator('button, a[routerLink], [role="button"], [data-testid]').all();
    console.log('\n=== CLICKABLE ELEMENTS ===');
    for (const btn of buttons) {
      const text = (await btn.textContent())?.trim();
      const testid = await btn.getAttribute('data-testid');
      const href = await btn.getAttribute('href');
      const routerLink = await btn.getAttribute('routerLink');
      const visible = await btn.isVisible().catch(() => false);
      if (visible) {
        console.log(`  [${testid ?? ''}] "${text}" href=${href ?? routerLink ?? '-'}`);
      }
    }

    // Check specific dashboard widgets
    console.log('\n=== WIDGET INSPECTION ===');

    // Streak widget
    const streakEl = await page.locator('[data-testid*="streak"], [class*="streak"]').first();
    if (await streakEl.isVisible().catch(() => false)) {
      console.log('  Streak:', await streakEl.textContent());
    } else {
      console.log('  Streak widget: NOT VISIBLE');
    }

    // XP widget
    const xpEl = await page.locator('[data-testid*="xp"], [class*="xp"]').first();
    if (await xpEl.isVisible().catch(() => false)) {
      console.log('  XP:', await xpEl.textContent());
    } else {
      console.log('  XP widget: NOT VISIBLE');
    }

    // Level widget
    const levelEl = await page.locator('[data-testid*="level"], [class*="level"]').first();
    if (await levelEl.isVisible().catch(() => false)) {
      console.log('  Level:', await levelEl.textContent());
    } else {
      console.log('  Level widget: NOT VISIBLE');
    }

    // Log API responses
    console.log('\n=== API RESPONSES ===');
    for (const log of network) {
      const bodyPreview = typeof log.body === 'object' ? JSON.stringify(log.body).slice(0, 200) : String(log.body);
      console.log(`  ${log.method} ${log.url} → ${log.status} ${bodyPreview}`);
    }

    // Console errors
    if (consoleErrors.length > 0) {
      console.log('\n=== CONSOLE ERRORS ===');
      consoleErrors.forEach(e => console.log('  ', e));
    }

    // Check if "Could not load" messages appear
    const errorMessages = await page.locator('text=/Could not load|error|failed/i').all();
    console.log('\n=== ERROR MESSAGES ON PAGE ===');
    for (const el of errorMessages) {
      const vis = await el.isVisible().catch(() => false);
      if (vis) {
        console.log('  ', (await el.textContent())?.trim());
      }
    }
  });

  test('2. Dashboard — click every tab/section', async ({ page }) => {
    const network = attachNetworkLogger(page);
    await injectAuth(page, token);
    await page.goto(`${APP}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Find tabs (leaderboard period switching, etc.)
    const tabs = await page.locator('[role="tab"], .tab, [class*="tab"], button[class*="period"]').all();
    console.log(`\n=== Found ${tabs.length} tabs ===`);
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      const text = (await tab.textContent())?.trim();
      const visible = await tab.isVisible().catch(() => false);
      if (visible) {
        console.log(`  Clicking tab ${i}: "${text}"`);
        await tab.click().catch(e => console.log(`    Click failed: ${e.message}`));
        await page.waitForTimeout(500);
      }
    }

    // Try clicking into sub-pages from dashboard links
    const links = await page.locator('a[routerLink], a[href^="/"]').all();
    console.log(`\n=== Internal links (${links.length}) ===`);
    for (const link of links) {
      const href = await link.getAttribute('href');
      const routerLink = await link.getAttribute('routerLink');
      const text = (await link.textContent())?.trim();
      const visible = await link.isVisible().catch(() => false);
      if (visible) {
        console.log(`  "${text}" → ${href ?? routerLink}`);
      }
    }

    // Log final API calls
    console.log('\n=== API calls during tab interactions ===');
    for (const log of network) {
      if (log.url.includes('/api/')) {
        console.log(`  ${log.method} ${log.url} → ${log.status}`);
      }
    }
  });

  test('3. Learning/Atoms page — full audit', async ({ page }) => {
    const network = attachNetworkLogger(page);
    const consoleErrors = attachConsoleLogger(page);
    await injectAuth(page, token);

    // Navigate to learning page
    await page.goto(`${APP}/learning`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await screenshot(page, '03-learning-initial');

    const pageText = await getPageText(page);
    console.log('\n=== LEARNING PAGE TEXT ===');
    console.log(pageText);

    const rawKeys = await findRawI18nKeys(page);
    if (rawKeys.length > 0) {
      console.log('\n=== RAW i18n KEYS ===');
      rawKeys.forEach(k => console.log('  -', k));
    }

    // Check for atom cards
    const atomCards = await page.locator('[data-testid*="atom"], [class*="atom-card"], [class*="atom-list"] li, [class*="atom-item"]').all();
    console.log(`\n=== Atom cards found: ${atomCards.length} ===`);
    for (let i = 0; i < Math.min(atomCards.length, 5); i++) {
      console.log(`  Card ${i}: "${(await atomCards[i].textContent())?.trim().slice(0, 100)}"`);
    }

    // Check for topic tree
    const topicNodes = await page.locator('[data-testid*="topic"], [class*="topic"], tree-node, .tree-item').all();
    console.log(`\n=== Topic nodes found: ${topicNodes.length} ===`);
    for (const node of topicNodes) {
      const vis = await node.isVisible().catch(() => false);
      if (vis) console.log(`  Topic: "${(await node.textContent())?.trim().slice(0, 80)}"`);
    }

    // API responses
    console.log('\n=== API RESPONSES ===');
    for (const log of network) {
      const bodyPreview = typeof log.body === 'object' ? JSON.stringify(log.body).slice(0, 300) : String(log.body);
      console.log(`  ${log.method} ${log.url} → ${log.status} ${bodyPreview}`);
    }

    if (consoleErrors.length > 0) {
      console.log('\n=== CONSOLE ERRORS ===');
      consoleErrors.forEach(e => console.log('  ', e));
    }
  });

  test('4. Learning page — click into atom detail', async ({ page }) => {
    const network = attachNetworkLogger(page);
    await injectAuth(page, token);

    await page.goto(`${APP}/learning`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Try clicking the first atom/item
    const clickable = await page.locator('[data-testid*="atom"] a, [class*="atom"] a, .atom-card, .atom-item, [routerLink*="atom"]').first();
    if (await clickable.isVisible().catch(() => false)) {
      console.log('Found clickable atom element, clicking...');
      await clickable.click();
      await page.waitForTimeout(2000);
      await screenshot(page, '04-atom-detail');
      console.log('After click URL:', page.url());
      console.log('Page text:', (await getPageText(page)).slice(0, 500));
    } else {
      console.log('No clickable atom element found on learning page');

      // Try navigating directly to a known atom
      console.log('\nNavigating directly to atom f0000000-0000-4000-a000-000000000001...');
      await page.goto(`${APP}/learning/atoms/f0000000-0000-4000-a000-000000000001`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      await screenshot(page, '04-atom-detail-direct');
      console.log('URL:', page.url());
      console.log('Page text:', (await getPageText(page)).slice(0, 500));
    }

    console.log('\n=== API during atom detail ===');
    for (const log of network) {
      if (log.url.includes('/api/')) {
        const bodyPreview = typeof log.body === 'object' ? JSON.stringify(log.body).slice(0, 300) : String(log.body);
        console.log(`  ${log.method} ${log.url} → ${log.status} ${bodyPreview}`);
      }
    }
  });

  test('5. Navigation — click every sidebar/nav item', async ({ page }) => {
    const network = attachNetworkLogger(page);
    await injectAuth(page, token);
    await page.goto(`${APP}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Find all nav items
    const navItems = await page.locator('nav a, [class*="nav"] a, [class*="sidebar"] a, [class*="menu"] a, mat-list-item a, [role="navigation"] a').all();
    console.log(`\n=== NAV ITEMS (${navItems.length}) ===`);
    const navTargets: { text: string; href: string }[] = [];
    for (const item of navItems) {
      const text = (await item.textContent())?.trim() ?? '';
      const href = (await item.getAttribute('href')) ?? (await item.getAttribute('routerLink')) ?? '';
      const visible = await item.isVisible().catch(() => false);
      if (visible && text && !navTargets.some(n => n.href === href)) {
        navTargets.push({ text, href });
        console.log(`  "${text}" → ${href}`);
      }
    }

    // Click each nav item and report what loads
    for (const nav of navTargets) {
      if (nav.href === '#' || nav.href === '') continue;
      console.log(`\n--- Navigating to: "${nav.text}" (${nav.href}) ---`);
      try {
        await page.goto(`${APP}${nav.href}`, { waitUntil: 'networkidle', timeout: 5000 });
        await page.waitForTimeout(1500);
        const url = page.url();
        const text = (await getPageText(page)).slice(0, 300);
        const rawKeys = await findRawI18nKeys(page);
        console.log(`  URL: ${url}`);
        console.log(`  Content: ${text.slice(0, 200)}`);
        if (rawKeys.length > 0) {
          console.log(`  Raw i18n keys: ${rawKeys.join(', ')}`);
        }
        // Check for error states
        const hasError = text.toLowerCase().includes('could not load') || text.toLowerCase().includes('error') || text.toLowerCase().includes('failed');
        if (hasError) {
          console.log('  ⚠ ERROR STATE DETECTED');
        }
        await screenshot(page, `05-nav-${nav.text.replace(/[^a-z0-9]/gi, '_').slice(0, 20)}`);
      } catch (e) {
        console.log(`  Navigation failed: ${(e as Error).message}`);
      }
    }
  });

  test('6. Check all i18n translation coverage', async ({ page }) => {
    await injectAuth(page, token);

    const pages = [
      '/dashboard',
      '/learning',
      '/learning/discovery',
      '/social',
      '/settings',
      '/settings/profile',
    ];

    const allRawKeys: Record<string, string[]> = {};

    for (const p of pages) {
      try {
        await page.goto(`${APP}${p}`, { waitUntil: 'networkidle', timeout: 5000 });
        await page.waitForTimeout(1500);
        const rawKeys = await findRawI18nKeys(page);
        if (rawKeys.length > 0) {
          allRawKeys[p] = rawKeys;
        }
      } catch {
        console.log(`  ${p}: navigation timeout/error`);
      }
    }

    console.log('\n=== UNTRANSLATED i18n KEYS BY PAGE ===');
    for (const [p, keys] of Object.entries(allRawKeys)) {
      console.log(`\n${p}:`);
      keys.forEach(k => console.log(`  - ${k}`));
    }

    const totalRaw = Object.values(allRawKeys).flat().length;
    console.log(`\nTotal untranslated keys: ${totalRaw}`);
  });

  test('7. Dashboard data shape — verify API responses match UI expectations', async ({ page }) => {
    const network = attachNetworkLogger(page);
    await injectAuth(page, token);
    await page.goto(`${APP}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('\n=== DETAILED API RESPONSE SHAPES ===');
    for (const log of network) {
      if (log.url.includes('/api/') && log.method === 'GET') {
        console.log(`\n${log.url} (${log.status}):`);
        console.log(JSON.stringify(log.body, null, 2));
      }
    }

    // Check what the Angular service state looks like
    const serviceState = await page.evaluate(() => {
      // Access Angular's dependency injection if possible
      const ng = (window as any).ng;
      if (!ng) return 'Angular DevTools not available';
      return 'Angular detected but DI inspection requires special setup';
    });
    console.log('\nAngular state:', serviceState);
  });
});
