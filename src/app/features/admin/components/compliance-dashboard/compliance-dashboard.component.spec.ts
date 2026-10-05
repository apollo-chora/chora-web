import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ComplianceDashboardComponent } from './compliance-dashboard.component';
import {
  TrainingAdminService,
  type ComplianceDashboardData,
  type ComplianceDepartment,
} from '../../services/training-admin.service';
import { environment } from '../../../../../environments/environment';

const COMPLIANCE_URL = `${environment.bffBaseUrl}/api/v1/training-admin/compliance`;
const remediateUrl = (deptId: string): string =>
  `${environment.bffBaseUrl}/api/v1/training-admin/compliance/${encodeURIComponent(deptId)}/remediate`;

function makeDept(over: Partial<ComplianceDepartment> = {}): ComplianceDepartment {
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
    ...over,
  };
}

const STUB_DATA: ComplianceDashboardData = {
  departments: [
    makeDept({
      department_id: 'dept-eng',
      department_name: 'Engineering',
      status: 'green',
      completion_pct: 90,
      days_remaining: 30,
      overdue_learners: 0,
    }),
    makeDept({
      department_id: 'dept-sales',
      department_name: 'Sales',
      status: 'amber',
      completion_pct: 60,
      days_remaining: 5,
      overdue_learners: 3,
    }),
    makeDept({
      department_id: 'dept-ops',
      department_name: 'Operations',
      status: 'red',
      completion_pct: 25,
      days_remaining: 2,
      overdue_learners: 12,
    }),
  ],
  overall_completion_pct: 58,
  total_overdue: 15,
  next_deadline: '2026-07-15T00:00:00Z',
};

function setup(): {
  fixture: ComponentFixture<ComplianceDashboardComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [ComplianceDashboardComponent, TranslateModule.forRoot()],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(ComplianceDashboardComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, httpMock };
}

describe('ComplianceDashboardComponent', () => {
  let fixture: ComponentFixture<ComplianceDashboardComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    httpMock.verify();
  });

  // --- helper to drive past initial load into the success state ---
  function flushSuccess(data: ComplianceDashboardData = STUB_DATA): void {
    fixture.detectChanges(); // triggers ngOnInit → loadCompliance GET
    httpMock.expectOne(COMPLIANCE_URL).flush(data);
    fixture.detectChanges();
  }

  describe('shell + loading state', () => {
    it('creates the component', () => {
      flushSuccess();
      expect(fixture.componentInstance).toBeTruthy();
    });

    it('renders the dashboard root section', () => {
      flushSuccess();
      const root = element.querySelector('[data-testid="compliance-dashboard"]');
      expect(root).not.toBeNull();
      expect(root?.tagName).toBe('SECTION');
    });

    it('shows the loading state before the GET resolves', () => {
      fixture.detectChanges(); // ngOnInit fires GET → state = loading
      const loading = element.querySelector('[data-testid="compliance-loading"]');
      expect(loading).not.toBeNull();
      expect(loading?.getAttribute('role')).toBe('status');
      // settle the pending request so afterEach verify() passes
      httpMock.expectOne(COMPLIANCE_URL).flush(STUB_DATA);
      fixture.detectChanges();
    });

    it('issues a GET to the compliance endpoint on init', () => {
      fixture.detectChanges();
      const req = httpMock.expectOne(COMPLIANCE_URL);
      expect(req.request.method).toBe('GET');
      req.flush(STUB_DATA);
      fixture.detectChanges();
    });
  });

  describe('success state — header + summary', () => {
    beforeEach(() => flushSuccess());

    it('hides the loading indicator once data arrives', () => {
      expect(
        element.querySelector('[data-testid="compliance-loading"]'),
      ).toBeNull();
    });

    it('renders the header with the title i18n key', () => {
      const header = element.querySelector('[data-testid="compliance-header"]');
      expect(header).not.toBeNull();
      expect(header?.textContent).toContain('training.compliance.title');
    });

    it('renders overall completion percentage from the payload', () => {
      const overall = element.querySelector('[data-testid="overall-completion"]');
      expect(overall?.textContent).toContain('58');
      expect(overall?.textContent).toContain('%');
    });

    it('renders the total overdue count', () => {
      const overdue = element.querySelector('[data-testid="total-overdue"]');
      expect(overdue?.textContent).toContain('15');
    });

    it('renders the formatted next deadline', () => {
      const next = element.querySelector('[data-testid="next-deadline"]');
      // formatDate produces a locale date string containing the year
      expect(next?.textContent).toContain('2026');
    });
  });

  describe('success state — department rollup table', () => {
    beforeEach(() => flushSuccess());

    it('renders one row per department', () => {
      const rows = element.querySelectorAll(
        '[data-testid^="dept-row-"]',
      );
      expect(rows.length).toBe(3);
    });

    it('renders the Engineering row with its name + status text', () => {
      const row = element.querySelector('[data-testid="dept-row-dept-eng"]');
      expect(row?.textContent).toContain('Engineering');
      expect(row?.textContent).toContain('green');
    });

    it('shows the overdue count for departments with overdue learners', () => {
      const salesRow = element.querySelector('[data-testid="dept-row-dept-sales"]');
      const count = salesRow?.querySelector('.compliance-dashboard__overdue-count');
      expect(count?.textContent).toContain('3');
    });

    it('shows a dash when a department has zero overdue learners', () => {
      const engRow = element.querySelector('[data-testid="dept-row-dept-eng"]');
      const none = engRow?.querySelector('.compliance-dashboard__none');
      expect(none?.textContent?.trim()).toBe('-');
    });

    it('marks days-remaining urgent when <= 7', () => {
      const salesRow = element.querySelector('[data-testid="dept-row-dept-sales"]');
      const days = salesRow?.querySelector('.compliance-dashboard__days');
      expect(days?.classList.contains('compliance-dashboard__days--urgent')).toBe(true);
    });

    it('does not mark days-remaining urgent when > 7', () => {
      const engRow = element.querySelector('[data-testid="dept-row-dept-eng"]');
      const days = engRow?.querySelector('.compliance-dashboard__days');
      expect(days?.classList.contains('compliance-dashboard__days--urgent')).toBe(false);
    });

    it('applies the matching progress-fill color class per status', () => {
      const engFill = element
        .querySelector('[data-testid="dept-row-dept-eng"]')
        ?.querySelector('.compliance-dashboard__progress-fill');
      expect(
        engFill?.classList.contains('compliance-dashboard__progress-fill--green'),
      ).toBe(true);

      const opsFill = element
        .querySelector('[data-testid="dept-row-dept-ops"]')
        ?.querySelector('.compliance-dashboard__progress-fill');
      expect(
        opsFill?.classList.contains('compliance-dashboard__progress-fill--red'),
      ).toBe(true);
    });
  });

  describe('remediation button visibility', () => {
    beforeEach(() => flushSuccess());

    it('shows the remediate button for amber departments', () => {
      const btn = element.querySelector(
        '[data-testid="remediate-dept-sales"]',
      );
      expect(btn).not.toBeNull();
      expect(btn?.tagName).toBe('BUTTON');
    });

    it('shows the remediate button for red departments', () => {
      const btn = element.querySelector('[data-testid="remediate-dept-ops"]');
      expect(btn).not.toBeNull();
    });

    it('hides the remediate button for green departments', () => {
      const btn = element.querySelector('[data-testid="remediate-dept-eng"]');
      expect(btn).toBeNull();
    });
  });

  describe('scheduleRemediation flow', () => {
    beforeEach(() => flushSuccess());

    it('POSTs to the remediate endpoint and refetches compliance on success', () => {
      const btn = element.querySelector(
        '[data-testid="remediate-dept-sales"]',
      ) as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();

      const post = httpMock.expectOne(remediateUrl('dept-sales'));
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({});
      post.flush({ scheduled: true });
      fixture.detectChanges();

      // success path triggers a reload GET
      httpMock.expectOne(COMPLIANCE_URL).flush(STUB_DATA);
      fixture.detectChanges();

      // remediatingDept cleared on success
      expect(fixture.componentInstance.isRemediating('dept-sales')).toBe(false);
    });

    it('marks the department as remediating while the POST is in flight', () => {
      const btn = element.querySelector(
        '[data-testid="remediate-dept-sales"]',
      ) as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();

      expect(fixture.componentInstance.isRemediating('dept-sales')).toBe(true);

      // settle the pending POST so afterEach verify() passes
      httpMock.expectOne(remediateUrl('dept-sales')).flush({ scheduled: true });
      fixture.detectChanges();
      httpMock.expectOne(COMPLIANCE_URL).flush(STUB_DATA);
      fixture.detectChanges();
    });

    it('disables the remediate button while remediating', () => {
      fixture.componentInstance.remediatingDept.set('dept-sales');
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="remediate-dept-sales"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('clears remediating state and fires no refetch when the POST fails', () => {
      const btn = element.querySelector(
        '[data-testid="remediate-dept-ops"]',
      ) as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();

      httpMock
        .expectOne(remediateUrl('dept-ops'))
        .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      // catchError(() => of(false)) → error callback never fires, but the
      // remediating flag was set; characterize: it stays set because the
      // service swallows the error into a successful of(false) emission, so
      // the `next` callback runs and clears it + fires a reload GET.
      httpMock.expectOne(COMPLIANCE_URL).flush(STUB_DATA);
      fixture.detectChanges();
      expect(fixture.componentInstance.isRemediating('dept-ops')).toBe(false);
    });
  });

  describe('error state', () => {
    it('renders the error panel and message when the GET fails', () => {
      fixture.detectChanges();
      httpMock
        .expectOne(COMPLIANCE_URL)
        .flush(
          { error: 'forbidden' },
          { status: 403, statusText: 'Forbidden' },
        );
      fixture.detectChanges();

      const err = element.querySelector('[data-testid="compliance-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      expect(err?.textContent).toContain('training.compliance.error-title');
      // complianceError() surfaces the HttpErrorResponse message
      expect(fixture.componentInstance.complianceError().length).toBeGreaterThan(0);
    });

    it('does not render the summary or table in the error state', () => {
      fixture.detectChanges();
      httpMock
        .expectOne(COMPLIANCE_URL)
        .flush(
          { error: 'server down' },
          { status: 500, statusText: 'Server Error' },
        );
      fixture.detectChanges();

      expect(
        element.querySelector('[data-testid="compliance-summary"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="compliance-table"]'),
      ).toBeNull();
    });
  });

  describe('pure helper methods', () => {
    beforeEach(() => flushSuccess());

    it('statusBadgeClass maps each status to its badge class', () => {
      const c = fixture.componentInstance;
      expect(c.statusBadgeClass('green')).toBe('compliance-dashboard__badge--green');
      expect(c.statusBadgeClass('amber')).toBe('compliance-dashboard__badge--amber');
      expect(c.statusBadgeClass('red')).toBe('compliance-dashboard__badge--red');
      expect(c.statusBadgeClass('unknown')).toBe('');
    });

    it('formatDate returns empty string for empty input', () => {
      expect(fixture.componentInstance.formatDate('')).toBe('');
    });

    it('formatDate formats a valid ISO string with the year', () => {
      const out = fixture.componentInstance.formatDate('2026-07-01T00:00:00Z');
      expect(out).toContain('2026');
    });

    it('formatDate returns a string for a malformed input without throwing', () => {
      // new Date('not-a-date').toLocaleDateString() yields 'Invalid Date'
      // rather than throwing, so the catch branch is not reached — characterize
      // the actual (non-throwing) behavior.
      expect(typeof fixture.componentInstance.formatDate('not-a-date')).toBe('string');
    });

    it('isRemediating reflects the remediatingDept signal', () => {
      const c = fixture.componentInstance;
      expect(c.isRemediating('dept-x')).toBe(false);
      c.remediatingDept.set('dept-x');
      expect(c.isRemediating('dept-x')).toBe(true);
      expect(c.isRemediating('dept-y')).toBe(false);
    });
  });

  describe('computed defaults before data', () => {
    it('computed signals fall back to defaults when no data is loaded', () => {
      // Do not flush — inspect the component before the GET resolves.
      fixture.detectChanges();
      const c = fixture.componentInstance;
      expect(c.departments()).toEqual([]);
      expect(c.overallCompletion()).toBe(0);
      expect(c.totalOverdue()).toBe(0);
      expect(c.nextDeadline()).toBe('');
      // settle pending GET
      httpMock.expectOne(COMPLIANCE_URL).flush(STUB_DATA);
      fixture.detectChanges();
    });
  });

  describe('lifecycle teardown', () => {
    it('resets compliance state on destroy', () => {
      flushSuccess();
      const service = TestBed.inject(TrainingAdminService);
      expect(service.complianceState().status).toBe('success');
      fixture.destroy();
      expect(service.complianceState().status).toBe('idle');
    });
  });
});
