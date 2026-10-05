import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { IncidentDashboardComponent } from './incident-dashboard.component';
import { InvestigationService } from '../../services/investigation.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import type {
  Incident,
  ResolutionTimelineEntry,
} from '../../models/investigation.model';

// ---------------------------------------------------------------------------
// Fixtures — mirror the shape the (mock-backed) InvestigationService returns.
// ---------------------------------------------------------------------------

const INCIDENTS: Incident[] = [
  {
    id: 'inc-001',
    title: 'Media Processor — Cloud Storage connectivity failure',
    severity: 'high',
    status: 'investigating',
    affectedServices: ['chora-media-processor', 'chora-cms'],
    createdAt: '2026-06-04T01:00:00Z',
    updatedAt: '2026-06-04T02:00:00Z',
    assignedTo: 'ops-team-alpha',
  },
  {
    id: 'inc-002',
    title: 'Engagement service — elevated query latency',
    severity: 'medium',
    status: 'acknowledged',
    affectedServices: ['chora-engagement'],
    createdAt: '2026-06-04T00:00:00Z',
    updatedAt: '2026-06-04T01:30:00Z',
    assignedTo: 'ops-team-beta',
  },
  {
    id: 'inc-003',
    title: 'IAM — sporadic OIDC validation failures',
    severity: 'low',
    status: 'open',
    affectedServices: ['chora-iam'],
    createdAt: '2026-06-03T22:00:00Z',
    updatedAt: '2026-06-03T22:00:00Z',
  },
];

const TIMELINE: ResolutionTimelineEntry[] = [
  {
    timestamp: '2026-06-04T01:00:00Z',
    action: 'Incident created',
    actor: 'system',
    note: 'Auto-detected via health check failure',
  },
  {
    timestamp: '2026-06-04T01:30:00Z',
    action: 'Acknowledged',
    actor: 'ops-team-alpha',
  },
];

function configure(): void {
  TestBed.configureTestingModule({
    imports: [IncidentDashboardComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
    ],
  });
}

describe('IncidentDashboardComponent', () => {
  let fixture: ComponentFixture<IncidentDashboardComponent>;
  let component: IncidentDashboardComponent;
  let element: HTMLElement;
  let service: InvestigationService;
  let confirmDialog: ConfirmDialogService;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    configure();
    service = TestBed.inject(InvestigationService);
    confirmDialog = TestBed.inject(ConfirmDialogService);
    toast = TestBed.inject(ToastService);
    // The service is mock-backed (synchronous `of(...)`); pin the data so the
    // characterization is deterministic and independent of the mock arrays.
    vi.spyOn(service, 'getActiveIncidents').mockReturnValue(of(INCIDENTS));
    vi.spyOn(service, 'getIncidentTimeline').mockReturnValue(of(TIMELINE));

    fixture = TestBed.createComponent(IncidentDashboardComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Shell render
  // -------------------------------------------------------------------------

  describe('shell', () => {
    it('creates the component', () => {
      expect(component).toBeTruthy();
    });

    it('renders the root section with the incident-dashboard testid + class', () => {
      const root = element.querySelector('[data-testid="incident-dashboard"]');
      expect(root).not.toBeNull();
      expect(root?.tagName).toBe('SECTION');
      expect(root?.classList.contains('incident-dashboard')).toBe(true);
      expect(root?.getAttribute('role')).toBe('main');
    });

    it('renders the i18n title key (raw, no translations loaded)', () => {
      const title = element.querySelector('[data-testid="incidents-title"]');
      expect(title?.textContent).toContain('admin.investigation.incidents_title');
    });

    it('renders the refresh button and the back link', () => {
      expect(
        element.querySelector('[data-testid="btn-refresh-incidents"]'),
      ).not.toBeNull();
      expect(element.querySelector('[data-testid="btn-back"]')).not.toBeNull();
    });

    it('renders both filter selects', () => {
      expect(element.querySelector('[data-testid="severity-filter"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="status-filter"]')).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Initial load → ready state
  // -------------------------------------------------------------------------

  describe('on init (ready state)', () => {
    it('loads incidents on init and clears loading', () => {
      expect(service.getActiveIncidents).toHaveBeenCalledTimes(1);
      expect(component.incidents().length).toBe(3);
      expect(component.loading()).toBe(false);
    });

    it('renders one card per incident', () => {
      const cards = element.querySelectorAll('[data-testid^="incident-inc-"]');
      expect(cards.length).toBe(3);
    });

    it('renders incident title + uppercased severity + status', () => {
      const card = element.querySelector('[data-testid="incident-inc-001"]');
      expect(card?.textContent).toContain(
        'Media Processor — Cloud Storage connectivity failure',
      );
      // UpperCasePipe applied to severity
      expect(card?.textContent).toContain('HIGH');
      // status rendered raw
      expect(card?.textContent).toContain('investigating');
    });

    it('renders affected-service chips for an incident', () => {
      const card = element.querySelector('[data-testid="incident-inc-001"]');
      expect(card?.textContent).toContain('chora-media-processor');
      expect(card?.textContent).toContain('chora-cms');
    });

    it('shows the assignee when present and the unassigned key otherwise', () => {
      const assigned = element.querySelector('[data-testid="incident-inc-001"]');
      expect(assigned?.textContent).toContain('ops-team-alpha');
      const unassigned = element.querySelector('[data-testid="incident-inc-003"]');
      expect(unassigned?.textContent).toContain('admin.investigation.unassigned');
    });

    it('does not render loading skeleton or empty state when ready', () => {
      expect(element.querySelector('[data-testid="incidents-loading"]')).toBeNull();
      expect(element.querySelector('[data-testid="incidents-empty"]')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  describe('loading state', () => {
    it('renders the loading skeleton while loading() is true', () => {
      component.loading.set(true);
      fixture.detectChanges();
      const loading = element.querySelector('[data-testid="incidents-loading"]');
      expect(loading).not.toBeNull();
      expect(loading?.querySelectorAll('.incident-dashboard__skeleton-row').length).toBe(3);
    });

    it('isEmpty() is false while loading even with no incidents', () => {
      component.incidents.set([]);
      component.loading.set(true);
      expect(component.isEmpty()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  describe('empty state', () => {
    it('renders the empty-state block when there are no incidents', () => {
      component.incidents.set([]);
      fixture.detectChanges();
      const empty = element.querySelector('[data-testid="incidents-empty"]');
      expect(empty).not.toBeNull();
      expect(empty?.textContent).toContain('admin.investigation.no_incidents');
      expect(component.isEmpty()).toBe(true);
    });

    it('hides the list layout when empty', () => {
      component.incidents.set([]);
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="incident-list"]')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  describe('filters', () => {
    it('filters by severity via onSeverityFilter', () => {
      component.onSeverityFilter('low');
      expect(component.filterSeverity()).toBe('low');
      expect(component.filteredIncidents().length).toBe(1);
      expect(component.filteredIncidents()[0].id).toBe('inc-003');
    });

    it('clears the severity filter when an empty value is supplied', () => {
      component.onSeverityFilter('low');
      component.onSeverityFilter('');
      expect(component.filterSeverity()).toBeNull();
      expect(component.filteredIncidents().length).toBe(3);
    });

    it('filters by status via onStatusFilter', () => {
      component.onStatusFilter('open');
      expect(component.filterStatus()).toBe('open');
      expect(component.filteredIncidents().length).toBe(1);
      expect(component.filteredIncidents()[0].id).toBe('inc-003');
    });

    it('clears the status filter when an empty value is supplied', () => {
      component.onStatusFilter('open');
      component.onStatusFilter('');
      expect(component.filterStatus()).toBeNull();
      expect(component.filteredIncidents().length).toBe(3);
    });

    it('combines severity + status filters (AND)', () => {
      component.onSeverityFilter('high');
      component.onStatusFilter('investigating');
      expect(component.filteredIncidents().length).toBe(1);
      expect(component.filteredIncidents()[0].id).toBe('inc-001');

      component.onStatusFilter('open');
      expect(component.filteredIncidents().length).toBe(0);
    });

    it('routes select-change events through the filter handlers', () => {
      const sev = element.querySelector(
        '[data-testid="severity-filter"]',
      ) as HTMLSelectElement;
      sev.value = 'medium';
      sev.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(component.filterSeverity()).toBe('medium');
    });
  });

  // -------------------------------------------------------------------------
  // Selection + timeline
  // -------------------------------------------------------------------------

  describe('selection + timeline', () => {
    it('selects an incident, loads its timeline, and renders the detail panel', () => {
      component.selectIncident('inc-001');
      fixture.detectChanges();

      expect(component.selectedIncidentId()).toBe('inc-001');
      expect(component.isSelected('inc-001')).toBe(true);
      expect(service.getIncidentTimeline).toHaveBeenCalledWith('inc-001');
      expect(component.timeline().length).toBe(2);
      expect(component.timelineLoading()).toBe(false);

      const detail = element.querySelector('[data-testid="incident-detail"]');
      expect(detail).not.toBeNull();
      const timeline = element.querySelector('[data-testid="timeline"]');
      expect(timeline?.textContent).toContain('Incident created');
      expect(timeline?.textContent).toContain('Auto-detected via health check failure');
    });

    it('selectedIncident() resolves to the matching incident object', () => {
      component.selectIncident('inc-002');
      expect(component.selectedIncident()?.id).toBe('inc-002');
    });

    it('selectedIncident() is null when nothing is selected', () => {
      expect(component.selectedIncident()).toBeNull();
    });

    it('toggles selection off when the same incident is clicked again', () => {
      component.selectIncident('inc-001');
      expect(component.selectedIncidentId()).toBe('inc-001');
      component.selectIncident('inc-001');
      expect(component.selectedIncidentId()).toBeNull();
      expect(component.timeline().length).toBe(0);
    });

    it('shows the empty-timeline message when the timeline is empty', () => {
      (service.getIncidentTimeline as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        of([]),
      );
      component.selectIncident('inc-002');
      fixture.detectChanges();
      const detail = element.querySelector('[data-testid="incident-detail"]');
      expect(detail?.textContent).toContain('admin.investigation.no_timeline');
      expect(element.querySelector('[data-testid="timeline"]')).toBeNull();
    });

    it('surfaces a timeline load error via toast and clears timelineLoading', () => {
      const toastSpy = vi.spyOn(toast, 'show');
      vi.spyOn(service, 'getIncidentTimeline').mockReturnValue(
        throwError(() => new Error('boom')),
      );
      component.selectIncident('inc-001');
      expect(toastSpy).toHaveBeenCalledWith(
        'admin.investigation.timeline_load_error',
        'error',
      );
      expect(component.timelineLoading()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Action gating helpers
  // -------------------------------------------------------------------------

  describe('action gating', () => {
    it('canAcknowledge only when status is open', () => {
      expect(component.canAcknowledge(INCIDENTS[2])).toBe(true); // open
      expect(component.canAcknowledge(INCIDENTS[1])).toBe(false); // acknowledged
      expect(component.canAcknowledge(INCIDENTS[0])).toBe(false); // investigating
    });

    it('canEscalate when open or acknowledged', () => {
      expect(component.canEscalate(INCIDENTS[2])).toBe(true); // open
      expect(component.canEscalate(INCIDENTS[1])).toBe(true); // acknowledged
      expect(component.canEscalate(INCIDENTS[0])).toBe(false); // investigating
    });

    it('canResolve unless already resolved', () => {
      expect(component.canResolve(INCIDENTS[0])).toBe(true);
      const resolved: Incident = { ...INCIDENTS[0], status: 'resolved' };
      expect(component.canResolve(resolved)).toBe(false);
    });

    it('renders the acknowledge button only for open incidents', () => {
      expect(element.querySelector('[data-testid="btn-ack-inc-003"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="btn-ack-inc-001"]')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Incident actions (confirm-dialog driven)
  // -------------------------------------------------------------------------

  describe('acknowledgeIncident', () => {
    it('does nothing when the confirm dialog is dismissed', async () => {
      vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(false);
      const transitionSpy = vi.spyOn(service, 'transitionIncident');
      await component.acknowledgeIncident(INCIDENTS[2]);
      expect(transitionSpy).not.toHaveBeenCalled();
    });

    it('transitions to acknowledged, toasts success, and reloads on confirm', async () => {
      vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
      const transitionSpy = vi
        .spyOn(service, 'transitionIncident')
        .mockReturnValue(of(undefined));
      const toastSpy = vi.spyOn(toast, 'show');
      const loadSpy = vi.spyOn(component, 'loadIncidents');

      await component.acknowledgeIncident(INCIDENTS[2]);

      expect(transitionSpy).toHaveBeenCalledWith('inc-003', 'acknowledged');
      expect(toastSpy).toHaveBeenCalledWith('admin.investigation.acknowledged', 'success');
      expect(loadSpy).toHaveBeenCalled();
    });

    it('toasts an error when the transition fails', async () => {
      vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
      vi.spyOn(service, 'transitionIncident').mockReturnValue(
        throwError(() => new Error('500')),
      );
      const toastSpy = vi.spyOn(toast, 'show');
      await component.acknowledgeIncident(INCIDENTS[2]);
      expect(toastSpy).toHaveBeenCalledWith(
        'admin.investigation.acknowledge_error',
        'error',
      );
    });
  });

  describe('escalateIncident', () => {
    it('transitions to investigating and toasts success on confirm', async () => {
      vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
      const transitionSpy = vi
        .spyOn(service, 'transitionIncident')
        .mockReturnValue(of(undefined));
      const toastSpy = vi.spyOn(toast, 'show');
      await component.escalateIncident(INCIDENTS[2]);
      expect(transitionSpy).toHaveBeenCalledWith('inc-003', 'investigating');
      expect(toastSpy).toHaveBeenCalledWith('admin.investigation.escalated', 'success');
    });

    it('toasts an error when the escalate transition fails', async () => {
      vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
      vi.spyOn(service, 'transitionIncident').mockReturnValue(
        throwError(() => new Error('500')),
      );
      const toastSpy = vi.spyOn(toast, 'show');
      await component.escalateIncident(INCIDENTS[2]);
      expect(toastSpy).toHaveBeenCalledWith(
        'admin.investigation.escalate_error',
        'error',
      );
    });

    it('does nothing when escalate is not confirmed', async () => {
      vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(false);
      const transitionSpy = vi.spyOn(service, 'transitionIncident');
      await component.escalateIncident(INCIDENTS[2]);
      expect(transitionSpy).not.toHaveBeenCalled();
    });
  });

  describe('resolveIncident', () => {
    it('transitions to resolved and toasts success on confirm', async () => {
      vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
      const transitionSpy = vi
        .spyOn(service, 'transitionIncident')
        .mockReturnValue(of(undefined));
      const toastSpy = vi.spyOn(toast, 'show');
      await component.resolveIncident(INCIDENTS[0]);
      expect(transitionSpy).toHaveBeenCalledWith('inc-001', 'resolved');
      expect(toastSpy).toHaveBeenCalledWith('admin.investigation.resolved', 'success');
    });

    it('toasts an error when the resolve transition fails', async () => {
      vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
      vi.spyOn(service, 'transitionIncident').mockReturnValue(
        throwError(() => new Error('500')),
      );
      const toastSpy = vi.spyOn(toast, 'show');
      await component.resolveIncident(INCIDENTS[0]);
      expect(toastSpy).toHaveBeenCalledWith(
        'admin.investigation.resolve_error',
        'error',
      );
    });
  });

  // -------------------------------------------------------------------------
  // loadIncidents error path
  // -------------------------------------------------------------------------

  describe('loadIncidents error path', () => {
    it('toasts an error and clears loading when the list fetch fails', () => {
      const toastSpy = vi.spyOn(toast, 'show');
      vi.spyOn(service, 'getActiveIncidents').mockReturnValue(
        throwError(() => new Error('503')),
      );
      component.loadIncidents();
      expect(toastSpy).toHaveBeenCalledWith(
        'admin.investigation.incidents_load_error',
        'error',
      );
      expect(component.loading()).toBe(false);
    });

    it('refreshes the list when the refresh button is clicked', () => {
      const loadSpy = vi.spyOn(component, 'loadIncidents');
      const btn = element.querySelector(
        '[data-testid="btn-refresh-incidents"]',
      ) as HTMLButtonElement;
      btn.click();
      expect(loadSpy).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // CSS-class + date helpers
  // -------------------------------------------------------------------------

  describe('helpers', () => {
    it('severityClass + statusClass build BEM modifier strings', () => {
      expect(component.severityClass('high')).toBe(
        'incident-dashboard__severity--high',
      );
      expect(component.statusClass('open')).toBe('incident-dashboard__status--open');
    });

    it('formatDateTime returns a locale string for a valid ISO date', () => {
      const out = component.formatDateTime('2026-06-04T01:00:00Z');
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    });

    it('formatTimestamp returns a time string for a valid ISO date', () => {
      const out = component.formatTimestamp('2026-06-04T01:00:00Z');
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  describe('lifecycle', () => {
    it('unsubscribes on destroy without throwing', () => {
      expect(() => fixture.destroy()).not.toThrow();
    });
  });
});
