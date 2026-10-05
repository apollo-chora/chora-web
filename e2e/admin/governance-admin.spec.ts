import { test, expect } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import {
  buildRestriction,
  buildAppeal,
  buildKYCVerification,
  mockGovernanceRestrictions,
  mockGovernanceAppeals,
  mockGovernanceKYC,
  mockGovernanceModeration,
  buildModerationAction,
} from '../fixtures/wave4-bff-mocks';
import { GovernanceAdminPage } from '../pages/governance-admin.page';
import { runAxeAudit } from '../fixtures/a11y.fixture';

// ---------------------------------------------------------------------------
// Viewport: tablet primary (1024x768)
// ---------------------------------------------------------------------------
test.use({ viewport: { width: 1024, height: 768 } });

// ---------------------------------------------------------------------------
// Governance Admin — Restrictions
// ---------------------------------------------------------------------------
test.describe('Governance Admin — Restrictions', () => {
  let govPage: GovernanceAdminPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin', [
      'learner_engagement',
      'knowledge_graph',
      'CHORAVERSE',
      'governance_trust',
    ]);
    govPage = new GovernanceAdminPage(page);
  });

  test('displays restriction list with mock data', async ({ page }) => {
    const restrictions = [
      buildRestriction({
        id: 'r-1',
        target_gcid: 'gcid-1',
        tier: 'warning',
        status: 'active',
      }),
      buildRestriction({
        id: 'r-2',
        target_gcid: 'gcid-2',
        tier: 'suspended',
        status: 'active',
      }),
      buildRestriction({
        id: 'r-3',
        target_gcid: 'gcid-3',
        tier: 'warning',
        status: 'lifted',
      }),
    ];
    await mockGovernanceRestrictions(page, restrictions);

    await govPage.gotoRestrictions();
    await govPage.expectRestrictionsLoaded();
    await expect(govPage.restrictionList).toBeVisible();
  });

  test('filters restrictions by tier', async ({ page }) => {
    const restrictions = [
      buildRestriction({ tier: 'warning', status: 'active' }),
      buildRestriction({ tier: 'suspended', status: 'active' }),
    ];
    await mockGovernanceRestrictions(page, restrictions);

    await govPage.gotoRestrictions();
    await govPage.expectRestrictionsLoaded();
    await govPage.filterByTier('warning');
    // Filter is applied client-side; UI should respond
    await expect(govPage.tierFilter).toHaveValue('warning');
  });

  test('filters restrictions by status', async ({ page }) => {
    const restrictions = [
      buildRestriction({ status: 'active' }),
      buildRestriction({ status: 'lifted' }),
    ];
    await mockGovernanceRestrictions(page, restrictions);

    await govPage.gotoRestrictions();
    await govPage.expectRestrictionsLoaded();
    await govPage.filterByStatus('active');
    await expect(govPage.statusFilter).toHaveValue('active');
  });
});

// ---------------------------------------------------------------------------
// Governance Admin — Appeals & KYC Navigation
// ---------------------------------------------------------------------------
test.describe('Governance Admin — Navigation', () => {
  let govPage: GovernanceAdminPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin', [
      'learner_engagement',
      'knowledge_graph',
      'CHORAVERSE',
      'governance_trust',
    ]);
    govPage = new GovernanceAdminPage(page);
  });

  test('navigates to appeals page and displays appeal list', async ({ page }) => {
    const appeals = [
      buildAppeal({ id: 'a-1', status: 'pending' }),
      buildAppeal({ id: 'a-2', status: 'approved' }),
    ];
    await mockGovernanceAppeals(page, appeals);

    await govPage.gotoAppeals();
    await govPage.expectAppealsLoaded();
    await expect(govPage.appealList).toBeVisible();
  });

  test('navigates to KYC review page', async ({ page }) => {
    const verifications = [
      buildKYCVerification({ id: 'kyc-1', status: 'pending' }),
    ];
    await mockGovernanceKYC(page, verifications);

    await govPage.gotoKYC();
    await govPage.expectKYCLoaded();
    await expect(govPage.kycList).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Governance Admin — Accessibility
// ---------------------------------------------------------------------------
test.describe('Governance Admin — Accessibility', () => {
  test('restriction dashboard passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin', [
      'learner_engagement',
      'knowledge_graph',
      'CHORAVERSE',
      'governance_trust',
    ]);
    await mockGovernanceRestrictions(page, [
      buildRestriction({ tier: 'warning' }),
      buildRestriction({ tier: 'suspended' }),
    ]);

    const govPage = new GovernanceAdminPage(page);
    await govPage.gotoRestrictions();
    await govPage.expectRestrictionsLoaded();

    await runAxeAudit(page, 'Governance restriction dashboard');
  });
});
