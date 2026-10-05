/**
 * A+ surface — per-route WCAG 2.1 AA accessibility audit.
 *
 * Workstream: WS-11
 * Tag: @a11y  (filter: `npx playwright test --grep @a11y`)
 *
 * Strategy
 * --------
 * - Every A+ route is visited at two viewports (tablet 1024×768, desktop
 *   1440×900) per the tablet-first mandate (CLAUDE.md §1).
 * - axe-core runs after `waitForLoadState('networkidle')` so lazy-loaded
 *   Angular standalone components have had time to bootstrap.
 * - Auth: most routes require a session.  The `auth-setup` project (see
 *   playwright.config.ts) seeds storage state via the cookie pattern already
 *   used by WS-9.  Unauthenticated routes (login) explicitly clear storage.
 * - Violations: the test asserts `violations.length === 0`.  Every failing
 *   assertion emits a human-readable summary (rule ID + impact + selector +
 *   help URL) and attaches a screenshot for visual reproduction.
 * - Glassmorphism false-positives: `.glass-backdrop` and `.glass-panel >
 *   .glass-surface` are excluded at the AxeBuilder level; child text nodes
 *   inside those containers are still audited (see fixtures/axe-config.ts).
 * - There are no `@planned` skips left.  The three that carried them (WS-6a/6b
 *   collections, WS-7 atom revisions, WS-8 search) all said "enable once route
 *   is live", and all three routes are live, so they are enabled.  They stayed
 *   skipped only because this whole suite was uncollected, so nothing ever
 *   reported that the condition had been met.
 *
 * CI integration
 * --------------
 * Cloud Build step (see README.md):
 *   npx playwright test --grep "@a11y" --project "A11y Tablet" --reporter=html,junit
 *
 * ⚠ That command only started working when the "A11y Tablet" project was added
 * to playwright.config.ts.  Before that this tree sat outside every `testDir`
 * and the named project did not exist, so `playwright test --list` collected
 * ZERO tests here and the instruction above described a run that could not
 * happen.
 *
 * Do NOT run locally (feedback_no_local_cicd_run convention).
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import {
  APLUS_VIEWPORTS,
  AXE_EXCLUDE_SELECTORS,
  WCAG_21_AA_TAGS,
  SEEDED_IDS,
  formatViolation,
} from './fixtures/axe-config';

// ---------------------------------------------------------------------------
// Helper: run axe and assert zero violations, attaching a screenshot on fail
// ---------------------------------------------------------------------------

async function auditPage(page: Page, routeLabel: string): Promise<void> {
  const builder = new AxeBuilder({ page }).withTags([...WCAG_21_AA_TAGS]);

  for (const sel of AXE_EXCLUDE_SELECTORS) {
    builder.exclude(sel);
  }

  const results = await builder.analyze();

  if (results.violations.length > 0) {
    // Attach screenshot to test report for visual reproduction
    const screenshot = await page.screenshot({ fullPage: true });
    await test
      .info()
      .attach(`a11y-violation-${routeLabel.replace(/[^a-z0-9]/gi, '-')}.png`, {
        body: screenshot,
        contentType: 'image/png',
      });

    // Build a readable summary — rule ID + impact + selector + remediation URL
    const summary = results.violations
      .map((v) => formatViolation(v))
      .join('\n  ');

    expect(
      results.violations,
      `WCAG 2.1 AA violations on "${routeLabel}":\n  ${summary}`,
    ).toHaveLength(0);
  }
}

// ---------------------------------------------------------------------------
// Helper: navigate + wait for content, then audit at each viewport
// ---------------------------------------------------------------------------

async function auditAtViewports(
  page: Page,
  url: string,
  routeLabel: string,
  waitSelector?: string,
): Promise<void> {
  for (const vp of APLUS_VIEWPORTS) {
    await page.setViewportSize(vp);
    await page.goto(url, { waitUntil: 'networkidle' });

    if (waitSelector) {
      await page
        .locator(waitSelector)
        .waitFor({ state: 'visible', timeout: 15_000 });
    } else {
      await page.waitForLoadState('domcontentloaded');
    }

    await auditPage(page, `${routeLabel} @ ${vp.width}x${vp.height}`);
  }
}

// ---------------------------------------------------------------------------
// Group 1: Unauthenticated public routes
// ---------------------------------------------------------------------------

test.describe('A+ a11y — unauthenticated routes @a11y', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login page has no WCAG 2.1 AA violations @a11y', async ({ page }) => {
    await auditAtViewports(page, '/a/login', 'A+ Login');
  });
});

// ---------------------------------------------------------------------------
// Group 2: Catalog + discovery (learner, no specific content seed required)
// ---------------------------------------------------------------------------

test.describe('A+ a11y — catalog @a11y', () => {
  // Uses learner storage state from auth-setup project
  test('catalog page has no WCAG 2.1 AA violations @a11y', async ({ page }) => {
    await auditAtViewports(page, '/a/catalog', 'A+ Catalog');
  });
});

// ---------------------------------------------------------------------------
// Group 3: Course routes (seeded course ID)
// ---------------------------------------------------------------------------

test.describe('A+ a11y — course routes @a11y', () => {
  const courseId = SEEDED_IDS.courseId;

  test('course detail has no WCAG 2.1 AA violations @a11y', async ({ page }) => {
    await auditAtViewports(
      page,
      `/a/courses/${courseId}`,
      'A+ Course Detail',
    );
  });

  test('course learn shell has no WCAG 2.1 AA violations @a11y', async ({
    page,
  }) => {
    await auditAtViewports(
      page,
      `/a/courses/${courseId}/learn`,
      'A+ Course Learn',
    );
  });
});

// ---------------------------------------------------------------------------
// Group 4: Atomic session player
// ---------------------------------------------------------------------------

test.describe('A+ a11y — atom player @a11y', () => {
  const atomId = SEEDED_IDS.atomId;

  test('atom play route has no WCAG 2.1 AA violations @a11y', async ({
    page,
  }) => {
    await auditAtViewports(
      page,
      `/a/atoms/${atomId}/play`,
      'A+ Atom Play',
    );
  });
});

// ---------------------------------------------------------------------------
// Group 5: Learner assessments
// ---------------------------------------------------------------------------

test.describe('A+ a11y — assessments @a11y', () => {
  const assessmentId = SEEDED_IDS.assessmentId;

  test('assessments list has no WCAG 2.1 AA violations @a11y', async ({
    page,
  }) => {
    await auditAtViewports(page, '/a/me/assessments', 'A+ Assessments List');
  });

  test('assessment detail has no WCAG 2.1 AA violations @a11y', async ({
    page,
  }) => {
    await auditAtViewports(
      page,
      `/a/me/assessments/${assessmentId}`,
      'A+ Assessment Detail',
    );
  });
});

// ---------------------------------------------------------------------------
// Group 6: Engagement + dashboard
// ---------------------------------------------------------------------------

test.describe('A+ a11y — engagement + dashboard @a11y', () => {
  test('daily dose has no WCAG 2.1 AA violations @a11y', async ({ page }) => {
    await auditAtViewports(page, '/a/daily-dose', 'A+ Daily Dose');
  });

  test('dashboard has no WCAG 2.1 AA violations @a11y', async ({ page }) => {
    await auditAtViewports(page, '/a/dashboard', 'A+ Dashboard');
  });
});

// ---------------------------------------------------------------------------
// Group 7: Knowledge graph (under /me prefix — shared across surfaces)
// ---------------------------------------------------------------------------

test.describe('A+ a11y — knowledge graph @a11y', () => {
  test('knowledge graph canvas has no WCAG 2.1 AA violations @a11y', async ({
    page,
  }) => {
    await auditAtViewports(page, '/me/knowledge-graph', 'A+ Knowledge Graph');
  });

  test('knowledge graph manage view has no WCAG 2.1 AA violations @a11y', async ({
    page,
  }) => {
    await auditAtViewports(
      page,
      '/me/knowledge-graph/manage',
      'A+ Knowledge Graph Manage',
    );
  });
});

// ---------------------------------------------------------------------------
// Group 8: Familiar RPG companion
// ---------------------------------------------------------------------------

test.describe('A+ a11y — familiar @a11y', () => {
  const familiarId = SEEDED_IDS.familiarId;

  test('familiar profile has no WCAG 2.1 AA violations @a11y', async ({
    page,
  }) => {
    await auditAtViewports(page, '/a/companion', 'A+ Familiar Profile');
  });

  test('familiar marketplace has no WCAG 2.1 AA violations @a11y', async ({
    page,
  }) => {
    await auditAtViewports(
      page,
      '/a/companion/marketplace',
      'A+ Familiar Marketplace',
    );
  });

  test('familiar chat has no WCAG 2.1 AA violations @a11y', async ({
    page,
  }) => {
    await auditAtViewports(
      page,
      `/a/companion/${familiarId}/chat`,
      'A+ Familiar Chat',
    );
  });

  test('familiar growth log has no WCAG 2.1 AA violations @a11y', async ({
    page,
  }) => {
    await auditAtViewports(
      page,
      `/a/companion/${familiarId}/growth-log`,
      'A+ Familiar Growth Log',
    );
  });
});

// ---------------------------------------------------------------------------
// Group 9: routes that WERE planned and are now live.
//
// All three were skipped with "enable once route is live". All three are live,
// checked against aplus.routes.ts rather than assumed: search and atom
// revisions load real components, and /a/collections is a pathMatch:'full'
// redirect to the study mount, so this audits the mount directly instead of
// asserting through the hop.
//
// They were skipped for as long as the whole suite was uncollected, so nothing
// ever pointed out that the condition had been met. That is the same failure
// as the missing project, one level down: a skip with no expiry, in a file
// nothing ran.
// ---------------------------------------------------------------------------

test.describe('A+ a11y, formerly planned routes @a11y', () => {
  test('collections list has no WCAG 2.1 AA violations @a11y', async ({
    page,
  }) => {
    await auditAtViewports(page, '/a/study/collections', 'A+ Collections');
  });

  test('atom revisions list has no WCAG 2.1 AA violations @a11y', async ({
    page,
  }) => {
    await auditAtViewports(
      page,
      `/a/atoms/${SEEDED_IDS.atomId}/revisions`,
      'A+ Atom Revisions',
    );
  });

  test('search results has no WCAG 2.1 AA violations @a11y', async ({
    page,
  }) => {
    await auditAtViewports(page, '/a/search', 'A+ Search');
  });
});
