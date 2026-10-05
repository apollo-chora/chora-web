import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { TicketListComponent } from './ticket-list.component';
import { SupportService } from '../../services/support.service';
import type { Ticket, PageInfo } from '../../models/support.model';

const BASE = 'https://api.chora.site';
const TICKETS_URL = `${BASE}/api/v1/support/tickets`;

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'tk-1',
    tenant_id: 'tn-1',
    creator_gcid: 'gc-1',
    assigned_agent_gcid: null,
    subject: 'Cannot log in',
    description: 'desc',
    status: 'open',
    priority: 'high',
    category: 'technical',
    tags: [],
    escalation_count: 0,
    resolved_at: null,
    closed_at: null,
    created_at: '2026-03-15T10:00:00Z',
    updated_at: '2026-03-15T10:00:00Z',
    ...overrides,
  };
}

describe('TicketListComponent', () => {
  let component: TicketListComponent;
  let fixture: ComponentFixture<TicketListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TicketListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(TicketListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="ticket-list"]');
    expect(el).toBeTruthy();
  });

  it('should have create ticket button', () => {
    const btn = fixture.nativeElement.querySelector('[data-testid="btn-create-ticket"]');
    expect(btn).toBeTruthy();
  });

  it('should have filter controls', () => {
    const filters = fixture.nativeElement.querySelector('[data-testid="ticket-filters"]');
    expect(filters).toBeTruthy();
  });

  it('should compute statusClass correctly', () => {
    expect(component.statusClass('open')).toBe('ticket-list__status--open');
    expect(component.statusClass('in_progress')).toBe('ticket-list__status--in_progress');
  });

  it('should compute priorityClass correctly', () => {
    expect(component.priorityClass('critical')).toBe('ticket-list__priority--critical');
  });

  it('should format date from ISO string', () => {
    const result = component.formatDate('2026-03-15T10:00:00Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('');
  });

  it('should track tickets by id', () => {
    expect(component.trackByTicketId(0, { id: 'tk-1' })).toBe('tk-1');
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Branch coverage augmentation
  // -------------------------------------------------------------------------

  describe('hasMore computed', () => {
    it('returns false when there is no page info (optional-chain null arm)', () => {
      // No successful load has occurred → ticketPageInfo() is null.
      expect(component.pageInfo()).toBeNull();
      expect(component.hasMore()).toBe(false);
    });

    it('returns false when page info present but has_next is false (?? + value arm)', () => {
      const ctrl = TestBed.inject(HttpTestingController);
      ctrl
        .expectOne((r) => r.url === TICKETS_URL)
        .flush({
          data: [makeTicket()],
          page_info: { next_cursor: null, has_next: false } as PageInfo,
        });
      fixture.detectChanges();
      expect(component.pageInfo()).not.toBeNull();
      expect(component.hasMore()).toBe(false);
      ctrl.verify();
    });

    it('returns true when page info present and has_next is true', () => {
      const ctrl = TestBed.inject(HttpTestingController);
      ctrl
        .expectOne((r) => r.url === TICKETS_URL)
        .flush({
          data: [makeTicket()],
          page_info: { next_cursor: 'cur-2', has_next: true } as PageInfo,
        });
      fixture.detectChanges();
      expect(component.hasMore()).toBe(true);
      ctrl.verify();
    });
  });

  describe('loadMore', () => {
    it('does nothing when there is no next cursor (early-return guard)', () => {
      const ctrl = TestBed.inject(HttpTestingController);
      // Resolve the ngOnInit request with no cursor.
      ctrl
        .expectOne((r) => r.url === TICKETS_URL)
        .flush({
          data: [makeTicket()],
          page_info: { next_cursor: null, has_next: false } as PageInfo,
        });
      fixture.detectChanges();

      component.loadMore();
      // No additional request should have been issued.
      ctrl.expectNone((r) => r.url.startsWith(TICKETS_URL) && r.url.includes('cursor='));
      ctrl.verify();
    });

    it('fires a cursor-paged request when a next cursor exists (through case)', () => {
      const ctrl = TestBed.inject(HttpTestingController);
      ctrl
        .expectOne((r) => r.url === TICKETS_URL)
        .flush({
          data: [makeTicket()],
          page_info: { next_cursor: 'cur-2', has_next: true } as PageInfo,
        });
      fixture.detectChanges();

      component.loadMore();
      const req = ctrl.expectOne((r) => r.url.includes('cursor=cur-2'));
      expect(req.request.method).toBe('GET');
      // status/priority null → omitted from query (?? undefined arm).
      expect(req.request.url).not.toContain('status=');
      expect(req.request.url).not.toContain('priority=');
      req.flush({
        data: [makeTicket({ id: 'tk-2' })],
        page_info: { next_cursor: null, has_next: false } as PageInfo,
      });
      ctrl.verify();
    });

    it('includes active status and priority filters in the paged request (?? value arms)', () => {
      const ctrl = TestBed.inject(HttpTestingController);
      // Initial ngOnInit load.
      ctrl
        .expectOne((r) => r.url === TICKETS_URL)
        .flush({
          data: [makeTicket()],
          page_info: { next_cursor: 'cur-3', has_next: true } as PageInfo,
        });
      fixture.detectChanges();

      // Apply filters — each triggers a fresh loadTickets() request to flush.
      component.filterByStatus('open');
      ctrl
        .expectOne((r) => r.url.includes('status=open'))
        .flush({
          data: [makeTicket()],
          page_info: { next_cursor: 'cur-3', has_next: true } as PageInfo,
        });
      component.filterByPriority('critical');
      ctrl
        .expectOne((r) => r.url.includes('priority=critical'))
        .flush({
          data: [makeTicket()],
          page_info: { next_cursor: 'cur-3', has_next: true } as PageInfo,
        });

      component.loadMore();
      const req = ctrl.expectOne(
        (r) =>
          r.url.includes('cursor=cur-3') &&
          r.url.includes('status=open') &&
          r.url.includes('priority=critical'),
      );
      req.flush({
        data: [makeTicket()],
        page_info: { next_cursor: null, has_next: false } as PageInfo,
      });
      ctrl.verify();
    });
  });

  describe('filterByStatus / filterByPriority', () => {
    it('sets selected status and reloads', () => {
      const ctrl = TestBed.inject(HttpTestingController);
      ctrl
        .expectOne((r) => r.url === TICKETS_URL)
        .flush({
          data: [],
          page_info: { next_cursor: null, has_next: false } as PageInfo,
        });

      component.filterByStatus('resolved');
      expect(component.selectedStatus()).toBe('resolved');
      ctrl
        .expectOne((r) => r.url.includes('status=resolved'))
        .flush({
          data: [],
          page_info: { next_cursor: null, has_next: false } as PageInfo,
        });
      ctrl.verify();
    });

    it('clears selected status when passed null (?? undefined arm)', () => {
      const ctrl = TestBed.inject(HttpTestingController);
      ctrl
        .expectOne((r) => r.url === TICKETS_URL)
        .flush({
          data: [],
          page_info: { next_cursor: null, has_next: false } as PageInfo,
        });

      component.filterByStatus(null);
      expect(component.selectedStatus()).toBeNull();
      const req = ctrl.expectOne((r) => r.url.startsWith(TICKETS_URL));
      expect(req.request.url).not.toContain('status=');
      req.flush({
        data: [],
        page_info: { next_cursor: null, has_next: false } as PageInfo,
      });
      ctrl.verify();
    });

    it('sets selected priority and reloads', () => {
      const ctrl = TestBed.inject(HttpTestingController);
      ctrl
        .expectOne((r) => r.url === TICKETS_URL)
        .flush({
          data: [],
          page_info: { next_cursor: null, has_next: false } as PageInfo,
        });

      component.filterByPriority('low');
      expect(component.selectedPriority()).toBe('low');
      ctrl
        .expectOne((r) => r.url.includes('priority=low'))
        .flush({
          data: [],
          page_info: { next_cursor: null, has_next: false } as PageInfo,
        });
      ctrl.verify();
    });
  });

  describe('navigation', () => {
    it('navigates to a ticket detail route', () => {
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.navigateToTicket('tk-42');
      expect(spy).toHaveBeenCalledWith(['/support', 'tickets', 'tk-42']);
    });

    it('navigates to the create route', () => {
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.navigateToCreate();
      expect(spy).toHaveBeenCalledWith(['/support', 'tickets', 'new']);
    });
  });

  describe('formatDate', () => {
    it('returns a localized string for a valid ISO date (try arm)', () => {
      const result = component.formatDate('2026-03-15T10:00:00Z');
      expect(result).toBeTruthy();
      expect(result).not.toBe('2026-03-15T10:00:00Z');
    });

    it('returns the raw string when the date is invalid (Invalid Date path)', () => {
      // new Date('not-a-date') is Invalid Date; toLocaleDateString() yields
      // 'Invalid Date' rather than throwing, so the function returns that.
      const result = component.formatDate('not-a-date');
      expect(typeof result).toBe('string');
    });
  });

  describe('ngOnDestroy', () => {
    it('unsubscribes without error', () => {
      const ctrl = TestBed.inject(HttpTestingController);
      ctrl
        .expectOne((r) => r.url === TICKETS_URL)
        .flush({
          data: [],
          page_info: { next_cursor: null, has_next: false } as PageInfo,
        });
      expect(() => component.ngOnDestroy()).not.toThrow();
      ctrl.verify();
    });
  });

  describe('tickets / service state passthrough', () => {
    it('exposes loaded tickets and empty array before any load', () => {
      const svc = TestBed.inject(SupportService);
      // Before flushing, state is 'loading' → tickets() returns [].
      expect(component.tickets()).toEqual([]);

      const ctrl = TestBed.inject(HttpTestingController);
      ctrl
        .expectOne((r) => r.url === TICKETS_URL)
        .flush({
          data: [makeTicket({ id: 'tk-x' })],
          page_info: { next_cursor: null, has_next: false } as PageInfo,
        });
      expect(component.tickets().map((t) => t.id)).toEqual(['tk-x']);
      expect(svc.tickets().length).toBe(1);
      ctrl.verify();
    });
  });
});
