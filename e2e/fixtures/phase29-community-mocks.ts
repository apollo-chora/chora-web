import { type Page } from '@playwright/test';
import { randomUUID } from 'crypto';

// ===========================================================================
// Builders — Community
// ===========================================================================

export function buildAtomSubmission(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: 'tenant-001',
    submitter_gcid: 'gcid-learner-001',
    title: 'Quadratic Equations Basics',
    content: {
      question: 'What is the quadratic formula?',
      options: ['x = -b +/- sqrt(b^2 - 4ac) / 2a', 'x = b / 2a', 'x = -b / a', 'x = sqrt(b^2 - 4ac)'],
      correct_index: 0,
    },
    atom_type: 'MCQ',
    tags: ['algebra', 'quadratics'],
    status: 'pending_review',
    submitted_at: '2026-03-14T10:00:00Z',
    updated_at: '2026-03-14T10:00:00Z',
    review_count: 0,
    ...overrides,
  };
}

export function buildPeerReview(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    submission_id: randomUUID(),
    reviewer_gcid: 'gcid-learner-002',
    decision: 'pending',
    feedback: '',
    quality_score: null,
    accuracy_score: null,
    clarity_score: null,
    created_at: '2026-03-14T11:00:00Z',
    updated_at: '2026-03-14T11:00:00Z',
    submission_title: 'Quadratic Equations Basics',
    submitter_display_name: 'Test Learner',
    ...overrides,
  };
}

export function buildCurationItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    atom_id: randomUUID(),
    title: 'Pythagorean Theorem',
    description: 'A community-submitted atom about the Pythagorean theorem',
    atom_type: 'MCQ',
    tags: ['geometry', 'triangles'],
    upvotes: 12,
    downvotes: 2,
    net_score: 10,
    submitter_gcid: 'gcid-learner-003',
    submitter_display_name: 'Community Contributor',
    status: 'curating',
    submitted_at: '2026-03-12T08:00:00Z',
    ...overrides,
  };
}

export function buildContributorProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gcid: 'gcid-learner-001',
    display_name: 'Test Learner',
    avatar_url: null,
    reputation_score: 850,
    tier: 'silver',
    total_submissions: 24,
    approved_submissions: 18,
    total_reviews: 42,
    helpful_reviews: 36,
    badges: [
      { id: 'badge-reviewer', name: 'Trusted Reviewer', icon: 'star', earned_at: '2026-02-15T00:00:00Z' },
      { id: 'badge-contributor', name: 'Active Contributor', icon: 'edit', earned_at: '2026-03-01T00:00:00Z' },
    ],
    joined_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ===========================================================================
// Builders — Survey
// ===========================================================================

export function buildSurveyTemplate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: 'tenant-001',
    title: 'Course Satisfaction Survey',
    description: 'Help us improve your learning experience',
    status: 'published',
    created_by: 'gcid-admin-001',
    questions: [
      buildSurveyQuestion({ order: 1 }),
      buildSurveyQuestion({
        order: 2,
        question_text: 'How would you rate the content quality?',
        question_type: 'rating',
      }),
    ],
    response_count: 45,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-10T00:00:00Z',
    published_at: '2026-03-02T00:00:00Z',
    closes_at: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

export function buildSurveyQuestion(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    question_text: 'How satisfied are you with the learning experience?',
    question_type: 'likert_scale',
    is_required: true,
    order: 1,
    options: [
      { value: 1, label: 'Very Dissatisfied' },
      { value: 2, label: 'Dissatisfied' },
      { value: 3, label: 'Neutral' },
      { value: 4, label: 'Satisfied' },
      { value: 5, label: 'Very Satisfied' },
    ],
    ...overrides,
  };
}

export function buildSurveyAnalytics(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    survey_id: randomUUID(),
    total_responses: 45,
    completion_rate: 0.82,
    average_completion_time_seconds: 180,
    question_summaries: [
      {
        question_id: randomUUID(),
        question_text: 'How satisfied are you with the learning experience?',
        question_type: 'likert_scale',
        response_count: 45,
        average_score: 4.2,
        distribution: { '1': 1, '2': 3, '3': 5, '4': 18, '5': 18 },
      },
      {
        question_id: randomUUID(),
        question_text: 'How would you rate the content quality?',
        question_type: 'rating',
        response_count: 42,
        average_score: 3.8,
        distribution: { '1': 2, '2': 4, '3': 8, '4': 15, '5': 13 },
      },
    ],
    period_start: '2026-03-02T00:00:00Z',
    period_end: '2026-03-16T00:00:00Z',
    ...overrides,
  };
}

// ===========================================================================
// Builders — Search
// ===========================================================================

export function buildSearchResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    title: 'Introduction to Algebra',
    atom_type: 'MCQ',
    difficulty: 2,
    tags: ['algebra', 'basics'],
    topic_path: ['Mathematics', 'Algebra', 'Fundamentals'],
    snippet: 'Learn the fundamental concepts of <em>algebra</em> including variables and expressions.',
    score: 0.95,
    created_by: 'gcid-instructor-001',
    created_at: '2026-02-15T00:00:00Z',
    updated_at: '2026-03-10T00:00:00Z',
    ...overrides,
  };
}

export function buildSearchFacet(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    field: 'atom_type',
    label: 'Atom Type',
    values: [
      { value: 'MCQ', count: 120, label: 'Multiple Choice' },
      { value: 'FIB', count: 85, label: 'Fill in the Blank' },
      { value: 'TF', count: 65, label: 'True/False' },
      { value: 'SA', count: 40, label: 'Short Answer' },
    ],
    ...overrides,
  };
}

// ===========================================================================
// Builders — Developer Console
// ===========================================================================

function buildRequestLogEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    method: 'GET',
    url: '/api/v1/atomic/atoms',
    status: 200,
    duration_ms: 45,
    timestamp: new Date().toISOString(),
    request_headers: { Authorization: 'Bearer [redacted]', 'Content-Type': 'application/json' },
    response_size_bytes: 2048,
    ...overrides,
  };
}

function buildFeatureFlag(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    code: 'learner_engagement',
    display_name: 'Learner Engagement',
    enabled: true,
    is_overridden: false,
    description: 'Streaks, combos, leaderboards, DailyDose',
    ...overrides,
  };
}

function buildEventLogEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    event_type: 'atom.completed',
    source: 'chora-atomic',
    timestamp: new Date().toISOString(),
    payload: {
      atom_id: randomUUID(),
      gcid: 'gcid-learner-001',
      correct: true,
    },
    ...overrides,
  };
}

function buildRlsContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenant_id: 'tenant-001',
    gcid: 'gcid-admin-001',
    roles: ['tenant_admin'],
    capabilities: ['atom:read', 'atom:publish', 'tenant:manage', 'user:manage'],
    rls_policy_preview: 'SELECT * FROM learning_atoms WHERE tenant_id = $1 AND deleted_at IS NULL',
    ...overrides,
  };
}

// ===========================================================================
// Route mocks — Community
// ===========================================================================

export async function mockCommunityAPI(
  page: Page,
  options: {
    submissions?: Record<string, unknown>[];
    reviews?: Record<string, unknown>[];
    curationItems?: Record<string, unknown>[];
    profile?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const {
    submissions = [buildAtomSubmission()],
    reviews = [buildPeerReview()],
    curationItems = [buildCurationItem()],
    profile = buildContributorProfile(),
  } = options;

  await page.route('**/api/v1/community/atom-bank', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: submissions, page_info: { has_next: false } }),
      });
    } else if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(buildAtomSubmission({ ...body, status: 'pending_review' })),
      });
    } else {
      await route.fallback();
    }
  });

  await page.route('**/api/v1/community/peer-review', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: reviews, page_info: { has_next: false } }),
      });
    } else if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'submitted' }),
      });
    } else {
      await route.fallback();
    }
  });

  await page.route('**/api/v1/community/curation', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: curationItems, page_info: { has_next: false } }),
      });
    } else {
      await route.fallback();
    }
  });

  await page.route('**/api/v1/community/curation/*/vote', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'voted' }),
    });
  });

  await page.route('**/api/v1/community/contributors/*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(profile),
    });
  });
}

// ===========================================================================
// Route mocks — Survey
// ===========================================================================

export async function mockSurveyAPI(
  page: Page,
  options: {
    surveys?: Record<string, unknown>[];
    analytics?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const {
    surveys = [buildSurveyTemplate()],
    analytics = buildSurveyAnalytics(),
  } = options;

  await page.route('**/api/v1/survey/templates', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: surveys, page_info: { has_next: false } }),
      });
    } else if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(buildSurveyTemplate({ ...body, status: 'draft' })),
      });
    } else {
      await route.fallback();
    }
  });

  await page.route('**/api/v1/survey/templates/*', async (route) => {
    if (route.request().url().includes('/results') || route.request().url().includes('/analytics')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(analytics),
      });
    } else if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(surveys[0] ?? buildSurveyTemplate()),
      });
    } else if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildSurveyTemplate({ ...body })),
      });
    } else {
      await route.fallback();
    }
  });

  await page.route('**/api/v1/survey/responses', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'submitted', submitted_at: new Date().toISOString() }),
      });
    } else {
      await route.fallback();
    }
  });
}

// ===========================================================================
// Route mocks — Search
// ===========================================================================

export async function mockSearchAPI(
  page: Page,
  options: {
    results?: Record<string, unknown>[];
    facets?: Record<string, unknown>[];
    totalCount?: number;
  } = {},
): Promise<void> {
  const {
    results = [buildSearchResult()],
    facets = [buildSearchFacet()],
    totalCount = results.length,
  } = options;

  await page.route('**/api/v1/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        hits: results,
        facets,
        total_count: totalCount,
        processing_time_ms: 12,
        page_info: {
          has_next: false,
          has_previous: false,
          current_page: 1,
          total_pages: 1,
        },
      }),
    });
  });
}

// ===========================================================================
// Route mocks — Developer Console
// ===========================================================================

export async function mockDeveloperAPI(
  page: Page,
  options: {
    requestLog?: Record<string, unknown>[];
    featureFlags?: Record<string, unknown>[];
    eventLog?: Record<string, unknown>[];
    rlsContext?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const {
    requestLog = [
      buildRequestLogEntry(),
      buildRequestLogEntry({ method: 'POST', url: '/api/v1/engagement/xp', status: 201, duration_ms: 78 }),
      buildRequestLogEntry({ method: 'GET', url: '/api/v1/engagement/dashboard', status: 200, duration_ms: 32 }),
    ],
    featureFlags = [
      buildFeatureFlag(),
      buildFeatureFlag({ code: 'knowledge_graph', display_name: 'Knowledge Graph', enabled: true }),
      buildFeatureFlag({ code: 'CHORAVERSE', display_name: 'Choraverse', enabled: true }),
      buildFeatureFlag({ code: 'familiar', display_name: 'Familiar Companion', enabled: false }),
      buildFeatureFlag({ code: 'governance_trust', display_name: 'Governance Trust', enabled: true }),
    ],
    eventLog = [
      buildEventLogEntry(),
      buildEventLogEntry({ event_type: 'xp.awarded', source: 'chora-engagement' }),
      buildEventLogEntry({ event_type: 'streak.updated', source: 'chora-engagement' }),
    ],
    rlsContext = buildRlsContext(),
  } = options;

  await page.route('**/api/v1/admin/developer/request-log', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: requestLog }),
    });
  });

  await page.route('**/api/v1/admin/developer/feature-flags', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: featureFlags }),
      });
    } else if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const flag = featureFlags.find((f) => f['code'] === body['code']);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...flag, enabled: body['enabled'], is_overridden: true }),
      });
    } else {
      await route.fallback();
    }
  });

  await page.route('**/api/v1/admin/developer/event-log', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: eventLog }),
    });
  });

  await page.route('**/api/v1/admin/developer/rls-context', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rlsContext),
    });
  });
}
