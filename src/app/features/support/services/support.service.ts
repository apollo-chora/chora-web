/**
 * SupportService — REST adapter for support tickets, FAQ, and satisfaction surveys.
 *
 * Source of truth: chora-contracts/openapi/support.yaml
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';
import type {
  Ticket,
  TicketDetail,
  TicketResponse,
  FaqArticle,
  FaqCategory,
  SatisfactionSurvey,
  TicketListState,
  TicketDetailState,
  FaqListState,
  FaqCategoryListState,
  SatisfactionState,
  TicketStatus,
  TicketPriority,
  CreateTicketRequest,
  CreateResponseRequest,
  SubmitSatisfactionRequest,
  PageInfo,
} from '../models/support.model';

// ---------------------------------------------------------------------------
// Endpoint paths
// ---------------------------------------------------------------------------

const TICKETS_PATH = '/api/v1/support/tickets';
const FAQ_PATH = '/api/v1/support/faq';
const FAQ_CATEGORIES_PATH = '/api/v1/support/faq/categories';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class SupportService {
  private readonly bff = inject(BffClientService);

  // --- Signal state (private + readonly) ---
  private readonly _ticketListState = signal<TicketListState>({ status: 'idle' });
  readonly ticketListState = this._ticketListState.asReadonly();

  private readonly _ticketDetailState = signal<TicketDetailState>({ status: 'idle' });
  readonly ticketDetailState = this._ticketDetailState.asReadonly();

  private readonly _faqListState = signal<FaqListState>({ status: 'idle' });
  readonly faqListState = this._faqListState.asReadonly();

  private readonly _faqCategoryState = signal<FaqCategoryListState>({ status: 'idle' });
  readonly faqCategoryState = this._faqCategoryState.asReadonly();

  private readonly _satisfactionState = signal<SatisfactionState>({ status: 'idle' });
  readonly satisfactionState = this._satisfactionState.asReadonly();

  // --- Computed ---
  readonly tickets = computed(() => {
    const s = this._ticketListState();
    return s.status === 'success' ? s.tickets : [];
  });

  readonly ticketPageInfo = computed(() => {
    const s = this._ticketListState();
    return s.status === 'success' ? s.page_info : null;
  });

  readonly ticketDetail = computed(() => {
    const s = this._ticketDetailState();
    return s.status === 'success' ? s.ticket : null;
  });

  readonly faqArticles = computed(() => {
    const s = this._faqListState();
    return s.status === 'success' ? s.articles : [];
  });

  readonly faqCategories = computed(() => {
    const s = this._faqCategoryState();
    return s.status === 'success' ? s.categories : [];
  });

  readonly openTickets = computed(() =>
    this.tickets().filter((t) => t.status === 'open'),
  );

  readonly resolvedTickets = computed(() =>
    this.tickets().filter((t) => t.status === 'resolved' || t.status === 'closed'),
  );

  // -------------------------------------------------------------------------
  // Ticket list methods
  // -------------------------------------------------------------------------

  loadTickets(params?: {
    status?: TicketStatus;
    priority?: TicketPriority;
    cursor?: string;
    limit?: number;
  }): Observable<{ data: Ticket[]; page_info: PageInfo } | null> {
    this._ticketListState.set({ status: 'loading' });

    const queryParts: string[] = [];
    if (params?.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
    if (params?.priority) queryParts.push(`priority=${encodeURIComponent(params.priority)}`);
    if (params?.cursor) queryParts.push(`cursor=${encodeURIComponent(params.cursor)}`);
    if (params?.limit) queryParts.push(`limit=${params.limit}`);

    const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

    return this.bff.get<{ data: Ticket[]; page_info: PageInfo }>(
      `${TICKETS_PATH}${query}`,
    ).pipe(
      tap((result) => {
        this._ticketListState.set({
          status: 'success',
          tickets: result.data,
          page_info: result.page_info,
        });
      }),
      catchError((err: Error) => {
        this._ticketListState.set({
          status: 'error',
          error: { code: 'TICKETS_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Ticket detail methods
  // -------------------------------------------------------------------------

  loadTicketDetail(ticketId: string): Observable<TicketDetail | null> {
    this._ticketDetailState.set({ status: 'loading' });

    return this.bff.get<TicketDetail>(
      `${TICKETS_PATH}/${encodeURIComponent(ticketId)}`,
    ).pipe(
      tap((ticket) => {
        this._ticketDetailState.set({ status: 'success', ticket });
      }),
      catchError((err: Error) => {
        this._ticketDetailState.set({
          status: 'error',
          error: { code: 'TICKET_DETAIL_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Ticket create
  // -------------------------------------------------------------------------

  createTicket(data: CreateTicketRequest): Observable<Ticket | null> {
    return this.bff.post<Ticket>(TICKETS_PATH, data).pipe(
      tap((created) => {
        const current = this._ticketListState();
        if (current.status === 'success') {
          this._ticketListState.set({
            ...current,
            tickets: [created, ...current.tickets],
          });
        }
      }),
      catchError((err: Error) => {
        this._ticketListState.set({
          status: 'error',
          error: { code: 'TICKET_CREATE_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Ticket respond
  // -------------------------------------------------------------------------

  respondToTicket(
    ticketId: string,
    data: CreateResponseRequest,
  ): Observable<TicketResponse | null> {
    return this.bff.post<TicketResponse>(
      `${TICKETS_PATH}/${encodeURIComponent(ticketId)}/respond`,
      data,
    ).pipe(
      tap((response) => {
        const current = this._ticketDetailState();
        if (current.status === 'success') {
          this._ticketDetailState.set({
            ...current,
            ticket: {
              ...current.ticket,
              responses: [...current.ticket.responses, response],
            },
          });
        }
      }),
      catchError((err: Error) => {
        this._ticketDetailState.set({
          status: 'error',
          error: { code: 'TICKET_RESPOND_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Ticket status update
  // -------------------------------------------------------------------------

  updateTicketStatus(ticketId: string, status: TicketStatus): Observable<Ticket | null> {
    return this.bff.put<Ticket>(
      `${TICKETS_PATH}/${encodeURIComponent(ticketId)}/status`,
      { status },
    ).pipe(
      tap((updated) => {
        // Update in list
        const listState = this._ticketListState();
        if (listState.status === 'success') {
          this._ticketListState.set({
            ...listState,
            tickets: listState.tickets.map((t) =>
              t.id === ticketId ? updated : t,
            ),
          });
        }
        // Update detail
        const detailState = this._ticketDetailState();
        if (detailState.status === 'success' && detailState.ticket.id === ticketId) {
          this._ticketDetailState.set({
            ...detailState,
            ticket: { ...detailState.ticket, ...updated },
          });
        }
      }),
      catchError((err: Error) => {
        this._ticketDetailState.set({
          status: 'error',
          error: { code: 'TICKET_STATUS_UPDATE_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // FAQ methods
  // -------------------------------------------------------------------------

  loadFaqArticles(params?: {
    category_id?: string;
    search?: string;
    cursor?: string;
    limit?: number;
  }): Observable<{ data: FaqArticle[]; page_info: PageInfo } | null> {
    this._faqListState.set({ status: 'loading' });

    const queryParts: string[] = [];
    if (params?.category_id) queryParts.push(`category_id=${encodeURIComponent(params.category_id)}`);
    if (params?.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
    if (params?.cursor) queryParts.push(`cursor=${encodeURIComponent(params.cursor)}`);
    if (params?.limit) queryParts.push(`limit=${params.limit}`);

    const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

    return this.bff.get<{ data: FaqArticle[]; page_info: PageInfo }>(
      `${FAQ_PATH}${query}`,
    ).pipe(
      tap((result) => {
        this._faqListState.set({
          status: 'success',
          articles: result.data,
          page_info: result.page_info,
        });
      }),
      catchError((err: Error) => {
        this._faqListState.set({
          status: 'error',
          error: { code: 'FAQ_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  loadFaqCategories(): Observable<{ data: FaqCategory[] } | null> {
    this._faqCategoryState.set({ status: 'loading' });

    return this.bff.get<{ data: FaqCategory[] }>(FAQ_CATEGORIES_PATH).pipe(
      tap((result) => {
        this._faqCategoryState.set({
          status: 'success',
          categories: result.data,
        });
      }),
      catchError((err: Error) => {
        this._faqCategoryState.set({
          status: 'error',
          error: { code: 'FAQ_CATEGORIES_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Satisfaction survey methods
  // -------------------------------------------------------------------------

  submitSatisfaction(
    ticketId: string,
    data: SubmitSatisfactionRequest,
  ): Observable<SatisfactionSurvey | null> {
    this._satisfactionState.set({ status: 'loading' });

    return this.bff.post<SatisfactionSurvey>(
      `${TICKETS_PATH}/${encodeURIComponent(ticketId)}/satisfaction`,
      data,
    ).pipe(
      tap((survey) => {
        this._satisfactionState.set({ status: 'success', survey });
        // Update ticket detail with satisfaction
        const detailState = this._ticketDetailState();
        if (detailState.status === 'success' && detailState.ticket.id === ticketId) {
          this._ticketDetailState.set({
            ...detailState,
            ticket: { ...detailState.ticket, satisfaction: survey },
          });
        }
      }),
      catchError((err: Error) => {
        this._satisfactionState.set({
          status: 'error',
          error: { code: 'SATISFACTION_SUBMIT_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // State reset
  // -------------------------------------------------------------------------

  resetState(): void {
    this._ticketListState.set({ status: 'idle' });
    this._ticketDetailState.set({ status: 'idle' });
    this._faqListState.set({ status: 'idle' });
    this._faqCategoryState.set({ status: 'idle' });
    this._satisfactionState.set({ status: 'idle' });
  }
}
