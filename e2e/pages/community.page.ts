import { type Locator, type Page, expect } from '@playwright/test';

export class CommunityPage {
  readonly page: Page;

  // Atom bank
  readonly atomBank: Locator;
  readonly atomBankList: Locator;
  readonly atomSubmissionForm: Locator;
  readonly submitAtomButton: Locator;
  readonly atomTitleInput: Locator;
  readonly atomContentInput: Locator;
  readonly atomTagInput: Locator;

  // Peer review queue
  readonly peerReviewQueue: Locator;
  readonly reviewItemList: Locator;
  readonly approveButton: Locator;
  readonly rejectButton: Locator;
  readonly reviewFeedbackInput: Locator;
  readonly submitReviewButton: Locator;

  // Curation voting
  readonly curationPanel: Locator;
  readonly curationItemList: Locator;
  readonly upvoteButton: Locator;
  readonly downvoteButton: Locator;
  readonly voteCount: Locator;

  // Contributor profile
  readonly contributorProfile: Locator;
  readonly contributorDisplayName: Locator;
  readonly contributorReputation: Locator;
  readonly contributorSubmissionCount: Locator;
  readonly contributorReviewCount: Locator;
  readonly contributorBadgeList: Locator;

  constructor(page: Page) {
    this.page = page;

    // Atom bank
    this.atomBank = page.locator('[data-testid="atom-bank"]');
    this.atomBankList = page.locator('[data-testid="atom-bank-list"]');
    this.atomSubmissionForm = page.locator('[data-testid="atom-submission-form"]');
    this.submitAtomButton = page.locator('[data-testid="submit-atom-button"]');
    this.atomTitleInput = page.locator('[data-testid="atom-title-input"]');
    this.atomContentInput = page.locator('[data-testid="atom-content-input"]');
    this.atomTagInput = page.locator('[data-testid="atom-tag-input"]');

    // Peer review queue
    this.peerReviewQueue = page.locator('[data-testid="peer-review-queue"]');
    this.reviewItemList = page.locator('[data-testid="review-item-list"]');
    this.approveButton = page.locator('[data-testid="review-approve-button"]');
    this.rejectButton = page.locator('[data-testid="review-reject-button"]');
    this.reviewFeedbackInput = page.locator('[data-testid="review-feedback-input"]');
    this.submitReviewButton = page.locator('[data-testid="submit-review-button"]');

    // Curation voting
    this.curationPanel = page.locator('[data-testid="curation-panel"]');
    this.curationItemList = page.locator('[data-testid="curation-item-list"]');
    this.upvoteButton = page.locator('[data-testid="curation-upvote-button"]');
    this.downvoteButton = page.locator('[data-testid="curation-downvote-button"]');
    this.voteCount = page.locator('[data-testid="curation-vote-count"]');

    // Contributor profile
    this.contributorProfile = page.locator('[data-testid="contributor-profile"]');
    this.contributorDisplayName = page.locator('[data-testid="contributor-display-name"]');
    this.contributorReputation = page.locator('[data-testid="contributor-reputation"]');
    this.contributorSubmissionCount = page.locator('[data-testid="contributor-submission-count"]');
    this.contributorReviewCount = page.locator('[data-testid="contributor-review-count"]');
    this.contributorBadgeList = page.locator('[data-testid="contributor-badge-list"]');
  }

  async gotoAtomBank(): Promise<this> {
    await this.page.goto('/community/atom-bank');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoPeerReview(): Promise<this> {
    await this.page.goto('/community/peer-review');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoCuration(): Promise<this> {
    await this.page.goto('/community/curation');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoContributorProfile(gcid: string = 'gcid-learner-001'): Promise<this> {
    await this.page.goto(`/community/contributors/${gcid}`);
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoSubmitAtom(): Promise<this> {
    await this.page.goto('/community/atom-bank/submit');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectAtomBankLoaded(): Promise<this> {
    await expect(this.atomBank).toBeVisible();
    return this;
  }

  async expectPeerReviewLoaded(): Promise<this> {
    await expect(this.peerReviewQueue).toBeVisible();
    return this;
  }

  async expectCurationLoaded(): Promise<this> {
    await expect(this.curationPanel).toBeVisible();
    return this;
  }

  async expectContributorProfileLoaded(): Promise<this> {
    await expect(this.contributorProfile).toBeVisible();
    return this;
  }

  async fillAtomSubmission(title: string, content: string, tags: string): Promise<this> {
    await this.atomTitleInput.fill(title);
    await this.atomContentInput.fill(content);
    await this.atomTagInput.fill(tags);
    return this;
  }

  async submitAtom(): Promise<this> {
    await this.submitAtomButton.click();
    return this;
  }

  async fillReviewFeedback(feedback: string): Promise<this> {
    await this.reviewFeedbackInput.fill(feedback);
    return this;
  }

  async approveReview(): Promise<this> {
    await this.approveButton.first().click();
    return this;
  }

  async rejectReview(): Promise<this> {
    await this.rejectButton.first().click();
    return this;
  }

  async upvoteCurationItem(): Promise<this> {
    await this.upvoteButton.first().click();
    return this;
  }

  async downvoteCurationItem(): Promise<this> {
    await this.downvoteButton.first().click();
    return this;
  }

  async getAtomBankItemCount(): Promise<number> {
    return this.atomBankList.locator('[data-testid^="atom-bank-item"]').count();
  }

  async getReviewItemCount(): Promise<number> {
    return this.reviewItemList.locator('[data-testid^="review-item"]').count();
  }

  async getCurationItemCount(): Promise<number> {
    return this.curationItemList.locator('[data-testid^="curation-item"]').count();
  }
}
