import { type Locator, type Page, expect } from '@playwright/test';

export class AgentMonitoringPage {
  readonly page: Page;
  readonly container: Locator;
  readonly loadingState: Locator;
  readonly errorState: Locator;
  readonly retryButton: Locator;
  readonly agentGrid: Locator;
  readonly agentCards: Locator;
  readonly refreshButton: Locator;
  readonly periodSelect: Locator;
  readonly healthSummary: Locator;
  readonly detailsPanel: Locator;
  readonly detailsCloseButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="agent-monitor-dashboard"]');
    this.loadingState = page.locator('[data-testid="agent-monitor-loading"]');
    this.errorState = page.locator('[data-testid="agent-monitor-error"]');
    this.retryButton = page.locator('[data-testid="agent-monitor-retry"]');
    this.agentGrid = page.locator('[data-testid="agent-grid"]');
    this.agentCards = page.locator('[data-testid^="agent-card-"]');
    this.refreshButton = page.locator('[data-testid="agent-monitor-refresh"]');
    this.periodSelect = page.locator('[data-testid="metric-period-select"]');
    this.healthSummary = page.locator('[data-testid="health-summary"]');
    this.detailsPanel = page.locator('[data-testid="agent-details-panel"]');
    this.detailsCloseButton = page.locator('[data-testid="agent-details-close"]');
  }

  async goto(): Promise<this> {
    await this.page.goto('/admin/agents/monitoring');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectLoaded(): Promise<this> {
    await expect(this.container).toBeVisible();
    return this;
  }

  async expectAgentCards(count: number): Promise<this> {
    await expect(this.agentCards).toHaveCount(count);
    return this;
  }

  async clickAgentCard(agentId: string): Promise<this> {
    await this.page.locator(`[data-testid="agent-card-${agentId}"]`).click();
    return this;
  }

  async expectDetailsVisible(): Promise<this> {
    await expect(this.detailsPanel).toBeVisible();
    return this;
  }

  async closeDetails(): Promise<this> {
    await this.detailsCloseButton.click();
    return this;
  }

  async refresh(): Promise<this> {
    await this.refreshButton.click();
    return this;
  }

  async getHealthyCount(): Promise<string> {
    return this.page.locator('[data-testid="healthy-count"]').textContent() ?? '';
  }

  async getDegradedCount(): Promise<string> {
    return this.page.locator('[data-testid="degraded-count"]').textContent() ?? '';
  }

  async getDownCount(): Promise<string> {
    return this.page.locator('[data-testid="down-count"]').textContent() ?? '';
  }
}
