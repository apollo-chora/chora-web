/**
 * Playwright config — aligned with `chora-web/CLAUDE.md` §6 and the
 * `frontend-testing-stack` skill.
 *
 * Conventions:
 *   - Tablet-first viewport defaults (≥768px). NO mobile breakpoints.
 *   - Always emit HTML + JUnit reports in CI for downstream consumption.
 *   - Storage-state hook for authenticated specs (per-role JSON in
 *     `e2e/fixtures/.auth/`); skeleton specs run unauthenticated against
 *     public routes (e.g. `/a/login`).
 *   - `webServer` defaults to `ng serve` for dev convenience; CI overrides
 *     to serve the built artifact via `http-server` (see `chora-web-e2e.yml`).
 */
import { defineConfig, devices } from '@playwright/test';

const isCi = !!process.env['CI'];

// CI workflow overrides the webServer command via the PLAYWRIGHT_WEB_SERVER_CMD
// env var so the skeleton specs run against the built `dist/` artifact, not
// `ng serve`. Default keeps the local DX simple (`npm run e2e`).
const webServerCommand = process.env['PLAYWRIGHT_WEB_SERVER_CMD'] ?? 'npx ng serve';

// When the CI workflow sets PLAYWRIGHT_WEB_SERVER_CMD (typically to a no-op
// like `echo "reusing http-server"`), it has ALREADY started http-server
// externally on the URL. Playwright's default `reuseExistingServer: false`
// in CI would fail with "port already in use" — so when the env var is
// present we MUST allow reuse. Local dev (no env var) keeps the existing
// `!isCi` semantics.
const externallyServed = !!process.env['PLAYWRIGHT_WEB_SERVER_CMD'];

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: isCi ? 2 : 0,
  workers: isCi ? 2 : undefined,
  reporter: isCi
    ? [
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
        ['junit', { outputFile: 'playwright-report/junit.xml' }],
        ['list'],
      ]
    : [['html', { open: 'on-failure', outputFolder: 'playwright-report' }], ['list']],
  use: {
    baseURL: 'http://localhost:4200',
    // Tablet-first default: 768×1024 portrait (matches CLAUDE.md UI mandate).
    viewport: { width: 768, height: 1024 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    testIdAttribute: 'data-testid',
  },
  projects: [
    // Phyllis skeleton + a11y smoke — runs against unauthenticated public
    // routes (login + roster + quiz-builder). No dependency on auth-setup.
    {
      name: 'phyllis-skeleton',
      testMatch: /phyllis-.+\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
      },
    },

    // ── WS-9: A+ Phyllis E2E journey (tests/e2e/aplus/) ──────────────────
    // Tablet-first primary viewport: 1024×768 (iPad portrait).
    // Hits real BFF via PLAYWRIGHT_BASE_URL env var (no webServer, no mocks).
    // Requires E2E_TEST_TOKEN env var — fails loud if absent.
    // Run filtered via: npx playwright test --grep @phyllis-aplus --project=phyllis-aplus-tablet
    {
      name: 'phyllis-aplus-tablet',
      testDir: './tests/e2e/aplus',
      testMatch: /phyllis-journey\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 768 },
        baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'https://chora.site',
        // Screenshots on every step (not just failures) for visual baseline.
        screenshot: 'on',
        trace: 'retain-on-failure',
        video: 'retain-on-failure',
        testIdAttribute: 'data-testid',
      },
    },
    // Desktop secondary viewport: 1440×900.
    {
      name: 'phyllis-aplus-desktop',
      testDir: './tests/e2e/aplus',
      testMatch: /phyllis-journey\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'https://chora.site',
        screenshot: 'on',
        trace: 'retain-on-failure',
        video: 'retain-on-failure',
        testIdAttribute: 'data-testid',
      },
    },
    // Auth-state generation for authenticated specs below.
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'Tablet Chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
        storageState: 'e2e/fixtures/.auth/learner.json',
      },
      dependencies: ['auth-setup'],
      testIgnore: /phyllis-.+\.spec\.ts$/,
    },
    {
      name: 'Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        storageState: 'e2e/fixtures/.auth/learner.json',
      },
      dependencies: ['auth-setup'],
      testIgnore: /phyllis-.+\.spec\.ts$/,
    },
    {
      name: 'Desktop Firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 900 },
        storageState: 'e2e/fixtures/.auth/learner.json',
      },
      dependencies: ['auth-setup'],
      testIgnore: /phyllis-.+\.spec\.ts$/,
    },
    {
      name: 'Admin Tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 768 },
        storageState: 'e2e/fixtures/.auth/tenant-admin.json',
      },
      dependencies: ['auth-setup'],
      testMatch: /admin\/.+\.spec\.ts/,
    },
    {
      name: 'Admin Desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        storageState: 'e2e/fixtures/.auth/tenant-admin.json',
      },
      dependencies: ['auth-setup'],
      testMatch: /admin\/.+\.spec\.ts/,
    },
    /**
     * A+ per-route WCAG 2.1 AA audit (tests/a11y/aplus).
     *
     * ⚠ This project is why that suite runs at all. The tree sat outside every
     * `testDir` (the root is `./e2e`, the only overrides point at
     * `./tests/e2e/aplus`), so `playwright test --list` collected ZERO tests
     * from it while its own header told CI to run a project named
     * "A11y Tablet" that did not exist. 320 lines of audit, never executed,
     * and nothing failed to say so. The name is kept EXACTLY as the suite's
     * header and README already spell it, because making the instruction true
     * is the fix; renaming it would just move the lie.
     *
     * The specs loop their own viewports through `APLUS_VIEWPORTS`, so the
     * viewport here is only the starting size.
     */
    {
      name: 'A11y Tablet',
      testDir: './tests/a11y',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 768 },
        storageState: 'e2e/fixtures/.auth/learner.json',
      },
      dependencies: ['auth-setup'],
    },
    {
      name: 'Minimum Viewport',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        storageState: 'e2e/fixtures/.auth/learner.json',
      },
      dependencies: ['auth-setup'],
      testMatch: /\.min-viewport\.spec\.ts/,
    },
  ],
  webServer: {
    command: webServerCommand,
    url: 'http://localhost:4200',
    reuseExistingServer: !isCi || externallyServed,
    timeout: 120_000,
  },
});
