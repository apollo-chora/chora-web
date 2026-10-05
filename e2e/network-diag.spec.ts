import { test, expect } from '@playwright/test';

/**
 * Network diagnostic — captures all requests/responses on dashboard and learning pages
 * to find why the frontend shows errors despite APIs returning 200 in curl.
 */

const GATEWAY_URL = 'http://localhost:8000';
const USER_EMAIL = 'daleleung76@gmail.com';
const USER_PASSWORD = 'password123';

test('diagnose dashboard network requests', async ({ page }) => {
  // Capture ALL network traffic
  const requests: { method: string; url: string; status: number; body: string }[] = [];

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/') || url.includes('/assets/i18n/')) {
      let body = '';
      try { body = await response.text(); } catch { body = '<could not read>'; }
      requests.push({
        method: response.request().method(),
        url: url.replace('http://localhost:8000', '').replace('http://localhost:4200', ''),
        status: response.status(),
        body: body.substring(0, 300),
      });
    }
  });

  // Capture console errors
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Step 1: Go to login and login via UI
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  await page.locator('[data-testid="login-email"]').fill(USER_EMAIL);
  await page.locator('[data-testid="login-password"]').fill(USER_PASSWORD);
  await page.locator('[data-testid="login-password-btn"]').click();

  // Wait for navigation
  await page.waitForURL(/\/dashboard|\/login/, { timeout: 10_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000); // Let all lazy requests complete

  console.log('\n=== NETWORK LOG (after login + dashboard) ===');
  for (const req of requests) {
    const emoji = req.status >= 400 ? '✗' : '✓';
    console.log(`  ${emoji} ${req.method} ${req.url} → ${req.status}`);
    if (req.status >= 400) {
      console.log(`    Response: ${req.body}`);
    }
  }

  console.log('\n=== CONSOLE ERRORS ===');
  for (const err of consoleErrors) {
    console.log(`  ${err.substring(0, 200)}`);
  }
  if (consoleErrors.length === 0) console.log('  (none)');

  // Check auth state
  const currentUrl = page.url();
  console.log(`\n=== CURRENT URL: ${currentUrl} ===`);

  if (currentUrl.includes('/login')) {
    console.log('  ⚠ Still on login page — login may have failed');
  }

  // Check what the AuthInterceptor is sending
  console.log('\n=== AUTH HEADERS CHECK ===');
  const authRequests = requests.filter(r => r.url.includes('/api/v1/') && !r.url.includes('/auth/'));
  for (const req of authRequests) {
    console.log(`  ${req.method} ${req.url} → ${req.status}`);
  }

  await page.screenshot({ path: 'e2e/screenshots/diag-dashboard.png' });
});

test('diagnose learning page network requests', async ({ page }) => {
  const requests: { method: string; url: string; status: number; body: string; reqHeaders: Record<string, string> }[] = [];

  page.on('request', (request) => {
    if (request.url().includes('/api/')) {
      const headers = request.headers();
      // Store request headers for later matching
      (request as any).__authHeader = headers['authorization'] ?? '(none)';
    }
  });

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/')) {
      let body = '';
      try { body = await response.text(); } catch { body = '<could not read>'; }
      const authHeader = (response.request() as any).__authHeader ?? '(unknown)';
      requests.push({
        method: response.request().method(),
        url: url.replace('http://localhost:8000', '').replace('http://localhost:4200', ''),
        status: response.status(),
        body: body.substring(0, 300),
        reqHeaders: { authorization: authHeader },
      });
    }
  });

  // Login first
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-testid="login-email"]').fill(USER_EMAIL);
  await page.locator('[data-testid="login-password"]').fill(USER_PASSWORD);
  await page.locator('[data-testid="login-password-btn"]').click();
  await page.waitForURL(/\/dashboard|\/login/, { timeout: 10_000 });
  await page.waitForLoadState('networkidle');

  // Clear captured requests
  requests.length = 0;

  // Navigate to learning
  await page.goto('/learning');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  console.log('\n=== LEARNING PAGE NETWORK LOG ===');
  for (const req of requests) {
    const emoji = req.status >= 400 ? '✗' : '✓';
    console.log(`  ${emoji} ${req.method} ${req.url} → ${req.status} | Auth: ${req.reqHeaders.authorization.substring(0, 50)}...`);
    if (req.status >= 400) {
      console.log(`    Response: ${req.body}`);
    }
  }

  await page.screenshot({ path: 'e2e/screenshots/diag-learning.png' });
});
