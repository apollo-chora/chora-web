import { type Locator, type Page, expect } from '@playwright/test';

export class SurveyPage {
  readonly page: Page;

  // Survey list
  readonly surveyList: Locator;
  readonly surveyListItems: Locator;
  readonly createSurveyButton: Locator;
  readonly surveyStatusFilter: Locator;

  // Survey form
  readonly surveyForm: Locator;
  readonly surveyTitleInput: Locator;
  readonly surveyDescriptionInput: Locator;
  readonly addQuestionButton: Locator;
  readonly questionList: Locator;
  readonly questionTypeSelect: Locator;
  readonly questionTextInput: Locator;
  readonly saveSurveyButton: Locator;
  readonly publishSurveyButton: Locator;

  // Survey completion (learner view)
  readonly surveyCompletionView: Locator;
  readonly questionCards: Locator;
  readonly answerInputs: Locator;
  readonly submitSurveyButton: Locator;
  readonly completionConfirmation: Locator;
  readonly progressIndicator: Locator;

  // Survey results (admin view)
  readonly surveyResults: Locator;
  readonly resultsChart: Locator;
  readonly responseSummary: Locator;
  readonly responseCount: Locator;
  readonly exportResultsButton: Locator;
  readonly questionBreakdown: Locator;

  constructor(page: Page) {
    this.page = page;

    // Survey list
    this.surveyList = page.locator('[data-testid="survey-list"]');
    this.surveyListItems = page.locator('[data-testid^="survey-list-item"]');
    this.createSurveyButton = page.locator('[data-testid="create-survey-button"]');
    this.surveyStatusFilter = page.locator('[data-testid="survey-status-filter"]');

    // Survey form
    this.surveyForm = page.locator('[data-testid="survey-form"]');
    this.surveyTitleInput = page.locator('[data-testid="survey-title-input"]');
    this.surveyDescriptionInput = page.locator('[data-testid="survey-description-input"]');
    this.addQuestionButton = page.locator('[data-testid="add-question-button"]');
    this.questionList = page.locator('[data-testid="survey-question-list"]');
    this.questionTypeSelect = page.locator('[data-testid="question-type-select"]');
    this.questionTextInput = page.locator('[data-testid="question-text-input"]');
    this.saveSurveyButton = page.locator('[data-testid="save-survey-button"]');
    this.publishSurveyButton = page.locator('[data-testid="publish-survey-button"]');

    // Survey completion
    this.surveyCompletionView = page.locator('[data-testid="survey-completion-view"]');
    this.questionCards = page.locator('[data-testid^="question-card"]');
    this.answerInputs = page.locator('[data-testid^="answer-input"]');
    this.submitSurveyButton = page.locator('[data-testid="submit-survey-button"]');
    this.completionConfirmation = page.locator('[data-testid="survey-completion-confirmation"]');
    this.progressIndicator = page.locator('[data-testid="survey-progress-indicator"]');

    // Survey results
    this.surveyResults = page.locator('[data-testid="survey-results"]');
    this.resultsChart = page.locator('[data-testid="survey-results-chart"]');
    this.responseSummary = page.locator('[data-testid="survey-response-summary"]');
    this.responseCount = page.locator('[data-testid="survey-response-count"]');
    this.exportResultsButton = page.locator('[data-testid="export-results-button"]');
    this.questionBreakdown = page.locator('[data-testid="survey-question-breakdown"]');
  }

  async gotoSurveyList(): Promise<this> {
    await this.page.goto('/surveys');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoCreateSurvey(): Promise<this> {
    await this.page.goto('/admin/surveys/create');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoSurveyCompletion(surveyId: string): Promise<this> {
    await this.page.goto(`/surveys/${surveyId}`);
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoSurveyResults(surveyId: string): Promise<this> {
    await this.page.goto(`/admin/surveys/${surveyId}/results`);
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoAdminSurveyList(): Promise<this> {
    await this.page.goto('/admin/surveys');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectSurveyListLoaded(): Promise<this> {
    await expect(this.surveyList).toBeVisible();
    return this;
  }

  async expectSurveyFormLoaded(): Promise<this> {
    await expect(this.surveyForm).toBeVisible();
    return this;
  }

  async expectCompletionViewLoaded(): Promise<this> {
    await expect(this.surveyCompletionView).toBeVisible();
    return this;
  }

  async expectResultsLoaded(): Promise<this> {
    await expect(this.surveyResults).toBeVisible();
    return this;
  }

  async fillSurveyDetails(title: string, description: string): Promise<this> {
    await this.surveyTitleInput.fill(title);
    await this.surveyDescriptionInput.fill(description);
    return this;
  }

  async addQuestion(): Promise<this> {
    await this.addQuestionButton.click();
    return this;
  }

  async saveSurvey(): Promise<this> {
    await this.saveSurveyButton.click();
    return this;
  }

  async publishSurvey(): Promise<this> {
    await this.publishSurveyButton.click();
    return this;
  }

  async submitSurvey(): Promise<this> {
    await this.submitSurveyButton.click();
    return this;
  }

  async filterByStatus(status: string): Promise<this> {
    await this.surveyStatusFilter.selectOption(status);
    return this;
  }

  async getSurveyItemCount(): Promise<number> {
    return this.surveyListItems.count();
  }

  async getQuestionCount(): Promise<number> {
    return this.questionCards.count();
  }
}
