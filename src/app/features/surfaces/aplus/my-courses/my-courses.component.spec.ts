/**
 * MyCoursesComponent spec — CHO-2321.
 *
 * The A+ "My Courses" Learn destination: a learner's ENROLLED courses,
 * each opening the existing /a/courses/:courseId/learn content view. The
 * list reuses the dashboard aggregator's `learnerCourses` (no new backend);
 * the component owns only the load trigger + loading/error/empty/list
 * states so a direct deep-link to /a/courses is never a blank spinner.
 *
 * Verifies:
 *   1. Triggers a dashboard load on init (deep-link safe)
 *   2. Renders the shared Courses sub-nav strip
 *   3. Loading / error(+retry) / honest-empty / list states
 *   4. Each course row opens /a/courses/:id/learn
 *   5. Newest enrolment first (source is created_at ASC)
 */
// NB: describe/it/beforeEach come from the GLOBAL Vitest API (globals:true),
// NOT an explicit `vitest` import — see course-curriculum.component.spec.ts.
import { expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal, type WritableSignal } from '@angular/core';

import { MyCoursesComponent } from './my-courses.component';
import { DashboardService } from '../dashboard/dashboard.service';
import type { DashboardState } from '../dashboard/dashboard.model';
import { TranslateService } from '../../../../core/services/translate.service';
import {
  buildDashboardSummary,
  buildLearnerCourseSummary,
} from '../../../../testing/builders/buildDashboardSummary';

// Mirrors dashboard.component.spec's MockDashboardService: a settable state
// signal + a `summary` selector + a load-call counter.
class MockDashboardService {
  readonly _state: WritableSignal<DashboardState> = signal<DashboardState>({
    status: 'loading',
  });
  readonly state = this._state.asReadonly();
  loadCalls = 0;
  setState(s: DashboardState): void {
    this._state.set(s);
  }
  load(): void {
    this.loadCalls += 1;
  }
}

function makeMock(): MockDashboardService {
  const mock = new MockDashboardService();
  Object.defineProperty(mock, 'summary', {
    value: () => {
      const s = mock._state();
      return s.status === 'success' ? s.summary : null;
    },
  });
  return mock;
}

function setup(mock: MockDashboardService): {
  fixture: ComponentFixture<MyCoursesComponent>;
  element: HTMLElement;
} {
  TestBed.configureTestingModule({
    imports: [MyCoursesComponent],
    providers: [
      provideRouter([]),
      TranslateService,
      { provide: DashboardService, useValue: mock },
    ],
  });
  const fixture = TestBed.createComponent(MyCoursesComponent);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('MyCoursesComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('triggers a dashboard load on init (deep-link safe)', () => {
    const mock = makeMock();
    const { fixture } = setup(mock);
    expect(mock.loadCalls).toBeGreaterThanOrEqual(1);
    fixture.destroy();
  });

  it('renders the shared Courses sub-nav strip', () => {
    const mock = makeMock();
    const { element, fixture } = setup(mock);
    expect(element.querySelector('[data-testid="courses-sub-nav"]')).not.toBeNull();
    // …with the My Courses tab present (self-referential nav entry).
    expect(
      element.querySelector('[data-testid="courses-sub-nav-my-courses"]'),
    ).not.toBeNull();
    fixture.destroy();
  });

  it('shows the loading state while the dashboard load is in flight', () => {
    const mock = makeMock(); // default state = loading
    const { element, fixture } = setup(mock);
    expect(element.querySelector('[data-testid="my-courses-loading"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="my-courses-list"]')).toBeNull();
    fixture.destroy();
  });

  it('shows a fail-loud error state whose retry re-loads', () => {
    const mock = makeMock();
    const { element, fixture } = setup(mock);
    mock.setState({ status: 'error', error: 'aplus.dashboard.error_generic' });
    fixture.detectChanges();

    const err = element.querySelector('[data-testid="my-courses-error"]');
    expect(err).not.toBeNull();
    expect(err?.getAttribute('role')).toBe('alert');

    const before = mock.loadCalls;
    element
      .querySelector<HTMLButtonElement>('[data-testid="my-courses-retry"]')!
      .click();
    expect(mock.loadCalls).toBe(before + 1);
    fixture.destroy();
  });

  it('shows an honest empty state (with a catalog link) when enrolled in nothing', () => {
    const mock = makeMock();
    const { element, fixture } = setup(mock);
    mock.setState({
      status: 'success',
      summary: buildDashboardSummary({ learnerCourses: [] }),
    });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="my-courses-empty"]')).not.toBeNull();
    // Never fabricates a list when there is nothing enrolled.
    expect(element.querySelector('[data-testid="my-courses-list"]')).toBeNull();
    const browse = element.querySelector('[data-testid="my-courses-browse"]');
    expect(browse?.getAttribute('href')).toContain('/a/catalog');
    fixture.destroy();
  });

  it('lists each enrolled course with an Open link to /a/courses/:id/learn', () => {
    const mock = makeMock();
    const { element, fixture } = setup(mock);
    mock.setState({
      status: 'success',
      summary: buildDashboardSummary({
        learnerCourses: [
          buildLearnerCourseSummary({
            courseId: 'c-1',
            title: 'SCRUM Introduction',
            progressPct: 45,
          }),
          buildLearnerCourseSummary({
            courseId: 'c-2',
            title: 'Data Ethics 101',
            progressPct: 12,
          }),
        ],
      }),
    });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="my-courses-list"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="my-courses-row-c-1"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="my-courses-row-c-2"]')).not.toBeNull();

    const open1 = element.querySelector('[data-testid="my-courses-open-c-1"]');
    expect(open1?.getAttribute('href')).toContain('/a/courses/c-1/learn');
    fixture.destroy();
  });

  it('surfaces the newest enrolment first (source arrives created_at ASC)', () => {
    const mock = makeMock();
    const { element, fixture } = setup(mock);
    mock.setState({
      status: 'success',
      summary: buildDashboardSummary({
        learnerCourses: [
          buildLearnerCourseSummary({ courseId: 'oldest', title: 'Oldest' }),
          buildLearnerCourseSummary({ courseId: 'newest', title: 'Newest' }),
        ],
      }),
    });
    fixture.detectChanges();

    const rows = Array.from(
      element.querySelectorAll('[data-testid^="my-courses-row-"]'),
    );
    expect(rows[0]?.getAttribute('data-testid')).toBe('my-courses-row-newest');
    fixture.destroy();
  });

  it('root element carries the surface-aplus class', () => {
    const mock = makeMock();
    const { element, fixture } = setup(mock);
    const root = element.querySelector('[data-testid="aplus-my-courses"]');
    expect(root?.className).toContain('surface-aplus');
    fixture.destroy();
  });
});
