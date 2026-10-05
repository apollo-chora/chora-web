import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TopNavComponent } from './top-nav.component';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/realtime/notification.service';
import { TranslateService } from '../../../core/services/translate.service';

describe('TopNavComponent', () => {
  let fixture: ComponentFixture<TopNavComponent>;
  let component: TopNavComponent;

  const authMock = {
    user: signal<unknown>({ gcid: 'user-1', displayName: 'Jane', email: 'jane@chora.io', tenantId: 't1', roles: [], capabilities: [] }),
    logout: vi.fn(),
  };

  const notifMock = {
    unreadCount: signal(3),
    isOpen: signal(false),
    connectionState: signal('connected'),
    initialize: vi.fn(),
    teardown: vi.fn(),
    togglePanel: vi.fn(),
    closePanel: vi.fn(),
    activeTab: signal('all'),
    filteredNotifications: signal([]),
    loading: signal(false),
    hasMore: signal(false),
    setActiveTab: vi.fn(),
    markAsRead: vi.fn(),
    markAsUnread: vi.fn(),
    togglePin: vi.fn(),
    executeAction: vi.fn(),
    loadMore: vi.fn(),
  };

  beforeEach(async () => {
    // Reset shared mock state so each test starts from a known baseline.
    authMock.user.set({ gcid: 'user-1', displayName: 'Jane', email: 'jane@chora.io', tenantId: 't1', roles: [], capabilities: [] });
    authMock.logout.mockClear();
    notifMock.unreadCount.set(3);
    notifMock.isOpen.set(false);
    notifMock.connectionState.set('connected');
    notifMock.initialize.mockClear();
    notifMock.teardown.mockClear();
    notifMock.togglePanel.mockClear();
    notifMock.closePanel.mockClear();

    await TestBed.configureTestingModule({
      imports: [TopNavComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authMock },
        { provide: NotificationService, useValue: notifMock },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TopNavComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should emit toggleSidebar on sidebar toggle', () => {
    fixture.detectChanges();
    let emitted = false;
    component.toggleSidebar.subscribe(() => (emitted = true));

    component.onToggleSidebar();
    expect(emitted).toBe(true);
  });

  it('should call logout on auth service', () => {
    fixture.detectChanges();
    component.logout();
    expect(authMock.logout).toHaveBeenCalled();
    expect(notifMock.teardown).toHaveBeenCalled();
  });

  // ─── Shell render ───────────────────────────────────────────────────
  describe('shell render', () => {
    it('renders the banner header with the toggle + logo', () => {
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="top-nav"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="sidebar-toggle"]')).toBeTruthy();
      const logo = el.querySelector('[data-testid="logo-link"]');
      expect(logo?.textContent?.trim()).toBe('Chora');
    });

    it('renders the tenant switcher', () => {
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('chora-tenant-switcher')).toBeTruthy();
    });

    it('reflects sidebarCollapsed=false via aria-expanded="true"', () => {
      fixture.detectChanges();
      const toggle = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="sidebar-toggle"]',
      );
      expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    });

    it('reflects sidebarCollapsed=true via aria-expanded="false"', () => {
      fixture.componentRef.setInput('sidebarCollapsed', true);
      fixture.detectChanges();
      const toggle = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="sidebar-toggle"]',
      );
      expect(toggle?.getAttribute('aria-expanded')).toBe('false');
      expect(component.sidebarCollapsed()).toBe(true);
    });
  });

  // ─── Authenticated render (user signal set) ─────────────────────────
  describe('when a user is signed in', () => {
    it('renders the notification bell, user avatar and logout button', () => {
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="notification-bell"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="user-avatar"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="logout-btn"]')).toBeTruthy();
    });

    it('renders the unread badge with the count when unread > 0', () => {
      notifMock.unreadCount.set(3);
      fixture.detectChanges();
      const badge = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="notification-badge"]',
      );
      expect(badge).toBeTruthy();
      expect(badge?.textContent?.trim()).toBe('3');
    });

    it('hides the unread badge when unread count is 0', () => {
      notifMock.unreadCount.set(0);
      fixture.detectChanges();
      const badge = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="notification-badge"]',
      );
      expect(badge).toBeNull();
    });

    it('caps the unread badge at "99+" when over 99', () => {
      notifMock.unreadCount.set(150);
      fixture.detectChanges();
      const badge = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="notification-badge"]',
      );
      expect(badge?.textContent?.trim()).toBe('99+');
    });

    it('derives the avatar initial from the displayName', () => {
      fixture.detectChanges();
      const avatar = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="user-avatar"]',
      );
      expect(avatar?.textContent?.trim()).toBe('J');
    });

    it('falls back to the email initial when displayName is empty', () => {
      authMock.user.set({ gcid: 'u2', displayName: '', email: 'zed@chora.io', tenantId: 't1', roles: [], capabilities: [] });
      fixture.detectChanges();
      const avatar = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="user-avatar"]',
      );
      expect(avatar?.textContent?.trim()).toBe('Z');
    });

    it('renders the bell aria-label key with the unread count appended', () => {
      notifMock.unreadCount.set(5);
      fixture.detectChanges();
      const bell = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="notification-bell"]',
      );
      // Translate pipe returns the raw key; the count is concatenated.
      expect(bell?.getAttribute('aria-label')).toBe('notifications.bell_unread (5)');
    });

    it('renders the plain bell aria-label key when there are no unread', () => {
      notifMock.unreadCount.set(0);
      fixture.detectChanges();
      const bell = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="notification-bell"]',
      );
      expect(bell?.getAttribute('aria-label')).toBe('notifications.bell');
    });

    it('does NOT render the notification center while the panel is closed', () => {
      notifMock.isOpen.set(false);
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('chora-notification-center'),
      ).toBeNull();
    });

    it('renders the notification center when the panel is open', () => {
      notifMock.isOpen.set(true);
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('chora-notification-center'),
      ).toBeTruthy();
    });

    it('reflects the open panel state via aria-expanded on the bell', () => {
      notifMock.isOpen.set(true);
      fixture.detectChanges();
      const bell = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="notification-bell"]',
      );
      expect(bell?.getAttribute('aria-expanded')).toBe('true');
    });
  });

  // ─── Unauthenticated render (user signal null) ──────────────────────
  describe('when no user is signed in', () => {
    beforeEach(() => {
      authMock.user.set(null);
    });

    it('hides the notification bell, avatar and logout', () => {
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="notification-bell"]')).toBeNull();
      expect(el.querySelector('[data-testid="user-avatar"]')).toBeNull();
      expect(el.querySelector('[data-testid="logout-btn"]')).toBeNull();
    });

    it('still renders the shell (toggle + logo + tenant switcher)', () => {
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="sidebar-toggle"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="logo-link"]')).toBeTruthy();
      expect(el.querySelector('chora-tenant-switcher')).toBeTruthy();
    });

    it('does NOT initialize notifications on ngOnInit', () => {
      fixture.detectChanges(); // triggers ngOnInit
      expect(notifMock.initialize).not.toHaveBeenCalled();
    });
  });

  // ─── Lifecycle ──────────────────────────────────────────────────────
  describe('lifecycle', () => {
    it('initializes notifications on ngOnInit when a user is present', () => {
      fixture.detectChanges(); // triggers ngOnInit
      expect(notifMock.initialize).toHaveBeenCalledTimes(1);
    });

    it('tears down notifications on ngOnDestroy', () => {
      fixture.detectChanges();
      notifMock.teardown.mockClear();
      fixture.destroy();
      expect(notifMock.teardown).toHaveBeenCalled();
    });
  });

  // ─── User interactions ──────────────────────────────────────────────
  describe('user interactions', () => {
    it('clicking the sidebar toggle emits toggleSidebar', () => {
      fixture.detectChanges();
      let emitted = false;
      component.toggleSidebar.subscribe(() => (emitted = true));
      const toggle = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="sidebar-toggle"]',
      ) as HTMLButtonElement;
      toggle.click();
      expect(emitted).toBe(true);
    });

    it('clicking the bell toggles the notification panel and stops propagation', () => {
      fixture.detectChanges();
      const stopProp = vi.fn();
      const evt = { stopPropagation: stopProp } as unknown as Event;
      component.onToggleNotifications(evt);
      expect(stopProp).toHaveBeenCalled();
      expect(notifMock.togglePanel).toHaveBeenCalledTimes(1);
    });

    it('clicking the bell button in the DOM toggles the panel', () => {
      fixture.detectChanges();
      const bell = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="notification-bell"]',
      ) as HTMLButtonElement;
      bell.click();
      expect(notifMock.togglePanel).toHaveBeenCalled();
    });

    it('clicking the logout button calls logout (teardown + auth.logout)', () => {
      fixture.detectChanges();
      const btn = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="logout-btn"]',
      ) as HTMLButtonElement;
      btn.click();
      expect(notifMock.teardown).toHaveBeenCalled();
      expect(authMock.logout).toHaveBeenCalled();
    });
  });

  // ─── Document click outside-close (HostListener) ────────────────────
  describe('document click handling', () => {
    it('closes the panel when clicking outside the bell/panel', () => {
      fixture.detectChanges();
      const outside = document.createElement('div');
      document.body.appendChild(outside);
      const evt = { target: outside } as unknown as Event;
      component.onDocumentClick(evt);
      expect(notifMock.closePanel).toHaveBeenCalled();
      outside.remove();
    });

    it('does NOT close the panel when clicking inside the bell', () => {
      fixture.detectChanges();
      const bell = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="notification-bell"]',
      ) as HTMLElement;
      const evt = { target: bell } as unknown as Event;
      component.onDocumentClick(evt);
      expect(notifMock.closePanel).not.toHaveBeenCalled();
    });

    it('does NOT close the panel when clicking inside the notification panel', () => {
      fixture.detectChanges();
      const inner = document.createElement('div');
      const panel = document.createElement('div');
      panel.setAttribute('data-testid', 'notification-panel');
      panel.appendChild(inner);
      document.body.appendChild(panel);
      const evt = { target: inner } as unknown as Event;
      component.onDocumentClick(evt);
      expect(notifMock.closePanel).not.toHaveBeenCalled();
      panel.remove();
    });

    it('closes the panel via a real document click outside', () => {
      fixture.detectChanges();
      const outside = document.createElement('div');
      document.body.appendChild(outside);
      outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(notifMock.closePanel).toHaveBeenCalled();
      outside.remove();
    });
  });

  // ─── reconnectingAriaLive() suppression effect (TS-side, chip hidden) ─
  //
  // The visible chip lives in an `@if (false)` block, but the underlying
  // computed + arming-effect run regardless. These exercise the TS logic
  // through the public `reconnectingAriaLive()` computed using zone
  // fakeAsync (Angular tick) — NEVER vi.useFakeTimers under zone.
  describe('reconnecting aria-live suppression logic', () => {
    afterEach(() => {
      notifMock.connectionState.set('connected');
    });

    it('starts disarmed ("off") while connected', () => {
      fixture.detectChanges();
      expect(component.reconnectingAriaLive()).toBe('off');
    });

    it('arms to "polite" on first entry into reconnecting', () => {
      fixture.detectChanges();
      notifMock.connectionState.set('reconnecting');
      fixture.detectChanges();
      expect(component.reconnectingAriaLive()).toBe('polite');
    });

    it('disarms to "off" after the suppression-window timer fires', async () => {
      // NOTE: this spec file imports describe/it from 'vitest', which is
      // incompatible with Angular fakeAsync (ProxyZone), and zone fakeAsync
      // forbids vi.useFakeTimers (Date-not-defined). We therefore exercise
      // the real setTimeout callback directly by capturing it via a spy on
      // the global, then invoking it synchronously — no 10s wall-clock wait.
      const original = globalThis.setTimeout;
      let captured: (() => void) | null = null;
      const spy = vi
        .spyOn(globalThis, 'setTimeout')
        .mockImplementation(((cb: () => void) => {
          captured = cb;
          return 0 as unknown as ReturnType<typeof setTimeout>;
        }) as typeof setTimeout);
      try {
        fixture.detectChanges();
        notifMock.connectionState.set('reconnecting');
        fixture.detectChanges();
        expect(component.reconnectingAriaLive()).toBe('polite');
        expect(captured).not.toBeNull();
        // Fire the suppression-window callback.
        captured!();
        fixture.detectChanges();
        expect(component.reconnectingAriaLive()).toBe('off');
      } finally {
        spy.mockRestore();
        globalThis.setTimeout = original;
      }
    });

    it('disarms immediately when the connection leaves reconnecting', () => {
      fixture.detectChanges();
      notifMock.connectionState.set('reconnecting');
      fixture.detectChanges();
      expect(component.reconnectingAriaLive()).toBe('polite');
      // Back online before the window elapses → live region disarms.
      notifMock.connectionState.set('connected');
      fixture.detectChanges();
      expect(component.reconnectingAriaLive()).toBe('off');
    });

    it('re-arms after a disarm then a fresh disconnect', () => {
      fixture.detectChanges();
      notifMock.connectionState.set('reconnecting');
      fixture.detectChanges();
      expect(component.reconnectingAriaLive()).toBe('polite');
      // Leave reconnecting (clears the pending timer + disarms).
      notifMock.connectionState.set('connected');
      fixture.detectChanges();
      expect(component.reconnectingAriaLive()).toBe('off');
      // A fresh disconnect should announce again.
      notifMock.connectionState.set('reconnecting');
      fixture.detectChanges();
      expect(component.reconnectingAriaLive()).toBe('polite');
    });

    it('clears the pending suppression timer on ngOnDestroy (no leak, teardown runs)', () => {
      const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
      try {
        fixture.detectChanges();
        notifMock.connectionState.set('reconnecting');
        fixture.detectChanges();
        expect(component.reconnectingAriaLive()).toBe('polite');
        // Destroying while the timer is still pending must clearTimeout it
        // and still tear down notifications — see ngOnDestroy.
        fixture.destroy();
        expect(clearSpy).toHaveBeenCalled();
        expect(notifMock.teardown).toHaveBeenCalled();
      } finally {
        clearSpy.mockRestore();
      }
    });
  });

  // ─── Reconnecting toast a11y suppression (WCAG 2.1 AA) ──────────────
  //
  // Per `docs/m13/cj1-ui-design-refinement-plan-2026-05-17.md` §Accessibility:
  // the "Reconnecting…" pill should announce on FIRST entry into reconnecting
  // state, then suppress subsequent re-announcements (aria-live="off") while
  // the WS backoff loop flaps. After 10s the live region re-arms.
  //
  // TODO(top-nav): the visible "Reconnecting…" chip was removed from the
  // template 2026-05-17 ("not serving any meaningful purpose") — it now
  // sits inside an `@if (false)` block in `top-nav.component.html`, so
  // the `[data-testid="ws-reconnecting"]` element is never rendered.
  // The TS-side `reconnectingAriaLive()` suppression logic is still
  // exercised by `notification-center` consumers. Re-enable this suite
  // when the chip (or an equivalent live-region target) returns to the
  // top-nav template.
  describe.skip('reconnecting toast a11y suppression', () => {
    afterEach(() => {
      // Reset the shared signal so the next test starts on `'connected'`.
      notifMock.connectionState.set('connected');
      vi.useRealTimers();
    });

    it('renders the pill visually while connectionState=reconnecting', () => {
      fixture.detectChanges();
      notifMock.connectionState.set('reconnecting');
      fixture.detectChanges();
      const pill = fixture.nativeElement.querySelector(
        '[data-testid="ws-reconnecting"]',
      );
      expect(pill).toBeTruthy();
    });

    it('aria-live is "polite" on first entry into reconnecting', () => {
      fixture.detectChanges();
      notifMock.connectionState.set('reconnecting');
      fixture.detectChanges();
      const pill = fixture.nativeElement.querySelector(
        '[data-testid="ws-reconnecting"]',
      );
      expect(pill?.getAttribute('aria-live')).toBe('polite');
    });

    it('aria-live switches to "off" after the 10s suppression window', () => {
      vi.useFakeTimers();
      fixture.detectChanges();
      notifMock.connectionState.set('reconnecting');
      fixture.detectChanges();
      // Advance past the 10_000ms suppression window.
      vi.advanceTimersByTime(11_000);
      fixture.detectChanges();
      const pill = fixture.nativeElement.querySelector(
        '[data-testid="ws-reconnecting"]',
      );
      expect(pill?.getAttribute('aria-live')).toBe('off');
    });

    it('re-arms the live region after a clean reconnect (connected → reconnecting again)', () => {
      vi.useFakeTimers();
      fixture.detectChanges();
      notifMock.connectionState.set('reconnecting');
      fixture.detectChanges();
      vi.advanceTimersByTime(11_000);
      fixture.detectChanges();
      // Briefly come back online — clears suppression.
      notifMock.connectionState.set('connected');
      fixture.detectChanges();
      // A fresh disconnect should announce again.
      notifMock.connectionState.set('reconnecting');
      fixture.detectChanges();
      const pill = fixture.nativeElement.querySelector(
        '[data-testid="ws-reconnecting"]',
      );
      expect(pill?.getAttribute('aria-live')).toBe('polite');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// C2: the A+ shell. The yields strip lands in the top bar, the reserved
// "mode toggle" slot is retired, and the sidebar toggle disappears on A+
// because there is no sidebar there to toggle.
// ─────────────────────────────────────────────────────────────────────────
describe('TopNavComponent A+ shell', () => {
  const authMock = {
    user: signal<unknown>({
      gcid: 'user-1',
      displayName: 'Jane',
      email: 'jane@chora.io',
      tenantId: 't1',
      roles: [],
      capabilities: [],
    }),
    logout: vi.fn(),
  };

  const notifMock = {
    unreadCount: signal(0),
    isOpen: signal(false),
    connectionState: signal('connected'),
    initialize: vi.fn(),
    teardown: vi.fn(),
    togglePanel: vi.fn(),
    closePanel: vi.fn(),
    activeTab: signal('all'),
    filteredNotifications: signal([]),
    loading: signal(false),
    hasMore: signal(false),
    setActiveTab: vi.fn(),
    markAsRead: vi.fn(),
    markAsUnread: vi.fn(),
    togglePin: vi.fn(),
    executeAction: vi.fn(),
    loadMore: vi.fn(),
  };

  async function render(compassShell: boolean): Promise<HTMLElement> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [TopNavComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authMock },
        { provide: NotificationService, useValue: notifMock },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    }).compileComponents();
    const f = TestBed.createComponent(TopNavComponent);
    f.componentRef.setInput('compassShell', compassShell);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  it('renders the yields strip on the A+ shell', async () => {
    const el = await render(true);
    expect(el.querySelector('chora-yields-strip')).toBeTruthy();
  });

  it('renders NO yields strip off the A+ shell', async () => {
    const el = await render(false);
    expect(el.querySelector('chora-yields-strip')).toBeNull();
  });

  it('hides the sidebar toggle on the A+ shell, where there is no sidebar', async () => {
    const el = await render(true);
    expect(el.querySelector('[data-testid="sidebar-toggle"]')).toBeNull();
  });

  it('keeps the sidebar toggle on the surfaces that still have a sidebar', async () => {
    const el = await render(false);
    expect(el.querySelector('[data-testid="sidebar-toggle"]')).toBeTruthy();
  });

  it('has retired the reserved mode-toggle slot entirely', async () => {
    // Plan section 3.1: the slot at top-nav.component.html:18 was reserved for a
    // Straight-Up / Discovery switch that ADR-141 and Tier 4 D16 forbid (no
    // toggles; role-driven visibility). An empty <nav> landmark also announces
    // itself to a screen reader as "Primary navigation" containing nothing.
    const el = await render(false);
    expect(el.querySelector('.top-nav__center')).toBeNull();
    expect(el.querySelector('nav[aria-label="Primary navigation"]')).toBeNull();
  });
});
