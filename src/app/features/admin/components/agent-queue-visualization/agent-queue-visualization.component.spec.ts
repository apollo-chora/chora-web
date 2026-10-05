import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { AgentQueueVisualizationComponent } from './agent-queue-visualization.component';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../environments/environment';

// ---------------------------------------------------------------------------
// Backend stub shapes (mirror the component's local interfaces)
// ---------------------------------------------------------------------------

interface AgentStub {
  id: string;
  name: string;
  avatar_url: string | null;
  ticket_count: number;
  avg_resolution_minutes: number;
  is_online: boolean;
  current_capacity: number;
  max_capacity: number;
}

interface TicketStub {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  assigned_agent_id: string | null;
  created_at: string;
  gcid: string;
}

const QUEUE_URL = `${environment.bffBaseUrl}/api/v1/admin/support/queue`;

const STUB_AGENTS: AgentStub[] = [
  {
    id: 'agent-1',
    name: 'Alice',
    avatar_url: null,
    ticket_count: 2,
    avg_resolution_minutes: 30,
    is_online: true,
    current_capacity: 11,
    max_capacity: 12,
  },
  {
    id: 'agent-2',
    name: 'Bob',
    avatar_url: null,
    ticket_count: 1,
    avg_resolution_minutes: 90,
    is_online: false,
    current_capacity: 5,
    max_capacity: 10,
  },
];

const STUB_TICKETS: TicketStub[] = [
  {
    id: 'tkt-1',
    subject: 'Login broken',
    category: 'technical',
    priority: 'urgent',
    status: 'open',
    assigned_agent_id: 'agent-1',
    created_at: '2026-06-01T00:00:00Z',
    gcid: 'gcid-1',
  },
  {
    id: 'tkt-2',
    subject: 'Billing question',
    category: 'billing',
    priority: 'normal',
    status: 'in_progress',
    assigned_agent_id: 'agent-1',
    created_at: '2026-06-01T01:00:00Z',
    gcid: 'gcid-2',
  },
  {
    id: 'tkt-3',
    subject: 'Cannot find course',
    category: 'technical',
    priority: 'low',
    status: 'open',
    assigned_agent_id: null,
    created_at: '2026-06-01T02:00:00Z',
    gcid: 'gcid-3',
  },
];

function configure(): void {
  TestBed.configureTestingModule({
    imports: [AgentQueueVisualizationComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
}

function buildSuccess(): {
  fixture: ComponentFixture<AgentQueueVisualizationComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
} {
  configure();
  const fixture = TestBed.createComponent(AgentQueueVisualizationComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges(); // triggers ngOnInit → loadData → GET
  httpMock
    .expectOne(QUEUE_URL)
    .flush({ agents: STUB_AGENTS, tickets: STUB_TICKETS });
  fixture.detectChanges();
  return { fixture, httpMock, element: fixture.nativeElement as HTMLElement };
}

describe('AgentQueueVisualizationComponent', () => {
  let fixture: ComponentFixture<AgentQueueVisualizationComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: AgentQueueVisualizationComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = buildSuccess();
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = built.element;
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // Shell render
  // -------------------------------------------------------------------------

  describe('shell', () => {
    it('creates the component', () => {
      expect(component).toBeTruthy();
    });

    it('renders the root with data-testid + agent-queue class', () => {
      const root = element.querySelector(
        '[data-testid="agent-queue-visualization"]',
      );
      expect(root).not.toBeNull();
      expect(root?.className).toContain('agent-queue');
      expect(root?.tagName).toBe('SECTION');
    });

    it('renders the title', () => {
      // en.json isn't loaded in tests, so | translate emits the raw key (prod humanizes).
      const title = element.querySelector('[data-testid="queue-title"]');
      expect(title?.textContent?.trim()).toBe('admin.support.queue_title');
    });

    it('renders a refresh button', () => {
      const btn = element.querySelector('[data-testid="btn-refresh"]');
      expect(btn).not.toBeNull();
      expect(btn?.tagName).toBe('BUTTON');
    });
  });

  // -------------------------------------------------------------------------
  // Success GET path → summary + grids
  // -------------------------------------------------------------------------

  describe('success data load', () => {
    it('issues a GET to the support queue endpoint', () => {
      // The beforeEach already flushed; assert the path/verb were correct by
      // re-driving via refresh and inspecting the request.
      component.refresh();
      const req = httpMock.expectOne(QUEUE_URL);
      expect(req.request.method).toBe('GET');
      req.flush({ agents: STUB_AGENTS, tickets: STUB_TICKETS });
    });

    it('populates the agents + tickets signals', () => {
      expect(component.agents().length).toBe(2);
      expect(component.tickets().length).toBe(3);
    });

    it('renders one agent card per agent with stable testids', () => {
      expect(
        element.querySelector('[data-testid="agent-agent-1"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="agent-agent-2"]'),
      ).not.toBeNull();
    });

    it('renders the agent name and ticket_count in the card', () => {
      const card = element.querySelector('[data-testid="agent-agent-1"]');
      expect(card?.textContent).toContain('Alice');
      expect(card?.textContent).toContain('2'); // ticket_count
    });

    it('renders one ticket row per ticket', () => {
      expect(element.querySelector('[data-testid="ticket-tkt-1"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="ticket-tkt-2"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="ticket-tkt-3"]')).not.toBeNull();
    });

    it('renders an assignment select per ticket', () => {
      const select = element.querySelector(
        '[data-testid="assign-tkt-1"]',
      ) as HTMLSelectElement;
      expect(select).not.toBeNull();
      // unassigned option + one per agent
      expect(select.querySelectorAll('option').length).toBe(STUB_AGENTS.length + 1);
    });
  });

  // -------------------------------------------------------------------------
  // Computed signals — surfaced through the summary bar
  // -------------------------------------------------------------------------

  describe('summary computeds', () => {
    it('totalTickets equals the ticket count', () => {
      expect(component.totalTickets()).toBe(3);
    });

    it('openTickets counts status==="open"', () => {
      expect(component.openTickets()).toBe(2); // tkt-1, tkt-3
    });

    it('unassignedTickets counts null assigned_agent_id', () => {
      expect(component.unassignedTickets()).toBe(1); // tkt-3
    });

    it('renders the agents count in the summary bar', () => {
      const summary = element.querySelector('[data-testid="queue-summary"]');
      expect(summary?.textContent).toContain('2'); // 2 agents
    });

    it('agentTicketMap groups tickets by assigned agent', () => {
      const map = component.agentTicketMap();
      expect(map.get('agent-1')?.length).toBe(2); // tkt-1 + tkt-2
      expect(map.get('agent-2')?.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Category distribution
  // -------------------------------------------------------------------------

  describe('categoryDistribution', () => {
    it('aggregates + sorts categories by count desc', () => {
      const dist = component.categoryDistribution();
      // technical: 2, billing: 1
      expect(dist[0].category).toBe('technical');
      expect(dist[0].count).toBe(2);
      expect(dist[0].pct).toBe(67); // round(2/3 * 100)
      const billing = dist.find((d) => d.category === 'billing');
      expect(billing?.count).toBe(1);
    });

    it('renders distribution rows in the chart', () => {
      expect(element.querySelector('[data-testid="dist-technical"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="dist-billing"]')).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Pure helper methods
  // -------------------------------------------------------------------------

  describe('helpers', () => {
    it('priorityClass builds the modifier class', () => {
      expect(component.priorityClass('urgent')).toBe(
        'agent-queue__priority--urgent',
      );
    });

    it('capacityPct rounds current/max as a percentage', () => {
      // agent-1: 11/12 → 92
      expect(component.capacityPct(STUB_AGENTS[0])).toBe(92);
      // agent-2: 5/10 → 50
      expect(component.capacityPct(STUB_AGENTS[1])).toBe(50);
    });

    it('capacityPct guards division by zero', () => {
      expect(
        component.capacityPct({ ...STUB_AGENTS[0], max_capacity: 0 }),
      ).toBe(0);
    });

    it('capacityBarClass maps thresholds (critical/warning/normal)', () => {
      expect(component.capacityBarClass(STUB_AGENTS[0])).toBe(
        'agent-queue__capacity-fill--critical',
      ); // 92% >= 90
      expect(
        component.capacityBarClass({
          ...STUB_AGENTS[0],
          current_capacity: 9,
          max_capacity: 12,
        }),
      ).toBe('agent-queue__capacity-fill--warning'); // 75%
      expect(component.capacityBarClass(STUB_AGENTS[1])).toBe(
        'agent-queue__capacity-fill--normal',
      ); // 50%
    });

    it('formatDuration renders minutes, hours, and h+m', () => {
      expect(component.formatDuration(30)).toBe('30m');
      expect(component.formatDuration(120)).toBe('2h');
      expect(component.formatDuration(90)).toBe('1h 30m');
    });

    it('formatTimestamp returns a non-empty string for a valid ISO date', () => {
      const out = component.formatTimestamp('2026-06-01T00:00:00Z');
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    });

    it('isReassigning reflects the reassigning signal', () => {
      expect(component.isReassigning('tkt-1')).toBe(false);
      component.reassigning.set('tkt-1');
      expect(component.isReassigning('tkt-1')).toBe(true);
      expect(component.isReassigning('tkt-2')).toBe(false);
      component.reassigning.set(null);
    });

    it('distributionBarWidth appends a percent sign', () => {
      expect(component.distributionBarWidth(42)).toBe('42%');
    });
  });

  // -------------------------------------------------------------------------
  // Reassignment flow (confirm → PUT)
  // -------------------------------------------------------------------------

  describe('reassignTicket', () => {
    it('no-ops when newAgentId is falsy (no confirm, no PUT)', async () => {
      await component.reassignTicket('tkt-1', '');
      // afterEach httpMock.verify() asserts no PUT was issued.
      expect(component.reassigning()).toBeNull();
    });

    it('no-ops when the ticket or agent cannot be resolved', async () => {
      await component.reassignTicket('does-not-exist', 'agent-2');
      expect(component.reassigning()).toBeNull();
    });

    it('aborts when the confirm dialog is declined', async () => {
      const confirmSvc = TestBed.inject(ConfirmDialogService);
      const promise = component.reassignTicket('tkt-3', 'agent-2');
      // Resolve the pending confirm dialog with false.
      confirmSvc._resolve(false);
      await promise;
      // No PUT issued; ticket stays unassigned.
      const ticket = component.tickets().find((t) => t.id === 'tkt-3');
      expect(ticket?.assigned_agent_id).toBeNull();
    });

    it('PUTs the assignment and updates state on success', async () => {
      const toast = TestBed.inject(ToastService);
      const toastSpy = vi.spyOn(toast, 'show');
      const confirmSvc = TestBed.inject(ConfirmDialogService);

      const promise = component.reassignTicket('tkt-3', 'agent-2');
      confirmSvc._resolve(true);
      await promise;

      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/admin/support/tickets/tkt-3/assign`,
      );
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ agent_id: 'agent-2' });
      req.flush(null);

      const ticket = component.tickets().find((t) => t.id === 'tkt-3');
      expect(ticket?.assigned_agent_id).toBe('agent-2');
      // agent-2 ticket_count incremented from 1 → 2
      const agent = component.agents().find((a) => a.id === 'agent-2');
      expect(agent?.ticket_count).toBe(2);
      expect(toastSpy).toHaveBeenCalledWith(
        'admin.support.reassign_success',
        'success',
      );
      expect(component.reassigning()).toBeNull();
    });

    it('shows an error toast and clears reassigning on PUT failure', async () => {
      const toast = TestBed.inject(ToastService);
      const toastSpy = vi.spyOn(toast, 'show');
      const confirmSvc = TestBed.inject(ConfirmDialogService);

      const promise = component.reassignTicket('tkt-3', 'agent-2');
      confirmSvc._resolve(true);
      await promise;

      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/admin/support/tickets/tkt-3/assign`,
      );
      req.flush(
        { error: 'agent at capacity' },
        { status: 500, statusText: 'Server Error' },
      );

      expect(toastSpy).toHaveBeenCalledWith(
        'admin.support.reassign_error',
        'error',
      );
      expect(component.reassigning()).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Loading state — captured before the GET flushes
// ---------------------------------------------------------------------------

describe('AgentQueueVisualizationComponent – loading state', () => {
  it('renders the loading skeleton while the GET is in flight', () => {
    TestBed.resetTestingModule();
    configure();
    const fixture = TestBed.createComponent(AgentQueueVisualizationComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // ngOnInit → loading = true, GET pending

    const element = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.loading()).toBe(true);
    expect(element.querySelector('[data-testid="queue-loading"]')).not.toBeNull();
    // The post-load layout (agent grid) is not rendered yet.
    expect(element.querySelector('[data-testid="agent-grid"]')).toBeNull();

    httpMock.expectOne(QUEUE_URL).flush({ agents: [], tickets: [] });
    fixture.detectChanges();
    httpMock.verify();
  });
});

// ---------------------------------------------------------------------------
// Empty state — zero tickets
// ---------------------------------------------------------------------------

describe('AgentQueueVisualizationComponent – empty state', () => {
  it('renders the tickets-empty message and an empty distribution', () => {
    TestBed.resetTestingModule();
    configure();
    const fixture = TestBed.createComponent(AgentQueueVisualizationComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne(QUEUE_URL).flush({ agents: [], tickets: [] });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="tickets-empty"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="ticket-table"]')).toBeNull();
    expect(fixture.componentInstance.categoryDistribution()).toEqual([]);
    httpMock.verify();
  });
});

// ---------------------------------------------------------------------------
// Error path — fail-loud error UI, NO fabricated mock fallback
// ---------------------------------------------------------------------------

describe('AgentQueueVisualizationComponent – GET error (fail-loud)', () => {
  it('renders a fail-loud error state with EMPTY data when the GET fails', () => {
    TestBed.resetTestingModule();
    configure();
    const fixture = TestBed.createComponent(AgentQueueVisualizationComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock
      .expectOne(QUEUE_URL)
      .flush(
        { error: 'queue service unavailable' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    fixture.detectChanges();

    const component = fixture.componentInstance;
    // No fabricated agents/tickets — a support console showing fake queues
    // misleads operators about real workload.
    expect(component.loading()).toBe(false);
    expect(component.agents().length).toBe(0);
    expect(component.tickets().length).toBe(0);
    expect(component.error()).not.toBeNull();

    const element = fixture.nativeElement as HTMLElement;
    const err = element.querySelector('[data-testid="queue-error"]');
    expect(err).not.toBeNull();
    expect(err?.getAttribute('role')).toBe('alert');
    httpMock.verify();
  });

  it('clears the error and loads real data when retry succeeds', () => {
    TestBed.resetTestingModule();
    configure();
    const fixture = TestBed.createComponent(AgentQueueVisualizationComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock
      .expectOne(QUEUE_URL)
      .flush({ error: 'down' }, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).not.toBeNull();

    fixture.componentInstance.refresh();
    httpMock
      .expectOne(QUEUE_URL)
      .flush({ agents: STUB_AGENTS, tickets: STUB_TICKETS });
    fixture.detectChanges();

    expect(fixture.componentInstance.error()).toBeNull();
    expect(fixture.componentInstance.agents().length).toBe(2);
    httpMock.verify();
  });
});
