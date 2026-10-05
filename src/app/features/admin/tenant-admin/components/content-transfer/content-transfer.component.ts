/**
 * ContentTransferComponent — 3-step wizard for transferring content ownership.
 *
 * Steps:
 *   1. Select Content — multi-select list with search/filter
 *   2. Choose Recipient — search by name/email, recipient card
 *   3. Confirm Transfer — summary + consent notification warning
 *
 * Emits (transferred) event on successful transfer.
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { BffClientService } from '../../../../../core/services/bff-client.service';

// ---------------------------------------------------------------------------
// Component-specific types
// ---------------------------------------------------------------------------

export type ContentType = 'atom' | 'topic' | 'path';

export interface TransferableContent {
  id: string;
  title: string;
  content_type: ContentType;
  created_at: string;
}

export interface TransferRecipient {
  gcid: string;
  display_name: string;
  email: string;
  role: string;
  is_active: boolean;
}

export interface ContentTransferRequest {
  id: string;
  content_ids: string[];
  source_gcid: string;
  target_gcid: string;
  status: string;
  created_at: string;
}

export type WizardStep = 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTENT_PATH = '/api/v1/content/authored';
const USERS_SEARCH_PATH = '/api/v1/tenants/members/search';
const TRANSFER_PATH = '/api/v1/content/transfer';

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'content_transfer.step_select',
  2: 'content_transfer.step_recipient',
  3: 'content_transfer.step_confirm',
};

const CONTENT_TYPE_ICONS: Record<ContentType, string> = {
  atom: 'science',
  topic: 'category',
  path: 'route',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@Component({
  selector: 'chora-content-transfer',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './content-transfer.component.html',
  styleUrl: './content-transfer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentTransferComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);
  private readonly toast = inject(ToastService);

  /** Emitted when a transfer is successfully created. */
  readonly transferred = output<ContentTransferRequest>();

  // --- Constants exposed to template ---
  readonly stepLabels = STEP_LABELS;
  readonly contentTypeIcons = CONTENT_TYPE_ICONS;
  readonly allSteps: WizardStep[] = [1, 2, 3];

  // --- Step state ---
  readonly step = signal<WizardStep>(1);

  // --- Step 1: Select Content ---
  readonly contentItems = signal<TransferableContent[]>([]);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly contentSearchQuery = signal('');
  readonly contentTypeFilter = signal<ContentType | ''>('');
  readonly loadingContent = signal(false);

  readonly filteredContent = computed(() => {
    let items = this.contentItems();
    const query = this.contentSearchQuery().toLowerCase().trim();
    const typeFilter = this.contentTypeFilter();

    if (query) {
      items = items.filter((item) =>
        item.title.toLowerCase().includes(query),
      );
    }

    if (typeFilter) {
      items = items.filter((item) => item.content_type === typeFilter);
    }

    return items;
  });

  readonly selectedCount = computed(() => this.selectedIds().size);
  readonly hasSelection = computed(() => this.selectedCount() > 0);

  readonly selectedItems = computed(() => {
    const ids = this.selectedIds();
    return this.contentItems().filter((item) => ids.has(item.id));
  });

  // --- Step 2: Choose Recipient ---
  readonly recipientSearchQuery = signal('');
  readonly searchResults = signal<TransferRecipient[]>([]);
  readonly selectedRecipient = signal<TransferRecipient | null>(null);
  readonly searchingUsers = signal(false);

  readonly hasRecipient = computed(() => this.selectedRecipient() !== null);

  // --- Step 3: Confirm ---
  readonly submitting = signal(false);

  // --- Navigation computed ---
  readonly canGoNext = computed(() => {
    const currentStep = this.step();
    switch (currentStep) {
      case 1: return this.hasSelection();
      case 2: return this.hasRecipient();
      case 3: return false;
      default: return false;
    }
  });

  readonly canGoBack = computed(() => this.step() > 1);
  readonly isLastStep = computed(() => this.step() === 3);

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadAuthoredContent();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadAuthoredContent(): void {
    this.loadingContent.set(true);
    this.subscriptions.add(
      this.bff.get<{ data: TransferableContent[] }>(CONTENT_PATH).subscribe({
        next: (response) => {
          this.contentItems.set(response.data);
          this.loadingContent.set(false);
        },
        error: () => {
          this.loadingContent.set(false);
          this.toast.show('content_transfer.load_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Step navigation
  // -------------------------------------------------------------------------

  nextStep(): void {
    const current = this.step();
    if (current < 3 && this.canGoNext()) {
      this.step.set((current + 1) as WizardStep);
    }
  }

  previousStep(): void {
    const current = this.step();
    if (current > 1) {
      this.step.set((current - 1) as WizardStep);
    }
  }

  // -------------------------------------------------------------------------
  // Step 1: Content selection
  // -------------------------------------------------------------------------

  onContentSearch(value: string): void {
    this.contentSearchQuery.set(value);
  }

  onContentTypeFilter(value: string): void {
    this.contentTypeFilter.set(value as ContentType | '');
  }

  toggleItem(id: string): void {
    this.selectedIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  selectAll(): void {
    const allIds = new Set(this.filteredContent().map((item) => item.id));
    this.selectedIds.update((current) => {
      const next = new Set(current);
      for (const id of allIds) {
        next.add(id);
      }
      return next;
    });
  }

  deselectAll(): void {
    this.selectedIds.set(new Set());
  }

  // -------------------------------------------------------------------------
  // Step 2: Recipient search
  // -------------------------------------------------------------------------

  onRecipientSearch(value: string): void {
    this.recipientSearchQuery.set(value);

    if (value.trim().length < 2) {
      this.searchResults.set([]);
      return;
    }

    this.searchingUsers.set(true);
    this.subscriptions.add(
      this.bff.get<{ data: TransferRecipient[] }>(
        `${USERS_SEARCH_PATH}?q=${encodeURIComponent(value.trim())}`,
      ).subscribe({
        next: (response) => {
          // Only show active users
          this.searchResults.set(
            response.data.filter((u) => u.is_active),
          );
          this.searchingUsers.set(false);
        },
        error: () => {
          this.searchResults.set([]);
          this.searchingUsers.set(false);
        },
      }),
    );
  }

  selectRecipient(recipient: TransferRecipient): void {
    this.selectedRecipient.set(recipient);
    this.searchResults.set([]);
    this.recipientSearchQuery.set('');
  }

  clearRecipient(): void {
    this.selectedRecipient.set(null);
  }

  // -------------------------------------------------------------------------
  // Step 3: Confirm & submit
  // -------------------------------------------------------------------------

  confirmTransfer(): void {
    const recipient = this.selectedRecipient();
    if (!recipient || this.selectedCount() === 0) return;

    this.submitting.set(true);

    const payload = {
      content_ids: Array.from(this.selectedIds()),
      target_gcid: recipient.gcid,
    };

    this.subscriptions.add(
      this.bff.post<ContentTransferRequest>(TRANSFER_PATH, payload).subscribe({
        next: (result) => {
          this.submitting.set(false);
          this.toast.show('content_transfer.success', 'success');
          this.transferred.emit(result);
        },
        error: () => {
          this.submitting.set(false);
          this.toast.show('content_transfer.error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  contentTypeLabel(type: ContentType): string {
    return `content_transfer.type_${type}`;
  }

  contentTypeIcon(type: ContentType): string {
    return CONTENT_TYPE_ICONS[type] ?? 'description';
  }
}
