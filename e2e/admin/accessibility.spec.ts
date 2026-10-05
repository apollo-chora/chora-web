import { test, expect } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import { runAxeAudit } from '../fixtures/a11y.fixture';
import {
  buildAdminAtom,
  buildAdminTopicNode,
  buildTenantUser,
  buildAddOnPlan,
  buildEntitlement,
  buildInvitation,
  mockAdminAtomList,
  mockAdminTopicTree,
  mockAdminUserList,
  mockAdminEntitlements,
  mockAdminAddOns,
  mockAdminInvitationList,
} from '../fixtures/admin-bff-mocks';

// ---------------------------------------------------------------------------
// Viewport: tablet primary (1024x768)
// ---------------------------------------------------------------------------
test.use({ viewport: { width: 1024, height: 768 } });

// ---------------------------------------------------------------------------
// Helper: seed admin data for all pages
// ---------------------------------------------------------------------------
async function seedAdminMocks(page: import('@playwright/test').Page): Promise<void> {
  const atoms = [
    buildAdminAtom({ id: 'a11y-atom-1' }),
    buildAdminAtom({ id: 'a11y-atom-2', atom_type: 'true_false' }),
  ];
  await mockAdminAtomList(page, atoms);

  const topics = [
    buildAdminTopicNode({
      id: 'a11y-topic-1',
      name: 'Mathematics',
      children: [
        buildAdminTopicNode({ id: 'a11y-topic-child', name: 'Algebra', parent_id: 'a11y-topic-1', depth: 1 }),
      ],
    }),
  ];
  await mockAdminTopicTree(page, topics);

  const users = [
    buildTenantUser({ gcid: 'a11y-user-1', email: 'user1@test.chora.io', roles: ['learner'] }),
    buildTenantUser({ gcid: 'a11y-user-2', email: 'user2@test.chora.io', roles: ['instructor'] }),
  ];
  await mockAdminUserList(page, users);

  const addOns = [
    buildAddOnPlan({ code: 'learner_engagement', name: 'Engagement', category: 'Engagement' }),
    buildAddOnPlan({ code: 'knowledge_graph', name: 'Knowledge Graph', category: 'Discovery' }),
  ];
  const entitlements = [
    buildEntitlement({ id: 'a11y-ent-1', add_on_code: 'learner_engagement', enabled: true }),
  ];
  await mockAdminAddOns(page, addOns);
  await mockAdminEntitlements(page, entitlements);

  const invitations = [
    buildInvitation({ id: 'a11y-inv-1', role_template: 'learner' }),
  ];
  await mockAdminInvitationList(page, invitations);

  // Also mock atom endpoints for editor/builder pages
  await page.route('**/api/v1/atoms**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: atoms,
          page_info: { next_cursor: null, has_next: false },
        }),
      });
    } else {
      await route.fallback();
    }
  });
}

// ---------------------------------------------------------------------------
// WCAG 2.1 AA Automated Audit (axe-core)
// ---------------------------------------------------------------------------
test.describe('Admin Pages — axe-core WCAG 2.1 AA', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await seedAdminMocks(page);
  });

  test('atom list page has no critical/serious a11y violations', async ({ page }) => {
    await page.goto('/admin/content/atoms');
    await expect(page.locator('[data-testid="atom-list"]')).toBeVisible();
    await runAxeAudit(page, 'Admin Atom List');
  });

  test('atom editor (create mode) has no critical/serious a11y violations', async ({ page }) => {
    await page.goto('/admin/content/atoms/new');
    await expect(page.locator('[data-testid="atom-editor"]')).toBeVisible();
    await runAxeAudit(page, 'Admin Atom Editor (Create)');
  });

  test('topic tree page has no critical/serious a11y violations', async ({ page }) => {
    await page.goto('/admin/content/topics');
    await expect(page.locator('[data-testid="topic-tree"]')).toBeVisible();
    await runAxeAudit(page, 'Admin Topic Tree');
  });

  test('assessment builder has no critical/serious a11y violations', async ({ page }) => {
    await page.goto('/admin/content/assessments/new');
    await expect(page.locator('[data-testid="assessment-builder"]')).toBeVisible();
    await runAxeAudit(page, 'Admin Assessment Builder');
  });

  test('path builder has no critical/serious a11y violations', async ({ page }) => {
    await page.goto('/admin/content/paths/new');
    await expect(page.locator('[data-testid="path-builder"]')).toBeVisible();
    await runAxeAudit(page, 'Admin Path Builder');
  });

  test('user management has no critical/serious a11y violations', async ({ page }) => {
    await page.goto('/admin/tenant/users');
    await expect(page.locator('[data-testid="user-management"]')).toBeVisible();
    await runAxeAudit(page, 'Admin User Management');
  });

  test('entitlement manager has no critical/serious a11y violations', async ({ page }) => {
    await page.goto('/admin/tenant/entitlements');
    await expect(page.locator('[data-testid="entitlement-manager"]')).toBeVisible();
    await runAxeAudit(page, 'Admin Entitlement Manager');
  });

  test('invitation manager has no critical/serious a11y violations', async ({ page }) => {
    await page.goto('/admin/tenant/invitations');
    await expect(page.locator('[data-testid="invitation-manager"]')).toBeVisible();
    await runAxeAudit(page, 'Admin Invitation Manager');
  });
});

// ---------------------------------------------------------------------------
// Keyboard Navigation
// ---------------------------------------------------------------------------
test.describe('Admin Pages — Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await seedAdminMocks(page);
  });

  test('atom list: Tab through interactive elements, all receive focus', async ({ page }) => {
    await page.goto('/admin/content/atoms');
    await expect(page.locator('[data-testid="atom-list"]')).toBeVisible();

    // Tab through the page
    const interactiveSelectors = [
      '[data-testid="btn-create-atom"]',
      '[data-testid="search-input"]',
      '[data-testid="status-filter"]',
      '[data-testid="difficulty-filter"]',
    ];

    for (const selector of interactiveSelectors) {
      const element = page.locator(selector);
      await element.focus();
      const isFocused = await element.evaluate(
        (el) => document.activeElement === el,
      );
      expect(isFocused, `${selector} should be focusable`).toBe(true);
    }
  });

  test('atom editor: Tab through form fields, focus visible on all', async ({ page }) => {
    await page.goto('/admin/content/atoms/new');
    await expect(page.locator('[data-testid="atom-editor"]')).toBeVisible();

    const formElements = [
      '[data-testid="atom-type-select"]',
      '[data-testid="difficulty-slider"]',
      '[data-testid="language-code-input"]',
      '[data-testid="tags-input"]',
      '[data-testid="btn-save-draft"]',
      '[data-testid="btn-publish"]',
    ];

    for (const selector of formElements) {
      const element = page.locator(selector);
      if (await element.isVisible()) {
        await element.focus();
        const isFocused = await element.evaluate(
          (el) => document.activeElement === el,
        );
        expect(isFocused, `${selector} should be focusable`).toBe(true);
      }
    }
  });

  test('topic tree: keyboard-navigable nodes', async ({ page }) => {
    await page.goto('/admin/content/topics');
    await expect(page.locator('[data-testid="topic-tree"]')).toBeVisible();

    // Topic nodes should be focusable via keyboard
    const nodeName = page.locator('[data-testid="node-name-a11y-topic-1"]');
    await nodeName.focus();
    const isFocused = await nodeName.evaluate(
      (el) => document.activeElement === el,
    );
    expect(isFocused).toBe(true);
  });

  test('user management: keyboard Tab through table and actions', async ({ page }) => {
    await page.goto('/admin/tenant/users');
    await expect(page.locator('[data-testid="user-management"]')).toBeVisible();

    // Search input should be focusable
    const searchInput = page.locator('[data-testid="search-email"]');
    await searchInput.focus();
    expect(await searchInput.evaluate((el) => document.activeElement === el)).toBe(true);

    // Role filter should be focusable
    const roleFilter = page.locator('[data-testid="role-filter"]');
    await roleFilter.focus();
    expect(await roleFilter.evaluate((el) => document.activeElement === el)).toBe(true);
  });

  test('invitation manager: Tab through form and card actions', async ({ page }) => {
    await page.goto('/admin/tenant/invitations');
    await expect(page.locator('[data-testid="invitation-manager"]')).toBeVisible();

    // Toggle form button should be focusable
    const toggleBtn = page.locator('[data-testid="btn-toggle-form"]');
    await toggleBtn.focus();
    expect(await toggleBtn.evaluate((el) => document.activeElement === el)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Focus Visible Indicators
// ---------------------------------------------------------------------------
test.describe('Admin Pages — Focus Visible', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await seedAdminMocks(page);
  });

  test('interactive elements have visible focus indicators on atom list', async ({ page }) => {
    await page.goto('/admin/content/atoms');
    await expect(page.locator('[data-testid="atom-list"]')).toBeVisible();

    // Focus the create button and check it has an outline
    const createBtn = page.locator('[data-testid="btn-create-atom"]');
    await createBtn.focus();

    // Verify focus ring is not removed (outline is not 'none')
    const outlineStyle = await createBtn.evaluate((el) => {
      return window.getComputedStyle(el).outlineStyle;
    });
    // outlineStyle should not be 'none' (focus ring should be visible)
    // Some browsers default to 'auto' or 'solid' when focused
    expect(outlineStyle).not.toBe('none');
  });
});

// ---------------------------------------------------------------------------
// ARIA Labels and Screen Reader Landmarks
// ---------------------------------------------------------------------------
test.describe('Admin Pages — ARIA & Landmarks', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await seedAdminMocks(page);
  });

  test('atom list has main landmark and aria-label', async ({ page }) => {
    await page.goto('/admin/content/atoms');
    const main = page.locator('[data-testid="atom-list"]');
    await expect(main).toBeVisible();
    await expect(main).toHaveAttribute('role', 'main');
    const ariaLabel = await main.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
  });

  test('atom editor has main landmark and aria-label', async ({ page }) => {
    await page.goto('/admin/content/atoms/new');
    const main = page.locator('[data-testid="atom-editor"]');
    await expect(main).toBeVisible();
    await expect(main).toHaveAttribute('role', 'main');
    const ariaLabel = await main.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
  });

  test('topic tree has main landmark, tree role, and aria labels', async ({ page }) => {
    await page.goto('/admin/content/topics');
    const main = page.locator('[data-testid="topic-tree"]');
    await expect(main).toBeVisible();
    await expect(main).toHaveAttribute('role', 'main');

    // Tree list should have tree role
    const treeList = page.locator('ul[role="tree"]');
    await expect(treeList).toBeVisible();
  });

  test('assessment builder has main landmark', async ({ page }) => {
    await page.goto('/admin/content/assessments/new');
    const main = page.locator('[data-testid="assessment-builder"]');
    await expect(main).toBeVisible();
    await expect(main).toHaveAttribute('role', 'main');
  });

  test('path builder has main landmark', async ({ page }) => {
    await page.goto('/admin/content/paths/new');
    const main = page.locator('[data-testid="path-builder"]');
    await expect(main).toBeVisible();
    await expect(main).toHaveAttribute('role', 'main');
  });

  test('user management has main landmark and table with grid role', async ({ page }) => {
    await page.goto('/admin/tenant/users');
    const main = page.locator('[data-testid="user-management"]');
    await expect(main).toBeVisible();
    await expect(main).toHaveAttribute('role', 'main');

    // Data table should have grid role
    const table = page.locator('table[role="grid"]');
    await expect(table).toBeVisible();
  });

  test('entitlement manager has main landmark', async ({ page }) => {
    await page.goto('/admin/tenant/entitlements');
    const main = page.locator('[data-testid="entitlement-manager"]');
    await expect(main).toBeVisible();
    await expect(main).toHaveAttribute('role', 'main');
  });

  test('invitation manager has main landmark', async ({ page }) => {
    await page.goto('/admin/tenant/invitations');
    const main = page.locator('[data-testid="invitation-manager"]');
    await expect(main).toBeVisible();
    await expect(main).toHaveAttribute('role', 'main');
  });

  test('atom list filter bar has search role', async ({ page }) => {
    await page.goto('/admin/content/atoms');
    const filterBar = page.locator('[data-testid="atom-list-filters"]');
    await expect(filterBar).toBeVisible();
    await expect(filterBar).toHaveAttribute('role', 'search');
  });

  test('user management filter bar has search role', async ({ page }) => {
    await page.goto('/admin/tenant/users');
    const filterBar = page.locator('[data-testid="user-filters"]');
    await expect(filterBar).toBeVisible();
    await expect(filterBar).toHaveAttribute('role', 'search');
  });

  test('atom list bulk actions toolbar has toolbar role', async ({ page }) => {
    await page.goto('/admin/content/atoms');
    await expect(page.locator('[data-testid="atom-list"]')).toBeVisible();

    // Select an atom to make bulk actions visible
    const checkbox = page.locator('[data-testid^="select-"]').first();
    if (await checkbox.isVisible()) {
      await checkbox.check();
      const bulkActions = page.locator('[data-testid="bulk-actions"]');
      if (await bulkActions.isVisible({ timeout: 1000 }).catch(() => false)) {
        await expect(bulkActions).toHaveAttribute('role', 'toolbar');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Color Contrast (spot check via computed styles)
// ---------------------------------------------------------------------------
test.describe('Admin Pages — Color Contrast', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await seedAdminMocks(page);
  });

  test('page headings have sufficient contrast (not white on white)', async ({ page }) => {
    await page.goto('/admin/content/atoms');
    await expect(page.locator('[data-testid="atom-list-title"]')).toBeVisible();

    const titleColor = await page.locator('[data-testid="atom-list-title"]').evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        color: style.color,
        backgroundColor: style.backgroundColor,
      };
    });

    // Color should not be transparent or same as background
    expect(titleColor.color).toBeTruthy();
    expect(titleColor.color).not.toBe(titleColor.backgroundColor);
  });
});

// ---------------------------------------------------------------------------
// Form Labels
// ---------------------------------------------------------------------------
test.describe('Admin Pages — Form Labels', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await seedAdminMocks(page);
  });

  test('atom editor form inputs have associated labels', async ({ page }) => {
    await page.goto('/admin/content/atoms/new');
    await expect(page.locator('[data-testid="atom-editor"]')).toBeVisible();

    // Check that select has a label via id
    const atomTypeSelect = page.locator('#atom-type');
    await expect(atomTypeSelect).toBeVisible();
    const label = page.locator('label[for="atom-type"]');
    await expect(label).toBeVisible();

    // Check difficulty slider has label
    const difficultySlider = page.locator('#difficulty');
    await expect(difficultySlider).toBeVisible();
    const diffLabel = page.locator('label[for="difficulty"]');
    await expect(diffLabel).toBeVisible();
  });

  test('user management search has aria-label', async ({ page }) => {
    await page.goto('/admin/tenant/users');
    await expect(page.locator('[data-testid="user-management"]')).toBeVisible();

    const searchInput = page.locator('[data-testid="search-email"]');
    await expect(searchInput).toBeVisible();
    const ariaLabel = await searchInput.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
  });

  test('invitation form inputs have associated labels', async ({ page }) => {
    await page.goto('/admin/tenant/invitations');
    await expect(page.locator('[data-testid="invitation-manager"]')).toBeVisible();

    // Open form
    await page.locator('[data-testid="btn-toggle-form"]').click();
    await expect(page.locator('[data-testid="invitation-form"]')).toBeVisible();

    // Verify label-for associations
    const roleLabel = page.locator('label[for="inv-role"]');
    await expect(roleLabel).toBeVisible();
    const emailLabel = page.locator('label[for="inv-email"]');
    await expect(emailLabel).toBeVisible();
    const expiryLabel = page.locator('label[for="inv-expires"]');
    await expect(expiryLabel).toBeVisible();
  });
});
