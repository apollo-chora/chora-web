import { type Locator, type Page, expect } from '@playwright/test';

export class DailyDosePage {
  readonly page: Page;
  readonly container: Locator;
  readonly loadingState: Locator;
  readonly errorState: Locator;
  readonly exitButton: Locator;
  readonly completeScreen: Locator;
  readonly doneButton: Locator;
  readonly header: Locator;
  readonly closeButton: Locator;
  readonly counter: Locator;
  readonly progressBar: Locator;
  readonly stack: Locator;
  readonly currentCard: Locator;
  readonly cardTitle: Locator;
  readonly cardTopic: Locator;
  readonly cardTime: Locator;
  readonly prevButton: Locator;
  readonly startButton: Locator;
  readonly nextButton: Locator;
  readonly stats: Locator;
  readonly statXp: Locator;
  readonly statCompleted: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="daily-dose"]');
    this.loadingState = page.locator('[data-testid="dose-loading"]');
    this.errorState = page.locator('[data-testid="dose-error"]');
    this.exitButton = page.locator('[data-testid="dose-exit-btn"]');
    this.completeScreen = page.locator('[data-testid="dose-complete"]');
    this.doneButton = page.locator('[data-testid="dose-done-btn"]');
    this.header = page.locator('[data-testid="dose-header"]');
    this.closeButton = page.locator('[data-testid="dose-close-btn"]');
    this.counter = page.locator('[data-testid="dose-counter"]');
    this.progressBar = page.locator('[data-testid="dose-progress"]');
    this.stack = page.locator('[data-testid="dose-stack"]');
    this.currentCard = page.locator('[data-testid="dose-current-card"]');
    this.cardTitle = page.locator('[data-testid="card-title"]');
    this.cardTopic = page.locator('[data-testid="card-topic"]');
    this.cardTime = page.locator('[data-testid="card-time"]');
    this.prevButton = page.locator('[data-testid="dose-prev-btn"]');
    this.startButton = page.locator('[data-testid="dose-start-btn"]');
    this.nextButton = page.locator('[data-testid="dose-next-btn"]');
    this.stats = page.locator('[data-testid="dose-stats"]');
    this.statXp = page.locator('[data-testid="stat-xp"]');
    this.statCompleted = page.locator('[data-testid="stat-completed"]');
  }

  async goto(): Promise<this> {
    await this.page.goto('/learning/daily-dose');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectLoaded(): Promise<this> {
    await expect(this.container).toBeVisible();
    await expect(this.stack).toBeVisible();
    return this;
  }

  async expectComplete(): Promise<this> {
    await expect(this.completeScreen).toBeVisible();
    return this;
  }

  async expectError(): Promise<this> {
    await expect(this.errorState).toBeVisible();
    return this;
  }

  async navigateNext(): Promise<this> {
    await this.nextButton.click();
    return this;
  }

  async navigatePrev(): Promise<this> {
    await this.prevButton.click();
    return this;
  }

  async startAtom(): Promise<void> {
    await this.startButton.click();
  }

  async clickDone(): Promise<void> {
    await this.doneButton.click();
  }
}
