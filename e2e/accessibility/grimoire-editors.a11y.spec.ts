/**
 * Accessibility audit for the Grimoire's two editors (D1).
 *
 * ⚠⚠ WHY THIS FILE IS HERE AND NOT IN `tests/a11y/aplus/`.
 *
 * That directory holds a 280-line per-route A+ audit that CANNOT RUN. No
 * project in `playwright.config.ts` has a `testDir` covering `tests/a11y/`
 * (the root is `./e2e`, and the only overrides point at `./tests/e2e/aplus`),
 * and the project its own header tells CI to use, "A11y Tablet", exists
 * nowhere in the repo. `npx playwright test --list` on that file collects zero
 * tests. Adding a route there would have been a green tick over a suite that
 * never executes, which is worse than no audit because it reads as coverage.
 *
 * `e2e/accessibility/` is the suite that is actually collected, under the root
 * `testDir: './e2e'`, so the Grimoire audit goes here beside the other live
 * ones and uses the same `runAxeAudit` fixture.
 *
 * WHAT IT COVERS. D1 gave both editors a keyboard reorder path: a roving tab
 * stop, Alt+arrow moves and a live region. Those are exactly the affordances
 * an axe run is worth having on, since a roving tabindex done wrong removes
 * rows from the tab order and leaves them reachable by nothing at all.
 */
import { test } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import { runAxeAudit } from '../fixtures/a11y.fixture';
import type { Page } from '@playwright/test';

const FID = 'familiar-seed-001';

/** A companion at Structural, which is the stage that unlocks Rituals. */
async function mockGrimoire(page: Page): Promise<void> {
  await page.route('**/api/v1/me/familiars', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        familiars: [
          {
            familiarId: FID,
            name: 'Ari',
            species: 'standard',
            growthState: { stage: 4, tier: 'structural' },
          },
        ],
      }),
    }),
  );

  await page.route(`**/api/v1/me/familiars/${FID}/growth`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        familiarId: FID,
        growthStage: 4,
        evolutionTier: 'structural',
      }),
    }),
  );

  // Two equipped active Skills of DIFFERENT policy classes, so the per-step
  // cost row renders both an uplift and an included line rather than one shape.
  await page.route(`**/api/v1/me/familiars/${FID}/skills`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        familiarId: FID,
        skillGrants: ['socratic_drill', 'progress_mirror'],
        equippedSkills: ['socratic_drill', 'progress_mirror'],
        grants: [
          {
            skillKey: 'socratic_drill',
            skillKind: 'active',
            slotCost: 2,
            equipped: true,
            unlockedVia: 'species_path',
            unlockedAtStage: 3,
            catalogueActive: true,
            policyClass: 'generative',
          },
          {
            skillKey: 'progress_mirror',
            skillKind: 'active',
            slotCost: 1,
            equipped: true,
            unlockedVia: 'species_path',
            unlockedAtStage: 2,
            catalogueActive: true,
            policyClass: 'standard',
          },
        ],
        skillSlotsUnlocked: 7,
        slotsUsed: 3,
        evolutionTier: 'structural',
        growthStage: 4,
      }),
    }),
  );

  await page.route(`**/api/v1/me/familiars/${FID}/rituals`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rituals: [], wiredSinks: ['chat'] }),
    }),
  );
}

test.describe('Accessibility: the Grimoire editors (D1)', () => {
  test('grimoire has no critical or serious a11y violations', async ({
    page,
  }) => {
    await mockAuthSession(page);
    await mockGrimoire(page);

    await page.goto(`/a/companion/${FID}/design`);
    await page.waitForLoadState('networkidle');

    await runAxeAudit(page, 'Grimoire (loadout and rituals editors)');
  });

  test('the loadout on the companion profile has no violations', async ({
    page,
  }) => {
    // The loadout is mounted on the profile as well as inside the Grimoire,
    // and it is the surface D1 changed for the counters. Audited separately
    // because a component can pass inside one host and fail inside another:
    // heading order and landmark nesting belong to the PAGE, not the part.
    await mockAuthSession(page);
    await mockGrimoire(page);

    await page.goto(`/a/companion/${FID}`);
    await page.waitForLoadState('networkidle');

    await runAxeAudit(page, 'Companion profile with loadout');
  });
});
