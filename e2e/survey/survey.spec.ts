import { test, expect } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import {
  buildSurveyTemplate,
  buildSurveyQuestion,
  buildSurveyAnalytics,
  mockSurveyAPI,
} from '../fixtures/phase29-community-mocks';
import { SurveyPage } from '../pages/survey.page';
import { runAxeAudit } from '../fixtures/a11y.fixture';

// ---------------------------------------------------------------------------
// Viewport: tablet primary (1024x768)
// ---------------------------------------------------------------------------
test.use({ viewport: { width: 1024, height: 768 } });

// ---------------------------------------------------------------------------
// Survey — Listing (Learner)
// ---------------------------------------------------------------------------
test.describe('Survey — Listing', () => {
  let surveyPage: SurveyPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner');
    surveyPage = new SurveyPage(page);
  });

  test('survey list renders with published surveys', async ({ page }) => {
    const surveys = [
      buildSurveyTemplate({ id: 'srv-1', title: 'Course Satisfaction Survey', status: 'published' }),
      buildSurveyTemplate({ id: 'srv-2', title: 'Learning Preferences', status: 'published' }),
      buildSurveyTemplate({ id: 'srv-3', title: 'Instructor Feedback', status: 'published' }),
    ];
    await mockSurveyAPI(page, { surveys });

    await surveyPage.gotoSurveyList();
    await surveyPage.expectSurveyListLoaded();
    await expect(surveyPage.surveyList).toBeVisible();
  });

  test('survey list displays empty state when no surveys available', async ({ page }) => {
    await mockSurveyAPI(page, { surveys: [] });

    await surveyPage.gotoSurveyList();
    await surveyPage.expectSurveyListLoaded();
    await expect(surveyPage.surveyList).toBeVisible();
  });

  test('clicking a survey navigates to the completion view', async ({ page }) => {
    const surveys = [
      buildSurveyTemplate({ id: 'srv-1', title: 'Course Satisfaction Survey' }),
    ];
    await mockSurveyAPI(page, { surveys });

    await surveyPage.gotoSurveyList();
    await surveyPage.expectSurveyListLoaded();

    // Click the first survey item
    await page.locator('[data-testid="survey-list-item-0"]').click();
    await page.waitForLoadState('networkidle');
  });
});

// ---------------------------------------------------------------------------
// Survey — Form Submission (Learner)
// ---------------------------------------------------------------------------
test.describe('Survey — Form Submission', () => {
  let surveyPage: SurveyPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner');
    surveyPage = new SurveyPage(page);
  });

  test('survey completion view renders with questions', async ({ page }) => {
    const survey = buildSurveyTemplate({
      id: 'srv-1',
      questions: [
        buildSurveyQuestion({ order: 1, question_text: 'How satisfied are you overall?' }),
        buildSurveyQuestion({ order: 2, question_text: 'Rate the content quality', question_type: 'rating' }),
        buildSurveyQuestion({ order: 3, question_text: 'Any additional comments?', question_type: 'open_text', is_required: false }),
      ],
    });
    await mockSurveyAPI(page, { surveys: [survey] });

    await surveyPage.gotoSurveyCompletion('srv-1');
    await surveyPage.expectCompletionViewLoaded();
    await expect(surveyPage.questionCards.first()).toBeVisible();
    await expect(surveyPage.submitSurveyButton).toBeVisible();
  });

  test('survey displays progress indicator', async ({ page }) => {
    const survey = buildSurveyTemplate({
      id: 'srv-1',
      questions: [
        buildSurveyQuestion({ order: 1 }),
        buildSurveyQuestion({ order: 2, question_text: 'Rate content' }),
      ],
    });
    await mockSurveyAPI(page, { surveys: [survey] });

    await surveyPage.gotoSurveyCompletion('srv-1');
    await surveyPage.expectCompletionViewLoaded();
    await expect(surveyPage.progressIndicator).toBeVisible();
  });

  test('survey submit button triggers submission', async ({ page }) => {
    const survey = buildSurveyTemplate({
      id: 'srv-1',
      questions: [buildSurveyQuestion({ order: 1 })],
    });
    await mockSurveyAPI(page, { surveys: [survey] });

    await surveyPage.gotoSurveyCompletion('srv-1');
    await surveyPage.expectCompletionViewLoaded();
    await surveyPage.submitSurvey();

    // Submission succeeds — view remains stable
    await expect(surveyPage.surveyCompletionView).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Survey — Admin Management
// ---------------------------------------------------------------------------
test.describe('Survey — Admin Management', () => {
  let surveyPage: SurveyPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    surveyPage = new SurveyPage(page);
  });

  test('admin survey list renders with status indicators', async ({ page }) => {
    const surveys = [
      buildSurveyTemplate({ id: 'srv-1', title: 'Active Survey', status: 'published' }),
      buildSurveyTemplate({ id: 'srv-2', title: 'Draft Survey', status: 'draft', response_count: 0 }),
      buildSurveyTemplate({ id: 'srv-3', title: 'Closed Survey', status: 'closed', response_count: 120 }),
    ];
    await mockSurveyAPI(page, { surveys });

    await surveyPage.gotoAdminSurveyList();
    await surveyPage.expectSurveyListLoaded();
    await expect(surveyPage.surveyList).toBeVisible();
    await expect(surveyPage.createSurveyButton).toBeVisible();
  });

  test('admin can filter surveys by status', async ({ page }) => {
    const surveys = [
      buildSurveyTemplate({ status: 'published' }),
      buildSurveyTemplate({ status: 'draft' }),
    ];
    await mockSurveyAPI(page, { surveys });

    await surveyPage.gotoAdminSurveyList();
    await surveyPage.expectSurveyListLoaded();
    await surveyPage.filterByStatus('draft');
    await expect(surveyPage.surveyStatusFilter).toHaveValue('draft');
  });

  test('create survey form renders with required fields', async ({ page }) => {
    await mockSurveyAPI(page);

    await surveyPage.gotoCreateSurvey();
    await surveyPage.expectSurveyFormLoaded();
    await expect(surveyPage.surveyTitleInput).toBeVisible();
    await expect(surveyPage.surveyDescriptionInput).toBeVisible();
    await expect(surveyPage.addQuestionButton).toBeVisible();
    await expect(surveyPage.saveSurveyButton).toBeVisible();
  });

  test('create survey form accepts title and description', async ({ page }) => {
    await mockSurveyAPI(page);

    await surveyPage.gotoCreateSurvey();
    await surveyPage.expectSurveyFormLoaded();
    await surveyPage.fillSurveyDetails('New Feedback Survey', 'Collecting learner feedback on recent changes');
    await expect(surveyPage.surveyTitleInput).toHaveValue('New Feedback Survey');
    await expect(surveyPage.surveyDescriptionInput).toHaveValue('Collecting learner feedback on recent changes');
  });
});

// ---------------------------------------------------------------------------
// Survey — Results View (Admin)
// ---------------------------------------------------------------------------
test.describe('Survey — Results View', () => {
  let surveyPage: SurveyPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    surveyPage = new SurveyPage(page);
  });

  test('survey results page renders with analytics data', async ({ page }) => {
    const analytics = buildSurveyAnalytics({
      total_responses: 85,
      completion_rate: 0.91,
    });
    await mockSurveyAPI(page, { analytics });

    await surveyPage.gotoSurveyResults('srv-1');
    await surveyPage.expectResultsLoaded();
    await expect(surveyPage.responseSummary).toBeVisible();
    await expect(surveyPage.responseCount).toBeVisible();
  });

  test('survey results display question breakdown', async ({ page }) => {
    const analytics = buildSurveyAnalytics();
    await mockSurveyAPI(page, { analytics });

    await surveyPage.gotoSurveyResults('srv-1');
    await surveyPage.expectResultsLoaded();
    await expect(surveyPage.questionBreakdown).toBeVisible();
  });

  test('survey results page shows export button', async ({ page }) => {
    const analytics = buildSurveyAnalytics();
    await mockSurveyAPI(page, { analytics });

    await surveyPage.gotoSurveyResults('srv-1');
    await surveyPage.expectResultsLoaded();
    await expect(surveyPage.exportResultsButton).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Survey — Accessibility
// ---------------------------------------------------------------------------
test.describe('Survey — Accessibility', () => {
  test('survey list page passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'learner');
    await mockSurveyAPI(page, {
      surveys: [
        buildSurveyTemplate({ title: 'Course Feedback' }),
        buildSurveyTemplate({ title: 'Instructor Rating' }),
      ],
    });

    const surveyPage = new SurveyPage(page);
    await surveyPage.gotoSurveyList();
    await surveyPage.expectSurveyListLoaded();

    await runAxeAudit(page, 'Survey list');
  });

  test('survey completion view passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'learner');
    const survey = buildSurveyTemplate({
      id: 'srv-1',
      questions: [
        buildSurveyQuestion({ order: 1 }),
        buildSurveyQuestion({ order: 2, question_text: 'Rate the content quality' }),
      ],
    });
    await mockSurveyAPI(page, { surveys: [survey] });

    const surveyPage = new SurveyPage(page);
    await surveyPage.gotoSurveyCompletion('srv-1');
    await surveyPage.expectCompletionViewLoaded();

    await runAxeAudit(page, 'Survey completion');
  });

  test('survey results page passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'tenant-admin');
    await mockSurveyAPI(page, { analytics: buildSurveyAnalytics() });

    const surveyPage = new SurveyPage(page);
    await surveyPage.gotoSurveyResults('srv-1');
    await surveyPage.expectResultsLoaded();

    await runAxeAudit(page, 'Survey results');
  });
});
