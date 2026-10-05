import { test, expect } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import {
  buildTicket,
  buildTicketReply,
  buildFaqArticle,
  buildSatisfactionResponse,
} from '../fixtures/phase29-builders';
import {
  mockSupportAPI,
  mockSupportTicketReplies,
  mockSupportSatisfaction,
} from '../fixtures/phase29-bff-mocks';
import { SupportPage } from '../pages/support.page';
import { runAxeAudit } from '../fixtures/a11y.fixture';

// ---------------------------------------------------------------------------
// Viewport: desktop primary (1440x900)
// ---------------------------------------------------------------------------
test.use({ viewport: { width: 1440, height: 900 } });

// ---------------------------------------------------------------------------
// Support — Ticket List
// ---------------------------------------------------------------------------
test.describe('Support — Ticket List', () => {
  let supportPage: SupportPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner');
    supportPage = new SupportPage(page);
  });

  test('displays ticket list with mock data', async ({ page }) => {
    const tickets = [
      buildTicket({ id: 'ticket-1', subject: 'Cannot access assessment', status: 'open' }),
      buildTicket({ id: 'ticket-2', subject: 'Login issue', status: 'resolved', priority: 'high' }),
      buildTicket({ id: 'ticket-3', subject: 'Missing content', status: 'in_progress' }),
    ];
    await mockSupportAPI(page, tickets, []);

    await supportPage.gotoTickets();
    await supportPage.expectTicketListLoaded();
    await expect(supportPage.ticketTable).toBeVisible();
  });

  test('filters tickets by status', async ({ page }) => {
    const tickets = [
      buildTicket({ status: 'open' }),
      buildTicket({ status: 'resolved' }),
    ];
    await mockSupportAPI(page, tickets, []);

    await supportPage.gotoTickets();
    await supportPage.expectTicketListLoaded();
    await supportPage.filterTicketsByStatus('open');
    await expect(supportPage.ticketStatusFilter).toHaveValue('open');
  });

  test('search input filters tickets', async ({ page }) => {
    const tickets = [
      buildTicket({ subject: 'Cannot access assessment' }),
      buildTicket({ subject: 'Login issue' }),
    ];
    await mockSupportAPI(page, tickets, []);

    await supportPage.gotoTickets();
    await supportPage.expectTicketListLoaded();
    await supportPage.searchTickets('assessment');
    await expect(supportPage.ticketSearchInput).toHaveValue('assessment');
  });
});

// ---------------------------------------------------------------------------
// Support — Ticket Creation
// ---------------------------------------------------------------------------
test.describe('Support — Ticket Creation', () => {
  let supportPage: SupportPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner');
    supportPage = new SupportPage(page);
  });

  test('create ticket form renders with required fields', async ({ page }) => {
    await mockSupportAPI(page, [], []);

    await supportPage.gotoCreateTicket();
    await supportPage.expectCreateFormLoaded();
    await expect(supportPage.createSubjectInput).toBeVisible();
    await expect(supportPage.createCategorySelect).toBeVisible();
    await expect(supportPage.createDescriptionInput).toBeVisible();
    await expect(supportPage.createSubmitBtn).toBeVisible();
  });

  test('fills and submits ticket creation form', async ({ page }) => {
    await mockSupportAPI(page, [], []);

    await supportPage.gotoCreateTicket();
    await supportPage.expectCreateFormLoaded();

    await supportPage.fillCreateForm(
      'Cannot load DailyDose',
      'technical',
      'The DailyDose page shows a blank screen after login.',
    );
    await expect(supportPage.createSubjectInput).toHaveValue('Cannot load DailyDose');
    await expect(supportPage.createDescriptionInput).toHaveValue(
      'The DailyDose page shows a blank screen after login.',
    );
  });
});

// ---------------------------------------------------------------------------
// Support — Ticket Detail
// ---------------------------------------------------------------------------
test.describe('Support — Ticket Detail', () => {
  let supportPage: SupportPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner');
    supportPage = new SupportPage(page);
  });

  test('ticket detail displays subject and status', async ({ page }) => {
    const ticket = buildTicket({
      id: 'ticket-detail-1',
      subject: 'Assessment error',
      status: 'open',
    });
    await mockSupportAPI(page, [ticket], []);
    await mockSupportTicketReplies(page, []);

    await supportPage.gotoTicketDetail('ticket-detail-1');
    await supportPage.expectTicketDetailLoaded();
    await expect(supportPage.ticketDetail).toBeVisible();
  });

  test('ticket detail shows reply timeline', async ({ page }) => {
    const ticket = buildTicket({ id: 'ticket-timeline-1' });
    const replies = [
      buildTicketReply({ ticket_id: 'ticket-timeline-1', content: 'We are looking into it.' }),
      buildTicketReply({ ticket_id: 'ticket-timeline-1', content: 'Issue has been resolved.', author_name: 'Support Agent' }),
    ];
    await mockSupportAPI(page, [ticket], []);
    await mockSupportTicketReplies(page, replies);

    await supportPage.gotoTicketDetail('ticket-timeline-1');
    await supportPage.expectTicketDetailLoaded();
    await expect(supportPage.ticketTimeline).toBeVisible();
  });

  test('reply input is visible on open ticket', async ({ page }) => {
    const ticket = buildTicket({ id: 'ticket-reply-1', status: 'open' });
    await mockSupportAPI(page, [ticket], []);
    await mockSupportTicketReplies(page, []);

    await supportPage.gotoTicketDetail('ticket-reply-1');
    await supportPage.expectTicketDetailLoaded();
    await expect(supportPage.ticketReplyInput).toBeVisible();
    await expect(supportPage.ticketReplyBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Support — FAQ
// ---------------------------------------------------------------------------
test.describe('Support — FAQ', () => {
  let supportPage: SupportPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner');
    supportPage = new SupportPage(page);
  });

  test('FAQ panel renders with articles', async ({ page }) => {
    const articles = [
      buildFaqArticle({ id: 'faq-1', title: 'How to reset my password', category: 'account' }),
      buildFaqArticle({ id: 'faq-2', title: 'How to use DailyDose', category: 'learning' }),
      buildFaqArticle({ id: 'faq-3', title: 'Streak rules explained', category: 'engagement' }),
    ];
    await mockSupportAPI(page, [], articles);

    await supportPage.gotoFaq();
    await supportPage.expectFaqLoaded();
    await expect(supportPage.faqArticleList).toBeVisible();
  });

  test('FAQ search input accepts queries', async ({ page }) => {
    const articles = [buildFaqArticle({ title: 'Password reset' })];
    await mockSupportAPI(page, [], articles);

    await supportPage.gotoFaq();
    await supportPage.expectFaqLoaded();
    await supportPage.searchFaq('password');
    await expect(supportPage.faqSearchInput).toHaveValue('password');
  });
});

// ---------------------------------------------------------------------------
// Support — Satisfaction Survey
// ---------------------------------------------------------------------------
test.describe('Support — Satisfaction Survey', () => {
  test('satisfaction survey renders for resolved ticket', async ({ page }) => {
    await mockAuthSession(page, 'learner');
    const ticket = buildTicket({ id: 'ticket-sat-1', status: 'resolved' });
    await mockSupportAPI(page, [ticket], []);
    await mockSupportSatisfaction(page, null);

    const supportPage = new SupportPage(page);
    await supportPage.gotoSatisfaction('ticket-sat-1');
    await supportPage.expectSatisfactionLoaded();
    await expect(supportPage.satisfactionRating).toBeVisible();
    await expect(supportPage.satisfactionSubmitBtn).toBeVisible();
  });

  test('existing satisfaction response is displayed', async ({ page }) => {
    await mockAuthSession(page, 'learner');
    const ticket = buildTicket({ id: 'ticket-sat-2', status: 'resolved' });
    const satResponse = buildSatisfactionResponse({ ticket_id: 'ticket-sat-2', rating: 5 });
    await mockSupportAPI(page, [ticket], []);
    await mockSupportSatisfaction(page, satResponse);

    const supportPage = new SupportPage(page);
    await supportPage.gotoSatisfaction('ticket-sat-2');
    await supportPage.expectSatisfactionLoaded();
    await expect(supportPage.satisfactionSurvey).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Support — Accessibility
// ---------------------------------------------------------------------------
test.describe('Support — Accessibility', () => {
  test('ticket list page passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'learner');
    const tickets = [buildTicket(), buildTicket({ subject: 'Login issue' })];
    await mockSupportAPI(page, tickets, []);

    const supportPage = new SupportPage(page);
    await supportPage.gotoTickets();
    await supportPage.expectTicketListLoaded();

    await runAxeAudit(page, 'Support ticket list');
  });

  test('FAQ page passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'learner');
    const articles = [buildFaqArticle(), buildFaqArticle({ title: 'DailyDose FAQ' })];
    await mockSupportAPI(page, [], articles);

    const supportPage = new SupportPage(page);
    await supportPage.gotoFaq();
    await supportPage.expectFaqLoaded();

    await runAxeAudit(page, 'Support FAQ');
  });
});
