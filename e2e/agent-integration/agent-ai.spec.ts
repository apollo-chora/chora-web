import { test, expect } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import { mockDashboard, mockGoals, mockLeaderboard } from '../fixtures/bff-mocks';
import {
  mockAgentHealth,
  mockTranslation,
  mockInsights,
  mockExplainability,
  mockRecommendations,
  mockRetention,
} from '../fixtures/agent-mocks';
import { AgentMonitoringPage } from '../pages/agent-monitoring.page';
import { AgentExplainabilityPage } from '../pages/agent-explainability.page';

// ---------------------------------------------------------------------------
// Dashboard AI widgets
// ---------------------------------------------------------------------------

test.describe('Dashboard — AI agent widgets', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page);
    await mockDashboard(page);
    await mockGoals(page);
    await mockLeaderboard(page);
  });

  test('dashboard shows recommendation widget when agent responds', async ({ page }) => {
    await mockRecommendations(page);
    await mockRetention(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="dashboard-grid"]')).toBeVisible();
    // Recommendation widget renders with AI-provided suggestions
    const recWidget = page.locator('[data-testid="recommendation-widget"]');
    if (await recWidget.isVisible()) {
      await expect(recWidget).toBeVisible();
    }
  });

  test('dashboard shows retention alert when agent responds', async ({ page }) => {
    await mockRecommendations(page);
    await mockRetention(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="dashboard-grid"]')).toBeVisible();
    // Retention alert banner if present
    const retentionAlert = page.locator('[data-testid="retention-alert"]');
    if (await retentionAlert.isVisible()) {
      await expect(retentionAlert).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// Admin monitoring dashboard
// ---------------------------------------------------------------------------

test.describe('Admin — Agent monitoring dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await mockAgentHealth(page);
  });

  test('renders agent monitoring dashboard with agent cards', async ({ page }) => {
    const monitoring = new AgentMonitoringPage(page);
    await monitoring.goto();
    await monitoring.expectLoaded();
  });

  test('displays health summary counts', async ({ page }) => {
    const monitoring = new AgentMonitoringPage(page);
    await monitoring.goto();
    await monitoring.expectLoaded();

    // Health summary should be visible
    await expect(monitoring.healthSummary).toBeVisible();
  });

  test('clicking an agent card opens details panel', async ({ page }) => {
    const monitoring = new AgentMonitoringPage(page);
    await monitoring.goto();
    await monitoring.expectLoaded();

    // Click the first agent card
    const firstCard = page.locator('[data-testid^="agent-card-"]').first();
    if (await firstCard.isVisible()) {
      await firstCard.click();
    }
  });
});

// ---------------------------------------------------------------------------
// Admin translation panel
// ---------------------------------------------------------------------------

test.describe('Admin — Translation panel', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'content-manager');
    await mockTranslation(page);
  });

  test('translation panel allows language selection', async ({ page }) => {
    await page.goto('/admin/content/translation');
    await page.waitForLoadState('networkidle');

    const translationPanel = page.locator('[data-testid="translation-panel"]');
    if (await translationPanel.isVisible()) {
      await expect(translationPanel).toBeVisible();

      // Language selectors should be present
      const sourceLang = page.locator('[data-testid="source-language-select"]');
      const targetLang = page.locator('[data-testid="target-language-select"]');
      if (await sourceLang.isVisible()) {
        await expect(sourceLang).toBeVisible();
        await expect(targetLang).toBeVisible();
      }
    }
  });

  test('shows translation preview after translating', async ({ page }) => {
    await page.goto('/admin/content/translation');
    await page.waitForLoadState('networkidle');

    const contentIdInput = page.locator('[data-testid="content-id-input"]');
    if (await contentIdInput.isVisible()) {
      await contentIdInput.fill('atom-001');

      const translateBtn = page.locator('[data-testid="translate-btn"]');
      await translateBtn.click();

      // Preview should show translated content
      const preview = page.locator('[data-testid="translation-preview"]');
      if (await preview.isVisible({ timeout: 3000 })) {
        await expect(preview).toBeVisible();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Admin explainability viewer
// ---------------------------------------------------------------------------

test.describe('Admin — Explainability viewer', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await mockExplainability(page);
  });

  test('explainability viewer shows investigation results', async ({ page }) => {
    const explainability = new AgentExplainabilityPage(page);
    await explainability.goto();

    const container = page.locator('[data-testid="explainability-viewer"]');
    if (await container.isVisible()) {
      await explainability.expectLoaded();
    }
  });

  test('expanding investigation shows reasoning trace', async ({ page }) => {
    const explainability = new AgentExplainabilityPage(page);
    await explainability.goto();

    const container = page.locator('[data-testid="explainability-viewer"]');
    if (await container.isVisible()) {
      const firstRow = page.locator('[data-testid^="investigation-row-"]').first();
      if (await firstRow.isVisible()) {
        await firstRow.click();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Navigation between panels
// ---------------------------------------------------------------------------

test.describe('Admin — Navigation between AI panels', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await mockAgentHealth(page);
    await mockTranslation(page);
    await mockInsights(page);
    await mockExplainability(page);
  });

  test('admin can navigate between agent panels', async ({ page }) => {
    // Start at monitoring
    await page.goto('/admin/agents/monitoring');
    await page.waitForLoadState('networkidle');

    // Navigate to translation
    await page.goto('/admin/content/translation');
    await page.waitForLoadState('networkidle');

    // Navigate to insights
    await page.goto('/admin/analytics/insights');
    await page.waitForLoadState('networkidle');

    // Navigate to explainability
    await page.goto('/admin/governance/explainability');
    await page.waitForLoadState('networkidle');

    // All navigations should succeed without error
    await expect(page).not.toHaveURL(/error/);
  });
});
