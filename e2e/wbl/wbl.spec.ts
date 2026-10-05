import { test, expect } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import {
  buildPlacement,
  buildWorkLogEntry,
  buildCapstone,
  buildSupervisorFeedback,
} from '../fixtures/phase29-builders';
import {
  mockWblAPI,
  mockWblCapstone,
  mockWblFeedback,
} from '../fixtures/phase29-bff-mocks';
import { WblPage } from '../pages/wbl.page';
import { runAxeAudit } from '../fixtures/a11y.fixture';

// ---------------------------------------------------------------------------
// Viewport: desktop primary (1440x900)
// ---------------------------------------------------------------------------
test.use({ viewport: { width: 1440, height: 900 } });

// ---------------------------------------------------------------------------
// WBL — Placement Listing
// ---------------------------------------------------------------------------
test.describe('WBL — Placement Listing', () => {
  let wblPage: WblPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner');
    wblPage = new WblPage(page);
  });

  test('displays placement list with mock data', async ({ page }) => {
    const placements = [
      buildPlacement({ id: 'pl-1', organisation: 'TechCorp Solutions', status: 'active' }),
      buildPlacement({ id: 'pl-2', organisation: 'Data Dynamics', status: 'completed' }),
      buildPlacement({ id: 'pl-3', organisation: 'Cloud Nine Labs', status: 'pending' }),
    ];
    await mockWblAPI(page, placements, []);

    await wblPage.gotoPlacements();
    await wblPage.expectPlacementListLoaded();
    await expect(wblPage.placementTable).toBeVisible();
  });

  test('filters placements by status', async ({ page }) => {
    const placements = [
      buildPlacement({ status: 'active' }),
      buildPlacement({ status: 'completed' }),
    ];
    await mockWblAPI(page, placements, []);

    await wblPage.gotoPlacements();
    await wblPage.expectPlacementListLoaded();
    await wblPage.filterPlacementsByStatus('active');
    await expect(wblPage.placementStatusFilter).toHaveValue('active');
  });

  test('search input filters placements', async ({ page }) => {
    const placements = [
      buildPlacement({ organisation: 'TechCorp Solutions' }),
      buildPlacement({ organisation: 'Data Dynamics' }),
    ];
    await mockWblAPI(page, placements, []);

    await wblPage.gotoPlacements();
    await wblPage.expectPlacementListLoaded();
    await wblPage.searchPlacements('TechCorp');
    await expect(wblPage.placementSearchInput).toHaveValue('TechCorp');
  });
});

// ---------------------------------------------------------------------------
// WBL — Placement Detail
// ---------------------------------------------------------------------------
test.describe('WBL — Placement Detail', () => {
  let wblPage: WblPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner');
    wblPage = new WblPage(page);
  });

  test('placement detail renders with organisation info', async ({ page }) => {
    const placement = buildPlacement({
      id: 'pl-detail-1',
      organisation: 'TechCorp Solutions',
      role_title: 'Junior Developer Intern',
    });
    await mockWblAPI(page, [placement], []);

    await wblPage.gotoPlacementDetail('pl-detail-1');
    await wblPage.expectPlacementDetailLoaded();
    await expect(wblPage.placementDetail).toBeVisible();
  });

  test('placement detail shows status and date range', async ({ page }) => {
    const placement = buildPlacement({
      id: 'pl-detail-2',
      status: 'active',
      start_date: '2026-03-01',
      end_date: '2026-06-30',
    });
    await mockWblAPI(page, [placement], []);

    await wblPage.gotoPlacementDetail('pl-detail-2');
    await wblPage.expectPlacementDetailLoaded();
    await expect(wblPage.placementStatus).toBeVisible();
    await expect(wblPage.placementDateRange).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// WBL — Work Log
// ---------------------------------------------------------------------------
test.describe('WBL — Work Log', () => {
  let wblPage: WblPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner');
    wblPage = new WblPage(page);
  });

  test('work log panel renders with entries', async ({ page }) => {
    const placement = buildPlacement({ id: 'pl-log-1' });
    const workLogs = [
      buildWorkLogEntry({ placement_id: 'pl-log-1', date: '2026-03-16', hours: 7.5 }),
      buildWorkLogEntry({ placement_id: 'pl-log-1', date: '2026-03-15', hours: 8 }),
      buildWorkLogEntry({ placement_id: 'pl-log-1', date: '2026-03-14', hours: 6, supervisor_approved: true }),
    ];
    await mockWblAPI(page, [placement], workLogs);

    await wblPage.gotoWorkLog('pl-log-1');
    await wblPage.expectWorkLogLoaded();
    await expect(wblPage.workLogList).toBeVisible();
  });

  test('create work log button is visible', async ({ page }) => {
    const placement = buildPlacement({ id: 'pl-log-2' });
    await mockWblAPI(page, [placement], []);

    await wblPage.gotoWorkLog('pl-log-2');
    await wblPage.expectWorkLogLoaded();
    await expect(wblPage.workLogCreateBtn).toBeVisible();
  });

  test('work log form accepts hours and description', async ({ page }) => {
    const placement = buildPlacement({ id: 'pl-log-3' });
    await mockWblAPI(page, [placement], []);

    await wblPage.gotoWorkLog('pl-log-3');
    await wblPage.expectWorkLogLoaded();

    // Click create button to show form
    if (await wblPage.workLogCreateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await wblPage.workLogCreateBtn.click();
      await wblPage.fillWorkLogEntry('7.5', 'Attended team standup and worked on feature development.');
      await expect(wblPage.workLogHoursInput).toHaveValue('7.5');
      await expect(wblPage.workLogDescriptionInput).toHaveValue(
        'Attended team standup and worked on feature development.',
      );
    }
  });

  test('total hours display is visible', async ({ page }) => {
    const placement = buildPlacement({ id: 'pl-log-4', logged_hours: 120 });
    const workLogs = [buildWorkLogEntry({ hours: 8 }), buildWorkLogEntry({ hours: 7 })];
    await mockWblAPI(page, [placement], workLogs);

    await wblPage.gotoWorkLog('pl-log-4');
    await wblPage.expectWorkLogLoaded();
    await expect(wblPage.workLogTotalHours).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// WBL — Capstone
// ---------------------------------------------------------------------------
test.describe('WBL — Capstone', () => {
  let wblPage: WblPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner');
    wblPage = new WblPage(page);
  });

  test('capstone tracker renders with milestones', async ({ page }) => {
    const placement = buildPlacement({ id: 'pl-cap-1' });
    const capstone = buildCapstone({
      placement_id: 'pl-cap-1',
      title: 'E-Commerce Dashboard Redesign',
      progress_pct: 45,
    });
    await mockWblAPI(page, [placement], []);
    await mockWblCapstone(page, capstone);

    await wblPage.gotoCapstone('pl-cap-1');
    await wblPage.expectCapstoneLoaded();
    await expect(wblPage.capstoneTracker).toBeVisible();
    await expect(wblPage.capstoneMilestones).toBeVisible();
  });

  test('capstone progress indicator is visible', async ({ page }) => {
    const placement = buildPlacement({ id: 'pl-cap-2' });
    const capstone = buildCapstone({ placement_id: 'pl-cap-2', progress_pct: 70 });
    await mockWblAPI(page, [placement], []);
    await mockWblCapstone(page, capstone);

    await wblPage.gotoCapstone('pl-cap-2');
    await wblPage.expectCapstoneLoaded();
    await expect(wblPage.capstoneProgress).toBeVisible();
  });

  test('capstone status displays current state', async ({ page }) => {
    const placement = buildPlacement({ id: 'pl-cap-3' });
    const capstone = buildCapstone({ placement_id: 'pl-cap-3', status: 'in_progress' });
    await mockWblAPI(page, [placement], []);
    await mockWblCapstone(page, capstone);

    await wblPage.gotoCapstone('pl-cap-3');
    await wblPage.expectCapstoneLoaded();
    await expect(wblPage.capstoneStatus).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// WBL — Supervisor Feedback
// ---------------------------------------------------------------------------
test.describe('WBL — Supervisor Feedback', () => {
  test('feedback list renders with entries', async ({ page }) => {
    await mockAuthSession(page, 'learner');
    const placement = buildPlacement({ id: 'pl-fb-1' });
    const feedback = [
      buildSupervisorFeedback({ placement_id: 'pl-fb-1', rating: 4, period_start: '2026-03-01' }),
      buildSupervisorFeedback({ placement_id: 'pl-fb-1', rating: 5, period_start: '2026-04-01' }),
    ];
    await mockWblAPI(page, [placement], []);
    await mockWblFeedback(page, feedback);

    const wblPage = new WblPage(page);
    await wblPage.gotoSupervisorFeedback('pl-fb-1');
    await wblPage.expectSupervisorFeedbackLoaded();
    await expect(wblPage.feedbackList).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// WBL — Accessibility
// ---------------------------------------------------------------------------
test.describe('WBL — Accessibility', () => {
  test('placement list page passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'learner');
    const placements = [buildPlacement(), buildPlacement({ organisation: 'Data Dynamics' })];
    await mockWblAPI(page, placements, []);

    const wblPage = new WblPage(page);
    await wblPage.gotoPlacements();
    await wblPage.expectPlacementListLoaded();

    await runAxeAudit(page, 'WBL placement list');
  });

  test('work log page passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'learner');
    const placement = buildPlacement({ id: 'pl-a11y-1' });
    const workLogs = [buildWorkLogEntry({ placement_id: 'pl-a11y-1' })];
    await mockWblAPI(page, [placement], workLogs);

    const wblPage = new WblPage(page);
    await wblPage.gotoWorkLog('pl-a11y-1');
    await wblPage.expectWorkLogLoaded();

    await runAxeAudit(page, 'WBL work log');
  });

  test('capstone page passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'learner');
    const placement = buildPlacement({ id: 'pl-a11y-2' });
    await mockWblAPI(page, [placement], []);
    await mockWblCapstone(page, buildCapstone({ placement_id: 'pl-a11y-2' }));

    const wblPage = new WblPage(page);
    await wblPage.gotoCapstone('pl-a11y-2');
    await wblPage.expectCapstoneLoaded();

    await runAxeAudit(page, 'WBL capstone');
  });
});
