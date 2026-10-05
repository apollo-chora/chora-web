/**
 * Deployed-URL smoke spec — runs against the live deployed surface
 * (e.g. https://chora.site, https://dev.chora.site) via
 * `playwright.prod.config.ts`. No auth, no `webServer`, no local build —
 * just hit the URL and assert the bundle + CDN headers look right.
 *
 * Tagged `@deployed-smoke` so it can be filtered via
 * `npx playwright test --grep "@deployed-smoke"` and remain disjoint from
 * the local `@smoke|@critical|@a11y` tags consumed by the build runner.
 */
import { test, expect } from '@playwright/test';

test.describe('@deployed-smoke', () => {
  test('home page loads with title @deployed-smoke', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Chora/i);
  });

  test('main bundle js loads @deployed-smoke', async ({ page, request }) => {
    await page.goto('/');
    // Find the Angular main bundle script src
    const mainSrc = await page.locator('script[src*="main-"]').first().getAttribute('src');
    expect(mainSrc, 'Angular main bundle script tag').toBeTruthy();
    if (mainSrc) {
      // Fetch directly and verify 200 + reasonable size + cache header
      const baseURL = (process.env['BASE_URL'] ?? 'https://chora.site').replace(/\/$/, '');
      const path = mainSrc.startsWith('/') ? mainSrc : `/${mainSrc}`;
      const absUrl = mainSrc.startsWith('http') ? mainSrc : `${baseURL}${path}`;
      const resp = await request.get(absUrl);
      expect(resp.status()).toBe(200);
      expect(parseInt(resp.headers()['content-length'] ?? '0')).toBeGreaterThan(10_000);
      expect(resp.headers()['cache-control']).toContain('immutable');
    }
  });

  test('index.html entry document is uncacheable @deployed-smoke', async ({ request }) => {
    const resp = await request.get('/');
    expect(resp.status()).toBe(200);

    const cacheControl = (resp.headers()['cache-control'] ?? '').toLowerCase();

    // The SPA entry document is the only unhashed pointer to the fingerprinted
    // bundle names, so a cached copy strands a returning user on a bundle set
    // that the deploy has already pruned from the bucket. Same defect class as
    // the blanket immutable rsync that once stranded users on a stale
    // ngsw.json, which is why chora-infra/scripts/deploy-static.sh pins
    // index.html, ngsw.json and ngsw-worker.js to no-store. This asserts that
    // intent exactly, so changing the entry-document policy has to be a
    // deliberate edit here and not a silent drift.
    expect(cacheControl, 'index.html Cache-Control').toContain('no-store');
    expect(cacheControl, 'index.html Cache-Control').toContain('no-cache');
    expect(cacheControl, 'index.html Cache-Control').toContain('must-revalidate');

    // Strict drift guard: any positive freshness lifetime on the entry
    // document is a regression, whether it arrives as max-age, s-maxage or
    // immutable. Scan every directive, not just the first, so a trailing
    // s-maxage cannot hide behind a leading max-age=0.
    const lifetimes = [...cacheControl.matchAll(/(?:^|[\s,])(?:s-maxage|max-age)=(\d+)/g)].map(
      (m) => Number(m[1]),
    );
    expect(Math.max(0, ...lifetimes), 'index.html freshness lifetime').toBe(0);
    expect(cacheControl, 'index.html Cache-Control').not.toContain('immutable');

    // The edge must honour it. A shared cache that stored the entry document
    // reports a positive Age, which is the exact staleness the origin header
    // exists to prevent, so verify the CDN is not caching it after all.
    expect(Number(resp.headers()['age'] ?? '0'), 'index.html edge Age').toBe(0);
  });
});
