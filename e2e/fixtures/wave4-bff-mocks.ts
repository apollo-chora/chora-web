import { type Page } from '@playwright/test';
import { randomUUID } from 'crypto';

// ===========================================================================
// Builders — Wave 4 modules
// ===========================================================================

// --- Governance ---

export function buildRestriction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: 'tenant-001',
    target_gcid: 'gcid-learner-001',
    tier: 'warning',
    reason: 'Policy violation',
    applied_by: 'gcid-admin-001',
    applied_at: '2026-01-15T10:00:00Z',
    lifted_at: null,
    status: 'active',
    ...overrides,
  };
}

export function buildAppeal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    restriction_id: randomUUID(),
    appellant_gcid: 'gcid-learner-001',
    reason: 'I believe this was a mistake',
    status: 'pending',
    reviewer_gcid: null,
    reviewer_notes: null,
    created_at: '2026-01-16T09:00:00Z',
    updated_at: '2026-01-16T09:00:00Z',
    ...overrides,
  };
}

export function buildKYCVerification(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    gcid: 'gcid-learner-001',
    document_type: 'national_id',
    document_url: 'https://storage.example.com/kyc/doc-001.pdf',
    status: 'pending',
    reviewer_gcid: null,
    submitted_at: '2026-02-01T08:00:00Z',
    reviewed_at: null,
    ...overrides,
  };
}

export function buildModerationAction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    content_type: 'atom',
    content_id: randomUUID(),
    action: 'flagged',
    reason: 'Inappropriate content',
    moderator_gcid: 'gcid-admin-001',
    created_at: '2026-02-10T12:00:00Z',
    ...overrides,
  };
}

// --- Billing ---

export function buildSubscription(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: 'tenant-001',
    plan_id: 'plan-standard',
    plan_name: 'Standard Plan',
    status: 'active',
    current_period_start: '2026-03-01T00:00:00Z',
    current_period_end: '2026-04-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function buildInvoice(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: 'tenant-001',
    invoice_number: `INV-${Date.now()}`,
    amount_cents: 4999,
    currency: 'USD',
    status: 'paid',
    issued_at: '2026-03-01T00:00:00Z',
    due_at: '2026-03-15T00:00:00Z',
    paid_at: '2026-03-10T00:00:00Z',
    pdf_url: 'https://billing.example.com/invoices/inv-001.pdf',
    ...overrides,
  };
}

export function buildPromoCode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    code: 'SPRING2026',
    discount_pct: 20,
    max_redemptions: 100,
    current_redemptions: 15,
    is_active: true,
    valid_from: '2026-03-01T00:00:00Z',
    valid_until: '2026-06-01T00:00:00Z',
    created_by: 'gcid-admin-001',
    created_at: '2026-02-28T00:00:00Z',
    ...overrides,
  };
}

export function buildUsageSummary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    resource_type: 'api_calls',
    current_usage: 7500,
    limit: 10000,
    unit: 'calls',
    period_start: '2026-03-01T00:00:00Z',
    period_end: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

// --- Identity Portability ---

export function buildMergePreview(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    primary_gcid: 'gcid-learner-001',
    secondary_gcid: 'gcid-learner-002',
    status: 'preview',
    memberships: [
      { tenant_id: 'tenant-001', tenant_name: 'Acme Academy', roles: ['learner'] },
      { tenant_id: 'tenant-002', tenant_name: 'Beta School', roles: ['learner', 'instructor'] },
    ],
    conflicts: [],
    created_at: '2026-03-15T10:00:00Z',
    ...overrides,
  };
}

export function buildPortableData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gcid: 'gcid-learner-001',
    gcid_scoped: {
      xp_total: 2450,
      level: 8,
      skins_earned: 5,
      achievements: 12,
    },
    tenant_scoped: [
      {
        tenant_id: 'tenant-001',
        tenant_name: 'Acme Academy',
        atoms_completed: 120,
        paths_enrolled: 3,
        assessments_taken: 8,
      },
    ],
    exported_at: null,
    ...overrides,
  };
}

export function buildTenantMembership(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenant_id: randomUUID(),
    tenant_name: 'Test Academy',
    roles: ['learner'],
    joined_at: '2026-01-15T00:00:00Z',
    status: 'active',
    ...overrides,
  };
}

// --- Choraverse / Gamification ---

export function buildSkin(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    name: 'Golden Familiar',
    rarity: 'epic',
    theme: 'achievement',
    image_url: 'https://assets.chora.io/skins/golden-familiar.png',
    is_equipped: false,
    earned_at: '2026-02-14T00:00:00Z',
    ...overrides,
  };
}

export function buildCoinAccount(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gcid: 'gcid-learner-001',
    balance: 1250,
    lifetime_earned: 3500,
    lifetime_spent: 2250,
    ...overrides,
  };
}

export function buildCoinTransaction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    gcid: 'gcid-learner-001',
    amount: 50,
    type: 'earned',
    reason: 'Daily dose completion',
    created_at: '2026-03-14T10:00:00Z',
    ...overrides,
  };
}

export function buildBounty(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    title: 'Master Algebra Fundamentals',
    description: 'Complete 20 algebra atoms to earn 100 Star Credits',
    reward_star_credits: 100,
    status: 'active',
    progress_pct: 40,
    deadline: '2026-04-01T00:00:00Z',
    created_at: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

// --- Familiar Chat ---

export function buildChatMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    role: 'learner',
    content: 'Can you help me understand algebra?',
    timestamp: '2026-03-14T10:00:00Z',
    citations: [],
    is_streaming: false,
    ...overrides,
  };
}

export function buildPersonaSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    familiar_name: 'Spark',
    personality_traits: ['curious', 'encouraging', 'patient'],
    evolution_stage: 'adolescent',
    mood: 'enthusiastic',
    avatar_url: 'https://assets.chora.io/familiar/spark-adolescent.png',
    ...overrides,
  };
}

export function buildMemoryEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    category: 'learning_preference',
    content: 'Learner prefers visual explanations with diagrams',
    confidence: 0.85,
    created_at: '2026-03-10T08:00:00Z',
    ...overrides,
  };
}

// --- Communication ---

export function buildNotificationPreference(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_category: 'engagement',
    channel: 'email',
    enabled: true,
    ...overrides,
  };
}

export function buildTriggerRule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    name: 'Streak reminder',
    event_type: 'streak_at_risk',
    channel: 'push',
    template_id: randomUUID(),
    is_active: true,
    conditions: { min_streak_days: 3 },
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    ...overrides,
  };
}

export function buildEmailTemplate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    name: 'Welcome Email',
    subject: 'Welcome to {{tenant_name}}!',
    body_html: '<h1>Welcome, {{display_name}}!</h1><p>Start learning today.</p>',
    category: 'onboarding',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

// ===========================================================================
// Route mocks
// ===========================================================================

// --- Governance ---

export async function mockGovernanceRestrictions(
  page: Page,
  restrictions: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/governance/restrictions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(restrictions),
    });
  });
}

export async function mockGovernanceAppeals(
  page: Page,
  appeals: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/governance/appeals', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(appeals),
    });
  });
}

export async function mockGovernanceKYC(
  page: Page,
  verifications: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/governance/kyc', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(verifications),
    });
  });
}

export async function mockGovernanceModeration(
  page: Page,
  actions: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/governance/moderation', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(actions),
    });
  });
}

// --- Billing ---

export async function mockBillingSubscription(
  page: Page,
  subscription: Record<string, unknown>,
): Promise<void> {
  await page.route('**/api/v1/billing/subscriptions', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(subscription),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockBillingInvoices(
  page: Page,
  invoices: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/billing/invoices', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(invoices),
    });
  });
}

export async function mockBillingPromoCodes(
  page: Page,
  promoCodes: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/billing/promo-codes', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(promoCodes),
      });
    } else if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(buildPromoCode({ ...body })),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockBillingUsage(
  page: Page,
  summaries: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/billing/usage', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(summaries),
    });
  });
}

// --- Identity Portability ---

export async function mockMergePreview(
  page: Page,
  merge: Record<string, unknown>,
): Promise<void> {
  await page.route('**/api/v1/gcid/merge', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(merge),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockPortableData(
  page: Page,
  data: Record<string, unknown>,
): Promise<void> {
  await page.route('**/api/v1/gcid/data/summary', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  });
}

export async function mockMemberships(
  page: Page,
  memberships: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/tenants/memberships', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: memberships }),
    });
  });
}

export async function mockMigration(
  page: Page,
  migration: Record<string, unknown>,
): Promise<void> {
  await page.route('**/api/v1/gcid/migration', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(migration),
      });
    } else {
      await route.fallback();
    }
  });
}

// --- Gamification ---

export async function mockSkinCatalog(
  page: Page,
  skins: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/gamification/skins', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: skins }),
    });
  });
}

export async function mockCoinAccount(
  page: Page,
  account: Record<string, unknown>,
): Promise<void> {
  await page.route('**/api/v1/gamification/coins', async (route) => {
    if (!route.request().url().includes('transactions')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(account),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockCoinTransactions(
  page: Page,
  transactions: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/gamification/coins/transactions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: transactions }),
    });
  });
}

export async function mockBounties(
  page: Page,
  bounties: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/gamification/bounties', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: bounties }),
    });
  });
}

// --- Familiar Chat ---

export async function mockFamiliarChatHistory(
  page: Page,
  messages: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/familiar/chat/history', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(messages),
    });
  });
}

export async function mockFamiliarChatSend(page: Page): Promise<void> {
  await page.route('**/api/v1/familiar/chat', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ stream_url: '/api/v1/familiar/chat/stream/mock-id' }),
      });
    } else {
      await route.fallback();
    }
  });
}

export async function mockFamiliarPersona(
  page: Page,
  persona: Record<string, unknown>,
): Promise<void> {
  await page.route('**/api/v1/familiar/persona', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(persona),
    });
  });
}

export async function mockFamiliarMemory(
  page: Page,
  entries: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/familiar/memory', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(entries),
    });
  });
}

// --- Communication ---

export async function mockCommunicationPreferences(
  page: Page,
  preferences: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/communication/preferences', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(preferences),
    });
  });
}

export async function mockCommunicationTriggerRules(
  page: Page,
  rules: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/communication/trigger-rules', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rules),
    });
  });
}

export async function mockCommunicationEmailTemplates(
  page: Page,
  templates: Record<string, unknown>[],
): Promise<void> {
  await page.route('**/api/v1/communication/email-templates', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(templates),
    });
  });
}
