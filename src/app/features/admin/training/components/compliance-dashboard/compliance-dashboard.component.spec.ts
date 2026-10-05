import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ComplianceDashboardComponent } from './compliance-dashboard.component';
import {
  type ComplianceDashboardData,
  type ComplianceDepartment,
} from '../../services/training-admin.service';
import { environment } from '../../../../../../environments/environment';

const COMPLIANCE_URL = `${environment.bffBaseUrl}/api/v1/training-admin/compliance`;

function dept(
  overrides: Partial<ComplianceDepartment> = {},
): ComplianceDepartment {
  return {
    department_id: 'dept-eng',
    department_name: 'Engineering',
    status: 'green',
    completed_count: 18,
    required_count: 20,
    completion_pct: 90,
    deadline: '2026-07-01T00:00:00Z',
    days_remaining: 30,
    overdue_learners: 0,
    ...overrides,
  };
}

const STUB_DATA: ComplianceDashboardData = {
  departments: [
    dept({
      department_id: 'dept-eng',
      department_name: 'Engineering',
      status: 'green',
      completion_pct: 92,
      overdue_learners: 0,
      days_remaining: 30,
      deadline: '2026-07-01T00:00:00Z',
    }),
    dept({
      department_id: 'dept-sales',
      department_name: 'Sales',
      status: 'amber',
      completion_pct: 65,
      overdue_learners: 4,
      days_remaining: 10,
      deadline: '2026-06-20T00:00:00Z',
    }),
    dept({
      department_id: 'dept-ops',
      department_name: 'Operations',
      status: 'red',
      completion_pct: 30,
      overdue_learners: 12,
      days_remaining: 3,
      deadline: '2026-06-10T00:00:00Z',
    }),
  ],
  overall_completion_pct: 62,
  total_overdue: 16,
  next_deadline: '2026-06-10T00:00:00Z',
};

function configure(): void {
  TestBed.configureTestingModule({
    imports: [ComplianceDashboardComponent, TranslateModule.forRoot()],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
}

/** Build the fixture, run ngOnInit (which fires the compliance GET), and
 *  flush it with `data`. Returns the fixture + the still-open httpMock. */
function setupReady(data: ComplianceDashboardData = STUB_DATA): {
  fixture: ComponentFixture<ComplianceDashboardComponent>;
  httpMock: HttpTestingController;
} {
  configure();
  const fixture = TestBed.createComponent(ComplianceDashboardComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges(); // triggers ngOnInit → loadCompliance() GET
  httpMock.expectOne(COMPLIANCE_URL).flush(data);
  fixture.detectChanges();
  return { fixture, httpMock };
}

describe('ComplianceDashboardComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  // -------------------------------------------------------------------------
  // Shell + lifecycle
  // -------------------------------------------------------------------------
  describe('shell + lifecycle', () => {
    it('creates the component', () => {
      const { fixture, httpMock } = setupReady();
      expect(fixture.componentInstance).toBeTruthy();
      httpMock.verify();
    });

    it('fires the compliance GET on init and renders the root section', () => {
      const { fixture, httpMock } = setupReady();
      const root = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="compliance-dashboard"]',
      );
      expect(root).not.toBeNull();
      expect(root?.tagName).toBe('SECTION');
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  describe('loading state', () => {
    it('renders the loading block before the GET resolves', () => {
      configure();
      const fixture = TestBed.createComponent(ComplianceDashboardComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges(); // ngOnInit → loading

      const el = fixture.nativeElement as HTMLElement;
      const loading = el.querySelector('[data-testid="compliance-loading"]');
      expect(loading).not.toBeNull();
      expect(loading?.getAttribute('role')).toBe('status');
      // table not yet rendered
      expect(el.querySelector('[data-testid="compliance-table"]')).toBeNull();

      // resolve the open request so verify() is clean
      httpMock.expectOne(COMPLIANCE_URL).flush(STUB_DATA);
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  // Error state (5xx)
  // -------------------------------------------------------------------------
  describe('error state', () => {
    it('renders the error block + message when the GET 500s', () => {
      configure();
      const fixture = TestBed.createComponent(ComplianceDashboardComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
      httpMock
        .expectOne(COMPLIANCE_URL)
        .flush(
          { error: 'boom' },
          { status: 500, statusText: 'Internal Server Error' },
        );
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const error = el.querySelector('[data-testid="compliance-error"]');
      expect(error).not.toBeNull();
      expect(error?.getAttribute('role')).toBe('alert');
      // the error <p> shows the surfaced HttpErrorResponse message (contains 500)
      expect(error?.textContent).toContain('500');
      // neither table nor loading visible in the error branch
      expect(el.querySelector('[data-testid="compliance-table"]')).toBeNull();
      expect(
        el.querySelector('[data-testid="compliance-loading"]'),
      ).toBeNull();
      httpMock.verify();
    });

    it('renders the error block when the GET 404s', () => {
      configure();
      const fixture = TestBed.createComponent(ComplianceDashboardComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
      httpMock
        .expectOne(COMPLIANCE_URL)
        .flush({ error: 'nope' }, { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      const error = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="compliance-error"]',
      );
      expect(error).not.toBeNull();
      expect(error?.textContent).toContain('404');
      httpMock.verify();
    });

    it('exposes the error message via the complianceError computed', () => {
      configure();
      const fixture = TestBed.createComponent(ComplianceDashboardComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
      httpMock
        .expectOne(COMPLIANCE_URL)
        .flush({}, { status: 503, statusText: 'Service Unavailable' });
      fixture.detectChanges();

      expect(fixture.componentInstance.complianceError().length).toBeGreaterThan(
        0,
      );
      httpMock.verify();
    });

    it('returns empty string from complianceError before any error', () => {
      const { fixture, httpMock } = setupReady();
      expect(fixture.componentInstance.complianceError()).toBe('');
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  // Ready state — summary stats
  // -------------------------------------------------------------------------
  describe('ready state — summary', () => {
    it('renders the header + summary blocks when data is present', () => {
      const { fixture, httpMock } = setupReady();
      const el = fixture.nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-testid="compliance-header"]'),
      ).not.toBeNull();
      expect(
        el.querySelector('[data-testid="compliance-summary"]'),
      ).not.toBeNull();
      httpMock.verify();
    });

    it('shows overall completion pct', () => {
      const { fixture, httpMock } = setupReady();
      const overall = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="overall-completion"]',
      );
      expect(overall?.textContent).toContain('62');
      httpMock.verify();
    });

    it('shows total overdue learner count', () => {
      const { fixture, httpMock } = setupReady();
      const overdue = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="total-overdue"]',
      );
      expect(overdue?.textContent).toContain('16');
      httpMock.verify();
    });

    it('shows the formatted next deadline', () => {
      const { fixture, httpMock } = setupReady();
      const next = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="next-deadline"]',
      );
      // formatDate renders a localized date string; the year is locale-stable
      expect(next?.textContent).toContain('2026');
      httpMock.verify();
    });

    it('exposes computed defaults of 0/0/"" when data is empty', () => {
      const empty: ComplianceDashboardData = {
        departments: [],
        overall_completion_pct: 0,
        total_overdue: 0,
        next_deadline: '',
      };
      const { fixture, httpMock } = setupReady(empty);
      const c = fixture.componentInstance;
      expect(c.departments()).toEqual([]);
      expect(c.overallCompletion()).toBe(0);
      expect(c.totalOverdue()).toBe(0);
      expect(c.nextDeadline()).toBe('');
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  // Ready state — department table
  // -------------------------------------------------------------------------
  describe('ready state — department table', () => {
    it('renders one row per department', () => {
      const { fixture, httpMock } = setupReady();
      const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid^="dept-row-"]',
      );
      expect(rows.length).toBe(3);
      httpMock.verify();
    });

    it('renders department names + status badges', () => {
      const { fixture, httpMock } = setupReady();
      const el = fixture.nativeElement as HTMLElement;
      const sales = el.querySelector('[data-testid="dept-row-dept-sales"]');
      expect(sales?.textContent).toContain('Sales');
      const badge = sales?.querySelector('.compliance-dashboard__badge');
      expect(badge?.textContent?.trim()).toBe('amber');
      expect(
        badge?.classList.contains('compliance-dashboard__badge--amber'),
      ).toBe(true);
      httpMock.verify();
    });

    it('renders a "-" for departments with zero overdue learners', () => {
      const { fixture, httpMock } = setupReady();
      const eng = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="dept-row-dept-eng"]',
      );
      const none = eng?.querySelector('.compliance-dashboard__none');
      expect(none?.textContent?.trim()).toBe('-');
      httpMock.verify();
    });

    it('renders the overdue count for departments with overdue learners', () => {
      const { fixture, httpMock } = setupReady();
      const ops = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="dept-row-dept-ops"]',
      );
      const count = ops?.querySelector('.compliance-dashboard__overdue-count');
      expect(count?.textContent?.trim()).toBe('12');
      httpMock.verify();
    });

    it('marks the days-left cell urgent when <= 7 days remain', () => {
      const { fixture, httpMock } = setupReady();
      const el = fixture.nativeElement as HTMLElement;
      const ops = el.querySelector('[data-testid="dept-row-dept-ops"]');
      const opsDays = ops?.querySelector('.compliance-dashboard__days');
      expect(
        opsDays?.classList.contains('compliance-dashboard__days--urgent'),
      ).toBe(true);

      const eng = el.querySelector('[data-testid="dept-row-dept-eng"]');
      const engDays = eng?.querySelector('.compliance-dashboard__days');
      expect(
        engDays?.classList.contains('compliance-dashboard__days--urgent'),
      ).toBe(false);
      httpMock.verify();
    });

    it('renders the remediate button only for red/amber departments', () => {
      const { fixture, httpMock } = setupReady();
      const el = fixture.nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-testid="remediate-dept-sales"]'),
      ).not.toBeNull();
      expect(
        el.querySelector('[data-testid="remediate-dept-ops"]'),
      ).not.toBeNull();
      // green dept has no remediate CTA
      expect(
        el.querySelector('[data-testid="remediate-dept-eng"]'),
      ).toBeNull();
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  // statusBadgeClass
  // -------------------------------------------------------------------------
  describe('statusBadgeClass', () => {
    it('maps each known status to its badge class', () => {
      const { fixture, httpMock } = setupReady();
      const c = fixture.componentInstance;
      expect(c.statusBadgeClass('green')).toBe(
        'compliance-dashboard__badge--green',
      );
      expect(c.statusBadgeClass('amber')).toBe(
        'compliance-dashboard__badge--amber',
      );
      expect(c.statusBadgeClass('red')).toBe(
        'compliance-dashboard__badge--red',
      );
      httpMock.verify();
    });

    it('returns empty string for an unknown status', () => {
      const { fixture, httpMock } = setupReady();
      expect(fixture.componentInstance.statusBadgeClass('purple')).toBe('');
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  // formatDate
  // -------------------------------------------------------------------------
  describe('formatDate', () => {
    it('returns empty string for an empty input', () => {
      const { fixture, httpMock } = setupReady();
      expect(fixture.componentInstance.formatDate('')).toBe('');
      httpMock.verify();
    });

    it('formats a valid ISO date into a localized string containing the year', () => {
      const { fixture, httpMock } = setupReady();
      const out = fixture.componentInstance.formatDate('2026-07-01T00:00:00Z');
      expect(out).toContain('2026');
      httpMock.verify();
    });

    it('returns a non-empty string even for an unparseable input (Date does not throw)', () => {
      const { fixture, httpMock } = setupReady();
      // new Date('not-a-date') yields Invalid Date; toLocaleDateString → "Invalid Date"
      const out = fixture.componentInstance.formatDate('not-a-date');
      expect(typeof out).toBe('string');
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  // isRemediating
  // -------------------------------------------------------------------------
  describe('isRemediating', () => {
    it('reflects the remediatingDept signal', () => {
      const { fixture, httpMock } = setupReady();
      const c = fixture.componentInstance;
      expect(c.isRemediating('dept-ops')).toBe(false);
      c.remediatingDept.set('dept-ops');
      expect(c.isRemediating('dept-ops')).toBe(true);
      expect(c.isRemediating('dept-sales')).toBe(false);
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  // scheduleRemediation — happy path
  // -------------------------------------------------------------------------
  describe('scheduleRemediation — success', () => {
    it('sets remediatingDept while in flight, then clears + refetches on success', () => {
      const { fixture, httpMock } = setupReady();
      const c = fixture.componentInstance;
      const target = STUB_DATA.departments[2]; // dept-ops (red)

      c.scheduleRemediation(target);
      // set immediately (synchronous) before the POST resolves
      expect(c.remediatingDept()).toBe('dept-ops');

      const remediateUrl = `${environment.bffBaseUrl}/api/v1/training-admin/compliance/dept-ops/remediate`;
      const post = httpMock.expectOne(remediateUrl);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({});
      post.flush({ ok: true });

      // success → remediatingDept cleared + a fresh loadCompliance() GET fires
      expect(c.remediatingDept()).toBeNull();
      httpMock.expectOne(COMPLIANCE_URL).flush(STUB_DATA);

      httpMock.verify();
    });

    it('drives the remediate button into its scheduling label via the click handler', () => {
      const { fixture, httpMock } = setupReady();
      const el = fixture.nativeElement as HTMLElement;

      const btn = el.querySelector(
        '[data-testid="remediate-dept-ops"]',
      ) as HTMLButtonElement;
      expect(btn).not.toBeNull();
      btn.click();
      fixture.detectChanges();

      // button now disabled + shows the scheduling i18n key
      const after = el.querySelector(
        '[data-testid="remediate-dept-ops"]',
      ) as HTMLButtonElement;
      expect(after.disabled).toBe(true);
      expect(after.textContent).toContain('training.compliance.scheduling');

      // resolve the POST + the follow-up refetch GET so verify() is clean
      const remediateUrl = `${environment.bffBaseUrl}/api/v1/training-admin/compliance/dept-ops/remediate`;
      httpMock.expectOne(remediateUrl).flush({ ok: true });
      fixture.detectChanges();
      httpMock.expectOne(COMPLIANCE_URL).flush(STUB_DATA);
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  // scheduleRemediation — error path
  // -------------------------------------------------------------------------
  describe('scheduleRemediation — error', () => {
    it('clears remediatingDept and does NOT refetch when the POST fails', () => {
      const { fixture, httpMock } = setupReady();
      const c = fixture.componentInstance;
      const target = STUB_DATA.departments[1]; // dept-sales (amber)

      c.scheduleRemediation(target);
      expect(c.remediatingDept()).toBe('dept-sales');

      const remediateUrl = `${environment.bffBaseUrl}/api/v1/training-admin/compliance/dept-sales/remediate`;
      httpMock
        .expectOne(remediateUrl)
        .flush(
          { error: 'fail' },
          { status: 500, statusText: 'Internal Server Error' },
        );

      // NOTE: the service swallows the POST error (catchError → of(false)),
      // so the component's `next` callback runs (NOT `error`): remediatingDept
      // is cleared AND a refetch GET still fires. Characterize that here.
      expect(c.remediatingDept()).toBeNull();
      httpMock.expectOne(COMPLIANCE_URL).flush(STUB_DATA);
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  // Computed null-arm coverage — `complianceData()?.x ?? fallback`
  //
  // The "empty data" test exercises the RIGHT (present) arm of each `??` (data
  // exists, fields are []/0/''). Here we drive the LEFT (nullish) arm of the
  // optional chain by reading the computeds while `complianceData()` is null —
  // i.e. before the GET resolves (state === 'loading'). The `?.` short-circuits
  // to undefined and each `?? fallback` returns its default.
  // -------------------------------------------------------------------------
  describe('computed fallbacks when complianceData() is null (loading)', () => {
    it('falls back to []/0/0/"" while the GET is still in flight', () => {
      configure();
      const fixture = TestBed.createComponent(ComplianceDashboardComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges(); // ngOnInit → loading; complianceData() === null
      const c = fixture.componentInstance;

      // The underlying state is loading, so complianceData() is null and every
      // optional-chain access short-circuits onto its `?? fallback`.
      expect(c.departments()).toEqual([]);
      expect(c.overallCompletion()).toBe(0);
      expect(c.totalOverdue()).toBe(0);
      expect(c.nextDeadline()).toBe('');

      // resolve the open request so verify() is clean
      httpMock.expectOne(COMPLIANCE_URL).flush(STUB_DATA);
      httpMock.verify();
    });

    it('still falls back after an error (complianceData() stays null)', () => {
      configure();
      const fixture = TestBed.createComponent(ComplianceDashboardComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
      httpMock
        .expectOne(COMPLIANCE_URL)
        .flush({}, { status: 500, statusText: 'Internal Server Error' });
      fixture.detectChanges();
      const c = fixture.componentInstance;

      // error state → complianceData() === null → `?.` null arm again
      expect(c.departments()).toEqual([]);
      expect(c.overallCompletion()).toBe(0);
      expect(c.totalOverdue()).toBe(0);
      expect(c.nextDeadline()).toBe('');
      // and the ternary's truthy arm is exercised by the error message
      expect(c.complianceError().length).toBeGreaterThan(0);
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  // formatDate — the catch arm
  //
  // `new Date(str).toLocaleDateString(...)` never throws in jsdom for a plain
  // string (an unparseable input yields the literal "Invalid Date"), so the
  // try/catch's catch arm is otherwise unreachable. We force the catch by
  // making toLocaleDateString throw, and characterize that the guard returns
  // the original isoString unchanged. Date is restored afterwards.
  // -------------------------------------------------------------------------
  describe('formatDate — catch arm', () => {
    it('returns the original isoString when toLocaleDateString throws', () => {
      const { fixture, httpMock } = setupReady();
      const proto = Date.prototype as unknown as {
        toLocaleDateString: (...args: unknown[]) => string;
      };
      const original = proto.toLocaleDateString;
      proto.toLocaleDateString = () => {
        throw new RangeError('forced');
      };
      try {
        const out = fixture.componentInstance.formatDate('2026-07-01T00:00:00Z');
        // catch arm → returns the raw input unchanged
        expect(out).toBe('2026-07-01T00:00:00Z');
      } finally {
        proto.toLocaleDateString = original;
      }
      httpMock.verify();
    });
  });

  // -------------------------------------------------------------------------
  // ngOnDestroy
  // -------------------------------------------------------------------------
  describe('ngOnDestroy', () => {
    it('resets the compliance state on destroy', () => {
      const { fixture, httpMock } = setupReady();
      const service = (
        fixture.componentInstance as unknown as {
          trainingService: { complianceState: () => { status: string } };
        }
      ).trainingService;
      expect(service.complianceState().status).toBe('success');

      fixture.destroy();
      expect(service.complianceState().status).toBe('idle');
      httpMock.verify();
    });
  });
});
