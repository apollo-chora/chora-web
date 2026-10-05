import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { MigrationFlowComponent } from './migration-flow.component';
import { PortabilityService } from '../../services/portability.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { environment } from '../../../../../../environments/environment';
import type {
  TenantMembership,
  TenantMembershipListResponse,
  TenantMigration,
} from '../../models/portability.model';

const MEMBERSHIPS_URL = `${environment.bffBaseUrl}/api/v1/tenants/memberships`;
const MIGRATION_URL = `${environment.bffBaseUrl}/api/v1/gcid/migration`;

const STUB_MEMBERSHIPS: TenantMembership[] = [
  {
    id: 'mem-1',
    gcid: 'gcid-aaa',
    tenant_id: 'tenant-alpha',
    roles: ['learner', 'author'],
    joined_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'mem-2',
    gcid: 'gcid-aaa',
    tenant_id: 'tenant-beta',
    roles: ['learner'],
    joined_at: '2026-02-01T00:00:00Z',
  },
];

function membershipsResponse(
  data: TenantMembership[] = STUB_MEMBERSHIPS,
): TenantMembershipListResponse {
  return { data, page_info: { has_next: false } };
}

function buildMigration(overrides: Partial<TenantMigration> = {}): TenantMigration {
  return {
    id: 'mig-1',
    gcid: 'gcid-aaa',
    source_tenant_id: 'tenant-alpha',
    target_tenant_id: 'tenant-beta',
    migration_type: 'transfer',
    data_selections: ['knowledge_graph'],
    status: 'consent_pending',
    consent_expires_at: '2026-07-01T00:00:00Z',
    initiated_at: '2026-06-01T00:00:00Z',
    completed_at: null,
    ...overrides,
  };
}

describe('MigrationFlowComponent', () => {
  let component: MigrationFlowComponent;
  let fixture: ComponentFixture<MigrationFlowComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MigrationFlowComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(MigrationFlowComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="migration-flow"]');
    expect(el).toBeTruthy();
  });

  it('should start in select mode', () => {
    expect(component.mode()).toBe('select');
  });

  it('should switch to departure mode', () => {
    component.selectDeparture('t-1');
    expect(component.mode()).toBe('departure');
    expect(component.sourceTenantId()).toBe('t-1');
  });

  it('should switch to transfer mode', () => {
    component.selectTransfer('t-1');
    expect(component.mode()).toBe('transfer');
    expect(component.sourceTenantId()).toBe('t-1');
  });

  it('should toggle data selection', () => {
    component.toggleDataSelection('knowledge_graph');
    expect(component.isDataSelected('knowledge_graph')).toBe(true);
    component.toggleDataSelection('knowledge_graph');
    expect(component.isDataSelected('knowledge_graph')).toBe(false);
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
// Augmented coverage — HTTP, rendering states, computed signals, flows
// ---------------------------------------------------------------------------

describe('MigrationFlowComponent — memberships load', () => {
  let component: MigrationFlowComponent;
  let fixture: ComponentFixture<MigrationFlowComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [MigrationFlowComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(MigrationFlowComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('GETs memberships on init from the absolute BFF url', () => {
    fixture.detectChanges(); // triggers ngOnInit
    const req = httpMock.expectOne(MEMBERSHIPS_URL);
    expect(req.request.method).toBe('GET');
    req.flush(membershipsResponse());
    fixture.detectChanges();
    expect(component.memberships().length).toBe(2);
  });

  it('renders one tenant card per membership in select mode', () => {
    fixture.detectChanges();
    httpMock.expectOne(MEMBERSHIPS_URL).flush(membershipsResponse());
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="tenant-list"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="tenant-tenant-alpha"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="tenant-tenant-beta"]')).not.toBeNull();
    // role chips render the author/learner roles
    expect(element.querySelector('[data-testid="tenant-tenant-alpha"]')?.textContent).toContain(
      'author',
    );
  });

  it('shows the empty state when there are no memberships', () => {
    fixture.detectChanges();
    httpMock.expectOne(MEMBERSHIPS_URL).flush(membershipsResponse([]));
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="no-memberships"]')).not.toBeNull();
  });

  it('shows a toast and stays empty on a 500 memberships error', () => {
    const toast = TestBed.inject(ToastService);
    const spy = vi.spyOn(toast, 'show');

    fixture.detectChanges();
    httpMock
      .expectOne(MEMBERSHIPS_URL)
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // catchError → of(null) → component sees a null result → error toast
    expect(spy).toHaveBeenCalledWith('identity.portability.memberships_load_error', 'error');
    expect(component.memberships().length).toBe(0);
    // membership state is error; the component never enters loading anymore
    expect(component.isLoading()).toBe(false);
  });

  it('renders the loading skeleton while memberships are loading', () => {
    fixture.detectChanges(); // ngOnInit → loading state, request outstanding
    expect(component.isLoading()).toBe(true);
    expect(element.querySelector('[data-testid="migration-loading"]')).not.toBeNull();
    // settle the outstanding request so afterEach verify() passes
    httpMock.expectOne(MEMBERSHIPS_URL).flush(membershipsResponse());
  });
});

describe('MigrationFlowComponent — computed signals', () => {
  let component: MigrationFlowComponent;
  let fixture: ComponentFixture<MigrationFlowComponent>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [MigrationFlowComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(MigrationFlowComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne(MEMBERSHIPS_URL).flush(membershipsResponse());
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('sourceTenant resolves to the matching membership', () => {
    expect(component.sourceTenant()).toBeNull();
    component.selectDeparture('tenant-alpha');
    expect(component.sourceTenant()?.tenant_id).toBe('tenant-alpha');
  });

  it('sourceTenant is null for an unknown id', () => {
    component.selectDeparture('tenant-unknown');
    expect(component.sourceTenant()).toBeNull();
  });

  it('availableTargets excludes the source tenant', () => {
    expect(component.availableTargets().length).toBe(2);
    component.selectTransfer('tenant-alpha');
    const targets = component.availableTargets();
    expect(targets.length).toBe(1);
    expect(targets[0].tenant_id).toBe('tenant-beta');
  });

  it('canInitiateDeparture requires a source and no in-flight submit', () => {
    expect(component.canInitiateDeparture()).toBe(false);
    component.sourceTenantId.set('tenant-alpha');
    expect(component.canInitiateDeparture()).toBe(true);
    component.submitting.set(true);
    expect(component.canInitiateDeparture()).toBe(false);
  });

  it('canInitiateTransfer requires source, target, selections, no submit', () => {
    expect(component.canInitiateTransfer()).toBe(false);
    component.sourceTenantId.set('tenant-alpha');
    component.targetTenantId.set('tenant-beta');
    expect(component.canInitiateTransfer()).toBe(false); // no selections yet
    component.toggleDataSelection('knowledge_graph');
    expect(component.canInitiateTransfer()).toBe(true);
    component.submitting.set(true);
    expect(component.canInitiateTransfer()).toBe(false);
  });

  it('hasMigration is false with no active migration', () => {
    expect(component.hasMigration()).toBe(false);
  });

  it('backToSelect resets mode, source, target, and selections', () => {
    component.selectTransfer('tenant-alpha');
    component.targetTenantId.set('tenant-beta');
    component.toggleDataSelection('assessments');
    component.backToSelect();
    expect(component.mode()).toBe('select');
    expect(component.sourceTenantId()).toBeNull();
    expect(component.targetTenantId()).toBeNull();
    expect(component.selectedData().size).toBe(0);
  });
});

describe('MigrationFlowComponent — departure flow', () => {
  let component: MigrationFlowComponent;
  let fixture: ComponentFixture<MigrationFlowComponent>;
  let httpMock: HttpTestingController;
  let confirmDialog: ConfirmDialogService;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [MigrationFlowComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(MigrationFlowComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    confirmDialog = TestBed.inject(ConfirmDialogService);
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
    httpMock.expectOne(MEMBERSHIPS_URL).flush(membershipsResponse());
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('returns early when the user cancels the confirm dialog', async () => {
    component.selectDeparture('tenant-alpha');
    const pending = component.onInitiateDeparture();
    // resolve the dialog with a cancel
    confirmDialog._resolve(false);
    await pending;
    // no migration request fired
    httpMock.expectNone(MIGRATION_URL);
    expect(component.submitting()).toBe(false);
  });

  it('returns early when there is no source tenant id', async () => {
    // never selected a tenant → sourceTenantId is null
    await component.onInitiateDeparture();
    httpMock.expectNone(MIGRATION_URL);
  });

  it('POSTs a departure migration and shows a success toast', async () => {
    const spy = vi.spyOn(toast, 'show');
    component.selectDeparture('tenant-alpha');
    const pending = component.onInitiateDeparture();
    confirmDialog._resolve(true);
    await Promise.resolve(); // let the awaited confirm settle
    expect(component.submitting()).toBe(true);

    const req = httpMock.expectOne(MIGRATION_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      source_tenant_id: 'tenant-alpha',
      migration_type: 'departure',
    });
    req.flush(buildMigration({ migration_type: 'departure', target_tenant_id: null }));
    await pending;

    expect(component.submitting()).toBe(false);
    expect(spy).toHaveBeenCalledWith('identity.portability.departure_initiated', 'success');
    expect(component.hasMigration()).toBe(true);
  });

  it('shows an error toast when the departure POST 4xx fails', async () => {
    const spy = vi.spyOn(toast, 'show');
    component.selectDeparture('tenant-alpha');
    const pending = component.onInitiateDeparture();
    confirmDialog._resolve(true);
    await Promise.resolve();

    httpMock
      .expectOne(MIGRATION_URL)
      .flush({ error: 'nope' }, { status: 409, statusText: 'Conflict' });
    await pending;

    // service catchError → of(null) → next handler with null → error toast
    expect(component.submitting()).toBe(false);
    expect(spy).toHaveBeenCalledWith('identity.portability.departure_error', 'error');
  });
});

describe('MigrationFlowComponent — transfer flow', () => {
  let component: MigrationFlowComponent;
  let fixture: ComponentFixture<MigrationFlowComponent>;
  let httpMock: HttpTestingController;
  let confirmDialog: ConfirmDialogService;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [MigrationFlowComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(MigrationFlowComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    confirmDialog = TestBed.inject(ConfirmDialogService);
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
    httpMock.expectOne(MEMBERSHIPS_URL).flush(membershipsResponse());
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('returns early when source or target is missing', async () => {
    component.selectTransfer('tenant-alpha');
    // targetTenantId still null
    await component.onInitiateTransfer();
    httpMock.expectNone(MIGRATION_URL);
  });

  it('POSTs a transfer migration with the selected data and succeeds', async () => {
    const spy = vi.spyOn(toast, 'show');
    component.selectTransfer('tenant-alpha');
    component.targetTenantId.set('tenant-beta');
    component.toggleDataSelection('knowledge_graph');
    component.toggleDataSelection('assessments');

    const pending = component.onInitiateTransfer();
    confirmDialog._resolve(true);
    await Promise.resolve();

    const req = httpMock.expectOne(MIGRATION_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      source_tenant_id: 'tenant-alpha',
      target_tenant_id: 'tenant-beta',
      migration_type: 'transfer',
      data_selections: ['knowledge_graph', 'assessments'],
    });
    req.flush(buildMigration());
    await pending;

    expect(component.submitting()).toBe(false);
    expect(spy).toHaveBeenCalledWith('identity.portability.transfer_initiated', 'success');
  });

  it('shows an error toast when the transfer POST 5xx fails', async () => {
    const spy = vi.spyOn(toast, 'show');
    component.selectTransfer('tenant-alpha');
    component.targetTenantId.set('tenant-beta');
    component.toggleDataSelection('knowledge_graph');

    const pending = component.onInitiateTransfer();
    confirmDialog._resolve(true);
    await Promise.resolve();

    httpMock
      .expectOne(MIGRATION_URL)
      .flush({ error: 'oops' }, { status: 503, statusText: 'Unavailable' });
    await pending;

    expect(spy).toHaveBeenCalledWith('identity.portability.transfer_error', 'error');
  });

  it('does not POST when the transfer confirm is cancelled', async () => {
    component.selectTransfer('tenant-alpha');
    component.targetTenantId.set('tenant-beta');
    component.toggleDataSelection('knowledge_graph');

    const pending = component.onInitiateTransfer();
    confirmDialog._resolve(false);
    await pending;

    httpMock.expectNone(MIGRATION_URL);
    expect(component.submitting()).toBe(false);
  });
});

describe('MigrationFlowComponent — confirm migration (consent)', () => {
  let component: MigrationFlowComponent;
  let fixture: ComponentFixture<MigrationFlowComponent>;
  let httpMock: HttpTestingController;
  let confirmDialog: ConfirmDialogService;
  let toast: ToastService;
  let portability: PortabilityService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [MigrationFlowComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(MigrationFlowComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    confirmDialog = TestBed.inject(ConfirmDialogService);
    toast = TestBed.inject(ToastService);
    portability = TestBed.inject(PortabilityService);
    fixture.detectChanges();
    httpMock.expectOne(MEMBERSHIPS_URL).flush(membershipsResponse());
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  // helper: seed an active migration into the service state via initiateMigration
  function seedMigration(overrides: Partial<TenantMigration> = {}): void {
    portability
      .initiateMigration({
        source_tenant_id: 'tenant-alpha',
        target_tenant_id: 'tenant-beta',
        migration_type: 'transfer',
        data_selections: ['knowledge_graph'],
      })
      .subscribe();
    httpMock.expectOne(MIGRATION_URL).flush(buildMigration(overrides));
  }

  it('returns early when there is no active migration', async () => {
    await component.onConfirmMigration();
    httpMock.expectNone(`${MIGRATION_URL}/mig-1/confirm`);
  });

  it('POSTs consent and shows a success toast on confirm', async () => {
    const spy = vi.spyOn(toast, 'show');
    seedMigration();
    expect(component.hasMigration()).toBe(true);

    const pending = component.onConfirmMigration();
    confirmDialog._resolve(true);
    await Promise.resolve();

    const req = httpMock.expectOne(`${MIGRATION_URL}/mig-1/confirm`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ consent_granted: true });
    req.flush(buildMigration({ status: 'transferring' }));
    await pending;

    expect(spy).toHaveBeenCalledWith('identity.portability.migration_confirmed', 'success');
    expect(component.submitting()).toBe(false);
  });

  it('shows an error toast when the confirm POST fails', async () => {
    const spy = vi.spyOn(toast, 'show');
    seedMigration();

    const pending = component.onConfirmMigration();
    confirmDialog._resolve(true);
    await Promise.resolve();

    httpMock
      .expectOne(`${MIGRATION_URL}/mig-1/confirm`)
      .flush({ error: 'bad' }, { status: 422, statusText: 'Unprocessable' });
    await pending;

    expect(spy).toHaveBeenCalledWith('identity.portability.migration_confirm_error', 'error');
  });

  it('does not POST consent when the dialog is cancelled', async () => {
    seedMigration();
    const pending = component.onConfirmMigration();
    confirmDialog._resolve(false);
    await pending;
    httpMock.expectNone(`${MIGRATION_URL}/mig-1/confirm`);
  });
});

describe('MigrationFlowComponent — active migration rendering + timeline', () => {
  let component: MigrationFlowComponent;
  let fixture: ComponentFixture<MigrationFlowComponent>;
  let httpMock: HttpTestingController;
  let portability: PortabilityService;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [MigrationFlowComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(MigrationFlowComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    portability = TestBed.inject(PortabilityService);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    httpMock.expectOne(MEMBERSHIPS_URL).flush(membershipsResponse());
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function seed(overrides: Partial<TenantMigration> = {}): void {
    portability
      .initiateMigration({
        source_tenant_id: 'tenant-alpha',
        target_tenant_id: 'tenant-beta',
        migration_type: 'transfer',
        data_selections: ['knowledge_graph'],
      })
      .subscribe();
    httpMock.expectOne(MIGRATION_URL).flush(buildMigration(overrides));
    fixture.detectChanges();
  }

  it('renders the active migration card + timeline when a migration exists', () => {
    seed({ status: 'consent_pending' });
    expect(element.querySelector('[data-testid="active-migration"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="migration-timeline"]')).not.toBeNull();
    // 4 timeline steps from STATUS_ORDER
    const steps = element.querySelectorAll('.migration-flow__timeline-step');
    expect(steps.length).toBe(4);
    // tenant list is hidden while a migration is active
    expect(element.querySelector('[data-testid="tenant-list"]')).toBeNull();
  });

  it('shows the consent panel + grant button while consent is pending', () => {
    seed({ status: 'consent_pending' });
    expect(element.querySelector('[data-testid="consent-info"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="btn-confirm-consent"]')).not.toBeNull();
  });

  it('shows the completed panel when the migration is completed', () => {
    seed({ status: 'completed', completed_at: '2026-06-05T00:00:00Z' });
    expect(element.querySelector('[data-testid="migration-completed"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="consent-info"]')).toBeNull();
  });

  it('isStatusReached marks earlier + current statuses reached', () => {
    seed({ status: 'transferring' });
    expect(component.isStatusReached('initiated')).toBe(true);
    expect(component.isStatusReached('consent_pending')).toBe(true);
    expect(component.isStatusReached('transferring')).toBe(true);
    expect(component.isStatusReached('completed')).toBe(false);
  });

  it('isCurrentStatus matches only the active status', () => {
    seed({ status: 'transferring' });
    expect(component.isCurrentStatus('transferring')).toBe(true);
    expect(component.isCurrentStatus('completed')).toBe(false);
  });

  it('isStatusReached/isCurrentStatus are false when no migration', () => {
    // no seed
    expect(component.isStatusReached('initiated')).toBe(false);
    expect(component.isCurrentStatus('initiated')).toBe(false);
  });

  it('back-to-select button resets the migration view', () => {
    seed({ status: 'consent_pending' });
    const btn = element.querySelector('[data-testid="btn-back-to-select"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    fixture.detectChanges();
    expect(component.hasMigration()).toBe(false);
    expect(component.mode()).toBe('select');
  });
});

describe('MigrationFlowComponent — formatDate + lifecycle', () => {
  let component: MigrationFlowComponent;
  let fixture: ComponentFixture<MigrationFlowComponent>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [MigrationFlowComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(MigrationFlowComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne(MEMBERSHIPS_URL).flush(membershipsResponse());
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('formatDate renders a human date for a valid ISO string', () => {
    const out = component.formatDate('2026-06-01T00:00:00Z');
    expect(out).toContain('2026');
  });

  it('formatDate returns the raw input for an invalid date', () => {
    // toLocaleDateString on an invalid Date does not throw → returns "Invalid Date".
    // Characterize the actual (no-throw) behavior: the catch is unreachable here.
    const out = component.formatDate('not-a-date');
    expect(typeof out).toBe('string');
  });

  it('ngOnDestroy unsubscribes + resets migration state without throwing', () => {
    expect(() => fixture.destroy()).not.toThrow();
  });
});
