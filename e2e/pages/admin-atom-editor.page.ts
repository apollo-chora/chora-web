import { type Locator, type Page, expect } from '@playwright/test';

/**
 * Page Object Model for the admin atom editor page.
 * Routes: /admin/content/atoms/new, /admin/content/atoms/:id/edit
 */
export class AdminAtomEditorPage {
  readonly page: Page;
  readonly container: Locator;
  readonly title: Locator;
  readonly statusBadge: Locator;
  readonly metaForm: Locator;
  readonly atomTypeSelect: Locator;
  readonly difficultySlider: Locator;
  readonly difficultyValue: Locator;
  readonly languageCodeInput: Locator;
  readonly tagsInput: Locator;
  readonly contentSection: Locator;
  readonly rulesSection: Locator;
  readonly addRuleButton: Locator;
  readonly previewToggle: Locator;
  readonly previewPanel: Locator;
  readonly actions: Locator;
  readonly cancelButton: Locator;
  readonly saveDraftButton: Locator;
  readonly publishButton: Locator;
  readonly loadingState: Locator;

  // MCQ-specific
  readonly mcqStem: Locator;
  readonly mcqOptions: Locator;
  readonly mcqAddOption: Locator;
  readonly mcqExplanation: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="atom-editor"]');
    this.title = page.locator('[data-testid="atom-editor-title"]');
    this.statusBadge = page.locator('[data-testid="atom-editor-status"]');
    this.metaForm = page.locator('[data-testid="atom-editor-meta"]');
    this.atomTypeSelect = page.locator('[data-testid="atom-type-select"]');
    this.difficultySlider = page.locator('[data-testid="difficulty-slider"]');
    this.difficultyValue = page.locator('[data-testid="difficulty-value"]');
    this.languageCodeInput = page.locator('[data-testid="language-code-input"]');
    this.tagsInput = page.locator('[data-testid="tags-input"]');
    this.contentSection = page.locator('[data-testid="atom-editor-content"]');
    this.rulesSection = page.locator('[data-testid="atom-editor-rules"]');
    this.addRuleButton = page.locator('[data-testid="add-rule"]');
    this.previewToggle = page.locator('[data-testid="toggle-preview"]');
    this.previewPanel = page.locator('[data-testid="atom-preview"]');
    this.actions = page.locator('[data-testid="atom-editor-actions"]');
    this.cancelButton = page.locator('[data-testid="btn-cancel"]');
    this.saveDraftButton = page.locator('[data-testid="btn-save-draft"]');
    this.publishButton = page.locator('[data-testid="btn-publish"]');
    this.loadingState = page.locator('[data-testid="atom-editor-loading"]');

    // MCQ
    this.mcqStem = page.locator('[data-testid="mcq-stem"]');
    this.mcqOptions = page.locator('[data-testid="mcq-options"]');
    this.mcqAddOption = page.locator('[data-testid="mcq-add-option"]');
    this.mcqExplanation = page.locator('[data-testid="mcq-explanation"]');
  }

  async gotoCreate(): Promise<this> {
    await this.page.goto('/admin/content/atoms/new');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoEdit(atomId: string): Promise<this> {
    await this.page.goto(`/admin/content/atoms/${atomId}/edit`);
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectLoaded(): Promise<this> {
    await expect(this.container).toBeVisible();
    await expect(this.metaForm).toBeVisible();
    return this;
  }

  async selectAtomType(type: string): Promise<this> {
    await this.atomTypeSelect.selectOption(type);
    return this;
  }

  async setDifficulty(value: number): Promise<this> {
    await this.difficultySlider.fill(value.toString());
    return this;
  }

  async setLanguageCode(code: string): Promise<this> {
    await this.languageCodeInput.fill(code);
    return this;
  }

  async setTags(tags: string): Promise<this> {
    await this.tagsInput.fill(tags);
    return this;
  }

  // MCQ content helpers
  async fillMcqStem(text: string): Promise<this> {
    await this.mcqStem.fill(text);
    return this;
  }

  async fillMcqOption(index: number, text: string): Promise<this> {
    await this.page.locator(`[data-testid="mcq-option-${index}"]`).fill(text);
    return this;
  }

  async markMcqCorrect(index: number): Promise<this> {
    await this.page.locator(`[data-testid="mcq-correct-${index}"]`).check();
    return this;
  }

  async addMcqOption(): Promise<this> {
    await this.mcqAddOption.click();
    return this;
  }

  async fillMcqExplanation(text: string): Promise<this> {
    await this.mcqExplanation.fill(text);
    return this;
  }

  // Validation rule helpers
  async addValidationRule(): Promise<this> {
    await this.addRuleButton.click();
    return this;
  }

  async setRuleType(index: number, type: string): Promise<this> {
    await this.page.locator(`[data-testid="rule-type-${index}"]`).selectOption(type);
    return this;
  }

  async setRuleExpected(index: number, value: string): Promise<this> {
    await this.page.locator(`[data-testid="rule-expected-${index}"]`).fill(value);
    return this;
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

  async togglePreview(): Promise<this> {
    await this.previewToggle.click();
    return this;
  }

  async expectPreviewVisible(): Promise<this> {
    await expect(this.previewPanel).toBeVisible();
    return this;
  }
}
