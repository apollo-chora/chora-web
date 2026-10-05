import { test, expect } from '@playwright/test';
import { AtomPlayerPage } from '../pages/atom-player.page';
import { mockAuthSession } from '../fixtures/auth-mocks';
import { mockAtomList } from '../fixtures/bff-mocks';
import { buildAtom } from '../fixtures/test-builders';
import { runAxeAudit } from '../fixtures/a11y.fixture';

const TEST_ATOM_ID = 'atom-player-001';

test.describe('Atom Player — rendering', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page);
  });

  test('player loads and renders atom content', async ({ page }) => {
    const atom = buildAtom({ id: TEST_ATOM_ID });
    await mockAtomList(page, [atom]);

    const player = new AtomPlayerPage(page);
    await player.goto(TEST_ATOM_ID);
    await player.expectLoaded();

    await expect(player.header).toBeVisible();
    await expect(player.content).toBeVisible();
    await expect(player.controls).toBeVisible();
  });

  test('player shows error state for missing atom', async ({ page }) => {
    await page.route('**/api/v1/graphql', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { atom: null } }),
      });
    });

    const player = new AtomPlayerPage(page);
    await player.goto('nonexistent-id');
    await player.expectError();

    await expect(player.exitButton).toBeVisible();
  });

  test('close button navigates back', async ({ page }) => {
    const atom = buildAtom({ id: TEST_ATOM_ID });
    await mockAtomList(page, [atom]);

    const player = new AtomPlayerPage(page);
    await player.goto(TEST_ATOM_ID);
    await player.expectLoaded();

    await player.close();
    // Should navigate away from player
    await expect(page).not.toHaveURL(/\/player\//);
  });
});

test.describe('Atom Player — answer submission', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page);
  });

  test('submit answer shows correct feedback', async ({ page }) => {
    const atom = buildAtom({ id: TEST_ATOM_ID });
    await mockAtomList(page, [atom]);

    const player = new AtomPlayerPage(page);
    await player.goto(TEST_ATOM_ID);
    await player.expectLoaded();

    await player.submitAnswer();
    await player.expectFeedbackVisible();
    await expect(player.feedbackExplanation).toBeVisible();
  });

  test('feedback has retry and done buttons', async ({ page }) => {
    const atom = buildAtom({ id: TEST_ATOM_ID });
    await mockAtomList(page, [atom]);

    const player = new AtomPlayerPage(page);
    await player.goto(TEST_ATOM_ID);
    await player.expectLoaded();

    await player.submitAnswer();
    await player.expectFeedbackVisible();

    await expect(player.retryButton).toBeVisible();
    await expect(player.doneButton).toBeVisible();
  });
});

test.describe('Atom Player — hints', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page);
  });

  test('hint button reveals hints section', async ({ page }) => {
    const atom = buildAtom({ id: TEST_ATOM_ID });
    await mockAtomList(page, [atom]);

    const player = new AtomPlayerPage(page);
    await player.goto(TEST_ATOM_ID);
    await player.expectLoaded();

    // Hint button should be visible if hints available
    if (await player.hintButton.isVisible()) {
      await player.requestHint();
      await expect(player.hintsSection).toBeVisible();
    }
  });
});

test.describe('Atom Player — accessibility', () => {
  test('atom player passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page);
    const atom = buildAtom({ id: TEST_ATOM_ID });
    await mockAtomList(page, [atom]);

    const player = new AtomPlayerPage(page);
    await player.goto(TEST_ATOM_ID);
    await player.expectLoaded();

    await runAxeAudit(page, 'Atom player');
  });
});
