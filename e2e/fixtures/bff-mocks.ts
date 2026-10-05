import { type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Paginated response (BFF cursor pagination)
// ---------------------------------------------------------------------------

export interface MockPaginatedResponse<T> {
  items: T[];
  cursor: string | null;
  total: number;
}

// ---------------------------------------------------------------------------
// GraphQL mock (AtomService uses POST /api/v1/graphql)
// ---------------------------------------------------------------------------

export async function mockGraphQL(
  page: Page,
  handler: (body: Record<string, unknown>) => unknown,
): Promise<void> {
  await page.route('**/api/v1/graphql', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const result = handler(body);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(result),
    });
  });
}

/**
 * Mock atom list GraphQL response.
 */
export async function mockAtomList(
  page: Page,
  atoms: Record<string, unknown>[],
): Promise<void> {
  await mockGraphQL(page, (body) => {
    const query = body['query'] as string;
    if (query.includes('ListAtoms')) {
      return {
        data: {
          atoms: {
            edges: atoms.map((a, i) => ({ node: a, cursor: `cursor-${i}` })),
            pageInfo: {
              hasNextPage: false,
              hasPreviousPage: false,
              startCursor: atoms.length ? 'cursor-0' : null,
              endCursor: atoms.length ? `cursor-${atoms.length - 1}` : null,
            },
            totalCount: atoms.length,
          },
        },
      };
    }
    if (query.includes('GetAtom')) {
      const vars = body['variables'] as Record<string, unknown>;
      const atom = atoms.find((a) => a['id'] === vars['id']) ?? atoms[0] ?? null;
      return { data: { atom } };
    }
    if (query.includes('ValidateAnswer')) {
      return {
        data: {
          validateAnswer: {
            correct: true,
            atomId: 'atom-001',
            revisionId: 'rev-001',
            explanation: 'Correct answer!',
            expectedAnswer: null,
            confidence: 0.95,
            ruleType: 'EXACT_MATCH',
          },
        },
      };
    }
    return { data: null };
  });
}

// ---------------------------------------------------------------------------
// Dashboard mock (REST — matches domain.DashboardResponse snake_case)
// ---------------------------------------------------------------------------

export async function mockDashboard(
  page: Page,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  const dashboard = {
    streak: {
      current_days: 5,
      status: 'active',
      longest_streak: 12,
      last_activity_at: new Date().toISOString(),
    },
    xp: {
      total_xp: 2450,
      level: 8,
      xp_to_next_level: 550,
      combo_multiplier: 2,
    },
    level: 8,
    daily_dose_status: 'available',
    active_goals_count: 1,
    path_progress: [
      {
        path_id: 'path-001',
        path_title: 'Algebra Foundations',
        completion_pct: 65,
        steps_completed: 13,
        steps_total: 20,
      },
    ],
    ...overrides,
  };

  await page.route('**/api/v1/engagement/dashboard', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(dashboard),
    });
  });
}

// ---------------------------------------------------------------------------
// Goals mock (REST — matches domain.GoalChallenge snake_case)
// ---------------------------------------------------------------------------

export async function mockGoals(
  page: Page,
  goals: Record<string, unknown>[] = [],
): Promise<void> {
  const defaultGoals = goals.length > 0 ? goals : [
    {
      id: 'goal-001',
      tenant_id: 'tenant-001',
      assignee_gcid: 'gcid-001',
      created_by: 'instructor-001',
      title: 'Master Algebra',
      description: 'Complete 20 algebra atoms',
      target_scope: { type: 'atom_count', topic_id: null, target_value: 20 },
      deadline: '2026-04-01T00:00:00Z',
      bounty_star_credits: 50,
      status: 'active',
      progress_pct: 60,
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-12T00:00:00Z',
    },
  ];

  await page.route('**/api/v1/engagement/goals', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: defaultGoals,
        page_info: { has_next: false },
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// Leaderboard mock (REST — matches backend snake_case)
// ---------------------------------------------------------------------------

export async function mockLeaderboard(
  page: Page,
  period: string = 'weekly',
): Promise<void> {
  await page.route('**/api/v1/engagement/leaderboard**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        entries: [
          { rank: 1, gcid: 'gcid-top', display_name: 'Top Learner', avatar_url: null, total_xp: 5000, level: 15, streak_days: 30 },
          { rank: 2, gcid: 'gcid-test', display_name: 'Test Learner', avatar_url: null, total_xp: 2450, level: 8, streak_days: 5 },
        ],
        learner_rank: { rank: 2, gcid: 'gcid-test', display_name: 'Test Learner', avatar_url: null, total_xp: 2450, level: 8, streak_days: 5 },
        period,
        scope: 'tenant',
        page_info: { has_next: false },
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// DailyDose mock (REST)
// ---------------------------------------------------------------------------

export async function mockDailyDose(page: Page, dose: unknown): Promise<void> {
  await page.route('**/api/v1/engagement/daily-dose', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(dose),
    });
  });
}

// ---------------------------------------------------------------------------
// Tenant entitlements mock
// ---------------------------------------------------------------------------

export async function mockTenantEntitlements(
  page: Page,
  addOns: string[],
): Promise<void> {
  await page.route('**/api/v1/tenants/current/entitlements', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled_add_ons: addOns }),
    });
  });
}

// ---------------------------------------------------------------------------
// Topic tree mock (REST)
// ---------------------------------------------------------------------------

export async function mockTopicTree(
  page: Page,
  topics: Record<string, unknown>[] = [],
): Promise<void> {
  await page.route('**/api/v1/topics**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: topics, total: topics.length }),
    });
  });
}
