import { type Locator, type Page, expect } from '@playwright/test';

export class SupportPage {
  readonly page: Page;

  // Ticket list
  readonly ticketList: Locator;
  readonly ticketTable: Locator;
  readonly ticketStatusFilter: Locator;
  readonly ticketCategoryFilter: Locator;
  readonly ticketSearchInput: Locator;

  // Ticket detail
  readonly ticketDetail: Locator;
  readonly ticketSubject: Locator;
  readonly ticketDescription: Locator;
  readonly ticketStatus: Locator;
  readonly ticketReplyInput: Locator;
  readonly ticketReplyBtn: Locator;
  readonly ticketTimeline: Locator;

  // Ticket create
  readonly ticketCreateForm: Locator;
  readonly createSubjectInput: Locator;
  readonly createCategorySelect: Locator;
  readonly createDescriptionInput: Locator;
  readonly createPrioritySelect: Locator;
  readonly createSubmitBtn: Locator;

  // FAQ
  readonly faqPanel: Locator;
  readonly faqSearchInput: Locator;
  readonly faqCategoryList: Locator;
  readonly faqArticleList: Locator;
  readonly faqArticleDetail: Locator;

  // Satisfaction
  readonly satisfactionSurvey: Locator;
  readonly satisfactionRating: Locator;
  readonly satisfactionCommentInput: Locator;
  readonly satisfactionSubmitBtn: Locator;

  constructor(page: Page) {
    this.page = page;

    this.ticketList = page.locator('[data-testid="ticket-list"]');
    this.ticketTable = page.locator('[data-testid="ticket-table"]');
    this.ticketStatusFilter = page.locator('[data-testid="ticket-status-filter"]');
    this.ticketCategoryFilter = page.locator('[data-testid="ticket-category-filter"]');
    this.ticketSearchInput = page.locator('[data-testid="ticket-search-input"]');

    this.ticketDetail = page.locator('[data-testid="ticket-detail"]');
    this.ticketSubject = page.locator('[data-testid="ticket-subject"]');
    this.ticketDescription = page.locator('[data-testid="ticket-description"]');
    this.ticketStatus = page.locator('[data-testid="ticket-status"]');
    this.ticketReplyInput = page.locator('[data-testid="ticket-reply-input"]');
    this.ticketReplyBtn = page.locator('[data-testid="btn-ticket-reply"]');
    this.ticketTimeline = page.locator('[data-testid="ticket-timeline"]');

    this.ticketCreateForm = page.locator('[data-testid="ticket-create-form"]');
    this.createSubjectInput = page.locator('[data-testid="create-subject-input"]');
    this.createCategorySelect = page.locator('[data-testid="create-category-select"]');
    this.createDescriptionInput = page.locator('[data-testid="create-description-input"]');
    this.createPrioritySelect = page.locator('[data-testid="create-priority-select"]');
    this.createSubmitBtn = page.locator('[data-testid="btn-submit-ticket"]');

    this.faqPanel = page.locator('[data-testid="faq-panel"]');
    this.faqSearchInput = page.locator('[data-testid="faq-search-input"]');
    this.faqCategoryList = page.locator('[data-testid="faq-category-list"]');
    this.faqArticleList = page.locator('[data-testid="faq-article-list"]');
    this.faqArticleDetail = page.locator('[data-testid="faq-article-detail"]');

    this.satisfactionSurvey = page.locator('[data-testid="satisfaction-survey"]');
    this.satisfactionRating = page.locator('[data-testid="satisfaction-rating"]');
    this.satisfactionCommentInput = page.locator('[data-testid="satisfaction-comment-input"]');
    this.satisfactionSubmitBtn = page.locator('[data-testid="btn-submit-satisfaction"]');
  }

  async gotoTickets(): Promise<this> {
    await this.page.goto('/support/tickets');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoTicketDetail(ticketId: string): Promise<this> {
    await this.page.goto(`/support/tickets/${ticketId}`);
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoCreateTicket(): Promise<this> {
    await this.page.goto('/support/tickets/new');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoFaq(): Promise<this> {
    await this.page.goto('/support/faq');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoSatisfaction(ticketId: string): Promise<this> {
    await this.page.goto(`/support/tickets/${ticketId}/satisfaction`);
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectTicketListLoaded(): Promise<this> {
    await expect(this.ticketList).toBeVisible();
    return this;
  }

  async expectTicketDetailLoaded(): Promise<this> {
    await expect(this.ticketDetail).toBeVisible();
    return this;
  }

  async expectCreateFormLoaded(): Promise<this> {
    await expect(this.ticketCreateForm).toBeVisible();
    return this;
  }

  async expectFaqLoaded(): Promise<this> {
    await expect(this.faqPanel).toBeVisible();
    return this;
  }

  async expectSatisfactionLoaded(): Promise<this> {
    await expect(this.satisfactionSurvey).toBeVisible();
    return this;
  }

  async filterTicketsByStatus(status: string): Promise<this> {
    await this.ticketStatusFilter.selectOption(status);
    return this;
  }

  async filterTicketsByCategory(category: string): Promise<this> {
    await this.ticketCategoryFilter.selectOption(category);
    return this;
  }

  async searchTickets(query: string): Promise<this> {
    await this.ticketSearchInput.fill(query);
    return this;
  }

  async fillCreateForm(subject: string, category: string, description: string): Promise<this> {
    await this.createSubjectInput.fill(subject);
    await this.createCategorySelect.selectOption(category);
    await this.createDescriptionInput.fill(description);
    return this;
  }

  async submitCreateForm(): Promise<this> {
    await this.createSubmitBtn.click();
    return this;
  }

  async replyToTicket(message: string): Promise<this> {
    await this.ticketReplyInput.fill(message);
    await this.ticketReplyBtn.click();
    return this;
  }

  async searchFaq(query: string): Promise<this> {
    await this.faqSearchInput.fill(query);
    return this;
  }

  async getTicketRowCount(): Promise<number> {
    return this.ticketTable.locator('[data-testid^="ticket-row"]').count();
  }

  async getFaqArticleCount(): Promise<number> {
    return this.faqArticleList.locator('[data-testid^="faq-article-row"]').count();
  }

  async getTimelineEntryCount(): Promise<number> {
    return this.ticketTimeline.locator('[data-testid^="timeline-entry"]').count();
  }
}
