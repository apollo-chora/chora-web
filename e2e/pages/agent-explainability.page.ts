import { type Locator, type Page, expect } from '@playwright/test';

export class AgentExplainabilityPage {
  readonly page: Page;
  readonly container: Locator;
  readonly loadingState: Locator;
  readonly errorState: Locator;
  readonly agentNameInput: Locator;
  readonly verdictSelect: Locator;
  readonly dateFromInput: Locator;
  readonly dateToInput: Locator;
  readonly searchButton: Locator;
  readonly investigationList: Locator;
  readonly investigationRows: Locator;
  readonly reasoningTrace: Locator;
  readonly policyReferences: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="explainability-viewer"]');
    this.loadingState = page.locator('[data-testid="explainability-loading"]');
    this.errorState = page.locator('[data-testid="explainability-error"]');
    this.agentNameInput = page.locator('[data-testid="agent-name-filter"]');
    this.verdictSelect = page.locator('[data-testid="verdict-filter"]');
    this.dateFromInput = page.locator('[data-testid="date-from-filter"]');
    this.dateToInput = page.locator('[data-testid="date-to-filter"]');
    this.searchButton = page.locator('[data-testid="explainability-search"]');
    this.investigationList = page.locator('[data-testid="investigation-list"]');
    this.investigationRows = page.locator('[data-testid^="investigation-row-"]');
    this.reasoningTrace = page.locator('[data-testid="reasoning-trace"]');
    this.policyReferences = page.locator('[data-testid="policy-references"]');
  }

  async goto(): Promise<this> {
    await this.page.goto('/admin/governance/explainability');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectLoaded(): Promise<this> {
    await expect(this.container).toBeVisible();
    return this;
  }

  async filterByAgentName(name: string): Promise<this> {
    await this.agentNameInput.fill(name);
    return this;
  }

  async filterByVerdict(verdict: string): Promise<this> {
    await this.verdictSelect.selectOption(verdict);
    return this;
  }

  async search(): Promise<this> {
    await this.searchButton.click();
    return this;
  }

  async expectInvestigationRows(count: number): Promise<this> {
    await expect(this.investigationRows).toHaveCount(count);
    return this;
  }

  async expandInvestigation(decisionId: string): Promise<this> {
    await this.page.locator(`[data-testid="investigation-row-${decisionId}"]`).click();
    return this;
  }

  async expectReasoningTraceVisible(): Promise<this> {
    await expect(this.reasoningTrace).toBeVisible();
    return this;
  }

  async expectPoliciesVisible(): Promise<this> {
    await expect(this.policyReferences).toBeVisible();
    return this;
  }
}
