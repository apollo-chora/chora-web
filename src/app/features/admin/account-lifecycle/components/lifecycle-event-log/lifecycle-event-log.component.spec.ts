import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { LifecycleEventLogComponent } from './lifecycle-event-log.component';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../../environments/environment';
import type {
  LifecycleEvent,
  LifecycleEventListResponse,
} from '../../models/account-lifecycle.model';

const GCID = 'gcid-0192abcd';

function eventsUrl(gcid = GCID, page = 1, pageSize = 50): string {
  return `${environment.bffBaseUrl}/api/v1/admin/accounts/${encodeURIComponent(
    gcid,
  )}/lifecycle-events?page=${page}&pageSize=${pageSize}`;
}

const STUB_EVENTS: LifecycleEvent[] = [
  {
    id: 'evt-001',
    gcid: GCID,
    eventType: 'account_created',
    actor: 'system@chora.site',
    actorType: 'system',
    createdAt: '2026-05-01T08:00:00Z',
  },
  {
    id: 'evt-002',
    gcid: GCID,
    eventType: 'account_suspended',
    actor: 'admin@mtm.sg',
    actorType: 'admin',
    reason: 'Policy violation flagged by moderation',
    createdAt: '2026-05-02T09:30:00Z',
  },
];

function response(
  events: LifecycleEvent[],
  total = events.length,
  page = 1,
  pageSize = 50,
): LifecycleEventListResponse {
  return { events, total, page, pageSize };
}

/**
 * Build a component fixture with the required `gcid` input set BEFORE the
 * first change-detection cycle (ngOnInit reads gcid() to fire the GET).
 */
function buildFixture(gcid = GCID): {
  fixture: ComponentFixture<LifecycleEventLogComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [LifecycleEventLogComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
    ],
  });
  const fixture = TestBed.createComponent(LifecycleEventLogComponent);
  fixture.componentRef.setInput('gcid', gcid);
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, httpMock };
}

describe('LifecycleEventLogComponent', () => {
  let fixture: ComponentFixture<LifecycleEventLogComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = buildFixture();
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -----------------------------------------------------------------------
  // Shell render + initial load
  // -----------------------------------------------------------------------

  describe('shell + initial load', () => {
    it('creates the component', () => {
      fixture.detectChanges();
      httpMock.expectOne(eventsUrl()).flush(response(STUB_EVENTS));
      expect(fixture.componentInstance).toBeTruthy();
    });

    it('renders the root section with the event-log testid', () => {
      fixture.detectChanges();
      httpMock.expectOne(eventsUrl()).flush(response(STUB_EVENTS));
      fixture.detectChanges();
      const root = element.querySelector('[data-testid="lifecycle-event-log"]');
      expect(root).not.toBeNull();
      expect(root?.tagName).toBe('SECTION');
    });

    it('shows the GCID in the subtitle', () => {
      fixture.detectChanges();
      httpMock.expectOne(eventsUrl()).flush(response(STUB_EVENTS));
      fixture.detectChanges();
      const subtitle = element.querySelector('.lifecycle-event-log__subtitle');
      expect(subtitle?.textContent).toContain(GCID);
    });

    it('renders a back link and refresh button', () => {
      fixture.detectChanges();
      httpMock.expectOne(eventsUrl()).flush(response(STUB_EVENTS));
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="btn-back"]')).not.toBeNull();
      expect(
        element.querySelector('[data-testid="btn-refresh-events"]'),
      ).not.toBeNull();
    });

    it('fires the initial lifecycle-events GET on ngOnInit', () => {
      fixture.detectChanges();
      const req = httpMock.expectOne(eventsUrl());
      expect(req.request.method).toBe('GET');
      req.flush(response(STUB_EVENTS));
    });
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  describe('loading state', () => {
    it('shows the skeleton loader while the request is in flight', () => {
      fixture.detectChanges();
      const req = httpMock.expectOne(eventsUrl());

      // Request pending → loading() true → skeleton rendered, no timeline.
      expect(fixture.componentInstance.loading()).toBe(true);
      const loadingEl = element.querySelector('[data-testid="events-loading"]');
      expect(loadingEl).not.toBeNull();
      expect(
        element.querySelector('[data-testid="event-timeline"]'),
      ).toBeNull();

      req.flush(response(STUB_EVENTS));
    });

    it('hides the skeleton once the response arrives', () => {
      fixture.detectChanges();
      httpMock.expectOne(eventsUrl()).flush(response(STUB_EVENTS));
      fixture.detectChanges();
      expect(fixture.componentInstance.loading()).toBe(false);
      expect(
        element.querySelector('[data-testid="events-loading"]'),
      ).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Ready state — timeline render
  // -----------------------------------------------------------------------

  describe('ready state — timeline', () => {
    beforeEach(() => {
      fixture.detectChanges();
      httpMock.expectOne(eventsUrl()).flush(response(STUB_EVENTS));
      fixture.detectChanges();
    });

    it('renders one timeline entry per event', () => {
      const entries = element.querySelectorAll(
        '[data-testid^="event-evt-"]',
      );
      expect(entries.length).toBe(2);
    });

    it('populates the events + totalEvents signals from the response', () => {
      expect(fixture.componentInstance.events().length).toBe(2);
      expect(fixture.componentInstance.totalEvents()).toBe(2);
    });

    it('renders the event-type label as an i18n key for each event', () => {
      const created = element.querySelector('[data-testid="event-evt-001"]');
      // TranslatePipe returns the raw key in tests.
      expect(created?.textContent).toContain(
        'admin.account_lifecycle.event_account_created',
      );
    });

    it('renders the actor + actor-type for each event', () => {
      const suspended = element.querySelector('[data-testid="event-evt-002"]');
      expect(suspended?.textContent).toContain('admin@mtm.sg');
      expect(suspended?.textContent).toContain('(admin)');
    });

    it('shows the reason only on events that carry one', () => {
      const created = element.querySelector('[data-testid="event-evt-001"]');
      const suspended = element.querySelector('[data-testid="event-evt-002"]');
      expect(
        created?.querySelector('[data-testid="event-reason"]'),
      ).toBeNull();
      const reason = suspended?.querySelector(
        '[data-testid="event-reason"]',
      );
      expect(reason).not.toBeNull();
      expect(reason?.textContent).toContain('Policy violation');
    });

    it('applies the event-type badge class for the event', () => {
      const created = element.querySelector('[data-testid="event-evt-001"]');
      const badge = created?.querySelector(
        '.lifecycle-event-log__event-badge',
      );
      expect(badge?.className).toContain(
        'lifecycle-event-log__event-badge--account_created',
      );
    });

    it('does not render the empty-state when events exist', () => {
      expect(
        element.querySelector('[data-testid="events-empty"]'),
      ).toBeNull();
      expect(fixture.componentInstance.isEmpty()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------

  describe('empty state', () => {
    beforeEach(() => {
      fixture.detectChanges();
      httpMock.expectOne(eventsUrl()).flush(response([], 0));
      fixture.detectChanges();
    });

    it('renders the empty-state message when no events are returned', () => {
      const empty = element.querySelector('[data-testid="events-empty"]');
      expect(empty).not.toBeNull();
      expect(empty?.textContent).toContain(
        'admin.account_lifecycle.no_events',
      );
    });

    it('reports isEmpty() true and does not render the timeline', () => {
      expect(fixture.componentInstance.isEmpty()).toBe(true);
      expect(
        element.querySelector('[data-testid="event-timeline"]'),
      ).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  describe('error state', () => {
    it('shows a toast and clears loading on a 500 error', () => {
      const toast = TestBed.inject(ToastService);
      const spy = vi.spyOn(toast, 'show');

      fixture.detectChanges();
      httpMock
        .expectOne(eventsUrl())
        .flush(
          { error: 'internal' },
          { status: 500, statusText: 'Server Error' },
        );
      fixture.detectChanges();

      expect(spy).toHaveBeenCalledWith(
        'admin.account_lifecycle.events_load_error',
        'error',
      );
      expect(fixture.componentInstance.loading()).toBe(false);
    });

    it('falls into the empty-state after an error (no events loaded)', () => {
      fixture.detectChanges();
      httpMock
        .expectOne(eventsUrl())
        .flush(
          { error: 'not found' },
          { status: 404, statusText: 'Not Found' },
        );
      fixture.detectChanges();

      // events() stays [] and loading() is false → isEmpty() true.
      expect(fixture.componentInstance.isEmpty()).toBe(true);
      expect(
        element.querySelector('[data-testid="events-empty"]'),
      ).not.toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Refresh interaction
  // -----------------------------------------------------------------------

  describe('refresh', () => {
    it('refetches the current page when the refresh button is clicked', () => {
      fixture.detectChanges();
      httpMock.expectOne(eventsUrl()).flush(response(STUB_EVENTS));
      fixture.detectChanges();

      (
        element.querySelector(
          '[data-testid="btn-refresh-events"]',
        ) as HTMLButtonElement
      ).click();

      const refetch = httpMock.expectOne(eventsUrl());
      expect(refetch.request.method).toBe('GET');
      refetch.flush(response([STUB_EVENTS[0]], 1));
      fixture.detectChanges();

      expect(fixture.componentInstance.events().length).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Pagination
  // -----------------------------------------------------------------------

  describe('pagination', () => {
    it('does not render the pagination nav when there is a single page', () => {
      fixture.detectChanges();
      httpMock.expectOne(eventsUrl()).flush(response(STUB_EVENTS, 2));
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="pagination"]')).toBeNull();
      expect(fixture.componentInstance.totalPages()).toBe(1);
    });

    it('renders pagination + disables prev on the first page when multi-page', () => {
      fixture.detectChanges();
      // total 120, pageSize 50 → 3 pages
      httpMock.expectOne(eventsUrl()).flush(response(STUB_EVENTS, 120));
      fixture.detectChanges();

      expect(fixture.componentInstance.totalPages()).toBe(3);
      expect(element.querySelector('[data-testid="pagination"]')).not.toBeNull();

      const prev = element.querySelector(
        '[data-testid="btn-prev-page"]',
      ) as HTMLButtonElement;
      const next = element.querySelector(
        '[data-testid="btn-next-page"]',
      ) as HTMLButtonElement;
      expect(prev.disabled).toBe(true);
      expect(next.disabled).toBe(false);
    });

    it('advances to the next page and refetches with the new page param', () => {
      fixture.detectChanges();
      httpMock.expectOne(eventsUrl()).flush(response(STUB_EVENTS, 120));
      fixture.detectChanges();

      (
        element.querySelector(
          '[data-testid="btn-next-page"]',
        ) as HTMLButtonElement
      ).click();

      expect(fixture.componentInstance.currentPage()).toBe(2);
      const page2 = httpMock.expectOne(eventsUrl(GCID, 2, 50));
      expect(page2.request.method).toBe('GET');
      page2.flush(response(STUB_EVENTS, 120, 2));
      fixture.detectChanges();

      // page-info reflects the new page.
      const info = element.querySelector('.lifecycle-event-log__page-info');
      expect(info?.textContent).toContain('2 / 3');
    });

    it('goToPage ignores out-of-range page numbers (no extra fetch)', () => {
      fixture.detectChanges();
      httpMock.expectOne(eventsUrl()).flush(response(STUB_EVENTS, 120));
      fixture.detectChanges();

      const component = fixture.componentInstance;
      // Below lower bound — no-op.
      component.goToPage(0);
      expect(component.currentPage()).toBe(1);
      // Above upper bound (totalPages = 3) — no-op.
      component.goToPage(4);
      expect(component.currentPage()).toBe(1);
      // afterEach httpMock.verify() asserts no stray requests fired.
    });
  });

  // -----------------------------------------------------------------------
  // Pure helpers
  // -----------------------------------------------------------------------

  describe('helpers', () => {
    let component: LifecycleEventLogComponent;

    beforeEach(() => {
      fixture.detectChanges();
      httpMock.expectOne(eventsUrl()).flush(response(STUB_EVENTS));
      fixture.detectChanges();
      component = fixture.componentInstance;
    });

    it('eventTypeClass builds a BEM modifier from the event type', () => {
      expect(component.eventTypeClass('role_assigned')).toBe(
        'lifecycle-event-log__event-badge--role_assigned',
      );
    });

    it('actorTypeClass builds a BEM modifier from the actor type', () => {
      expect(component.actorTypeClass('admin')).toBe(
        'lifecycle-event-log__actor--admin',
      );
    });

    it('getEventLabel maps a known event type to its i18n key', () => {
      expect(component.getEventLabel('email_changed')).toBe(
        'admin.account_lifecycle.event_email_changed',
      );
    });

    it('getEventLabel falls back to the raw type for an unknown event', () => {
      // Characterizes the ?? fallback branch.
      expect(
        component.getEventLabel('totally_unknown' as never),
      ).toBe('totally_unknown');
    });

    it('formatDateTime renders a valid ISO timestamp via toLocaleString', () => {
      const out = component.formatDateTime('2026-05-01T08:00:00Z');
      // Locale-formatted output differs from the raw ISO string and is non-empty.
      expect(out.length).toBeGreaterThan(0);
      expect(out).not.toBe('2026-05-01T08:00:00Z');
    });

    it('formatDateTime returns a non-throwing string for an unparseable input', () => {
      // new Date('not-a-date') yields Invalid Date; toLocaleString → "Invalid Date".
      const out = component.formatDateTime('not-a-date');
      expect(typeof out).toBe('string');
    });
  });

  // -----------------------------------------------------------------------
  // Lifecycle teardown
  // -----------------------------------------------------------------------

  describe('teardown', () => {
    it('unsubscribes on destroy without leaking pending requests', () => {
      fixture.detectChanges();
      httpMock.expectOne(eventsUrl()).flush(response(STUB_EVENTS));
      fixture.detectChanges();
      // ngOnDestroy should not throw.
      expect(() => fixture.destroy()).not.toThrow();
    });
  });
});
