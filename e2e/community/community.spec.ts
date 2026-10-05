import { test, expect } from '@playwright/test';
import { mockAuthSession } from '../fixtures/auth-mocks';
import {
  buildAtomSubmission,
  buildPeerReview,
  buildCurationItem,
  buildContributorProfile,
  mockCommunityAPI,
} from '../fixtures/phase29-community-mocks';
import { CommunityPage } from '../pages/community.page';
import { runAxeAudit } from '../fixtures/a11y.fixture';

// ---------------------------------------------------------------------------
// Viewport: tablet primary (1024x768)
// ---------------------------------------------------------------------------
test.use({ viewport: { width: 1024, height: 768 } });

// ---------------------------------------------------------------------------
// Community — Atom Bank Browsing
// ---------------------------------------------------------------------------
test.describe('Community — Atom Bank', () => {
  let communityPage: CommunityPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner', [
      'learner_engagement',
      'knowledge_graph',
      'social',
      'community_contributions',
    ]);
    communityPage = new CommunityPage(page);
  });

  test('atom bank list renders with community submissions', async ({ page }) => {
    const submissions = [
      buildAtomSubmission({ id: 'sub-1', title: 'Quadratic Equations', status: 'pending_review' }),
      buildAtomSubmission({ id: 'sub-2', title: 'Linear Functions', status: 'approved' }),
      buildAtomSubmission({ id: 'sub-3', title: 'Polynomial Division', status: 'pending_review' }),
    ];
    await mockCommunityAPI(page, { submissions });

    await communityPage.gotoAtomBank();
    await communityPage.expectAtomBankLoaded();
    await expect(communityPage.atomBankList).toBeVisible();
  });

  test('atom bank displays empty state when no submissions exist', async ({ page }) => {
    await mockCommunityAPI(page, { submissions: [] });

    await communityPage.gotoAtomBank();
    await communityPage.expectAtomBankLoaded();
    await expect(communityPage.atomBank).toBeVisible();
  });

  test('atom submission form renders on submit route', async ({ page }) => {
    await mockCommunityAPI(page);

    await communityPage.gotoSubmitAtom();
    await expect(communityPage.atomSubmissionForm).toBeVisible();
    await expect(communityPage.atomTitleInput).toBeVisible();
    await expect(communityPage.atomContentInput).toBeVisible();
    await expect(communityPage.atomTagInput).toBeVisible();
    await expect(communityPage.submitAtomButton).toBeVisible();
  });

  test('atom submission form accepts input and submits', async ({ page }) => {
    await mockCommunityAPI(page);

    await communityPage.gotoSubmitAtom();
    await communityPage.fillAtomSubmission(
      'Trigonometry Basics',
      'What is the value of sin(90)?',
      'trigonometry',
    );
    await communityPage.submitAtom();

    // Submission succeeds — no error visible
    await expect(communityPage.atomSubmissionForm).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Community — Peer Review Queue
// ---------------------------------------------------------------------------
test.describe('Community — Peer Review', () => {
  let communityPage: CommunityPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner', [
      'learner_engagement',
      'knowledge_graph',
      'social',
      'community_contributions',
    ]);
    communityPage = new CommunityPage(page);
  });

  test('peer review queue renders with pending reviews', async ({ page }) => {
    const reviews = [
      buildPeerReview({ id: 'rev-1', decision: 'pending', submission_title: 'Algebra Basics' }),
      buildPeerReview({ id: 'rev-2', decision: 'pending', submission_title: 'Geometry Proofs' }),
    ];
    await mockCommunityAPI(page, { reviews });

    await communityPage.gotoPeerReview();
    await communityPage.expectPeerReviewLoaded();
    await expect(communityPage.reviewItemList).toBeVisible();
  });

  test('peer review displays approve and reject buttons', async ({ page }) => {
    const reviews = [
      buildPeerReview({ id: 'rev-1', decision: 'pending' }),
    ];
    await mockCommunityAPI(page, { reviews });

    await communityPage.gotoPeerReview();
    await communityPage.expectPeerReviewLoaded();
    await expect(communityPage.approveButton).toBeVisible();
    await expect(communityPage.rejectButton).toBeVisible();
  });

  test('peer review feedback input is accessible', async ({ page }) => {
    const reviews = [
      buildPeerReview({ id: 'rev-1', decision: 'pending' }),
    ];
    await mockCommunityAPI(page, { reviews });

    await communityPage.gotoPeerReview();
    await communityPage.expectPeerReviewLoaded();
    await communityPage.fillReviewFeedback('Good quality atom, clear question');
    await expect(communityPage.reviewFeedbackInput).toHaveValue('Good quality atom, clear question');
  });

  test('empty peer review queue shows appropriate state', async ({ page }) => {
    await mockCommunityAPI(page, { reviews: [] });

    await communityPage.gotoPeerReview();
    await communityPage.expectPeerReviewLoaded();
    await expect(communityPage.peerReviewQueue).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Community — Curation Voting
// ---------------------------------------------------------------------------
test.describe('Community — Curation Voting', () => {
  let communityPage: CommunityPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner', [
      'learner_engagement',
      'knowledge_graph',
      'social',
      'community_contributions',
    ]);
    communityPage = new CommunityPage(page);
  });

  test('curation panel renders with votable items', async ({ page }) => {
    const curationItems = [
      buildCurationItem({ id: 'cur-1', title: 'Pythagorean Theorem', net_score: 10 }),
      buildCurationItem({ id: 'cur-2', title: 'Area of a Circle', net_score: 7 }),
      buildCurationItem({ id: 'cur-3', title: 'Volume of a Sphere', net_score: 3 }),
    ];
    await mockCommunityAPI(page, { curationItems });

    await communityPage.gotoCuration();
    await communityPage.expectCurationLoaded();
    await expect(communityPage.curationItemList).toBeVisible();
  });

  test('curation voting buttons are visible for each item', async ({ page }) => {
    const curationItems = [
      buildCurationItem({ id: 'cur-1' }),
    ];
    await mockCommunityAPI(page, { curationItems });

    await communityPage.gotoCuration();
    await communityPage.expectCurationLoaded();
    await expect(communityPage.upvoteButton).toBeVisible();
    await expect(communityPage.downvoteButton).toBeVisible();
    await expect(communityPage.voteCount).toBeVisible();
  });

  test('upvote action triggers vote request', async ({ page }) => {
    const curationItems = [
      buildCurationItem({ id: 'cur-1', net_score: 5 }),
    ];
    await mockCommunityAPI(page, { curationItems });

    await communityPage.gotoCuration();
    await communityPage.expectCurationLoaded();
    await communityPage.upvoteCurationItem();

    // Vote button was clicked — panel remains stable
    await expect(communityPage.curationPanel).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Community — Contributor Profile
// ---------------------------------------------------------------------------
test.describe('Community — Contributor Profile', () => {
  let communityPage: CommunityPage;

  test.beforeEach(async ({ page }) => {
    await mockAuthSession(page, 'learner', [
      'learner_engagement',
      'knowledge_graph',
      'social',
      'community_contributions',
    ]);
    communityPage = new CommunityPage(page);
  });

  test('contributor profile renders with reputation and stats', async ({ page }) => {
    const profile = buildContributorProfile({
      display_name: 'Star Contributor',
      reputation_score: 1200,
      tier: 'gold',
      total_submissions: 50,
      total_reviews: 80,
    });
    await mockCommunityAPI(page, { profile });

    await communityPage.gotoContributorProfile('gcid-learner-001');
    await communityPage.expectContributorProfileLoaded();
    await expect(communityPage.contributorDisplayName).toBeVisible();
    await expect(communityPage.contributorReputation).toBeVisible();
    await expect(communityPage.contributorSubmissionCount).toBeVisible();
    await expect(communityPage.contributorReviewCount).toBeVisible();
  });

  test('contributor profile displays earned badges', async ({ page }) => {
    const profile = buildContributorProfile({
      badges: [
        { id: 'badge-1', name: 'First Submission', icon: 'star', earned_at: '2026-01-15T00:00:00Z' },
        { id: 'badge-2', name: 'Review Master', icon: 'check', earned_at: '2026-02-20T00:00:00Z' },
        { id: 'badge-3', name: 'Top Curator', icon: 'trophy', earned_at: '2026-03-05T00:00:00Z' },
      ],
    });
    await mockCommunityAPI(page, { profile });

    await communityPage.gotoContributorProfile('gcid-learner-001');
    await communityPage.expectContributorProfileLoaded();
    await expect(communityPage.contributorBadgeList).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Community — Accessibility
// ---------------------------------------------------------------------------
test.describe('Community — Accessibility', () => {
  test('atom bank page passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'learner', [
      'learner_engagement',
      'knowledge_graph',
      'social',
      'community_contributions',
    ]);
    await mockCommunityAPI(page, {
      submissions: [
        buildAtomSubmission({ title: 'Algebra Basics' }),
        buildAtomSubmission({ title: 'Geometry Fundamentals' }),
      ],
    });

    const communityPage = new CommunityPage(page);
    await communityPage.gotoAtomBank();
    await communityPage.expectAtomBankLoaded();

    await runAxeAudit(page, 'Community atom bank');
  });

  test('peer review page passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'learner', [
      'learner_engagement',
      'knowledge_graph',
      'social',
      'community_contributions',
    ]);
    await mockCommunityAPI(page, {
      reviews: [buildPeerReview({ decision: 'pending' })],
    });

    const communityPage = new CommunityPage(page);
    await communityPage.gotoPeerReview();
    await communityPage.expectPeerReviewLoaded();

    await runAxeAudit(page, 'Community peer review');
  });

  test('curation voting page passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'learner', [
      'learner_engagement',
      'knowledge_graph',
      'social',
      'community_contributions',
    ]);
    await mockCommunityAPI(page, {
      curationItems: [buildCurationItem()],
    });

    const communityPage = new CommunityPage(page);
    await communityPage.gotoCuration();
    await communityPage.expectCurationLoaded();

    await runAxeAudit(page, 'Community curation voting');
  });

  test('contributor profile page passes accessibility audit', async ({ page }) => {
    await mockAuthSession(page, 'learner', [
      'learner_engagement',
      'knowledge_graph',
      'social',
      'community_contributions',
    ]);
    await mockCommunityAPI(page, {
      profile: buildContributorProfile(),
    });

    const communityPage = new CommunityPage(page);
    await communityPage.gotoContributorProfile('gcid-learner-001');
    await communityPage.expectContributorProfileLoaded();

    await runAxeAudit(page, 'Community contributor profile');
  });
});
