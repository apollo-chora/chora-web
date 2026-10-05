import { type Page } from '@playwright/test';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Admin Atom mock (REST response — snake_case from BFF)
// ---------------------------------------------------------------------------

export function buildAdminAtom(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const id = randomUUID();
  return {
    id,
    tenant_id: 'tenant-001',
    atom_type: 'multiple_choice',
    difficulty: 2,
    language_code: 'en',
    tags: ['algebra', 'basics'],
    status: 'draft',
    created_by: 'gcid-instructor-001',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    latest_revision: {
      id: randomUUID(),
      atom_id: id,
      revision_number: 1,
      content: {
        stem: 'What is 2 + 2?',
        options: [
          { text: '3', is_correct: false },
          { text: '4', is_correct: true },
          { text: '5', is_correct: false },
        ],
        explanation: 'Basic arithmetic.',
      },
      validation_rules: [
        { rule_type: 'exact_match', expected: '4', tolerance: null, case_sensitive: false },
      ],
      published_at: null,
      created_at: new Date().toISOString(),
    },
    ...overrides,
  };
}

export function buildAdminTopicNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    name: 'Algebra',
    parent_id: null,
    depth: 0,
    atom_count: 10,
    children: [],
    ...overrides,
  };
}

export function buildAssessmentSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: 'tenant-001',
    title: 'Midterm Exam',
    description: 'Assessment for midterm evaluation',
    session_type: 'exam',
    structure_mode: 'papers_and_sections',
    time_limit_minutes: 60,
    status: 'draft',
    papers: [],
    sections: [],
    created_by: 'gcid-instructor-001',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function buildLockedPath(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: 'tenant-001',
    title: 'Algebra Foundations',
    description: 'Step-by-step algebra path',
    enrollment_type: 'open',
    estimated_duration_minutes: 120,
    status: 'draft',
    steps: [],
    created_by: 'gcid-instructor-001',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function buildTenantUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const gcid = overrides['gcid'] as string ?? randomUUID();
  return {
    gcid,
    email: `user-${gcid.slice(0, 8)}@test.chora.io`,
    display_name: `User ${gcid.slice(0, 8)}`,
    roles: ['learner'],
    account_state: 'active',
    joined_at: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

export function buildEntitlement(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: 'tenant-001',
    add_on_code: 'learner_engagement',
    enabled: true,
    enabled_at: new Date().toISOString(),
    ...overrides,
  };
}

export function buildAddOnPlan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    code: 'learner_engagement',
    name: 'Learner Engagement',
    description: 'Streaks, combos, leaderboards, and daily dose features.',
    category: 'Engagement',
    pricing_tier: 'standard',
    ...overrides,
  };
}

export function buildInvitation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const id = randomUUID();
  return {
    id,
    tenant_id: 'tenant-001',
    invitation_code: `INV-${id.slice(0, 8).toUpperCase()}`,
    role_template: 'learner',
    invitee_email: null,
    expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    claimed_at: null,
    revoked_at: null,
    created_by: 'gcid-admin-001',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Admin REST API route mocks
// ---------------------------------------------------------------------------

export async function mockAdminAtomList(
  page: Page,
  atoms: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/atoms?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: atoms,
        page_info: { next_cursor: null, has_next: false },
      }),
    });
  });

  // Also handle no query-string variant
  await page.route('**/api/v1/atoms', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: atoms,
          page_info: { next_cursor: null, has_next: false },
        }),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockAdminAtomCreate(
  page: Page,
  responseAtom?: Record<string, unknown>,
): Promise<void> {
  await page.route('**/api/v1/atoms', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const created = responseAtom ?? buildAdminAtom({
        ...body,
        status: 'draft',
      });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockAdminAtomUpdate(
  page: Page,
  atomId: string,
  responseAtom?: Record<string, unknown>,
): Promise<void> {
  await page.route(`**/api/v1/atoms/${atomId}`, async (route) => {
    if (route.request().method() === 'PUT' || route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const updated = responseAtom ?? buildAdminAtom({ id: atomId, ...body });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updated),
      });
    } else if (route.request().method() === 'GET') {
      const atom = responseAtom ?? buildAdminAtom({ id: atomId });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(atom),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockAdminAtomDelete(
  page: Page,
  atomId: string,
): Promise<void> {
  await page.route(`**/api/v1/atoms/${atomId}`, async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
    } else {
      await route.fallback();
    }
  });
}

export async function mockAdminTopicTree(
  page: Page,
  topics: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/topics', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(topics),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockAdminTopicCreate(
  page: Page,
  responseTopic?: Record<string, unknown>,
): Promise<void> {
  await page.route('**/api/v1/topics', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const created = responseTopic ?? buildAdminTopicNode({ ...body });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockAdminTopicUpdate(
  page: Page,
  topicId: string,
  responseTopic?: Record<string, unknown>,
): Promise<void> {
  await page.route(`**/api/v1/topics/${topicId}`, async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const updated = responseTopic ?? buildAdminTopicNode({ id: topicId, ...body });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(updated),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockAdminAssessmentCreate(
  page: Page,
  responseSession?: Record<string, unknown>,
): Promise<void> {
  await page.route('**/api/v1/assessments', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const created = responseSession ?? buildAssessmentSession({ ...body });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockAdminPathCreate(
  page: Page,
  responsePath?: Record<string, unknown>,
): Promise<void> {
  await page.route('**/api/v1/locked-paths', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const created = responsePath ?? buildLockedPath({ ...body });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockAdminUserList(
  page: Page,
  users: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/tenants/members**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: users,
          page_info: { next_cursor: null, has_next: false },
        }),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockAdminUserRoleAssign(
  page: Page,
  gcid: string,
): Promise<void> {
  await page.route(`**/api/v1/tenants/members/${gcid}/roles`, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    } else {
      await route.fallback();
    }
  });
}

export async function mockAdminUserSuspend(
  page: Page,
  gcid: string,
): Promise<void> {
  await page.route(`**/api/v1/tenants/members/${gcid}/suspend`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

export async function mockAdminUserReactivate(
  page: Page,
  gcid: string,
): Promise<void> {
  await page.route(`**/api/v1/tenants/members/${gcid}/reactivate`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

export async function mockAdminEntitlements(
  page: Page,
  entitlements: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/tenancy/tenants/current/entitlements', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: entitlements }),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockAdminAddOns(
  page: Page,
  addOns: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/tenancy/add-ons', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: addOns }),
    });
  });
}

export async function mockAdminEntitlementToggle(
  page: Page,
  entitlementId: string,
  response?: Record<string, unknown>,
): Promise<void> {
  await page.route(
    `**/api/v1/tenancy/tenants/current/entitlements/${entitlementId}`,
    async (route) => {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        const result = response ?? buildEntitlement({ id: entitlementId, enabled: body['enabled'] });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(result),
        });
      } else {
        await route.fallback();
      }
    },
  );
}

export async function mockAdminInvitationList(
  page: Page,
  invitations: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/tenancy/tenants/current/invitations', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: invitations }),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockAdminInvitationCreate(
  page: Page,
  responseInvitation?: Record<string, unknown>,
): Promise<void> {
  await page.route('**/api/v1/tenancy/tenants/current/invitations', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const created = responseInvitation ?? buildInvitation({ ...body });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockAdminInvitationRevoke(
  page: Page,
  invitationId: string,
): Promise<void> {
  await page.route(
    `**/api/v1/tenancy/tenants/current/invitations/${invitationId}`,
    async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 204, body: '' });
      } else {
        await route.fallback();
      }
    },
  );
}
