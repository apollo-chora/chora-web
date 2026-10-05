import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Atom builder (GraphQL response shape — camelCase)
// ---------------------------------------------------------------------------

export function buildAtom(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const id = randomUUID();
  const revId = randomUUID();
  return {
    id,
    tenantId: 'tenant-001',
    atomType: 'MCQ',
    difficulty: 2,
    languageCode: 'en',
    tags: ['algebra', 'basics'],
    status: 'PUBLISHED',
    createdBy: 'gcid-instructor-001',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    latestRevision: {
      id: revId,
      atomId: id,
      revisionNumber: 1,
      content: {
        question: 'What is 2 + 2?',
        options: ['3', '4', '5', '6'],
        correct_index: 1,
      },
      validationRules: [
        {
          ruleType: 'EXACT_MATCH',
          expected: '4',
          tolerance: null,
          caseSensitive: false,
        },
      ],
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// DailyDose builder (REST response — camelCase from BFF)
// ---------------------------------------------------------------------------

export function buildDailyDose(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    atoms: Array.from({ length: 5 }, (_, i) =>
      buildAtom({ id: randomUUID(), latestRevision: { ...buildAtom()['latestRevision'] as Record<string, unknown>, id: randomUUID() } }),
    ),
    streak_day: 3,
    combo_multiplier: 2,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Topic node builder
// ---------------------------------------------------------------------------

export function buildTopicNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    name: 'Algebra',
    parent_id: null,
    depth: 0,
    atom_count: 10,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Dashboard data builder (snake_case — matches backend DashboardResponse)
// ---------------------------------------------------------------------------

export function buildDashboardData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    active_goals_count: 0,
    path_progress: [],
    ...overrides,
  };
}
