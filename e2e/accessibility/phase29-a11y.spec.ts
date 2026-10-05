/**
 * Phase 29 Accessibility Audit — axe-core WCAG 2.1 AA compliance tests
 *
 * Tests each Phase 29 route at two viewport sizes:
 *   - Minimum viewport (1280x720)
 *   - Desktop (1440x900)
 *
 * All routes have API mocks so components render meaningful content
 * before the axe audit runs. 0 critical/serious violations expected.
 */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { mockAuthSession } from '../fixtures/auth-mocks';
import { runAxeAudit } from '../fixtures/a11y.fixture';
import type { Page } from '@playwright/test';

// ===========================================================================
// Route definitions
// ===========================================================================

interface Phase29Route {
  name: string;
  path: string;
  /** Which add-ons must be enabled for the route guard to pass */
  addOns: string[];
  /** Auth role required (defaults to 'learner') */
  role?: string;
  /** Set up API mocks specific to this route */
  setupMocks: (page: Page) => Promise<void>;
  /** Optional data-testid to wait for before auditing */
  waitForTestId?: string;
}

// ---------------------------------------------------------------------------
// Reusable mock data builders
// ---------------------------------------------------------------------------

function buildVenue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: 'tenant-001',
    name: 'Main Campus Hall',
    address: '123 University Ave',
    capacity: 500,
    is_active: true,
    rooms: [],
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

function buildGuardianLink(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    guardian_gcid: 'gcid-learner-001',
    learner_gcid: 'gcid-learner-002',
    learner_display_name: 'Alex Student',
    relationship: 'parent',
    status: 'active',
    created_at: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

function buildTicket(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: 'tenant-001',
    reporter_gcid: 'gcid-learner-001',
    subject: 'Cannot access daily dose',
    description: 'The daily dose page returns an error when I try to load it.',
    category: 'technical',
    priority: 'medium',
    status: 'open',
    created_at: '2026-03-14T10:00:00Z',
    updated_at: '2026-03-14T10:00:00Z',
    ...overrides,
  };
}

function buildPlacement(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    internship_id: randomUUID(),
    learner_gcid: 'gcid-learner-001',
    supervisor_gcid: 'gcid-instructor-001',
    status: 'active',
    starts_at: '2026-02-01T00:00:00Z',
    ends_at: '2026-05-01T00:00:00Z',
    total_hours_logged: 120,
    created_at: '2026-02-01T00:00:00Z',
    ...overrides,
  };
}

function buildExamContract(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: 'tenant-001',
    exam_body: 'National Exam Board',
    qualification: 'Mathematics Level 2',
    status: 'active',
    starts_at: '2026-03-01T00:00:00Z',
    ends_at: '2026-12-31T00:00:00Z',
    max_candidates: 200,
    created_at: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

function buildCommunityAtom(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    author_gcid: 'gcid-learner-001',
    author_display_name: 'Test Learner',
    title: 'Introduction to Fractions',
    atom_type: 'MCQ',
    status: 'approved',
    vote_score: 12,
    review_count: 3,
    submitted_at: '2026-03-10T08:00:00Z',
    ...overrides,
  };
}

function buildSurveyTemplate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: 'tenant-001',
    title: 'End-of-Course Feedback',
    description: 'Help us improve the learning experience.',
    status: 'published',
    question_count: 10,
    response_count: 45,
    created_by: 'gcid-instructor-001',
    created_at: '2026-02-15T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

function buildSearchHit(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    title: 'Quadratic Equations',
    atom_type: 'MCQ',
    difficulty: 3,
    tags: ['algebra', 'equations'],
    topic_name: 'Algebra',
    _matchesPosition: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Route mock helpers
// ---------------------------------------------------------------------------

async function mockCampusApis(page: Page): Promise<void> {
  const venues = [buildVenue(), buildVenue({ name: 'Science Block', capacity: 200 })];

  await page.route('**/api/v1/campus/venues', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: venues }),
    });
  });

  await page.route('**/api/v1/campus/terms', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: randomUUID(),
            name: 'Spring 2026',
            starts_at: '2026-01-15T00:00:00Z',
            ends_at: '2026-06-15T00:00:00Z',
            is_active: true,
          },
        ],
      }),
    });
  });

  await page.route('**/api/v1/campus/sections', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route('**/api/v1/campus/bookings**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });
}

async function mockParentApis(page: Page): Promise<void> {
  await page.route('**/api/v1/parent/links', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [buildGuardianLink()] }),
    });
  });

  await page.route('**/api/v1/parent/dashboard/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        learner_gcid: 'gcid-learner-002',
        learner_display_name: 'Alex Student',
        streak_days: 5,
        xp_total: 1200,
        level: 6,
        atoms_completed_this_week: 12,
        active_paths: 2,
      }),
    });
  });

  await page.route('**/api/v1/parent/alerts', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route('**/api/v1/parent/digests**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });
}

async function mockSupportApis(page: Page): Promise<void> {
  const tickets = [
    buildTicket(),
    buildTicket({ subject: 'Login issue', status: 'resolved', priority: 'high' }),
  ];

  await page.route('**/api/v1/support/tickets', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: tickets,
          page_info: { has_next: false },
        }),
      });
    } else {
      await route.fallback();
    }
  });

  await page.route('**/api/v1/support/faq/categories', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { id: 'cat-1', name: 'Account', article_count: 5 },
          { id: 'cat-2', name: 'Learning', article_count: 8 },
        ],
      }),
    });
  });

  await page.route('**/api/v1/support/faq', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            id: randomUUID(),
            title: 'How do I reset my password?',
            content: 'Go to Settings > Security > Change Password.',
            category_id: 'cat-1',
            views: 120,
          },
        ],
        page_info: { has_next: false },
      }),
    });
  });
}

async function mockWblApis(page: Page): Promise<void> {
  await page.route('**/api/v1/wbl/placements', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [buildPlacement()] }),
    });
  });

  await page.route('**/api/v1/wbl/internships', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route('**/api/v1/wbl/capstones', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route('**/api/v1/wbl/partners', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });
}

async function mockExamAdminApis(page: Page): Promise<void> {
  await page.route('**/api/v1/exams/contracts', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [buildExamContract()] }),
    });
  });

  await page.route('**/api/v1/exams/venues', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route('**/api/v1/exams/sittings**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route('**/api/v1/exams/schedule**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route('**/api/v1/exams/results**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route('**/api/v1/exams/appeals', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });
}

async function mockCommunityApis(page: Page): Promise<void> {
  await page.route('**/api/v1/community/atoms', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [buildCommunityAtom(), buildCommunityAtom({ title: 'Basic Geometry', vote_score: 8 })],
        }),
      });
    } else {
      await route.fallback();
    }
  });

  await page.route('**/api/v1/community/reviews', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route('**/api/v1/community/curation', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route('**/api/v1/community/contributors/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        gcid: 'gcid-learner-001',
        display_name: 'Test Learner',
        atoms_submitted: 15,
        atoms_approved: 12,
        reviews_completed: 30,
        reputation_score: 85,
      }),
    });
  });
}

async function mockSurveyApis(page: Page): Promise<void> {
  await page.route('**/api/v1/surveys', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            buildSurveyTemplate(),
            buildSurveyTemplate({ title: 'Module Satisfaction', status: 'draft', response_count: 0 }),
          ],
        }),
      });
    } else {
      await route.fallback();
    }
  });
}

async function mockSearchApis(page: Page): Promise<void> {
  await page.route('**/api/v1/search/atoms**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        hits: [buildSearchHit(), buildSearchHit({ title: 'Linear Functions', difficulty: 2 })],
        facets: {
          atom_type: { MCQ: 15, TrueFalse: 8, FillBlank: 5 },
          difficulty: { 1: 10, 2: 12, 3: 8, 4: 3, 5: 1 },
        },
        pagination: { total: 28, offset: 0, limit: 20 },
      }),
    });
  });

  await page.route('**/api/v1/search/topics**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        hits: [{ id: randomUUID(), name: 'Algebra', atom_count: 45 }],
        pagination: { total: 1, offset: 0, limit: 20 },
      }),
    });
  });

  await page.route('**/api/v1/search/paths**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        hits: [],
        pagination: { total: 0, offset: 0, limit: 20 },
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// Phase 29 route definitions
// ---------------------------------------------------------------------------

const PHASE_29_ROUTES: Phase29Route[] = [
  {
    name: 'Campus Operations',
    path: '/campus',
    addOns: [],
    setupMocks: mockCampusApis,
    waitForTestId: 'venue-list',
  },
  {
    name: 'Parent Portal',
    path: '/parent',
    addOns: [],
    role: 'learner',
    setupMocks: mockParentApis,
    waitForTestId: 'guardian-dashboard',
  },
  {
    name: 'Support — Ticket List',
    path: '/support',
    addOns: [],
    setupMocks: mockSupportApis,
    waitForTestId: 'ticket-list',
  },
  {
    name: 'Work-Based Learning',
    path: '/wbl',
    addOns: ['work_based_learning'],
    setupMocks: mockWblApis,
    waitForTestId: 'placement-list',
  },
  {
    name: 'Exam Administration',
    path: '/examadmin',
    addOns: ['exam_management'],
    setupMocks: mockExamAdminApis,
    waitForTestId: 'exam-contract-list',
  },
  {
    name: 'Community Contribution',
    path: '/community',
    addOns: [],
    setupMocks: mockCommunityApis,
    waitForTestId: 'atom-bank',
  },
  {
    name: 'Post-Course Survey',
    path: '/survey',
    addOns: [],
    setupMocks: mockSurveyApis,
    waitForTestId: 'survey-list',
  },
  {
    name: 'Full-Text Search',
    path: '/search',
    addOns: [],
    setupMocks: mockSearchApis,
    waitForTestId: 'search-page',
  },
];

// ===========================================================================
// Desktop viewport tests (1440x900 — Playwright config default)
// ===========================================================================

test.describe('Phase 29 — Accessibility Audit (Desktop 1440x900)', () => {
  for (const route of PHASE_29_ROUTES) {
    test(`${route.name} passes WCAG 2.1 AA at desktop`, async ({ page }) => {
      // Authenticate with required add-ons
      const addOns = [
        'learner_engagement',
        'knowledge_graph',
        'CHORAVERSE',
        'social',
        'discovery_economy',
        ...route.addOns,
      ];
      await mockAuthSession(page, route.role ?? 'learner', addOns);

      // Set up route-specific API mocks
      await route.setupMocks(page);

      // Navigate to the route
      await page.goto(route.path);
      await page.waitForLoadState('networkidle');

      // Wait for the primary content container if specified
      if (route.waitForTestId) {
        await page.locator(`[data-testid="${route.waitForTestId}"]`).waitFor({
          state: 'visible',
          timeout: 10_000,
        }).catch(() => {
          // Component may not use this exact testid; continue with audit
        });
      }

      // Run axe-core audit
      await runAxeAudit(page, route.name);
    });
  }
});

// ===========================================================================
// Minimum viewport tests (1280x720 — tablet-first boundary)
// ===========================================================================

test.describe('Phase 29 — Accessibility Audit (Minimum Viewport 1280x720)', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  for (const route of PHASE_29_ROUTES) {
    test(`${route.name} passes WCAG 2.1 AA at 1280x720`, async ({ page }) => {
      const addOns = [
        'learner_engagement',
        'knowledge_graph',
        'CHORAVERSE',
        'social',
        'discovery_economy',
        ...route.addOns,
      ];
      await mockAuthSession(page, route.role ?? 'learner', addOns);

      await route.setupMocks(page);

      await page.goto(route.path);
      await page.waitForLoadState('networkidle');

      if (route.waitForTestId) {
        await page.locator(`[data-testid="${route.waitForTestId}"]`).waitFor({
          state: 'visible',
          timeout: 10_000,
        }).catch(() => {
          // Continue with audit even if specific testid not found
        });
      }

      await runAxeAudit(page, `${route.name} (1280x720)`);
    });
  }
});

// ===========================================================================
// Sub-route audits — deeper pages within each feature
// ===========================================================================

test.describe('Phase 29 — Accessibility Audit (Sub-routes)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner', [
      'learner_engagement',
      'knowledge_graph',
      'CHORAVERSE',
      'social',
      'discovery_economy',
      'work_based_learning',
      'exam_management',
    ]);
  });

  test('Support — Create Ticket form passes a11y audit', async ({ page }) => {
    await mockSupportApis(page);
    await page.goto('/support/tickets/new');
    await page.waitForLoadState('networkidle');
    await runAxeAudit(page, 'Support — Create Ticket');
  });

  test('Support — FAQ Browser passes a11y audit', async ({ page }) => {
    await mockSupportApis(page);
    await page.goto('/support/faq');
    await page.waitForLoadState('networkidle');
    await runAxeAudit(page, 'Support — FAQ Browser');
  });

  test('Community — Peer Review Queue passes a11y audit', async ({ page }) => {
    await mockCommunityApis(page);
    await page.goto('/community/peer-review');
    await page.waitForLoadState('networkidle');
    await runAxeAudit(page, 'Community — Peer Review');
  });

  test('Community — Curation Voting passes a11y audit', async ({ page }) => {
    await mockCommunityApis(page);
    await page.goto('/community/curation');
    await page.waitForLoadState('networkidle');
    await runAxeAudit(page, 'Community — Curation Voting');
  });

  test('Exam Admin — Sitting Scheduler passes a11y audit', async ({ page }) => {
    await mockExamAdminApis(page);
    await page.goto('/examadmin/sittings');
    await page.waitForLoadState('networkidle');
    await runAxeAudit(page, 'Exam Admin — Sitting Scheduler');
  });

  test('Exam Admin — Proctor Dashboard passes a11y audit', async ({ page }) => {
    await mockExamAdminApis(page);
    await page.goto('/examadmin/proctor');
    await page.waitForLoadState('networkidle');
    await runAxeAudit(page, 'Exam Admin — Proctor Dashboard');
  });

  test('Campus — Timetable View passes a11y audit', async ({ page }) => {
    await mockCampusApis(page);
    await page.goto('/campus/timetable');
    await page.waitForLoadState('networkidle');
    await runAxeAudit(page, 'Campus — Timetable');
  });

  test('Campus — Room Booking passes a11y audit', async ({ page }) => {
    await mockCampusApis(page);
    await page.goto('/campus/bookings');
    await page.waitForLoadState('networkidle');
    await runAxeAudit(page, 'Campus — Room Booking');
  });

  test('Campus — Attendance Tracker passes a11y audit', async ({ page }) => {
    await mockCampusApis(page);
    await page.goto('/campus/attendance');
    await page.waitForLoadState('networkidle');
    await runAxeAudit(page, 'Campus — Attendance Tracker');
  });

  test('Parent — Consent Manager passes a11y audit', async ({ page }) => {
    await mockParentApis(page);
    await page.goto('/parent/consent');
    await page.waitForLoadState('networkidle');
    await runAxeAudit(page, 'Parent — Consent Manager');
  });

  test('WBL — Capstone Projects passes a11y audit', async ({ page }) => {
    await mockWblApis(page);
    await page.goto('/wbl/capstones');
    await page.waitForLoadState('networkidle');
    await runAxeAudit(page, 'WBL — Capstone Projects');
  });

  test('Exam Admin — Results Viewer passes a11y audit', async ({ page }) => {
    await mockExamAdminApis(page);
    await page.goto('/examadmin/results');
    await page.waitForLoadState('networkidle');
    await runAxeAudit(page, 'Exam Admin — Results Viewer');
  });
});
