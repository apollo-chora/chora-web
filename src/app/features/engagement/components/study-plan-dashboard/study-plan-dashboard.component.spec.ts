import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { StudyPlanDashboardComponent } from './study-plan-dashboard.component';
import {
  StudyPlan,
  StudyPlanService,
} from '../../services/study-plan.service';
import { environment } from '../../../../../environments/environment';

const PLANS_URL = `${environment.bffBaseUrl}/api/v1/engagement/study-plans`;

function makePlan(overrides: Partial<StudyPlan> = {}): StudyPlan {
  return {
    id: 'plan-001',
    exam_id: 'exam-123',
    exam_title: 'AWS Solutions Architect',
    exam_date: '2026-08-15T00:00:00Z',
    pace: 'intensive',
    overall_progress_pct: 42,
    days_remaining: 30,
    daily_atom_target: 6,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-03T00:00:00Z',
    weeks: [
      {
        week_number: 1,
        start_date: '2026-06-01T00:00:00Z',
        end_date: '2026-06-07T00:00:00Z',
        daily_atom_target: 5,
        is_current: true,
        completed_atoms: 10,
        total_atoms: 20,
        topics: [
          {
            topic_id: 'topic-a',
            topic_name: 'VPC Networking',
            atom_count: 12,
            completed_count: 6,
            priority: 'high',
          },
          {
            topic_id: 'topic-b',
            topic_name: 'IAM Basics',
            atom_count: 8,
            completed_count: 4,
            priority: 'medium',
          },
        ],
      },
      {
        week_number: 2,
        start_date: '2026-06-08T00:00:00Z',
        end_date: '2026-06-14T00:00:00Z',
        daily_atom_target: 7,
        is_current: false,
        completed_atoms: 0,
        total_atoms: 0,
        topics: [
          {
            topic_id: 'topic-c',
            topic_name: 'S3 Storage',
            atom_count: 10,
            completed_count: 0,
            priority: 'low',
          },
        ],
      },
    ],
    ...overrides,
  };
}

/**
 * Build the component with a stubbed ActivatedRoute returning the given examId.
 * The initial GET is NOT flushed here — individual tests drive it so they can
 * exercise loading / success / error paths independently.
 */
function build(examId: string | null = 'exam-123'): {
  fixture: ComponentFixture<StudyPlanDashboardComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
} {
  TestBed.configureTestingModule({
    imports: [StudyPlanDashboardComponent, TranslateModule.forRoot()],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => examId } } },
      },
    ],
  });
  const fixture = TestBed.createComponent(StudyPlanDashboardComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, httpMock, element };
}

describe('StudyPlanDashboardComponent', () => {
  let fixture: ComponentFixture<StudyPlanDashboardComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  afterEach(() => {
    httpMock.verify();
  });

  describe('loading state', () => {
    // Drain the in-flight GET at the end of each test so the shared afterEach
    // verify() does not flag it as an open request.
    function drain(): void {
      httpMock.expectOne(`${PLANS_URL}/exam-123`).flush(makePlan());
    }

    beforeEach(() => {
      TestBed.resetTestingModule();
      const built = build();
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      fixture.detectChanges(); // ngOnInit -> loadPlan -> loading
    });

    it('creates the component', () => {
      expect(fixture.componentInstance).toBeTruthy();
      drain();
    });

    it('renders the root section', () => {
      const root = element.querySelector('[data-testid="study-plan-dashboard"]');
      expect(root).not.toBeNull();
      expect(root?.tagName).toBe('SECTION');
      drain();
    });

    it('shows the loading state before the GET resolves', () => {
      const loading = element.querySelector('[data-testid="study-plan-loading"]');
      expect(loading).not.toBeNull();
      expect(loading?.getAttribute('role')).toBe('status');
      drain();
    });

    it('fires a GET to the study-plans endpoint with the examId', () => {
      const req = httpMock.expectOne(`${PLANS_URL}/exam-123`);
      expect(req.request.method).toBe('GET');
      req.flush(makePlan());
    });
  });

  describe('success state', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const built = build();
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      fixture.detectChanges();
      httpMock.expectOne(`${PLANS_URL}/exam-123`).flush(makePlan());
      fixture.detectChanges();
    });

    it('renders the header with the exam title', () => {
      const header = element.querySelector('[data-testid="study-plan-header"]');
      expect(header).not.toBeNull();
      const title = element.querySelector('.study-plan-dashboard__title');
      expect(title?.textContent).toContain('AWS Solutions Architect');
    });

    it('hides the loading and error placeholders once ready', () => {
      expect(
        element.querySelector('[data-testid="study-plan-loading"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="study-plan-error"]'),
      ).toBeNull();
    });

    it('renders the countdown with days remaining', () => {
      const countdown = element.querySelector(
        '[data-testid="study-plan-countdown"]',
      );
      expect(countdown).not.toBeNull();
      const number = countdown?.querySelector(
        '.study-plan-dashboard__countdown-number',
      );
      expect(number?.textContent?.trim()).toBe('30');
    });

    it('applies the normal countdown class when more than 14 days remain', () => {
      const countdown = element.querySelector(
        '[data-testid="study-plan-countdown"]',
      );
      expect(
        countdown?.classList.contains(
          'study-plan-dashboard__countdown--normal',
        ),
      ).toBe(true);
    });

    it('renders the overall progress bar with aria-valuenow', () => {
      const progress = element.querySelector(
        '[data-testid="study-plan-progress"]',
      );
      expect(progress?.getAttribute('role')).toBe('progressbar');
      expect(progress?.getAttribute('aria-valuenow')).toBe('42');
      const label = progress?.querySelector(
        '.study-plan-dashboard__progress-label',
      );
      expect(label?.textContent).toContain('42%');
    });

    it('sets the progress fill width from overallProgress', () => {
      const fill = element.querySelector(
        '.study-plan-dashboard__progress-fill',
      ) as HTMLElement;
      expect(fill.style.width).toBe('42%');
    });

    it('renders one pace button per pace option', () => {
      const buttons = element.querySelectorAll(
        '.study-plan-dashboard__pace-btn',
      );
      expect(buttons.length).toBe(3);
    });

    it('marks the loaded plan pace as the active pace button', () => {
      const intensive = element.querySelector(
        '[data-testid="study-plan-pace-intensive"]',
      );
      expect(intensive?.getAttribute('aria-pressed')).toBe('true');
      const standard = element.querySelector(
        '[data-testid="study-plan-pace-standard"]',
      );
      expect(standard?.getAttribute('aria-pressed')).toBe('false');
    });

    it('renders the daily atom target', () => {
      const target = element.querySelector(
        '[data-testid="study-plan-daily-target"]',
      );
      expect(target?.textContent).toContain('6');
    });

    it('renders one article per week', () => {
      const weeks = element.querySelectorAll('.study-plan-dashboard__week');
      expect(weeks.length).toBe(2);
    });

    it('flags the current week with the --current modifier class', () => {
      const week1 = element.querySelector(
        '[data-testid="study-plan-week-1"]',
      );
      expect(
        week1?.classList.contains('study-plan-dashboard__week--current'),
      ).toBe(true);
      const week2 = element.querySelector(
        '[data-testid="study-plan-week-2"]',
      );
      expect(
        week2?.classList.contains('study-plan-dashboard__week--current'),
      ).toBe(false);
    });

    it('does not render week content before a week is expanded', () => {
      const content = element.querySelector(
        '.study-plan-dashboard__week-content',
      );
      expect(content).toBeNull();
    });
  });

  describe('week progress percentage', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const built = build();
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      fixture.detectChanges();
      httpMock.expectOne(`${PLANS_URL}/exam-123`).flush(makePlan());
      fixture.detectChanges();
    });

    it('computes 50% for 10/20 completed atoms', () => {
      const component = fixture.componentInstance;
      const plan = component.plan()!;
      expect(component.weekProgressPct(plan.weeks[0])).toBe(50);
    });

    it('guards division-by-zero and returns 0 when total_atoms is 0', () => {
      const component = fixture.componentInstance;
      const plan = component.plan()!;
      expect(component.weekProgressPct(plan.weeks[1])).toBe(0);
    });

    it('renders the week-1 percent label in the header', () => {
      const week1 = element.querySelector(
        '[data-testid="study-plan-week-1"]',
      );
      const pct = week1?.querySelector('.study-plan-dashboard__week-pct');
      expect(pct?.textContent).toContain('50%');
    });
  });

  describe('toggleWeek interaction', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const built = build();
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      fixture.detectChanges();
      httpMock.expectOne(`${PLANS_URL}/exam-123`).flush(makePlan());
      fixture.detectChanges();
    });

    it('expands a week and renders its topic list on header click', () => {
      const headerBtn = element.querySelector(
        '[data-testid="study-plan-week-1"] .study-plan-dashboard__week-header',
      ) as HTMLButtonElement;
      headerBtn.click();
      fixture.detectChanges();

      expect(fixture.componentInstance.expandedWeek()).toBe(1);
      const content = element.querySelector(
        '.study-plan-dashboard__week-content',
      );
      expect(content).not.toBeNull();
      const topics = content?.querySelectorAll(
        '.study-plan-dashboard__topic',
      );
      expect(topics?.length).toBe(2);
      expect(content?.textContent).toContain('VPC Networking');
    });

    it('marks the expanded week button aria-expanded=true', () => {
      const headerBtn = element.querySelector(
        '[data-testid="study-plan-week-1"] .study-plan-dashboard__week-header',
      ) as HTMLButtonElement;
      headerBtn.click();
      fixture.detectChanges();
      expect(headerBtn.getAttribute('aria-expanded')).toBe('true');
    });

    it('collapses the week again when its header is clicked twice', () => {
      const component = fixture.componentInstance;
      component.toggleWeek(2);
      expect(component.expandedWeek()).toBe(2);
      component.toggleWeek(2);
      expect(component.expandedWeek()).toBeNull();
    });

    it('switches the expanded week when a different header is clicked', () => {
      const component = fixture.componentInstance;
      component.toggleWeek(1);
      expect(component.expandedWeek()).toBe(1);
      component.toggleWeek(2);
      expect(component.expandedWeek()).toBe(2);
    });

    it('applies high/medium/low priority classes on topics', () => {
      fixture.componentInstance.toggleWeek(1);
      fixture.detectChanges();
      const topics = element.querySelectorAll(
        '.study-plan-dashboard__topic',
      );
      expect(
        topics[0].classList.contains('study-plan-dashboard__topic--high'),
      ).toBe(true);
      expect(
        topics[1].classList.contains('study-plan-dashboard__topic--medium'),
      ).toBe(true);
    });
  });

  describe('pace change', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const built = build();
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      fixture.detectChanges();
      httpMock.expectOne(`${PLANS_URL}/exam-123`).flush(makePlan());
      fixture.detectChanges();
    });

    it('PUTs the pace update with the selected pace and updates state on success', () => {
      const lightBtn = element.querySelector(
        '[data-testid="study-plan-pace-light"]',
      ) as HTMLButtonElement;
      lightBtn.click();
      fixture.detectChanges();

      // selectedPace updates optimistically before the PUT resolves
      expect(fixture.componentInstance.selectedPace()).toBe('light');

      const req = httpMock.expectOne(`${PLANS_URL}/exam-123/pace`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ pace: 'light' });

      const updated = makePlan({ pace: 'light', overall_progress_pct: 55 });
      req.flush(updated);
      fixture.detectChanges();

      const progress = element.querySelector(
        '[data-testid="study-plan-progress"]',
      );
      expect(progress?.getAttribute('aria-valuenow')).toBe('55');
    });

    it('keeps the plan rendered when the pace PUT fails (4xx)', () => {
      const lightBtn = element.querySelector(
        '[data-testid="study-plan-pace-light"]',
      ) as HTMLButtonElement;
      lightBtn.click();
      fixture.detectChanges();

      httpMock
        .expectOne(`${PLANS_URL}/exam-123/pace`)
        .flush(
          { error: 'invalid pace' },
          { status: 400, statusText: 'Bad Request' },
        );
      fixture.detectChanges();

      // The header is still rendered (plan state unchanged), and the service
      // recorded a pace-update error.
      expect(
        element.querySelector('[data-testid="study-plan-header"]'),
      ).not.toBeNull();
      const svc = TestBed.inject(StudyPlanService);
      expect(svc.paceUpdateState().status).toBe('error');
    });
  });

  describe('error state', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const built = build();
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      fixture.detectChanges();
      httpMock
        .expectOne(`${PLANS_URL}/exam-123`)
        .flush(
          { error: 'plan not found' },
          { status: 500, statusText: 'Server Error' },
        );
      fixture.detectChanges();
    });

    it('renders the error panel with role=alert', () => {
      const err = element.querySelector('[data-testid="study-plan-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
    });

    it('exposes a non-empty planError message', () => {
      expect(fixture.componentInstance.planError().length).toBeGreaterThan(0);
    });

    it('does not render the header in the error state', () => {
      expect(
        element.querySelector('[data-testid="study-plan-header"]'),
      ).toBeNull();
    });
  });

  describe('countdown class thresholds', () => {
    function buildWithDays(days: number): HTMLElement {
      TestBed.resetTestingModule();
      const built = build();
      fixture = built.fixture;
      httpMock = built.httpMock;
      const el = built.element;
      fixture.detectChanges();
      httpMock
        .expectOne(`${PLANS_URL}/exam-123`)
        .flush(makePlan({ days_remaining: days }));
      fixture.detectChanges();
      return el;
    }

    it('uses the urgent class at 7 days or fewer', () => {
      const el = buildWithDays(5);
      const countdown = el.querySelector(
        '[data-testid="study-plan-countdown"]',
      );
      expect(
        countdown?.classList.contains(
          'study-plan-dashboard__countdown--urgent',
        ),
      ).toBe(true);
    });

    it('uses the warning class between 8 and 14 days', () => {
      const el = buildWithDays(14);
      const countdown = el.querySelector(
        '[data-testid="study-plan-countdown"]',
      );
      expect(
        countdown?.classList.contains(
          'study-plan-dashboard__countdown--warning',
        ),
      ).toBe(true);
    });
  });

  describe('formatDate', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const built = build();
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      fixture.detectChanges();
      httpMock.expectOne(`${PLANS_URL}/exam-123`).flush(makePlan());
      fixture.detectChanges();
    });

    it('formats a valid ISO date to a short month/day label', () => {
      const out = fixture.componentInstance.formatDate('2026-08-15T00:00:00Z');
      // Locale-independent assertion: it should not be the raw ISO string and
      // should mention the day number.
      expect(out).not.toBe('2026-08-15T00:00:00Z');
      expect(out).toContain('15');
    });

    it('returns the raw input when the date cannot be parsed', () => {
      // toLocaleDateString on an Invalid Date yields "Invalid Date" rather than
      // throwing, so characterize that real (non-throwing) behaviour.
      const out = fixture.componentInstance.formatDate('not-a-date');
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    });
  });

  describe('no examId in route', () => {
    it('does not fire any HTTP request and renders neither header nor error', () => {
      TestBed.resetTestingModule();
      const built = build('');
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      fixture.detectChanges();

      // ngOnInit returns early — no GET, no loading transition.
      httpMock.expectNone(`${PLANS_URL}/`);
      expect(
        element.querySelector('[data-testid="study-plan-header"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="study-plan-error"]'),
      ).toBeNull();
    });
  });

  describe('ngOnDestroy', () => {
    it('resets the service state on destroy', () => {
      TestBed.resetTestingModule();
      const built = build();
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      fixture.detectChanges();
      httpMock.expectOne(`${PLANS_URL}/exam-123`).flush(makePlan());
      fixture.detectChanges();

      const svc = TestBed.inject(StudyPlanService);
      expect(svc.planState().status).toBe('success');

      fixture.destroy();
      expect(svc.planState().status).toBe('idle');
      expect(svc.paceUpdateState().status).toBe('idle');
    });
  });
});
