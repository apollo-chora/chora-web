/**
 * PeerReviewQueueComponent — Enhanced review feed with atom content display,
 * anonymized contributor, upvote/downvote with reason, 48h countdown timer.
 *
 * Route: /community/peer-review
 *
 * Features:
 *   - List of assigned peer reviews for the current reviewer
 *   - Atom content card display with full preview
 *   - Anonymized contributor display
 *   - Upvote/downvote with required reason textarea
 *   - 48h review window countdown timer
 *   - Review details with atom content preview
 *   - Approve / reject / request revision with feedback
 *   - Filter by review status
 *   - Comment field per review
 *   - Empty, loading, and error states
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Subscription, interval } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { CommunityService } from '../../services/community.service';
import {
  ALL_PEER_REVIEW_STATUSES,
  PEER_REVIEW_STATUS_LABELS,
} from '../../models/community.model';
import type { PeerReview, PeerReviewStatus, ReviewDecision, VoteDirection } from '../../models/community.model';

/** Review window duration: 48 hours in milliseconds */
const REVIEW_WINDOW_MS = 48 * 60 * 60 * 1000;

@Component({
  selector: 'chora-peer-review-queue',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './peer-review-queue.component.html',
  styleUrl: './peer-review-queue.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeerReviewQueueComponent implements OnInit, OnDestroy {
  private readonly communityService = inject(CommunityService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // --- State ---
  readonly reviewListState = this.communityService.reviewListState;
  readonly reviews = this.communityService.reviews;

  // --- Filters ---
  readonly filterStatus = signal<PeerReviewStatus | 'all'>('all');

  // --- Active feedback ---
  readonly activeFeedback = signal<Record<string, string>>({});

  // --- Vote state: direction per review ---
  readonly activeVotes = signal<Record<string, VoteDirection | null>>({});

  // --- Vote reason per review ---
  readonly voteReasons = signal<Record<string, string>>({});

  // --- Comment per review ---
  readonly reviewComments = signal<Record<string, string>>({});

  // --- Current time for countdown (updated every second) ---
  readonly currentTime = signal(Date.now());

  // --- Constants ---
  readonly allStatuses = ALL_PEER_REVIEW_STATUSES;
  readonly statusLabels = PEER_REVIEW_STATUS_LABELS;

  // --- Computed ---
  readonly filteredReviews = computed(() => {
    const status = this.filterStatus();
    if (status === 'all') return this.reviews();
    return this.reviews().filter((r) => r.status === status);
  });

  readonly pendingCount = computed(() =>
    this.reviews().filter((r) => r.status === 'assigned').length,
  );

  readonly reviewCount = computed(() => this.filteredReviews().length);

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.communityService.loadReviews().subscribe(),
    );

    // Update current time every second for countdown
    this.subscriptions.add(
      interval(1000).subscribe(() => {
        this.currentTime.set(Date.now());
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  onFilterStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.filterStatus.set(value as PeerReviewStatus | 'all');
  }

  onFeedbackChange(reviewId: string, event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.activeFeedback.update((prev) => ({ ...prev, [reviewId]: value }));
  }

  onCommentChange(reviewId: string, event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.reviewComments.update((prev) => ({ ...prev, [reviewId]: value }));
  }

  // -------------------------------------------------------------------------
  // Voting
  // -------------------------------------------------------------------------

  onVoteChange(reviewId: string, direction: VoteDirection): void {
    this.activeVotes.update((prev) => ({ ...prev, [reviewId]: direction }));
  }

  onVoteReasonChange(reviewId: string, event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.voteReasons.update((prev) => ({ ...prev, [reviewId]: value }));
  }

  getVoteDirection(reviewId: string): VoteDirection | null {
    return this.activeVotes()[reviewId] ?? null;
  }

  getVoteReason(reviewId: string): string {
    return this.voteReasons()[reviewId] ?? '';
  }

  canSubmitVote(reviewId: string): boolean {
    const direction = this.getVoteDirection(reviewId);
    const reason = this.getVoteReason(reviewId);
    return direction !== null && reason.trim().length > 0;
  }

  submitVote(review: PeerReview): void {
    const direction = this.getVoteDirection(review.id);
    const reason = this.getVoteReason(review.id);
    if (!direction || !reason.trim()) return;

    this.subscriptions.add(
      this.communityService.voteOnAtom(review.community_atom_id, { direction }).subscribe({
        next: () => {
          this.toast.show('community.vote_submitted', 'success');
          // Clear vote state
          this.activeVotes.update((prev) => {
            const next = { ...prev };
            delete next[review.id];
            return next;
          });
          this.voteReasons.update((prev) => {
            const next = { ...prev };
            delete next[review.id];
            return next;
          });
        },
        error: () => {
          this.toast.show('community.vote_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Decision submission
  // -------------------------------------------------------------------------

  async submitDecision(review: PeerReview, decision: ReviewDecision): Promise<void> {
    if (decision === 'reject') {
      const confirmed = await this.confirmDialog.confirm({
        title: 'community.reject_review_title',
        message: 'community.reject_review_message',
        confirmText: 'community.reject_confirm',
        variant: 'danger',
      });
      if (!confirmed) return;
    }

    const feedback = this.activeFeedback()[review.id] || '';

    this.subscriptions.add(
      this.communityService.submitReviewDecision(review.id, { decision, feedback }).subscribe({
        next: (result) => {
          if (result) {
            this.toast.show('community.review_decision_success', 'success');
            this.activeFeedback.update((prev) => {
              const next = { ...prev };
              delete next[review.id];
              return next;
            });
          }
        },
        error: () => {
          this.toast.show('community.review_decision_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Countdown timer
  // -------------------------------------------------------------------------

  /**
   * Returns remaining time string for the 48h review window.
   * Format: "Xh Ym" or "expired"
   */
  getCountdown(review: PeerReview): string {
    const createdAt = new Date(review.created_at).getTime();
    const deadline = createdAt + REVIEW_WINDOW_MS;
    const remaining = deadline - this.currentTime();

    if (remaining <= 0) return 'expired';

    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours}h ${minutes}m`;
  }

  isCountdownUrgent(review: PeerReview): boolean {
    const createdAt = new Date(review.created_at).getTime();
    const deadline = createdAt + REVIEW_WINDOW_MS;
    const remaining = deadline - this.currentTime();
    // Urgent if less than 4 hours remaining
    return remaining > 0 && remaining < 4 * 60 * 60 * 1000;
  }

  isCountdownExpired(review: PeerReview): boolean {
    const createdAt = new Date(review.created_at).getTime();
    const deadline = createdAt + REVIEW_WINDOW_MS;
    return this.currentTime() >= deadline;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Anonymized contributor display */
  getAnonymizedContributor(): string {
    return 'Anonymous Contributor';
  }

  formatDate(isoString: string | null): string {
    if (!isoString) return '-';
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }

  statusClass(status: string): string {
    return `peer-review-queue__status--${status}`;
  }

  isAssigned(review: PeerReview): boolean {
    return review.status === 'assigned';
  }

  trackByReviewId(_index: number, review: PeerReview): string {
    return review.id;
  }
}
