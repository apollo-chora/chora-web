import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ProgressReportComponent } from './progress-report.component';
import type { ParentDashboard } from '../../models/parent.model';

describe('ProgressReportComponent', () => {
  let component: ProgressReportComponent;
  let fixture: ComponentFixture<ProgressReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProgressReportComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ProgressReportComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('learnerId', 'learner-1');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="progress-report"]');
    expect(el).toBeTruthy();
  });

  it('should have progress title', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="progress-title"]');
    expect(el).toBeTruthy();
  });

  it('should format date correctly', () => {
    const result = component.formatDate('2026-03-15T10:00:00Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('');
  });

  it('should return empty string for null date', () => {
    expect(component.formatDate(null)).toBe('');
  });

  it('should format datetime correctly', () => {
    const result = component.formatDateTime('2026-03-15T10:00:00Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('');
  });

  it('should return empty string for null datetime', () => {
    expect(component.formatDateTime(null)).toBe('');
  });

  it('should format score correctly', () => {
    expect(component.formatScore(85.5)).toBe('85.5%');
    expect(component.formatScore(100)).toBe('100.0%');
  });

  it('should compute streakPercentage as 0 when dashboard is null', () => {
    expect(component.streakPercentage()).toBe(0);
  });

  it('should compute scoreColor as empty when dashboard is null', () => {
    expect(component.scoreColor()).toBe('');
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
// Branch-coverage augmentation
//
// These tests drive the component's signal-backed state through the real
// ParentService + a flushed HTTP layer so the conditional arms inside
// isConsentDenied / streakPercentage / scoreColor are exercised.
// ngOnInit issues GET https://api.chora.site/api/v1/parent/dashboard/{id}.
// ---------------------------------------------------------------------------

const BASE = 'https://api.chora.site';
const DASHBOARD_URL = (learnerId: string) =>
  `${BASE}/api/v1/parent/dashboard/${encodeURIComponent(learnerId)}`;

function makeDashboard(overrides: Partial<ParentDashboard> = {}): ParentDashboard {
  return {
    learner_gcid: 'learner-1',
    guardian_gcid: 'guardian-1',
    learner_display_name: 'Ada Lovelace',
    total_atoms_completed: 42,
    current_streak_days: 5,
    longest_streak_days: 10,
    total_xp: 1234,
    average_score_pct: 88,
    active_paths_count: 3,
    completed_paths_count: 1,
    last_activity_at: '2026-06-01T08:00:00.000Z',
    generated_at: '2026-06-04T12:00:00.000Z',
    ...overrides,
  };
}

describe('ProgressReportComponent — conditional branches', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProgressReportComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  function create(learnerId: string): ComponentFixture<ProgressReportComponent> {
    const fix = TestBed.createComponent(ProgressReportComponent);
    fix.componentRef.setInput('learnerId', learnerId);
    fix.detectChanges(); // ngOnInit -> loadDashboard()
    return fix;
  }

  // --- isConsentDenied ------------------------------------------------------

  it('isConsentDenied is false for a success state (status !== error arm)', () => {
    const fix = create('learner-1');
    httpMock.expectOne(DASHBOARD_URL('learner-1')).flush(makeDashboard());
    expect(fix.componentInstance.isConsentDenied()).toBe(false);
    const el = fix.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="progress-error"]')).toBeNull();
  });

  it('isConsentDenied is true when the load fails (DASHBOARD_LOAD_FAILED arm)', () => {
    const fix = create('learner-1');
    httpMock
      .expectOne(DASHBOARD_URL('learner-1'))
      .flush('forbidden', { status: 403, statusText: 'Forbidden' });
    fix.detectChanges();
    expect(fix.componentInstance.isConsentDenied()).toBe(true);
    const el = fix.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="progress-error"]')).toBeTruthy();
    expect(el.textContent).toContain('parent.consent_required');
  });

  it('isConsentDenied is false when error code differs (code !== arm)', () => {
    const fix = create('learner-1');
    httpMock
      .expectOne(DASHBOARD_URL('learner-1'))
      .flush('boom', { status: 500, statusText: 'Server Error' });
    fix.detectChanges();
    // loadDashboard always maps to DASHBOARD_LOAD_FAILED; patch the underlying
    // state signal to reach the non-matching-code arm of the code comparison.
    const svc = fix.componentInstance['parentService'];
    (
      svc as unknown as {
        _dashboardState: { set: (v: unknown) => void };
      }
    )._dashboardState.set({
      status: 'error',
      error: { code: 'SOME_OTHER_CODE', message: 'nope' },
    });
    fix.detectChanges();
    expect(fix.componentInstance.isConsentDenied()).toBe(false);
    const el = fix.nativeElement as HTMLElement;
    expect(el.textContent).toContain('parent.progress_load_error');
  });

  // --- streakPercentage -----------------------------------------------------

  it('streakPercentage is 0 when longest_streak_days is 0', () => {
    const fix = create('learner-1');
    httpMock
      .expectOne(DASHBOARD_URL('learner-1'))
      .flush(makeDashboard({ current_streak_days: 4, longest_streak_days: 0 }));
    expect(fix.componentInstance.streakPercentage()).toBe(0);
  });

  it('streakPercentage computes the rounded ratio when data present', () => {
    const fix = create('learner-1');
    httpMock
      .expectOne(DASHBOARD_URL('learner-1'))
      .flush(makeDashboard({ current_streak_days: 5, longest_streak_days: 10 }));
    expect(fix.componentInstance.streakPercentage()).toBe(50);
  });

  // --- scoreColor -----------------------------------------------------------

  it('scoreColor is high when average_score_pct >= 80', () => {
    const fix = create('learner-1');
    httpMock.expectOne(DASHBOARD_URL('learner-1')).flush(makeDashboard({ average_score_pct: 80 }));
    expect(fix.componentInstance.scoreColor()).toBe('progress-report__score--high');
  });

  it('scoreColor is medium when 60 <= average_score_pct < 80', () => {
    const fix = create('learner-1');
    httpMock.expectOne(DASHBOARD_URL('learner-1')).flush(makeDashboard({ average_score_pct: 60 }));
    expect(fix.componentInstance.scoreColor()).toBe('progress-report__score--medium');
  });

  it('scoreColor is low when average_score_pct < 60', () => {
    const fix = create('learner-1');
    httpMock
      .expectOne(DASHBOARD_URL('learner-1'))
      .flush(makeDashboard({ average_score_pct: 59.9 }));
    expect(fix.componentInstance.scoreColor()).toBe('progress-report__score--low');
  });

  // --- template optional-field arms ----------------------------------------

  it('renders learner name + last activity when present, omits them when absent', () => {
    const present = create('learner-1');
    httpMock.expectOne(DASHBOARD_URL('learner-1')).flush(
      makeDashboard({
        learner_display_name: 'Grace Hopper',
        last_activity_at: '2026-06-01T08:00:00.000Z',
      }),
    );
    present.detectChanges();
    const elP = present.nativeElement as HTMLElement;
    expect(elP.querySelector('[data-testid="learner-name"]')?.textContent).toContain(
      'Grace Hopper',
    );
    expect(elP.querySelector('[data-testid="last-activity"]')).toBeTruthy();
    expect(elP.querySelector('[data-testid="stats-grid"]')).toBeTruthy();

    const absent = create('learner-2');
    httpMock.expectOne(DASHBOARD_URL('learner-2')).flush(
      makeDashboard({
        learner_display_name: undefined,
        last_activity_at: null,
      }),
    );
    absent.detectChanges();
    const elA = absent.nativeElement as HTMLElement;
    expect(elA.querySelector('[data-testid="learner-name"]')).toBeNull();
    expect(elA.querySelector('[data-testid="last-activity"]')).toBeNull();
    expect(elA.querySelector('[data-testid="learner-info"]')).toBeTruthy();
  });

  it('encodes the learnerId in the dashboard request URL', () => {
    const fix = create('a b/c');
    const req = httpMock.expectOne(DASHBOARD_URL('a b/c'));
    expect(req.request.method).toBe('GET');
    expect(req.request.url).toContain(encodeURIComponent('a b/c'));
    req.flush(makeDashboard());
    expect(fix.componentInstance).toBeTruthy();
  });

  it('unsubscribes on destroy without error', () => {
    const fix = create('learner-1');
    httpMock.expectOne(DASHBOARD_URL('learner-1')).flush(makeDashboard());
    expect(() => fix.destroy()).not.toThrow();
  });
});
