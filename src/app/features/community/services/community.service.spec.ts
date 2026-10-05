import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { CommunityService } from './community.service';

describe('CommunityService', () => {
  let service: CommunityService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CommunityService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Community Atoms
  // -------------------------------------------------------------------------

  describe('loadApprovedAtoms', () => {
    it('should set loading then success state', () => {
      const mockAtoms = {
        data: [
          { id: 'atom-1', title: 'Test Atom', status: 'approved', vote_score: 10, atom_type: 'concept' },
        ],
      };

      service.loadApprovedAtoms().subscribe();
      expect(service.atomListState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms'));
      expect(req.request.method).toBe('GET');
      req.flush(mockAtoms);

      expect(service.atomListState().status).toBe('success');
      expect(service.atoms().length).toBe(1);
    });

    it('should set error state on failure', () => {
      service.loadApprovedAtoms().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.atomListState().status).toBe('error');
    });
  });

  describe('submitAtom', () => {
    it('should POST and prepend to existing atoms', () => {
      // First load existing atoms
      service.loadApprovedAtoms().subscribe();
      const loadReq = httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms') && r.method === 'GET');
      loadReq.flush({ data: [{ id: 'atom-1', title: 'Existing', status: 'approved', vote_score: 5 }] });

      const newAtom = { title: 'New Atom', content: 'Some content', atom_type: 'concept' as const };

      service.submitAtom(newAtom).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms') && r.method === 'POST');
      expect(req.request.body).toEqual(newAtom);
      req.flush({ id: 'atom-2', ...newAtom, status: 'submitted', vote_score: 0 });

      expect(service.atoms().length).toBe(2);
      expect(service.atoms()[0].id).toBe('atom-2');
    });

    it('should set error state on failure', () => {
      service.submitAtom({ title: 'Test', content: 'Body', atom_type: 'factoid' }).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms') && r.method === 'POST');
      req.flush('Error', { status: 400, statusText: 'Bad Request' });
      expect(service.atomListState().status).toBe('error');
    });
  });

  // -------------------------------------------------------------------------
  // Peer Reviews
  // -------------------------------------------------------------------------

  describe('loadReviews', () => {
    it('should set loading then success state', () => {
      const mockReviews = {
        data: [
          { id: 'rev-1', community_atom_id: 'atom-1', reviewer_gcid: 'gcid-1', status: 'assigned' },
        ],
      };

      service.loadReviews().subscribe();
      expect(service.reviewListState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/reviews'));
      expect(req.request.method).toBe('GET');
      req.flush(mockReviews);

      expect(service.reviewListState().status).toBe('success');
      expect(service.reviews().length).toBe(1);
    });

    it('should filter by reviewer_gcid when provided', () => {
      service.loadReviews('gcid-123').subscribe();

      const req = httpMock.expectOne(r =>
        r.url.includes('/api/v1/community/reviews') && r.url.includes('reviewer_gcid=gcid-123'),
      );
      expect(req.request.method).toBe('GET');
      req.flush({ data: [] });
    });

    it('should set error state on failure', () => {
      service.loadReviews().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/reviews'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.reviewListState().status).toBe('error');
    });
  });

  describe('submitReviewDecision', () => {
    it('should PUT and update the review in state', () => {
      // First load reviews
      service.loadReviews().subscribe();
      const loadReq = httpMock.expectOne(r => r.url.includes('/api/v1/community/reviews') && r.method === 'GET');
      loadReq.flush({ data: [{ id: 'rev-1', community_atom_id: 'atom-1', status: 'assigned' }] });

      service.submitReviewDecision('rev-1', { decision: 'approve', feedback: 'Looks great' }).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/reviews/rev-1') && r.method === 'PUT');
      expect(req.request.body).toEqual({ decision: 'approve', feedback: 'Looks great' });
      req.flush({ id: 'rev-1', community_atom_id: 'atom-1', status: 'approved', feedback: 'Looks great' });

      expect(service.reviews()[0].status).toBe('approved');
    });
  });

  // -------------------------------------------------------------------------
  // Curation Queue
  // -------------------------------------------------------------------------

  describe('loadCurationQueue', () => {
    it('should set loading then success state', () => {
      const mockItems = {
        data: [
          { id: 'q-1', community_atom_id: 'atom-1', status: 'pending', peer_review_count: 5, approve_count: 4, reject_count: 1 },
        ],
      };

      service.loadCurationQueue().subscribe();
      expect(service.curationQueueState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/curation'));
      expect(req.request.method).toBe('GET');
      req.flush(mockItems);

      expect(service.curationQueueState().status).toBe('success');
      expect(service.curationItems().length).toBe(1);
    });

    it('should set error state on failure', () => {
      service.loadCurationQueue().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/curation'));
      req.flush('Error', { status: 403, statusText: 'Forbidden' });
      expect(service.curationQueueState().status).toBe('error');
    });
  });

  describe('decideCurationItem', () => {
    it('should POST and update item status in state', () => {
      // First load curation queue
      service.loadCurationQueue().subscribe();
      const loadReq = httpMock.expectOne(r => r.url.includes('/api/v1/community/curation') && r.method === 'GET');
      loadReq.flush({ data: [{ id: 'q-1', community_atom_id: 'atom-1', status: 'pending' }] });

      service.decideCurationItem('q-1', { approved: true, reason: 'High quality' }).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/curation/q-1/decide') && r.method === 'POST');
      expect(req.request.body).toEqual({ approved: true, reason: 'High quality' });
      req.flush({ id: 'dec-1', curation_queue_id: 'q-1', approved: true, reason: 'High quality' });

      expect(service.curationItems()[0].status).toBe('approved');
    });

    it('should set rejected status when not approved', () => {
      service.loadCurationQueue().subscribe();
      const loadReq = httpMock.expectOne(r => r.url.includes('/api/v1/community/curation') && r.method === 'GET');
      loadReq.flush({ data: [{ id: 'q-1', community_atom_id: 'atom-1', status: 'pending' }] });

      service.decideCurationItem('q-1', { approved: false, reason: 'Low quality' }).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/curation/q-1/decide'));
      req.flush({ id: 'dec-1', curation_queue_id: 'q-1', approved: false, reason: 'Low quality' });

      expect(service.curationItems()[0].status).toBe('rejected');
    });
  });

  // -------------------------------------------------------------------------
  // Votes
  // -------------------------------------------------------------------------

  describe('voteOnAtom', () => {
    it('should POST and update vote_score optimistically', () => {
      // First load atoms
      service.loadApprovedAtoms().subscribe();
      const loadReq = httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms') && r.method === 'GET');
      loadReq.flush({ data: [{ id: 'atom-1', title: 'Test', vote_score: 10 }] });

      service.voteOnAtom('atom-1', { direction: 'up' }).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms/atom-1/vote') && r.method === 'POST');
      expect(req.request.body).toEqual({ direction: 'up' });
      req.flush({ id: 'vote-1', community_atom_id: 'atom-1', direction: 'up' });

      expect(service.atoms()[0].vote_score).toBe(11);
    });

    it('should decrement vote_score on downvote', () => {
      service.loadApprovedAtoms().subscribe();
      const loadReq = httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms') && r.method === 'GET');
      loadReq.flush({ data: [{ id: 'atom-1', title: 'Test', vote_score: 10 }] });

      service.voteOnAtom('atom-1', { direction: 'down' }).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms/atom-1/vote'));
      req.flush({ id: 'vote-1', community_atom_id: 'atom-1', direction: 'down' });

      expect(service.atoms()[0].vote_score).toBe(9);
    });
  });

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------

  describe('loadComments', () => {
    it('should GET comments for a specific atom', () => {
      service.loadComments('atom-1').subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms/atom-1/comments') && r.method === 'GET');
      req.flush({ data: [{ id: 'cmt-1', body: 'Great atom!', author_gcid: 'gcid-1' }] });
    });
  });

  describe('addComment', () => {
    it('should POST a comment for a specific atom', () => {
      service.addComment('atom-1', { body: 'Nice work!' }).subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms/atom-1/comments') && r.method === 'POST');
      expect(req.request.body).toEqual({ body: 'Nice work!' });
      req.flush({ id: 'cmt-1', body: 'Nice work!', author_gcid: 'gcid-1' });
    });
  });

  // -------------------------------------------------------------------------
  // Contributor Profile
  // -------------------------------------------------------------------------

  describe('loadContributorProfile', () => {
    it('should set loading then success state', () => {
      const mockProfile = {
        id: 'cp-1',
        gcid: 'gcid-123',
        display_name: 'Test User',
        reputation_score: 250,
        atoms_submitted: 15,
        atoms_approved: 10,
        reviews_completed: 20,
        level: 'reviewer',
      };

      service.loadContributorProfile('gcid-123').subscribe();
      expect(service.contributorProfileState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/contributors/gcid-123'));
      expect(req.request.method).toBe('GET');
      req.flush(mockProfile);

      expect(service.contributorProfileState().status).toBe('success');
      expect(service.contributorProfile()?.display_name).toBe('Test User');
    });

    it('should set error state on failure', () => {
      service.loadContributorProfile('gcid-999').subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/contributors/gcid-999'));
      req.flush('Error', { status: 404, statusText: 'Not Found' });
      expect(service.contributorProfileState().status).toBe('error');
    });
  });

  // -------------------------------------------------------------------------
  // Computed signals
  // -------------------------------------------------------------------------

  describe('computed signals', () => {
    it('approvedAtoms should filter by approved status', () => {
      service.loadApprovedAtoms().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms'));
      req.flush({
        data: [
          { id: 'atom-1', status: 'approved', vote_score: 10 },
          { id: 'atom-2', status: 'submitted', vote_score: 2 },
        ],
      });

      expect(service.approvedAtoms().length).toBe(1);
      expect(service.approvedAtoms()[0].id).toBe('atom-1');
    });

    it('pendingReviews should filter by assigned status', () => {
      service.loadReviews().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/reviews'));
      req.flush({
        data: [
          { id: 'rev-1', status: 'assigned' },
          { id: 'rev-2', status: 'approved' },
        ],
      });

      expect(service.pendingReviews().length).toBe(1);
      expect(service.pendingReviews()[0].id).toBe('rev-1');
    });

    it('pendingCurationItems should filter by pending status', () => {
      service.loadCurationQueue().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/curation'));
      req.flush({
        data: [
          { id: 'q-1', status: 'pending' },
          { id: 'q-2', status: 'approved' },
        ],
      });

      expect(service.pendingCurationItems().length).toBe(1);
      expect(service.pendingCurationItems()[0].id).toBe('q-1');
    });
  });

  // -------------------------------------------------------------------------
  // State reset
  // -------------------------------------------------------------------------

  describe('resetState', () => {
    it('should reset all states to idle', () => {
      service.loadApprovedAtoms().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms')).flush({ data: [] });

      service.resetState();

      expect(service.atomListState().status).toBe('idle');
      expect(service.reviewListState().status).toBe('idle');
      expect(service.curationQueueState().status).toBe('idle');
      expect(service.contributorProfileState().status).toBe('idle');
    });
  });

  // -------------------------------------------------------------------------
  // Branch coverage: uncovered FALSE arms / catch handlers
  // -------------------------------------------------------------------------

  describe('branch coverage — list-state not-success guards', () => {
    it('submitAtom should NOT mutate atom list when state is idle (if-false arm)', () => {
      // No prior load — state is 'idle', so the `current.status === 'success'`
      // guard is false and the created atom is not prepended.
      let result: unknown = 'unset';
      service.submitAtom({ title: 'Solo', content: 'Body', atom_type: 'concept' }).subscribe(r => {
        result = r;
      });

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms') && r.method === 'POST');
      const created = { id: 'atom-99', title: 'Solo', content: 'Body', atom_type: 'concept', status: 'submitted', vote_score: 0 };
      req.flush(created);

      // State stays idle; atoms() computed returns [] (non-success arm).
      expect(service.atomListState().status).toBe('idle');
      expect(service.atoms().length).toBe(0);
      expect(result).toEqual(created);
    });

    it('submitReviewDecision should still emit when review state is idle (if-false arm) — no catch', () => {
      let result: unknown = 'unset';
      service.submitReviewDecision('rev-x', { decision: 'reject' }).subscribe(r => {
        result = r;
      });

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/reviews/rev-x') && r.method === 'PUT');
      const updated = { id: 'rev-x', community_atom_id: 'atom-1', status: 'rejected' };
      req.flush(updated);

      // reviewListState was never loaded -> stays idle, no map mutation occurs.
      expect(service.reviewListState().status).toBe('idle');
      expect(result).toEqual(updated);
    });

    it('decideCurationItem should still emit when queue state is idle (if-false arm)', () => {
      let result: unknown = 'unset';
      service.decideCurationItem('q-x', { approved: true }).subscribe(r => {
        result = r;
      });

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/curation/q-x/decide') && r.method === 'POST');
      const decision = { id: 'dec-x', curation_queue_id: 'q-x', approved: true };
      req.flush(decision);

      expect(service.curationQueueState().status).toBe('idle');
      expect(result).toEqual(decision);
    });

    it('voteOnAtom should still emit when atom state is idle (if-false arm)', () => {
      let result: unknown = 'unset';
      service.voteOnAtom('atom-x', { direction: 'up' }).subscribe(r => {
        result = r;
      });

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms/atom-x/vote') && r.method === 'POST');
      const vote = { id: 'vote-x', community_atom_id: 'atom-x', direction: 'up' };
      req.flush(vote);

      expect(service.atomListState().status).toBe('idle');
      expect(result).toEqual(vote);
    });
  });

  describe('branch coverage — map non-matching ternary arms', () => {
    it('submitReviewDecision should leave non-matching reviews untouched (map false arm)', () => {
      service.loadReviews().subscribe();
      const loadReq = httpMock.expectOne(r => r.url.includes('/api/v1/community/reviews') && r.method === 'GET');
      loadReq.flush({
        data: [
          { id: 'rev-1', community_atom_id: 'atom-1', status: 'assigned' },
          { id: 'rev-2', community_atom_id: 'atom-2', status: 'assigned' },
        ],
      });

      service.submitReviewDecision('rev-1', { decision: 'approve' }).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/reviews/rev-1') && r.method === 'PUT');
      req.flush({ id: 'rev-1', community_atom_id: 'atom-1', status: 'approved' });

      // rev-1 updated, rev-2 (non-matching) preserved unchanged.
      expect(service.reviews()[0].status).toBe('approved');
      expect(service.reviews()[1].id).toBe('rev-2');
      expect(service.reviews()[1].status).toBe('assigned');
    });

    it('decideCurationItem should leave non-matching items untouched (map false arm)', () => {
      service.loadCurationQueue().subscribe();
      const loadReq = httpMock.expectOne(r => r.url.includes('/api/v1/community/curation') && r.method === 'GET');
      loadReq.flush({
        data: [
          { id: 'q-1', community_atom_id: 'atom-1', status: 'pending' },
          { id: 'q-2', community_atom_id: 'atom-2', status: 'pending' },
        ],
      });

      service.decideCurationItem('q-1', { approved: false }).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/curation/q-1/decide') && r.method === 'POST');
      req.flush({ id: 'dec-1', curation_queue_id: 'q-1', approved: false });

      expect(service.curationItems()[0].status).toBe('rejected');
      expect(service.curationItems()[1].id).toBe('q-2');
      expect(service.curationItems()[1].status).toBe('pending');
    });

    it('voteOnAtom should leave non-matching atoms untouched (map false arm)', () => {
      service.loadApprovedAtoms().subscribe();
      const loadReq = httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms') && r.method === 'GET');
      loadReq.flush({
        data: [
          { id: 'atom-1', title: 'A', vote_score: 10 },
          { id: 'atom-2', title: 'B', vote_score: 3 },
        ],
      });

      service.voteOnAtom('atom-1', { direction: 'up' }).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms/atom-1/vote') && r.method === 'POST');
      req.flush({ id: 'vote-1', community_atom_id: 'atom-1', direction: 'up' });

      expect(service.atoms()[0].vote_score).toBe(11);
      expect(service.atoms()[1].id).toBe('atom-2');
      expect(service.atoms()[1].vote_score).toBe(3);
    });
  });

  describe('branch coverage — silent catchError handlers return null', () => {
    it('submitReviewDecision should set error state and emit null on failure (catchError)', () => {
      let result: unknown = 'unset';
      service.submitReviewDecision('rev-err', { decision: 'revise' }).subscribe(r => {
        result = r;
      });
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/reviews/rev-err') && r.method === 'PUT');
      req.flush('Error', { status: 500, statusText: 'Server Error' });

      expect(service.reviewListState().status).toBe('error');
      expect(result).toBeNull();
    });

    it('decideCurationItem should set error state and emit null on failure (catchError)', () => {
      let result: unknown = 'unset';
      service.decideCurationItem('q-err', { approved: true }).subscribe(r => {
        result = r;
      });
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/curation/q-err/decide') && r.method === 'POST');
      req.flush('Error', { status: 409, statusText: 'Conflict' });

      expect(service.curationQueueState().status).toBe('error');
      expect(result).toBeNull();
    });

    it('voteOnAtom should swallow errors and emit null (catchError)', () => {
      let result: unknown = 'unset';
      service.voteOnAtom('atom-err', { direction: 'down' }).subscribe(r => {
        result = r;
      });
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms/atom-err/vote') && r.method === 'POST');
      req.flush('Error', { status: 500, statusText: 'Server Error' });

      // voteOnAtom catchError does NOT touch state — list stays idle.
      expect(service.atomListState().status).toBe('idle');
      expect(result).toBeNull();
    });

    it('loadComments should swallow errors and emit null (catchError)', () => {
      let result: unknown = 'unset';
      service.loadComments('atom-err').subscribe(r => {
        result = r;
      });
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms/atom-err/comments') && r.method === 'GET');
      req.flush('Error', { status: 404, statusText: 'Not Found' });

      expect(result).toBeNull();
    });

    it('addComment should swallow errors and emit null (catchError)', () => {
      let result: unknown = 'unset';
      service.addComment('atom-err', { body: 'oops' }).subscribe(r => {
        result = r;
      });
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/atoms/atom-err/comments') && r.method === 'POST');
      req.flush('Error', { status: 500, statusText: 'Server Error' });

      expect(result).toBeNull();
    });
  });

  describe('branch coverage — contributorProfile computed non-success arm', () => {
    it('contributorProfile should return null before any load (ternary false arm)', () => {
      // Initial state is 'idle' (non-success) -> computed returns null.
      expect(service.contributorProfileState().status).toBe('idle');
      expect(service.contributorProfile()).toBeNull();
    });

    it('contributorProfile should return null after an error load (ternary false arm)', () => {
      service.loadContributorProfile('gcid-x').subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/contributors/gcid-x'));
      req.flush('Error', { status: 404, statusText: 'Not Found' });

      expect(service.contributorProfileState().status).toBe('error');
      expect(service.contributorProfile()).toBeNull();
    });
  });

  describe('branch coverage — loadReviews omitted-arg default path', () => {
    it('should request the unfiltered reviews path when reviewerGcid is undefined (ternary false arm)', () => {
      service.loadReviews().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/community/reviews'));
      // No query string appended when reviewerGcid is omitted.
      expect(req.request.url).not.toContain('reviewer_gcid');
      req.flush({ data: [] });
      expect(service.reviewListState().status).toBe('success');
    });
  });
});
