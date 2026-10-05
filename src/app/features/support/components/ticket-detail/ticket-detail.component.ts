/**
 * TicketDetailComponent — Single ticket view with message thread and reply form.
 *
 * Route: /support/tickets/:ticketId
 *
 * Features:
 *   - Full ticket detail (subject, description, status, priority, category)
 *   - Chronological message thread (responses)
 *   - Reply form with text input
 *   - Status transition actions (resolve, close, reopen)
 *   - Link to satisfaction survey when resolved
 *   - Internal note indicator for agent responses
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  input,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { SupportService } from '../../services/support.service';
import { TICKET_STATUS_LABELS, TICKET_PRIORITY_LABELS } from '../../models/support.model';

@Component({
  selector: 'chora-ticket-detail',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './ticket-detail.component.html',
  styleUrl: './ticket-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketDetailComponent implements OnInit, OnDestroy {
  private readonly supportService = inject(SupportService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  // --- Route param ---
  readonly ticketId = input.required<string>();

  // --- State ---
  readonly ticketDetailState = this.supportService.ticketDetailState;
  readonly ticket = this.supportService.ticketDetail;

  // --- Local state ---
  readonly replyBody = signal('');
  readonly isSubmittingReply = signal(false);

  // --- Constants ---
  readonly statusLabels = TICKET_STATUS_LABELS;
  readonly priorityLabels = TICKET_PRIORITY_LABELS;

  // --- Computed ---
  readonly responses = computed(() => this.ticket()?.responses ?? []);

  readonly canReply = computed(() => {
    const t = this.ticket();
    if (!t) return false;
    return t.status !== 'closed';
  });

  readonly canResolve = computed(() => {
    const t = this.ticket();
    return t?.status === 'in_progress' || t?.status === 'open';
  });

  readonly canClose = computed(() => {
    const t = this.ticket();
    return t?.status === 'resolved';
  });

  readonly canReopen = computed(() => {
    const t = this.ticket();
    return t?.status === 'resolved' || t?.status === 'closed';
  });

  readonly showSatisfactionLink = computed(() => {
    const t = this.ticket();
    return t?.status === 'resolved' && !t?.satisfaction;
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.supportService.loadTicketDetail(this.ticketId()).subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  onReplyInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.replyBody.set(target.value);
  }

  submitReply(): void {
    const body = this.replyBody().trim();
    if (!body) return;

    this.isSubmittingReply.set(true);

    this.subscriptions.add(
      this.supportService.respondToTicket(this.ticketId(), { body }).subscribe({
        next: (result) => {
          this.isSubmittingReply.set(false);
          if (result) {
            this.replyBody.set('');
            this.toast.show('support.reply_sent', 'success');
          }
        },
        error: () => {
          this.isSubmittingReply.set(false);
          this.toast.show('support.reply_error', 'error');
        },
      }),
    );
  }

  resolveTicket(): void {
    this.subscriptions.add(
      this.supportService.updateTicketStatus(this.ticketId(), 'resolved').subscribe({
        next: (result) => {
          if (result) this.toast.show('support.ticket_resolved', 'success');
        },
      }),
    );
  }

  closeTicket(): void {
    this.subscriptions.add(
      this.supportService.updateTicketStatus(this.ticketId(), 'closed').subscribe({
        next: (result) => {
          if (result) this.toast.show('support.ticket_closed', 'success');
        },
      }),
    );
  }

  reopenTicket(): void {
    this.subscriptions.add(
      this.supportService.updateTicketStatus(this.ticketId(), 'open').subscribe({
        next: (result) => {
          if (result) this.toast.show('support.ticket_reopened', 'success');
        },
      }),
    );
  }

  navigateToSurvey(): void {
    this.router.navigate(['/support', 'satisfaction', this.ticketId()]);
  }

  navigateBack(): void {
    this.router.navigate(['/support', 'tickets']);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  statusClass(status: string): string {
    return `ticket-detail__status--${status}`;
  }

  priorityClass(priority: string): string {
    return `ticket-detail__priority--${priority}`;
  }

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }

  trackByResponseId(_index: number, response: { id: string }): string {
    return response.id;
  }
}
