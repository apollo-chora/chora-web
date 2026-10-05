/**
 * Phyllis A+ Learner Journey — E2E spec @phyllis-aplus
 *
 * Canonical 8-step end-to-end coverage for the A+ surface learner journey.
 * Steps 2/3/4 (atom authoring) are EXCLUDED per WS-9 scope — those are
 * owned by the author-flow workstream.
 *
 * Steps exercised:
 *   Step 1  /a/login          — passkey sign-in page renders; session minted
 *   Step 5  /a/catalog        — public course catalog renders >= 1 course
 *   Step 6  /a/courses/:id    — course detail + enrol CTA; enrol → enrolled landing
 *   Step 7  /a/atoms/:id/play — atomic session (DEGRADED state per A16 blocker)
 *   Step 8  /a/daily-dose     — daily dose carousel renders >= 1 dose card
 *
 * Conventions:
 *   - NO mocks — real BFF via PLAYWRIGHT_BASE_URL (per feedback_no_stubs_real_wiring).
 *   - E2E_TEST_TOKEN env var mandatory — fails loud if absent (see fixtures/auth.ts).
 *   - Tablet-first viewport: 1024x768 (iPad portrait) primary.
 *   - Desktop viewport: 1440x900 secondary (separate project in playwright.config.ts).
 *   - Screenshots saved to tests/e2e/aplus/screenshots/ for visual baseline.
 *   - Tag @phyllis-aplus for filtered CI runs.
 *
 * CI: trigger via Cloud Build — do NOT auto-run on commit (per feedback_cicd_no_mass_trip).
 * Local run (explicit manual only per feedback_no_local_cicd_run):
 *   PLAYWRIGHT_BASE_URL=https://chora.site E2E_TEST_TOKEN=xxx \
 *     npx playwright test --grep @phyllis-aplus --config=playwright.config.ts
 */

import { expect, test } from '@playwright/test';
import { mintSession } from './fixtures/auth';
import {
  CATALOG_MIN_COURSE_COUNT,
  DAILY_DOSE_MIN_CARD_COUNT,
  SEEDED_ATOM_ID,
  SEEDED_COURSE_ID,
} from './fixtures/test-data';
import path from 'path';

// ---------------------------------------------------------------------------
// Screenshot helper
// ---------------------------------------------------------------------------

async function takeStepScreenshot(
  page: import('@playwright/test').Page,
  stepLabel: string,
): Promise<void> {
  const filename = `${stepLabel}.png`;
  const dir = path.join(__dirname, 'screenshots');
  await page.screenshot({
    path: path.join(dir, filename),
    fullPage: false,
  });
}

// ---------------------------------------------------------------------------
// Journey test
// ---------------------------------------------------------------------------

test.describe('A+ Phyllis learner journey @phyllis-aplus', () => {
  test.use({
    viewport: { width: 1024, height: 768 },
  });

  // Session is minted once before the single journey test runs.
  // The BFF sets an HttpOnly session cookie that persists for the test.
  test.beforeAll(async ({ browser }) => {
    // Verify env var early — fail loud before any navigation.
    const token = process.env['E2E_TEST_TOKEN'];
    if (!token) {
      throw new Error(
        'E2E_TEST_TOKEN is not set. ' +
          'Set it to a valid Firebase ID token for the allowlisted test account ' +
          'before running @phyllis-aplus specs.',
      );
    }
    // Context is per-worker; the actual mint happens in beforeEach below
    // so the cookie lands in the correct page context.
    void browser; // referenced to satisfy linter — browser arg is unused here
  });

  test.beforeEach(async ({ page }) => {
    await mintSession(page);
  });

  // -------------------------------------------------------------------------
  // Full journey: Step 1 → 5 → 6 → 7 → 8
  // -------------------------------------------------------------------------

  test('A+ Phyllis learner journey Step 1->5->6->7->8 @phyllis-aplus', async ({ page }) => {
    // -----------------------------------------------------------------------
    // Step 1 — Login page renders
    // -----------------------------------------------------------------------
    await test.step('Step 1: login page renders and session is authenticated', async () => {
      await page.goto('/a/login');
      await page.waitForLoadState('domcontentloaded');

      // The login page must render its container.
      // data-testid is `aplus-login-page` per aplus-login.component.html.
      const loginPage = page.getByTestId('aplus-login-page');
      await expect(loginPage, 'Step 1: aplus-login-page container must be visible').toBeVisible({
        timeout: 15_000,
      });

      // At minimum one federated IdP button must render.
      const googleBtn = page.getByTestId('aplus-login-google-btn');
      await expect(googleBtn, 'Step 1: Google sign-in button must be visible').toBeVisible();

      await takeStepScreenshot(page, 'step-01-login');

      // After mintSession, the BFF session cookie is set. Navigate to the
      // protected landing; the authGuard should admit the user without
      // redirecting back to /a/login.
      await page.goto('/a/dashboard');
      await page.waitForLoadState('domcontentloaded');

      // The page must NOT redirect back to login — URL still on /a/dashboard
      // (or any non-login route following a successful session cookie mint).
      await expect(
        page,
        'Step 1: authenticated session must reach /a/dashboard without redirect to login',
      ).not.toHaveURL(/\/a\/login/);

      await takeStepScreenshot(page, 'step-01-authenticated-landing');
    });

    // -----------------------------------------------------------------------
    // Step 5 — Catalog renders >= 1 course
    // -----------------------------------------------------------------------
    await test.step('Step 5: catalog renders at least 1 course', async () => {
      await page.goto('/a/catalog');
      await page.waitForLoadState('domcontentloaded');

      // Wait for the catalog container to appear.
      // data-testid: `catalog-container` per catalog.component.html.
      const catalogContainer = page.getByTestId('catalog-container');
      await expect(
        catalogContainer,
        'Step 5: catalog-container must be visible',
      ).toBeVisible({ timeout: 20_000 });

      // At least CATALOG_MIN_COURSE_COUNT course cards must render.
      // data-testid: `course-card` per catalog course-card template.
      const courseCards = page.getByTestId('course-card');
      const cardCount = await courseCards.count();
      expect(
        cardCount,
        `Step 5: catalog must render >= ${CATALOG_MIN_COURSE_COUNT} course card(s); got ${cardCount}`,
      ).toBeGreaterThanOrEqual(CATALOG_MIN_COURSE_COUNT);

      await takeStepScreenshot(page, 'step-05-catalog');
    });

    // -----------------------------------------------------------------------
    // Step 6 — Course detail → Enrol CTA → Enrolled landing → Learn shell
    // -----------------------------------------------------------------------
    await test.step('Step 6: course detail shows enrol CTA', async () => {
      await page.goto(`/a/courses/${SEEDED_COURSE_ID}`);
      await page.waitForLoadState('domcontentloaded');

      // Course detail container.
      // data-testid: `course-detail` per course-detail.component.html.
      const courseDetail = page.getByTestId('course-detail');
      await expect(
        courseDetail,
        'Step 6: course-detail container must be visible',
      ).toBeVisible({ timeout: 20_000 });

      // Enrol button must be present.
      // data-testid: `enrol-btn` per course-detail.component.html.
      const enrolBtn = page.getByTestId('enrol-btn');
      await expect(enrolBtn, 'Step 6: enrol-btn must be visible on course detail').toBeVisible();

      await takeStepScreenshot(page, 'step-06-course-detail');
    });

    await test.step('Step 6: clicking enrol leads to Stripe Checkout URL or enrolled landing', async () => {
      // Navigate fresh to course detail in case a prior step left the page elsewhere.
      await page.goto(`/a/courses/${SEEDED_COURSE_ID}`);
      await page.waitForLoadState('domcontentloaded');

      const enrolBtn = page.getByTestId('enrol-btn');
      await expect(enrolBtn, 'Step 6 enrol: enrol-btn must be visible before click').toBeVisible({
        timeout: 15_000,
      });

      // Listen for navigation events — either:
      //   (a) Stripe Checkout redirect: URL starts with https://checkout.stripe.com/
      //   (b) Free enrol direct: URL matches /a/courses/:id/enrolled
      let navigatedUrl: string | null = null;
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) {
          navigatedUrl = frame.url();
        }
      });

      await enrolBtn.click();

      // Wait up to 15s for the post-enrol navigation.
      await page.waitForURL(
        (url) =>
          url.toString().includes('/enrolled') ||
          url.toString().includes('checkout.stripe.com') ||
          url.toString().includes('/a/courses/'),
        { timeout: 15_000 },
      );

      const currentUrl = page.url();

      const isStripeCheckout = currentUrl.includes('checkout.stripe.com');
      const isEnrolledLanding = currentUrl.includes('/enrolled');
      const isLearnShell = currentUrl.includes('/learn');

      expect(
        isStripeCheckout || isEnrolledLanding || isLearnShell,
        `Step 6 enrol: post-enrol URL must be Stripe Checkout, /enrolled, or /learn — got ${currentUrl}`,
      ).toBe(true);

      void navigatedUrl; // captured for debugging; not asserted directly

      await takeStepScreenshot(page, 'step-06-post-enrol');

      // If we landed on /enrolled, verify the enrolled-success component renders.
      if (isEnrolledLanding) {
        // data-testid: `enrolment-success` per course-enrolment-success.component.html.
        const successBanner = page.getByTestId('enrolment-success');
        await expect(
          successBanner,
          'Step 6 enrolled: enrolment-success banner must be visible after free enrol',
        ).toBeVisible({ timeout: 10_000 });

        // The "Start Learning" / learn shell link must appear.
        // data-testid: `start-learning-btn` per course-enrolment-success.component.html.
        const startBtn = page.getByTestId('start-learning-btn');
        await expect(
          startBtn,
          'Step 6 enrolled: start-learning-btn must be visible',
        ).toBeVisible();

        await takeStepScreenshot(page, 'step-06-enrolled-landing');
      }
    });

    // -----------------------------------------------------------------------
    // Step 7 — Atomic Session — A16 UNBLOCKED (WS-0b + WS-1)
    //
    // WS-0b landed question_payload on GET /api/atoms/{id} (commits
    // 37d182f8 + 1c7f4d74 + 1659bef6). WS-1 restores MCQ/OE rendering in
    // the component. This assertion was previously DEGRADED-mode (expecting
    // 0 MCQ options); it is now re-tagged to expect MCQ options DO render
    // for the seeded MCQ atom (SEEDED_ATOM_ID).
    //
    // ASSERTION CONTRACT (post-A16):
    //   PASS  → atomic-session container visible + MCQ options present (>= 2)
    //   FAIL  → container not visible (BFF/network error)
    //   FAIL  → 0 MCQ options (A16 regression — question_payload stripped)
    // -----------------------------------------------------------------------
    await test.step('Step 7: atomic session renders MCQ options (A16 unblocked — WS-1)', async () => {
      await page.goto(`/a/atoms/${SEEDED_ATOM_ID}/play`);
      await page.waitForLoadState('domcontentloaded');

      // The atomic session root container must render.
      // data-testid: `aplus-atomic-session` per atomic-session.component.html.
      const sessionContainer = page.getByTestId('aplus-atomic-session');
      await expect(
        sessionContainer,
        'Step 7: aplus-atomic-session container must be visible',
      ).toBeVisible({ timeout: 20_000 });

      // Atom title must be present — confirms load success branch.
      // data-testid: `atomic-session-title` per atomic-session.component.html.
      const atomTitle = page.getByTestId('atomic-session-title');
      await expect(
        atomTitle,
        'Step 7: atomic-session-title must be visible after successful atom load',
      ).toBeVisible({ timeout: 15_000 });

      await takeStepScreenshot(page, 'step-07-atomic-session-a16-unblocked');

      // MCQ option buttons MUST be present — A16 has landed.
      // data-testid: `atomic-session-mcq-opt-0` … per MCQ renderer template.
      // The seeded atom (SEEDED_ATOM_ID) is an MCQ atom with >= 2 options.
      const mcqOpt0 = page.getByTestId('atomic-session-mcq-opt-0');
      await expect(
        mcqOpt0,
        'Step 7: MCQ option 0 must be visible — A16 question_payload present in BFF response',
      ).toBeVisible({ timeout: 10_000 });

      // Confirm at least 2 options render (MCQ requires minItems: 2 per contract).
      const mcqOpt1 = page.getByTestId('atomic-session-mcq-opt-1');
      await expect(
        mcqOpt1,
        'Step 7: MCQ option 1 must be visible — at least 2 options per MCQ contract invariant',
      ).toBeVisible();

      // Positional markers (A/B/…) must be present.
      const markers = page.getByTestId('mcq-opt-marker');
      const markerCount = await markers.count();
      expect(
        markerCount,
        `Step 7: mcq-opt-marker elements must be >= 2; got ${markerCount}`,
      ).toBeGreaterThanOrEqual(2);

      // MCQ question block container must be present.
      const mcqBlock = page.getByTestId('atomic-session-mcq-question');
      await expect(
        mcqBlock,
        'Step 7: atomic-session-mcq-question block must be visible',
      ).toBeVisible();

      await takeStepScreenshot(page, 'step-07-atomic-session-mcq-options-visible');
    });

    // -----------------------------------------------------------------------
    // Step 8 — Daily Dose carousel renders >= 1 dose card
    // -----------------------------------------------------------------------
    await test.step('Step 8: daily dose carousel renders at least 1 dose card', async () => {
      await page.goto('/a/daily-dose');
      await page.waitForLoadState('domcontentloaded');

      // Daily dose container.
      // data-testid: `daily-dose` per daily-dose.component.html.
      const doseContainer = page.getByTestId('daily-dose');
      await expect(
        doseContainer,
        'Step 8: daily-dose container must be visible',
      ).toBeVisible({ timeout: 20_000 });

      // Dose stack / carousel must be visible.
      // data-testid: `dose-stack` per daily-dose.component.html.
      const doseStack = page.getByTestId('dose-stack');
      await expect(doseStack, 'Step 8: dose-stack carousel must be visible').toBeVisible({
        timeout: 10_000,
      });

      // At least DAILY_DOSE_MIN_CARD_COUNT dose cards must render.
      // data-testid: `dose-current-card` per daily-dose.component.html.
      // Note: the carousel renders one "current" card; count checks the visible item.
      const currentCard = page.getByTestId('dose-current-card');
      await expect(
        currentCard,
        `Step 8: dose-current-card must render (>= ${DAILY_DOSE_MIN_CARD_COUNT} card expected)`,
      ).toBeVisible();

      // Verify card title is non-empty (real data present, not empty placeholder).
      // data-testid: `card-title` per daily-dose card template.
      const cardTitle = page.getByTestId('card-title');
      const titleVisible = await cardTitle.isVisible();
      if (titleVisible) {
        const titleText = await cardTitle.textContent();
        expect(
          (titleText ?? '').trim().length,
          'Step 8: card-title must have non-empty text — data from GET /api/familiar/daily-dose',
        ).toBeGreaterThan(0);
      }

      await takeStepScreenshot(page, 'step-08-daily-dose');

      // Verify DAILY_DOSE_MIN_CARD_COUNT is satisfied.
      // The carousel counter (data-testid: `dose-counter`) shows total available.
      // If present, parse it; if absent, we already confirmed current-card renders.
      const counter = page.getByTestId('dose-counter');
      if (await counter.isVisible()) {
        const counterText = await counter.textContent();
        // Format varies ("1/5", "Atom 1 of 5", etc.) — extract first integer.
        const match = (counterText ?? '').match(/(\d+)/);
        if (match) {
          const totalCards = parseInt(match[1]!, 10);
          expect(
            totalCards,
            `Step 8: dose counter shows ${totalCards} card(s); need >= ${DAILY_DOSE_MIN_CARD_COUNT}`,
          ).toBeGreaterThanOrEqual(DAILY_DOSE_MIN_CARD_COUNT);
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Desktop viewport variant — secondary project (1440x900)
// Registered in playwright.config.ts under the `phyllis-aplus-desktop` project.
// Same assertions; separate screenshots for visual baseline comparison.
// ---------------------------------------------------------------------------

test.describe('A+ Phyllis learner journey — desktop 1440x900 @phyllis-aplus', () => {
  test.use({
    viewport: { width: 1440, height: 900 },
  });

  test.beforeEach(async ({ page }) => {
    await mintSession(page);
  });

  test('A+ Phyllis Step 5 catalog renders on desktop viewport @phyllis-aplus', async ({ page }) => {
    await page.goto('/a/catalog');
    await page.waitForLoadState('domcontentloaded');

    const catalogContainer = page.getByTestId('catalog-container');
    await expect(
      catalogContainer,
      'Desktop Step 5: catalog-container must be visible at 1440x900',
    ).toBeVisible({ timeout: 20_000 });

    const courseCards = page.getByTestId('course-card');
    const cardCount = await courseCards.count();
    expect(
      cardCount,
      `Desktop Step 5: catalog must render >= ${CATALOG_MIN_COURSE_COUNT} course card(s) at 1440x900; got ${cardCount}`,
    ).toBeGreaterThanOrEqual(CATALOG_MIN_COURSE_COUNT);

    await takeStepScreenshot(page, 'step-05-catalog-desktop-1440x900');
  });
});
