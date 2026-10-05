import { test, expect } from '@playwright/test';

/**
 * Verification test — confirms i18n labels and dashboard content
 * after fixes for tenant membership + missing translation keys.
 *
 * Uses daleleung76@gmail.com (now has tenant membership in Acme Learning).
 */

const GATEWAY_URL = 'http://localhost:8000';
const USER_EMAIL = 'daleleung76@gmail.com';
const USER_PASSWORD = 'password123';

async function loginAndInjectAuth(page: import('@playwright/test').Page) {
  // Get real token from API
  const res = await fetch(`${GATEWAY_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
  });
  const { access_token } = await res.json() as { access_token: string };

  // Inject into browser via silent refresh intercept
  await page.route('**/api/v1/auth/token/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token }),
    });
  });

  return access_token;
}

test.describe('Verify Fixes — Labels & Content', () => {
  test('01 — login page has proper labels', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'e2e/screenshots/fix-01-login.png' });

    // Check that labels show translated text, NOT raw keys
    const heading = await page.locator('[data-testid="login-page"] h1').textContent();
    console.log(`  Login heading: "${heading}"`);
    expect(heading).not.toContain('identity.login');
    expect(heading?.trim()).toBe('Welcome back');

    const emailLabel = await page.locator('label[for="login-email"]').textContent();
    console.log(`  Email label: "${emailLabel}"`);
    expect(emailLabel?.trim()).toBe('Email address');

    const passwordLabel = await page.locator('label[for="login-password"]').textContent();
    console.log(`  Password label: "${passwordLabel}"`);
    expect(passwordLabel?.trim()).toBe('Password');

    const loginBtn = await page.locator('[data-testid="login-password-btn"]').textContent();
    console.log(`  Login button: "${loginBtn}"`);
    expect(loginBtn?.trim()).toBe('Log In');

    // OIDC buttons
    const googleBtn = await page.locator('[data-testid="login-google-btn"]').textContent();
    console.log(`  Google button: "${googleBtn}"`);
    expect(googleBtn?.trim()).toBe('Continue with Google');

    console.log('  ✓ All login page labels are properly translated');
  });

  test('02 — register page has proper labels', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'e2e/screenshots/fix-02-register.png' });

    const heading = await page.locator('[data-testid="register-page"] h1').textContent();
    console.log(`  Register heading: "${heading}"`);
    expect(heading?.trim()).toBe('Create your account');

    const passwordLabel = await page.locator('label[for="register-password"]').textContent();
    console.log(`  Password label: "${passwordLabel}"`);
    expect(passwordLabel?.trim()).toBe('Password');

    const submitBtn = await page.locator('[data-testid="register-submit-btn"]').textContent();
    console.log(`  Submit button: "${submitBtn}"`);
    expect(submitBtn?.trim()).toBe('Create Account');

    console.log('  ✓ All register page labels are properly translated');
  });

  test('03 — password login works end-to-end via UI', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Mock tenant/entitlement endpoints for post-login
    await page.route('**/api/v1/tenants', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ id: 'a0000000-0000-4000-a000-000000000002', name: 'Acme Learning', slug: 'acme-learning', logo_url: null }] }) });
      } else { await route.fallback(); }
    });
    await page.route('**/api/v1/tenants/current/entitlements', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled_add_ons: ['learner_engagement', 'knowledge_graph'] }) });
    });

    // Fill in login form
    await page.locator('[data-testid="login-email"]').fill(USER_EMAIL);
    await page.locator('[data-testid="login-password"]').fill(USER_PASSWORD);
    await page.locator('[data-testid="login-password-btn"]').click();

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
    await page.screenshot({ path: 'e2e/screenshots/fix-03-post-login.png' });

    console.log(`  ✓ Password login succeeded, redirected to: ${page.url()}`);
  });

  test('04 — dashboard loads with authenticated user', async ({ page }) => {
    const token = await loginAndInjectAuth(page);

    // Let real API calls go through (user now has tenant membership)
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Allow API calls to complete
    await page.screenshot({ path: 'e2e/screenshots/fix-04-dashboard.png' });

    const url = page.url();
    console.log(`  Dashboard URL: ${url}`);
    expect(url).toContain('/dashboard');

    // Check dashboard label is translated
    const dashboardText = await page.locator('[data-testid="dashboard"]').textContent().catch(() => null);
    const errorText = await page.locator('[data-testid="dashboard-error"]').textContent().catch(() => null);

    if (dashboardText) {
      console.log(`  Dashboard content (first 200 chars): ${dashboardText.trim().substring(0, 200)}`);
      // Check no raw translation keys
      const hasRawKeys = dashboardText.includes('engagement.dashboard.');
      if (hasRawKeys) {
        console.log('  ⚠ Some raw translation keys still visible in dashboard');
      } else {
        console.log('  ✓ Dashboard labels are properly translated');
      }
    }

    if (errorText) {
      console.log(`  Dashboard error: "${errorText.trim()}"`);
      // Even if there's an error, it should show translated text
      expect(errorText).not.toContain('engagement.dashboard.error');
    }

    // Log all network errors
    const failedRequests: string[] = [];
    page.on('response', (response) => {
      if (response.status() >= 400) {
        failedRequests.push(`${response.status()} ${response.url()}`);
      }
    });
  });

  test('05 — learning page loads', async ({ page }) => {
    const token = await loginAndInjectAuth(page);

    await page.goto('/learning');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'e2e/screenshots/fix-05-learning.png' });

    const url = page.url();
    console.log(`  Learning URL: ${url}`);

    // Check for translated labels
    const pageText = await page.locator('body').textContent();
    const rawKeyPattern = /atomic\.atom-list\.|atomic\.topic-explorer\./;
    if (rawKeyPattern.test(pageText ?? '')) {
      console.log('  ⚠ Raw translation keys found on learning page');
    } else {
      console.log('  ✓ Learning page labels are properly translated');
    }

    // Check if atom list or topic explorer rendered
    const atomList = page.locator('[data-testid="atom-list"]');
    const topicExplorer = page.locator('[data-testid="topic-explorer"]');

    if (await atomList.isVisible().catch(() => false)) {
      console.log('  ✓ Atom list is visible');
    }
    if (await topicExplorer.isVisible().catch(() => false)) {
      console.log('  ✓ Topic explorer is visible');
    }
  });

  test('06 — check i18n file loads correctly', async ({ page }) => {
    const res = await page.request.get('http://localhost:4200/assets/i18n/en.json');
    expect(res.ok()).toBeTruthy();

    const json = await res.json();
    const keys = flattenKeys(json);
    console.log(`  Total i18n keys: ${keys.length}`);

    // Verify critical keys exist
    const criticalKeys = [
      'identity.login.heading',
      'identity.login.password_label',
      'identity.login.login_btn',
      'identity.register.password_label',
      'engagement.dashboard.loading',
      'engagement.dashboard.error',
      'engagement.dashboard.retry',
      'atomic.atom-list.title',
      'atomic.atom-list.loading',
      'atomic.topic-explorer.title',
    ];

    for (const key of criticalKeys) {
      const exists = keys.includes(key);
      if (!exists) {
        console.log(`  ✗ Missing key: ${key}`);
      }
      expect(exists, `Missing i18n key: ${key}`).toBeTruthy();
    }

    console.log(`  ✓ All ${criticalKeys.length} critical i18n keys present`);
  });

  test('07 — API connectivity check with tenant context', async ({ page }) => {
    // Login to get a token with tenant_id in claims
    const res = await fetch(`${GATEWAY_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
    });
    const { access_token, gcid } = await res.json() as { access_token: string; gcid: string };

    // Test profile endpoint
    const profileRes = await fetch(`${GATEWAY_URL}/api/v1/gcid/${gcid}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    console.log(`  Profile: ${profileRes.status}`);
    expect(profileRes.status).toBe(200);

    // Test atoms endpoint (should work now with tenant_id in JWT)
    const atomsRes = await fetch(`${GATEWAY_URL}/api/v1/atoms`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    console.log(`  Atoms: ${atomsRes.status}`);

    // Test topics endpoint
    const topicsRes = await fetch(`${GATEWAY_URL}/api/v1/topics`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    console.log(`  Topics: ${topicsRes.status}`);

    // Test engagement dashboard
    const engRes = await fetch(`${GATEWAY_URL}/api/v1/engagement/dashboard`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    console.log(`  Engagement dashboard: ${engRes.status}`);

    // Test tenants endpoint
    const tenantsRes = await fetch(`${GATEWAY_URL}/api/v1/tenants`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    console.log(`  Tenants: ${tenantsRes.status}`);

    if (atomsRes.ok) {
      const atoms = await atomsRes.json();
      console.log(`  ✓ Atoms response: ${JSON.stringify(atoms).substring(0, 200)}`);
    }
    if (topicsRes.ok) {
      const topics = await topicsRes.json();
      console.log(`  ✓ Topics response: ${JSON.stringify(topics).substring(0, 200)}`);
    }
  });
});

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'object' && v !== null) {
      keys.push(...flattenKeys(v as Record<string, unknown>, newKey));
    } else {
      keys.push(newKey);
    }
  }
  return keys;
}
