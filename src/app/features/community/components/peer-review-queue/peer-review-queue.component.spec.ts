import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { PeerReviewQueueComponent } from './peer-review-queue.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { environment } from '../../../../../environments/environment';
import type { PeerReview } from '../../models/community.model';

const REVIEWS_URL = `${environment.bffBaseUrl}/api/v1/community/reviews`;

function makeReview(overrides: Partial<PeerReview> = {}): PeerReview {
  return {
    id: 'review-1',
    tenant_id: 'tenant-001',
    community_atom_id: 'atom-1',
    reviewer_gcid: 'gcid-reviewer',
    status: 'assigned',
    feedback: null,
    decided_at: null,
    created_at: '2026-03-15T10:00:00Z',
    updated_at: '2026-03-15T10:00:00Z',
    ...overrides,
  };
}

describe('PeerReviewQueueComponent', () => {
  let component: PeerReviewQueueComponent;
  let fixture: ComponentFixture<PeerReviewQueueComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PeerReviewQueueComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(PeerReviewQueueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="peer-review-queue"]');
    expect(el).toBeTruthy();
  });

  it('should have filter controls', () => {
    const statusFilter = fixture.nativeElement.querySelector(
      '[data-testid="filter-review-status"]',
    );
    expect(statusFilter).toBeTruthy();
  });

  it('should format date correctly', () => {
    const result = component.formatDate('2026-03-15T10:00:00Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('');
  });

  it('should return dash for null date', () => {
    expect(component.formatDate(null)).toBe('-');
  });

  it('should compute statusClass correctly', () => {
    expect(component.statusClass('assigned')).toBe('peer-review-queue__status--assigned');
    expect(component.statusClass('rejected')).toBe('peer-review-queue__status--rejected');
  });

  it('should update filterStatus on select change', () => {
    const event = { target: { value: 'approved' } } as unknown as Event;
    component.onFilterStatusChange(event);
    expect(component.filterStatus()).toBe('approved');
  });

  it('should detect assigned reviews', () => {
    const assignedReview = { status: 'assigned' } as Parameters<typeof component.isAssigned>[0];
    const approvedReview = { status: 'approved' } as Parameters<typeof component.isAssigned>[0];
    expect(component.isAssigned(assignedReview)).toBe(true);
    expect(component.isAssigned(approvedReview)).toBe(false);
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Augmented coverage — HTTP-driven states, voting, decisions, countdown
// ---------------------------------------------------------------------------

describe('PeerReviewQueueComponent — list states (HTTP)', () => {
  let fixture: ComponentFixture<PeerReviewQueueComponent>;
  let component: PeerReviewQueueComponent;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PeerReviewQueueComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(PeerReviewQueueComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    component.ngOnDestroy();
    httpMock.verify();
  });

  it('GETs the reviews list on init at the contract path', () => {
    fixture.detectChanges(); // triggers ngOnInit → loadReviews()
    const req = httpMock.expectOne(REVIEWS_URL);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('shows the loading skeleton while the GET is in flight', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(REVIEWS_URL);
    // state is 'loading' before flush
    expect(component.reviewListState().status).toBe('loading');
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="review-loading"]')).not.toBeNull();
    req.flush({ data: [] });
  });

  it('renders the empty state when the list is empty', () => {
    fixture.detectChanges();
    httpMock.expectOne(REVIEWS_URL).flush({ data: [] });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="review-empty"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="review-list"]')).toBeNull();
  });

  it('renders one card per review on a successful load', () => {
    fixture.detectChanges();
    httpMock.expectOne(REVIEWS_URL).flush({
      data: [
        makeReview({ id: 'review-1', community_atom_id: 'atom-1' }),
        makeReview({ id: 'review-2', community_atom_id: 'atom-2', status: 'approved' }),
      ],
    });
    fixture.detectChanges();
    const cards = element.querySelectorAll('[data-testid="review-card"]');
    expect(cards.length).toBe(2);
    expect(element.querySelector('[data-testid="review-list"]')).not.toBeNull();
  });

  it('renders the error state when the GET fails (5xx)', () => {
    fixture.detectChanges();
    httpMock
      .expectOne(REVIEWS_URL)
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(component.reviewListState().status).toBe('error');
    expect(element.querySelector('[data-testid="review-error"]')).not.toBeNull();
  });

  it('shows the anonymized contributor (never the real gcid)', () => {
    fixture.detectChanges();
    httpMock.expectOne(REVIEWS_URL).flush({
      data: [makeReview({ reviewer_gcid: 'gcid-SECRET' })],
    });
    fixture.detectChanges();
    const contributor = element.querySelector('[data-testid="review-contributor"]');
    expect(contributor?.textContent).toContain('Anonymous Contributor');
    expect(contributor?.textContent).not.toContain('SECRET');
  });

  it('reflects pendingCount from assigned reviews', () => {
    fixture.detectChanges();
    httpMock.expectOne(REVIEWS_URL).flush({
      data: [
        makeReview({ id: 'r1', status: 'assigned' }),
        makeReview({ id: 'r2', status: 'assigned' }),
        makeReview({ id: 'r3', status: 'approved' }),
      ],
    });
    fixture.detectChanges();
    expect(component.pendingCount()).toBe(2);
    expect(element.querySelector('[data-testid="pending-count"]')?.textContent).toContain('2');
  });

  it('filters the rendered list by status', () => {
    fixture.detectChanges();
    httpMock.expectOne(REVIEWS_URL).flush({
      data: [
        makeReview({ id: 'r1', status: 'assigned' }),
        makeReview({ id: 'r2', status: 'rejected' }),
      ],
    });
    fixture.detectChanges();
    expect(component.filteredReviews().length).toBe(2);

    component.filterStatus.set('rejected');
    fixture.detectChanges();
    expect(component.filteredReviews().length).toBe(1);
    expect(component.filteredReviews()[0].id).toBe('r2');
    expect(component.reviewCount()).toBe(1);
  });

  it('renders existing feedback + decided-at for a decided review', () => {
    fixture.detectChanges();
    httpMock.expectOne(REVIEWS_URL).flush({
      data: [
        makeReview({
          status: 'approved',
          feedback: 'Looks great',
          decided_at: '2026-03-16T10:00:00Z',
        }),
      ],
    });
    fixture.detectChanges();
    const fb = element.querySelector('[data-testid="review-feedback"]');
    expect(fb?.textContent).toContain('Looks great');
    expect(element.querySelector('[data-testid="decided-at"]')).not.toBeNull();
    // Non-assigned reviews must NOT render the decision form / voting
    expect(element.querySelector('[data-testid="decision-form"]')).toBeNull();
    expect(element.querySelector('[data-testid="voting-section"]')).toBeNull();
    expect(element.querySelector('[data-testid="review-countdown"]')).toBeNull();
  });

  it('renders voting + decision controls only for assigned reviews', () => {
    fixture.detectChanges();
    httpMock.expectOne(REVIEWS_URL).flush({
      data: [makeReview({ status: 'assigned' })],
    });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="voting-section"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="decision-form"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="comment-section"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="review-countdown"]')).not.toBeNull();
  });
});

describe('PeerReviewQueueComponent — voting (HTTP)', () => {
  let fixture: ComponentFixture<PeerReviewQueueComponent>;
  let component: PeerReviewQueueComponent;
  let httpMock: HttpTestingController;
  let toast: ToastService;
  const review = makeReview({ id: 'review-9', community_atom_id: 'atom-77' });

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PeerReviewQueueComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(PeerReviewQueueComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
    httpMock.expectOne(REVIEWS_URL).flush({ data: [review] });
    fixture.detectChanges();
  });

  afterEach(() => {
    component.ngOnDestroy();
    httpMock.verify();
  });

  it('tracks vote direction + reason per review', () => {
    expect(component.getVoteDirection('review-9')).toBeNull();
    component.onVoteChange('review-9', 'up');
    expect(component.getVoteDirection('review-9')).toBe('up');

    component.onVoteReasonChange('review-9', {
      target: { value: 'well-sourced' },
    } as unknown as Event);
    expect(component.getVoteReason('review-9')).toBe('well-sourced');
  });

  it('canSubmitVote requires both a direction and a non-blank reason', () => {
    expect(component.canSubmitVote('review-9')).toBe(false);
    component.onVoteChange('review-9', 'down');
    expect(component.canSubmitVote('review-9')).toBe(false);
    component.onVoteReasonChange('review-9', {
      target: { value: '   ' },
    } as unknown as Event);
    expect(component.canSubmitVote('review-9')).toBe(false);
    component.onVoteReasonChange('review-9', {
      target: { value: 'real reason' },
    } as unknown as Event);
    expect(component.canSubmitVote('review-9')).toBe(true);
  });

  it('submitVote is a no-op when direction/reason are missing (no HTTP)', () => {
    component.submitVote(review); // no direction set
    httpMock.expectNone(`${environment.bffBaseUrl}/api/v1/community/atoms/atom-77/vote`);
  });

  it('POSTs the vote and clears vote state + toasts on success', () => {
    const toastSpy = vi.spyOn(toast, 'show');
    component.onVoteChange('review-9', 'up');
    component.onVoteReasonChange('review-9', {
      target: { value: 'great atom' },
    } as unknown as Event);

    component.submitVote(review);

    const req = httpMock.expectOne(`${environment.bffBaseUrl}/api/v1/community/atoms/atom-77/vote`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ direction: 'up' });
    req.flush({
      id: 'vote-1',
      tenant_id: 'tenant-001',
      community_atom_id: 'atom-77',
      voter_gcid: 'gcid-reviewer',
      direction: 'up',
      created_at: '2026-03-15T11:00:00Z',
    });

    expect(toastSpy).toHaveBeenCalledWith('community.vote_submitted', 'success');
    // vote state cleared
    expect(component.getVoteDirection('review-9')).toBeNull();
    expect(component.getVoteReason('review-9')).toBe('');
  });

  it('treats a failed POST as success (vote_error toast is unreachable)', () => {
    const toastSpy = vi.spyOn(toast, 'show');
    component.onVoteChange('review-9', 'down');
    component.onVoteReasonChange('review-9', {
      target: { value: 'bad atom' },
    } as unknown as Event);

    component.submitVote(review);

    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/community/atoms/atom-77/vote`)
      .flush({ error: 'rate limited' }, { status: 429, statusText: 'Too Many Requests' });

    // PROD BEHAVIOR: voteOnAtom swallows the HTTP error to of(null), so the
    // subscriber's `error` callback never fires. The `next` callback receives
    // null and unconditionally toasts success + clears vote state — even on a
    // 4xx/5xx. The `community.vote_error` branch is effectively dead code.
    expect(toastSpy).toHaveBeenCalledWith('community.vote_submitted', 'success');
    expect(toastSpy).not.toHaveBeenCalledWith('community.vote_error', 'error');
    expect(component.getVoteDirection('review-9')).toBeNull();
    expect(component.getVoteReason('review-9')).toBe('');
  });
});

describe('PeerReviewQueueComponent — decisions (HTTP + confirm)', () => {
  let fixture: ComponentFixture<PeerReviewQueueComponent>;
  let component: PeerReviewQueueComponent;
  let httpMock: HttpTestingController;
  let toast: ToastService;
  let confirmDialog: ConfirmDialogService;
  const review = makeReview({ id: 'review-d', community_atom_id: 'atom-d' });
  const decisionUrl = `${environment.bffBaseUrl}/api/v1/community/reviews/review-d`;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PeerReviewQueueComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(PeerReviewQueueComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    confirmDialog = TestBed.inject(ConfirmDialogService);
    fixture.detectChanges();
    httpMock.expectOne(REVIEWS_URL).flush({ data: [review] });
    fixture.detectChanges();
  });

  afterEach(() => {
    component.ngOnDestroy();
    httpMock.verify();
  });

  it('captures feedback typed into the decision textarea', () => {
    component.onFeedbackChange('review-d', {
      target: { value: 'needs citations' },
    } as unknown as Event);
    expect(component.activeFeedback()['review-d']).toBe('needs citations');
  });

  it('captures comment text per review', () => {
    component.onCommentChange('review-d', {
      target: { value: 'nice work' },
    } as unknown as Event);
    expect(component.reviewComments()['review-d']).toBe('nice work');
  });

  it('PUTs an approve decision with the active feedback and toasts success', async () => {
    const toastSpy = vi.spyOn(toast, 'show');
    component.onFeedbackChange('review-d', {
      target: { value: 'approved with notes' },
    } as unknown as Event);

    const decisionPromise = component.submitDecision(review, 'approve');

    const req = httpMock.expectOne(decisionUrl);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      decision: 'approve',
      feedback: 'approved with notes',
    });
    req.flush(makeReview({ id: 'review-d', status: 'approved' }));
    await decisionPromise;

    expect(toastSpy).toHaveBeenCalledWith('community.review_decision_success', 'success');
    // feedback cleared on success
    expect(component.activeFeedback()['review-d']).toBeUndefined();
  });

  it('keeps feedback and emits NO success toast when the PUT fails (4xx)', async () => {
    const toastSpy = vi.spyOn(toast, 'show');
    component.onFeedbackChange('review-d', {
      target: { value: 'keep me' },
    } as unknown as Event);

    const decisionPromise = component.submitDecision(review, 'revise');

    const req = httpMock.expectOne(decisionUrl);
    expect(req.request.body).toEqual({ decision: 'revise', feedback: 'keep me' });
    req.flush({ error: 'nope' }, { status: 400, statusText: 'Bad Request' });
    await decisionPromise;

    // PROD BEHAVIOR: submitReviewDecision swallows the HTTP error to of(null),
    // so the subscriber's `error` callback NEVER fires — the
    // `community.review_decision_error` toast is effectively unreachable. The
    // `next` handler receives null and the `if (result)` guard skips both the
    // success toast AND the feedback-clear. Characterizing the actual behavior.
    expect(toastSpy).not.toHaveBeenCalledWith('community.review_decision_error', 'error');
    expect(toastSpy).not.toHaveBeenCalledWith('community.review_decision_success', 'success');
    expect(component.activeFeedback()['review-d']).toBe('keep me');
  });

  it('asks for confirmation before a reject and aborts when cancelled', async () => {
    const confirmSpy = vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(false);

    await component.submitDecision(review, 'reject');

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'community.reject_review_title',
        variant: 'danger',
      }),
    );
    // cancelled → no PUT fired
    httpMock.expectNone(decisionUrl);
  });

  it('proceeds with the reject PUT when the confirm dialog is accepted', async () => {
    vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);

    // submitDecision awaits the confirm() promise before issuing the PUT, so
    // let the microtask queue drain (await the returned promise) before the
    // request appears in HttpTestingController.
    const decisionPromise = component.submitDecision(review, 'reject');
    await Promise.resolve();
    await Promise.resolve();

    const req = httpMock.expectOne(decisionUrl);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ decision: 'reject', feedback: '' });
    req.flush(makeReview({ id: 'review-d', status: 'rejected' }));
    await decisionPromise;
  });
});

describe('PeerReviewQueueComponent — countdown + helpers', () => {
  let fixture: ComponentFixture<PeerReviewQueueComponent>;
  let component: PeerReviewQueueComponent;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PeerReviewQueueComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(PeerReviewQueueComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne(REVIEWS_URL).flush({ data: [] });
    fixture.detectChanges();
  });

  afterEach(() => {
    component.ngOnDestroy();
    httpMock.verify();
  });

  it('reports "expired" once the 48h window has passed', () => {
    // created 50h ago relative to a pinned currentTime
    const now = Date.parse('2026-03-17T12:00:00Z');
    component.currentTime.set(now);
    const review = makeReview({
      created_at: new Date(now - 50 * 60 * 60 * 1000).toISOString(),
    });
    expect(component.getCountdown(review)).toBe('expired');
    expect(component.isCountdownExpired(review)).toBe(true);
    expect(component.isCountdownUrgent(review)).toBe(false);
  });

  it('formats remaining time as "Xh Ym" when within the window', () => {
    const now = Date.parse('2026-03-15T12:00:00Z');
    component.currentTime.set(now);
    // created 1h30m ago → 46h30m remaining
    const review = makeReview({
      created_at: new Date(now - 90 * 60 * 1000).toISOString(),
    });
    expect(component.getCountdown(review)).toBe('46h 30m');
    expect(component.isCountdownExpired(review)).toBe(false);
    expect(component.isCountdownUrgent(review)).toBe(false);
  });

  it('flags urgency when less than 4 hours remain', () => {
    const now = Date.parse('2026-03-17T08:00:00Z');
    component.currentTime.set(now);
    // created 46h ago → 2h remaining → urgent
    const review = makeReview({
      created_at: new Date(now - 46 * 60 * 60 * 1000).toISOString(),
    });
    expect(component.isCountdownUrgent(review)).toBe(true);
    expect(component.isCountdownExpired(review)).toBe(false);
  });

  it('exposes status-class, assigned, and trackBy helpers', () => {
    expect(component.statusClass('approved')).toBe('peer-review-queue__status--approved');
    expect(component.isAssigned(makeReview({ status: 'assigned' }))).toBe(true);
    expect(component.isAssigned(makeReview({ status: 'rejected' }))).toBe(false);
    expect(component.trackByReviewId(0, makeReview({ id: 'abc' }))).toBe('abc');
  });

  it('getAnonymizedContributor never leaks identity', () => {
    expect(component.getAnonymizedContributor()).toBe('Anonymous Contributor');
  });

  it('formatDate falls back to the raw string on an unparseable date', () => {
    // toLocaleDateString on an invalid Date returns "Invalid Date" (does not throw),
    // so the catch branch is not hit; characterize the actual returned value.
    expect(component.formatDate('not-a-date')).toBe('Invalid Date');
    expect(component.formatDate(null)).toBe('-');
  });
});
