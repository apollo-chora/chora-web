import { test, expect } from '@playwright/test';
import { AtomListPage } from '../pages/atom-list.page';
import { mockAuthSession } from '../fixtures/auth-mocks';
import { mockAtomList, mockTopicTree } from '../fixtures/bff-mocks';
import { buildAtom, buildTopicNode } from '../fixtures/test-builders';
import { runAxeAudit } from '../fixtures/a11y.fixture';

test.describe('Atom List — browsing', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page);
    await mockTopicTree(page, [buildTopicNode()]);
  });

  test('renders atom grid with atoms', async ({ page }) => {
    const atoms = [
      buildAtom({ id: 'atom-1' }),
      buildAtom({ id: 'atom-2', atomType: 'FILL_BLANK' }),
      buildAtom({ id: 'atom-3', atomType: 'TRUE_FALSE' }),
    ];
    await mockAtomList(page, atoms);

    const atomList = new AtomListPage(page);
    await atomList.goto();
    await atomList.expectLoaded();

    const count = await atomList.getAtomCardCount();
    expect(count).toBe(3);
  });

  test('shows empty state when no atoms match', async ({ page }) => {
    await mockAtomList(page, []);

    const atomList = new AtomListPage(page);
    await atomList.goto();
    await atomList.expectEmpty();
  });

  test('toolbar filters are visible', async ({ page }) => {
    await mockAtomList(page, [buildAtom()]);

    const atomList = new AtomListPage(page);
    await atomList.goto();

    await expect(atomList.toolbar).toBeVisible();
    await expect(atomList.typeFilter).toBeVisible();
    await expect(atomList.difficultyFilter).toBeVisible();
    await expect(atomList.viewToggle).toBeVisible();
  });

  test('topic sidebar is visible', async ({ page }) => {
    await mockAtomList(page, [buildAtom()]);

    const atomList = new AtomListPage(page);
    await atomList.goto();

    await expect(atomList.sidebar).toBeVisible();
  });
});

test.describe('Atom List — error handling', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page);
    await mockTopicTree(page, []);
  });

  test('shows error state on GraphQL error', async ({ page }) => {
    await page.route('**/api/v1/graphql', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          errors: [{ message: 'Internal server error' }],
          data: null,
        }),
      });
    });

    const atomList = new AtomListPage(page);
    await atomList.goto();
    await atomList.expectError();
  });
});

test.describe('Atom List — accessibility', () => {
  test('atom list page passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page);
    await mockTopicTree(page, [buildTopicNode()]);
    await mockAtomList(page, [buildAtom(), buildAtom()]);

    const atomList = new AtomListPage(page);
    await atomList.goto();
    await atomList.expectLoaded();

    await runAxeAudit(page, 'Atom list page');
  });
});
