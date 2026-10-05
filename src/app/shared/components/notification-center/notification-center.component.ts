/**
 * NotificationCenterComponent — dropdown/slide-over notification panel.
 *
 * Features:
 * - Chronological list with read/unread highlighting
 * - Filter tabs: All, Unread, Actionable, Mentions
 * - Pin/unpin important notifications
 * - Inline action buttons (accept/decline/approve/reject/claim/escalate)
 * - Lazy-loaded paginated list with cursor pagination
 * - Notification storm batching (50+ → summary)
 * - Empty state per filter tab
 */
import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NotificationService } from '../../../core/realtime/notification.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import type { NotificationDelivery, NotificationFilterTab } from '../../../core/realtime/notification.model';

interface TabConfig {
  key: NotificationFilterTab;
  labelKey: string;
}

const TABS: TabConfig[] = [
  { key: 'all', labelKey: 'notifications.tab_all' },
  { key: 'unread', labelKey: 'notifications.tab_unread' },
  { key: 'actionable', labelKey: 'notifications.tab_actionable' },
  { key: 'mentions', labelKey: 'notifications.tab_mentions' },
];

const PRIORITY_ICON_MAP: Record<string, string> = {
  critical: '!!',
  high: '!',
  normal: '',
  low: '',
};

@Component({
  selector: 'chora-notification-center',
  imports: [DatePipe, TranslatePipe],
  templateUrl: './notification-center.component.html',
  styleUrl: './notification-center.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationCenterComponent {
  readonly notificationService = inject(NotificationService);

  readonly tabs = TABS;
  readonly activeTab = this.notificationService.activeTab;
  readonly notifications = this.notificationService.filteredNotifications;
  readonly loading = this.notificationService.loading;
  readonly hasMore = this.notificationService.hasMore;

  readonly isEmpty = computed(() => !this.loading() && this.notifications().length === 0);

  onTabChange(tab: NotificationFilterTab): void {
    this.notificationService.setActiveTab(tab);
  }

  onMarkRead(notification: NotificationDelivery, event: Event): void {
    event.stopPropagation();
    if (notification.is_read) {
      this.notificationService.markAsUnread(notification.id);
    } else {
      this.notificationService.markAsRead(notification.id);
    }
  }

  // Clicking/opening a notification marks it read (the dot button + inline
  // actions stopPropagation, so they don't trigger this). Idempotent: a no-op
  // when the notification is already read.
  onItemClick(notification: NotificationDelivery): void {
    if (!notification.is_read) {
      this.notificationService.markAsRead(notification.id);
    }
  }

  onTogglePin(notification: NotificationDelivery, event: Event): void {
    event.stopPropagation();
    this.notificationService.togglePin(notification.id);
  }

  onAction(notification: NotificationDelivery, action: string, event: Event): void {
    event.stopPropagation();
    this.notificationService.executeAction(notification.id, action);
  }

  onLoadMore(): void {
    this.notificationService.loadMore();
  }

  priorityIndicator(priority: string): string {
    return PRIORITY_ICON_MAP[priority] ?? '';
  }

  trackById(_index: number, item: NotificationDelivery): string {
    return item.id;
  }

  isExpired(notification: NotificationDelivery): boolean {
    if (!notification.expires_at) return false;
    return new Date(notification.expires_at) < new Date();
  }
}
