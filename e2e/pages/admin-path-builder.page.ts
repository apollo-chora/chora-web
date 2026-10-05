import { type Locator, type Page, expect } from '@playwright/test';

/**
 * Page Object Model for the admin path builder page.
 * Routes: /admin/content/paths/new, /admin/content/paths/:id/edit
 */
export class AdminPathBuilderPage {
  readonly page: Page;
  readonly container: Locator;
  readonly title: Locator;
  readonly loadingState: Locator;

  // Metadata form
  readonly metaForm: Locator;
  readonly pathTitleInput: Locator;
  readonly pathDescription: Locator;
  readonly durationInput: Locator;
  readonly enrollmentTypeSelect: Locator;

  // Steps section
  readonly stepsSection: Locator;
  readonly addStepButton: Locator;
  readonly stepsEmpty: Locator;

  // Atom picker
  readonly atomPickerOverlay: Locator;
  readonly closeAtomPickerButton: Locator;

  // Actions
  readonly actions: Locator;
  readonly cancelButton: Locator;
  readonly saveDraftButton: Locator;
  readonly publishButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="path-builder"]');
    this.title = page.locator('[data-testid="path-title"]');
    this.loadingState = page.locator('[data-testid="path-loading"]');

    // Metadata form
    this.metaForm = page.locator('[data-testid="path-meta-form"]');
    this.pathTitleInput = page.locator('[data-testid="path-title-input"]');
    this.pathDescription = page.locator('[data-testid="path-description"]');
    this.durationInput = page.locator('[data-testid="path-duration-input"]');
    this.enrollmentTypeSelect = page.locator('[data-testid="enrollment-type-select"]');

    // Steps section
    this.stepsSection = page.locator('[data-testid="steps-section"]');
    this.addStepButton = page.locator('[data-testid="add-step"]');
    this.stepsEmpty = page.locator('[data-testid="steps-empty"]');

    // Atom picker
    this.atomPickerOverlay = page.locator('[data-testid="atom-picker-overlay"]');
    this.closeAtomPickerButton = page.locator('[data-testid="close-atom-picker"]');

    // Actions
    this.actions = page.locator('[data-testid="path-actions"]');
    this.cancelButton = page.locator('[data-testid="btn-cancel"]');
    this.saveDraftButton = page.locator('[data-testid="btn-save-draft"]');
    this.publishButton = page.locator('[data-testid="btn-publish"]');
  }

  async gotoCreate(): Promise<this> {
    await this.page.goto('/admin/content/paths/new');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoEdit(pathId: string): Promise<this> {
    await this.page.goto(`/admin/content/paths/${pathId}/edit`);
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectLoaded(): Promise<this> {
    await expect(this.container).toBeVisible();
    await expect(this.metaForm).toBeVisible();
    return this;
  }

  async expectEmpty(): Promise<this> {
    await expect(this.stepsEmpty).toBeVisible();
    return this;
  }

  async fillPathTitle(title: string): Promise<this> {
    await this.pathTitleInput.fill(title);
    return this;
  }

  async fillDescription(desc: string): Promise<this> {
    await this.pathDescription.fill(desc);
    return this;
  }

  async setDuration(minutes: number): Promise<this> {
    await this.durationInput.fill(minutes.toString());
    return this;
  }

  async selectEnrollmentType(type: string): Promise<this> {
    await this.enrollmentTypeSelect.selectOption(type);
    return this;
  }

  async clickAddStep(): Promise<this> {
    await this.addStepButton.click();
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

  // Step interactions
  getStep(index: number): Locator {
    return this.page.locator(`[data-testid="step-${index}"]`);
  }

  getStepTitle(index: number): Locator {
    return this.page.locator(`[data-testid="step-title-${index}"]`);
  }

  async togglePrerequisite(index: number): Promise<this> {
    await this.page.locator(`[data-testid="prerequisite-${index}"]`).click();
    return this;
  }

  async removeStep(index: number): Promise<this> {
    await this.page.locator(`[data-testid="remove-step-${index}"]`).click();
    return this;
  }

  async getStepCount(): Promise<number> {
    return this.page.locator('[data-testid^="step-"]').count();
  }

  // Actions
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
