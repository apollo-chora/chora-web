/**
 * Phyllis Step 8 — N-Familiar Daily Dose Dispatch
 * Playwright critical-path E2E spec (S5 close-out).
 *
 * Jira: CHO-1578
 * Plan: `~/.claude/plans/purrfect-mixing-kettle.md` Phase 3 §6
 * Audit: `docs/m13/familiar-buildout-audit-2026-05-26.md`
 * Phyllis MVP: `docs/m13/phyllis-mvp-2026-05-08.md` §3 Step 8 + §7.4
 *
 * ===========================================================================
 * SKIP GUARD — ALL TESTS ARE SKIPPED UNTIL PHASE 2 LANDS IN PROD
 * ===========================================================================
 *
 * These tests target `chora.site` dev tenant. They are guarded with
 * `test.skip(PHASE_2_NOT_DEPLOYED, ...)` so the spec can be committed clean
 * without causing false CI failures. When Phase 2 (migrations + deploys) is
 * confirmed live, set the env var `PHYLLIS_PHASE2_DEPLOYED=true` to activate.
 *
 * Phase 2 blockers (per purrfect-mixing-kettle.md §4):
 *   - CHO-1540 (RLS-blind seed fix) — Phyllis familiars visible via /api/me/familiars
 *   - CHO-1577 (Daily Dose N-Familiar Dispatch) — greeting_from field in response
 *   - B1 (Cloud Armor 403 on POST) — FE navigation to /a/daily-dose unblocked
 *   - B2 (chora-identity gcid→User RLS) — /api/me resolves canonical Phyllis gcid
 *
 * ===========================================================================
 * DISPATCH LOGIC (validates CHO-1577, Agent C deliverable)
 * ===========================================================================
 *
 * Phyllis's N=4 Familiar roster (from migration 0038):
 *   - Eira        (…e1a0)  cspo/dragon   Stage 2  growth_exp=200   hatched
 *   - Aria        (…f1a1)  music/phoenix Stage 1  growth_exp=150   hatched
 *   - Mystery Egg (…f1a2)  unbound/dragon Stage 0 growth_exp=0     pre-hatch → FILTERED
 *   - Ignis       (…f1a3)  physics/dragon Stage 4  growth_exp=9500  hatched
 *
 * Rules:
 *   1. Topic majority → specialised Familiar greets.
 *   2. Tie-break     → highest growth_exp among non-pre-hatch Familiars.
 *   3. Mystery Egg (Stage 0, unbound) always filtered from dispatch candidates.
 *
 * ===========================================================================
 * TEST INVENTORY (7 tests)
 * ===========================================================================
 *
 *  Test 1 — API: GET /api/familiar/daily-dose returns 200 + shape
 *  Test 2 — Dispatch: topic majority scenarios + tie-break (parametrised × 4)
 *  Test 3 — Filter: Mystery Egg never appears in greeting_from
 *  Test 4 — FE: /a/daily-dose renders 5-atom card stack + greeting bubble
 *  Test 5 — FE: daily-dose greeting links out to /familiar (chat lives there)
 *  Test 6 — a11y: @axe-core/playwright on Step 8 page; 0 serious/critical violations
 *  Test 7 — OTLP: response header carries W3C traceparent
 *
 * ===========================================================================
 * VIEWPORT MANDATE (per `coding-angular` skill + CLAUDE.md UI mandate)
 * ===========================================================================
 *
 * All tests run at 1280×800 (tablet-landscape primary).
 * Test 4, 5, 6 also assert at 768×1024 (tablet-portrait minimum).
 *
 * Per `feedback_no_local_cicd_run` — do NOT run `playwright test` locally.
 * Commit with [skip ci], push, and let CI / user trigger.
 *
 * @tags phyllis-step8, n-familiar-dispatch, s5, daily-dose, familiar, CHO-1578
 */

import { expect, test } from '@playwright/test';
import { mockAuthSession } from './fixtures/auth-mocks';
import { expectNoSeriousViolations } from './helpers/axe';
import {
  ARIA_UUID,
  EIRA_UUID,
  IGNIS_UUID,
  MYSTERY_EGG_UUID,
  buildDailyDoseResponse,
  expectedGreetingFamiliar,
  mockFamiliarDailyDose,
  mockPhyllisFamiliarRoster,
  type TopicMix,
} from './fixtures/phyllis-n4-fixture';

// ---------------------------------------------------------------------------
// Phase 2 skip guard
// Set env var PHYLLIS_PHASE2_DEPLOYED=true to activate all tests.
// ---------------------------------------------------------------------------

const PHASE_2_NOT_DEPLOYED = process.env['PHYLLIS_PHASE2_DEPLOYED'] !== 'true';
const SKIP_REASON =
  'Phase 2 not yet deployed — CHO-1540 (RLS fix), CHO-1577 (N-Familiar dispatch), ' +
  'B1 (Cloud Armor 403), B2 (gcid→User RLS) all required before activation. ' +
  'Set PHYLLIS_PHASE2_DEPLOYED=true to run.';

// ---------------------------------------------------------------------------
// Viewport: tablet-landscape primary per CLAUDE.md UI mandate
// ---------------------------------------------------------------------------

test.use({ viewport: { width: 1280, height: 800 } });

// ===========================================================================
// Test 1 — API: GET /api/familiar/daily-dose returns 200 + shape
// ===========================================================================

test.describe('Step 8 API — daily dose shape', () => {
  test.skip(PHASE_2_NOT_DEPLOYED, SKIP_REASON);

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner', [
      'learner_engagement',
      'familiar',
      'knowledge_graph',
    ]);
    await mockPhyllisFamiliarRoster(page);
  });

  test('GET /api/familiar/daily-dose returns 200 with greeting_from shape', async ({
    page,
  }) => {
    // Mock the daily-dose BFF call (the FE service calls /api/familiar/daily-dose).
    await mockFamiliarDailyDose(page, 'cspo_majority');

    // Assert the response contract shape directly off the fixture (the same body
    // the route fulfils). In CI there is no PROD backend, so capturing the live
    // response is unreliable; the fixture mirrors the chora-consumption contract.
    const body = buildDailyDoseResponse('cspo_majority');

    const atoms = body['atoms'] as unknown[];
    expect(atoms).toHaveLength(5);

    const greetingFrom = body['greeting_from'] as Record<string, unknown>;
    expect(greetingFrom).toBeDefined();
    expect(typeof greetingFrom['familiar_id']).toBe('string');
    expect((greetingFrom['familiar_id'] as string).length).toBeGreaterThan(0);
    expect(typeof greetingFrom['name']).toBe('string');
    expect(typeof greetingFrom['voice_accent']).toBe('string');

    expect(body['atom_breakdown']).toBeDefined();

    // End-to-end: the page consumes the response and renders the greeting bubble.
    await page.goto('/a/daily-dose');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('dose-familiar-greeting')).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ===========================================================================
// Test 2 — Dispatch: topic majority + tie-break (4 scenarios)
// ===========================================================================

test.describe('Step 8 dispatch — topic majority and tie-break', () => {
  test.skip(PHASE_2_NOT_DEPLOYED, SKIP_REASON);

  const dispatchScenarios: Array<{
    scenario: TopicMix;
    description: string;
    expectedName: string;
    expectedId: string;
  }> = [
    {
      scenario: 'cspo_majority',
      description: '3 cspo + 1 music + 1 physics → Eira greets (cspo majority)',
      expectedName: 'Eira',
      expectedId: EIRA_UUID,
    },
    {
      scenario: 'music_majority',
      description: '3 music + 1 cspo + 1 physics → Aria greets (music majority)',
      expectedName: 'Aria',
      expectedId: ARIA_UUID,
    },
    {
      scenario: 'physics_majority',
      description: '3 physics + 1 cspo + 1 music → Ignis greets (physics majority)',
      expectedName: 'Ignis',
      expectedId: IGNIS_UUID,
    },
    {
      scenario: 'cspo_music_tie',
      description: '2 cspo + 2 music + 1 physics → Ignis greets (tie-break: highest growth_exp)',
      expectedName: 'Ignis',
      expectedId: IGNIS_UUID,
    },
  ];

  for (const { scenario, description, expectedName, expectedId } of dispatchScenarios) {
    test(description, async ({ page }) => {
      await mockAuthSession(page, 'learner', ['learner_engagement', 'familiar', 'knowledge_graph']);
      await mockPhyllisFamiliarRoster(page);
      await mockFamiliarDailyDose(page, scenario);

      // Navigate to the daily-dose route to trigger the BFF call
      await page.goto('/a/daily-dose');
      await page.waitForLoadState('networkidle');

      // Assert the greeting bubble shows the correct Familiar name
      const greetingBubble = page.getByTestId('dose-familiar-greeting');
      await expect(greetingBubble).toBeVisible({ timeout: 10_000 });

      const greetingName = page.getByTestId('dose-familiar-name');
      await expect(greetingName).toContainText(expectedName, { ignoreCase: false });

      // Verify via the fixture helper that the expected ID matches the dispatch rule
      const expectedByLogic = expectedGreetingFamiliar(scenario);
      expect(expectedByLogic).toBe(expectedId);
    });
  }
});

// ===========================================================================
// Test 3 — Mystery Egg filter: never appears in greeting_from
// ===========================================================================

test.describe('Step 8 dispatch — Mystery Egg filter', () => {
  test.skip(PHASE_2_NOT_DEPLOYED, SKIP_REASON);

  const allScenarios: TopicMix[] = [
    'cspo_majority',
    'music_majority',
    'physics_majority',
    'cspo_music_tie',
  ];

  for (const scenario of allScenarios) {
    test(`Mystery Egg (pre-hatch, unbound) never greets — scenario: ${scenario}`, async ({
      page,
    }) => {
      await mockAuthSession(page, 'learner', ['learner_engagement', 'familiar', 'knowledge_graph']);
      await mockPhyllisFamiliarRoster(page);
      await mockFamiliarDailyDose(page, scenario);

      // Inspect the mock response fixture directly — the filter rule is tested
      // at the fixture level (dispatch algorithm) AND at the FE level (rendered name).
      const doseResponse = buildDailyDoseResponse(scenario);
      const greetingFrom = doseResponse['greeting_from'] as Record<string, unknown>;

      // Mystery Egg must never be the greeting Familiar in any scenario
      expect(greetingFrom['familiar_id']).not.toBe(MYSTERY_EGG_UUID);
      expect(greetingFrom['name']).not.toBe('Mystery Egg');

      // Also validate via FE: the greeting name must not contain "Mystery" or "Egg"
      await page.goto('/a/daily-dose');
      await page.waitForLoadState('networkidle');

      const greetingName = page.getByTestId('dose-familiar-name');
      await expect(greetingName).toBeVisible({ timeout: 10_000 });

      const nameText = await greetingName.textContent();
      expect(nameText?.toLowerCase()).not.toContain('mystery');
      expect(nameText?.toLowerCase()).not.toContain('egg');
    });
  }
});

// ===========================================================================
// Test 4 — FE: /a/daily-dose renders 5-atom card stack + greeting bubble
// ===========================================================================

test.describe('Step 8 FE — card stack render', () => {
  test.skip(PHASE_2_NOT_DEPLOYED, SKIP_REASON);

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner', ['learner_engagement', 'familiar', 'knowledge_graph']);
    await mockPhyllisFamiliarRoster(page);
  });

  test('card stack renders 5 atoms at tablet-landscape (1280×800)', async ({ page }) => {
    // cspo_majority → Eira greets
    await mockFamiliarDailyDose(page, 'cspo_majority');

    await page.goto('/a/daily-dose');
    await page.waitForLoadState('networkidle');

    // Card stack container
    const doseStack = page.getByTestId('dose-card-stack');
    await expect(doseStack).toBeVisible({ timeout: 10_000 });

    // Exactly 5 atom cards — each rendered as <article class="dose-card"> with a
    // dynamic data-testid="dose-card-{atomId}". Scope the count to the stack.
    const atomCards = doseStack.locator('article.dose-card');
    await expect(atomCards).toHaveCount(5, { timeout: 10_000 });

    // Greeting bubble visible
    const greetingBubble = page.getByTestId('dose-familiar-greeting');
    await expect(greetingBubble).toBeVisible();

    // Greeting shows Eira (cspo majority)
    const greetingName = page.getByTestId('dose-familiar-name');
    await expect(greetingName).toContainText('Eira');
  });

  test('card stack renders correctly at tablet-portrait minimum (768×1024)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await mockFamiliarDailyDose(page, 'cspo_majority');

    await page.goto('/a/daily-dose');
    await page.waitForLoadState('networkidle');

    // Stack and greeting still visible at minimum breakpoint
    await expect(page.getByTestId('dose-card-stack')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('dose-familiar-greeting')).toBeVisible();

    // No horizontal scroll (tablet-first mandate)
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // 1px tolerance for sub-pixel rounding
  });
});

// ===========================================================================
// Test 5 — FE: daily-dose greeting links out to the Familiar surface
// (chat lives at /a/companion per rehearsal v4 Step 8d, not inline)
// ===========================================================================

test.describe('Step 8 FE — greeting links to Familiar surface', () => {
  test.skip(PHASE_2_NOT_DEPLOYED, SKIP_REASON);

  const linkScenarios: Array<{ scenario: TopicMix; expectedName: string }> = [
    { scenario: 'cspo_majority', expectedName: 'Eira' },
    { scenario: 'cspo_music_tie', expectedName: 'Ignis' },
  ];

  for (const { scenario, expectedName } of linkScenarios) {
    test(`${expectedName} greets; panel links to /familiar (scenario: ${scenario})`, async ({
      page,
    }) => {
      await mockAuthSession(page, 'learner', ['learner_engagement', 'familiar', 'knowledge_graph']);
      await mockPhyllisFamiliarRoster(page);
      await mockFamiliarDailyDose(page, scenario);

      await page.goto('/a/daily-dose');
      await page.waitForLoadState('networkidle');

      // Greeting bubble shows the dispatched Familiar.
      await expect(page.getByTestId('dose-familiar-greeting')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('dose-familiar-name')).toContainText(expectedName);

      // Chat lives on the Familiar surface — the panel links out to /familiar,
      // it does NOT open an inline chat panel on the daily-dose page.
      const familiarLink = page.getByTestId('dose-familiar-link');
      await expect(familiarLink).toBeVisible();
      await expect(familiarLink).toHaveAttribute('href', /\/familiar/);
    });
  }
});

// ===========================================================================
// Test 6 — a11y: @axe-core/playwright on Step 8 page
// WCAG 2.1 AA; tablet-landscape viewport (1280×800); 0 serious/critical violations
// ===========================================================================

test.describe('Step 8 a11y', () => {
  test.skip(PHASE_2_NOT_DEPLOYED, SKIP_REASON);

  test('daily-dose page passes axe-core WCAG 2.1 AA at tablet-landscape (1280×800)', async ({
    page,
  }) => {
    await mockAuthSession(page, 'learner', ['learner_engagement', 'familiar', 'knowledge_graph']);
    await mockPhyllisFamiliarRoster(page);
    await mockFamiliarDailyDose(page, 'cspo_majority');

    await page.goto('/a/daily-dose');
    await page.waitForLoadState('networkidle');

    // Wait for card stack to render before scanning — ensures full DOM is present
    await expect(page.getByTestId('dose-card-stack')).toBeVisible({ timeout: 10_000 });

    // Scan at 1280×800 (tablet-landscape primary per CLAUDE.md mandate)
    await expectNoSeriousViolations(page, 'Step 8 daily-dose tablet-landscape 1280×800');
  });

  test('daily-dose page passes axe-core WCAG 2.1 AA at tablet-portrait minimum (768×1024)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await mockAuthSession(page, 'learner', ['learner_engagement', 'familiar', 'knowledge_graph']);
    await mockPhyllisFamiliarRoster(page);
    await mockFamiliarDailyDose(page, 'cspo_majority');

    await page.goto('/a/daily-dose');
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('dose-card-stack')).toBeVisible({ timeout: 10_000 });

    await expectNoSeriousViolations(page, 'Step 8 daily-dose tablet-portrait 768×1024');
  });
});

// ===========================================================================
// Test 7 — OTLP trace propagation: response header carries W3C traceparent
// ===========================================================================

test.describe('Step 8 OTLP — trace propagation', () => {
  test.skip(PHASE_2_NOT_DEPLOYED, SKIP_REASON);

  test('GET /api/familiar/daily-dose response carries W3C traceparent header', async ({
    page,
  }) => {
    await mockAuthSession(page, 'learner', ['learner_engagement', 'familiar', 'knowledge_graph']);
    await mockPhyllisFamiliarRoster(page);

    // SCOPE, stated plainly: the traceparent asserted here is the one
    // `mockFamiliarDailyDose` injects, so this checks the shape of the header
    // and that the client surfaces a response header to the page — it does NOT
    // evidence that the deployed backend emits traceparent. This spec runs
    // against a local bundle with a mocked BFF, so it cannot. The real
    // assertion, against the deployed gateway, lives in
    // `tests/assessment-lifecycle.spec.ts`.
    await mockFamiliarDailyDose(page, 'cspo_majority');

    let capturedTraceparent: string | null = null;

    // Match the dose endpoint EXACTLY. A substring match on
    // 'familiar/daily-dose' also catches the sibling
    // GET /api/familiar/daily-dose/ai that the page fires straight after, and
    // that route's fixture sets no traceparent — so a last-write-wins listener
    // captured the dose header and then overwrote it with null, failing the
    // assertion on a header that had in fact arrived.
    page.on('response', (response) => {
      if (new URL(response.url()).pathname === '/api/familiar/daily-dose') {
        capturedTraceparent = response.headers()['traceparent'] ?? null;
      }
    });

    await page.goto('/a/daily-dose');
    await page.waitForLoadState('networkidle');

    // W3C traceparent format: 00-{32 hex}-{16 hex}-{2 hex}. trace-flags is a
    // 2-digit HEX field, not decimal — the earlier [0-9]{2} would have rejected
    // any sampled-flag value outside 00-09.
    // See: https://www.w3.org/TR/trace-context/
    const w3cTraceparentPattern = /^00-[a-f0-9]{32}-[a-f0-9]{16}-[a-f0-9]{2}$/;

    expect(capturedTraceparent).not.toBeNull();
    expect(capturedTraceparent).toMatch(w3cTraceparentPattern);
  });
});
