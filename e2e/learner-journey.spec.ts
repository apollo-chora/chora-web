import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/login.page';
import { RegisterPage } from './pages/register.page';
import { DashboardPage } from './pages/dashboard.page';
import { AtomListPage } from './pages/atom-list.page';
import { AtomPlayerPage } from './pages/atom-player.page';
import { FamiliarChatPage } from './pages/familiar-chat.page';
import { RewardStorePage } from './pages/reward-store.page';
import { mockAuthSession } from './fixtures/auth-mocks';
import {
  mockDashboard,
  mockLeaderboard,
  mockGoals,
  mockAtomList,
  mockTopicTree,
  mockDailyDose,
} from './fixtures/bff-mocks';
import {
  mockSkinCatalog,
  mockCoinAccount,
  mockFamiliarPersona,
  mockFamiliarChatHistory,
  buildSkin,
  buildCoinAccount,
  buildPersonaSnapshot,
  buildChatMessage,
} from './fixtures/wave4-bff-mocks';
import { buildAtom, buildTopicNode, buildDailyDose } from './fixtures/test-builders';

// ---------------------------------------------------------------------------
// Mock helpers — journey-specific composite mocks
// ---------------------------------------------------------------------------

/**
 * Sets up all API mocks required for the full learner journey.
 * Combines auth, content, engagement, gamification, social, and familiar mocks.
 */
async function mockFullJourney(page: import('@playwright/test').Page): Promise<void> {
  await mockAuthSession(page, 'learner', [
    'learner_engagement',
    'knowledge_graph',
    'CHORAVERSE',
    'social',
    'discovery_economy',
    'familiar',
    'communication',
  ]);

  // Content mocks
  const atoms = [
    buildAtom({ id: 'atom-journey-001' }),
    buildAtom({ id: 'atom-journey-002', atomType: 'FILL_BLANK', difficulty: 3 }),
    buildAtom({ id: 'atom-journey-003', atomType: 'TRUE_FALSE', difficulty: 1 }),
  ];
  await mockAtomList(page, atoms);
  await mockTopicTree(page, [
    buildTopicNode({ id: 'topic-math', name: 'Mathematics' }),
    buildTopicNode({ id: 'topic-science', name: 'Science', parent_id: null }),
  ]);

  // Engagement mocks
  await mockDashboard(page, {
    daily_dose_status: 'available',
    active_goals_count: 2,
  });
  await mockGoals(page);
  await mockLeaderboard(page);
  await mockDailyDose(page, buildDailyDose());

  // Gamification mocks
  await mockSkinCatalog(page, [
    buildSkin({ id: 'skin-001', name: 'Golden Familiar', rarity: 'epic' }),
    buildSkin({ id: 'skin-002', name: 'Silver Shield', rarity: 'rare' }),
  ]);
  await mockCoinAccount(page, buildCoinAccount({ balance: 1250 }));

  // Familiar mocks
  await mockFamiliarPersona(page, buildPersonaSnapshot({
    familiar_name: 'Spark',
    evolution_stage: 'adolescent',
    mood: 'enthusiastic',
  }));
  await mockFamiliarChatHistory(page, [
    buildChatMessage({ role: 'familiar', content: 'Hello! Ready to learn today?' }),
    buildChatMessage({ role: 'learner', content: 'Yes, let me start with algebra.' }),
  ]);

  // Social feed mock (GraphQL-based via BFF)
  await page.route('**/api/v1/graphql', async (route, request) => {
    const body = request.postDataJSON() as Record<string, unknown>;
    const query = (body['query'] as string) ?? '';

    // Social feed query
    if (query.includes('myFeed')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            myFeed: {
              edges: [
                {
                  node: {
                    id: 'feed-001',
                    eventType: 'streak_milestone',
                    actorDisplayName: 'Alice',
                    message: 'Alice reached a 10-day streak!',
                    createdAt: new Date().toISOString(),
                  },
                },
                {
                  node: {
                    id: 'feed-002',
                    eventType: 'skin_earned',
                    actorDisplayName: 'Bob',
                    message: 'Bob earned the Golden Familiar skin!',
                    createdAt: new Date().toISOString(),
                  },
                },
              ],
              pageInfo: { hasNextPage: false },
            },
          },
        }),
      });
      return;
    }

    // Leaderboard query
    if (query.includes('leaderboard')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            leaderboard: {
              entries: [
                { rank: 1, displayName: 'Top Learner', totalXp: 5000, level: 15, streakDays: 30 },
                { rank: 2, displayName: 'Test Learner', totalXp: 2450, level: 8, streakDays: 5 },
              ],
              learnerRank: { rank: 2, displayName: 'Test Learner', totalXp: 2450 },
              period: 'weekly',
              scope: 'tenant',
            },
          },
        }),
      });
      return;
    }

    // XP query
    if (query.includes('myXP')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            myXP: {
              totalXp: 2450,
              level: 8,
              xpToNextLevel: 550,
              comboMultiplier: 2,
            },
          },
        }),
      });
      return;
    }

    // Notifications query
    if (query.includes('myNotifications')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            myNotifications: {
              edges: [
                {
                  node: {
                    id: 'notif-001',
                    channel: 'in_app',
                    eventType: 'streak_at_risk',
                    title: 'Streak at risk!',
                    body: 'Complete one atom today to keep your streak.',
                    readAt: null,
                    createdAt: new Date().toISOString(),
                  },
                },
              ],
              pageInfo: { hasNextPage: false },
              unreadCount: 1,
            },
          },
        }),
      });
      return;
    }

    // Default: fall through to other mocks (atom list, topic tree, etc.)
    await route.fallback();
  });

  // Notification bell / list (REST endpoint for communication service)
  await page.route('**/api/v1/communication/notifications**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: 'notif-001',
            channel: 'in_app',
            event_type: 'streak_at_risk',
            title: 'Streak at risk!',
            body: 'Complete one atom today to keep your streak.',
            read_at: null,
            created_at: new Date().toISOString(),
          },
        ],
        unread_count: 1,
        page_info: { has_next: false },
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// Full Learner Journey E2E Spec
// ---------------------------------------------------------------------------

test.describe('Full Learner Journey — E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test('01 — navigate to login page', async ({ page }) => {
    await mockFullJourney(page);

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.expectVisible();
  });

  test('02 — navigate to register page from login', async ({ page }) => {
    await mockFullJourney(page);

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.expectVisible();
    await loginPage.navigateToRegister();

    const registerPage = new RegisterPage(page);
    await registerPage.expectFormVisible();
  });

  test('03 — register a new account', async ({ page }) => {
    await mockFullJourney(page);

    // Mock registration endpoint
    await page.route('**/api/v1/auth/register', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            gcid: 'gcid-new-001',
            access_token: 'mock-new-jwt',
          }),
        });
      } else {
        await route.fallback();
      }
    });

    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.expectFormVisible();
    await registerPage.fillForm('newuser@test.chora.io', 'New E2E User');
    await registerPage.submit();

    // After registration, expect redirect or check-email state
    await registerPage.expectCheckEmailVisible();
  });

  test('04 — view dashboard after authentication', async ({ page }) => {
    await mockFullJourney(page);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();

    // DailyDose widget should be visible (status: available)
    await dashboard.expectDoseAvailable();
  });

  test('05 — browse atoms in learning view', async ({ page }) => {
    await mockFullJourney(page);

    const atomList = new AtomListPage(page);
    await atomList.goto();
    await atomList.expectLoaded();

    const count = await atomList.getAtomCardCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('06 — open atom player and answer an atom', async ({ page }) => {
    await mockFullJourney(page);

    const player = new AtomPlayerPage(page);
    await player.goto('atom-journey-001');
    await player.expectLoaded();

    // Submit answer
    await player.submitAnswer();
    await player.expectFeedbackVisible();
    await player.expectCorrectFeedback();
  });

  test('07 — check XP after answering', async ({ page }) => {
    await mockFullJourney(page);

    // Navigate to dashboard — XP widget should show updated XP
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();

    // Verify the XP section is rendered in the dashboard grid
    await expect(dashboard.grid).toBeVisible();
  });

  test('08 — view familiar companion', async ({ page }) => {
    await mockFullJourney(page);

    const familiar = new FamiliarChatPage(page);
    await familiar.gotoPersona();
    await familiar.expectPersonaLoaded();

    // Verify familiar name is displayed
    await expect(familiar.familiarName).toBeVisible();
  });

  test('09 — browse social feed', async ({ page }) => {
    await mockFullJourney(page);

    // Mock the social feed page route
    await page.route('**/api/v1/social/feed**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'feed-001',
              event_type: 'streak_milestone',
              actor_display_name: 'Alice',
              message: 'Alice reached a 10-day streak!',
              created_at: new Date().toISOString(),
            },
          ],
          page_info: { has_next: false },
        }),
      });
    });

    await page.goto('/social/feed');
    await page.waitForLoadState('networkidle');

    // Social feed container should be rendered
    const feedContainer = page.locator('[data-testid="social-feed"]');
    await expect(feedContainer).toBeVisible();
  });

  test('10 — view leaderboard', async ({ page }) => {
    await mockFullJourney(page);

    // Navigate to leaderboard section (typically under engagement)
    await page.goto('/learning/leaderboard');
    await page.waitForLoadState('networkidle');

    const leaderboardContainer = page.locator('[data-testid="leaderboard"]');
    await expect(leaderboardContainer).toBeVisible();
  });

  test('11 — browse skins in reward store', async ({ page }) => {
    await mockFullJourney(page);

    const store = new RewardStorePage(page);
    await store.gotoSkins();
    await store.expectSkinsLoaded();

    const skinCount = await store.getSkinCardCount();
    expect(skinCount).toBeGreaterThanOrEqual(1);
  });

  test('12 — check coin balance in reward store', async ({ page }) => {
    await mockFullJourney(page);

    const store = new RewardStorePage(page);
    await store.gotoStore();
    await store.expectStoreLoaded();

    // Coin balance should be visible somewhere in the store header
    const coinBalance = page.locator('[data-testid="coin-balance"]');
    await expect(coinBalance).toBeVisible();
  });

  test('13 — view notifications', async ({ page }) => {
    await mockFullJourney(page);

    // Navigate to dashboard where notification bell is visible
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();

    // Notification indicator should show unread count
    const notificationBell = page.locator('[data-testid="notification-bell"]');
    await expect(notificationBell).toBeVisible();

    // Click to expand notification panel
    await notificationBell.click();

    const notificationPanel = page.locator('[data-testid="notification-panel"]');
    await expect(notificationPanel).toBeVisible();
  });

  test('14 — logout clears session', async ({ page }) => {
    await mockFullJourney(page);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();

    // Click user menu -> logout
    const userMenu = page.locator('[data-testid="user-menu"]');
    await userMenu.click();

    const logoutButton = page.locator('[data-testid="logout-btn"]');
    await logoutButton.click();

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);

    const loginPage = new LoginPage(page);
    await loginPage.expectVisible();
  });
});
