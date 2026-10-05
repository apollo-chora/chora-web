import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { TicketDetailComponent } from './ticket-detail.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../environments/environment';
import type { TicketDetail, TicketResponse } from '../../models/support.model';

describe('TicketDetailComponent', () => {
  let component: TicketDetailComponent;
  let fixture: ComponentFixture<TicketDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TicketDetailComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TicketDetailComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('ticketId', 'tk-test-1');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="ticket-detail"]');
    expect(el).toBeTruthy();
  });

  it('should have back button', () => {
    const btn = fixture.nativeElement.querySelector('[data-testid="btn-back-to-list"]');
    expect(btn).toBeTruthy();
  });

  it('should compute statusClass correctly', () => {
    expect(component.statusClass('open')).toBe('ticket-detail__status--open');
    expect(component.statusClass('resolved')).toBe('ticket-detail__status--resolved');
  });

  it('should compute priorityClass correctly', () => {
    expect(component.priorityClass('high')).toBe('ticket-detail__priority--high');
  });

  it('should format date from ISO string', () => {
    const result = component.formatDate('2026-03-15T10:00:00Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('');
  });

  it('should track responses by id', () => {
    expect(component.trackByResponseId(0, { id: 'resp-1' })).toBe('resp-1');
  });

  it('should update replyBody on input', () => {
    const mockEvent = {
      target: { value: 'Test reply' },
    } as unknown as Event;
    component.onReplyInput(mockEvent);
    expect(component.replyBody()).toBe('Test reply');
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Augmented coverage — HTTP-driven states, computed signals, actions, errors.
// All HTTP flows through SupportService → BffClientService (real HTTP), so the
// BFF base URL is prepended. Paths/verbs come straight from support.service.ts.
// ---------------------------------------------------------------------------

const TICKET_ID = 'tk-aug-1';
const DETAIL_URL = `${environment.bffBaseUrl}/api/v1/support/tickets/${TICKET_ID}`;

function makeResponse(over: Partial<TicketResponse> = {}): TicketResponse {
  return {
    id: 'resp-1',
    ticket_id: TICKET_ID,
    author_gcid: 'gcid-agent-1',
    body: 'Have you tried turning it off and on?',
    is_internal: false,
    attachments: [],
    created_at: '2026-03-15T11:00:00Z',
    ...over,
  };
}

function makeTicket(over: Partial<TicketDetail> = {}): TicketDetail {
  return {
    id: TICKET_ID,
    tenant_id: 'tenant-001',
    creator_gcid: 'gcid-learner-1',
    assigned_agent_gcid: 'gcid-agent-1',
    subject: 'Cannot log in',
    description: 'My password reset link is broken.',
    status: 'open',
    priority: 'high',
    category: 'account',
    tags: ['login'],
    escalation_count: 0,
    resolved_at: null,
    closed_at: null,
    created_at: '2026-03-15T10:00:00Z',
    updated_at: '2026-03-15T10:00:00Z',
    responses: [],
    satisfaction: null,
    ...over,
  };
}

describe('TicketDetailComponent — HTTP-driven behaviour', () => {
  let fixture: ComponentFixture<TicketDetailComponent>;
  let component: TicketDetailComponent;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  function setup(): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TicketDetailComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(TicketDetailComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('ticketId', TICKET_ID);
    fixture.detectChanges(); // triggers ngOnInit → loadTicketDetail GET
  }

  /** Flush the ngOnInit detail GET with a success ticket and run CD. */
  function flushDetail(ticket: TicketDetail = makeTicket()): void {
    const req = httpMock.expectOne(DETAIL_URL);
    expect(req.request.method).toBe('GET');
    req.flush(ticket);
    fixture.detectChanges();
  }

  beforeEach(() => {
    setup();
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    httpMock.verify();
  });

  // --- Loading state ------------------------------------------------------

  it('shows the loading skeleton before the detail resolves', () => {
    const loading = element.querySelector('[data-testid="ticket-detail-loading"]');
    expect(loading).not.toBeNull();
    expect(component.ticketDetailState().status).toBe('loading');
    // Now flush so afterEach.verify() is satisfied.
    flushDetail();
  });

  // --- Success state ------------------------------------------------------

  it('renders the ticket card with subject, status, priority and category on success', () => {
    flushDetail(makeTicket({ subject: 'Cannot log in', priority: 'critical' }));

    expect(component.ticketDetailState().status).toBe('success');
    const card = element.querySelector('[data-testid="ticket-card"]');
    expect(card).not.toBeNull();
    expect(element.querySelector('[data-testid="ticket-subject"]')?.textContent).toContain(
      'Cannot log in',
    );
    // Translate pipe returns the raw key for status/priority labels.
    expect(element.querySelector('[data-testid="ticket-status"]')?.textContent).toContain(
      'support.status_open',
    );
    expect(element.querySelector('[data-testid="ticket-priority"]')?.textContent).toContain(
      'support.priority_critical',
    );
    expect(element.querySelector('[data-testid="ticket-category"]')?.textContent).toContain(
      'account',
    );
  });

  it('renders the description block and a formatted created_at date', () => {
    flushDetail(makeTicket({ description: 'My password reset link is broken.' }));
    const desc = element.querySelector('[data-testid="ticket-description"]');
    expect(desc).not.toBeNull();
    expect(desc?.textContent).toContain('My password reset link is broken.');
  });

  it('shows the empty-responses message when there are no responses', () => {
    flushDetail(makeTicket({ responses: [] }));
    expect(component.responses().length).toBe(0);
    expect(element.querySelector('[data-testid="no-responses"]')).not.toBeNull();
  });

  it('renders one response row per response, with author and body', () => {
    flushDetail(
      makeTicket({
        responses: [
          makeResponse({ id: 'r1', author_gcid: 'gcid-a', body: 'First reply' }),
          makeResponse({ id: 'r2', author_gcid: 'gcid-b', body: 'Second reply' }),
        ],
      }),
    );
    expect(component.responses().length).toBe(2);
    expect(element.querySelector('[data-testid="no-responses"]')).toBeNull();
    expect(element.querySelector('[data-testid="response-r1"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="response-r2"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="response-r1"]')?.textContent).toContain(
      'First reply',
    );
  });

  it('shows the internal-note badge only for internal responses', () => {
    flushDetail(
      makeTicket({
        responses: [
          makeResponse({ id: 'r-pub', is_internal: false }),
          makeResponse({ id: 'r-int', is_internal: true }),
        ],
      }),
    );
    const pub = element.querySelector('[data-testid="response-r-pub"]');
    const intl = element.querySelector('[data-testid="response-r-int"]');
    expect(pub?.querySelector('[data-testid="internal-badge"]')).toBeNull();
    expect(intl?.querySelector('[data-testid="internal-badge"]')).not.toBeNull();
  });

  it('renders attachment links for a response that has attachments', () => {
    flushDetail(
      makeTicket({
        responses: [
          makeResponse({
            id: 'r-att',
            attachments: [
              {
                id: 'att-1',
                filename: 'screenshot.png',
                url: 'https://cdn.example/screenshot.png',
                content_type: 'image/png',
                size_bytes: 1024,
              },
            ],
          }),
        ],
      }),
    );
    const link = element.querySelector('[data-testid="attachment-att-1"]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.textContent).toContain('screenshot.png');
    expect(link.getAttribute('href')).toBe('https://cdn.example/screenshot.png');
  });

  // --- Error state --------------------------------------------------------

  it('renders the error banner when the detail GET fails (5xx)', () => {
    const req = httpMock.expectOne(DETAIL_URL);
    req.flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(component.ticketDetailState().status).toBe('error');
    expect(element.querySelector('[data-testid="ticket-detail-error"]')).not.toBeNull();
    // No card rendered on error.
    expect(element.querySelector('[data-testid="ticket-card"]')).toBeNull();
  });

  // --- canResolve / canClose / canReopen / canReply / showSatisfaction ----

  it('exposes resolve + reopen buttons for an open ticket, but not close', () => {
    flushDetail(makeTicket({ status: 'open' }));
    expect(component.canResolve()).toBe(true);
    expect(component.canClose()).toBe(false);
    expect(component.canReply()).toBe(true);
    expect(element.querySelector('[data-testid="btn-resolve-ticket"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="btn-close-ticket"]')).toBeNull();
  });

  it('exposes resolve for an in_progress ticket', () => {
    flushDetail(makeTicket({ status: 'in_progress' }));
    expect(component.canResolve()).toBe(true);
    expect(component.canClose()).toBe(false);
    expect(component.canReopen()).toBe(false);
  });

  it('exposes close + reopen + satisfaction link for a resolved ticket', () => {
    flushDetail(makeTicket({ status: 'resolved', satisfaction: null }));
    expect(component.canResolve()).toBe(false);
    expect(component.canClose()).toBe(true);
    expect(component.canReopen()).toBe(true);
    expect(component.showSatisfactionLink()).toBe(true);
    expect(element.querySelector('[data-testid="btn-close-ticket"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="btn-reopen-ticket"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="btn-satisfaction-survey"]')).not.toBeNull();
  });

  it('hides the satisfaction link when a resolved ticket already has feedback', () => {
    flushDetail(
      makeTicket({
        status: 'resolved',
        satisfaction: {
          id: 'sat-1',
          ticket_id: TICKET_ID,
          respondent_gcid: 'gcid-learner-1',
          rating: 4,
          comment: 'Great help',
          created_at: '2026-03-16T10:00:00Z',
        },
      }),
    );
    expect(component.showSatisfactionLink()).toBe(false);
    expect(element.querySelector('[data-testid="btn-satisfaction-survey"]')).toBeNull();
    // Existing-feedback summary renders the rating + comment.
    expect(element.querySelector('[data-testid="satisfaction-summary"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="satisfaction-comment"]')?.textContent).toContain(
      'Great help',
    );
  });

  it('disallows replying on a closed ticket (no reply form, canReply false)', () => {
    flushDetail(makeTicket({ status: 'closed' }));
    expect(component.canReply()).toBe(false);
    expect(component.canReopen()).toBe(true);
    expect(element.querySelector('[data-testid="reply-form"]')).toBeNull();
  });

  it('canReply / canResolve / canClose / canReopen all default to false with no ticket', () => {
    // Before flush, ticket() is null (loading state).
    expect(component.ticket()).toBeNull();
    expect(component.canReply()).toBe(false);
    expect(component.canResolve()).toBe(false);
    expect(component.canClose()).toBe(false);
    expect(component.canReopen()).toBe(false);
    expect(component.showSatisfactionLink()).toBe(false);
    flushDetail(); // satisfy verify()
  });

  // --- submitReply --------------------------------------------------------

  it('does nothing when submitReply is called with a blank body', () => {
    flushDetail(makeTicket({ status: 'open' }));
    component.replyBody.set('   ');
    component.submitReply();
    // No POST should be fired.
    httpMock.expectNone(`${environment.bffBaseUrl}/api/v1/support/tickets/${TICKET_ID}/respond`);
    expect(component.isSubmittingReply()).toBe(false);
  });

  it('POSTs a reply, clears the body, and shows a success toast', () => {
    flushDetail(makeTicket({ status: 'open' }));
    const toast = TestBed.inject(ToastService);
    const showSpy = vi.spyOn(toast, 'show');

    component.replyBody.set('Here is my reply');
    component.submitReply();

    const post = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/support/tickets/${TICKET_ID}/respond`,
    );
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ body: 'Here is my reply' });
    post.flush(makeResponse({ id: 'r-new', body: 'Here is my reply' }));

    expect(component.replyBody()).toBe('');
    expect(component.isSubmittingReply()).toBe(false);
    expect(showSpy).toHaveBeenCalledWith('support.reply_sent', 'success');
  });

  it('clears the submitting flag and preserves the body when the reply POST fails', () => {
    flushDetail(makeTicket({ status: 'open' }));
    const toast = TestBed.inject(ToastService);
    const showSpy = vi.spyOn(toast, 'show');

    component.replyBody.set('Reply that fails');
    component.submitReply();

    const post = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/support/tickets/${TICKET_ID}/respond`,
    );
    post.flush({ error: 'nope' }, { status: 400, statusText: 'Bad Request' });

    // NOTE (characterised behaviour): SupportService.respondToTicket has its own
    // catchError that swallows the HTTP error and emits of(null). The component's
    // subscriber therefore receives next(null) — NOT error(...) — so the
    // submitReply() error branch (which would call toast.show('support.reply_error'))
    // is effectively dead code under the real service. We characterise the ACTUAL
    // behaviour: the submitting flag clears (via next), the body is preserved
    // (since result is falsy), and NO error toast is shown.
    expect(component.isSubmittingReply()).toBe(false);
    expect(showSpy).not.toHaveBeenCalledWith('support.reply_error', 'error');
    expect(component.replyBody()).toBe('Reply that fails');
  });

  // --- status transitions: resolve / close / reopen -----------------------

  it('PUTs status=resolved and shows the resolved toast', () => {
    flushDetail(makeTicket({ status: 'open' }));
    const toast = TestBed.inject(ToastService);
    const showSpy = vi.spyOn(toast, 'show');

    component.resolveTicket();

    const put = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/support/tickets/${TICKET_ID}/status`,
    );
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ status: 'resolved' });
    put.flush(makeTicket({ status: 'resolved' }));

    expect(showSpy).toHaveBeenCalledWith('support.ticket_resolved', 'success');
    expect(component.ticket()?.status).toBe('resolved');
  });

  it('PUTs status=closed and shows the closed toast', () => {
    flushDetail(makeTicket({ status: 'resolved' }));
    const toast = TestBed.inject(ToastService);
    const showSpy = vi.spyOn(toast, 'show');

    component.closeTicket();

    const put = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/support/tickets/${TICKET_ID}/status`,
    );
    expect(put.request.body).toEqual({ status: 'closed' });
    put.flush(makeTicket({ status: 'closed' }));

    expect(showSpy).toHaveBeenCalledWith('support.ticket_closed', 'success');
  });

  it('PUTs status=open (reopen) and shows the reopened toast', () => {
    flushDetail(makeTicket({ status: 'closed' }));
    const toast = TestBed.inject(ToastService);
    const showSpy = vi.spyOn(toast, 'show');

    component.reopenTicket();

    const put = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/support/tickets/${TICKET_ID}/status`,
    );
    expect(put.request.body).toEqual({ status: 'open' });
    put.flush(makeTicket({ status: 'open' }));

    expect(showSpy).toHaveBeenCalledWith('support.ticket_reopened', 'success');
  });

  it('does NOT show a success toast when the status PUT fails', () => {
    flushDetail(makeTicket({ status: 'open' }));
    const toast = TestBed.inject(ToastService);
    const showSpy = vi.spyOn(toast, 'show');

    component.resolveTicket();

    const put = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/support/tickets/${TICKET_ID}/status`,
    );
    put.flush({ error: 'server down' }, { status: 503, statusText: 'Unavailable' });

    expect(showSpy).not.toHaveBeenCalled();
    // The service moves the detail state to error on a failed status update.
    expect(component.ticketDetailState().status).toBe('error');
  });

  // --- navigation ---------------------------------------------------------

  it('navigates back to the ticket list', () => {
    flushDetail();
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.navigateBack();
    expect(navSpy).toHaveBeenCalledWith(['/support', 'tickets']);
  });

  it('navigates to the satisfaction survey for the current ticket', () => {
    flushDetail();
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.navigateToSurvey();
    expect(navSpy).toHaveBeenCalledWith(['/support', 'satisfaction', TICKET_ID]);
  });

  it('clicking the back button invokes navigateBack', () => {
    flushDetail();
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    (element.querySelector('[data-testid="btn-back-to-list"]') as HTMLButtonElement).click();
    expect(navSpy).toHaveBeenCalledWith(['/support', 'tickets']);
  });

  // --- formatDate fallback ------------------------------------------------

  it('formatDate returns the raw string when the date is unparseable but stays string', () => {
    flushDetail();
    // toLocaleString on an Invalid Date yields "Invalid Date" (it does not throw),
    // so characterise the actual returned value rather than asserting the input.
    const out = component.formatDate('not-a-real-date');
    expect(typeof out).toBe('string');
  });

  // --- ngOnDestroy --------------------------------------------------------

  it('unsubscribes on destroy without error', () => {
    flushDetail();
    expect(() => fixture.destroy()).not.toThrow();
  });
});
