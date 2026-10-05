/**
 * NotificationArchiveComponent — full-page notification history.
 *
 * Features:
 * - Search by keyword (title + body)
 * - Date range filter (start/end date pickers)
 * - Category filter (multi-select from 7 categories)
 * - Priority filter
 * - CSV export for compliance
 * - Cursor-based pagination (20 per page)
 */
import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HttpParams } from '@angular/common/http';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import type {
  NotificationDelivery,
  NotificationCategory,
  NotificationPriority,
  PaginatedNotifications,
} from '../../../../core/realtime/notification.model';

const ARCHIVE_PATH = '/api/v1/notifications/archive';
const PAGE_SIZE = 20;

const ALL_CATEGORIES: NotificationCategory[] = [
  'engagement', 'assessment', 'social', 'training', 'gamification', 'account', 'system',
];

const ALL_PRIORITIES: NotificationPriority[] = ['critical', 'high', 'normal', 'low'];

@Component({
  selector: 'chora-notification-archive',
  imports: [FormsModule, DatePipe, TranslatePipe],
  templateUrl: './notification-archive.component.html',
  styleUrl: './notification-archive.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationArchiveComponent implements OnInit {
  private readonly bff = inject(BffClientService);

  readonly allCategories = ALL_CATEGORIES;
  readonly allPriorities = ALL_PRIORITIES;

  readonly searchQuery = signal('');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly selectedCategory = signal<NotificationCategory | ''>('');
  readonly selectedPriority = signal<NotificationPriority | ''>('');

  readonly notifications = signal<NotificationDelivery[]>([]);
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly nextCursor = signal<string | null>(null);
  readonly hasMore = computed(() => this.nextCursor() !== null);
  readonly isEmpty = computed(() => !this.loading() && this.notifications().length === 0);

  ngOnInit(): void {
    this.search();
  }

  search(): void {
    this.notifications.set([]);
    this.nextCursor.set(null);
    this.loadPage();
  }

  loadMore(): void {
    if (!this.hasMore() || this.loading()) return;
    this.loadPage();
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
  }

  onDateFromChange(value: string): void {
    this.dateFrom.set(value);
  }

  onDateToChange(value: string): void {
    this.dateTo.set(value);
  }

  onCategoryChange(value: string): void {
    this.selectedCategory.set(value as NotificationCategory | '');
  }

  onPriorityChange(value: string): void {
    this.selectedPriority.set(value as NotificationPriority | '');
  }

  exportCsv(): void {
    this.exporting.set(true);
    const params = this.buildParams(null, 1000);

    this.bff.get<PaginatedNotifications>(ARCHIVE_PATH, params).subscribe({
      next: (response) => {
        this.downloadCsv(response.items);
        this.exporting.set(false);
      },
      error: () => {
        this.exporting.set(false);
      },
    });
  }

  trackById(_index: number, item: NotificationDelivery): string {
    return item.id;
  }

  private loadPage(): void {
    this.loading.set(true);
    const params = this.buildParams(this.nextCursor(), PAGE_SIZE);

    this.bff.get<PaginatedNotifications>(ARCHIVE_PATH, params).subscribe({
      next: (response) => {
        this.notifications.update((existing) => [...existing, ...response.items]);
        this.nextCursor.set(response.next_cursor);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  private buildParams(cursor: string | null, limit: number): HttpParams {
    let params = new HttpParams().set('limit', limit.toString());
    if (cursor) params = params.set('cursor', cursor);
    if (this.searchQuery()) params = params.set('q', this.searchQuery());
    if (this.dateFrom()) params = params.set('from', this.dateFrom());
    if (this.dateTo()) params = params.set('to', this.dateTo());
    if (this.selectedCategory()) params = params.set('category', this.selectedCategory());
    if (this.selectedPriority()) params = params.set('priority', this.selectedPriority());
    return params;
  }

  private downloadCsv(items: NotificationDelivery[]): void {
    const headers = ['ID', 'Title', 'Body', 'Priority', 'Category', 'Status', 'Read', 'Created At'];
    const rows = items.map((n) => [
      n.id,
      this.escapeCsv(n.title),
      this.escapeCsv(n.body),
      n.priority,
      n.category,
      n.status,
      n.is_read ? 'Yes' : 'No',
      n.created_at,
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `notification-history-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
