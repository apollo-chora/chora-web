import { test, expect } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import {
  buildExamContract,
  buildExamVenue,
  buildExamSitting,
  buildExamResult,
} from '../fixtures/phase29-builders';
import {
  mockExamAdminAPI,
  mockExamAdminVenues,
  mockExamAdminProctor,
  mockExamAdminResults,
} from '../fixtures/phase29-bff-mocks';
import { ExamAdminPage } from '../pages/exam-admin.page';
import { runAxeAudit } from '../fixtures/a11y.fixture';

// ---------------------------------------------------------------------------
// Viewport: desktop primary (1440x900)
// ---------------------------------------------------------------------------
test.use({ viewport: { width: 1440, height: 900 } });

// ---------------------------------------------------------------------------
// ExamAdmin — Contract Management
// ---------------------------------------------------------------------------
test.describe('ExamAdmin — Contracts', () => {
  let examPage: ExamAdminPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    examPage = new ExamAdminPage(page);
  });

  test('displays contract list with mock data', async ({ page }) => {
    const contracts = [
      buildExamContract({ id: 'contract-1', awarding_body: 'National Exam Board', status: 'active' }),
      buildExamContract({ id: 'contract-2', awarding_body: 'City & Guilds', status: 'expired' }),
      buildExamContract({ id: 'contract-3', awarding_body: 'Pearson', status: 'pending' }),
    ];
    await mockExamAdminAPI(page, contracts, []);

    await examPage.gotoContracts();
    await examPage.expectContractListLoaded();
    await expect(examPage.contractTable).toBeVisible();
  });

  test('filters contracts by status', async ({ page }) => {
    const contracts = [
      buildExamContract({ status: 'active' }),
      buildExamContract({ status: 'expired' }),
    ];
    await mockExamAdminAPI(page, contracts, []);

    await examPage.gotoContracts();
    await examPage.expectContractListLoaded();
    await examPage.filterContractsByStatus('active');
    await expect(examPage.contractStatusFilter).toHaveValue('active');
  });

  test('search input filters contracts', async ({ page }) => {
    const contracts = [
      buildExamContract({ awarding_body: 'National Exam Board' }),
      buildExamContract({ awarding_body: 'Pearson' }),
    ];
    await mockExamAdminAPI(page, contracts, []);

    await examPage.gotoContracts();
    await examPage.expectContractListLoaded();
    await examPage.searchContracts('Pearson');
    await expect(examPage.contractSearchInput).toHaveValue('Pearson');
  });
});

// ---------------------------------------------------------------------------
// ExamAdmin — Venue Manager
// ---------------------------------------------------------------------------
test.describe('ExamAdmin — Venue Manager', () => {
  let examPage: ExamAdminPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    examPage = new ExamAdminPage(page);
  });

  test('venue manager renders with exam venues', async ({ page }) => {
    const venues = [
      buildExamVenue({ id: 'ev-1', venue_name: 'Exam Hall A', capacity: 100 }),
      buildExamVenue({ id: 'ev-2', venue_name: 'Exam Hall B', capacity: 50 }),
    ];
    await mockExamAdminAPI(page, [], []);
    await mockExamAdminVenues(page, venues);

    await examPage.gotoVenueManager();
    await examPage.expectVenueManagerLoaded();
    await expect(examPage.examVenueList).toBeVisible();
  });

  test('add venue button is visible', async ({ page }) => {
    await mockExamAdminAPI(page, [], []);
    await mockExamAdminVenues(page, []);

    await examPage.gotoVenueManager();
    await examPage.expectVenueManagerLoaded();
    await expect(examPage.addVenueBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// ExamAdmin — Sitting Scheduler
// ---------------------------------------------------------------------------
test.describe('ExamAdmin — Sitting Scheduler', () => {
  let examPage: ExamAdminPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    examPage = new ExamAdminPage(page);
  });

  test('sitting scheduler renders with sitting list', async ({ page }) => {
    const contracts = [buildExamContract({ id: 'contract-1' })];
    const sittings = [
      buildExamSitting({ id: 'sit-1', contract_id: 'contract-1', scheduled_date: '2026-04-15' }),
      buildExamSitting({ id: 'sit-2', contract_id: 'contract-1', scheduled_date: '2026-05-10' }),
    ];
    await mockExamAdminAPI(page, contracts, sittings);

    await examPage.gotoSittingScheduler();
    await examPage.expectSittingSchedulerLoaded();
    await expect(examPage.sittingList).toBeVisible();
  });

  test('create sitting button is present', async ({ page }) => {
    await mockExamAdminAPI(page, [], []);

    await examPage.gotoSittingScheduler();
    await examPage.expectSittingSchedulerLoaded();
    await expect(examPage.createSittingBtn).toBeVisible();
  });

  test('sitting calendar view renders', async ({ page }) => {
    const sittings = [buildExamSitting()];
    await mockExamAdminAPI(page, [], sittings);

    await examPage.gotoSittingScheduler();
    await examPage.expectSittingSchedulerLoaded();
    await expect(examPage.sittingCalendar).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// ExamAdmin — Proctor Dashboard
// ---------------------------------------------------------------------------
test.describe('ExamAdmin — Proctor Dashboard', () => {
  let examPage: ExamAdminPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'instructor');
    examPage = new ExamAdminPage(page);
  });

  test('proctor dashboard renders active sittings', async ({ page }) => {
    const activeSittings = [
      buildExamSitting({ id: 'active-1', status: 'in_progress', venue_name: 'Exam Hall A' }),
    ];
    await mockExamAdminAPI(page, [], []);
    await mockExamAdminProctor(page, activeSittings, []);

    await examPage.gotoProctorDashboard();
    await examPage.expectProctorDashboardLoaded();
    await expect(examPage.activeSittings).toBeVisible();
  });

  test('proctor dashboard shows alerts panel', async ({ page }) => {
    const alerts = [
      { id: 'alert-1', type: 'suspicious_activity', candidate_gcid: 'gcid-1', message: 'Unusual behavior detected' },
    ];
    await mockExamAdminAPI(page, [], []);
    await mockExamAdminProctor(page, [buildExamSitting({ status: 'in_progress' })], alerts);

    await examPage.gotoProctorDashboard();
    await examPage.expectProctorDashboardLoaded();
    await expect(examPage.proctorAlerts).toBeVisible();
  });

  test('incident log button is visible', async ({ page }) => {
    await mockExamAdminAPI(page, [], []);
    await mockExamAdminProctor(page, [buildExamSitting({ status: 'in_progress' })]);

    await examPage.gotoProctorDashboard();
    await examPage.expectProctorDashboardLoaded();
    await expect(examPage.incidentLogBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// ExamAdmin — Results
// ---------------------------------------------------------------------------
test.describe('ExamAdmin — Results', () => {
  let examPage: ExamAdminPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    examPage = new ExamAdminPage(page);
  });

  test('results table renders with exam results', async ({ page }) => {
    const results = [
      buildExamResult({ candidate_name: 'Alice', score_pct: 92, grade: 'A', outcome: 'pass' }),
      buildExamResult({ candidate_name: 'Bob', score_pct: 65, grade: 'C', outcome: 'pass' }),
      buildExamResult({ candidate_name: 'Charlie', score_pct: 38, grade: 'F', outcome: 'fail' }),
    ];
    await mockExamAdminAPI(page, [], []);
    await mockExamAdminResults(page, results);

    await examPage.gotoResults();
    await examPage.expectResultsLoaded();
    await expect(examPage.resultsTable).toBeVisible();
  });

  test('export results button is visible', async ({ page }) => {
    await mockExamAdminAPI(page, [], []);
    await mockExamAdminResults(page, [buildExamResult()]);

    await examPage.gotoResults();
    await examPage.expectResultsLoaded();
    await expect(examPage.resultsExportBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// ExamAdmin — Accessibility
// ---------------------------------------------------------------------------
test.describe('ExamAdmin — Accessibility', () => {
  test('contract list page passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    const contracts = [buildExamContract(), buildExamContract({ awarding_body: 'Pearson' })];
    await mockExamAdminAPI(page, contracts, []);

    const examPage = new ExamAdminPage(page);
    await examPage.gotoContracts();
    await examPage.expectContractListLoaded();

    await runAxeAudit(page, 'ExamAdmin contract list');
  });

  test('sitting scheduler passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await mockExamAdminAPI(page, [], [buildExamSitting()]);

    const examPage = new ExamAdminPage(page);
    await examPage.gotoSittingScheduler();
    await examPage.expectSittingSchedulerLoaded();

    await runAxeAudit(page, 'ExamAdmin sitting scheduler');
  });

  test('results page passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await mockExamAdminAPI(page, [], []);
    await mockExamAdminResults(page, [buildExamResult()]);

    const examPage = new ExamAdminPage(page);
    await examPage.gotoResults();
    await examPage.expectResultsLoaded();

    await runAxeAudit(page, 'ExamAdmin results');
  });
});
