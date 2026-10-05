/**
 * ContentApprovalComponent — Admin moderation dashboard for community atom submissions.
 *
 * Route: /admin/content/moderation
 *
 * Features:
 *   - Vote summary panel (upvote/downvote counts, net score)
 *   - Content Reviewer AI analysis report
 *   - Contributor history (submissions, approvals, level)
 *   - Action buttons: approve, reject, escalate (with confirmation dialog)
 *   - Filter by submission status
 *   - Loading, error, and empty states
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
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { BffClientService } from '../../../../../core/services/bff-client.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';

/** Community atom submission awaiting moderation */
interface ModerationItem {
  id: string;
  title: string;
  content: string;
  atom_type: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'escalated';
  contributor_display_name: string;
  contributor_level: string;
  contributor_atoms_submitted: number;
  contributor_atoms_approved: number;
  vote_summary: {
    upvotes: number;
    downvotes: number;
    net_score: number;
  };
  ai_analysis: {
    quality_score: number;
    accuracy_assessment: string;
    recommendations: string[];
    flags: string[];
  } | null;
  peer_reviews_completed: number;
  peer_reviews_required: number;
  tags: string[];
  created_at: string;
}

type ModerationListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; items: ModerationItem[] }
  | { status: 'error'; error: { code: string; message: string } };

type ModerationAction = 'approve' | 'reject' | 'escalate';

type FilterStatus = 'all' | 'pending' | 'under_review' | 'escalated';

@Component({
  selector: 'chora-content-approval',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './content-approval.component.html',
  styleUrl: './content-approval.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentApprovalComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  readonly listState = signal<ModerationListState>({ status: 'idle' });
  readonly filterStatus = signal<FilterStatus>('all');
  readonly expandedItemId = signal<string | null>(null);

  readonly items = computed(() => {
    const state = this.listState();
    return state.status === 'success' ? state.items : [];
  });

  readonly filteredItems = computed(() => {
    const status = this.filterStatus();
    if (status === 'all') return this.items();
    return this.items().filter((item) => item.status === status);
  });

  readonly totalCount = computed(() => this.items().length);
  readonly pendingCount = computed(() =>
    this.items().filter((i) => i.status === 'pending' || i.status === 'under_review').length,
  );
  readonly escalatedCount = computed(() =>
    this.items().filter((i) => i.status === 'escalated').length,
  );

  readonly filterOptions: { value: FilterStatus; label: string }[] = [
    { value: 'all', label: 'admin.moderation.filter-all' },
    { value: 'pending', label: 'admin.moderation.filter-pending' },
    { value: 'under_review', label: 'admin.moderation.filter-under-review' },
    { value: 'escalated', label: 'admin.moderation.filter-escalated' },
  ];

  private subscriptions = new Subscription();

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  ngOnInit(): void {
    this.loadModerationQueue();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  private loadModerationQueue(): void {
    this.listState.set({ status: 'loading' });

    this.subscriptions.add(
      this.bff.get<{ data: ModerationItem[] }>(
        '/api/v1/admin/moderation/queue',
      ).subscribe({
        next: (res) => {
          this.listState.set({ status: 'success', items: res.data });
        },
        error: (err: Error) => {
          this.listState.set({
            status: 'error',
            error: { code: 'MODERATION_LOAD_FAILED', message: err.message },
          });
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // User actions
  // ---------------------------------------------------------------------------

  onFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as FilterStatus;
    this.filterStatus.set(value);
  }

  toggleExpandItem(itemId: string): void {
    if (this.expandedItemId() === itemId) {
      this.expandedItemId.set(null);
    } else {
      this.expandedItemId.set(itemId);
    }
  }

  isExpanded(itemId: string): boolean {
    return this.expandedItemId() === itemId;
  }

  async onAction(item: ModerationItem, action: ModerationAction): Promise<void> {
    const dialogConfig: Record<ModerationAction, {
      title: string;
      message: string;
      confirmText: string;
      variant: 'info' | 'danger' | 'warning';
    }> = {
      approve: {
        title: 'admin.moderation.approve-title',
        message: 'admin.moderation.approve-message',
        confirmText: 'admin.moderation.approve-confirm',
        variant: 'info',
      },
      reject: {
        title: 'admin.moderation.reject-title',
        message: 'admin.moderation.reject-message',
        confirmText: 'admin.moderation.reject-confirm',
        variant: 'danger',
      },
      escalate: {
        title: 'admin.moderation.escalate-title',
        message: 'admin.moderation.escalate-message',
        confirmText: 'admin.moderation.escalate-confirm',
        variant: 'warning',
      },
    };

    const config = dialogConfig[action];
    const confirmed = await this.confirmDialog.confirm({
      title: config.title,
      message: config.message,
      confirmText: config.confirmText,
      variant: config.variant,
    });

    if (!confirmed) return;

    this.subscriptions.add(
      this.bff.post<{ id: string; status: string }>(
        `/api/v1/admin/moderation/${item.id}/${action}`,
        {},
      ).subscribe({
        next: () => {
          this.toast.show(`admin.moderation.${action}-success`, 'success');
          // Update item status in local state
          const state = this.listState();
          if (state.status === 'success') {
            const newStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'escalated';
            const updated = state.items.map((i) =>
              i.id === item.id ? { ...i, status: newStatus as ModerationItem['status'] } : i,
            );
            this.listState.set({ ...state, items: updated });
          }
        },
        error: () => {
          this.toast.show(`admin.moderation.${action}-error`, 'error');
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  getQualityScoreClass(score: number): string {
    if (score >= 80) return 'content-approval__score--high';
    if (score >= 50) return 'content-approval__score--medium';
    return 'content-approval__score--low';
  }

  getVoteScoreClass(netScore: number): string {
    if (netScore > 0) return 'content-approval__vote-score--positive';
    if (netScore < 0) return 'content-approval__vote-score--negative';
    return 'content-approval__vote-score--neutral';
  }

  getStatusClass(status: string): string {
    return `content-approval__item-status--${status}`;
  }

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return isoString;
    }
  }

  trackByItemId(_index: number, item: ModerationItem): string {
    return item.id;
  }

  trackByIndex(index: number): number {
    return index;
  }
}
