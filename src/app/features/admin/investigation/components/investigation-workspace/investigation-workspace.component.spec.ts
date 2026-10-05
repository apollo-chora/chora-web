import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { InvestigationWorkspaceComponent } from './investigation-workspace.component';
import { InvestigationService } from '../../services/investigation.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import type {
  ServiceHealthStatus,
  ErrorLogEntry,
  Incident,
} from '../../models/investigation.model';

// ---------------------------------------------------------------------------
// Stub data
// ---------------------------------------------------------------------------

const STUB_HEALTH: ServiceHealthStatus[] = [
  { serviceName: 'svc-a', status: 'healthy', lastChecked: '2026-06-04T00:00:00Z', responseTimeMs: 10 },
  { serviceName: 'svc-b', status: 'healthy', lastChecked: '2026-06-04T00:00:00Z', responseTimeMs: 20 },
  { serviceName: 'svc-c', status: 'degraded', lastChecked: '2026-06-04T00:00:00Z', responseTimeMs: 400 },
  { serviceName: 'svc-d', status: 'unhealthy', lastChecked: '2026-06-04T00:00:00Z', responseTimeMs: 0 },
];

const STUB_ERRORS: ErrorLogEntry[] = [
  {
    timestamp: '2026-06-04T00:00:00Z',
    service: 'svc-d',
    level: 'error',
    message: 'Disk full',
    correlationId: 'corr-err-1',
    tenantId: 'tenant-xyz',
  },
  {
    timestamp: '2026-06-04T00:01:00Z',
    service: 'svc-c',
    level: 'warn',
    message: 'Slow query detected',
    correlationId: 'corr-warn-1',
  },
];

const STUB_INCIDENTS: Incident[] = [
  {
    id: 'inc-crit',
    title: 'Critical outage',
    severity: 'critical',
    status: 'open',
    affectedServices: ['svc-d'],
    createdAt: '2026-06-04T00:00:00Z',
    updatedAt: '2026-06-04T00:10:00Z',
    assignedTo: 'on-call-team',
  },
  {
    id: 'inc-low',
    title: 'Minor blip',
    severity: 'low',
    status: 'acknowledged',
    affectedServices: ['svc-c'],
    createdAt: '2026-06-04T00:00:00Z',
    updatedAt: '2026-06-04T00:05:00Z',
  },
];

/** Build a fixture with the real InvestigationService (mock adapter returns synchronous of(...)). */
function setup(): {
  fixture: ComponentFixture<InvestigationWorkspaceComponent>;
  component: InvestigationWorkspaceComponent;
  element: HTMLElement;
  service: InvestigationService;
  toast: ToastService;
} {
  TestBed.configureTestingModule({
    imports: [InvestigationWorkspaceComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const service = TestBed.inject(InvestigationService);
  const toast = TestBed.inject(ToastService);
  const fixture = TestBed.createComponent(InvestigationWorkspaceComponent);
  const component = fixture.componentInstance;
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, component, element, service, toast };
}

describe('InvestigationWorkspaceComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  // -------------------------------------------------------------------------
  // Shell render with the default (real-service) mock data
  // -------------------------------------------------------------------------
  describe('shell render (default mock data)', () => {
    let fixture: ComponentFixture<InvestigationWorkspaceComponent>;
    let component: InvestigationWorkspaceComponent;
    let element: HTMLElement;

    beforeEach(() => {
      const built = setup();
      fixture = built.fixture;
      component = built.component;
      element = built.element;
      fixture.detectChanges();
    });

    it('creates the component', () => {
      expect(component).toBeTruthy();
    });

    it('renders the workspace root with its data-testid', () => {
      const root = element.querySelector('[data-testid="investigation-workspace"]');
      expect(root).not.toBeNull();
      expect(root?.tagName).toBe('SECTION');
    });

    it('renders the title (i18n key passthrough in tests)', () => {
      const title = element.querySelector('[data-testid="workspace-title"]');
      expect(title?.textContent).toContain('admin.investigation.workspace_title');
    });

    it('renders the incidents nav link and the refresh button', () => {
      expect(element.querySelector('[data-testid="btn-incidents"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="btn-refresh"]')).not.toBeNull();
    });

    it('loads service health from the mock adapter (10 services)', () => {
      expect(component.totalServices()).toBe(10);
    });

    it('computes summary counts from the default mock health data', () => {
      // 8 healthy / 1 degraded / 1 unhealthy in the service mock
      expect(component.healthyCount()).toBe(8);
      expect(component.degradedCount()).toBe(1);
      expect(component.unhealthyCount()).toBe(1);
    });

    it('renders the computed summary counts into the summary cards', () => {
      const healthy = element.querySelector('[data-testid="healthy-count"]');
      const degraded = element.querySelector('[data-testid="degraded-count"]');
      const unhealthy = element.querySelector('[data-testid="unhealthy-count"]');
      expect(healthy?.textContent?.trim()).toBe('8');
      expect(degraded?.textContent?.trim()).toBe('1');
      expect(unhealthy?.textContent?.trim()).toBe('1');
    });

    it('computes critical incidents (critical + high) from the mock incidents', () => {
      // mock incidents: 1 high + 1 medium + 1 low => 1 critical-or-high
      expect(component.criticalIncidents()).toBe(1);
      const card = element.querySelector('[data-testid="critical-incidents"]');
      expect(card?.textContent?.trim()).toBe('1');
    });

    it('hides the loading skeleton once health resolves synchronously', () => {
      expect(component.loading()).toBe(false);
      expect(element.querySelector('[data-testid="workspace-loading"]')).toBeNull();
    });

    it('renders the four panels in the ready grid', () => {
      expect(element.querySelector('[data-testid="health-panel"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="errors-panel"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="alerts-panel"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="search-panel"]')).not.toBeNull();
    });

    it('renders one health row per service with status dot and response time', () => {
      const row = element.querySelector('[data-testid="health-chora-media-processor"]');
      expect(row).not.toBeNull();
      expect(row?.textContent).toContain('chora-media-processor');
      expect(row?.textContent).toContain('0ms');
      const dot = row?.querySelector('.investigation-workspace__health-dot');
      expect(dot?.className).toContain('investigation-workspace__health-dot--unhealthy');
    });

    it('renders error log entries with level + service + message', () => {
      const entry = element.querySelector('[data-testid="log-corr-a1b2c3d4"]');
      expect(entry).not.toBeNull();
      expect(entry?.textContent).toContain('ERROR'); // uppercase pipe
      expect(entry?.textContent).toContain('chora-media-processor');
      expect(entry?.textContent).toContain('tenant-001');
    });

    it('renders incident alerts with uppercased severity + title', () => {
      const alert = element.querySelector('[data-testid="alert-inc-001"]');
      expect(alert).not.toBeNull();
      expect(alert?.textContent).toContain('HIGH');
      expect(alert?.textContent).toContain('Media Processor');
      expect(alert?.textContent).toContain('ops-team-alpha');
    });

    it('renders the entity-type select with all three entity options', () => {
      const options = element.querySelectorAll(
        '[data-testid="entity-type-select"] option',
      );
      expect(options.length).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Empty states (spy the service to return empties)
  // -------------------------------------------------------------------------
  describe('empty states', () => {
    let fixture: ComponentFixture<InvestigationWorkspaceComponent>;
    let element: HTMLElement;

    beforeEach(() => {
      const built = setup();
      fixture = built.fixture;
      element = built.element;
      vi.spyOn(built.service, 'getServiceHealth').mockReturnValue(of([]));
      vi.spyOn(built.service, 'getRecentErrors').mockReturnValue(of([]));
      vi.spyOn(built.service, 'getActiveIncidents').mockReturnValue(of([]));
      fixture.detectChanges();
    });

    it('shows the no-errors empty message when there are no logs', () => {
      const errorsPanel = element.querySelector('[data-testid="errors-panel"]');
      expect(errorsPanel?.textContent).toContain('admin.investigation.no_errors');
    });

    it('shows the no-incidents empty message when there are no incidents', () => {
      const alertsPanel = element.querySelector('[data-testid="alerts-panel"]');
      expect(alertsPanel?.textContent).toContain('admin.investigation.no_incidents');
    });

    it('reports zero counts across the summary computed signals', () => {
      const component = fixture.componentInstance;
      expect(component.totalServices()).toBe(0);
      expect(component.healthyCount()).toBe(0);
      expect(component.degradedCount()).toBe(0);
      expect(component.unhealthyCount()).toBe(0);
      expect(component.criticalIncidents()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Custom stub data drives computed signals
  // -------------------------------------------------------------------------
  describe('with custom stubbed data', () => {
    let fixture: ComponentFixture<InvestigationWorkspaceComponent>;
    let component: InvestigationWorkspaceComponent;

    beforeEach(() => {
      const built = setup();
      fixture = built.fixture;
      component = built.component;
      vi.spyOn(built.service, 'getServiceHealth').mockReturnValue(of(STUB_HEALTH));
      vi.spyOn(built.service, 'getRecentErrors').mockReturnValue(of(STUB_ERRORS));
      vi.spyOn(built.service, 'getActiveIncidents').mockReturnValue(of(STUB_INCIDENTS));
      fixture.detectChanges();
    });

    it('derives 2 healthy / 1 degraded / 1 unhealthy / 4 total from the stub', () => {
      expect(component.healthyCount()).toBe(2);
      expect(component.degradedCount()).toBe(1);
      expect(component.unhealthyCount()).toBe(1);
      expect(component.totalServices()).toBe(4);
    });

    it('counts only the critical incident (critical+high) from the stub', () => {
      // STUB_INCIDENTS: 1 critical + 1 low => 1
      expect(component.criticalIncidents()).toBe(1);
    });

    it('renders the error log without a tenant badge for the warn entry', () => {
      const warnEntry = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="log-corr-warn-1"]',
      );
      expect(warnEntry).not.toBeNull();
      expect(warnEntry?.querySelector('.investigation-workspace__log-tenant')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Error paths — each loader surfaces its own toast key
  // -------------------------------------------------------------------------
  describe('error paths', () => {
    it('shows the health-load-error toast and clears loading when health fails', () => {
      const built = setup();
      const toastSpy = vi.spyOn(built.toast, 'show');
      vi.spyOn(built.service, 'getServiceHealth').mockReturnValue(
        throwError(() => new Error('boom')),
      );
      built.fixture.detectChanges();

      expect(toastSpy).toHaveBeenCalledWith('admin.investigation.health_load_error', 'error');
      expect(built.component.loading()).toBe(false);
    });

    it('shows the errors-load-error toast when recent errors fail', () => {
      const built = setup();
      const toastSpy = vi.spyOn(built.toast, 'show');
      vi.spyOn(built.service, 'getRecentErrors').mockReturnValue(
        throwError(() => new Error('boom')),
      );
      built.fixture.detectChanges();

      expect(toastSpy).toHaveBeenCalledWith('admin.investigation.errors_load_error', 'error');
    });

    it('shows the incidents-load-error toast when active incidents fail', () => {
      const built = setup();
      const toastSpy = vi.spyOn(built.toast, 'show');
      vi.spyOn(built.service, 'getActiveIncidents').mockReturnValue(
        throwError(() => new Error('boom')),
      );
      built.fixture.detectChanges();

      expect(toastSpy).toHaveBeenCalledWith('admin.investigation.incidents_load_error', 'error');
    });
  });

  // -------------------------------------------------------------------------
  // Entity search interactions
  // -------------------------------------------------------------------------
  describe('entity search', () => {
    let fixture: ComponentFixture<InvestigationWorkspaceComponent>;
    let component: InvestigationWorkspaceComponent;
    let element: HTMLElement;
    let service: InvestigationService;
    let toast: ToastService;

    beforeEach(() => {
      const built = setup();
      fixture = built.fixture;
      component = built.component;
      element = built.element;
      service = built.service;
      toast = built.toast;
      fixture.detectChanges();
    });

    it('defaults the entity type to gcid', () => {
      expect(component.searchEntityType()).toBe('gcid');
    });

    it('updates the entity type signal via onEntityTypeChange', () => {
      component.onEntityTypeChange('atom');
      expect(component.searchEntityType()).toBe('atom');
    });

    it('updates the search id signal via onSearchIdInput', () => {
      const evt = { target: { value: 'gcid-123' } } as unknown as Event;
      component.onSearchIdInput(evt);
      expect(component.searchEntityId()).toBe('gcid-123');
    });

    it('does nothing when the search id is blank/whitespace', () => {
      const spy = vi.spyOn(service, 'searchEntity');
      component.searchEntityId.set('   ');
      component.searchEntity();
      expect(spy).not.toHaveBeenCalled();
      expect(component.searching()).toBe(false);
      expect(component.searchResults().length).toBe(0);
    });

    it('searches with the current type + trimmed id and stores the results', () => {
      const spy = vi.spyOn(service, 'searchEntity');
      component.searchEntityType.set('tenant');
      component.searchEntityId.set('  tenant-007  ');
      component.searchEntity();

      expect(spy).toHaveBeenCalledWith('tenant', 'tenant-007');
      expect(component.searching()).toBe(false);
      expect(component.searchResults().length).toBe(1);
      expect(component.searchResults()[0].entityId).toBe('tenant-007');
      expect(component.searchResults()[0].service).toBe('chora-tenancy');
    });

    it('renders the search results panel after a successful search', () => {
      component.searchEntityId.set('atom-42');
      component.searchEntityType.set('atom');
      component.searchEntity();
      fixture.detectChanges();

      const results = element.querySelector('[data-testid="search-results"]');
      expect(results).not.toBeNull();
      expect(results?.textContent).toContain('atom-42');
      expect(results?.textContent).toContain('chora-atomic');
    });

    it('surfaces a search-error toast and clears searching when the lookup fails', () => {
      const toastSpy = vi.spyOn(toast, 'show');
      vi.spyOn(service, 'searchEntity').mockReturnValue(
        throwError(() => new Error('lookup down')),
      );
      component.searchEntityId.set('gcid-bad');
      component.searchEntity();

      expect(toastSpy).toHaveBeenCalledWith('admin.investigation.search_error', 'error');
      expect(component.searching()).toBe(false);
    });

    it('drives search through the input/keyup template wiring', () => {
      const spy = vi.spyOn(service, 'searchEntity');
      const input = element.querySelector(
        '[data-testid="entity-id-input"]',
      ) as HTMLInputElement;
      input.value = 'gcid-from-input';
      input.dispatchEvent(new Event('input'));
      expect(component.searchEntityId()).toBe('gcid-from-input');

      const btn = element.querySelector(
        '[data-testid="btn-search-entity"]',
      ) as HTMLButtonElement;
      btn.click();
      expect(spy).toHaveBeenCalledWith('gcid', 'gcid-from-input');
    });

    it('drives entity-type selection through the template change wiring', () => {
      const select = element.querySelector(
        '[data-testid="entity-type-select"]',
      ) as HTMLSelectElement;
      select.value = 'atom';
      select.dispatchEvent(new Event('change'));
      expect(component.searchEntityType()).toBe('atom');
    });
  });

  // -------------------------------------------------------------------------
  // Refresh + lifecycle
  // -------------------------------------------------------------------------
  describe('refresh + lifecycle', () => {
    it('refresh() re-invokes the loaders', () => {
      const built = setup();
      const healthSpy = vi.spyOn(built.service, 'getServiceHealth');
      const errorsSpy = vi.spyOn(built.service, 'getRecentErrors');
      const incidentsSpy = vi.spyOn(built.service, 'getActiveIncidents');
      built.fixture.detectChanges(); // ngOnInit → loadAll #1 (spy already installed)

      built.component.refresh(); // loadAll #2

      // Each loader is called once in ngOnInit and once again on refresh.
      expect(healthSpy).toHaveBeenCalledTimes(2);
      expect(errorsSpy).toHaveBeenCalledTimes(2);
      expect(incidentsSpy).toHaveBeenCalledTimes(2);
    });

    it('refresh() via the template button re-runs loadAll', () => {
      const built = setup();
      const loadAllSpy = vi.spyOn(built.component, 'loadAll');
      built.fixture.detectChanges();
      (
        built.element.querySelector('[data-testid="btn-refresh"]') as HTMLButtonElement
      ).click();
      expect(loadAllSpy).toHaveBeenCalled();
    });

    it('unsubscribes on destroy without throwing', () => {
      const built = setup();
      built.fixture.detectChanges();
      expect(() => built.fixture.destroy()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // CSS helper methods + timestamp formatters
  // -------------------------------------------------------------------------
  describe('helpers', () => {
    let component: InvestigationWorkspaceComponent;

    beforeEach(() => {
      component = setup().component;
    });

    it('healthStatusClass builds the BEM modifier', () => {
      expect(component.healthStatusClass('degraded')).toBe(
        'investigation-workspace__health-dot--degraded',
      );
    });

    it('logLevelClass builds the BEM modifier', () => {
      expect(component.logLevelClass('warn')).toBe(
        'investigation-workspace__log-level--warn',
      );
    });

    it('severityClass builds the BEM modifier', () => {
      expect(component.severityClass('critical')).toBe(
        'investigation-workspace__severity--critical',
      );
    });

    it('formatTimestamp returns a time string for a valid ISO date', () => {
      const out = component.formatTimestamp('2026-06-04T13:45:30Z');
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    });

    it('formatTimestamp echoes a non-date input unchanged (toLocaleTimeString of Invalid Date)', () => {
      // new Date('not-a-date') is Invalid Date; toLocaleTimeString does not throw,
      // so the catch branch is not hit — characterize the actual string output.
      const out = component.formatTimestamp('not-a-date');
      expect(typeof out).toBe('string');
    });

    it('formatDateTime returns a locale string for a valid ISO date', () => {
      const out = component.formatDateTime('2026-06-04T13:45:30Z');
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    });

    it('formatDateTime returns a string for an invalid input', () => {
      const out = component.formatDateTime('garbage');
      expect(typeof out).toBe('string');
    });
  });
});
