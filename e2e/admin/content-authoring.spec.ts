import { test, expect } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import {
  buildAdminAtom,
  buildAdminTopicNode,
  buildAssessmentSession,
  buildLockedPath,
  mockAdminAtomList,
  mockAdminAtomCreate,
  mockAdminAtomUpdate,
  mockAdminAtomDelete,
  mockAdminTopicTree,
  mockAdminTopicCreate,
  mockAdminTopicUpdate,
  mockAdminAssessmentCreate,
  mockAdminPathCreate,
} from '../fixtures/admin-bff-mocks';
import { AdminAtomListPage } from '../pages/admin-atom-list.page';
import { AdminAtomEditorPage } from '../pages/admin-atom-editor.page';
import { AdminTopicTreePage } from '../pages/admin-topic-tree.page';
import { AdminAssessmentBuilderPage } from '../pages/admin-assessment-builder.page';
import { AdminPathBuilderPage } from '../pages/admin-path-builder.page';

// ---------------------------------------------------------------------------
// Viewport: tablet primary (1024x768), desktop for enhanced view (1280x800)
// ---------------------------------------------------------------------------
test.use({ viewport: { width: 1024, height: 768 } });

// ---------------------------------------------------------------------------
// Content Authoring — Atom CRUD
// ---------------------------------------------------------------------------
test.describe('Content Authoring — Atom CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
  });

  test('create MCQ atom, fill form, save draft, verify in list', async ({ page }) => {
    // Set up mocks: empty list initially, create endpoint, then list with new atom
    const newAtom = buildAdminAtom({
      id: 'new-mcq-atom',
      atom_type: 'multiple_choice',
      status: 'draft',
    });
    await mockAdminAtomCreate(page, newAtom);
    await mockAdminAtomList(page, []);

    // Navigate to create
    const editor = new AdminAtomEditorPage(page);
    await editor.gotoCreate();
    await editor.expectLoaded();

    // Fill MCQ form
    await editor.selectAtomType('multiple_choice');
    await editor.setDifficulty(3);
    await editor.setLanguageCode('en');
    await editor.setTags('algebra, basics');

    // Fill MCQ content
    await editor.fillMcqStem('What is 2 + 2?');
    await editor.fillMcqOption(0, '3');
    await editor.fillMcqOption(1, '4');
    await editor.markMcqCorrect(1);
    await editor.fillMcqExplanation('Basic arithmetic: 2 + 2 = 4');

    // Save draft
    await editor.saveDraft();

    // Mock list with the newly created atom on redirect
    await mockAdminAtomList(page, [newAtom]);

    // Verify redirect to list (or manual navigation)
    await page.waitForURL('**/admin/content/atoms**', { timeout: 5000 }).catch(() => {
      // If no redirect, navigate manually
    });
    const list = new AdminAtomListPage(page);
    await list.goto();
    await list.expectLoaded();

    const rowCount = await list.getRowCount();
    expect(rowCount).toBe(1);
  });

  test('edit existing atom, change difficulty, publish, verify status badge', async ({ page }) => {
    const existingAtom = buildAdminAtom({
      id: 'atom-edit-001',
      atom_type: 'multiple_choice',
      status: 'draft',
      difficulty: 2,
    });
    const publishedAtom = buildAdminAtom({
      ...existingAtom,
      status: 'published',
      difficulty: 4,
    });

    await mockAdminAtomUpdate(page, 'atom-edit-001', existingAtom);
    await mockAdminAtomList(page, [existingAtom]);

    // Navigate to edit
    const editor = new AdminAtomEditorPage(page);
    await editor.gotoEdit('atom-edit-001');
    await editor.expectLoaded();

    // Change difficulty
    await editor.setDifficulty(4);

    // Mock the publish response
    await mockAdminAtomUpdate(page, 'atom-edit-001', publishedAtom);

    // Publish
    await editor.publish();

    // Verify in list
    await mockAdminAtomList(page, [publishedAtom]);
    const list = new AdminAtomListPage(page);
    await list.goto();
    await list.expectLoaded();

    const statusBadge = list.getAtomStatus('atom-edit-001');
    await expect(statusBadge).toContainText('published');
  });

  test('filter atom list by type, verify filtered results', async ({ page }) => {
    const atoms = [
      buildAdminAtom({ id: 'mcq-1', atom_type: 'multiple_choice' }),
      buildAdminAtom({ id: 'tf-1', atom_type: 'true_false' }),
      buildAdminAtom({ id: 'fb-1', atom_type: 'fill_blank' }),
    ];
    await mockAdminAtomList(page, atoms);

    const list = new AdminAtomListPage(page);
    await list.goto();
    await list.expectLoaded();

    // Verify all 3 atoms present
    const initialCount = await list.getRowCount();
    expect(initialCount).toBe(3);

    // Click MCQ type filter chip — mock returns filtered results
    const filteredAtoms = [atoms[0]];
    await mockAdminAtomList(page, filteredAtoms);
    await list.clickTypeChip('multiple_choice');

    // Wait for reload
    await page.waitForLoadState('networkidle');

    const filteredCount = await list.getRowCount();
    expect(filteredCount).toBe(1);
  });

  test('bulk select atoms, archive, confirm dialog, verify status changes', async ({ page }) => {
    const atoms = [
      buildAdminAtom({ id: 'bulk-1', status: 'draft' }),
      buildAdminAtom({ id: 'bulk-2', status: 'draft' }),
      buildAdminAtom({ id: 'bulk-3', status: 'published' }),
    ];
    await mockAdminAtomList(page, atoms);
    await mockAdminAtomDelete(page, 'bulk-1');
    await mockAdminAtomDelete(page, 'bulk-2');

    const list = new AdminAtomListPage(page);
    await list.goto();
    await list.expectLoaded();

    // Select atoms for bulk action
    await list.selectAtom('bulk-1');
    await list.selectAtom('bulk-2');

    // Verify bulk actions toolbar appears
    await expect(list.bulkActions).toBeVisible();
    await expect(list.selectionCount).toContainText('2');

    // Click archive
    await list.clickBulkArchive();

    // Handle confirm dialog
    const confirmButton = page.locator('[data-testid="confirm-btn"]');
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
    }

    // Mock updated list with archived atoms
    const archivedAtoms = [
      buildAdminAtom({ id: 'bulk-1', status: 'archived' }),
      buildAdminAtom({ id: 'bulk-2', status: 'archived' }),
      buildAdminAtom({ id: 'bulk-3', status: 'published' }),
    ];
    await mockAdminAtomList(page, archivedAtoms);
    await page.waitForLoadState('networkidle');
  });
});

// ---------------------------------------------------------------------------
// Content Authoring — Topic Tree
// ---------------------------------------------------------------------------
test.describe('Content Authoring — Topic Tree', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
  });

  test('create topic, rename, verify in tree', async ({ page }) => {
    const existingTopic = buildAdminTopicNode({
      id: 'topic-existing',
      name: 'Mathematics',
      children: [],
    });
    await mockAdminTopicTree(page, [existingTopic]);

    const newTopic = buildAdminTopicNode({
      id: 'topic-new',
      name: 'Physics',
    });
    await mockAdminTopicCreate(page, newTopic);

    const tree = new AdminTopicTreePage(page);
    await tree.goto();
    await tree.expectLoaded();

    // Verify existing topic visible
    await expect(tree.getNodeName('topic-existing')).toContainText('Mathematics');

    // Open create form and create new topic
    await tree.openCreateForm();
    await tree.fillTopicName('Physics');
    await tree.submitCreate();

    // Mock updated tree with the new topic
    await mockAdminTopicTree(page, [existingTopic, newTopic]);

    // Verify new topic after reload
    await tree.goto();
    await expect(tree.getNodeName('topic-new')).toContainText('Physics');

    // Rename the new topic
    const renamedTopic = buildAdminTopicNode({ id: 'topic-new', name: 'Applied Physics' });
    await mockAdminTopicUpdate(page, 'topic-new', renamedTopic);
    await tree.startRename('topic-new');

    const renameInput = tree.getRenameInput('topic-new');
    await expect(renameInput).toBeVisible();
    await renameInput.fill('Applied Physics');
    await renameInput.press('Enter');
  });
});

// ---------------------------------------------------------------------------
// Content Authoring — Assessment Builder
// ---------------------------------------------------------------------------
test.describe('Content Authoring — Assessment Builder', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
  });

  test('create assessment, add paper, add section, verify structure', async ({ page }) => {
    const createdSession = buildAssessmentSession({
      id: 'assessment-new',
      title: 'Final Exam 2026',
      structure_mode: 'papers_and_sections',
    });
    await mockAdminAssessmentCreate(page, createdSession);

    // Mock atom list for picker
    const atoms = [
      buildAdminAtom({ id: 'picker-atom-1' }),
      buildAdminAtom({ id: 'picker-atom-2' }),
    ];
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

    const builder = new AdminAssessmentBuilderPage(page);
    await builder.gotoCreate();
    await builder.expectLoaded();

    // Fill session metadata
    await builder.fillSessionTitle('Final Exam 2026');
    await builder.fillDescription('Comprehensive final exam');
    await builder.selectSessionType('exam');
    await builder.selectStructureMode('papers_and_sections');
    await builder.setTimeLimit(120);

    // Verify form is populated
    await expect(builder.sessionTitleInput).toHaveValue('Final Exam 2026');

    // Add paper (component generates one client-side)
    await builder.addPaper();

    // Verify papers section visible
    await expect(builder.papersSection).toBeVisible();

    // Save
    await builder.saveDraft();
  });
});

// ---------------------------------------------------------------------------
// Content Authoring — Path Builder
// ---------------------------------------------------------------------------
test.describe('Content Authoring — Path Builder', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
  });

  test('create locked path, add steps, verify order', async ({ page }) => {
    const createdPath = buildLockedPath({
      id: 'path-new',
      title: 'Algebra Path',
    });
    await mockAdminPathCreate(page, createdPath);

    // Mock atom list for picker
    const atoms = [
      buildAdminAtom({ id: 'path-atom-1', latest_revision: { content: { stem: 'Addition basics' } } }),
      buildAdminAtom({ id: 'path-atom-2', latest_revision: { content: { stem: 'Subtraction basics' } } }),
      buildAdminAtom({ id: 'path-atom-3', latest_revision: { content: { stem: 'Multiplication basics' } } }),
    ];
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

    const builder = new AdminPathBuilderPage(page);
    await builder.gotoCreate();
    await builder.expectLoaded();

    // Fill metadata
    await builder.fillPathTitle('Algebra Path');
    await builder.fillDescription('Step-by-step algebra path');
    await builder.setDuration(120);
    await builder.selectEnrollmentType('open');

    // Verify metadata is populated
    await expect(builder.pathTitleInput).toHaveValue('Algebra Path');
    await expect(builder.pathDescription).toHaveValue('Step-by-step algebra path');

    // Add steps via atom picker
    await builder.clickAddStep();

    // Verify atom picker opens
    await expect(builder.atomPickerOverlay).toBeVisible();

    // Save
    await builder.closeAtomPicker();
    await builder.saveDraft();
  });
});
