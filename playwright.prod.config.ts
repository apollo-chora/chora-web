/**
 * Playwright config — SMOKE TESTS against DEPLOYED URLs (not local builds).
 *
 * Used by `cloudbuild-prod.yaml` (post-prod-deploy smoke) and
 * `cloudbuild-staging.yaml` (smoke-dev stage). Tests run against a live
 * deployed surface (e.g. https://chora.site, https://dev.chora.site) — no
 * `webServer`, no auth-state setup, no `ng serve` boot.
 *
 * Diffs vs `playwright.config.ts` (the local/CI build runner):
 *   - `testDir`        : './tests' (smoke-only) vs './e2e' (full suite)
 *   - `use.baseURL`    : env-driven via `BASE_URL` (defaults to prod)
 *   - `workers`        : forced to 1 (single-threaded — never hammer CDN/CSM)
 *   - `timeout`        : 60s/test (deployed latency > local)
 *   - `expect.timeout` : 10s
 *   - `projects`       : single Desktop Chrome @ 1280×900 (tablet-first per
 *                        chora-web/CLAUDE.md §11 — desktop enhanced viewport)
 *   - `reporter`       : junit + html (no `list`; CI consumes junit.xml)
 *   - NO `webServer`   : we hit the deployed URL, not a local server
 *   - NO `auth-setup`  : smoke specs are unauthenticated public-route only
 *
 * Preserved from base:
 *   - `testIdAttribute: 'data-testid'` (per chora-web/CLAUDE.md §6)
 *   - `screenshot: 'only-on-failure'`, `trace: 'retain-on-failure'`,
 *     `video: 'retain-on-failure'` (CI evidence convention)
 *   - CI retries (`retries: 2` when `process.env['CI']` is set)
 */
import { defineConfig, devices } from '@playwright/test';

const isCi = !!process.env['CI'];
const baseURL = process.env['BASE_URL'] ?? 'https://chora.site';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: isCi ? 2 : 0,
  workers: 1,
  reporter: [
    ['junit', { outputFile: 'playwright-junit.xml' }],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL,
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    testIdAttribute: 'data-testid',
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
});
