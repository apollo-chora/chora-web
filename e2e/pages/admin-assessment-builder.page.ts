import { type Locator, type Page, expect } from '@playwright/test';

/**
 * Page Object Model for the admin assessment builder page.
 * Routes: /admin/content/assessments/new, /admin/content/assessments/:id/edit
 */
export class AdminAssessmentBuilderPage {
  readonly page: Page;
  readonly container: Locator;
  readonly title: Locator;
  readonly loadingState: Locator;

  // Session form
  readonly sessionForm: Locator;
  readonly sessionTitleInput: Locator;
  readonly sessionDescription: Locator;
  readonly sessionTypeSelect: Locator;
  readonly structureModeSelect: Locator;
  readonly timeLimitInput: Locator;

  // Summary
  readonly totalPoints: Locator;

  // Papers
  readonly papersSection: Locator;
  readonly addPaperButton: Locator;

  // Sections
  readonly sectionsPanel: Locator;
  readonly addSectionButton: Locator;

  // Atom picker
  readonly atomPickerOverlay: Locator;
  readonly closeAtomPickerButton: Locator;

  // Preview
  readonly togglePreviewButton: Locator;
  readonly previewPanel: Locator;

  // Actions
  readonly actions: Locator;
  readonly cancelButton: Locator;
  readonly saveDraftButton: Locator;
  readonly publishButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="assessment-builder"]');
    this.title = page.locator('[data-testid="assessment-title"]');
    this.loadingState = page.locator('[data-testid="assessment-loading"]');

    // Session form
    this.sessionForm = page.locator('[data-testid="session-form"]');
    this.sessionTitleInput = page.locator('[data-testid="session-title-input"]');
    this.sessionDescription = page.locator('[data-testid="session-description"]');
    this.sessionTypeSelect = page.locator('[data-testid="session-type-select"]');
    this.structureModeSelect = page.locator('[data-testid="structure-mode-select"]');
    this.timeLimitInput = page.locator('[data-testid="time-limit-input"]');

    // Summary
    this.totalPoints = page.locator('[data-testid="total-points"]');

    // Papers
    this.papersSection = page.locator('[data-testid="papers-section"]');
    this.addPaperButton = page.locator('[data-testid="add-paper"]');

    // Sections
    this.sectionsPanel = page.locator('[data-testid="sections-panel"]');
    this.addSectionButton = page.locator('[data-testid="add-section"]');

    // Atom picker
    this.atomPickerOverlay = page.locator('[data-testid="atom-picker-overlay"]');
    this.closeAtomPickerButton = page.locator('[data-testid="close-atom-picker"]');

    // Preview
    this.togglePreviewButton = page.locator('[data-testid="toggle-preview"]');
    this.previewPanel = page.locator('[data-testid="assessment-preview"]');

    // Actions
    this.actions = page.locator('[data-testid="assessment-actions"]');
    this.cancelButton = page.locator('[data-testid="btn-cancel"]');
    this.saveDraftButton = page.locator('[data-testid="btn-save-draft"]');
    this.publishButton = page.locator('[data-testid="btn-publish"]');
  }

  async gotoCreate(): Promise<this> {
    await this.page.goto('/admin/content/assessments/new');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoEdit(assessmentId: string): Promise<this> {
    await this.page.goto(`/admin/content/assessments/${assessmentId}/edit`);
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectLoaded(): Promise<this> {
    await expect(this.container).toBeVisible();
    await expect(this.sessionForm).toBeVisible();
    return this;
  }

  async fillSessionTitle(title: string): Promise<this> {
    await this.sessionTitleInput.fill(title);
    return this;
  }

  async fillDescription(desc: string): Promise<this> {
    await this.sessionDescription.fill(desc);
    return this;
  }

  async selectSessionType(type: string): Promise<this> {
    await this.sessionTypeSelect.selectOption(type);
    return this;
  }

  async selectStructureMode(mode: string): Promise<this> {
    await this.structureModeSelect.selectOption(mode);
    return this;
  }

  async setTimeLimit(minutes: number): Promise<this> {
    await this.timeLimitInput.fill(minutes.toString());
    return this;
  }

  async addPaper(): Promise<this> {
    await this.addPaperButton.click();
    return this;
  }

  async addSection(paperId?: string): Promise<this> {
    if (paperId) {
      await this.page.locator(`[data-testid="add-section-to-${paperId}"]`).click();
    } else {
      await this.addSectionButton.click();
    }
    return this;
  }

  // Paper interactions
  getPaper(paperId: string): Locator {
    return this.page.locator(`[data-testid="paper-${paperId}"]`);
  }

  async togglePaperExpand(paperId: string): Promise<this> {
    await this.page.locator(`[data-testid="toggle-paper-${paperId}"]`).click();
    return this;
  }

  async removePaper(paperId: string): Promise<this> {
    await this.page.locator(`[data-testid="remove-paper-${paperId}"]`).click();
    return this;
  }

  async updatePaperTitle(paperId: string, title: string): Promise<this> {
    await this.page.locator(`[data-testid="paper-title-input-${paperId}"]`).fill(title);
    return this;
  }

  // Section interactions
  getSection(sectionId: string): Locator {
    return this.page.locator(`[data-testid="section-${sectionId}"]`);
  }

  async toggleSectionExpand(sectionId: string): Promise<this> {
    await this.page.locator(`[data-testid="toggle-section-${sectionId}"]`).click();
    return this;
  }

  async removeSection(sectionId: string): Promise<this> {
    await this.page.locator(`[data-testid="remove-section-${sectionId}"]`).click();
    return this;
  }

  async openAtomPicker(sectionId: string): Promise<this> {
    await this.page.locator(`[data-testid="add-atom-to-${sectionId}"]`).click();
    return this;
  }

  async selectAtomFromPicker(atomId: string): Promise<this> {
    await this.page.locator(`[data-testid="select-atom-${atomId}"]`).click();
    return this;
  }

  async closeAtomPicker(): Promise<this> {
    await this.closeAtomPickerButton.click();
    return this;
  }

  async togglePreview(): Promise<this> {
    await this.togglePreviewButton.click();
    return this;
  }

  async saveDraft(): Promise<void> {
    await this.saveDraftButton.click();
  }

  async publish(): Promise<void> {
    await this.publishButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }
}
