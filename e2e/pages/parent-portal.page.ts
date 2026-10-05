import { type Locator, type Page, expect } from '@playwright/test';

export class ParentPortalPage {
  readonly page: Page;

  // Guardian dashboard
  readonly guardianDashboard: Locator;
  readonly linkedLearners: Locator;
  readonly dashboardSummaryCards: Locator;
  readonly addLearnerBtn: Locator;
  readonly linkCodeInput: Locator;
  readonly linkSubmitBtn: Locator;

  // Activity digest
  readonly activityDigest: Locator;
  readonly digestDateRange: Locator;
  readonly digestEntries: Locator;
  readonly digestRefreshBtn: Locator;
  readonly digestLearnerFilter: Locator;

  // Progress report
  readonly progressReport: Locator;
  readonly reportLearnerSelect: Locator;
  readonly reportPeriodSelect: Locator;
  readonly reportAtomCompletion: Locator;
  readonly reportStreakSummary: Locator;
  readonly reportXpChart: Locator;
  readonly reportExportBtn: Locator;

  // Consent management
  readonly consentPanel: Locator;
  readonly consentList: Locator;
  readonly consentToggle: Locator;
  readonly consentHistoryBtn: Locator;
  readonly consentHistory: Locator;
  readonly consentSaveBtn: Locator;

  constructor(page: Page) {
    this.page = page;

    this.guardianDashboard = page.locator('[data-testid="guardian-dashboard"]');
    this.linkedLearners = page.locator('[data-testid="linked-learners"]');
    this.dashboardSummaryCards = page.locator('[data-testid^="summary-card"]');
    this.addLearnerBtn = page.locator('[data-testid="btn-add-learner"]');
    this.linkCodeInput = page.locator('[data-testid="link-code-input"]');
    this.linkSubmitBtn = page.locator('[data-testid="btn-submit-link"]');

    this.activityDigest = page.locator('[data-testid="activity-digest"]');
    this.digestDateRange = page.locator('[data-testid="digest-date-range"]');
    this.digestEntries = page.locator('[data-testid="digest-entries"]');
    this.digestRefreshBtn = page.locator('[data-testid="btn-refresh-digest"]');
    this.digestLearnerFilter = page.locator('[data-testid="digest-learner-filter"]');

    this.progressReport = page.locator('[data-testid="progress-report"]');
    this.reportLearnerSelect = page.locator('[data-testid="report-learner-select"]');
    this.reportPeriodSelect = page.locator('[data-testid="report-period-select"]');
    this.reportAtomCompletion = page.locator('[data-testid="report-atom-completion"]');
    this.reportStreakSummary = page.locator('[data-testid="report-streak-summary"]');
    this.reportXpChart = page.locator('[data-testid="report-xp-chart"]');
    this.reportExportBtn = page.locator('[data-testid="btn-export-report"]');

    this.consentPanel = page.locator('[data-testid="consent-panel"]');
    this.consentList = page.locator('[data-testid="consent-list"]');
    this.consentToggle = page.locator('[data-testid^="consent-toggle"]');
    this.consentHistoryBtn = page.locator('[data-testid="btn-consent-history"]');
    this.consentHistory = page.locator('[data-testid="consent-history"]');
    this.consentSaveBtn = page.locator('[data-testid="btn-save-consent"]');
  }

  async gotoDashboard(): Promise<this> {
    await this.page.goto('/parent/dashboard');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoActivityDigest(): Promise<this> {
    await this.page.goto('/parent/activity');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoProgressReport(): Promise<this> {
    await this.page.goto('/parent/progress');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoConsent(): Promise<this> {
    await this.page.goto('/parent/consent');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectDashboardLoaded(): Promise<this> {
    await expect(this.guardianDashboard).toBeVisible();
    return this;
  }

  async expectActivityDigestLoaded(): Promise<this> {
    await expect(this.activityDigest).toBeVisible();
    return this;
  }

  async expectProgressReportLoaded(): Promise<this> {
    await expect(this.progressReport).toBeVisible();
    return this;
  }

  async expectConsentLoaded(): Promise<this> {
    await expect(this.consentPanel).toBeVisible();
    return this;
  }

  async enterLinkCode(code: string): Promise<this> {
    await this.linkCodeInput.fill(code);
    return this;
  }

  async submitLink(): Promise<this> {
    await this.linkSubmitBtn.click();
    return this;
  }

  async selectReportLearner(learnerId: string): Promise<this> {
    await this.reportLearnerSelect.selectOption(learnerId);
    return this;
  }

  async selectReportPeriod(period: string): Promise<this> {
    await this.reportPeriodSelect.selectOption(period);
    return this;
  }

  async filterDigestByLearner(learnerId: string): Promise<this> {
    await this.digestLearnerFilter.selectOption(learnerId);
    return this;
  }

  async saveConsent(): Promise<this> {
    await this.consentSaveBtn.click();
    return this;
  }

  async getLinkedLearnerCount(): Promise<number> {
    return this.linkedLearners.locator('[data-testid^="linked-learner"]').count();
  }

  async getDigestEntryCount(): Promise<number> {
    return this.digestEntries.locator('[data-testid^="digest-entry"]').count();
  }

  async getSummaryCardCount(): Promise<number> {
    return this.dashboardSummaryCards.count();
  }

  async getConsentItemCount(): Promise<number> {
    return this.consentList.locator('[data-testid^="consent-item"]').count();
  }

  async getConsentHistoryCount(): Promise<number> {
    return this.consentHistory.locator('[data-testid^="consent-history-entry"]').count();
  }
}
