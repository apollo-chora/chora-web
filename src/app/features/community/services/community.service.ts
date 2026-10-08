/**
 * CommunityService — REST adapter for community atom submissions, peer reviews,
 * curation queue, voting, comments, and contributor profiles.
 *
 * Source of truth: chora-contracts/openapi/sharing-admin.yaml
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, map, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';
import type {
  CommunityAtom,
  SubmitCommunityAtomRequest,
  PeerReview,
  SubmitReviewDecisionRequest,
  CurationQueueItem,
  CurationDecision,
  CurationDecisionRequest,
  AtomVote,
  VoteRequest,
  AtomComment,
  AddCommentRequest,
  ContributorProfile,
  CommunityAtomListState,
  PeerReviewListState,
  CurationQueueState,
  ContributorProfileState,
} from '../models/community.model';

// ---------------------------------------------------------------------------
// Endpoint paths
// ---------------------------------------------------------------------------

const ATOMS_PATH = '/api/v1/community/atoms';
const REVIEWS_PATH = '/api/v1/community/reviews';
const CURATION_PATH = '/api/v1/community/curation';
const CONTRIBUTORS_PATH = '/api/v1/community/contributors';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class CommunityService {
  private readonly bff = inject(BffClientService);

  // --- Signal state (private + readonly) ---
  private readonly _atomListState = signal<CommunityAtomListState>({ status: 'idle' });
  readonly atomListState = this._atomListState.asReadonly();

  private readonly _reviewListState = signal<PeerReviewListState>({ status: 'idle' });
  readonly reviewListState = this._reviewListState.asReadonly();

  private readonly _curationQueueState = signal<CurationQueueState>({ status: 'idle' });
  readonly curationQueueState = this._curationQueueState.asReadonly();

  private readonly _contributorProfileState = signal<ContributorProfileState>({ status: 'idle' });
  readonly contributorProfileState = this._contributorProfileState.asReadonly();

  // --- Computed ---
  readonly atoms = computed(() => {
    const s = this._atomListState();
    return s.status === 'success' ? s.atoms : [];
  });

  readonly approvedAtoms = computed(() =>
    this.atoms().filter((a) => a.status === 'approved'),
  );

  readonly reviews = computed(() => {
    const s = this._reviewListState();
    return s.status === 'success' ? s.reviews : [];
  });

  readonly pendingReviews = computed(() =>
    this.reviews().filter((r) => r.status === 'assigned'),
  );

  readonly curationItems = computed(() => {
    const s = this._curationQueueState();
    return s.status === 'success' ? s.items : [];
  });

  readonly pendingCurationItems = computed(() =>
    this.curationItems().filter((i) => i.status === 'pending'),
  );

  readonly contributorProfile = computed(() => {
    const s = this._contributorProfileState();
    return s.status === 'success' ? s.profile : null;
  });

  // -------------------------------------------------------------------------
  // Community Atom methods
  // -------------------------------------------------------------------------

  loadApprovedAtoms(): Observable<CommunityAtom[] | null> {
    this._atomListState.set({ status: 'loading' });

    return this.bff.get<{ data: CommunityAtom[] }>(ATOMS_PATH).pipe(
      tap((response) => {
        this._atomListState.set({ status: 'success', atoms: response.data });
      }),
      map((response) => response.data),
      catchError((err: Error) => {
        this._atomListState.set({
          status: 'error',
          error: { code: 'ATOMS_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  submitAtom(data: SubmitCommunityAtomRequest): Observable<CommunityAtom | null> {
    return this.bff.post<CommunityAtom>(ATOMS_PATH, data).pipe(
      tap((created) => {
        const current = this._atomListState();
        if (current.status === 'success') {
          this._atomListState.set({
            ...current,
            atoms: [created, ...current.atoms],
          });
        }
      }),
      catchError((err: Error) => {
        this._atomListState.set({
          status: 'error',
          error: { code: 'ATOM_SUBMIT_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Peer Review methods
  // -------------------------------------------------------------------------

  loadReviews(reviewerGcid?: string): Observable<PeerReview[] | null> {
    this._reviewListState.set({ status: 'loading' });

    const path = reviewerGcid
      ? `${REVIEWS_PATH}?reviewer_gcid=${encodeURIComponent(reviewerGcid)}`
      : REVIEWS_PATH;

    return this.bff.get<{ data: PeerReview[] }>(path).pipe(
      tap((response) => {
        this._reviewListState.set({ status: 'success', reviews: response.data });
      }),
      map((response) => response.data),
      catchError((err: Error) => {
        this._reviewListState.set({
          status: 'error',
          error: { code: 'REVIEWS_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  submitReviewDecision(
    reviewId: string,
    data: SubmitReviewDecisionRequest,
  ): Observable<PeerReview | null> {
    return this.bff.put<PeerReview>(
      `${REVIEWS_PATH}/${encodeURIComponent(reviewId)}`,
      data,
    ).pipe(
      tap((updated) => {
        const current = this._reviewListState();
        if (current.status === 'success') {
          this._reviewListState.set({
            ...current,
            reviews: current.reviews.map((r) =>
              r.id === reviewId ? updated : r,
            ),
          });
        }
      }),
      catchError((err: Error) => {
        this._reviewListState.set({
          status: 'error',
          error: { code: 'REVIEW_DECISION_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Curation methods
  // -------------------------------------------------------------------------

  loadCurationQueue(): Observable<CurationQueueItem[] | null> {
    this._curationQueueState.set({ status: 'loading' });

    return this.bff.get<{ data: CurationQueueItem[] }>(CURATION_PATH).pipe(
      tap((response) => {
        this._curationQueueState.set({ status: 'success', items: response.data });
      }),
      map((response) => response.data),
      catchError((err: Error) => {
        this._curationQueueState.set({
          status: 'error',
          error: { code: 'CURATION_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  decideCurationItem(
    queueId: string,
    data: CurationDecisionRequest,
  ): Observable<CurationDecision | null> {
    return this.bff.post<CurationDecision>(
      `${CURATION_PATH}/${encodeURIComponent(queueId)}/decide`,
      data,
    ).pipe(
      tap(() => {
        const current = this._curationQueueState();
        if (current.status === 'success') {
          this._curationQueueState.set({
            ...current,
            items: current.items.map((item) =>
              item.id === queueId
                ? { ...item, status: data.approved ? 'approved' as const : 'rejected' as const }
                : item,
            ),
          });
        }
      }),
      catchError((err: Error) => {
        this._curationQueueState.set({
          status: 'error',
          error: { code: 'CURATION_DECIDE_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Vote methods
  // -------------------------------------------------------------------------

  voteOnAtom(atomId: string, data: VoteRequest): Observable<AtomVote | null> {
    return this.bff.post<AtomVote>(
      `${ATOMS_PATH}/${encodeURIComponent(atomId)}/vote`,
      data,
    ).pipe(
      tap(() => {
        const current = this._atomListState();
        if (current.status === 'success') {
          const delta = data.direction === 'up' ? 1 : -1;
          this._atomListState.set({
            ...current,
            atoms: current.atoms.map((a) =>
              a.id === atomId ? { ...a, vote_score: a.vote_score + delta } : a,
            ),
          });
        }
      }),
      catchError(() => of(null)),
    );
  }

  // -------------------------------------------------------------------------
  // Comment methods
  // -------------------------------------------------------------------------

  loadComments(atomId: string): Observable<AtomComment[] | null> {
    return this.bff.get<{ data: AtomComment[] }>(
      `${ATOMS_PATH}/${encodeURIComponent(atomId)}/comments`,
    ).pipe(
      map((response) => response.data),
      catchError(() => of(null)),
    );
  }

  addComment(atomId: string, data: AddCommentRequest): Observable<AtomComment | null> {
    return this.bff.post<AtomComment>(
      `${ATOMS_PATH}/${encodeURIComponent(atomId)}/comments`,
      data,
    ).pipe(
      catchError(() => of(null)),
    );
  }

  // -------------------------------------------------------------------------
  // Contributor Profile methods
  // -------------------------------------------------------------------------

  loadContributorProfile(gcid: string): Observable<ContributorProfile | null> {
    this._contributorProfileState.set({ status: 'loading' });

    return this.bff.get<ContributorProfile>(
      `${CONTRIBUTORS_PATH}/${encodeURIComponent(gcid)}`,
    ).pipe(
      tap((profile) => {
        this._contributorProfileState.set({ status: 'success', profile });
      }),
      catchError((err: Error) => {
        this._contributorProfileState.set({
          status: 'error',
          error: { code: 'CONTRIBUTOR_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // State reset
  // -------------------------------------------------------------------------

  resetState(): void {
    this._atomListState.set({ status: 'idle' });
    this._reviewListState.set({ status: 'idle' });
    this._curationQueueState.set({ status: 'idle' });
    this._contributorProfileState.set({ status: 'idle' });
  }
}
