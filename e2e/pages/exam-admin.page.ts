import { type Locator, type Page, expect } from '@playwright/test';

export class ExamAdminPage {
  readonly page: Page;

  // Contract list
  readonly contractList: Locator;
  readonly contractTable: Locator;
  readonly contractStatusFilter: Locator;
  readonly contractSearchInput: Locator;

  // Venue manager
  readonly venueManager: Locator;
  readonly examVenueList: Locator;
  readonly addVenueBtn: Locator;
  readonly venueCapacityInput: Locator;

  // Sitting scheduler
  readonly sittingScheduler: Locator;
  readonly sittingCalendar: Locator;
  readonly sittingList: Locator;
  readonly createSittingBtn: Locator;
  readonly sittingDatePicker: Locator;
  readonly sittingContractSelect: Locator;
  readonly sittingVenueSelect: Locator;
  readonly sittingCapacityInput: Locator;
  readonly sittingSubmitBtn: Locator;

  // Proctor dashboard
  readonly proctorDashboard: Locator;
  readonly activeSittings: Locator;
  readonly proctorAlerts: Locator;
  readonly candidateList: Locator;
  readonly incidentLogBtn: Locator;

  // Results
  readonly resultsPanel: Locator;
  readonly resultsTable: Locator;
  readonly resultsSittingFilter: Locator;
  readonly resultsExportBtn: Locator;

  constructor(page: Page) {
    this.page = page;

    this.contractList = page.locator('[data-testid="contract-list"]');
    this.contractTable = page.locator('[data-testid="contract-table"]');
    this.contractStatusFilter = page.locator('[data-testid="contract-status-filter"]');
    this.contractSearchInput = page.locator('[data-testid="contract-search-input"]');

    this.venueManager = page.locator('[data-testid="exam-venue-manager"]');
    this.examVenueList = page.locator('[data-testid="exam-venue-list"]');
    this.addVenueBtn = page.locator('[data-testid="btn-add-exam-venue"]');
    this.venueCapacityInput = page.locator('[data-testid="venue-capacity-input"]');

    this.sittingScheduler = page.locator('[data-testid="sitting-scheduler"]');
    this.sittingCalendar = page.locator('[data-testid="sitting-calendar"]');
    this.sittingList = page.locator('[data-testid="sitting-list"]');
    this.createSittingBtn = page.locator('[data-testid="btn-create-sitting"]');
    this.sittingDatePicker = page.locator('[data-testid="sitting-date-picker"]');
    this.sittingContractSelect = page.locator('[data-testid="sitting-contract-select"]');
    this.sittingVenueSelect = page.locator('[data-testid="sitting-venue-select"]');
    this.sittingCapacityInput = page.locator('[data-testid="sitting-capacity-input"]');
    this.sittingSubmitBtn = page.locator('[data-testid="btn-submit-sitting"]');

    this.proctorDashboard = page.locator('[data-testid="proctor-dashboard"]');
    this.activeSittings = page.locator('[data-testid="active-sittings"]');
    this.proctorAlerts = page.locator('[data-testid="proctor-alerts"]');
    this.candidateList = page.locator('[data-testid="candidate-list"]');
    this.incidentLogBtn = page.locator('[data-testid="btn-incident-log"]');

    this.resultsPanel = page.locator('[data-testid="results-panel"]');
    this.resultsTable = page.locator('[data-testid="results-table"]');
    this.resultsSittingFilter = page.locator('[data-testid="results-sitting-filter"]');
    this.resultsExportBtn = page.locator('[data-testid="btn-export-results"]');
  }

  async gotoContracts(): Promise<this> {
    await this.page.goto('/admin/exam-admin/contracts');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoVenueManager(): Promise<this> {
    await this.page.goto('/admin/exam-admin/venues');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoSittingScheduler(): Promise<this> {
    await this.page.goto('/admin/exam-admin/sittings');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoProctorDashboard(): Promise<this> {
    await this.page.goto('/admin/exam-admin/proctor');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoResults(): Promise<this> {
    await this.page.goto('/admin/exam-admin/results');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectContractListLoaded(): Promise<this> {
    await expect(this.contractList).toBeVisible();
    return this;
  }

  async expectVenueManagerLoaded(): Promise<this> {
    await expect(this.venueManager).toBeVisible();
    return this;
  }

  async expectSittingSchedulerLoaded(): Promise<this> {
    await expect(this.sittingScheduler).toBeVisible();
    return this;
  }

  async expectProctorDashboardLoaded(): Promise<this> {
    await expect(this.proctorDashboard).toBeVisible();
    return this;
  }

  async expectResultsLoaded(): Promise<this> {
    await expect(this.resultsPanel).toBeVisible();
    return this;
  }

  async filterContractsByStatus(status: string): Promise<this> {
    await this.contractStatusFilter.selectOption(status);
    return this;
  }

  async searchContracts(query: string): Promise<this> {
    await this.contractSearchInput.fill(query);
    return this;
  }

  async getContractRowCount(): Promise<number> {
    return this.contractTable.locator('[data-testid^="contract-row"]').count();
  }

  async getExamVenueCount(): Promise<number> {
    return this.examVenueList.locator('[data-testid^="exam-venue-row"]').count();
  }

  async getSittingCount(): Promise<number> {
    return this.sittingList.locator('[data-testid^="sitting-row"]').count();
  }

  async getCandidateCount(): Promise<number> {
    return this.candidateList.locator('[data-testid^="candidate-row"]').count();
  }

  async getResultRowCount(): Promise<number> {
    return this.resultsTable.locator('[data-testid^="result-row"]').count();
  }
}
