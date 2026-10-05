/**
 * ModerationQueueComponent — Review queue for pending flagged content.
 *
 * Route: /admin/governance/moderation-queue
 *
 * This is SEPARATE from ModerationLogComponent (historical actions).
 * This component shows flagged content awaiting moderator review.
 *
 * Features:
 *   - Card-based queue of flagged content items
 *   - Filter by content type, priority, sort order
 *   - Actions: Approve, Request Edit, Remove
 *   - Cursor-based pagination (10 items per page)
 *   - Priority indicators (high: 3+ flags, critical: 5+ flags)
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
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { BffClientService } from '../../../../../core/services/bff-client.service';
import { HttpParams } from '@angular/common/http';

// ---------------------------------------------------------------------------
// Types (component-scoped)
// ---------------------------------------------------------------------------

export type FlaggedContentType = 'atom' | 'comment' | 'post' | 'media';
export type FlagReason = 'hate_speech' | 'spam' | 'misinformation' | 'inappropriate' | 'copyright' | 'other';
export type ModerationAction = 'approve' | 'request_edit' | 'remove';
export type QueuePriority = 'normal' | 'high' | 'critical';
export type QueueSortOrder = 'newest' | 'most_flagged' | 'oldest';

export interface FlaggedContentItem {
  id: string;
  content_type: FlaggedContentType;
  content_id: string;
  title: string;
  excerpt: string;
  thumbnail_url: string | null;
  flag_reason: FlagReason;
  flag_count: number;
  reporter_name: string;
  reported_at: string;
  author_gcid: string;
  author_name: string;
}

export interface ModerationQueueResponse {
  items: FlaggedContentItem[];
  next_cursor: string | null;
  total_count: number;
}

export interface ModerationActionPayload {
  action: ModerationAction;
  notes?: string;
}

export const ALL_CONTENT_TYPES: FlaggedContentType[] = ['atom', 'comment', 'post', 'media'];
export const ALL_PRIORITIES: QueuePriority[] = ['high', 'critical'];
export const ALL_SORT_OPTIONS: QueueSortOrder[] = ['newest', 'most_flagged', 'oldest'];

export const CONTENT_TYPE_LABELS: Record<FlaggedContentType, string> = {
  atom: 'admin.moderation.type_atom',
  comment: 'admin.moderation.type_comment',
  post: 'admin.moderation.type_post',
  media: 'admin.moderation.type_media',
};

export const FLAG_REASON_LABELS: Record<FlagReason, string> = {
  hate_speech: 'admin.moderation.reason_hate_speech',
  spam: 'admin.moderation.reason_spam',
  misinformation: 'admin.moderation.reason_misinformation',
  inappropriate: 'admin.moderation.reason_inappropriate',
  copyright: 'admin.moderation.reason_copyright',
  other: 'admin.moderation.reason_other',
};

export const SORT_LABELS: Record<QueueSortOrder, string> = {
  newest: 'admin.moderation.sort_newest',
  most_flagged: 'admin.moderation.sort_most_flagged',
  oldest: 'admin.moderation.sort_oldest',
};

export const PRIORITY_LABELS: Record<QueuePriority, string> = {
  normal: 'admin.moderation.priority_normal',
  high: 'admin.moderation.priority_high',
  critical: 'admin.moderation.priority_critical',
};

type QueueState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: FlaggedContentItem[]; next_cursor: string | null; total_count: number }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Endpoint Paths
// ---------------------------------------------------------------------------

const QUEUE_PATH = '/api/v1/governance/moderation/queue';
const ACTION_PATH = '/api/v1/governance/moderation';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@Component({
  selector: 'chora-moderation-queue',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './moderation-queue.component.html',
  styleUrl: './moderation-queue.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationQueueComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // --- State ---
  private readonly _queueState = signal<QueueState>({ status: 'idle' });
  readonly filterType = signal<FlaggedContentType | null>(null);
  readonly filterPriority = signal<QueuePriority | null>(null);
  readonly sortOrder = signal<QueueSortOrder>('newest');
  readonly actionInProgress = signal<string | null>(null);
  readonly editNotesItemId = signal<string | null>(null);
  readonly editNotesText = signal('');

  // --- Constants ---
  readonly allContentTypes = ALL_CONTENT_TYPES;
  readonly allPriorities = ALL_PRIORITIES;
  readonly allSortOptions = ALL_SORT_OPTIONS;
  readonly contentTypeLabels = CONTENT_TYPE_LABELS;
  readonly flagReasonLabels = FLAG_REASON_LABELS;
  readonly sortLabels = SORT_LABELS;
  readonly priorityLabels = PRIORITY_LABELS;

  // --- Computed ---
  readonly loading = computed(() => this._queueState().status === 'loading');

  readonly queueItems = computed(() => {
    const state = this._queueState();
    return state.status === 'success' ? state.data : [];
  });

  readonly nextCursor = computed(() => {
    const state = this._queueState();
    return state.status === 'success' ? state.next_cursor : null;
  });

  readonly totalCount = computed(() => {
    const state = this._queueState();
    return state.status === 'success' ? state.total_count : 0;
  });

  readonly isEmpty = computed(
    () => !this.loading() && this.queueItems().length === 0,
  );

  readonly hasMore = computed(() => this.nextCursor() !== null);

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadQueue();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadQueue(cursor?: string): void {
    this._queueState.set({ status: 'loading' });

    let params = new HttpParams();
    const type = this.filterType();
    const priority = this.filterPriority();
    const sort = this.sortOrder();

    if (type) params = params.set('type', type);
    if (priority) params = params.set('priority', priority);
    if (sort) params = params.set('sort', sort);
    if (cursor) params = params.set('cursor', cursor);

    this.subscriptions.add(
      this.bff.get<ModerationQueueResponse>(QUEUE_PATH, params).subscribe({
        next: (response) => {
          this._queueState.set({
            status: 'success',
            data: response.items,
            next_cursor: response.next_cursor,
            total_count: response.total_count,
          });
        },
        error: (err: Error) => {
          this._queueState.set({
            status: 'error',
            error: { code: 'QUEUE_LOAD_FAILED', message: err.message },
          });
          this.toast.show('admin.moderation.queue_load_error', 'error');
        },
      }),
    );
  }

  loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor) return;

    let params = new HttpParams();
    const type = this.filterType();
    const priority = this.filterPriority();
    const sort = this.sortOrder();

    if (type) params = params.set('type', type);
    if (priority) params = params.set('priority', priority);
    if (sort) params = params.set('sort', sort);
    params = params.set('cursor', cursor);

    this.subscriptions.add(
      this.bff.get<ModerationQueueResponse>(QUEUE_PATH, params).subscribe({
        next: (response) => {
          this._queueState.update((state) => {
            if (state.status !== 'success') return state;
            return {
              ...state,
              data: [...state.data, ...response.items],
              next_cursor: response.next_cursor,
              total_count: response.total_count,
            };
          });
        },
        error: () => {
          this.toast.show('admin.moderation.queue_load_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  onTypeFilter(value: string): void {
    this.filterType.set(value === '' ? null : value as FlaggedContentType);
    this.loadQueue();
  }

  onPriorityFilter(value: string): void {
    this.filterPriority.set(value === '' ? null : value as QueuePriority);
    this.loadQueue();
  }

  onSortChange(value: string): void {
    this.sortOrder.set(value as QueueSortOrder);
    this.loadQueue();
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  approveItem(item: FlaggedContentItem): void {
    this.actionInProgress.set(item.id);

    this.subscriptions.add(
      this.bff.post<void>(
        `${ACTION_PATH}/${encodeURIComponent(item.id)}/action`,
        { action: 'approve' as ModerationAction },
      ).subscribe({
        next: () => {
          this.actionInProgress.set(null);
          this.removeItemFromList(item.id);
          this.toast.show('admin.moderation.approved_success', 'success');
        },
        error: () => {
          this.actionInProgress.set(null);
          this.toast.show('admin.moderation.action_error', 'error');
        },
      }),
    );
  }

  openEditNotes(itemId: string): void {
    this.editNotesItemId.set(itemId);
    this.editNotesText.set('');
  }

  cancelEditNotes(): void {
    this.editNotesItemId.set(null);
    this.editNotesText.set('');
  }

  onEditNotesInput(value: string): void {
    this.editNotesText.set(value);
  }

  submitEditRequest(item: FlaggedContentItem): void {
    const notes = this.editNotesText().trim();
    if (!notes) return;

    this.actionInProgress.set(item.id);

    this.subscriptions.add(
      this.bff.post<void>(
        `${ACTION_PATH}/${encodeURIComponent(item.id)}/action`,
        { action: 'request_edit' as ModerationAction, notes },
      ).subscribe({
        next: () => {
          this.actionInProgress.set(null);
          this.editNotesItemId.set(null);
          this.editNotesText.set('');
          this.removeItemFromList(item.id);
          this.toast.show('admin.moderation.edit_requested_success', 'success');
        },
        error: () => {
          this.actionInProgress.set(null);
          this.toast.show('admin.moderation.action_error', 'error');
        },
      }),
    );
  }

  async removeItem(item: FlaggedContentItem): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'admin.moderation.remove_title',
      message: 'admin.moderation.remove_message',
      confirmText: 'admin.moderation.remove_confirm',
      variant: 'danger',
    });

    if (!confirmed) return;

    this.actionInProgress.set(item.id);

    this.subscriptions.add(
      this.bff.post<void>(
        `${ACTION_PATH}/${encodeURIComponent(item.id)}/action`,
        { action: 'remove' as ModerationAction },
      ).subscribe({
        next: () => {
          this.actionInProgress.set(null);
          this.removeItemFromList(item.id);
          this.toast.show('admin.moderation.removed_success', 'success');
        },
        error: () => {
          this.actionInProgress.set(null);
          this.toast.show('admin.moderation.action_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  getPriority(flagCount: number): QueuePriority {
    if (flagCount >= 5) return 'critical';
    if (flagCount >= 3) return 'high';
    return 'normal';
  }

  priorityClass(flagCount: number): string {
    return `moderation-queue__priority--${this.getPriority(flagCount)}`;
  }

  contentTypeClass(type: string): string {
    return `moderation-queue__content-type--${type}`;
  }

  isActionInProgress(itemId: string): boolean {
    return this.actionInProgress() === itemId;
  }

  isEditNotesOpen(itemId: string): boolean {
    return this.editNotesItemId() === itemId;
  }

  formatDateTime(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }

  private removeItemFromList(itemId: string): void {
    this._queueState.update((state) => {
      if (state.status !== 'success') return state;
      return {
        ...state,
        data: state.data.filter((item) => item.id !== itemId),
        total_count: Math.max(0, state.total_count - 1),
      };
    });
  }
}
