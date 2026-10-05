/**
 * TicketListComponent — Lists the user's support tickets with status and priority filters.
 *
 * Route: /support/tickets
 *
 * Features:
 *   - Paginated ticket list with cursor-based navigation
 *   - Status filter (open, in_progress, resolved, closed)
 *   - Priority filter (low, medium, high, critical)
 *   - Status badges with color coding
 *   - Navigation to ticket detail and create views
 *   - Empty state for no tickets
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
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { SupportService } from '../../services/support.service';
import {
  ALL_TICKET_STATUSES,
  ALL_TICKET_PRIORITIES,
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
} from '../../models/support.model';
import type { TicketStatus, TicketPriority } from '../../models/support.model';

@Component({
  selector: 'chora-ticket-list',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './ticket-list.component.html',
  styleUrl: './ticket-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketListComponent implements OnInit, OnDestroy {
  private readonly supportService = inject(SupportService);
  private readonly router = inject(Router);

  // --- State ---
  readonly ticketListState = this.supportService.ticketListState;
  readonly tickets = this.supportService.tickets;
  readonly pageInfo = this.supportService.ticketPageInfo;

  // --- Filters ---
  readonly selectedStatus = signal<TicketStatus | null>(null);
  readonly selectedPriority = signal<TicketPriority | null>(null);

  // --- Constants ---
  readonly allStatuses = ALL_TICKET_STATUSES;
  readonly allPriorities = ALL_TICKET_PRIORITIES;
  readonly statusLabels = TICKET_STATUS_LABELS;
  readonly priorityLabels = TICKET_PRIORITY_LABELS;

  // --- Computed ---
  readonly hasMore = computed(() => this.pageInfo()?.has_next ?? false);

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadTickets();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  filterByStatus(status: TicketStatus | null): void {
    this.selectedStatus.set(status);
    this.loadTickets();
  }

  filterByPriority(priority: TicketPriority | null): void {
    this.selectedPriority.set(priority);
    this.loadTickets();
  }

  loadMore(): void {
    const cursor = this.pageInfo()?.next_cursor ?? undefined;
    if (!cursor) return;
    this.subscriptions.add(
      this.supportService.loadTickets({
        status: this.selectedStatus() ?? undefined,
        priority: this.selectedPriority() ?? undefined,
        cursor,
      }).subscribe(),
    );
  }

  navigateToTicket(ticketId: string): void {
    this.router.navigate(['/support', 'tickets', ticketId]);
  }

  navigateToCreate(): void {
    this.router.navigate(['/support', 'tickets', 'new']);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  statusClass(status: string): string {
    return `ticket-list__status--${status}`;
  }

  priorityClass(priority: string): string {
    return `ticket-list__priority--${priority}`;
  }

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }

  trackByTicketId(_index: number, ticket: { id: string }): string {
    return ticket.id;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private loadTickets(): void {
    this.subscriptions.add(
      this.supportService.loadTickets({
        status: this.selectedStatus() ?? undefined,
        priority: this.selectedPriority() ?? undefined,
      }).subscribe(),
    );
  }
}
