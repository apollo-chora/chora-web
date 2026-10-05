import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { NotificationCenterComponent } from './notification-center.component';
import { NotificationService } from '../../../core/realtime/notification.service';
import { TranslateService } from '../../../core/services/translate.service';
import type { NotificationDelivery } from '../../../core/realtime/notification.model';

// --- Test fixture builder ----------------------------------------------------
let idCounter = 0;
function makeNotification(
  overrides: Partial<NotificationDelivery> = {},
): NotificationDelivery {
  idCounter += 1;
  return {
    id: `n-${idCounter}`,
    gcid: 'gcid-1',
    title: `Title ${idCounter}`,
    body: `Body ${idCounter}`,
    priority: 'normal',
    category: 'system',
    status: 'delivered',
    is_read: false,
    is_pinned: false,
    action_type: null,
    action_payload: null,
    action_responded: false,
    created_at: '2026-06-04T10:00:00.000Z',
    updated_at: '2026-06-04T10:00:00.000Z',
    expires_at: null,
    ...overrides,
  };
}

describe('NotificationCenterComponent', () => {
  let fixture: ComponentFixture<NotificationCenterComponent>;
  let component: NotificationCenterComponent;
  let element: HTMLElement;

  // Writable backing signals driving the mocked service.
  const notificationsSignal = signal<NotificationDelivery[]>([]);
  const loadingSignal = signal(false);
  const activeTabSignal = signal<string>('all');
  const hasMoreSignal = signal(false);

  const notificationMock = {
    activeTab: activeTabSignal.asReadonly(),
    filteredNotifications: computed(() => notificationsSignal()),
    loading: loadingSignal.asReadonly(),
    hasMore: computed(() => hasMoreSignal()),
    setActiveTab: vi.fn(),
    markAsRead: vi.fn(),
    markAsUnread: vi.fn(),
    togglePin: vi.fn(),
    executeAction: vi.fn(),
    loadMore: vi.fn(),
  };

  beforeEach(async () => {
    notificationsSignal.set([]);
    loadingSignal.set(false);
    activeTabSignal.set('all');
    hasMoreSignal.set(false);
    notificationMock.setActiveTab.mockReset();
    notificationMock.markAsRead.mockReset();
    notificationMock.markAsUnread.mockReset();
    notificationMock.togglePin.mockReset();
    notificationMock.executeAction.mockReset();
    notificationMock.loadMore.mockReset();

    await TestBed.configureTestingModule({
      imports: [NotificationCenterComponent],
      providers: [
        { provide: NotificationService, useValue: notificationMock },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationCenterComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
  });

  // --- Original tests (preserved verbatim) -----------------------------------
  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should show empty state when no notifications', () => {
    fixture.detectChanges();
    expect(component.isEmpty()).toBe(true);
  });

  it('should switch tabs', () => {
    fixture.detectChanges();

    component.onTabChange('unread');
    expect(notificationMock.setActiveTab).toHaveBeenCalledWith('unread');
  });

  // --- Shell render ----------------------------------------------------------
  describe('shell render', () => {
    it('renders the notification panel region', () => {
      fixture.detectChanges();
      const panel = element.querySelector('[data-testid="notification-panel"]');
      expect(panel).toBeTruthy();
      expect(panel?.getAttribute('role')).toBe('region');
    });

    it('renders all four filter tabs from TABS config', () => {
      fixture.detectChanges();
      expect(component.tabs.map((t) => t.key)).toEqual([
        'all',
        'unread',
        'actionable',
        'mentions',
      ]);
      expect(
        element.querySelector('[data-testid="notification-tab-all"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="notification-tab-unread"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="notification-tab-actionable"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="notification-tab-mentions"]'),
      ).toBeTruthy();
    });

    it('marks the active tab via aria-selected', () => {
      activeTabSignal.set('mentions');
      fixture.detectChanges();
      const mentionsTab = element.querySelector(
        '[data-testid="notification-tab-mentions"]',
      );
      const allTab = element.querySelector(
        '[data-testid="notification-tab-all"]',
      );
      expect(mentionsTab?.getAttribute('aria-selected')).toBe('true');
      expect(allTab?.getAttribute('aria-selected')).toBe('false');
      expect(
        mentionsTab?.classList.contains('notification-center__tab--active'),
      ).toBe(true);
    });
  });

  // --- States: loading / empty / ready ---------------------------------------
  describe('states', () => {
    it('renders the loading state when loading and list is empty', () => {
      loadingSignal.set(true);
      notificationsSignal.set([]);
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="notification-loading"]'),
      ).toBeTruthy();
      // isEmpty is false while loading (guarded by !loading())
      expect(component.isEmpty()).toBe(false);
    });

    it('renders the empty state with a per-tab message', () => {
      activeTabSignal.set('unread');
      notificationsSignal.set([]);
      loadingSignal.set(false);
      fixture.detectChanges();
      const empty = element.querySelector('[data-testid="notification-empty"]');
      expect(empty).toBeTruthy();
      // Translate pipe returns the raw key — assert per-tab key composition.
      expect(empty?.textContent).toContain('notifications.empty_unread');
    });

    it('renders notification items when list has entries', () => {
      notificationsSignal.set([
        makeNotification({ title: 'Hello world', body: 'Some body text' }),
      ]);
      fixture.detectChanges();
      const items = element.querySelectorAll(
        '[data-testid="notification-item"]',
      );
      expect(items.length).toBe(1);
      expect(items[0].textContent).toContain('Hello world');
      expect(items[0].textContent).toContain('Some body text');
      // Not loading + has items => not empty.
      expect(component.isEmpty()).toBe(false);
    });

    it('applies the unread modifier class on unread items', () => {
      notificationsSignal.set([makeNotification({ is_read: false })]);
      fixture.detectChanges();
      const item = element.querySelector('[data-testid="notification-item"]');
      expect(
        item?.classList.contains('notification-center__item--unread'),
      ).toBe(true);
    });

    it('applies the pinned modifier class on pinned items', () => {
      notificationsSignal.set([makeNotification({ is_pinned: true })]);
      fixture.detectChanges();
      const item = element.querySelector('[data-testid="notification-item"]');
      expect(
        item?.classList.contains('notification-center__item--pinned'),
      ).toBe(true);
    });
  });

  // --- isEmpty computed --------------------------------------------------------
  describe('isEmpty computed', () => {
    it('is true when not loading and no notifications', () => {
      loadingSignal.set(false);
      notificationsSignal.set([]);
      fixture.detectChanges();
      expect(component.isEmpty()).toBe(true);
    });

    it('is false when notifications exist', () => {
      notificationsSignal.set([makeNotification()]);
      fixture.detectChanges();
      expect(component.isEmpty()).toBe(false);
    });

    it('is false while loading even with empty list', () => {
      loadingSignal.set(true);
      notificationsSignal.set([]);
      fixture.detectChanges();
      expect(component.isEmpty()).toBe(false);
    });
  });

  // --- onMarkRead branches ----------------------------------------------------
  describe('onMarkRead', () => {
    it('marks an unread notification as read', () => {
      const n = makeNotification({ is_read: false });
      const event = { stopPropagation: vi.fn() } as unknown as Event;
      component.onMarkRead(n, event);
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(notificationMock.markAsRead).toHaveBeenCalledWith(n.id);
      expect(notificationMock.markAsUnread).not.toHaveBeenCalled();
    });

    it('marks a read notification as unread', () => {
      const n = makeNotification({ is_read: true });
      const event = { stopPropagation: vi.fn() } as unknown as Event;
      component.onMarkRead(n, event);
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(notificationMock.markAsUnread).toHaveBeenCalledWith(n.id);
      expect(notificationMock.markAsRead).not.toHaveBeenCalled();
    });

    it('toggles read state via the quick-action button (unread -> read)', () => {
      notificationsSignal.set([makeNotification({ is_read: false })]);
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="mark-read"]',
      ) as HTMLButtonElement;
      expect(btn).toBeTruthy();
      btn.click();
      expect(notificationMock.markAsRead).toHaveBeenCalledTimes(1);
    });

    it('exposes mark-unread testid on already-read items', () => {
      notificationsSignal.set([makeNotification({ is_read: true })]);
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="mark-unread"]'),
      ).toBeTruthy();
      expect(element.querySelector('[data-testid="mark-read"]')).toBeNull();
    });
  });

  // --- onItemClick branches ---------------------------------------------------
  describe('onItemClick', () => {
    it('marks an unread notification as read on item click', () => {
      const n = makeNotification({ is_read: false });
      component.onItemClick(n);
      expect(notificationMock.markAsRead).toHaveBeenCalledWith(n.id);
    });

    it('is a no-op when the notification is already read', () => {
      const n = makeNotification({ is_read: true });
      component.onItemClick(n);
      expect(notificationMock.markAsRead).not.toHaveBeenCalled();
    });

    it('marks read when the article element is clicked', () => {
      notificationsSignal.set([makeNotification({ is_read: false })]);
      fixture.detectChanges();
      const item = element.querySelector(
        '[data-testid="notification-item"]',
      ) as HTMLElement;
      item.click();
      expect(notificationMock.markAsRead).toHaveBeenCalled();
    });
  });

  // --- onTogglePin ------------------------------------------------------------
  describe('onTogglePin', () => {
    it('delegates to the service and stops propagation', () => {
      const n = makeNotification();
      const event = { stopPropagation: vi.fn() } as unknown as Event;
      component.onTogglePin(n, event);
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(notificationMock.togglePin).toHaveBeenCalledWith(n.id);
    });

    it('fires togglePin from the pin quick-action button', () => {
      notificationsSignal.set([makeNotification()]);
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="toggle-pin"]',
      ) as HTMLButtonElement;
      btn.click();
      expect(notificationMock.togglePin).toHaveBeenCalledTimes(1);
    });
  });

  // --- onAction + inline action rendering ------------------------------------
  describe('onAction', () => {
    it('delegates the action to the service and stops propagation', () => {
      const n = makeNotification({ action_type: 'accept' });
      const event = { stopPropagation: vi.fn() } as unknown as Event;
      component.onAction(n, 'accept', event);
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(notificationMock.executeAction).toHaveBeenCalledWith(n.id, 'accept');
    });

    it('renders accept + decline buttons for accept action_type', () => {
      notificationsSignal.set([
        makeNotification({ action_type: 'accept', action_responded: false }),
      ]);
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="action-accept"]')).toBeTruthy();
      expect(
        element.querySelector('[data-testid="action-decline"]'),
      ).toBeTruthy();
    });

    it('renders approve + reject buttons for approve action_type', () => {
      notificationsSignal.set([
        makeNotification({ action_type: 'approve', action_responded: false }),
      ]);
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="action-approve"]'),
      ).toBeTruthy();
      expect(element.querySelector('[data-testid="action-reject"]')).toBeTruthy();
    });

    it('renders the claim button for claim action_type', () => {
      notificationsSignal.set([
        makeNotification({ action_type: 'claim', action_responded: false }),
      ]);
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="action-claim"]')).toBeTruthy();
    });

    it('renders the escalate button for escalate action_type', () => {
      notificationsSignal.set([
        makeNotification({ action_type: 'escalate', action_responded: false }),
      ]);
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="action-escalate"]'),
      ).toBeTruthy();
    });

    it('clicking the accept button invokes executeAction with accept', () => {
      notificationsSignal.set([makeNotification({ action_type: 'accept' })]);
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="action-accept"]',
      ) as HTMLButtonElement;
      btn.click();
      expect(notificationMock.executeAction).toHaveBeenCalledWith(
        expect.stringMatching(/^n-/),
        'accept',
      );
    });

    it('hides actions and shows responded label once responded', () => {
      notificationsSignal.set([
        makeNotification({ action_type: 'accept', action_responded: true }),
      ]);
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="notification-actions"]')).toBeNull();
      expect(
        element.querySelector('[data-testid="notification-responded"]'),
      ).toBeTruthy();
    });
  });

  // --- onLoadMore + hasMore ---------------------------------------------------
  describe('onLoadMore', () => {
    it('delegates to the service', () => {
      component.onLoadMore();
      expect(notificationMock.loadMore).toHaveBeenCalledTimes(1);
    });

    it('renders the load-more button only when hasMore is true', () => {
      notificationsSignal.set([makeNotification()]);
      hasMoreSignal.set(false);
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="notification-load-more"]'),
      ).toBeNull();

      hasMoreSignal.set(true);
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="notification-load-more"]',
      ) as HTMLButtonElement;
      expect(btn).toBeTruthy();
      btn.click();
      expect(notificationMock.loadMore).toHaveBeenCalledTimes(1);
    });

    it('disables the load-more button while loading', () => {
      notificationsSignal.set([makeNotification()]);
      hasMoreSignal.set(true);
      loadingSignal.set(true);
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="notification-load-more"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  // --- priorityIndicator ------------------------------------------------------
  describe('priorityIndicator', () => {
    it('returns "!!" for critical', () => {
      expect(component.priorityIndicator('critical')).toBe('!!');
    });

    it('returns "!" for high', () => {
      expect(component.priorityIndicator('high')).toBe('!');
    });

    it('returns empty string for normal', () => {
      expect(component.priorityIndicator('normal')).toBe('');
    });

    it('returns empty string for low', () => {
      expect(component.priorityIndicator('low')).toBe('');
    });

    it('returns empty string for an unknown priority (nullish fallback)', () => {
      expect(component.priorityIndicator('made-up')).toBe('');
    });

    it('renders the priority indicator for critical notifications', () => {
      notificationsSignal.set([makeNotification({ priority: 'critical' })]);
      fixture.detectChanges();
      const indicator = element.querySelector(
        '[data-testid="notification-priority"]',
      );
      expect(indicator).toBeTruthy();
      expect(indicator?.textContent?.trim()).toBe('!!');
      expect(
        indicator?.classList.contains('notification-center__priority--critical'),
      ).toBe(true);
    });

    it('omits the priority indicator for normal notifications', () => {
      notificationsSignal.set([makeNotification({ priority: 'normal' })]);
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="notification-priority"]'),
      ).toBeNull();
    });
  });

  // --- trackById --------------------------------------------------------------
  describe('trackById', () => {
    it('returns the notification id', () => {
      const n = makeNotification({ id: 'abc-123' });
      expect(component.trackById(0, n)).toBe('abc-123');
    });
  });

  // --- isExpired branches -----------------------------------------------------
  describe('isExpired', () => {
    it('returns false when there is no expires_at', () => {
      expect(component.isExpired(makeNotification({ expires_at: null }))).toBe(
        false,
      );
    });

    it('returns true when expires_at is in the past', () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      expect(
        component.isExpired(makeNotification({ expires_at: past })),
      ).toBe(true);
    });

    it('returns false when expires_at is in the future', () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      expect(
        component.isExpired(makeNotification({ expires_at: future })),
      ).toBe(false);
    });

    it('applies the expired modifier class and shows the expired label', () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      notificationsSignal.set([
        makeNotification({
          expires_at: past,
          action_type: 'accept',
          action_responded: false,
        }),
      ]);
      fixture.detectChanges();
      const item = element.querySelector('[data-testid="notification-item"]');
      expect(
        item?.classList.contains('notification-center__item--expired'),
      ).toBe(true);
      // Expired actionable notification: actions hidden, expired label shown.
      expect(
        element.querySelector('[data-testid="notification-actions"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="notification-expired"]'),
      ).toBeTruthy();
    });
  });
});
