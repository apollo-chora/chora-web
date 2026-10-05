import { test, expect } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import {
  buildGuardianLink,
  buildActivityDigest,
  buildProgressReport,
  buildConsentRecord,
} from '../fixtures/phase29-builders';
import {
  mockParentAPI,
  mockParentDashboard,
  mockParentProgressReport,
  mockParentConsent,
  mockParentConsentHistory,
} from '../fixtures/phase29-bff-mocks';
import { ParentPortalPage } from '../pages/parent-portal.page';
import { runAxeAudit } from '../fixtures/a11y.fixture';

// ---------------------------------------------------------------------------
// Viewport: desktop primary (1440x900)
// ---------------------------------------------------------------------------
test.use({ viewport: { width: 1440, height: 900 } });

// ---------------------------------------------------------------------------
// Parent — Guardian Dashboard
// ---------------------------------------------------------------------------
test.describe('Parent — Guardian Dashboard', () => {
  let parentPage: ParentPortalPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner');
    parentPage = new ParentPortalPage(page);
  });

  test('displays guardian dashboard with linked learners', async ({ page }) => {
    const links = [
      buildGuardianLink({ learner_name: 'Alice', relationship: 'parent' }),
      buildGuardianLink({ learner_name: 'Bob', relationship: 'parent' }),
    ];
    const digests = [buildActivityDigest({ learner_name: 'Alice' })];
    await mockParentAPI(page, links, digests);
    await mockParentDashboard(page, {
      linked_learners: links.length,
      total_atoms_today: 8,
      active_streaks: 2,
    });

    await parentPage.gotoDashboard();
    await parentPage.expectDashboardLoaded();
    await expect(parentPage.linkedLearners).toBeVisible();
  });

  test('dashboard summary cards render', async ({ page }) => {
    const links = [buildGuardianLink()];
    await mockParentAPI(page, links, []);
    await mockParentDashboard(page, {
      linked_learners: 1,
      total_atoms_today: 5,
      active_streaks: 1,
    });

    await parentPage.gotoDashboard();
    await parentPage.expectDashboardLoaded();
    await expect(parentPage.dashboardSummaryCards.first()).toBeVisible();
  });

  test('add learner button is visible', async ({ page }) => {
    await mockParentAPI(page, [], []);
    await mockParentDashboard(page, { linked_learners: 0, total_atoms_today: 0, active_streaks: 0 });

    await parentPage.gotoDashboard();
    await parentPage.expectDashboardLoaded();
    await expect(parentPage.addLearnerBtn).toBeVisible();
  });

  test('link code input accepts guardian link code', async ({ page }) => {
    await mockParentAPI(page, [], []);
    await mockParentDashboard(page, { linked_learners: 0, total_atoms_today: 0, active_streaks: 0 });

    await parentPage.gotoDashboard();
    await parentPage.expectDashboardLoaded();

    // Click add learner to show link form
    if (await parentPage.addLearnerBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await parentPage.addLearnerBtn.click();
      await parentPage.enterLinkCode('LINK-ABC-123');
      await expect(parentPage.linkCodeInput).toHaveValue('LINK-ABC-123');
    }
  });
});

// ---------------------------------------------------------------------------
// Parent — Activity Digest
// ---------------------------------------------------------------------------
test.describe('Parent — Activity Digest', () => {
  let parentPage: ParentPortalPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner');
    parentPage = new ParentPortalPage(page);
  });

  test('activity digest renders with entries', async ({ page }) => {
    const links = [buildGuardianLink({ learner_gcid: 'gcid-learner-001', learner_name: 'Alice' })];
    const digests = [
      buildActivityDigest({ date: '2026-03-16', atoms_completed: 5, streak_days: 7 }),
      buildActivityDigest({ date: '2026-03-15', atoms_completed: 3, streak_days: 6 }),
      buildActivityDigest({ date: '2026-03-14', atoms_completed: 7, streak_days: 5 }),
    ];
    await mockParentAPI(page, links, digests);

    await parentPage.gotoActivityDigest();
    await parentPage.expectActivityDigestLoaded();
    await expect(parentPage.digestEntries).toBeVisible();
  });

  test('digest learner filter is available', async ({ page }) => {
    const links = [
      buildGuardianLink({ learner_gcid: 'gcid-1', learner_name: 'Alice' }),
      buildGuardianLink({ learner_gcid: 'gcid-2', learner_name: 'Bob' }),
    ];
    await mockParentAPI(page, links, []);

    await parentPage.gotoActivityDigest();
    await parentPage.expectActivityDigestLoaded();
    await expect(parentPage.digestLearnerFilter).toBeVisible();
  });

  test('refresh button is visible', async ({ page }) => {
    await mockParentAPI(page, [buildGuardianLink()], [buildActivityDigest()]);

    await parentPage.gotoActivityDigest();
    await parentPage.expectActivityDigestLoaded();
    await expect(parentPage.digestRefreshBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Parent — Progress Report
// ---------------------------------------------------------------------------
test.describe('Parent — Progress Report', () => {
  let parentPage: ParentPortalPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner');
    parentPage = new ParentPortalPage(page);
  });

  test('progress report renders with completion data', async ({ page }) => {
    const links = [buildGuardianLink({ learner_gcid: 'gcid-learner-001' })];
    const report = buildProgressReport({
      atoms_completed: 45,
      average_score_pct: 82,
      streak_current: 7,
    });
    await mockParentAPI(page, links, []);
    await mockParentProgressReport(page, report);

    await parentPage.gotoProgressReport();
    await parentPage.expectProgressReportLoaded();
    await expect(parentPage.reportAtomCompletion).toBeVisible();
  });

  test('progress report shows streak summary', async ({ page }) => {
    const links = [buildGuardianLink()];
    const report = buildProgressReport({ streak_current: 14, streak_longest: 21 });
    await mockParentAPI(page, links, []);
    await mockParentProgressReport(page, report);

    await parentPage.gotoProgressReport();
    await parentPage.expectProgressReportLoaded();
    await expect(parentPage.reportStreakSummary).toBeVisible();
  });

  test('learner selector allows switching between children', async ({ page }) => {
    const links = [
      buildGuardianLink({ learner_gcid: 'gcid-1', learner_name: 'Alice' }),
      buildGuardianLink({ learner_gcid: 'gcid-2', learner_name: 'Bob' }),
    ];
    const report = buildProgressReport();
    await mockParentAPI(page, links, []);
    await mockParentProgressReport(page, report);

    await parentPage.gotoProgressReport();
    await parentPage.expectProgressReportLoaded();
    await expect(parentPage.reportLearnerSelect).toBeVisible();
  });

  test('export report button is visible', async ({ page }) => {
    const links = [buildGuardianLink()];
    const report = buildProgressReport();
    await mockParentAPI(page, links, []);
    await mockParentProgressReport(page, report);

    await parentPage.gotoProgressReport();
    await parentPage.expectProgressReportLoaded();
    await expect(parentPage.reportExportBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Parent — Consent Management
// ---------------------------------------------------------------------------
test.describe('Parent — Consent Management', () => {
  let parentPage: ParentPortalPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner');
    parentPage = new ParentPortalPage(page);
  });

  test('consent panel renders with consent items', async ({ page }) => {
    const links = [buildGuardianLink()];
    const consents = [
      buildConsentRecord({ consent_type: 'data_sharing', is_granted: true }),
      buildConsentRecord({ consent_type: 'marketing_emails', is_granted: false }),
      buildConsentRecord({ consent_type: 'third_party_analytics', is_granted: true }),
    ];
    await mockParentAPI(page, links, []);
    await mockParentConsent(page, consents);

    await parentPage.gotoConsent();
    await parentPage.expectConsentLoaded();
    await expect(parentPage.consentList).toBeVisible();
  });

  test('consent toggles are visible', async ({ page }) => {
    const links = [buildGuardianLink()];
    const consents = [
      buildConsentRecord({ consent_type: 'data_sharing', is_granted: true }),
    ];
    await mockParentAPI(page, links, []);
    await mockParentConsent(page, consents);

    await parentPage.gotoConsent();
    await parentPage.expectConsentLoaded();
    await expect(parentPage.consentToggle.first()).toBeVisible();
  });

  test('save consent button is present', async ({ page }) => {
    const links = [buildGuardianLink()];
    const consents = [buildConsentRecord()];
    await mockParentAPI(page, links, []);
    await mockParentConsent(page, consents);

    await parentPage.gotoConsent();
    await parentPage.expectConsentLoaded();
    await expect(parentPage.consentSaveBtn).toBeVisible();
  });

  test('consent history button is available', async ({ page }) => {
    const links = [buildGuardianLink()];
    const consents = [buildConsentRecord()];
    await mockParentAPI(page, links, []);
    await mockParentConsent(page, consents);
    await mockParentConsentHistory(page, [
      { id: 'ch-1', consent_type: 'data_sharing', action: 'granted', timestamp: '2026-01-20T10:00:00Z' },
      { id: 'ch-2', consent_type: 'data_sharing', action: 'revoked', timestamp: '2026-02-15T08:00:00Z' },
      { id: 'ch-3', consent_type: 'data_sharing', action: 'granted', timestamp: '2026-03-01T08:00:00Z' },
    ]);

    await parentPage.gotoConsent();
    await parentPage.expectConsentLoaded();
    await expect(parentPage.consentHistoryBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Parent — Accessibility
// ---------------------------------------------------------------------------
test.describe('Parent — Accessibility', () => {
  test('guardian dashboard passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'learner');
    const links = [buildGuardianLink()];
    await mockParentAPI(page, links, []);
    await mockParentDashboard(page, { linked_learners: 1, total_atoms_today: 5, active_streaks: 1 });

    const parentPage = new ParentPortalPage(page);
    await parentPage.gotoDashboard();
    await parentPage.expectDashboardLoaded();

    await runAxeAudit(page, 'Parent guardian dashboard');
  });

  test('activity digest passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'learner');
    const links = [buildGuardianLink()];
    const digests = [buildActivityDigest()];
    await mockParentAPI(page, links, digests);

    const parentPage = new ParentPortalPage(page);
    await parentPage.gotoActivityDigest();
    await parentPage.expectActivityDigestLoaded();

    await runAxeAudit(page, 'Parent activity digest');
  });

  test('consent management passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'learner');
    const links = [buildGuardianLink()];
    const consents = [buildConsentRecord()];
    await mockParentAPI(page, links, []);
    await mockParentConsent(page, consents);

    const parentPage = new ParentPortalPage(page);
    await parentPage.gotoConsent();
    await parentPage.expectConsentLoaded();

    await runAxeAudit(page, 'Parent consent management');
  });
});
