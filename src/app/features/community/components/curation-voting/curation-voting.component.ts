/**
 * CurationVotingComponent — Vote on community atom quality with upvote/downvote,
 * quality score display, and issue flagging.
 *
 * Route: /community/curation
 *
 * Features:
 *   - List of atoms pending curation with quality scores
 *   - Upvote / downvote on each atom
 *   - Flag issues on an atom
 *   - Quality score display with visual indicator
 *   - Filter by curation status
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
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { CommunityService } from '../../services/community.service';
import {
  ALL_CURATION_ITEM_STATUSES,
  CURATION_ITEM_STATUS_LABELS,
} from '../../models/community.model';
import type { CurationItemStatus, CurationQueueItem } from '../../models/community.model';

@Component({
  selector: 'chora-curation-voting',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './curation-voting.component.html',
  styleUrl: './curation-voting.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CurationVotingComponent implements OnInit, OnDestroy {
  private readonly communityService = inject(CommunityService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly curationQueueState = this.communityService.curationQueueState;
  readonly curationItems = this.communityService.curationItems;

  // --- Filters ---
  readonly filterStatus = signal<CurationItemStatus | 'all'>('all');

  // --- Constants ---
  readonly allStatuses = ALL_CURATION_ITEM_STATUSES;
  readonly statusLabels = CURATION_ITEM_STATUS_LABELS;

  // --- Computed ---
  readonly filteredItems = computed(() => {
    const status = this.filterStatus();
    if (status === 'all') return this.curationItems();
    return this.curationItems().filter((item) => item.status === status);
  });

  readonly itemCount = computed(() => this.filteredItems().length);

  readonly pendingCount = computed(() =>
    this.curationItems().filter((item) => item.status === 'pending').length,
  );

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.communityService.loadCurationQueue().subscribe(),
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
    this.filterStatus.set(value as CurationItemStatus | 'all');
  }

  approveItem(item: CurationQueueItem): void {
    this.subscriptions.add(
      this.communityService.decideCurationItem(item.id, { approved: true }).subscribe({
        next: (result) => {
          if (result) {
            this.toast.show('community.curation_approved', 'success');
          }
        },
        error: () => {
          this.toast.show('community.curation_error', 'error');
        },
      }),
    );
  }

  rejectItem(item: CurationQueueItem): void {
    this.subscriptions.add(
      this.communityService.decideCurationItem(item.id, { approved: false }).subscribe({
        next: (result) => {
          if (result) {
            this.toast.show('community.curation_rejected', 'success');
          }
        },
        error: () => {
          this.toast.show('community.curation_error', 'error');
        },
      }),
    );
  }

  flagItem(item: CurationQueueItem): void {
    this.subscriptions.add(
      this.communityService.decideCurationItem(item.id, {
        approved: false,
        reason: 'flagged_for_review',
      }).subscribe({
        next: (result) => {
          if (result) {
            this.toast.show('community.curation_flagged', 'success');
          }
        },
        error: () => {
          this.toast.show('community.curation_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  qualityScorePercent(item: CurationQueueItem): number {
    const total = item.approve_count + item.reject_count;
    if (total === 0) return 0;
    return Math.round((item.approve_count / total) * 100);
  }

  qualityClass(item: CurationQueueItem): string {
    const percent = this.qualityScorePercent(item);
    if (percent >= 75) return 'curation-voting__quality--high';
    if (percent >= 50) return 'curation-voting__quality--medium';
    return 'curation-voting__quality--low';
  }

  statusClass(status: string): string {
    return `curation-voting__status--${status}`;
  }

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }

  isPending(item: CurationQueueItem): boolean {
    return item.status === 'pending';
  }

  trackByItemId(_index: number, item: CurationQueueItem): string {
    return item.id;
  }
}
