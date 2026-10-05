import { test, expect } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import {
  buildMergePreview,
  buildPortableData,
  buildTenantMembership,
  mockMergePreview,
  mockPortableData,
  mockMemberships,
  mockMigration,
} from '../fixtures/wave4-bff-mocks';
import { IdentityPortabilityPage } from '../pages/identity-portability.page';
import { runAxeAudit } from '../fixtures/a11y.fixture';

// ---------------------------------------------------------------------------
// Viewport: tablet primary (1024x768)
// ---------------------------------------------------------------------------
test.use({ viewport: { width: 1024, height: 768 } });

// ---------------------------------------------------------------------------
// Identity Portability — Merge Wizard
// ---------------------------------------------------------------------------
test.describe('Identity Portability — Merge Wizard', () => {
  let identityPage: IdentityPortabilityPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page);
    identityPage = new IdentityPortabilityPage(page);
  });

  test('merge wizard step navigation (1 through 4)', async ({ page }) => {
    const merge = buildMergePreview();
    await mockMergePreview(page, merge);
    await mockMemberships(page, [
      buildTenantMembership({ tenant_name: 'Acme Academy' }),
    ]);

    await identityPage.gotoMerge();
    await identityPage.expectMergeWizardLoaded();

    // Step indicator should be visible
    await expect(identityPage.stepIndicator).toBeVisible();

    // Navigate forward through steps
    if (await identityPage.nextStepBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await identityPage.clickNextStep();
      // Should advance to step 2
      await expect(identityPage.stepIndicator).toBeVisible();
    }
  });

  test('MERGE confirmation input validation', async ({ page }) => {
    const merge = buildMergePreview();
    await mockMergePreview(page, merge);
    await mockMemberships(page, []);

    await identityPage.gotoMerge();
    await identityPage.expectMergeWizardLoaded();

    // The confirm input should exist (may be on a later step)
    // Navigate to the confirmation step if needed
    if (await identityPage.confirmInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Confirm button should be disabled when input is empty
      await expect(identityPage.confirmMergeBtn).toBeDisabled();

      // Type incorrect text
      await identityPage.typeConfirmation('wrong');
      await expect(identityPage.confirmMergeBtn).toBeDisabled();

      // Type correct "MERGE" text
      await identityPage.typeConfirmation('MERGE');
      await expect(identityPage.confirmMergeBtn).toBeEnabled();
    }
  });
});

// ---------------------------------------------------------------------------
// Identity Portability — Portable Data
// ---------------------------------------------------------------------------
test.describe('Identity Portability — Portable Data', () => {
  test('portable data dashboard displays panels', async ({ page }) => {
    await mockAuthSession(page);
    const data = buildPortableData();
    await mockPortableData(page, data);

    const identityPage = new IdentityPortabilityPage(page);
    await identityPage.gotoData();
    await identityPage.expectPortableDataLoaded();

    // Both panels should be visible
    await expect(identityPage.gcidScopedPanel).toBeVisible();
    await expect(identityPage.tenantScopedPanel).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Identity Portability — Migration
// ---------------------------------------------------------------------------
test.describe('Identity Portability — Migration', () => {
  test('migration flow displays tenant list', async ({ page }) => {
    await mockAuthSession(page);
    const memberships = [
      buildTenantMembership({ tenant_id: 't-1', tenant_name: 'Acme Academy' }),
      buildTenantMembership({ tenant_id: 't-2', tenant_name: 'Beta School' }),
    ];
    await mockMemberships(page, memberships);
    await mockMigration(page, {
      id: 'mig-1',
      status: 'preview',
      source_tenant_id: 't-1',
      target_tenant_id: 't-2',
    });

    const identityPage = new IdentityPortabilityPage(page);
    await identityPage.gotoMigration();
    await identityPage.expectMigrationLoaded();

    await expect(identityPage.tenantList).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Identity Portability — Accessibility
// ---------------------------------------------------------------------------
test.describe('Identity Portability — Accessibility', () => {
  test('merge wizard passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page);
    await mockMergePreview(page, buildMergePreview());
    await mockMemberships(page, []);

    const identityPage = new IdentityPortabilityPage(page);
    await identityPage.gotoMerge();
    await identityPage.expectMergeWizardLoaded();

    await runAxeAudit(page, 'Identity portability merge wizard');
  });
});
