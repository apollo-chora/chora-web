import { type Locator, type Page, expect } from '@playwright/test';

export class DeveloperConsolePage {
  readonly page: Page;

  // Console overlay
  readonly consoleOverlay: Locator;
  readonly consoleToggleButton: Locator;
  readonly consoleTabs: Locator;

  // API inspector
  readonly apiInspector: Locator;
  readonly requestLog: Locator;
  readonly requestLogEntries: Locator;
  readonly requestMethodFilter: Locator;
  readonly requestStatusFilter: Locator;
  readonly requestDetailPanel: Locator;
  readonly requestUrl: Locator;
  readonly requestPayload: Locator;
  readonly responsePayload: Locator;
  readonly clearRequestLogButton: Locator;

  // Feature flags
  readonly featureFlagPanel: Locator;
  readonly featureFlagList: Locator;
  readonly featureFlagToggles: Locator;
  readonly flagSearchInput: Locator;
  readonly flagOverrideIndicator: Locator;
  readonly resetFlagsButton: Locator;

  // Event bus
  readonly eventBusPanel: Locator;
  readonly eventLog: Locator;
  readonly eventLogEntries: Locator;
  readonly eventTypeFilter: Locator;
  readonly eventSourceFilter: Locator;
  readonly eventDetailPanel: Locator;
  readonly clearEventLogButton: Locator;
  readonly pauseEventLogButton: Locator;

  // RLS context viewer
  readonly rlsViewer: Locator;
  readonly currentTenantId: Locator;
  readonly currentGcid: Locator;
  readonly currentRoles: Locator;
  readonly currentCapabilities: Locator;
  readonly rlsQueryPreview: Locator;
  readonly switchTenantButton: Locator;
  readonly tenantSelector: Locator;

  constructor(page: Page) {
    this.page = page;

    // Console overlay
    this.consoleOverlay = page.locator('[data-testid="developer-console-overlay"]');
    this.consoleToggleButton = page.locator('[data-testid="developer-console-toggle"]');
    this.consoleTabs = page.locator('[data-testid="developer-console-tabs"]');

    // API inspector
    this.apiInspector = page.locator('[data-testid="api-inspector"]');
    this.requestLog = page.locator('[data-testid="api-request-log"]');
    this.requestLogEntries = page.locator('[data-testid^="request-log-entry"]');
    this.requestMethodFilter = page.locator('[data-testid="request-method-filter"]');
    this.requestStatusFilter = page.locator('[data-testid="request-status-filter"]');
    this.requestDetailPanel = page.locator('[data-testid="request-detail-panel"]');
    this.requestUrl = page.locator('[data-testid="request-url"]');
    this.requestPayload = page.locator('[data-testid="request-payload"]');
    this.responsePayload = page.locator('[data-testid="response-payload"]');
    this.clearRequestLogButton = page.locator('[data-testid="clear-request-log-button"]');

    // Feature flags
    this.featureFlagPanel = page.locator('[data-testid="feature-flag-panel"]');
    this.featureFlagList = page.locator('[data-testid="feature-flag-list"]');
    this.featureFlagToggles = page.locator('[data-testid^="flag-toggle"]');
    this.flagSearchInput = page.locator('[data-testid="flag-search-input"]');
    this.flagOverrideIndicator = page.locator('[data-testid="flag-override-indicator"]');
    this.resetFlagsButton = page.locator('[data-testid="reset-flags-button"]');

    // Event bus
    this.eventBusPanel = page.locator('[data-testid="event-bus-panel"]');
    this.eventLog = page.locator('[data-testid="event-log"]');
    this.eventLogEntries = page.locator('[data-testid^="event-log-entry"]');
    this.eventTypeFilter = page.locator('[data-testid="event-type-filter"]');
    this.eventSourceFilter = page.locator('[data-testid="event-source-filter"]');
    this.eventDetailPanel = page.locator('[data-testid="event-detail-panel"]');
    this.clearEventLogButton = page.locator('[data-testid="clear-event-log-button"]');
    this.pauseEventLogButton = page.locator('[data-testid="pause-event-log-button"]');

    // RLS context viewer
    this.rlsViewer = page.locator('[data-testid="rls-context-viewer"]');
    this.currentTenantId = page.locator('[data-testid="rls-current-tenant-id"]');
    this.currentGcid = page.locator('[data-testid="rls-current-gcid"]');
    this.currentRoles = page.locator('[data-testid="rls-current-roles"]');
    this.currentCapabilities = page.locator('[data-testid="rls-current-capabilities"]');
    this.rlsQueryPreview = page.locator('[data-testid="rls-query-preview"]');
    this.switchTenantButton = page.locator('[data-testid="rls-switch-tenant-button"]');
    this.tenantSelector = page.locator('[data-testid="rls-tenant-selector"]');
  }

  async gotoAdminDeveloperConsole(): Promise<this> {
    await this.page.goto('/admin/developer');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async openConsoleOverlay(): Promise<this> {
    await this.page.keyboard.press('Backquote');
    await expect(this.consoleOverlay).toBeVisible();
    return this;
  }

  async closeConsoleOverlay(): Promise<this> {
    await this.page.keyboard.press('Backquote');
    await expect(this.consoleOverlay).not.toBeVisible();
    return this;
  }

  async selectTab(tabName: string): Promise<this> {
    await this.consoleTabs.locator(`[data-testid="console-tab-${tabName}"]`).click();
    return this;
  }

  // API inspector actions
  async expectApiInspectorLoaded(): Promise<this> {
    await expect(this.apiInspector).toBeVisible();
    return this;
  }

  async filterRequestsByMethod(method: string): Promise<this> {
    await this.requestMethodFilter.selectOption(method);
    return this;
  }

  async filterRequestsByStatus(status: string): Promise<this> {
    await this.requestStatusFilter.selectOption(status);
    return this;
  }

  async clearRequestLog(): Promise<this> {
    await this.clearRequestLogButton.click();
    return this;
  }

  async clickRequestEntry(index: number): Promise<this> {
    await this.requestLogEntries.nth(index).click();
    return this;
  }

  async getRequestEntryCount(): Promise<number> {
    return this.requestLogEntries.count();
  }

  // Feature flag actions
  async expectFeatureFlagPanelLoaded(): Promise<this> {
    await expect(this.featureFlagPanel).toBeVisible();
    return this;
  }

  async searchFlags(query: string): Promise<this> {
    await this.flagSearchInput.fill(query);
    return this;
  }

  async toggleFlag(flagCode: string): Promise<this> {
    await this.page.locator(`[data-testid="flag-toggle-${flagCode}"]`).click();
    return this;
  }

  async resetFlags(): Promise<this> {
    await this.resetFlagsButton.click();
    return this;
  }

  async getFlagCount(): Promise<number> {
    return this.featureFlagToggles.count();
  }

  // Event bus actions
  async expectEventBusPanelLoaded(): Promise<this> {
    await expect(this.eventBusPanel).toBeVisible();
    return this;
  }

  async filterEventsByType(type: string): Promise<this> {
    await this.eventTypeFilter.selectOption(type);
    return this;
  }

  async filterEventsBySource(source: string): Promise<this> {
    await this.eventSourceFilter.selectOption(source);
    return this;
  }

  async clearEventLog(): Promise<this> {
    await this.clearEventLogButton.click();
    return this;
  }

  async pauseEventLog(): Promise<this> {
    await this.pauseEventLogButton.click();
    return this;
  }

  async clickEventEntry(index: number): Promise<this> {
    await this.eventLogEntries.nth(index).click();
    return this;
  }

  async getEventEntryCount(): Promise<number> {
    return this.eventLogEntries.count();
  }

  // RLS context viewer actions
  async expectRlsViewerLoaded(): Promise<this> {
    await expect(this.rlsViewer).toBeVisible();
    return this;
  }

  async switchTenant(tenantId: string): Promise<this> {
    await this.tenantSelector.selectOption(tenantId);
    await this.switchTenantButton.click();
    return this;
  }
}
