import { test, expect } from '@playwright/test';

/**
 * Diagnostic test — investigates two user-reported issues:
 *   1. Empty content after login (no data visible)
 *   2. Button labels showing translation keys instead of text
 *
 * This test captures screenshots, logs network errors, checks i18n loading,
 * and inspects the DOM at each step.
 */

const GATEWAY_URL = 'http://localhost:8000';
const SCREENSHOT_DIR = 'e2e/screenshots';
const TEST_EMAIL = 'daleleung76@gmail.com';
const TEST_PASSWORDS = ['password123', 'SecurePass123!', 'Password123!', 'Chora123!'];

// Collect network errors
interface NetworkLog {
  url: string;
  method: string;
  status: number;
  statusText: string;
  body?: string;
}

test.describe('Diagnostic — Empty Content & Translation Keys', () => {
  test.describe.configure({ mode: 'serial' });

  const networkErrors: NetworkLog[] = [];
  const allRequests: NetworkLog[] = [];
  let accessToken: string | undefined;

  // ---------------------------------------------------------------------------
  // Step 1: Login Page Inspection
  // ---------------------------------------------------------------------------
  test('STEP 1 — Inspect login page for translation issues', async ({ page }) => {
    // Capture console messages
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Track network errors
    page.on('response', async (response) => {
      const entry: NetworkLog = {
        url: response.url(),
        method: response.request().method(),
        status: response.status(),
        statusText: response.statusText(),
      };
      allRequests.push(entry);
      if (response.status() >= 400) {
        try {
          entry.body = await response.text();
        } catch {
          entry.body = '<could not read body>';
        }
        networkErrors.push(entry);
      }
    });

    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Screenshot the login page
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-login-page.png`, fullPage: true });

    // --- Collect all visible text ---
    const bodyText = await page.locator('body').innerText();
    console.log('\n========== LOGIN PAGE — VISIBLE TEXT ==========');
    console.log(bodyText);
    console.log('================================================\n');

    // --- Check for translation key patterns (dot-notation like "identity.login.heading") ---
    const translationKeyPattern = /[a-z_]+\.[a-z_]+\.[a-z_]+/g;
    const possibleKeys = bodyText.match(translationKeyPattern) || [];
    if (possibleKeys.length > 0) {
      console.log('WARNING: Possible untranslated keys found on login page:');
      for (const key of possibleKeys) {
        console.log(`  - "${key}"`);
      }
    } else {
      console.log('OK: No obvious translation keys found on login page');
    }

    // --- Check all button elements ---
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    console.log(`\nButtons found: ${buttonCount}`);
    for (let i = 0; i < buttonCount; i++) {
      const btn = buttons.nth(i);
      const text = await btn.innerText();
      const ariaLabel = await btn.getAttribute('aria-label');
      const testId = await btn.getAttribute('data-testid');
      console.log(`  Button[${i}]: text="${text}" | aria-label="${ariaLabel}" | data-testid="${testId}"`);

      // Flag if text looks like a translation key
      if (text.includes('.') && text.split('.').length >= 3) {
        console.log(`    *** TRANSLATION KEY DETECTED: "${text}"`);
      }
    }

    // --- Check all labels ---
    const labels = page.locator('label');
    const labelCount = await labels.count();
    console.log(`\nLabels found: ${labelCount}`);
    for (let i = 0; i < labelCount; i++) {
      const label = labels.nth(i);
      const text = await label.innerText();
      console.log(`  Label[${i}]: text="${text}"`);
      if (text.includes('.') && text.split('.').length >= 3) {
        console.log(`    *** TRANSLATION KEY DETECTED: "${text}"`);
      }
    }

    // --- Check all links ---
    const links = page.locator('a');
    const linkCount = await links.count();
    console.log(`\nLinks found: ${linkCount}`);
    for (let i = 0; i < linkCount; i++) {
      const link = links.nth(i);
      const text = await link.innerText();
      const href = await link.getAttribute('href');
      console.log(`  Link[${i}]: text="${text}" | href="${href}"`);
      if (text.includes('.') && text.split('.').length >= 3) {
        console.log(`    *** TRANSLATION KEY DETECTED: "${text}"`);
      }
    }

    // --- Check all elements with data-testid ---
    const testIdElements = page.locator('[data-testid]');
    const testIdCount = await testIdElements.count();
    console.log(`\nElements with data-testid: ${testIdCount}`);
    for (let i = 0; i < testIdCount; i++) {
      const el = testIdElements.nth(i);
      const testId = await el.getAttribute('data-testid');
      const tag = await el.evaluate((e) => e.tagName.toLowerCase());
      console.log(`  [data-testid="${testId}"] <${tag}>`);
    }

    // --- Check for i18n file loading ---
    const i18nRequests = allRequests.filter((r) => r.url.includes('/i18n/'));
    console.log(`\ni18n requests made: ${i18nRequests.length}`);
    for (const req of i18nRequests) {
      console.log(`  ${req.method} ${req.url} → ${req.status}`);
    }

    // --- Log network errors ---
    if (networkErrors.length > 0) {
      console.log(`\nNetwork errors (4xx/5xx): ${networkErrors.length}`);
      for (const err of networkErrors) {
        console.log(`  ${err.method} ${err.url} → ${err.status} ${err.statusText}`);
        if (err.body) {
          console.log(`    Body: ${err.body.substring(0, 200)}`);
        }
      }
    } else {
      console.log('\nNo network errors on login page');
    }

    // --- Console errors ---
    const consoleErrors = consoleLogs.filter((l) => l.startsWith('[error]'));
    if (consoleErrors.length > 0) {
      console.log(`\nConsole errors: ${consoleErrors.length}`);
      for (const e of consoleErrors) {
        console.log(`  ${e}`);
      }
    }

    console.log('\n--- Login page inspection complete ---\n');
  });

  // ---------------------------------------------------------------------------
  // Step 2: Attempt Login via API
  // ---------------------------------------------------------------------------
  test('STEP 2 — Login via API', async () => {
    console.log('\n========== ATTEMPTING API LOGIN ==========');

    // Try existing user login with different passwords
    for (const password of TEST_PASSWORDS) {
      try {
        const res = await fetch(`${GATEWAY_URL}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: TEST_EMAIL, password }),
        });
        console.log(`Login attempt (${password}): ${res.status}`);
        if (res.ok) {
          const data = (await res.json()) as { access_token: string; gcid: string };
          accessToken = data.access_token;
          console.log(`SUCCESS — Logged in as GCID: ${data.gcid}`);
          console.log(`Token (first 50 chars): ${accessToken.substring(0, 50)}...`);
          break;
        } else {
          const body = await res.text();
          console.log(`  Response: ${body.substring(0, 200)}`);
        }
      } catch (err) {
        console.log(`  Network error: ${err}`);
      }
    }

    // If no password worked, register a fresh user and login
    if (!accessToken) {
      console.log('\nAll password attempts failed. Registering a fresh diagnostic user...');
      const freshEmail = `diagnostic-${Date.now()}@test.chora.io`;
      const freshPassword = 'DiagSecure123!';

      try {
        const regRes = await fetch(`${GATEWAY_URL}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: freshEmail,
            password: freshPassword,
            display_name: 'Diagnostic User',
          }),
        });
        console.log(`Registration: ${regRes.status}`);
        if (regRes.ok) {
          const regData = (await regRes.json()) as { access_token: string; gcid: string };
          // Some systems return token on registration too
          if (regData.access_token) {
            accessToken = regData.access_token;
            console.log(`Got token from registration. GCID: ${regData.gcid}`);
          }
        } else {
          console.log(`  Registration response: ${await regRes.text()}`);
        }

        // Try login with fresh credentials
        if (!accessToken) {
          const loginRes = await fetch(`${GATEWAY_URL}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: freshEmail, password: freshPassword }),
          });
          console.log(`Fresh login: ${loginRes.status}`);
          if (loginRes.ok) {
            const loginData = (await loginRes.json()) as { access_token: string; gcid: string };
            accessToken = loginData.access_token;
            console.log(`SUCCESS (fresh user) — GCID: ${loginData.gcid}`);
          } else {
            console.log(`  Response: ${await loginRes.text()}`);
          }
        }
      } catch (err) {
        console.log(`  Error: ${err}`);
      }
    }

    if (!accessToken) {
      console.log('\nWARNING: Could not obtain access token. Will proceed with mock auth.');
    }

    console.log('==========================================\n');
  });

  // ---------------------------------------------------------------------------
  // Step 3: Dashboard Inspection (with auth)
  // ---------------------------------------------------------------------------
  test('STEP 3 — Inspect dashboard after auth', async ({ page }) => {
    const networkErrors: NetworkLog[] = [];
    const allReqs: NetworkLog[] = [];
    const consoleLogs: string[] = [];

    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    page.on('response', async (response) => {
      const entry: NetworkLog = {
        url: response.url(),
        method: response.request().method(),
        status: response.status(),
        statusText: response.statusText(),
      };
      allReqs.push(entry);
      if (response.status() >= 400) {
        try {
          entry.body = await response.text();
        } catch {
          entry.body = '<could not read body>';
        }
        networkErrors.push(entry);
      }
    });

    // Determine what token to use
    const token = accessToken || 'mock-diagnostic-token';
    const usingMock = !accessToken;

    if (usingMock) {
      console.log('Using MOCK auth (no real token obtained)');
    } else {
      console.log('Using REAL auth token');
    }

    // Intercept silent refresh to inject auth
    await page.route('**/api/v1/auth/token/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: token }),
      });
    });

    // If no real token, mock the data endpoints too
    if (usingMock) {
      await page.route('**/api/v1/tenants', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ items: [] }),
          });
        } else {
          await route.fallback();
        }
      });

      await page.route('**/api/v1/tenants/current/entitlements', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled_add_ons: [] }),
        });
      });
    }

    // Navigate to dashboard
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Wait a bit for any lazy-loaded content
    await page.waitForTimeout(2000);

    // Screenshot dashboard
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-dashboard.png`, fullPage: true });

    const currentUrl = page.url();
    console.log(`\n========== DASHBOARD INSPECTION ==========`);
    console.log(`Current URL: ${currentUrl}`);

    // Check if we were redirected to login
    if (currentUrl.includes('/login')) {
      console.log('FINDING: Redirected to /login — auth injection may have failed');
      await page.screenshot({ path: `${SCREENSHOT_DIR}/02-dashboard-redirected-to-login.png`, fullPage: true });
    }

    // --- Collect all visible text ---
    const bodyText = await page.locator('body').innerText();
    console.log('\n--- VISIBLE TEXT ---');
    console.log(bodyText);
    console.log('--- END VISIBLE TEXT ---\n');

    // --- Check for empty content indicators ---
    const mainContent = page.locator('main, [role="main"], .main-content, .dashboard');
    const mainCount = await mainContent.count();
    console.log(`Main content containers found: ${mainCount}`);
    for (let i = 0; i < mainCount; i++) {
      const text = await mainContent.nth(i).innerText();
      console.log(`  main[${i}] text length: ${text.trim().length} chars`);
      if (text.trim().length < 10) {
        console.log('    *** POSSIBLY EMPTY CONTENT');
      }
    }

    // --- Check for translation key patterns ---
    const translationKeyPattern = /[a-z_]+\.[a-z_]+\.[a-z_]+/g;
    const possibleKeys = bodyText.match(translationKeyPattern) || [];
    if (possibleKeys.length > 0) {
      console.log('\nWARNING: Possible untranslated keys on dashboard:');
      for (const key of [...new Set(possibleKeys)]) {
        console.log(`  - "${key}"`);
      }
    } else {
      console.log('\nOK: No obvious translation keys on dashboard');
    }

    // --- Check all button elements ---
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    console.log(`\nButtons on dashboard: ${buttonCount}`);
    for (let i = 0; i < buttonCount; i++) {
      const btn = buttons.nth(i);
      const text = (await btn.innerText()).trim();
      const ariaLabel = await btn.getAttribute('aria-label');
      const testId = await btn.getAttribute('data-testid');
      console.log(`  Button[${i}]: text="${text}" | aria-label="${ariaLabel}" | data-testid="${testId}"`);
      if (text.includes('.') && text.split('.').length >= 3) {
        console.log(`    *** TRANSLATION KEY DETECTED: "${text}"`);
      }
    }

    // --- Check elements with data-testid ---
    const testIdElements = page.locator('[data-testid]');
    const testIdCount = await testIdElements.count();
    console.log(`\nElements with data-testid: ${testIdCount}`);
    for (let i = 0; i < Math.min(testIdCount, 30); i++) {
      const el = testIdElements.nth(i);
      const testId = await el.getAttribute('data-testid');
      const tag = await el.evaluate((e) => e.tagName.toLowerCase());
      const visible = await el.isVisible();
      const text = await el.innerText().catch(() => '<no text>');
      console.log(`  [data-testid="${testId}"] <${tag}> visible=${visible} text="${text.substring(0, 60)}"`);
    }

    // --- Check all headings ---
    const headings = page.locator('h1, h2, h3, h4, h5, h6');
    const headingCount = await headings.count();
    console.log(`\nHeadings: ${headingCount}`);
    for (let i = 0; i < headingCount; i++) {
      const h = headings.nth(i);
      const tag = await h.evaluate((e) => e.tagName);
      const text = await h.innerText();
      console.log(`  ${tag}: "${text}"`);
    }

    // --- Check i18n requests ---
    const i18nRequests = allReqs.filter((r) => r.url.includes('/i18n/'));
    console.log(`\ni18n requests: ${i18nRequests.length}`);
    for (const req of i18nRequests) {
      console.log(`  ${req.method} ${req.url} → ${req.status}`);
    }

    // --- Network errors ---
    if (networkErrors.length > 0) {
      console.log(`\nNetwork errors on dashboard: ${networkErrors.length}`);
      for (const err of networkErrors) {
        console.log(`  ${err.method} ${err.url} → ${err.status} ${err.statusText}`);
        if (err.body) {
          console.log(`    Body: ${err.body.substring(0, 200)}`);
        }
      }
    } else {
      console.log('\nNo network errors on dashboard');
    }

    // --- Console errors ---
    const consoleErrors = consoleLogs.filter((l) => l.startsWith('[error]'));
    if (consoleErrors.length > 0) {
      console.log(`\nConsole errors: ${consoleErrors.length}`);
      for (const e of consoleErrors) {
        console.log(`  ${e}`);
      }
    }

    // --- Check all network requests (for data endpoints) ---
    const apiRequests = allReqs.filter((r) => r.url.includes('/api/'));
    console.log(`\nAPI requests made: ${apiRequests.length}`);
    for (const req of apiRequests) {
      console.log(`  ${req.method} ${req.url} → ${req.status}`);
    }

    console.log('\n==========================================\n');
  });

  // ---------------------------------------------------------------------------
  // Step 4: Check i18n file directly
  // ---------------------------------------------------------------------------
  test('STEP 4 — Verify i18n translation file loading', async ({ page }) => {
    console.log('\n========== I18N FILE CHECK ==========');

    // Fetch the i18n file directly via the page
    const i18nResponse = await page.goto('/assets/i18n/en.json');
    if (i18nResponse) {
      console.log(`i18n en.json status: ${i18nResponse.status()}`);
      if (i18nResponse.ok()) {
        const content = await i18nResponse.text();
        console.log(`i18n en.json size: ${content.length} chars`);
        try {
          const parsed = JSON.parse(content);
          const topKeys = Object.keys(parsed);
          console.log(`Top-level keys: ${topKeys.join(', ')}`);

          // Check for key sections used by login/dashboard
          const checkSections = [
            'identity.login.heading',
            'identity.register.heading',
            'engagement.dashboard.loading',
            'nav.dashboard',
            'common.loading',
            'layout.public_login',
          ];
          for (const keyPath of checkSections) {
            const parts = keyPath.split('.');
            let current: Record<string, unknown> = parsed;
            let found = true;
            for (const part of parts) {
              if (current && typeof current === 'object' && part in current) {
                current = current[part] as Record<string, unknown>;
              } else {
                found = false;
                break;
              }
            }
            console.log(`  ${found ? 'OK' : 'MISSING'}: "${keyPath}" = ${found ? JSON.stringify(current) : 'NOT FOUND'}`);
          }
        } catch (e) {
          console.log(`ERROR: Could not parse en.json: ${e}`);
        }
      } else {
        console.log('ERROR: i18n file returned non-200 status');
      }
    }

    // Check other locale files
    for (const locale of ['zh-CN', 'ms-MY', 'ta-IN', 'ar-SA']) {
      const res = await page.goto(`/assets/i18n/${locale}.json`);
      if (res) {
        console.log(`  ${locale}.json: ${res.status()} (${res.ok() ? (await res.text()).length + ' chars' : 'FAILED'})`);
      }
    }

    console.log('=====================================\n');
  });

  // ---------------------------------------------------------------------------
  // Step 5: Navigate to learning/atom pages
  // ---------------------------------------------------------------------------
  test('STEP 5 — Inspect learning and atom pages', async ({ page }) => {
    const networkErrors: NetworkLog[] = [];
    const consoleLogs: string[] = [];

    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    page.on('response', async (response) => {
      if (response.status() >= 400) {
        const entry: NetworkLog = {
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
          statusText: response.statusText(),
        };
        try {
          entry.body = await response.text();
        } catch {
          entry.body = '<could not read body>';
        }
        networkErrors.push(entry);
      }
    });

    // Inject auth
    const token = accessToken || 'mock-diagnostic-token';
    await page.route('**/api/v1/auth/token/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: token }),
      });
    });

    if (!accessToken) {
      await page.route('**/api/v1/tenants', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ items: [] }),
          });
        } else {
          await route.fallback();
        }
      });
      await page.route('**/api/v1/tenants/current/entitlements', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled_add_ons: [] }),
        });
      });
    }

    // Try /learning page
    console.log('\n========== LEARNING PAGE ==========');
    await page.goto('/learning');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const learningUrl = page.url();
    console.log(`URL after /learning: ${learningUrl}`);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-learning-page.png`, fullPage: true });

    const learningText = await page.locator('body').innerText();
    console.log('--- LEARNING PAGE TEXT ---');
    console.log(learningText);
    console.log('--- END ---\n');

    // Check for translation keys
    const keyPattern = /[a-z_]+\.[a-z_]+\.[a-z_]+/g;
    const learningKeys = learningText.match(keyPattern) || [];
    if (learningKeys.length > 0) {
      console.log('WARNING: Possible translation keys on learning page:');
      for (const key of [...new Set(learningKeys)]) {
        console.log(`  - "${key}"`);
      }
    }

    // Try /discovery page
    console.log('\n========== DISCOVERY PAGE ==========');
    await page.goto('/discovery');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const discoveryUrl = page.url();
    console.log(`URL after /discovery: ${discoveryUrl}`);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-discovery-page.png`, fullPage: true });

    const discoveryText = await page.locator('body').innerText();
    console.log('--- DISCOVERY PAGE TEXT ---');
    console.log(discoveryText);
    console.log('--- END ---\n');

    const discoveryKeys = discoveryText.match(keyPattern) || [];
    if (discoveryKeys.length > 0) {
      console.log('WARNING: Possible translation keys on discovery page:');
      for (const key of [...new Set(discoveryKeys)]) {
        console.log(`  - "${key}"`);
      }
    }

    // Network errors across learning pages
    if (networkErrors.length > 0) {
      console.log(`\nNetwork errors on learning/discovery: ${networkErrors.length}`);
      for (const err of networkErrors) {
        console.log(`  ${err.method} ${err.url} → ${err.status}`);
        if (err.body) {
          console.log(`    Body: ${err.body.substring(0, 200)}`);
        }
      }
    }

    // Console errors
    const consoleErrors = consoleLogs.filter((l) => l.startsWith('[error]'));
    if (consoleErrors.length > 0) {
      console.log(`\nConsole errors: ${consoleErrors.length}`);
      for (const e of consoleErrors) {
        console.log(`  ${e}`);
      }
    }

    console.log('=====================================\n');
  });

  // ---------------------------------------------------------------------------
  // Step 6: Check backend service health
  // ---------------------------------------------------------------------------
  test('STEP 6 — Backend service health check', async () => {
    console.log('\n========== BACKEND HEALTH ==========');

    // Gateway health
    try {
      const gatewayRes = await fetch(`${GATEWAY_URL}/health`);
      const gatewayBody = await gatewayRes.text();
      console.log(`Gateway /health: ${gatewayRes.status}`);
      console.log(`  Body: ${gatewayBody.substring(0, 500)}`);
    } catch (err) {
      console.log(`Gateway /health: UNREACHABLE (${err})`);
    }

    // Check individual service ports
    const services = [
      { name: 'IAM', port: 8080 },
      { name: 'Atomic', port: 8081 },
      { name: 'Engagement', port: 8082 },
      { name: 'Tenancy', port: 8083 },
      { name: 'CMS', port: 8084 },
      { name: 'Media Processor', port: 8085 },
    ];

    for (const svc of services) {
      try {
        const res = await fetch(`http://localhost:${svc.port}/healthz`, {
          signal: AbortSignal.timeout(3000),
        });
        console.log(`${svc.name} (${svc.port}): ${res.status}`);
      } catch (err) {
        console.log(`${svc.name} (${svc.port}): UNREACHABLE`);
      }
    }

    // Check key API endpoints
    const endpoints = [
      '/api/v1/atoms',
      '/api/v1/topics',
      '/api/v1/engagement/dashboard',
      '/api/v1/auth/me',
    ];

    const token = accessToken;
    if (token) {
      console.log('\nChecking API endpoints with real token:');
      for (const endpoint of endpoints) {
        try {
          const res = await fetch(`${GATEWAY_URL}${endpoint}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
          });
          const body = await res.text();
          console.log(`  GET ${endpoint}: ${res.status}`);
          console.log(`    Body (first 200): ${body.substring(0, 200)}`);
        } catch (err) {
          console.log(`  GET ${endpoint}: ERROR (${err})`);
        }
      }
    } else {
      console.log('\nSkipping authenticated endpoint checks (no token)');
    }

    console.log('=====================================\n');
  });

  // ---------------------------------------------------------------------------
  // Step 7: Summary
  // ---------------------------------------------------------------------------
  test('STEP 7 — Diagnostic summary', async ({ page }) => {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║           DIAGNOSTIC SUMMARY                     ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║                                                  ║');
    console.log('║ Issue 1: Empty content after login               ║');
    console.log('║ Issue 2: Translation keys showing instead of text║');
    console.log('║                                                  ║');
    console.log('║ Check screenshots in e2e/screenshots/:           ║');
    console.log('║   01-login-page.png                              ║');
    console.log('║   02-dashboard.png                               ║');
    console.log('║   03-learning-page.png                           ║');
    console.log('║   04-discovery-page.png                          ║');
    console.log('║                                                  ║');
    console.log('╚══════════════════════════════════════════════════╝');

    // Final page scan — check register page too
    console.log('\n--- Register page quick check ---');
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-register-page.png`, fullPage: true });

    const regText = await page.locator('body').innerText();
    console.log('Register page text:');
    console.log(regText);

    const keyPattern = /[a-z_]+\.[a-z_]+\.[a-z_]+/g;
    const regKeys = regText.match(keyPattern) || [];
    if (regKeys.length > 0) {
      console.log('\nWARNING: Possible translation keys on register page:');
      for (const key of [...new Set(regKeys)]) {
        console.log(`  - "${key}"`);
      }
    }

    console.log('\n--- Diagnostic complete ---');
  });
});
