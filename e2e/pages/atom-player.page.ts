import { type Locator, type Page, expect } from '@playwright/test';

export class AtomPlayerPage {
  readonly page: Page;
  readonly container: Locator;
  readonly loadingState: Locator;
  readonly errorState: Locator;
  readonly exitButton: Locator;
  readonly header: Locator;
  readonly closeButton: Locator;
  readonly content: Locator;
  readonly submitButton: Locator;
  readonly hintButton: Locator;
  readonly hintsSection: Locator;
  readonly feedback: Locator;
  readonly feedbackIcon: Locator;
  readonly feedbackExplanation: Locator;
  readonly feedbackExpected: Locator;
  readonly retryButton: Locator;
  readonly doneButton: Locator;
  readonly validationError: Locator;
  readonly controls: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="atom-player"]');
    this.loadingState = page.locator('[data-testid="player-loading"]');
    this.errorState = page.locator('[data-testid="player-error"]');
    this.exitButton = page.locator('[data-testid="player-exit-btn"]');
    this.header = page.locator('[data-testid="player-header"]');
    this.closeButton = page.locator('[data-testid="player-close-btn"]');
    this.content = page.locator('[data-testid="player-content"]');
    this.submitButton = page.locator('[data-testid="submit-btn"]');
    this.hintButton = page.locator('[data-testid="hint-btn"]');
    this.hintsSection = page.locator('[data-testid="player-hints"]');
    this.feedback = page.locator('[data-testid="player-feedback"]');
    this.feedbackIcon = page.locator('[data-testid="feedback-icon"]');
    this.feedbackExplanation = page.locator('[data-testid="feedback-explanation"]');
    this.feedbackExpected = page.locator('[data-testid="feedback-expected"]');
    this.retryButton = page.locator('[data-testid="feedback-retry-btn"]');
    this.doneButton = page.locator('[data-testid="feedback-done-btn"]');
    this.validationError = page.locator('[data-testid="validation-error"]');
    this.controls = page.locator('[data-testid="player-controls"]');
  }

  async goto(atomId: string): Promise<this> {
    await this.page.goto(`/learning/player/${atomId}`);
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectLoaded(): Promise<this> {
    await expect(this.container).toBeVisible();
    await expect(this.content).toBeVisible();
    return this;
  }

  async expectLoading(): Promise<this> {
    await expect(this.loadingState).toBeVisible();
    return this;
  }

  async expectError(): Promise<this> {
    await expect(this.errorState).toBeVisible();
    return this;
  }

  async submitAnswer(): Promise<this> {
    await this.submitButton.click();
    return this;
  }

  async requestHint(): Promise<this> {
    await this.hintButton.click();
    return this;
  }

  async expectFeedbackVisible(): Promise<this> {
    await expect(this.feedback).toBeVisible();
    return this;
  }

  async expectCorrectFeedback(): Promise<this> {
    await expect(this.feedback).toBeVisible();
    await expect(this.feedbackIcon).toBeVisible();
    return this;
  }

  async clickRetry(): Promise<this> {
    await this.retryButton.click();
    return this;
  }

  async clickDone(): Promise<void> {
    await this.doneButton.click();
  }

  async close(): Promise<void> {
    await this.closeButton.click();
  }
}
