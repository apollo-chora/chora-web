/**
 * TicketCreateComponent — New support ticket form.
 *
 * Route: /support/tickets/new
 *
 * Features:
 *   - Category select dropdown
 *   - Priority select dropdown
 *   - Subject text input
 *   - Description textarea
 *   - File attachment area (placeholder)
 *   - Submit with validation and feedback
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SupportService } from '../../services/support.service';
import {
  ALL_TICKET_CATEGORIES,
  ALL_TICKET_PRIORITIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITY_LABELS,
  type TicketCategory,
  type TicketPriority,
} from '../../models/support.model';

@Component({
  selector: 'chora-ticket-create',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './ticket-create.component.html',
  styleUrl: './ticket-create.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketCreateComponent {
  private readonly supportService = inject(SupportService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  // --- Local state ---
  readonly subject = signal('');
  readonly description = signal('');
  readonly category = signal<TicketCategory>('general');
  readonly priority = signal<TicketPriority>('medium');
  readonly submitting = signal(false);
  readonly attachments = signal<File[]>([]);

  // --- Constants ---
  readonly allCategories = ALL_TICKET_CATEGORIES;
  readonly allPriorities = ALL_TICKET_PRIORITIES;
  readonly categoryLabels = TICKET_CATEGORY_LABELS;
  readonly priorityLabels = TICKET_PRIORITY_LABELS;

  // --- Computed ---
  readonly isValid = computed(() => {
    return this.subject().trim().length > 0 && this.category() !== null;
  });

  readonly canSubmit = computed(() => this.isValid() && !this.submitting());

  readonly attachmentCount = computed(() => this.attachments().length);

  private subscriptions = new Subscription();

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  updateSubject(value: string): void {
    this.subject.set(value);
  }

  updateDescription(value: string): void {
    this.description.set(value);
  }

  updateCategory(value: string): void {
    this.category.set(value as TicketCategory);
  }

  updatePriority(value: string): void {
    this.priority.set(value as TicketPriority);
  }

  addAttachments(files: FileList | null): void {
    if (!files) return;
    const current = this.attachments();
    const newFiles = Array.from(files);
    this.attachments.set([...current, ...newFiles]);
  }

  removeAttachment(index: number): void {
    const current = this.attachments();
    this.attachments.set(current.filter((_, i) => i !== index));
  }

  submit(): void {
    if (!this.canSubmit()) return;

    this.submitting.set(true);

    this.subscriptions.add(
      this.supportService.createTicket({
        subject: this.subject().trim(),
        description: this.description().trim() || undefined,
        category: this.category(),
        priority: this.priority(),
      }).subscribe({
        next: (ticket) => {
          this.submitting.set(false);
          if (ticket) {
            this.toast.show('support.ticket_created', 'success');
            this.router.navigate(['/support', 'tickets', ticket.id]);
          }
        },
        error: () => {
          this.submitting.set(false);
          this.toast.show('support.ticket_create_error', 'error');
        },
      }),
    );
  }

  cancel(): void {
    this.router.navigate(['/support', 'tickets']);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  trackAttachment(_index: number, file: File): string {
    return `${file.name}-${file.size}`;
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
