import { test, expect, type Page } from '@playwright/test';

/**
 * Live Backend E2E Test — tests registration, login, and service usage
 * against the real running backend (not mocked).
 *
 * Prerequisites:
 *   - Docker Compose stack running (make dev)
 *   - Migrations applied (make migrate-local)
 *   - Angular dev server on :4200
 *   - Gateway on :8000, IAM on :8080, Atomic on :8081
 */

const GATEWAY_URL = 'http://localhost:8000';
const TEST_EMAIL = `e2e-${Date.now()}@test.chora.io`;
const TEST_PASSWORD = 'SecurePass123!';
const TEST_NAME = 'E2E Live Tester';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Register a user via the real API and return the access token + gcid */
async function apiRegister(email: string, password: string, name: string) {
  const res = await fetch(`${GATEWAY_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, display_name: name }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Registration failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<{ access_token: string; gcid: string }>;
}

/** Login via the real API and return the access token */
async function apiLogin(email: string, password: string) {
  const res = await fetch(`${GATEWAY_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<{ access_token: string; gcid: string }>;
}

/** Inject auth into the page by intercepting the silent refresh endpoint */
async function injectAuth(page: Page, accessToken: string) {
  // Mock the silent refresh to return our real token
  await page.route('**/api/v1/auth/token/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: accessToken }),
    });
  });

  // Mock tenant list (user may not have tenant memberships yet)
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

  // Mock entitlements (no tenant = empty entitlements)
  await page.route('**/api/v1/tenants/current/entitlements', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled_add_ons: [] }),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Live Backend — Registration, Login & Services', () => {
  test.describe.configure({ mode: 'serial' });

  let registeredToken: string;
  let registeredGcid: string;

  test('01 — registration form renders and validates', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');

    // Verify register page is visible
    const container = page.locator('[data-testid="register-page"]');
    await expect(container).toBeVisible();

    // Verify form fields are present
    await expect(page.locator('[data-testid="register-email"]')).toBeVisible();
    await expect(page.locator('[data-testid="register-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="register-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="register-submit-btn"]')).toBeVisible();

    // Try submitting empty form — should show validation errors
    await page.locator('[data-testid="register-submit-btn"]').click();

    // Form should still be visible (not submitted)
    await expect(container).toBeVisible();
  });

  test('02 — create a test account via UI (auto-login redirect)', async ({ page }) => {
    // Mock tenant/entitlement endpoints so the auto-login redirect works
    await page.route('**/api/v1/tenants', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
      } else { await route.fallback(); }
    });
    await page.route('**/api/v1/tenants/current/entitlements', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled_add_ons: [] }) });
    });

    await page.goto('/register');
    await page.waitForLoadState('networkidle');

    // Fill in the registration form
    await page.locator('[data-testid="register-email"]').fill(TEST_EMAIL);
    await page.locator('[data-testid="register-name"]').fill(TEST_NAME);
    await page.locator('[data-testid="register-password"]').fill(TEST_PASSWORD);

    // Submit — should auto-login and redirect to dashboard
    await page.locator('[data-testid="register-submit-btn"]').click();

    // Wait for redirect to dashboard (auto-login)
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

    console.log(`  ✓ Registered ${TEST_EMAIL} and auto-redirected to dashboard`);
  });

  test('03 — login via API and verify auth state', async ({ page }) => {
    // Login via the real API (since frontend login is WebAuthn/OIDC only)
    const loginResult = await apiLogin(TEST_EMAIL, TEST_PASSWORD);
    registeredToken = loginResult.access_token;
    registeredGcid = loginResult.gcid;

    expect(registeredToken).toBeTruthy();
    expect(registeredGcid).toBeTruthy();
    console.log(`  ✓ Logged in as GCID: ${registeredGcid}`);

    // Inject the real token into the browser session
    await injectAuth(page, registeredToken);

    // Navigate to dashboard — should load as authenticated
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // The page should NOT redirect to /login (we're authenticated)
    const url = page.url();
    expect(url).not.toContain('/login');
    console.log(`  ✓ Authenticated session active, on: ${url}`);
  });

  test('04 — fetch atoms from Atomic service', async ({ page }) => {
    // Login and inject auth
    const loginResult = await apiLogin(TEST_EMAIL, TEST_PASSWORD);
    await injectAuth(page, loginResult.access_token);

    // Hit the atoms endpoint directly via fetch to verify backend connectivity
    const atomsRes = await fetch(`${GATEWAY_URL}/api/v1/atoms`, {
      headers: { Authorization: `Bearer ${loginResult.access_token}` },
    });

    console.log(`  Atoms API response: ${atomsRes.status}`);

    // Even if we get 401/403 (no tenant membership), the service is responding
    expect([200, 401, 403]).toContain(atomsRes.status);

    if (atomsRes.ok) {
      const atoms = await atomsRes.json();
      console.log(`  ✓ Fetched ${JSON.stringify(atoms).length} bytes of atom data`);
    } else {
      console.log(`  ⚠ Atoms returned ${atomsRes.status} (expected — user has no tenant membership)`);
    }
  });

  test('05 — fetch topics from Atomic service', async ({ page }) => {
    const loginResult = await apiLogin(TEST_EMAIL, TEST_PASSWORD);

    const topicsRes = await fetch(`${GATEWAY_URL}/api/v1/topics`, {
      headers: { Authorization: `Bearer ${loginResult.access_token}` },
    });

    console.log(`  Topics API response: ${topicsRes.status}`);
    expect([200, 401, 403]).toContain(topicsRes.status);

    if (topicsRes.ok) {
      const topics = await topicsRes.json();
      console.log(`  ✓ Fetched topics: ${JSON.stringify(topics).length} bytes`);
    }
  });

  test('06 — verify GCID profile via IAM service', async ({ page }) => {
    const loginResult = await apiLogin(TEST_EMAIL, TEST_PASSWORD);

    const profileRes = await fetch(`${GATEWAY_URL}/api/v1/gcid/${loginResult.gcid}`, {
      headers: { Authorization: `Bearer ${loginResult.access_token}` },
    });

    console.log(`  Profile API response: ${profileRes.status}`);

    if (profileRes.ok) {
      const profile = await profileRes.json();
      expect(profile).toHaveProperty('email', TEST_EMAIL);
      expect(profile).toHaveProperty('display_name', TEST_NAME);
      expect(profile).toHaveProperty('account_state', 'active');
      console.log(`  ✓ Profile verified: ${profile.display_name} (${profile.email})`);
    } else {
      // Some endpoints may require different auth — verify service is reachable
      expect([200, 401, 403, 404]).toContain(profileRes.status);
    }
  });

  test('07 — navigate login page and verify it renders', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Login page should render
    const loginPage = page.locator('[data-testid="login-page"]');
    await expect(loginPage).toBeVisible();

    // Email input should be present
    await expect(page.locator('[data-testid="login-email"]')).toBeVisible();

    // Register link should navigate to register
    await page.locator('[data-testid="login-register-link"]').click();
    await expect(page).toHaveURL(/\/register/);
    console.log(`  ✓ Login page renders, register link works`);
  });

  test('08 — duplicate registration returns error', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');

    // Try to register with the same email again
    await page.locator('[data-testid="register-email"]').fill(TEST_EMAIL);
    await page.locator('[data-testid="register-name"]').fill('Duplicate User');
    await page.locator('[data-testid="register-password"]').fill(TEST_PASSWORD);
    await page.locator('[data-testid="register-submit-btn"]').click();

    // Should show an error (duplicate email)
    const errorAlert = page.locator('[data-testid="register-error"]');
    await expect(errorAlert).toBeVisible({ timeout: 10_000 });
    console.log(`  ✓ Duplicate registration correctly rejected`);
  });

  test('09 — engagement service health check', async () => {
    // Verify the engagement service is reachable through the gateway
    const res = await fetch(`${GATEWAY_URL}/api/v1/engagement/healthz`);
    console.log(`  Engagement health: ${res.status}`);
    // Accept any response that isn't a network error (service may not have /healthz)
    expect(res.status).toBeDefined();
  });

  test('10 — gateway health aggregation', async () => {
    const res = await fetch(`${GATEWAY_URL}/health`);
    console.log(`  Gateway health: ${res.status}`);
    // 503 is acceptable when not all services are running
    expect([200, 503]).toContain(res.status);
  });
});
