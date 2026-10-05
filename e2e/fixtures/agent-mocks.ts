import { type Page } from '@playwright/test';

// ===========================================================================
// Agent Health mock — 24 agents with varied health status
// ===========================================================================

const AGENT_NAMES = [
  'Recommender', 'Curator', 'Retention Predictor', 'Nudger', 'Balancer',
  'Trigger', 'Exam Coaching', 'Assessment Generator', 'Content Analyzer',
  'Difficulty Scorer', 'Knowledge Graph', 'Prerequisite Mapper', 'PvP Screener',
  'Reviewer', 'Summarizer', 'Translator', 'Insight Generator',
  'Investigator', 'Gatekeeper', 'Exam Prep Coach', 'MCP Router',
  'Model Broker', 'Orchestrator Hub', 'Content Ingestion',
];

function buildAgentHealthList(): Record<string, unknown>[] {
  return AGENT_NAMES.map((name, i) => {
    const id = `agent-${name.toLowerCase().replace(/ /g, '-')}`;
    let status: string;
    if (i < 20) status = 'healthy';
    else if (i < 22) status = 'degraded';
    else status = 'down';

    return {
      agent_id: id,
      agent_name: name,
      status,
      p99_latency_ms: 50 + i * 20,
      token_usage_24h: 1000 * (i + 1),
      error_rate: status === 'healthy' ? 0.001 : status === 'degraded' ? 0.05 : 1.0,
      fallback_triggers: status === 'down' ? 50 : 0,
      last_active: new Date(Date.now() - i * 60000).toISOString(),
    };
  });
}

export async function mockAgentHealth(page: Page): Promise<void> {
  await page.route('**/api/v1/familiar/agents/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ agents: buildAgentHealthList() }),
    });
  });

  await page.route('**/api/v1/familiar/agents/metrics**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token_usage: [
          { timestamp: '2026-03-15T00:00:00Z', value: 5000 },
          { timestamp: '2026-03-15T06:00:00Z', value: 8000 },
          { timestamp: '2026-03-15T12:00:00Z', value: 12000 },
        ],
        latency_history: [
          { timestamp: '2026-03-15T00:00:00Z', value: 90 },
          { timestamp: '2026-03-15T06:00:00Z', value: 120 },
          { timestamp: '2026-03-15T12:00:00Z', value: 110 },
        ],
        error_history: [
          { timestamp: '2026-03-15T00:00:00Z', value: 0 },
          { timestamp: '2026-03-15T06:00:00Z', value: 2 },
          { timestamp: '2026-03-15T12:00:00Z', value: 1 },
        ],
      }),
    });
  });
}

// ===========================================================================
// Translation mock
// ===========================================================================

export async function mockTranslation(page: Page): Promise<void> {
  await page.route('**/api/v1/cms/agents/translate', async (route) => {
    if (route.request().method() === 'POST' && !route.request().url().includes('batch')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content_id: 'atom-001',
          source_language: 'en',
          target_language: 'zh-CN',
          translated_content: 'This is the translated content in the target language.',
          confidence: 0.91,
          word_count: 120,
          governance: { model: 'gpt-4o', audit_id: 'audit-t-001' },
        }),
      });
    } else {
      await route.fallback();
    }
  });

  await page.route('**/api/v1/cms/agents/translate/batch', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: 'batch-001',
        status: 'in_progress',
        results: [
          { content_id: 'atom-001', status: 'completed', translated_content: 'Done', confidence: 0.9 },
          { content_id: 'atom-002', status: 'in_progress' },
          { content_id: 'atom-003', status: 'queued' },
        ],
      }),
    });
  });
}

// ===========================================================================
// Analytics Insights mock
// ===========================================================================

export async function mockInsights(page: Page): Promise<void> {
  await page.route('**/api/v1/analytics/agents/insight', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        insights: [
          {
            title: 'Engagement Decline',
            narrative: 'Daily active users decreased by 12% over the past 30 days.',
            metric_references: ['dau', 'session_duration'],
            trend_direction: 'down',
            confidence: 0.87,
          },
          {
            title: 'Content Completion Improved',
            narrative: 'Atom completion rates rose 8% after recent path restructuring.',
            metric_references: ['completion_rate'],
            trend_direction: 'up',
            confidence: 0.93,
          },
          {
            title: 'Retention Stable',
            narrative: '7-day and 30-day retention remain flat across all cohorts.',
            metric_references: ['retention_7d', 'retention_30d'],
            trend_direction: 'flat',
            confidence: 0.76,
          },
        ],
        summary: 'Engagement is declining but content quality is improving. Retention unchanged.',
        governance: { model: 'gpt-4o', audit_id: 'audit-i-001' },
      }),
    });
  });
}

// ===========================================================================
// Explainability / Governance Investigation mock
// ===========================================================================

export async function mockExplainability(page: Page): Promise<void> {
  await page.route('**/api/v1/governance/agents/investigate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        investigations: [
          {
            decision_id: 'dec-001',
            agent_name: 'Recommender',
            verdict: 'approved',
            reasoning_steps: [
              { step_number: 1, description: 'Checked learner history', evidence: '12 atoms completed, 85% accuracy', confidence: 0.92 },
              { step_number: 2, description: 'Evaluated content relevance', evidence: 'Prerequisite alignment verified', confidence: 0.88 },
            ],
            reasoning_summary: 'Recommendation approved based on learner readiness.',
            policy_references: [
              { name: 'Content Safety', description: 'All content must pass safety screening', trigger_reason: 'Routine check — passed' },
            ],
            timestamp: '2026-03-15T10:30:00Z',
          },
          {
            decision_id: 'dec-002',
            agent_name: 'Nudger',
            verdict: 'denied',
            reasoning_steps: [
              { step_number: 1, description: 'Checked notification frequency', evidence: '3 nudges already sent today', confidence: 0.95 },
            ],
            reasoning_summary: 'Nudge denied to prevent notification fatigue.',
            policy_references: [
              { name: 'Rate Limit', description: 'Max 3 nudges per 24h', trigger_reason: 'Limit exceeded' },
            ],
            timestamp: '2026-03-15T11:00:00Z',
          },
        ],
        governance: { model: 'gpt-4o', audit_id: 'audit-g-001' },
      }),
    });
  });
}

// ===========================================================================
// Recommendation widget mock (learner dashboard)
// ===========================================================================

export async function mockRecommendations(page: Page): Promise<void> {
  await page.route('**/api/v1/engagement/agents/recommend**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        recommendations: [
          { atom_id: 'atom-alg-001', title: 'Quadratic Equations', reason: 'Builds on your algebra progress', confidence: 0.91 },
          { atom_id: 'atom-phys-002', title: 'Newton Laws', reason: 'Popular in your cohort', confidence: 0.85 },
        ],
        governance: { model: 'gpt-4o' },
      }),
    });
  });
}

// ===========================================================================
// Retention alert mock (learner dashboard)
// ===========================================================================

export async function mockRetention(page: Page): Promise<void> {
  await page.route('**/api/v1/engagement/agents/retention**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        alerts: [
          { type: 'at_risk', message: 'Your streak is at risk! Complete one atom today.', priority: 'high' },
        ],
        governance: {},
      }),
    });
  });
}

// ===========================================================================
// Quality / content review mock (admin)
// ===========================================================================

export async function mockQualityData(page: Page): Promise<void> {
  await page.route('**/api/v1/cms/agents/review**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reviews: [
          {
            content_id: 'atom-001',
            quality_score: 0.88,
            issues: [],
            suggestions: ['Add visual diagram'],
            governance: {},
          },
        ],
      }),
    });
  });
}
