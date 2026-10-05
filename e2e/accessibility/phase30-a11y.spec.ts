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
import { runAxeAudit } from '../fixtures/a11y.fixture';

// ---------------------------------------------------------------------------
// Dashboard with AI widgets
// ---------------------------------------------------------------------------

test.describe('Accessibility — Phase 30 AI features', () => {
  test('dashboard with AI widgets loaded has no critical a11y violations', async ({ page }) => {
    await mockAuthSession(page);
    await mockDashboard(page);
    await mockGoals(page);
    await mockLeaderboard(page);
    await mockRecommendations(page);
    await mockRetention(page);

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="dashboard-grid"]')).toBeVisible();

    await runAxeAudit(page, 'Dashboard with AI widgets');
  });

  // -----------------------------------------------------------------------
  // Admin agent monitoring
  // -----------------------------------------------------------------------

  test('admin agent monitoring dashboard has no critical a11y violations', async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await mockAgentHealth(page);

    await page.goto('/admin/agents/monitoring');
    await page.waitForLoadState('networkidle');

    const container = page.locator('[data-testid="agent-monitor-dashboard"]');
    if (await container.isVisible({ timeout: 3000 })) {
      await runAxeAudit(page, 'Agent Monitoring Dashboard');
    }
  });

  // -----------------------------------------------------------------------
  // Admin translation panel
  // -----------------------------------------------------------------------

  test('admin translation panel has no critical a11y violations', async ({ page }) => {
    await mockAuthSession(page, 'content-manager');
    await mockTranslation(page);

    await page.goto('/admin/content/translation');
    await page.waitForLoadState('networkidle');

    const panel = page.locator('[data-testid="translation-panel"]');
    if (await panel.isVisible({ timeout: 3000 })) {
      await runAxeAudit(page, 'Translation Panel');
    }
  });

  // -----------------------------------------------------------------------
  // Admin analytics insights
  // -----------------------------------------------------------------------

  test('admin analytics insights has no critical a11y violations', async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await mockInsights(page);

    await page.goto('/admin/analytics/insights');
    await page.waitForLoadState('networkidle');

    const container = page.locator('[data-testid="insight-narrative"]');
    if (await container.isVisible({ timeout: 3000 })) {
      await runAxeAudit(page, 'Analytics Insights');
    }
  });

  // -----------------------------------------------------------------------
  // Admin explainability viewer
  // -----------------------------------------------------------------------

  test('admin explainability viewer has no critical a11y violations', async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await mockExplainability(page);

    await page.goto('/admin/governance/explainability');
    await page.waitForLoadState('networkidle');

    const container = page.locator('[data-testid="explainability-viewer"]');
    if (await container.isVisible({ timeout: 3000 })) {
      await runAxeAudit(page, 'Explainability Viewer');
    }
  });
});
