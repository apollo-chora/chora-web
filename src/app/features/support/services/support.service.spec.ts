import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { SupportService } from './support.service';

describe('SupportService', () => {
  let service: SupportService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SupportService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // loadTickets
  // -------------------------------------------------------------------------

  describe('loadTickets', () => {
    it('should set loading then success state', () => {
      const mockResponse = {
        data: [{ id: 'tk-1', subject: 'Test issue', status: 'open', priority: 'medium', category: 'technical' }],
        page_info: { next_cursor: null, has_next: false },
      };

      service.loadTickets().subscribe();
      expect(service.ticketListState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets'));
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);

      expect(service.ticketListState().status).toBe('success');
      expect(service.tickets().length).toBe(1);
    });

    it('should pass query params for status and priority', () => {
      service.loadTickets({ status: 'open', priority: 'high' }).subscribe();

      const req = httpMock.expectOne(r =>
        r.url.includes('/api/v1/support/tickets') &&
        r.url.includes('status=open') &&
        r.url.includes('priority=high'),
      );
      req.flush({ data: [], page_info: { next_cursor: null, has_next: false } });
    });

    it('should pass query params for cursor and limit', () => {
      // Exercise the cursor + limit branch arms (lines 111-112).
      service.loadTickets({ cursor: 'cur-xyz', limit: 25 }).subscribe();

      const req = httpMock.expectOne(r =>
        r.url.includes('/api/v1/support/tickets') &&
        r.url.includes('cursor=cur-xyz') &&
        r.url.includes('limit=25'),
      );
      req.flush({ data: [], page_info: { next_cursor: null, has_next: false } });
    });

    it('should set error state on failure', () => {
      service.loadTickets().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.ticketListState().status).toBe('error');
    });
  });

  // -------------------------------------------------------------------------
  // loadTicketDetail
  // -------------------------------------------------------------------------

  describe('loadTicketDetail', () => {
    it('should set loading then success state', () => {
      const mockTicket = {
        id: 'tk-1',
        subject: 'Test issue',
        status: 'open',
        responses: [],
        satisfaction: null,
      };

      service.loadTicketDetail('tk-1').subscribe();
      expect(service.ticketDetailState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets/tk-1'));
      expect(req.request.method).toBe('GET');
      req.flush(mockTicket);

      expect(service.ticketDetailState().status).toBe('success');
      expect(service.ticketDetail()).toEqual(mockTicket);
    });

    it('should set error state on 404', () => {
      service.loadTicketDetail('tk-999').subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets/tk-999'));
      req.flush('Not Found', { status: 404, statusText: 'Not Found' });
      expect(service.ticketDetailState().status).toBe('error');
    });
  });

  // -------------------------------------------------------------------------
  // createTicket
  // -------------------------------------------------------------------------

  describe('createTicket', () => {
    it('should POST and prepend to existing tickets', () => {
      // First load existing tickets
      service.loadTickets().subscribe();
      const loadReq = httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets') && r.method === 'GET');
      loadReq.flush({
        data: [{ id: 'tk-1', subject: 'Old ticket', status: 'open' }],
        page_info: { next_cursor: null, has_next: false },
      });

      const newTicket = { subject: 'New issue', category: 'technical' as const };
      service.createTicket(newTicket).subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets') && r.method === 'POST');
      expect(req.request.body).toEqual(newTicket);
      req.flush({ id: 'tk-2', subject: 'New issue', status: 'open', category: 'technical' });

      expect(service.tickets().length).toBe(2);
      expect(service.tickets()[0].id).toBe('tk-2');
    });

    it('should set error state on failure', () => {
      service.createTicket({ subject: 'Fail', category: 'general' }).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets') && r.method === 'POST');
      req.flush('Error', { status: 422, statusText: 'Validation Failed' });
      expect(service.ticketListState().status).toBe('error');
    });

    it('should not mutate list when list state is not success (idle)', () => {
      // List never loaded → current.status === 'idle' → skip the prepend branch.
      expect(service.ticketListState().status).toBe('idle');

      let result: unknown;
      service.createTicket({ subject: 'Solo', category: 'general' }).subscribe((r) => (result = r));

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets') && r.method === 'POST');
      req.flush({ id: 'tk-solo', subject: 'Solo', status: 'open', category: 'general' });

      // Created emitted, but list state remains idle (prepend branch skipped).
      expect((result as { id: string }).id).toBe('tk-solo');
      expect(service.ticketListState().status).toBe('idle');
      expect(service.tickets().length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // respondToTicket
  // -------------------------------------------------------------------------

  describe('respondToTicket', () => {
    it('should POST and append response to detail', () => {
      // First load ticket detail
      service.loadTicketDetail('tk-1').subscribe();
      const detailReq = httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets/tk-1') && r.method === 'GET');
      detailReq.flush({
        id: 'tk-1',
        subject: 'Test',
        status: 'open',
        responses: [],
        satisfaction: null,
      });

      service.respondToTicket('tk-1', { body: 'Here is my reply' }).subscribe();

      const req = httpMock.expectOne(r =>
        r.url.includes('/api/v1/support/tickets/tk-1/respond') && r.method === 'POST',
      );
      expect(req.request.body).toEqual({ body: 'Here is my reply' });
      req.flush({ id: 'resp-1', ticket_id: 'tk-1', body: 'Here is my reply', is_internal: false });

      const detail = service.ticketDetail();
      expect(detail?.responses.length).toBe(1);
    });

    it('should emit response but skip detail update when detail state not success', () => {
      // No detail loaded → current.status === 'idle' → skip append branch.
      expect(service.ticketDetailState().status).toBe('idle');

      let result: unknown;
      service.respondToTicket('tk-1', { body: 'Hi' }).subscribe((r) => (result = r));

      const req = httpMock.expectOne(r =>
        r.url.includes('/api/v1/support/tickets/tk-1/respond') && r.method === 'POST',
      );
      req.flush({ id: 'resp-9', ticket_id: 'tk-1', body: 'Hi', is_internal: false });

      expect((result as { id: string }).id).toBe('resp-9');
      // Detail state untouched (append branch skipped).
      expect(service.ticketDetailState().status).toBe('idle');
    });

    it('should set error state on failure', () => {
      service.respondToTicket('tk-1', { body: 'Boom' }).subscribe();
      const req = httpMock.expectOne(r =>
        r.url.includes('/api/v1/support/tickets/tk-1/respond') && r.method === 'POST',
      );
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.ticketDetailState().status).toBe('error');
    });
  });

  // -------------------------------------------------------------------------
  // updateTicketStatus
  // -------------------------------------------------------------------------

  describe('updateTicketStatus', () => {
    it('should PUT and update ticket in list and detail', () => {
      // Load list
      service.loadTickets().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets') && r.method === 'GET')
        .flush({
          data: [{ id: 'tk-1', subject: 'Test', status: 'open' }],
          page_info: { next_cursor: null, has_next: false },
        });

      // Load detail
      service.loadTicketDetail('tk-1').subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets/tk-1') && r.method === 'GET')
        .flush({ id: 'tk-1', subject: 'Test', status: 'open', responses: [], satisfaction: null });

      service.updateTicketStatus('tk-1', 'resolved').subscribe();

      const req = httpMock.expectOne(r =>
        r.url.includes('/api/v1/support/tickets/tk-1/status') && r.method === 'PUT',
      );
      expect(req.request.body).toEqual({ status: 'resolved' });
      req.flush({ id: 'tk-1', subject: 'Test', status: 'resolved' });

      expect(service.tickets()[0].status).toBe('resolved');
    });

    it('should leave non-matching tickets unchanged (ternary false arm)', () => {
      // Load list with two tickets; only one matches the update id.
      service.loadTickets().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets') && r.method === 'GET')
        .flush({
          data: [
            { id: 'tk-1', subject: 'One', status: 'open' },
            { id: 'tk-2', subject: 'Two', status: 'open' },
          ],
          page_info: { next_cursor: null, has_next: false },
        });

      service.updateTicketStatus('tk-2', 'closed').subscribe();
      httpMock.expectOne(r =>
        r.url.includes('/api/v1/support/tickets/tk-2/status') && r.method === 'PUT',
      ).flush({ id: 'tk-2', subject: 'Two', status: 'closed' });

      const list = service.tickets();
      // Non-matching tk-1 untouched (ternary false branch); tk-2 replaced.
      expect(list.find((t) => t.id === 'tk-1')?.status).toBe('open');
      expect(list.find((t) => t.id === 'tk-2')?.status).toBe('closed');
    });

    it('should skip detail update when detail id differs from updated id', () => {
      // Detail loaded for a DIFFERENT ticket → detailState.ticket.id !== ticketId.
      service.loadTicketDetail('tk-99').subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets/tk-99') && r.method === 'GET')
        .flush({ id: 'tk-99', subject: 'Other', status: 'open', responses: [], satisfaction: null });

      service.updateTicketStatus('tk-1', 'resolved').subscribe();
      httpMock.expectOne(r =>
        r.url.includes('/api/v1/support/tickets/tk-1/status') && r.method === 'PUT',
      ).flush({ id: 'tk-1', subject: 'Test', status: 'resolved' });

      // Detail remains the unrelated tk-99 (id-mismatch branch skipped the merge).
      expect(service.ticketDetail()?.id).toBe('tk-99');
      expect(service.ticketDetail()?.status).toBe('open');
    });

    it('should update with neither list nor detail in success state', () => {
      // Both states idle → both success guards take the false arm.
      expect(service.ticketListState().status).toBe('idle');
      expect(service.ticketDetailState().status).toBe('idle');

      let result: unknown;
      service.updateTicketStatus('tk-1', 'in_progress').subscribe((r) => (result = r));
      httpMock.expectOne(r =>
        r.url.includes('/api/v1/support/tickets/tk-1/status') && r.method === 'PUT',
      ).flush({ id: 'tk-1', subject: 'Test', status: 'in_progress' });

      expect((result as { status: string }).status).toBe('in_progress');
      expect(service.ticketListState().status).toBe('idle');
      expect(service.ticketDetailState().status).toBe('idle');
    });

    it('should set error state on failure', () => {
      service.updateTicketStatus('tk-1', 'closed').subscribe();
      const req = httpMock.expectOne(r =>
        r.url.includes('/api/v1/support/tickets/tk-1/status') && r.method === 'PUT',
      );
      req.flush('Error', { status: 403, statusText: 'Forbidden' });
      expect(service.ticketDetailState().status).toBe('error');
    });
  });

  // -------------------------------------------------------------------------
  // loadFaqArticles
  // -------------------------------------------------------------------------

  describe('loadFaqArticles', () => {
    it('should set loading then success state', () => {
      const mockResponse = {
        data: [{ id: 'faq-1', question: 'How to reset password?', answer: 'Go to settings.' }],
        page_info: { next_cursor: null, has_next: false },
      };

      service.loadFaqArticles().subscribe();
      expect(service.faqListState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/support/faq'));
      req.flush(mockResponse);

      expect(service.faqListState().status).toBe('success');
      expect(service.faqArticles().length).toBe(1);
    });

    it('should pass search and category params', () => {
      service.loadFaqArticles({ search: 'password', category_id: 'cat-1' }).subscribe();

      const req = httpMock.expectOne(r =>
        r.url.includes('/api/v1/support/faq') &&
        r.url.includes('search=password') &&
        r.url.includes('category_id=cat-1'),
      );
      req.flush({ data: [], page_info: { next_cursor: null, has_next: false } });
    });

    it('should pass cursor and limit params', () => {
      // Exercise cursor + limit branch arms (lines 272-273).
      service.loadFaqArticles({ cursor: 'faq-cur', limit: 10 }).subscribe();

      const req = httpMock.expectOne(r =>
        r.url.includes('/api/v1/support/faq') &&
        r.url.includes('cursor=faq-cur') &&
        r.url.includes('limit=10'),
      );
      req.flush({ data: [], page_info: { next_cursor: null, has_next: false } });
    });

    it('should set error state on failure', () => {
      service.loadFaqArticles().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/support/faq'));
      req.flush('Error', { status: 500, statusText: 'Server Error' });
      expect(service.faqListState().status).toBe('error');
    });
  });

  // -------------------------------------------------------------------------
  // loadFaqCategories
  // -------------------------------------------------------------------------

  describe('loadFaqCategories', () => {
    it('should set loading then success state', () => {
      service.loadFaqCategories().subscribe();
      expect(service.faqCategoryState().status).toBe('loading');

      const req = httpMock.expectOne(r => r.url.includes('/api/v1/support/faq/categories'));
      req.flush({ data: [{ id: 'cat-1', name: 'Account', sort_order: 0 }] });

      expect(service.faqCategoryState().status).toBe('success');
      expect(service.faqCategories().length).toBe(1);
    });

    it('should set error state on failure', () => {
      service.loadFaqCategories().subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/support/faq/categories'));
      req.flush('Error', { status: 503, statusText: 'Service Unavailable' });
      expect(service.faqCategoryState().status).toBe('error');
    });
  });

  // -------------------------------------------------------------------------
  // submitSatisfaction
  // -------------------------------------------------------------------------

  describe('submitSatisfaction', () => {
    it('should POST and set success state', () => {
      service.submitSatisfaction('tk-1', { rating: 4, comment: 'Great help' }).subscribe();
      expect(service.satisfactionState().status).toBe('loading');

      const req = httpMock.expectOne(r =>
        r.url.includes('/api/v1/support/tickets/tk-1/satisfaction') && r.method === 'POST',
      );
      expect(req.request.body).toEqual({ rating: 4, comment: 'Great help' });
      req.flush({ id: 'sat-1', ticket_id: 'tk-1', rating: 4, comment: 'Great help' });

      expect(service.satisfactionState().status).toBe('success');
    });

    it('should update ticket detail with satisfaction', () => {
      // Load detail first
      service.loadTicketDetail('tk-1').subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets/tk-1') && r.method === 'GET')
        .flush({ id: 'tk-1', subject: 'Test', status: 'resolved', responses: [], satisfaction: null });

      service.submitSatisfaction('tk-1', { rating: 5 }).subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets/tk-1/satisfaction'))
        .flush({ id: 'sat-1', ticket_id: 'tk-1', rating: 5, comment: null });

      expect(service.ticketDetail()?.satisfaction?.rating).toBe(5);
    });

    it('should set success but skip detail merge when detail not loaded', () => {
      // Detail idle → detailState.status !== 'success' → skip detail merge branch.
      expect(service.ticketDetailState().status).toBe('idle');

      service.submitSatisfaction('tk-1', { rating: 2 }).subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets/tk-1/satisfaction'))
        .flush({ id: 'sat-2', ticket_id: 'tk-1', rating: 2, comment: null });

      expect(service.satisfactionState().status).toBe('success');
      // Detail untouched.
      expect(service.ticketDetailState().status).toBe('idle');
    });

    it('should skip detail merge when detail id differs', () => {
      // Detail loaded for a different ticket → ticket.id !== ticketId (short-circuit).
      service.loadTicketDetail('tk-50').subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets/tk-50') && r.method === 'GET')
        .flush({ id: 'tk-50', subject: 'Other', status: 'resolved', responses: [], satisfaction: null });

      service.submitSatisfaction('tk-1', { rating: 1 }).subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets/tk-1/satisfaction'))
        .flush({ id: 'sat-3', ticket_id: 'tk-1', rating: 1, comment: null });

      // tk-50 detail unchanged (satisfaction stays null).
      expect(service.ticketDetail()?.satisfaction).toBeNull();
    });

    it('should set error state on conflict', () => {
      service.submitSatisfaction('tk-1', { rating: 3 }).subscribe();
      const req = httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets/tk-1/satisfaction'));
      req.flush('Conflict', { status: 409, statusText: 'Already Submitted' });
      expect(service.satisfactionState().status).toBe('error');
    });
  });

  // -------------------------------------------------------------------------
  // resetState
  // -------------------------------------------------------------------------

  describe('resetState', () => {
    it('should reset all states to idle', () => {
      service.loadTickets().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets')).flush({
        data: [{ id: 'tk-1' }],
        page_info: { next_cursor: null, has_next: false },
      });

      service.resetState();

      expect(service.ticketListState().status).toBe('idle');
      expect(service.ticketDetailState().status).toBe('idle');
      expect(service.faqListState().status).toBe('idle');
      expect(service.faqCategoryState().status).toBe('idle');
      expect(service.satisfactionState().status).toBe('idle');
    });
  });

  // -------------------------------------------------------------------------
  // Computed signals
  // -------------------------------------------------------------------------

  describe('computed signals', () => {
    it('should return fallbacks when states are idle (non-success arms)', () => {
      // All states idle → every computed takes its non-success fallback arm.
      expect(service.tickets()).toEqual([]);
      expect(service.ticketPageInfo()).toBeNull();
      expect(service.ticketDetail()).toBeNull();
      expect(service.faqArticles()).toEqual([]);
      expect(service.faqCategories()).toEqual([]);
      expect(service.openTickets()).toEqual([]);
      expect(service.resolvedTickets()).toEqual([]);
    });

    it('ticketPageInfo should expose page_info on success', () => {
      service.loadTickets().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets')).flush({
        data: [{ id: 'tk-1', status: 'open' }],
        page_info: { next_cursor: 'cur-2', has_next: true },
      });
      expect(service.ticketPageInfo()).toEqual({ next_cursor: 'cur-2', has_next: true });
    });

    it('openTickets should filter by open status', () => {
      service.loadTickets().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets')).flush({
        data: [
          { id: 'tk-1', status: 'open' },
          { id: 'tk-2', status: 'resolved' },
          { id: 'tk-3', status: 'open' },
        ],
        page_info: { next_cursor: null, has_next: false },
      });

      expect(service.openTickets().length).toBe(2);
    });

    it('resolvedTickets should filter by resolved and closed', () => {
      service.loadTickets().subscribe();
      httpMock.expectOne(r => r.url.includes('/api/v1/support/tickets')).flush({
        data: [
          { id: 'tk-1', status: 'open' },
          { id: 'tk-2', status: 'resolved' },
          { id: 'tk-3', status: 'closed' },
        ],
        page_info: { next_cursor: null, has_next: false },
      });

      expect(service.resolvedTickets().length).toBe(2);
    });
  });
});
