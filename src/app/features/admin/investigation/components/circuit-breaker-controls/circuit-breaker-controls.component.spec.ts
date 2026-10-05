import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CircuitBreakerControlsComponent } from './circuit-breaker-controls.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../../environments/environment';

const CB_URL = `${environment.bffBaseUrl}/api/v1/admin/agents/circuit-breakers`;

interface AgentStub {
  agent_id: string;
  agent_name: string;
  service: string;
  state: 'closed' | 'open' | 'half-open';
  failure_count: number;
  last_failure_at: string | null;
  canary_pct: number;
  is_quarantined: boolean;
}

const STUB_AGENTS: AgentStub[] = [
  {
    agent_id: 'a-closed',
    agent_name: 'ClosedAgent',
    service: 'chora-atomic',
    state: 'closed',
    failure_count: 0,
    last_failure_at: null,
    canary_pct: 100,
    is_quarantined: false,
  },
  {
    agent_id: 'a-half',
    agent_name: 'HalfAgent',
    service: 'chora-familiar',
    state: 'half-open',
    failure_count: 3,
    last_failure_at: '2026-06-01T10:00:00Z',
    canary_pct: 50,
    is_quarantined: false,
  },
  {
    agent_id: 'a-open',
    agent_name: 'OpenAgent',
    service: 'chora-engagement',
    state: 'open',
    failure_count: 9,
    last_failure_at: '2026-06-01T11:00:00Z',
    canary_pct: 0,
    is_quarantined: true,
  },
];

function build(): {
  fixture: ComponentFixture<CircuitBreakerControlsComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [CircuitBreakerControlsComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
    ],
  });
  const fixture = TestBed.createComponent(CircuitBreakerControlsComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, httpMock };
}

/** Build + flush the initial GET with the provided agents. */
function buildWithAgents(agents: AgentStub[]): {
  fixture: ComponentFixture<CircuitBreakerControlsComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
} {
  const { fixture, httpMock } = build();
  fixture.detectChanges(); // ngOnInit → loadAgents → GET
  httpMock.expectOne(CB_URL).flush(agents);
  fixture.detectChanges();
  return { fixture, httpMock, element: fixture.nativeElement as HTMLElement };
}

describe('CircuitBreakerControlsComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('initial load (HTTP success)', () => {
    let fixture: ComponentFixture<CircuitBreakerControlsComponent>;
    let httpMock: HttpTestingController;
    let element: HTMLElement;

    beforeEach(() => {
      const built = buildWithAgents(STUB_AGENTS);
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
    });

    afterEach(() => httpMock.verify());

    it('creates the component', () => {
      expect(fixture.componentInstance).toBeTruthy();
    });

    it('issues the GET against the BFF circuit-breakers path', () => {
      // The initial GET was already consumed in buildWithAgents.
      expect(fixture.componentInstance.agents().length).toBe(3);
    });

    it('renders the page shell with the main landmark', () => {
      const root = element.querySelector('[data-testid="circuit-breaker-controls"]');
      expect(root).not.toBeNull();
      expect(root?.getAttribute('role')).toBe('main');
    });

    it('renders the title', () => {
      // en.json isn't loaded in tests, so | translate emits the raw key (prod humanizes).
      const title = element.querySelector('[data-testid="cb-title"]');
      expect(title?.textContent).toContain('admin.investigation.circuit_breaker_title');
    });

    it('clears the loading flag and hides the skeleton after load', () => {
      expect(fixture.componentInstance.loading()).toBe(false);
      expect(element.querySelector('[data-testid="cb-loading"]')).toBeNull();
    });

    it('renders one card per agent', () => {
      const cards = element.querySelectorAll(
        '[data-testid^="agent-a-"]',
      );
      expect(cards.length).toBe(3);
    });

    it('renders agent name and service on a card', () => {
      const card = element.querySelector('[data-testid="agent-a-closed"]');
      expect(card?.textContent).toContain('ClosedAgent');
      expect(card?.textContent).toContain('chora-atomic');
    });
  });

  describe('summary counts (computed)', () => {
    it('computes closed / open / half-open / quarantined counts', () => {
      const { fixture, httpMock, element } = buildWithAgents(STUB_AGENTS);
      const c = fixture.componentInstance;
      expect(c.closedCount()).toBe(1);
      expect(c.halfOpenCount()).toBe(1);
      expect(c.openCount()).toBe(1);
      expect(c.quarantinedCount()).toBe(1);

      const summary = element.querySelector('[data-testid="cb-summary"]');
      expect(summary?.textContent).toContain('1');
      httpMock.verify();
    });

    it('reports zero counts for an empty agent list', () => {
      const { fixture, httpMock } = buildWithAgents([]);
      const c = fixture.componentInstance;
      expect(c.closedCount()).toBe(0);
      expect(c.openCount()).toBe(0);
      expect(c.halfOpenCount()).toBe(0);
      expect(c.quarantinedCount()).toBe(0);
      httpMock.verify();
    });
  });

  describe('initial load (HTTP error → fail-loud, NO mock fallback)', () => {
    it('renders a fail-loud error state with an EMPTY agent list (no fabricated data)', () => {
      const { fixture, httpMock } = build();
      fixture.detectChanges();
      httpMock
        .expectOne(CB_URL)
        .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      const c = fixture.componentInstance;
      expect(c.loading()).toBe(false);
      // A breaker console showing fabricated agent states is dangerous —
      // there must be NO fallback data on error.
      expect(c.agents().length).toBe(0);
      expect(c.error()).not.toBeNull();

      const element = fixture.nativeElement as HTMLElement;
      const errorEl = element.querySelector('[data-testid="cb-error"]');
      expect(errorEl).not.toBeNull();
      expect(errorEl?.getAttribute('role')).toBe('alert');
      // The old hardcoded mock agents must NEVER render.
      expect(element.querySelector('[data-testid="agent-agent-001"]')).toBeNull();
      httpMock.verify();
    });

    it('clears the error and loads real agents when retry succeeds', () => {
      const { fixture, httpMock } = build();
      fixture.detectChanges();
      httpMock
        .expectOne(CB_URL)
        .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      expect(fixture.componentInstance.error()).not.toBeNull();

      fixture.componentInstance.refresh();
      httpMock.expectOne(CB_URL).flush(STUB_AGENTS);
      fixture.detectChanges();

      expect(fixture.componentInstance.error()).toBeNull();
      expect(fixture.componentInstance.agents().length).toBe(3);
      httpMock.verify();
    });
  });

  describe('quarantine state badge rendering', () => {
    let element: HTMLElement;
    let httpMock: HttpTestingController;

    beforeEach(() => {
      const built = buildWithAgents(STUB_AGENTS);
      element = built.element;
      httpMock = built.httpMock;
    });

    afterEach(() => httpMock.verify());

    it('shows a quarantine badge for quarantined agents', () => {
      const card = element.querySelector('[data-testid="agent-a-open"]');
      expect(card?.textContent).toContain('admin.investigation.quarantined');
      expect(
        card?.classList.contains('circuit-breaker-controls__agent-card--quarantined'),
      ).toBe(true);
    });

    it('disables the canary slider + apply for quarantined agents', () => {
      const slider = element.querySelector(
        '[data-testid="canary-slider-a-open"]',
      ) as HTMLInputElement;
      expect(slider.disabled).toBe(true);
      const apply = element.querySelector(
        '[data-testid="btn-apply-canary-a-open"]',
      ) as HTMLButtonElement;
      expect(apply.disabled).toBe(true);
    });

    it('shows an Unquarantine label for quarantined agents', () => {
      const btn = element.querySelector(
        '[data-testid="btn-quarantine-a-open"]',
      ) as HTMLButtonElement;
      expect(btn.textContent).toContain('admin.investigation.unquarantine');
    });

    it('shows a Quarantine label for active agents', () => {
      const btn = element.querySelector(
        '[data-testid="btn-quarantine-a-closed"]',
      ) as HTMLButtonElement;
      expect(btn.textContent).toContain('admin.investigation.quarantine');
    });
  });

  describe('helpers', () => {
    let component: CircuitBreakerControlsComponent;
    let httpMock: HttpTestingController;

    beforeEach(() => {
      const built = buildWithAgents(STUB_AGENTS);
      component = built.fixture.componentInstance;
      httpMock = built.httpMock;
    });

    afterEach(() => httpMock.verify());

    it('stateClass builds the per-state modifier class', () => {
      expect(component.stateClass('open')).toBe(
        'circuit-breaker-controls__state--open',
      );
      expect(component.stateClass('half-open')).toBe(
        'circuit-breaker-controls__state--half-open',
      );
    });

    it('isActionInProgress reflects the actionInProgress signal', () => {
      expect(component.isActionInProgress('a-closed')).toBe(false);
      component.actionInProgress.set('a-closed');
      expect(component.isActionInProgress('a-closed')).toBe(true);
      expect(component.isActionInProgress('a-open')).toBe(false);
    });

    it('formatTimestamp returns a dash for null', () => {
      expect(component.formatTimestamp(null)).toBe('-');
    });

    it('formatTimestamp formats a valid ISO string', () => {
      const out = component.formatTimestamp('2026-06-01T10:00:00Z');
      expect(out).not.toBe('-');
      expect(typeof out).toBe('string');
    });

    it('exposes the state-label i18n key map', () => {
      expect(component.stateLabels.closed).toBe('admin.investigation.cb_closed');
      expect(component.stateLabels.open).toBe('admin.investigation.cb_open');
      expect(component.stateLabels['half-open']).toBe(
        'admin.investigation.cb_half_open',
      );
    });
  });

  describe('canary routing', () => {
    let component: CircuitBreakerControlsComponent;
    let httpMock: HttpTestingController;

    beforeEach(() => {
      const built = buildWithAgents(STUB_AGENTS);
      component = built.fixture.componentInstance;
      httpMock = built.httpMock;
    });

    afterEach(() => httpMock.verify());

    it('onCanaryChange updates the agent canary_pct from the input event', () => {
      const event = { target: { value: '75' } } as unknown as Event;
      component.onCanaryChange('a-closed', event);
      const agent = component.agents().find((a) => a.agent_id === 'a-closed');
      expect(agent?.canary_pct).toBe(75);
      // Other agents untouched.
      const other = component.agents().find((a) => a.agent_id === 'a-half');
      expect(other?.canary_pct).toBe(50);
    });

    it('applyCanaryRouting PUTs the canary_pct and clears actionInProgress on success', () => {
      const agent = component.agents().find((a) => a.agent_id === 'a-closed')!;
      const toast = TestBed.inject(ToastService);
      const toastSpy = vi.spyOn(toast, 'show');

      component.applyCanaryRouting(agent);
      expect(component.isActionInProgress('a-closed')).toBe(true);

      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/admin/agents/a-closed/routing`,
      );
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ canary_pct: 100 });
      req.flush(null);

      expect(component.isActionInProgress('a-closed')).toBe(false);
      expect(toastSpy).toHaveBeenCalledWith(
        'admin.investigation.routing_updated',
        'success',
      );
    });

    it('applyCanaryRouting surfaces an error toast and clears progress on failure', () => {
      const agent = component.agents().find((a) => a.agent_id === 'a-half')!;
      const toast = TestBed.inject(ToastService);
      const toastSpy = vi.spyOn(toast, 'show');

      component.applyCanaryRouting(agent);
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/admin/agents/a-half/routing`,
      );
      req.flush({ error: 'nope' }, { status: 500, statusText: 'Server Error' });

      expect(component.isActionInProgress('a-half')).toBe(false);
      expect(toastSpy).toHaveBeenCalledWith(
        'admin.investigation.routing_error',
        'error',
      );
    });
  });

  describe('toggleQuarantine', () => {
    let component: CircuitBreakerControlsComponent;
    let httpMock: HttpTestingController;
    let confirm: ConfirmDialogService;
    let toast: ToastService;

    beforeEach(() => {
      const built = buildWithAgents(STUB_AGENTS);
      component = built.fixture.componentInstance;
      httpMock = built.httpMock;
      confirm = TestBed.inject(ConfirmDialogService);
      toast = TestBed.inject(ToastService);
    });

    afterEach(() => httpMock.verify());

    it('aborts (no HTTP) when the confirm dialog is dismissed', async () => {
      vi.spyOn(confirm, 'confirm').mockResolvedValue(false);
      const agent = component.agents().find((a) => a.agent_id === 'a-closed')!;

      await component.toggleQuarantine(agent);

      expect(component.isActionInProgress('a-closed')).toBe(false);
      httpMock.verify(); // no POST issued
    });

    it('quarantines an active agent: danger variant confirm, POST, state→open, canary→0', async () => {
      const confirmSpy = vi
        .spyOn(confirm, 'confirm')
        .mockResolvedValue(true);
      const toastSpy = vi.spyOn(toast, 'show');
      const agent = component.agents().find((a) => a.agent_id === 'a-closed')!;

      const done = component.toggleQuarantine(agent);
      // Let the awaited confirm promise resolve.
      await Promise.resolve();

      expect(confirmSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'admin.investigation.quarantine_title',
          confirmText: 'admin.investigation.quarantine',
          variant: 'danger',
        }),
      );

      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/admin/agents/a-closed/quarantine`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(null);
      await done;

      const updated = component.agents().find((a) => a.agent_id === 'a-closed')!;
      expect(updated.is_quarantined).toBe(true);
      expect(updated.state).toBe('open');
      expect(updated.canary_pct).toBe(0);
      expect(component.actionInProgress()).toBe(null);
      expect(component.isActionInProgress('a-closed')).toBe(false);
      expect(toastSpy).toHaveBeenCalledWith(
        'admin.investigation.quarantine_success',
        'success',
      );
    });

    it('unquarantines a quarantined agent: info variant confirm, POST, keeps state', async () => {
      const confirmSpy = vi
        .spyOn(confirm, 'confirm')
        .mockResolvedValue(true);
      const agent = component.agents().find((a) => a.agent_id === 'a-open')!;

      const done = component.toggleQuarantine(agent);
      await Promise.resolve();

      expect(confirmSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'admin.investigation.unquarantine_title',
          variant: 'info',
        }),
      );

      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/admin/agents/a-open/unquarantine`,
      );
      expect(req.request.method).toBe('POST');
      req.flush(null);
      await done;

      const updated = component.agents().find((a) => a.agent_id === 'a-open')!;
      expect(updated.is_quarantined).toBe(false);
      // state was 'open' and stays 'open' on unquarantine.
      expect(updated.state).toBe('open');
    });

    it('shows an error toast and clears progress when the POST fails', async () => {
      vi.spyOn(confirm, 'confirm').mockResolvedValue(true);
      const toastSpy = vi.spyOn(toast, 'show');
      const agent = component.agents().find((a) => a.agent_id === 'a-half')!;

      const done = component.toggleQuarantine(agent);
      await Promise.resolve();

      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/admin/agents/a-half/quarantine`,
      );
      req.flush({ error: 'no' }, { status: 500, statusText: 'Server Error' });
      await done;

      // Unchanged since POST failed.
      const unchanged = component.agents().find((a) => a.agent_id === 'a-half')!;
      expect(unchanged.is_quarantined).toBe(false);
      expect(component.isActionInProgress('a-half')).toBe(false);
      expect(toastSpy).toHaveBeenCalledWith(
        'admin.investigation.quarantine_error',
        'error',
      );
    });
  });

  describe('refresh / reload', () => {
    it('refresh re-issues the GET and replaces the list', () => {
      const { fixture, httpMock } = buildWithAgents(STUB_AGENTS);
      expect(fixture.componentInstance.agents().length).toBe(3);

      fixture.componentInstance.refresh();
      httpMock.expectOne(CB_URL).flush([STUB_AGENTS[0]]);
      fixture.detectChanges();

      expect(fixture.componentInstance.agents().length).toBe(1);
      httpMock.verify();
    });
  });

  describe('lifecycle', () => {
    it('unsubscribes on destroy without error', () => {
      const { fixture, httpMock } = buildWithAgents(STUB_AGENTS);
      expect(() => fixture.destroy()).not.toThrow();
      httpMock.verify();
    });
  });
});
