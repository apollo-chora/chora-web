import { type Locator, type Page, expect } from '@playwright/test';

export class WblPage {
  readonly page: Page;

  // Placement list
  readonly placementList: Locator;
  readonly placementTable: Locator;
  readonly placementStatusFilter: Locator;
  readonly placementSearchInput: Locator;

  // Placement detail
  readonly placementDetail: Locator;
  readonly placementTitle: Locator;
  readonly placementOrganisation: Locator;
  readonly placementSupervisor: Locator;
  readonly placementDateRange: Locator;
  readonly placementStatus: Locator;

  // Work log
  readonly workLogPanel: Locator;
  readonly workLogList: Locator;
  readonly workLogCreateBtn: Locator;
  readonly workLogDateInput: Locator;
  readonly workLogHoursInput: Locator;
  readonly workLogDescriptionInput: Locator;
  readonly workLogCompetencySelect: Locator;
  readonly workLogSubmitBtn: Locator;
  readonly workLogTotalHours: Locator;

  // Capstone
  readonly capstoneTracker: Locator;
  readonly capstoneTitle: Locator;
  readonly capstoneProgress: Locator;
  readonly capstoneMilestones: Locator;
  readonly capstoneSubmitBtn: Locator;
  readonly capstoneStatus: Locator;

  // Supervisor feedback
  readonly supervisorFeedback: Locator;
  readonly feedbackList: Locator;
  readonly feedbackRating: Locator;
  readonly feedbackCommentInput: Locator;
  readonly feedbackSubmitBtn: Locator;

  constructor(page: Page) {
    this.page = page;

    this.placementList = page.locator('[data-testid="placement-list"]');
    this.placementTable = page.locator('[data-testid="placement-table"]');
    this.placementStatusFilter = page.locator('[data-testid="placement-status-filter"]');
    this.placementSearchInput = page.locator('[data-testid="placement-search-input"]');

    this.placementDetail = page.locator('[data-testid="placement-detail"]');
    this.placementTitle = page.locator('[data-testid="placement-title"]');
    this.placementOrganisation = page.locator('[data-testid="placement-organisation"]');
    this.placementSupervisor = page.locator('[data-testid="placement-supervisor"]');
    this.placementDateRange = page.locator('[data-testid="placement-date-range"]');
    this.placementStatus = page.locator('[data-testid="placement-status"]');

    this.workLogPanel = page.locator('[data-testid="work-log-panel"]');
    this.workLogList = page.locator('[data-testid="work-log-list"]');
    this.workLogCreateBtn = page.locator('[data-testid="btn-create-work-log"]');
    this.workLogDateInput = page.locator('[data-testid="work-log-date-input"]');
    this.workLogHoursInput = page.locator('[data-testid="work-log-hours-input"]');
    this.workLogDescriptionInput = page.locator('[data-testid="work-log-description-input"]');
    this.workLogCompetencySelect = page.locator('[data-testid="work-log-competency-select"]');
    this.workLogSubmitBtn = page.locator('[data-testid="btn-submit-work-log"]');
    this.workLogTotalHours = page.locator('[data-testid="work-log-total-hours"]');

    this.capstoneTracker = page.locator('[data-testid="capstone-tracker"]');
    this.capstoneTitle = page.locator('[data-testid="capstone-title"]');
    this.capstoneProgress = page.locator('[data-testid="capstone-progress"]');
    this.capstoneMilestones = page.locator('[data-testid="capstone-milestones"]');
    this.capstoneSubmitBtn = page.locator('[data-testid="btn-submit-capstone"]');
    this.capstoneStatus = page.locator('[data-testid="capstone-status"]');

    this.supervisorFeedback = page.locator('[data-testid="supervisor-feedback"]');
    this.feedbackList = page.locator('[data-testid="feedback-list"]');
    this.feedbackRating = page.locator('[data-testid="feedback-rating"]');
    this.feedbackCommentInput = page.locator('[data-testid="feedback-comment-input"]');
    this.feedbackSubmitBtn = page.locator('[data-testid="btn-submit-feedback"]');
  }

  async gotoPlacements(): Promise<this> {
    await this.page.goto('/wbl/placements');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoPlacementDetail(placementId: string): Promise<this> {
    await this.page.goto(`/wbl/placements/${placementId}`);
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoWorkLog(placementId: string): Promise<this> {
    await this.page.goto(`/wbl/placements/${placementId}/work-log`);
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoCapstone(placementId: string): Promise<this> {
    await this.page.goto(`/wbl/placements/${placementId}/capstone`);
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoSupervisorFeedback(placementId: string): Promise<this> {
    await this.page.goto(`/wbl/placements/${placementId}/feedback`);
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectPlacementListLoaded(): Promise<this> {
    await expect(this.placementList).toBeVisible();
    return this;
  }

  async expectPlacementDetailLoaded(): Promise<this> {
    await expect(this.placementDetail).toBeVisible();
    return this;
  }

  async expectWorkLogLoaded(): Promise<this> {
    await expect(this.workLogPanel).toBeVisible();
    return this;
  }

  async expectCapstoneLoaded(): Promise<this> {
    await expect(this.capstoneTracker).toBeVisible();
    return this;
  }

  async expectSupervisorFeedbackLoaded(): Promise<this> {
    await expect(this.supervisorFeedback).toBeVisible();
    return this;
  }

  async filterPlacementsByStatus(status: string): Promise<this> {
    await this.placementStatusFilter.selectOption(status);
    return this;
  }

  async searchPlacements(query: string): Promise<this> {
    await this.placementSearchInput.fill(query);
    return this;
  }

  async fillWorkLogEntry(hours: string, description: string): Promise<this> {
    await this.workLogHoursInput.fill(hours);
    await this.workLogDescriptionInput.fill(description);
    return this;
  }

  async submitWorkLog(): Promise<this> {
    await this.workLogSubmitBtn.click();
    return this;
  }

  async getPlacementRowCount(): Promise<number> {
    return this.placementTable.locator('[data-testid^="placement-row"]').count();
  }

  async getWorkLogEntryCount(): Promise<number> {
    return this.workLogList.locator('[data-testid^="work-log-entry"]').count();
  }

  async getMilestoneCount(): Promise<number> {
    return this.capstoneMilestones.locator('[data-testid^="milestone"]').count();
  }

  async getFeedbackCount(): Promise<number> {
    return this.feedbackList.locator('[data-testid^="feedback-entry"]').count();
  }
}
