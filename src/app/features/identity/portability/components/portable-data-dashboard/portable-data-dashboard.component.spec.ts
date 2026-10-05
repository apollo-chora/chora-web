import { ComponentFixture, TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { PortableDataDashboardComponent } from './portable-data-dashboard.component';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../../environments/environment';
import type { PortableDataSummary, DataExportResponse } from '../../models/portability.model';

const SUMMARY_URL = `${environment.bffBaseUrl}/api/v1/gcid/data/summary`;
const EXPORT_URL = `${environment.bffBaseUrl}/api/v1/gcid/data/export`;

function makeSummary(overrides: Partial<PortableDataSummary> = {}): PortableDataSummary {
  return {
    gcid: 'gcid-abc',
    gcid_scoped: {
      knowledge_graph_nodes: 10,
      familiar_observations: 5,
      digital_skins: 2,
      rag_persona_entries: 3,
      consent_preferences: 4,
    },
    tenant_scoped: [
      {
        tenant_id: 't-1',
        tenant_name: 'Acme Academy',
        is_active: true,
        enrollment_count: 7,
        assessment_count: 11,
        authored_content_count: 2,
        roles: ['learner', 'author'],
      },
      {
        tenant_id: 't-2',
        tenant_name: 'Beta College',
        is_active: false,
        enrollment_count: 1,
        assessment_count: 0,
        authored_content_count: 0,
        roles: ['learner'],
      },
    ],
    ...overrides,
  };
}

function makeExport(overrides: Partial<DataExportResponse> = {}): DataExportResponse {
  return {
    export_id: 'exp-1',
    status: 'queued',
    download_url: null,
    created_at: '2026-06-04T00:00:00Z',
    completed_at: null,
    error_message: null,
    ...overrides,
  };
}

describe('PortableDataDashboardComponent', () => {
  let component: PortableDataDashboardComponent;
  let fixture: ComponentFixture<PortableDataDashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PortableDataDashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(PortableDataDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // -------------------------------------------------------------------------
  // Pre-existing tests (preserved verbatim)
  // -------------------------------------------------------------------------

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="portable-data-dashboard"]');
    expect(el).toBeTruthy();
  });

  it('should start with no selected tenant', () => {
    expect(component.selectedTenantId()).toBeNull();
  });

  it('should select a tenant', () => {
    component.selectTenant('t-1');
    expect(component.selectedTenantId()).toBe('t-1');
    expect(component.isSelectedTenant('t-1')).toBe(true);
    expect(component.isSelectedTenant('t-2')).toBe(false);
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
// New augmented coverage — uses isolated TestBed per block so the ngOnInit
// load can be driven through HttpTestingController.
// ---------------------------------------------------------------------------

describe('PortableDataDashboardComponent (augmented)', () => {
  let component: PortableDataDashboardComponent;
  let fixture: ComponentFixture<PortableDataDashboardComponent>;
  let httpMock: HttpTestingController;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PortableDataDashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(PortableDataDashboardComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function flushSummary(summary: PortableDataSummary): void {
    fixture.detectChanges(); // triggers ngOnInit -> loadData()
    const req = httpMock.expectOne(SUMMARY_URL);
    expect(req.request.method).toBe('GET');
    req.flush(summary);
    fixture.detectChanges();
  }

  // ---- Loading state ----

  it('renders the loading skeleton while data is in flight', () => {
    fixture.detectChanges(); // ngOnInit fires GET, state = loading
    expect(component.isLoading()).toBe(true);
    const loading = fixture.nativeElement.querySelector('[data-testid="data-loading"]');
    expect(loading).toBeTruthy();

    // flush so verify() is satisfied
    const req = httpMock.expectOne(SUMMARY_URL);
    req.flush(makeSummary());
  });

  // ---- Success state + computed signals ----

  it('renders summary bar with gcid + tenant counts on success', () => {
    flushSummary(makeSummary());

    expect(component.dataState().status).toBe('success');
    // gcid count = 10+5+2+3+4 = 24
    expect(component.gcidScopedCount()).toBe(24);
    // tenant count = (7+11+2) + (1+0+0) = 21
    expect(component.tenantScopedCount()).toBe(21);

    const gcidCount = fixture.nativeElement.querySelector('[data-testid="gcid-count"]');
    const tenantCount = fixture.nativeElement.querySelector('[data-testid="tenant-count"]');
    expect(gcidCount.textContent.trim()).toBe('24');
    expect(tenantCount.textContent.trim()).toBe('21');
  });

  it('auto-selects the first tenant after a successful load', () => {
    flushSummary(makeSummary());
    expect(component.selectedTenantId()).toBe('t-1');
    expect(component.selectedTenant()?.tenant_name).toBe('Acme Academy');
  });

  it('splits tenants into active vs historical', () => {
    flushSummary(makeSummary());
    expect(component.activeTenants().map((t) => t.tenant_id)).toEqual(['t-1']);
    expect(component.historicalTenants().map((t) => t.tenant_id)).toEqual(['t-2']);
  });

  it('exposes gcidScoped data and renders the GCID stat values', () => {
    flushSummary(makeSummary());
    expect(component.gcidScoped()?.knowledge_graph_nodes).toBe(10);

    const knowledge = fixture.nativeElement.querySelector('[data-testid="stat-knowledge"]');
    expect(knowledge.textContent).toContain('10');
    const familiar = fixture.nativeElement.querySelector('[data-testid="stat-familiar"]');
    expect(familiar.textContent).toContain('5');
  });

  it('renders one tab per tenant and reflects selected tenant detail', () => {
    flushSummary(makeSummary());
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(2);

    const detail = fixture.nativeElement.querySelector('[data-testid="detail-t-1"]');
    expect(detail).toBeTruthy();
    const enrollments = fixture.nativeElement.querySelector('[data-testid="tenant-enrollments"]');
    expect(enrollments.textContent.trim()).toBe('7');
    const assessments = fixture.nativeElement.querySelector('[data-testid="tenant-assessments"]');
    expect(assessments.textContent.trim()).toBe('11');
    const authored = fixture.nativeElement.querySelector('[data-testid="tenant-authored"]');
    expect(authored.textContent.trim()).toBe('2');
  });

  it('switches tenant detail when another tab is clicked', () => {
    flushSummary(makeSummary());
    const tab2 = fixture.nativeElement.querySelector(
      '[data-testid="tab-t-2"]',
    ) as HTMLButtonElement;
    tab2.click();
    fixture.detectChanges();

    expect(component.selectedTenantId()).toBe('t-2');
    expect(component.selectedTenant()?.tenant_name).toBe('Beta College');
    const detail = fixture.nativeElement.querySelector('[data-testid="detail-t-2"]');
    expect(detail).toBeTruthy();
  });

  // ---- Empty state ----

  it('renders the empty state when there are no tenants', () => {
    flushSummary(makeSummary({ tenant_scoped: [] }));

    expect(component.isEmpty()).toBe(true);
    const empty = fixture.nativeElement.querySelector('[data-testid="tenant-empty"]');
    expect(empty).toBeTruthy();
    // No auto-selection when no tenants
    expect(component.selectedTenantId()).toBeNull();
    // No tabs rendered
    expect(fixture.nativeElement.querySelector('[data-testid="tenant-tabs"]')).toBeNull();
  });

  it('gcidScopedCount returns 0 when gcid_scoped data is absent', () => {
    // dataState never set to success -> portableData() is null -> gcidScoped() null
    fixture.detectChanges();
    const req = httpMock.expectOne(SUMMARY_URL);
    req.flush(makeSummary());
    fixture.detectChanges();
    // sanity: with data it is non-zero
    expect(component.gcidScopedCount()).toBeGreaterThan(0);
  });

  // ---- Error state ----

  it('renders the error panel and shows a toast on a 500 load failure', () => {
    fixture.detectChanges(); // ngOnInit GET
    const req = httpMock.expectOne(SUMMARY_URL);
    req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(component.dataState().status).toBe('error');
    const errorEl = fixture.nativeElement.querySelector('[data-testid="data-error"]');
    expect(errorEl).toBeTruthy();
    // service catchError returns null -> component shows load_error toast
    expect(toast.toasts().some((t) => t.message === 'identity.portability.data_load_error')).toBe(
      true,
    );
  });

  it('retries the load when the retry button is clicked', () => {
    fixture.detectChanges();
    httpMock
      .expectOne(SUMMARY_URL)
      .flush({ message: 'boom' }, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();

    const retryBtn = fixture.nativeElement.querySelector(
      '[data-testid="btn-retry"]',
    ) as HTMLButtonElement;
    expect(retryBtn).toBeTruthy();
    retryBtn.click();
    fixture.detectChanges();

    // a second GET is issued by loadData()
    const retryReq = httpMock.expectOne(SUMMARY_URL);
    expect(retryReq.request.method).toBe('GET');
    retryReq.flush(makeSummary());
    fixture.detectChanges();
    expect(component.dataState().status).toBe('success');
  });

  // ---- Export dialog open/close lifecycle ----

  it('opens the export dialog for a tenant and resets format to json', () => {
    flushSummary(makeSummary());
    component.exportFormat.set('csv');

    component.openExportDialog('t-2');
    fixture.detectChanges();

    expect(component.exportDialogOpen()).toBe(true);
    expect(component.exportingTenantId()).toBe('t-2');
    expect(component.exportFormat()).toBe('json');
    expect(component.exportingTenantName()).toBe('Beta College');

    const dialog = fixture.nativeElement.querySelector('[data-testid="export-dialog"]');
    expect(dialog).toBeTruthy();
  });

  it('opens the export dialog via the per-tenant export button', () => {
    flushSummary(makeSummary());
    const btn = fixture.nativeElement.querySelector(
      '[data-testid="btn-export-tenant"]',
    ) as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();
    expect(component.exportDialogOpen()).toBe(true);
    expect(component.exportingTenantId()).toBe('t-1');
  });

  it('closes the export dialog and clears the exporting tenant', () => {
    flushSummary(makeSummary());
    component.openExportDialog('t-1');
    fixture.detectChanges();

    component.closeExportDialog();
    fixture.detectChanges();

    expect(component.exportDialogOpen()).toBe(false);
    expect(component.exportingTenantId()).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="export-dialog"]')).toBeNull();
  });

  it('updates the export format via onExportFormatChange', () => {
    component.onExportFormatChange('csv');
    expect(component.exportFormat()).toBe('csv');
    component.onExportFormatChange('json');
    expect(component.exportFormat()).toBe('json');
  });

  it('exportingTenantName returns empty string when no tenant is exporting', () => {
    flushSummary(makeSummary());
    expect(component.exportingTenantId()).toBeNull();
    expect(component.exportingTenantName()).toBe('');
  });

  // ---- Export flow: startExport guard ----

  it('startExport is a no-op when no tenant is selected for export', () => {
    flushSummary(makeSummary());
    // exportingTenantId is null at this point
    component.startExport();
    // no export POST should be fired
    httpMock.expectNone(EXPORT_URL);
    expect(component.exportState().status).toBe('idle');
  });

  // ---- Export flow: success polling to completion ----

  it('runs the export polling flow to completion and shows a success toast', fakeAsync(() => {
    flushSummary(makeSummary());
    component.openExportDialog('t-1');
    fixture.detectChanges();

    component.startExport();

    // initiation POST
    const initReq = httpMock.expectOne(EXPORT_URL);
    expect(initReq.request.method).toBe('POST');
    expect(initReq.request.body).toEqual({
      scope: 'tenant_scoped',
      tenant_id: 't-1',
      format: 'json',
    });
    initReq.flush(makeExport({ export_id: 'exp-9', status: 'queued' }));

    // timer(0,...) emits immediately -> first status GET
    tick(0);
    const statusUrl = `${EXPORT_URL}/exp-9`;
    const poll1 = httpMock.expectOne(statusUrl);
    expect(poll1.request.method).toBe('GET');
    poll1.flush(makeExport({ export_id: 'exp-9', status: 'processing' }));

    // next poll after 3s, returns completed -> stops
    tick(3000);
    const poll2 = httpMock.expectOne(statusUrl);
    poll2.flush(
      makeExport({
        export_id: 'exp-9',
        status: 'completed',
        download_url: 'https://files.chora.site/exp-9.json',
        completed_at: '2026-06-04T00:05:00Z',
      }),
    );

    fixture.detectChanges();
    expect(component.isExportComplete()).toBe(true);
    expect(toast.toasts().some((t) => t.message === 'identity.portability.export_complete')).toBe(
      true,
    );

    // dialog now shows the complete panel
    const complete = fixture.nativeElement.querySelector('[data-testid="export-complete"]');
    expect(complete).toBeTruthy();

    flush();
  }));

  it('shows a failure toast when the export status returns failed', fakeAsync(() => {
    flushSummary(makeSummary());
    component.openExportDialog('t-1');
    fixture.detectChanges();

    component.startExport();
    httpMock.expectOne(EXPORT_URL).flush(makeExport({ export_id: 'exp-x', status: 'queued' }));

    tick(0);
    httpMock
      .expectOne(`${EXPORT_URL}/exp-x`)
      .flush(makeExport({ export_id: 'exp-x', status: 'failed', error_message: 'nope' }));

    fixture.detectChanges();
    expect(toast.toasts().some((t) => t.message === 'identity.portability.export_error')).toBe(
      true,
    );
    expect(component.isExportComplete()).toBe(false);
    flush();
  }));

  it('shows an error toast (and the switchMap rethrows) when export initiation returns null (4xx)', fakeAsync(() => {
    // PROD BUG (characterized): startExport()'s pipe has no catchError, so when
    // initiation returns null the `throw new Error('Export initiation failed')`
    // inside switchMap propagates to the handler-less .subscribe() and surfaces
    // as an unhandled error at flush time. The toast IS shown first, then it throws.
    flushSummary(makeSummary());
    component.openExportDialog('t-1');
    fixture.detectChanges();

    component.startExport();
    const initReq = httpMock.expectOne(EXPORT_URL);

    // The throw surfaces while the fakeAsync zone drains the flushed response.
    expect(() => {
      initReq.flush({ message: 'bad request' }, { status: 400, statusText: 'Bad Request' });
      flush();
    }).toThrow('Export initiation failed');

    // error toast was shown before the throw
    expect(toast.toasts().some((t) => t.message === 'identity.portability.export_error')).toBe(
      true,
    );
    // no status polling occurs because initiation failed
    httpMock.expectNone(`${EXPORT_URL}/exp-1`);
  }));

  it('reflects isExporting=true while the export initiation is in flight', fakeAsync(() => {
    flushSummary(makeSummary());
    component.openExportDialog('t-1');
    fixture.detectChanges();

    component.startExport();
    fixture.detectChanges();
    // export state set to 'loading' synchronously by the service
    expect(component.isExporting()).toBe(true);
    const progress = fixture.nativeElement.querySelector('[data-testid="export-progress"]');
    expect(progress).toBeTruthy();

    httpMock.expectOne(EXPORT_URL).flush(makeExport({ export_id: 'exp-1', status: 'queued' }));
    tick(0);
    httpMock
      .expectOne(`${EXPORT_URL}/exp-1`)
      .flush(
        makeExport({ export_id: 'exp-1', status: 'completed', download_url: 'https://x/exp-1' }),
      );
    flush();
  }));

  // ---- downloadExport ----

  it('downloadExport opens the download url in a new tab when complete', fakeAsync(() => {
    flushSummary(makeSummary());
    component.openExportDialog('t-1');
    fixture.detectChanges();

    component.startExport();
    httpMock.expectOne(EXPORT_URL).flush(makeExport({ export_id: 'exp-7', status: 'queued' }));
    tick(0);
    httpMock.expectOne(`${EXPORT_URL}/exp-7`).flush(
      makeExport({
        export_id: 'exp-7',
        status: 'completed',
        download_url: 'https://files.chora.site/exp-7.json',
      }),
    );
    flush();

    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    component.downloadExport();
    expect(openSpy).toHaveBeenCalledWith(
      'https://files.chora.site/exp-7.json',
      '_blank',
      'noopener,noreferrer',
    );
    openSpy.mockRestore();
  }));

  it('downloadExport does nothing when there is no completed export', () => {
    flushSummary(makeSummary());
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    component.downloadExport();
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  // ---- ngOnDestroy ----

  it('unsubscribes and resets export state on destroy', () => {
    flushSummary(makeSummary());
    component.exportDialogOpen.set(true);
    fixture.destroy();
    expect(component.exportState().status).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// Null / not-found / short-circuit arms of the computed signals.
//
// These never call detectChanges(), so ngOnInit -> loadData() does not fire and
// no HTTP request is issued. portableData() therefore stays null (export/data
// state idle), which exercises the implicit "absent" branch of every computed
// signal — the arms the success-path tests above can never reach.
// ---------------------------------------------------------------------------

describe('PortableDataDashboardComponent (null / not-found arms)', () => {
  let component: PortableDataDashboardComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PortableDataDashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    // Intentionally NOT calling detectChanges(): ngOnInit never fires so there
    // is no in-flight HTTP request and portableData() is null.
    const fixture = TestBed.createComponent(PortableDataDashboardComponent);
    component = fixture.componentInstance;
  });

  it('gcidScoped() returns null when portableData is absent (optional-chain + ?? null)', () => {
    expect(component.gcidScoped()).toBeNull();
  });

  it('tenantScoped() returns [] when portableData is absent (?? [] arm)', () => {
    expect(component.tenantScoped()).toEqual([]);
    expect(component.activeTenants()).toEqual([]);
    expect(component.historicalTenants()).toEqual([]);
  });

  it('gcidScopedCount() returns 0 when gcid_scoped is absent (the !gcid guard)', () => {
    expect(component.gcidScoped()).toBeNull();
    expect(component.gcidScopedCount()).toBe(0);
  });

  it('tenantScopedCount() reduces an empty tenant list to 0', () => {
    expect(component.tenantScopedCount()).toBe(0);
  });

  it('selectedTenant() returns null via the !id guard when nothing is selected', () => {
    expect(component.selectedTenantId()).toBeNull();
    expect(component.selectedTenant()).toBeNull();
  });

  it('selectedTenant() returns null via find-miss (?? null) when the id is unknown', () => {
    // id is truthy (skips the !id guard) but absent from the empty tenant list,
    // so find() yields undefined and the ?? null arm returns null.
    component.selectTenant('does-not-exist');
    expect(component.selectedTenantId()).toBe('does-not-exist');
    expect(component.selectedTenant()).toBeNull();
  });

  it('isEmpty() is false when the data state is not success (&& short-circuit)', () => {
    // dataState is idle here (no load fired), so status === 'success' is false
    // and the second operand (length === 0) is never evaluated.
    expect(component.dataState().status).toBe('idle');
    expect(component.isEmpty()).toBe(false);
  });

  it('isLoading() is false in the idle state', () => {
    expect(component.isLoading()).toBe(false);
  });

  it('isExportComplete() is false when there is no export data (data?. optional-chain)', () => {
    expect(component.exportData()).toBeNull();
    expect(component.isExportComplete()).toBe(false);
  });

  it('isExporting() is false in the idle export state', () => {
    expect(component.exportState().status).toBe('idle');
    expect(component.isExporting()).toBe(false);
  });

  it('exportingTenantName() returns "" via the !id guard when nothing is exporting', () => {
    expect(component.exportingTenantId()).toBeNull();
    expect(component.exportingTenantName()).toBe('');
  });

  it('exportingTenantName() returns "" via find-miss (tenant?. + ?? "") when the id is unknown', () => {
    // id truthy -> skips the !id guard; tenant list empty -> find() undefined ->
    // tenant?.tenant_name is undefined -> ?? '' returns the empty string.
    component.exportingTenantId.set('ghost-tenant');
    expect(component.exportingTenantName()).toBe('');
  });

  it('startExport() is a no-op when nothing is being exported (early return, no HTTP)', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    expect(component.exportingTenantId()).toBeNull();
    component.startExport();
    httpMock.expectNone(EXPORT_URL);
    expect(component.exportState().status).toBe('idle');
  });

  it('downloadExport() is a no-op when export data has no download_url', () => {
    // exportData() is null -> data?.download_url is undefined -> window.open skipped.
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    component.downloadExport();
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// isExportComplete() truthy-status-but-null-url arm: status === 'completed'
// passes the first operand, but download_url === null makes the && false.
// ---------------------------------------------------------------------------

describe('PortableDataDashboardComponent (isExportComplete url-null arm)', () => {
  let component: PortableDataDashboardComponent;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PortableDataDashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(PortableDataDashboardComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('isExportComplete() is false when status is completed but download_url is null', fakeAsync(() => {
    // Drive the export pipe to a completed status whose download_url is still
    // null — exercises the right operand of the && in isExportComplete().
    component.exportingTenantId.set('t-1');
    component.startExport();
    httpMock.expectOne(EXPORT_URL).flush(makeExport({ export_id: 'exp-n', status: 'queued' }));
    tick(0);
    httpMock
      .expectOne(`${EXPORT_URL}/exp-n`)
      .flush(makeExport({ export_id: 'exp-n', status: 'completed', download_url: null }));
    flush();

    expect(component.exportData()?.status).toBe('completed');
    expect(component.exportData()?.download_url).toBeNull();
    expect(component.isExportComplete()).toBe(false);
  }));
});
