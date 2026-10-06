import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { NotificationService, SSE_POLL_INTERVAL_MS } from './notification.service';
import { RealtimeChannelService } from './realtime-channel.service';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';
import { computed, signal } from '@angular/core';
import { Subject } from 'rxjs';
import type {
  NotificationDelivery,
  PaginatedNotifications,
} from './notification.model';
import type { RealtimeNotificationCreated } from './realtime-channel.model';

// Factory for a fully-shaped NotificationDelivery so each test can override
// only the fields it asserts on without TS complaints.
function makeNotification(over: Partial<NotificationDelivery> = {}): NotificationDelivery {
  return {
    id: 'n-1',
    gcid: 'u1',
    title: 'Hello',
    body: 'World',
    priority: 'normal',
    category: 'engagement',
    status: 'delivered',
    is_read: false,
    is_pinned: false,
    action_type: null,
    action_payload: null,
    action_responded: false,
    created_at: '2026-06-04T00:00:00Z',
    updated_at: '2026-06-04T00:00:00Z',
    expires_at: null,
    ...over,
  };
}

function page(over: Partial<PaginatedNotifications> = {}): PaginatedNotifications {
  return { items: [], next_cursor: null, total_unread: 0, ...over };
}

describe('NotificationService', () => {
  let service: NotificationService;
  let httpMock: HttpTestingController;

  // RealtimeChannelService stub — the service reads connectionState/connected,
  // subscribes notificationCreated$/reconnected$, and drives connect/disconnect.
  const rtState = signal<'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('disconnected');
  const rtMock = {
    connectionState: rtState,
    connected: computed(() => rtState() === 'connected'),
    notificationCreated$: new Subject<RealtimeNotificationCreated>(),
    reconnected$: new Subject<void>(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  const authMock = {
    user: signal({ gcid: 'u1', displayName: 'Test', email: 't@t.com', tenantId: 't1', roles: [], capabilities: [] }),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RealtimeChannelService, useValue: rtMock },
        { provide: AuthService, useValue: authMock },
      ],
    });
    service = TestBed.inject(NotificationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Reset fake timers + shared mock/DOM state so polling tests don't bleed.
    vi.useRealTimers();
    rtState.set('disconnected');
    rtMock.connect.mockClear();
    rtMock.disconnect.mockClear();
    environment.realtimeEnabled = false;
    // Restore the authenticated user — some tests blank it to exercise guards.
    authMock.user.set({ gcid: 'u1', displayName: 'Test', email: 't@t.com', tenantId: 't1', roles: [], capabilities: [] });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    httpMock.verify();
    service.teardown();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with zero unread count', () => {
    expect(service.unreadCount()).toBe(0);
  });

  it('should toggle panel open state', () => {
    expect(service.isOpen()).toBe(false);
    service.togglePanel();
    // triggers loadInitial which fires HTTP
    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/notifications'));
    req.flush({ items: [], total_unread: 0, next_cursor: null });

    expect(service.isOpen()).toBe(true);
    service.togglePanel();
    expect(service.isOpen()).toBe(false);
  });

  it('should set active tab', () => {
    expect(service.activeTab()).toBe('all');
    service.setActiveTab('unread');
    expect(service.activeTab()).toBe('unread');
  });

  // --- Poll throttle (perf): single visibility-aware 30s interval ---

  const NOTIF_URL = (r: { url: string }) => r.url.includes('/api/v1/notifications');
  const flushEmpty = (req: TestRequest) =>
    req.flush({ items: [], total_unread: 0, next_cursor: null });

  it('uses a throttled 30s poll interval (single source of truth)', () => {
    expect(SSE_POLL_INTERVAL_MS).toBe(30_000);
  });

  it('runs one REST poll per interval — immediate first load, then every 30s', () => {
    vi.useFakeTimers();
    service.initialize();

    // Immediate first load on initialize() (no 30s blank-wait).
    flushEmpty(httpMock.expectOne(NOTIF_URL));
    // Nothing fires faster than the interval.
    httpMock.expectNone(NOTIF_URL);

    vi.advanceTimersByTime(SSE_POLL_INTERVAL_MS);
    flushEmpty(httpMock.expectOne(NOTIF_URL));

    // Exactly one more per interval — confirms a single source-of-truth timer.
    vi.advanceTimersByTime(SSE_POLL_INTERVAL_MS);
    flushEmpty(httpMock.expectOne(NOTIF_URL));
  });

  it('does not poll while the tab is hidden, and catches up when visible again', () => {
    vi.useFakeTimers();
    service.initialize();
    flushEmpty(httpMock.expectOne(NOTIF_URL));

    // Background the tab → interval ticks become no-ops (no network).
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    vi.advanceTimersByTime(SSE_POLL_INTERVAL_MS);
    httpMock.expectNone(NOTIF_URL);

    // Return to the tab → immediate catch-up poll.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    flushEmpty(httpMock.expectOne(NOTIF_URL));
  });

  it('skips the REST poll while the realtime channel is connected (push covers it)', () => {
    vi.useFakeTimers();
    rtState.set('connected');
    service.initialize();

    // connected → pollTick() returns early → no immediate load and no ticks.
    httpMock.expectNone(NOTIF_URL);
    vi.advanceTimersByTime(SSE_POLL_INTERVAL_MS);
    httpMock.expectNone(NOTIF_URL);
  });

  it('re-fetches the full list on re-initialize after teardown (restart-safe)', () => {
    vi.useFakeTimers();
    service.initialize();
    httpMock.expectOne(NOTIF_URL).flush({ items: [], total_unread: 3, next_cursor: null });
    expect(service.unreadCount()).toBe(3);

    service.teardown();
    expect(service.unreadCount()).toBe(0);

    // Re-login must reload immediately, not sit dead until the next tick — the
    // old connectionState-effect poll never restarted after a stop.
    service.initialize();
    flushEmpty(httpMock.expectOne(NOTIF_URL));
  });

  // --- initialize / teardown guards ---

  it('initialize() is a no-op (no HTTP) when there is no authenticated user', () => {
    authMock.user.set(null as never);
    service.initialize();
    httpMock.expectNone(NOTIF_URL);
    expect(rtMock.connect).not.toHaveBeenCalled();
  });

  it('initialize() opens the realtime channel ONLY when the flag is on', () => {
    service.initialize();
    flushEmpty(httpMock.expectOne(NOTIF_URL));
    // Flag off (default) → poll-only posture, no channel.
    expect(rtMock.connect).not.toHaveBeenCalled();

    environment.realtimeEnabled = true;
    service.initialize();
    flushEmpty(httpMock.expectOne(NOTIF_URL));
    expect(rtMock.connect).toHaveBeenCalled();
  });

  it('teardown() closes the realtime channel and clears panel + list state', () => {
    service.initialize();
    httpMock.expectOne(NOTIF_URL).flush(
      page({ items: [makeNotification()], total_unread: 1, next_cursor: 'c1' }),
    );
    service.togglePanel();
    expect(service.isOpen()).toBe(true);

    service.teardown();
    expect(rtMock.disconnect).toHaveBeenCalled();
    expect(service.notifications()).toEqual([]);
    expect(service.unreadCount()).toBe(0);
    expect(service.hasMore()).toBe(false);
    expect(service.isOpen()).toBe(false);
  });

  // --- loadInitial ---

  it('loadInitial() populates list, unread count and cursor on success', () => {
    service.loadInitial();
    const req = httpMock.expectOne(NOTIF_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('limit')).toBe('20');
    req.flush(page({ items: [makeNotification({ id: 'a' })], total_unread: 5, next_cursor: 'cur-2' }));

    expect(service.loading()).toBe(false);
    expect(service.notifications().map((n) => n.id)).toEqual(['a']);
    expect(service.unreadCount()).toBe(5);
    expect(service.hasMore()).toBe(true);
  });

  it('loadInitial() clears the loading flag on a 5xx error', () => {
    service.loadInitial();
    expect(service.loading()).toBe(true);
    httpMock.expectOne(NOTIF_URL).flush('boom', { status: 500, statusText: 'Server Error' });
    expect(service.loading()).toBe(false);
    expect(service.notifications()).toEqual([]);
  });

  // --- loadMore ---

  it('loadMore() appends the next page and updates the cursor', () => {
    service.loadInitial();
    httpMock.expectOne(NOTIF_URL).flush(
      page({ items: [makeNotification({ id: 'a' })], next_cursor: 'cur-1', total_unread: 1 }),
    );

    service.loadMore();
    const req = httpMock.expectOne(NOTIF_URL);
    expect(req.request.params.get('cursor')).toBe('cur-1');
    req.flush(page({ items: [makeNotification({ id: 'b' })], next_cursor: null }));

    expect(service.notifications().map((n) => n.id)).toEqual(['a', 'b']);
    expect(service.hasMore()).toBe(false);
    expect(service.loading()).toBe(false);
  });

  it('loadMore() is a no-op when there is no next cursor', () => {
    // No prior load → cursor is null.
    service.loadMore();
    httpMock.expectNone(NOTIF_URL);
  });

  it('loadMore() clears loading on error', () => {
    service.loadInitial();
    httpMock.expectOne(NOTIF_URL).flush(page({ next_cursor: 'cur-1' }));
    service.loadMore();
    httpMock.expectOne(NOTIF_URL).flush('err', { status: 503, statusText: 'Unavailable' });
    expect(service.loading()).toBe(false);
  });

  // --- mark read / unread ---

  it('markAsRead() flips is_read, sets status read and decrements unread count', () => {
    service.loadInitial();
    httpMock.expectOne(NOTIF_URL).flush(
      page({ items: [makeNotification({ id: 'a', is_read: false })], total_unread: 2 }),
    );

    service.markAsRead('a');
    const req = httpMock.expectOne((r) => r.url.includes('/mark-read'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ notification_id: 'a', read: true });
    req.flush(null);

    const n = service.notifications().find((x) => x.id === 'a')!;
    expect(n.is_read).toBe(true);
    expect(n.status).toBe('read');
    expect(service.unreadCount()).toBe(1);
  });

  it('markAsRead() never drives the unread count below zero', () => {
    service.loadInitial();
    httpMock.expectOne(NOTIF_URL).flush(
      page({ items: [makeNotification({ id: 'a', is_read: false })], total_unread: 0 }),
    );
    service.markAsRead('a');
    httpMock.expectOne((r) => r.url.includes('/mark-read')).flush(null);
    expect(service.unreadCount()).toBe(0);
  });

  it('markAsUnread() flips is_read back, sets status delivered and increments unread count', () => {
    service.loadInitial();
    httpMock.expectOne(NOTIF_URL).flush(
      page({ items: [makeNotification({ id: 'a', is_read: true, status: 'read' })], total_unread: 0 }),
    );

    service.markAsUnread('a');
    const req = httpMock.expectOne((r) => r.url.includes('/mark-read'));
    expect(req.request.body).toEqual({ notification_id: 'a', read: false });
    req.flush(null);

    const n = service.notifications().find((x) => x.id === 'a')!;
    expect(n.is_read).toBe(false);
    expect(n.status).toBe('delivered');
    expect(service.unreadCount()).toBe(1);
  });

  // --- togglePin ---

  it('togglePin() optimistically pins, then PATCHes the encoded id', () => {
    service.loadInitial();
    httpMock.expectOne(NOTIF_URL).flush(
      page({ items: [makeNotification({ id: 'a b', is_pinned: false })] }),
    );

    service.togglePin('a b');
    // Optimistic update happens immediately.
    expect(service.notifications().find((n) => n.id === 'a b')!.is_pinned).toBe(true);

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/notifications/a%20b'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ is_pinned: true });
    req.flush(null);

    expect(service.notifications().find((n) => n.id === 'a b')!.is_pinned).toBe(true);
  });

  it('togglePin() rolls back the optimistic pin on error', () => {
    service.loadInitial();
    httpMock.expectOne(NOTIF_URL).flush(
      page({ items: [makeNotification({ id: 'a', is_pinned: false })] }),
    );

    service.togglePin('a');
    expect(service.notifications().find((n) => n.id === 'a')!.is_pinned).toBe(true);

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/notifications/a'))
      .flush('nope', { status: 409, statusText: 'Conflict' });

    expect(service.notifications().find((n) => n.id === 'a')!.is_pinned).toBe(false);
  });

  it('togglePin() is a no-op when the notification is not in the list', () => {
    service.togglePin('missing');
    httpMock.expectNone((r) => r.url.includes('/api/v1/notifications/missing'));
  });

  // --- executeAction ---

  it('executeAction() optimistically marks responded, then POSTs the action', () => {
    service.loadInitial();
    httpMock.expectOne(NOTIF_URL).flush(
      page({ items: [makeNotification({ id: 'a', action_type: 'accept', action_responded: false })] }),
    );

    service.executeAction('a', 'accept');
    expect(service.notifications().find((n) => n.id === 'a')!.action_responded).toBe(true);

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/notifications/a/action'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ action: 'accept' });
    req.flush(null);

    expect(service.notifications().find((n) => n.id === 'a')!.action_responded).toBe(true);
  });

  it('executeAction() rolls back action_responded on error', () => {
    service.loadInitial();
    httpMock.expectOne(NOTIF_URL).flush(
      page({ items: [makeNotification({ id: 'a', action_responded: false })] }),
    );

    service.executeAction('a', 'decline');
    expect(service.notifications().find((n) => n.id === 'a')!.action_responded).toBe(true);

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/notifications/a/action'))
      .flush('err', { status: 500, statusText: 'Server Error' });

    expect(service.notifications().find((n) => n.id === 'a')!.action_responded).toBe(false);
  });

  // --- filteredNotifications computed (all four tabs) ---

  it('filters notifications per active tab', () => {
    service.loadInitial();
    httpMock.expectOne(NOTIF_URL).flush(
      page({
        items: [
          makeNotification({ id: 'read', is_read: true }),
          makeNotification({ id: 'unread', is_read: false }),
          makeNotification({ id: 'act', action_type: 'approve', action_responded: false }),
          makeNotification({ id: 'act-done', action_type: 'approve', action_responded: true }),
          makeNotification({ id: 'social', category: 'social' }),
        ],
        total_unread: 4,
      }),
    );

    // 'all' → everything
    expect(service.filteredNotifications()).toHaveLength(5);

    service.setActiveTab('unread');
    expect(service.filteredNotifications().map((n) => n.id)).not.toContain('read');
    expect(service.filteredNotifications().every((n) => !n.is_read)).toBe(true);

    service.setActiveTab('actionable');
    const actionable = service.filteredNotifications().map((n) => n.id);
    expect(actionable).toContain('act');
    expect(actionable).not.toContain('act-done');

    service.setActiveTab('mentions');
    expect(service.filteredNotifications().map((n) => n.id)).toEqual(['social']);
  });

  // --- Realtime channel push handling (ADR-183) ---
  //
  // A notification.created frame is a SIGNAL ({notification_id, kind, title}),
  // not a row — the service responds by pulling the authoritative delta GET
  // (debounced 300ms so a burst costs one request). Reconnects trigger a full
  // loadInitial() reconcile (at-most-once delivery + the 3600s stream cap).

  it('pulls the authoritative delta when a notification.created frame arrives', () => {
    vi.useFakeTimers();
    service.loadInitial();
    httpMock.expectOne(NOTIF_URL).flush(
      page({ items: [makeNotification({ id: 'existing' })], total_unread: 1 }),
    );

    rtMock.notificationCreated$.next({ notification_id: 'pushed' });
    vi.advanceTimersByTime(300); // debounce window

    const req = httpMock.expectOne(NOTIF_URL);
    expect(req.request.method).toBe('GET');
    req.flush(
      page({
        items: [makeNotification({ id: 'pushed', is_read: false })],
        total_unread: 2,
      }),
    );

    expect(service.notifications().map((n) => n.id)).toEqual(['pushed', 'existing']);
    expect(service.unreadCount()).toBe(2);
  });

  it('coalesces a burst of created frames into ONE delta poll (debounce)', () => {
    vi.useFakeTimers();
    service.loadInitial();
    httpMock.expectOne(NOTIF_URL).flush(page({ total_unread: 0 }));

    rtMock.notificationCreated$.next({ notification_id: 'b1' });
    rtMock.notificationCreated$.next({ notification_id: 'b2' });
    rtMock.notificationCreated$.next({ notification_id: 'b3' });
    vi.advanceTimersByTime(300);

    const req = httpMock.expectOne(NOTIF_URL); // exactly one
    req.flush(
      page({
        items: [
          makeNotification({ id: 'b3', is_read: false }),
          makeNotification({ id: 'b2', is_read: false }),
          makeNotification({ id: 'b1', is_read: false }),
        ],
        total_unread: 3,
      }),
    );
    expect(service.notifications()).toHaveLength(3);
    expect(service.unreadCount()).toBe(3);
  });

  it('dedupes a delta row whose id already exists in the list', () => {
    vi.useFakeTimers();
    service.loadInitial();
    httpMock.expectOne(NOTIF_URL).flush(
      page({ items: [makeNotification({ id: 'dup', is_read: false })], total_unread: 1 }),
    );

    rtMock.notificationCreated$.next({ notification_id: 'dup' });
    vi.advanceTimersByTime(300);
    httpMock.expectOne(NOTIF_URL).flush(
      page({ items: [makeNotification({ id: 'dup', is_read: false })], total_unread: 1 }),
    );

    expect(service.notifications()).toHaveLength(1);
    expect(service.unreadCount()).toBe(1);
  });

  it('a created frame before any load runs loadInitial, not the delta poll', () => {
    vi.useFakeTimers();
    rtMock.notificationCreated$.next({ notification_id: 'early' });
    vi.advanceTimersByTime(300);

    // initialLoadDone false → the push-trigger takes the full-load arm.
    const req = httpMock.expectOne(NOTIF_URL);
    req.flush(page({ items: [makeNotification({ id: 'early' })], total_unread: 1 }));
    expect(service.notifications().map((n) => n.id)).toEqual(['early']);
  });

  it('reconnected$ forces a FULL loadInitial reconcile (missed-frames contract)', () => {
    service.loadInitial();
    httpMock.expectOne(NOTIF_URL).flush(
      page({ items: [makeNotification({ id: 'stale' })], total_unread: 5 }),
    );

    rtMock.reconnected$.next();

    const req = httpMock.expectOne(NOTIF_URL);
    req.flush(page({ items: [makeNotification({ id: 'fresh' })], total_unread: 1 }));
    expect(service.notifications().map((n) => n.id)).toEqual(['fresh']);
    expect(service.unreadCount()).toBe(1);
  });

  // --- panel ---

  it('togglePanel() does NOT refetch when the list is already populated', () => {
    service.loadInitial();
    httpMock.expectOne(NOTIF_URL).flush(page({ items: [makeNotification({ id: 'x' })] }));

    service.togglePanel();
    expect(service.isOpen()).toBe(true);
    // List non-empty → no second load fires.
    httpMock.expectNone(NOTIF_URL);
  });

  it('closePanel() forces the panel shut', () => {
    service.togglePanel();
    flushEmpty(httpMock.expectOne(NOTIF_URL));
    expect(service.isOpen()).toBe(true);
    service.closePanel();
    expect(service.isOpen()).toBe(false);
  });

  // --- incremental poll path (since cursor) ---

  it('runs the incremental poll() path after the initial load, prepending deltas', () => {
    vi.useFakeTimers();
    service.initialize();
    // Immediate first load goes through loadInitial() (initialLoadDone false).
    // NOTE: loadInitial() does NOT seed lastPollTimestamp — only poll() does —
    // so the FIRST incremental poll carries no `since` param (characterized).
    httpMock.expectOne(NOTIF_URL).flush(
      page({
        items: [makeNotification({ id: 'first', created_at: '2026-06-04T10:00:00Z', is_read: false })],
        total_unread: 1,
      }),
    );

    // Next tick → initialLoadDone is true → poll() (no `since` yet).
    vi.advanceTimersByTime(SSE_POLL_INTERVAL_MS);
    const firstPoll = httpMock.expectOne(NOTIF_URL);
    expect(firstPoll.request.params.get('since')).toBe(null);
    expect(firstPoll.request.params.get('limit')).toBe('20');
    firstPoll.flush(
      page({
        items: [makeNotification({ id: 'newer', created_at: '2026-06-04T11:00:00Z', is_read: false })],
        total_unread: 2,
      }),
    );

    // The poll prepends each delta item and refreshes the unread count.
    expect(service.notifications().map((n) => n.id)).toEqual(['newer', 'first']);
    expect(service.unreadCount()).toBe(2);

    // poll() seeded lastPollTimestamp from the newest delta → the NEXT tick
    // now carries the `since` cursor.
    vi.advanceTimersByTime(SSE_POLL_INTERVAL_MS);
    const secondPoll = httpMock.expectOne(NOTIF_URL);
    expect(secondPoll.request.params.get('since')).toBe('2026-06-04T11:00:00Z');
    secondPoll.flush(page({ items: [], total_unread: 2 }));
  });

  // --- BRANCH AUGMENTATION: previously-uncovered conditional arms ---

  // Branch L182 (markAsRead map FALSE arm): a non-matching row must pass through
  // unchanged when the list has more than one item.
  it('markAsRead() leaves non-matching rows untouched (map passthrough arm)', () => {
    service.loadInitial();
    httpMock.expectOne(NOTIF_URL).flush(
      page({
        items: [
          makeNotification({ id: 'a', is_read: false }),
          makeNotification({ id: 'b', is_read: false, status: 'delivered' }),
        ],
        total_unread: 2,
      }),
    );

    service.markAsRead('a');
    httpMock.expectOne((r) => r.url.includes('/mark-read')).flush(null);

    const a = service.notifications().find((n) => n.id === 'a')!;
    const b = service.notifications().find((n) => n.id === 'b')!;
    expect(a.is_read).toBe(true);
    // The other row flows through the FALSE arm unchanged.
    expect(b.is_read).toBe(false);
    expect(b.status).toBe('delivered');
  });

  // Branch L193 (markAsUnread map FALSE arm).
  it('markAsUnread() leaves non-matching rows untouched (map passthrough arm)', () => {
    service.loadInitial();
    httpMock.expectOne(NOTIF_URL).flush(
      page({
        items: [
          makeNotification({ id: 'a', is_read: true, status: 'read' }),
          makeNotification({ id: 'b', is_read: true, status: 'read' }),
        ],
        total_unread: 0,
      }),
    );

    service.markAsUnread('a');
    httpMock.expectOne((r) => r.url.includes('/mark-read')).flush(null);

    const a = service.notifications().find((n) => n.id === 'a')!;
    const b = service.notifications().find((n) => n.id === 'b')!;
    expect(a.is_read).toBe(false);
    // Untouched row keeps its read state.
    expect(b.is_read).toBe(true);
    expect(b.status).toBe('read');
  });

  // Branches L206 + L212 (togglePin optimistic + rollback map FALSE arms).
  it('togglePin() leaves non-matching rows untouched on both optimistic + rollback', () => {
    service.loadInitial();
    httpMock.expectOne(NOTIF_URL).flush(
      page({
        items: [
          makeNotification({ id: 'a', is_pinned: false }),
          makeNotification({ id: 'b', is_pinned: false }),
        ],
      }),
    );

    service.togglePin('a');
    // Optimistic: 'a' pinned, 'b' passes through the FALSE arm unchanged.
    expect(service.notifications().find((n) => n.id === 'a')!.is_pinned).toBe(true);
    expect(service.notifications().find((n) => n.id === 'b')!.is_pinned).toBe(false);

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/notifications/a'))
      .flush('nope', { status: 500, statusText: 'Server Error' });

    // Rollback: 'a' reverted, 'b' still untouched (FALSE arm again).
    expect(service.notifications().find((n) => n.id === 'a')!.is_pinned).toBe(false);
    expect(service.notifications().find((n) => n.id === 'b')!.is_pinned).toBe(false);
  });

  // Branches L220 + L226 (executeAction optimistic + rollback map FALSE arms).
  it('executeAction() leaves non-matching rows untouched on both optimistic + rollback', () => {
    service.loadInitial();
    httpMock.expectOne(NOTIF_URL).flush(
      page({
        items: [
          makeNotification({ id: 'a', action_responded: false }),
          makeNotification({ id: 'b', action_responded: false }),
        ],
      }),
    );

    service.executeAction('a', 'accept');
    expect(service.notifications().find((n) => n.id === 'a')!.action_responded).toBe(true);
    expect(service.notifications().find((n) => n.id === 'b')!.action_responded).toBe(false);

    httpMock
      .expectOne((r) => r.url.includes('/api/v1/notifications/a/action'))
      .flush('err', { status: 500, statusText: 'Server Error' });

    expect(service.notifications().find((n) => n.id === 'a')!.action_responded).toBe(false);
    expect(service.notifications().find((n) => n.id === 'b')!.action_responded).toBe(false);
  });

  // Branch L279 implicit-else: a visibilitychange event while the tab is hidden
  // must NOT trigger a catch-up poll (the `=== 'visible'` guard is false).
  it('a visibilitychange to hidden does not trigger a catch-up poll', () => {
    vi.useFakeTimers();
    service.initialize();
    flushEmpty(httpMock.expectOne(NOTIF_URL));

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    // Guard false → no network.
    httpMock.expectNone(NOTIF_URL);
  });

  // Branch L290 (pollTick `if (!user) return` TRUE arm): a tick after the user is
  // cleared must be a no-op. The poll interval is gated per-tick on auth.
  it('pollTick() is a no-op when the user has logged out between ticks', () => {
    vi.useFakeTimers();
    service.initialize();
    flushEmpty(httpMock.expectOne(NOTIF_URL));

    // User logs out → next interval tick hits the auth guard early-return.
    authMock.user.set(null as never);
    vi.advanceTimersByTime(SSE_POLL_INTERVAL_MS);
    httpMock.expectNone(NOTIF_URL);
  });

  // Branch L296 (pollTick else-if FALSE arm): initialLoadDone false AND loading
  // true → neither poll() nor loadInitial() fires. We arm a pending loadInitial
  // (sets _loading true, leaves initialLoadDone false) then drive a tick.
  it('pollTick() skips entirely while an initial load is still in flight', () => {
    vi.useFakeTimers();
    // Start an in-flight load WITHOUT flushing it → _loading=true, initialLoadDone=false.
    service.loadInitial();
    const inflight = httpMock.expectOne(NOTIF_URL);
    expect(service.loading()).toBe(true);

    // Bring up the interval; a tick now finds initialLoadDone=false AND loading=true.
    service.initialize();
    // initialize() also calls pollTick() immediately — but loading is true so it
    // takes the else-if FALSE arm: no extra request.
    httpMock.expectNone(NOTIF_URL);
    vi.advanceTimersByTime(SSE_POLL_INTERVAL_MS);
    httpMock.expectNone(NOTIF_URL);

    // Resolve the original in-flight request to keep verify() clean.
    inflight.flush(page({ items: [], total_unread: 0 }));
  });

  // Branch L302 (poll `if (!user) return` TRUE arm): poll() is private and only
  // reached via pollTick() (which already guards on auth at L290), so poll()'s own
  // defensive auth re-check is unreachable through the public API. Drive it
  // directly with no user to characterize the early-return.
  it('poll() re-checks auth and is a no-op when no user is present (defensive guard)', () => {
    interface WithPoll { poll(): void }
    const helper = service as unknown as WithPoll;
    authMock.user.set(null as never);
    helper.poll();
    httpMock.expectNone(NOTIF_URL);
  });

  // Branches L327/L328/L329/L330 (buildParams option arms): loadInitial/loadMore
  // only ever pass {cursor?, limit}, so is_read / priority / category and the
  // limit-absent arm are never exercised through the public API. We reach the
  // private helper directly to characterize each set() arm.
  it('buildParams() sets each optional query arm when provided', () => {
    interface WithBuildParams {
      buildParams(o: {
        cursor?: string;
        limit?: number;
        is_read?: boolean;
        priority?: string;
        category?: string;
      }): { toString(): string };
    }
    const helper = service as unknown as WithBuildParams;

    const full = helper
      .buildParams({ cursor: 'c1', limit: 5, is_read: false, priority: 'high', category: 'social' })
      .toString();
    expect(full).toContain('cursor=c1');
    expect(full).toContain('limit=5');
    expect(full).toContain('is_read=false');
    expect(full).toContain('priority=high');
    expect(full).toContain('category=social');

    // limit-absent arm (L327 FALSE): omit limit entirely.
    const noLimit = helper.buildParams({ is_read: true }).toString();
    expect(noLimit).toContain('is_read=true');
    expect(noLimit).not.toContain('limit=');

    // All-absent → empty param string (every guard false).
    expect(helper.buildParams({}).toString()).toBe('');
  });
});
