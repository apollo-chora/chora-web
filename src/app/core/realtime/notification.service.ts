/**
 * NotificationService — learner-facing notification operations.
 *
 * Manages unread count, notification list, mark-read, pin/unpin,
 * and integrates with the learner-scoped realtime SSE channel (ADR-183,
 * RealtimeChannelService) for push. Falls back to a single visibility-aware
 * REST poll (30s) when the channel is not connected (flag off / BE down).
 * The poll is gated per-tick on auth + channel-state + tab visibility.
 *
 * Source of truth: chora-contracts/openapi/notifications-admin.yaml
 */
import { Injectable, inject, signal, computed, DestroyRef, OnDestroy } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { debounceTime, interval } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../../environments/environment';
import { BffClientService } from '../services/bff-client.service';
import { RealtimeChannelService } from './realtime-channel.service';
import { AuthService } from '../auth/auth.service';
import type {
  NotificationDelivery,
  NotificationFilterTab,
  NotificationListParams,
  PaginatedNotifications,
} from './notification.model';

const NOTIFICATIONS_PATH = '/api/v1/notifications';
// REST poll fallback cadence (30s) — visibility-gated, and skipped entirely
// while the realtime channel is connected (push covers freshness).
export const SSE_POLL_INTERVAL_MS = 30_000;
const DEFAULT_PAGE_SIZE = 20;

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  private readonly bff = inject(BffClientService);
  private readonly realtime = inject(RealtimeChannelService);
  private readonly authService = inject(AuthService);

  private readonly destroyRef = inject(DestroyRef);
  private lastPollTimestamp: string | null = null;
  private pollStarted = false;
  private initialLoadDone = false;

  // --- Writable state ---
  private readonly _notifications = signal<NotificationDelivery[]>([]);
  private readonly _unreadCount = signal(0);
  private readonly _loading = signal(false);
  private readonly _nextCursor = signal<string | null>(null);
  private readonly _activeTab = signal<NotificationFilterTab>('all');
  private readonly _isOpen = signal(false);

  // --- Public readonly signals ---
  readonly notifications = this._notifications.asReadonly();
  readonly unreadCount = this._unreadCount.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly hasMore = computed(() => this._nextCursor() !== null);
  readonly activeTab = this._activeTab.asReadonly();
  readonly isOpen = this._isOpen.asReadonly();
  readonly connectionState = this.realtime.connectionState;

  // --- Filtered views ---
  readonly filteredNotifications = computed(() => {
    const all = this._notifications();
    const tab = this._activeTab();
    switch (tab) {
      case 'unread':
        return all.filter((n) => !n.is_read);
      case 'actionable':
        return all.filter((n) => n.action_type !== null && !n.action_responded);
      case 'mentions':
        return all.filter((n) => n.category === 'social');
      default:
        return all;
    }
  });

  constructor() {
    // Realtime push: a notification.created frame carries only
    // {notification_id, kind, title} (ADR-183 envelopes are signals, not
    // rows) — pull the authoritative delta instead of trusting the frame.
    // Debounced so a burst of frames costs one GET.
    this.realtime.notificationCreated$
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.pollNow());

    // Reconnects can have missed frames (at-most-once delivery + the 3600s
    // stream cap) — full reconcile via the authoritative list.
    this.realtime.reconnected$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadInitial());

    // NOTE: polling is intentionally NOT started here. A single
    // source-of-truth interval is built lazily on initialize() (see
    // ensurePollingStarted) and gated per-tick on auth + WS-state +
    // tab-visibility. The previous connectionState `effect` that spun up the
    // poll was removed — it (a) ran a 10s interval, (b) never restarted after
    // a same-value 'disconnected' re-set (an effect only re-runs on a value
    // change), and (c) kept hitting the API on a backgrounded tab.
  }

  initialize(): void {
    if (!this.authService.user()) return;

    if (environment.realtimeEnabled) {
      this.realtime.connect();
    }
    this.ensurePollingStarted();
    // Immediate first load (and immediate refresh on re-login) without waiting
    // for the next interval tick.
    this.pollTick();
  }

  teardown(): void {
    // The channel is learner-scoped — close it with the session so a
    // logged-out tab doesn't 401-loop the ticket mint.
    this.realtime.disconnect();
    // The poll interval lives for the service (app) lifetime via
    // takeUntilDestroyed; it is gated to a no-op while there is no user.
    // Resetting initialLoadDone makes a subsequent login re-fetch the full
    // list rather than only incremental `since` deltas.
    this.initialLoadDone = false;
    this._notifications.set([]);
    this._unreadCount.set(0);
    this._nextCursor.set(null);
    this._isOpen.set(false);
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  // --- Panel toggle ---

  togglePanel(): void {
    this._isOpen.update((open) => !open);
    if (this._isOpen() && this._notifications().length === 0) {
      this.loadInitial();
    }
  }

  closePanel(): void {
    this._isOpen.set(false);
  }

  // --- Tab selection ---

  setActiveTab(tab: NotificationFilterTab): void {
    this._activeTab.set(tab);
  }

  // --- Data loading ---

  loadInitial(): void {
    this._loading.set(true);
    const params = this.buildParams({ limit: DEFAULT_PAGE_SIZE });

    this.bff.get<PaginatedNotifications>(NOTIFICATIONS_PATH, params).subscribe({
      next: (response) => {
        this._notifications.set(response.items);
        this._unreadCount.set(response.total_unread);
        this._nextCursor.set(response.next_cursor);
        this._loading.set(false);
        this.initialLoadDone = true;
      },
      error: () => {
        this._loading.set(false);
      },
    });
  }

  loadMore(): void {
    const cursor = this._nextCursor();
    if (!cursor || this._loading()) return;

    this._loading.set(true);
    const params = this.buildParams({ cursor, limit: DEFAULT_PAGE_SIZE });

    this.bff.get<PaginatedNotifications>(NOTIFICATIONS_PATH, params).subscribe({
      next: (response) => {
        this._notifications.update((existing) => [...existing, ...response.items]);
        this._nextCursor.set(response.next_cursor);
        this._loading.set(false);
      },
      error: () => {
        this._loading.set(false);
      },
    });
  }

  // --- Actions ---

  markAsRead(notificationId: string): void {
    this.bff.post<void>(`${NOTIFICATIONS_PATH}/mark-read`, { notification_id: notificationId, read: true }).subscribe({
      next: () => {
        this._notifications.update((list) =>
          list.map((n) => (n.id === notificationId ? { ...n, is_read: true, status: 'read' as const } : n)),
        );
        this._unreadCount.update((c) => Math.max(0, c - 1));
      },
    });
  }

  markAsUnread(notificationId: string): void {
    this.bff.post<void>(`${NOTIFICATIONS_PATH}/mark-read`, { notification_id: notificationId, read: false }).subscribe({
      next: () => {
        this._notifications.update((list) =>
          list.map((n) => (n.id === notificationId ? { ...n, is_read: false, status: 'delivered' as const } : n)),
        );
        this._unreadCount.update((c) => c + 1);
      },
    });
  }

  togglePin(notificationId: string): void {
    const notification = this._notifications().find((n) => n.id === notificationId);
    if (!notification) return;

    const newPinned = !notification.is_pinned;
    this._notifications.update((list) =>
      list.map((n) => (n.id === notificationId ? { ...n, is_pinned: newPinned } : n)),
    );

    this.bff.patch<void>(`${NOTIFICATIONS_PATH}/${encodeURIComponent(notificationId)}`, { is_pinned: newPinned }).subscribe({
      error: () => {
        this._notifications.update((list) =>
          list.map((n) => (n.id === notificationId ? { ...n, is_pinned: !newPinned } : n)),
        );
      },
    });
  }

  executeAction(notificationId: string, action: string): void {
    this._notifications.update((list) =>
      list.map((n) => (n.id === notificationId ? { ...n, action_responded: true } : n)),
    );

    this.bff.post<void>(`${NOTIFICATIONS_PATH}/${encodeURIComponent(notificationId)}/action`, { action }).subscribe({
      error: () => {
        this._notifications.update((list) =>
          list.map((n) => (n.id === notificationId ? { ...n, action_responded: false } : n)),
        );
      },
    });
  }

  private prependNotification(notification: NotificationDelivery): void {
    this._notifications.update((list) => {
      const exists = list.some((n) => n.id === notification.id);
      if (exists) return list;
      return [notification, ...list];
    });
    if (!notification.is_read) {
      this._unreadCount.update((c) => c + 1);
    }
  }

  // --- Visibility-aware REST poll fallback (single source of truth) ---
  //
  // ONE interval (SSE_POLL_INTERVAL_MS) drives every background refresh.
  // Each tick is gated in pollTick(): skipped when there is no user, when the
  // realtime channel is connected (push covers it), or when the tab is hidden.
  // Mirrors GovernanceService.buildPolled (interval + takeUntilDestroyed) and
  // the classroom visibilityAwareSnapshotStream (visibilitychange) patterns.

  private ensurePollingStarted(): void {
    if (this.pollStarted) return;
    this.pollStarted = true;

    interval(SSE_POLL_INTERVAL_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.pollTick());

    // Immediate catch-up when the user returns to a backgrounded tab, so the
    // hidden-tab gap doesn't wait up to one full interval to refresh.
    if (typeof document !== 'undefined') {
      const onVisibilityChange = (): void => {
        if (document.visibilityState === 'visible') this.pollTick();
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
      this.destroyRef.onDestroy(() =>
        document.removeEventListener('visibilitychange', onVisibilityChange),
      );
    }
  }

  /** Push-triggered refresh: authoritative delta GET, bypassing the
   *  channel-connected poll gate (the push IS the reason to fetch). */
  private pollNow(): void {
    if (!this.authService.user()) return;
    if (this.initialLoadDone) {
      this.poll();
    } else if (!this._loading()) {
      this.loadInitial();
    }
  }

  /** One poll cycle, gated on auth + channel-state + tab visibility. */
  private pollTick(): void {
    if (!this.authService.user()) return;
    if (this.realtime.connected()) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    if (this.initialLoadDone) {
      this.poll();
    } else if (!this._loading()) {
      this.loadInitial();
    }
  }

  private poll(): void {
    if (!this.authService.user()) return;

    let params = new HttpParams().set('limit', DEFAULT_PAGE_SIZE.toString());
    if (this.lastPollTimestamp) {
      params = params.set('since', this.lastPollTimestamp);
    }

    this.bff.get<PaginatedNotifications>(NOTIFICATIONS_PATH, params).subscribe({
      next: (response) => {
        for (const notification of response.items) {
          this.prependNotification(notification);
        }
        this._unreadCount.set(response.total_unread);
        if (response.items.length > 0) {
          this.lastPollTimestamp = response.items[0].created_at;
        }
      },
    });
  }

  // --- Helpers ---

  private buildParams(options: NotificationListParams): HttpParams {
    let params = new HttpParams();
    if (options.cursor) params = params.set('cursor', options.cursor);
    if (options.limit) params = params.set('limit', options.limit.toString());
    if (options.is_read !== undefined) params = params.set('is_read', options.is_read.toString());
    if (options.priority) params = params.set('priority', options.priority);
    if (options.category) params = params.set('category', options.category);
    return params;
  }
}
