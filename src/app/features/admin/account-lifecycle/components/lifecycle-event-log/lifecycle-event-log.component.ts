/**
 * LifecycleEventLogComponent — Immutable audit trail viewer for account events.
 *
 * Route: /admin/accounts/:gcid/events
 *
 * Features:
 *   - Chronological event timeline
 *   - Event type badges (color-coded)
 *   - Actor identification (admin / system / user)
 *   - Reason display for suspension/close events
 *   - Pagination for long histories
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
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { AccountLifecycleService } from '../../services/account-lifecycle.service';
import type { LifecycleEvent, LifecycleEventType } from '../../models/account-lifecycle.model';
import { LIFECYCLE_EVENT_LABELS } from '../../models/account-lifecycle.model';

@Component({
  selector: 'chora-lifecycle-event-log',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './lifecycle-event-log.component.html',
  styleUrl: './lifecycle-event-log.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LifecycleEventLogComponent implements OnInit, OnDestroy {
  private readonly accountService = inject(AccountLifecycleService);
  private readonly toast = inject(ToastService);

  /** Route param: the GCID of the account to view events for. */
  readonly gcid = input.required<string>();

  // --- State ---
  readonly events = signal<LifecycleEvent[]>([]);
  readonly loading = signal(false);
  readonly totalEvents = signal(0);
  readonly currentPage = signal(1);
  readonly pageSize = signal(50);

  // --- Constants ---
  readonly eventLabels = LIFECYCLE_EVENT_LABELS;

  // --- Computed ---
  readonly isEmpty = computed(
    () => !this.loading() && this.events().length === 0,
  );

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalEvents() / this.pageSize())),
  );

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadEvents();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadEvents(): void {
    this.loading.set(true);

    this.subscriptions.add(
      this.accountService.getLifecycleEvents(this.gcid(), this.currentPage(), this.pageSize()).subscribe({
        next: (response) => {
          this.events.set(response.events);
          this.totalEvents.set(response.total);
          this.loading.set(false);
        },
        error: () => {
          this.toast.show('admin.account_lifecycle.events_load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
    this.loadEvents();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  eventTypeClass(eventType: LifecycleEventType): string {
    return `lifecycle-event-log__event-badge--${eventType}`;
  }

  actorTypeClass(actorType: string): string {
    return `lifecycle-event-log__actor--${actorType}`;
  }

  formatDateTime(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }

  getEventLabel(eventType: LifecycleEventType): string {
    return this.eventLabels[eventType] ?? eventType;
  }
}
