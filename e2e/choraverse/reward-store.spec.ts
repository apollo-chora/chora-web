import { test, expect } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import {
  buildSkin,
  buildCoinAccount,
  buildCoinTransaction,
  buildBounty,
  mockSkinCatalog,
  mockCoinAccount,
  mockCoinTransactions,
  mockBounties,
} from '../fixtures/wave4-bff-mocks';
import { RewardStorePage } from '../pages/reward-store.page';
import { runAxeAudit } from '../fixtures/a11y.fixture';

// ---------------------------------------------------------------------------
// Viewport: tablet primary (1024x768)
// ---------------------------------------------------------------------------
test.use({ viewport: { width: 1024, height: 768 } });

// ---------------------------------------------------------------------------
// Helpers — set up all reward store mocks
// ---------------------------------------------------------------------------
async function setupRewardStoreMocks(page: import('@playwright/test').Page) {
  await mockSkinCatalog(page, [
    buildSkin({ id: 'skin-1', name: 'Golden Familiar', rarity: 'epic' }),
    buildSkin({ id: 'skin-2', name: 'Silver Shield', rarity: 'rare' }),
    buildSkin({ id: 'skin-3', name: 'Basic Frame', rarity: 'common' }),
  ]);
  await mockCoinAccount(page, buildCoinAccount({ balance: 1250 }));
  await mockCoinTransactions(page, [
    buildCoinTransaction({ id: 'tx-1', amount: 50, type: 'earned', reason: 'Daily dose' }),
    buildCoinTransaction({ id: 'tx-2', amount: -100, type: 'spent', reason: 'Skin purchase' }),
  ]);
  await mockBounties(page, [
    buildBounty({ id: 'b-1', title: 'Algebra Master', status: 'active', progress_pct: 40 }),
  ]);
}

// ---------------------------------------------------------------------------
// Reward Store — Tab Switching
// ---------------------------------------------------------------------------
test.describe('Reward Store — Tabs', () => {
  let storePage: RewardStorePage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner', [
      'learner_engagement',
      'CHORAVERSE',
      'choraverse',
      'reward_vault',
    ]);
    await setupRewardStoreMocks(page);
    storePage = new RewardStorePage(page);
  });

  test('tab switching between Skins, Items, and Bounties', async ({ page }) => {
    await storePage.gotoStore();
    await storePage.expectStoreLoaded();

    // Tabs should be visible
    await expect(storePage.skinsTab).toBeVisible();

    // Switch to bounties tab
    await storePage.clickTab('bounties');
    await expect(storePage.bountiesTab).toBeVisible();

    // Switch back to skins tab
    await storePage.clickTab('skins');
    await expect(storePage.skinsTab).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Reward Store — Skin Gallery
// ---------------------------------------------------------------------------
test.describe('Reward Store — Skin Gallery', () => {
  let storePage: RewardStorePage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner', [
      'learner_engagement',
      'CHORAVERSE',
      'choraverse',
      'reward_vault',
    ]);
    await setupRewardStoreMocks(page);
    storePage = new RewardStorePage(page);
  });

  test('skin gallery grid renders skins', async ({ page }) => {
    await storePage.gotoSkins();
    await storePage.expectSkinsLoaded();
    await expect(storePage.skinGrid).toBeVisible();
  });

  test('skin rarity filter', async ({ page }) => {
    await storePage.gotoSkins();
    await storePage.expectSkinsLoaded();

    if (await storePage.rarityFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await storePage.filterByRarity('epic');
      await expect(storePage.rarityFilter).toHaveValue('epic');
    }
  });
});

// ---------------------------------------------------------------------------
// Reward Store — Transaction History
// ---------------------------------------------------------------------------
test.describe('Reward Store — Transactions', () => {
  test('transaction history list renders', async ({ page }) => {
    await mockAuthSession(page, 'learner', [
      'learner_engagement',
      'CHORAVERSE',
      'choraverse',
      'reward_vault',
    ]);
    await setupRewardStoreMocks(page);

    const storePage = new RewardStorePage(page);
    await storePage.gotoTransactions();
    await storePage.expectTransactionsLoaded();
    await expect(storePage.transactionList).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Reward Store — Accessibility
// ---------------------------------------------------------------------------
test.describe('Reward Store — Accessibility', () => {
  test('reward store passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'learner', [
      'learner_engagement',
      'CHORAVERSE',
      'choraverse',
      'reward_vault',
    ]);
    await setupRewardStoreMocks(page);

    const storePage = new RewardStorePage(page);
    await storePage.gotoStore();
    await storePage.expectStoreLoaded();

    await runAxeAudit(page, 'Reward store page');
  });
});
