/**
 * ModerationQueueComponent — Content moderation dashboard for content managers.
 *
 * Route: /admin/moderation
 *
 * Features:
 *   - Queue of flagged content items (pending, reviewing, resolved, dismissed)
 *   - Filter by status, content type
 *   - Inline action dialog: approve, request edit, remove, restore
 *   - Reason/notes field for moderation action
 *   - Audit trail of moderation actions per content item
 *   - Status badges (color-coded)
 *   - Assign self as reviewer
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
import { ModerationService } from '../../services/moderation.service';
import { ModerationActionDialogComponent } from '../moderation-action-dialog/moderation-action-dialog.component';
import type {
  FlaggedContentItem,
  FlaggedContentStatus,
  FlaggedContentType,
  ModerationActionRequest,
  ModerationAuditEntry,
} from '../../models/moderation.model';
import {
  ALL_FLAGGED_CONTENT_STATUSES,
  ALL_FLAGGED_CONTENT_TYPES,
  FLAGGED_STATUS_LABELS,
  FLAGGED_CONTENT_TYPE_LABELS,
} from '../../models/moderation.model';

@Component({
  selector: 'chora-moderation-queue',
  standalone: true,
  imports: [FormsModule, TranslatePipe, ModerationActionDialogComponent],
  templateUrl: './moderation-queue.component.html',
  styleUrl: './moderation-queue.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationQueueComponent implements OnInit, OnDestroy {
  private readonly moderationService = inject(ModerationService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly items = signal<FlaggedContentItem[]>([]);
  readonly loading = signal(false);
  readonly totalCount = signal(0);

  // --- Selection ---
  readonly selectedItemId = signal<string | null>(null);
  readonly actionDialogOpen = signal(false);
  readonly actionSubmitting = signal(false);

  // --- Audit trail ---
  readonly auditTrail = signal<ModerationAuditEntry[]>([]);
  readonly auditLoading = signal(false);

  // --- Filters ---
  readonly filterStatus = signal<FlaggedContentStatus | null>(null);
  readonly filterContentType = signal<FlaggedContentType | null>(null);

  // --- Constants ---
  readonly allStatuses = ALL_FLAGGED_CONTENT_STATUSES;
  readonly allContentTypes = ALL_FLAGGED_CONTENT_TYPES;
  readonly statusLabels = FLAGGED_STATUS_LABELS;
  readonly contentTypeLabels = FLAGGED_CONTENT_TYPE_LABELS;

  // --- Computed ---
  readonly selectedItem = computed(() => {
    const id = this.selectedItemId();
    if (!id) return null;
    return this.items().find((i) => i.id === id) ?? null;
  });

  readonly isEmpty = computed(
    () => !this.loading() && this.items().length === 0,
  );

  readonly pendingCount = computed(
    () => this.items().filter((i) => i.status === 'pending').length,
  );

  readonly reviewingCount = computed(
    () => this.items().filter((i) => i.status === 'reviewing').length,
  );

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadItems();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadItems(): void {
    this.loading.set(true);

    this.subscriptions.add(
      this.moderationService.getFlaggedContent(
        this.filterStatus(),
        this.filterContentType(),
      ).subscribe({
        next: (response) => {
          this.items.set(response.data);
          this.totalCount.set(response.total);
          this.loading.set(false);
        },
        error: () => {
          this.toast.show('admin.moderation.load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  onStatusFilter(value: string): void {
    this.filterStatus.set(value === '' ? null : value as FlaggedContentStatus);
    this.loadItems();
  }

  onContentTypeFilter(value: string): void {
    this.filterContentType.set(value === '' ? null : value as FlaggedContentType);
    this.loadItems();
  }

  // -------------------------------------------------------------------------
  // Selection & Detail
  // -------------------------------------------------------------------------

  selectItem(id: string): void {
    if (this.selectedItemId() === id) {
      this.selectedItemId.set(null);
      this.auditTrail.set([]);
      this.actionDialogOpen.set(false);
      return;
    }

    this.selectedItemId.set(id);
    this.actionDialogOpen.set(false);
    this.loadAuditTrail(id);
  }

  private loadAuditTrail(flaggedContentId: string): void {
    this.auditLoading.set(true);

    this.subscriptions.add(
      this.moderationService.getAuditTrail(flaggedContentId).subscribe({
        next: (response) => {
          this.auditTrail.set(response.data);
          this.auditLoading.set(false);
        },
        error: () => {
          this.auditLoading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Assign to self
  // -------------------------------------------------------------------------

  assignToSelf(item: FlaggedContentItem): void {
    this.subscriptions.add(
      this.moderationService.assignToSelf(item.id).subscribe({
        next: (updated) => {
          this.items.update((items) =>
            items.map((i) => (i.id === updated.id ? updated : i)),
          );
          this.toast.show('admin.moderation.assigned', 'success');
        },
        error: () => {
          this.toast.show('admin.moderation.assign_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Action Dialog
  // -------------------------------------------------------------------------

  openActionDialog(): void {
    this.actionDialogOpen.set(true);
  }

  closeActionDialog(): void {
    this.actionDialogOpen.set(false);
  }

  onActionSubmit(action: ModerationActionRequest): void {
    const itemId = this.selectedItemId();
    if (!itemId) return;

    this.actionSubmitting.set(true);

    this.subscriptions.add(
      this.moderationService.submitAction(itemId, action).subscribe({
        next: (updated) => {
          this.items.update((items) =>
            items.map((i) => (i.id === updated.id ? updated : i)),
          );
          this.actionSubmitting.set(false);
          this.actionDialogOpen.set(false);
          this.toast.show('admin.moderation.action_submitted', 'success');
          this.loadAuditTrail(itemId);
        },
        error: () => {
          this.actionSubmitting.set(false);
          this.toast.show('admin.moderation.action_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  isSelected(id: string): boolean {
    return this.selectedItemId() === id;
  }

  statusBadgeClass(status: FlaggedContentStatus): string {
    return `moderation-queue__badge--${status}`;
  }

  canTakeAction(item: FlaggedContentItem): boolean {
    return item.status === 'pending' || item.status === 'reviewing';
  }

  canAssign(item: FlaggedContentItem): boolean {
    return item.status === 'pending' && !item.assigned_moderator_gcid;
  }

  formatDateTime(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }
}
