import { expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { StudyPlanService, StudyPlan, StudyPlanWeek } from './study-plan.service';
import { environment } from '../../../../environments/environment';

// ---------------------------------------------------------------------------
// Test data builders — match backend Go snake_case JSON exactly
// ---------------------------------------------------------------------------

function buildWeek(overrides: Partial<StudyPlanWeek> = {}): StudyPlanWeek {
  return {
    week_number: 1,
    start_date: '2026-06-01',
    end_date: '2026-06-07',
    daily_atom_target: 5,
    topics: [
      {
        topic_id: 'topic-1',
        topic_name: 'Algebra',
        atom_count: 10,
        completed_count: 4,
        priority: 'high',
      },
    ],
    is_current: false,
    completed_atoms: 4,
    total_atoms: 10,
    ...overrides,
  };
}

function buildPlan(overrides: Partial<StudyPlan> = {}): StudyPlan {
  return {
    id: 'plan-001',
    exam_id: 'exam-001',
    exam_title: 'Calculus Final',
    exam_date: '2026-07-01',
    pace: 'standard',
    weeks: [
      buildWeek({ week_number: 1, is_current: false }),
      buildWeek({ week_number: 2, is_current: true }),
    ],
    overall_progress_pct: 42,
    days_remaining: 27,
    daily_atom_target: 5,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-15T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StudyPlanService', () => {
  let service: StudyPlanService;
  let httpMock: HttpTestingController;
  const base = `${environment.bffBaseUrl}/api/v1/engagement/study-plans`;
  const loadUrl = `${base}/exam-001`;
  const paceUrl = `${base}/exam-001/pace`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        StudyPlanService,
      ],
    });
    service = TestBed.inject(StudyPlanService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // Initial state — computed falsy/nullish arms (plan is null)
  // -------------------------------------------------------------------------

  it('starts with idle plan + pace-update state', () => {
    expect(service.planState().status).toBe('idle');
    expect(service.paceUpdateState().status).toBe('idle');
  });

  it('currentPlan is null when state is not success (ternary false arm)', () => {
    expect(service.currentPlan()).toBeNull();
  });

  it('currentWeek is null when plan is null (optional-chain null arm)', () => {
    expect(service.currentWeek()).toBeNull();
  });

  it('daysRemaining falls back to 0 when plan is null (?? fallback arm)', () => {
    expect(service.daysRemaining()).toBe(0);
  });

  it('overallProgress falls back to 0 when plan is null (?? fallback arm)', () => {
    expect(service.overallProgress()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // loadPlan — success (tap) path + computed present arms
  // -------------------------------------------------------------------------

  it('sets loading state when loadPlan is called', () => {
    service.loadPlan('exam-001').subscribe();
    expect(service.planState().status).toBe('loading');
    httpMock.expectOne(loadUrl).flush(buildPlan());
  });

  it('issues a GET to the encoded study-plan path', () => {
    service.loadPlan('exam-001').subscribe();
    const req = httpMock.expectOne(loadUrl);
    expect(req.request.method).toBe('GET');
    req.flush(buildPlan());
  });

  it('percent-encodes the exam id in the load path', () => {
    service.loadPlan('exam 01/x').subscribe();
    const req = httpMock.expectOne(`${base}/exam%2001%2Fx`);
    expect(req.request.method).toBe('GET');
    req.flush(buildPlan());
  });

  it('stores the plan and drives computed getters on success (ternary/optional present arms)', () => {
    let emitted: StudyPlan | null = null;
    service.loadPlan('exam-001').subscribe((p) => (emitted = p));
    httpMock.expectOne(loadUrl).flush(buildPlan());

    expect(service.planState().status).toBe('success');
    expect(emitted).not.toBeNull();
    expect(service.currentPlan()?.id).toBe('plan-001');
    // currentWeek: find predicate hits the is_current === true element
    expect(service.currentWeek()?.week_number).toBe(2);
    expect(service.daysRemaining()).toBe(27);
    expect(service.overallProgress()).toBe(42);
  });

  it('currentWeek is null when no week is current (find returns undefined → ?? null)', () => {
    service.loadPlan('exam-001').subscribe();
    httpMock.expectOne(loadUrl).flush(
      buildPlan({
        weeks: [
          buildWeek({ week_number: 1, is_current: false }),
          buildWeek({ week_number: 2, is_current: false }),
        ],
      }),
    );

    expect(service.currentPlan()).not.toBeNull();
    expect(service.currentWeek()).toBeNull();
  });

  it('currentWeek handles an empty weeks array (non-matching empty loop)', () => {
    service.loadPlan('exam-001').subscribe();
    httpMock.expectOne(loadUrl).flush(buildPlan({ weeks: [] }));

    expect(service.currentWeek()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // loadPlan — error (catchError) path
  // -------------------------------------------------------------------------

  it('sets error state and emits null on load failure (catchError arm)', () => {
    let emitted: StudyPlan | null | undefined;
    service.loadPlan('exam-001').subscribe((p) => (emitted = p));
    httpMock.expectOne(loadUrl).error(new ProgressEvent('error'));

    expect(emitted).toBeNull();
    const state = service.planState();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error.code).toBe('STUDY_PLAN_LOAD_FAILED');
    }
    // computed falls back through the null/fallback arms after an error
    expect(service.currentPlan()).toBeNull();
    expect(service.currentWeek()).toBeNull();
    expect(service.daysRemaining()).toBe(0);
    expect(service.overallProgress()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // updatePace — success (tap) path
  // -------------------------------------------------------------------------

  it('sets submitting state when updatePace is called', () => {
    service.updatePace('exam-001', 'intensive').subscribe();
    expect(service.paceUpdateState().status).toBe('submitting');
    httpMock.expectOne(paceUrl).flush(buildPlan({ pace: 'intensive' }));
  });

  it('PUTs the pace body and updates both states on success (tap arm)', () => {
    let emitted: StudyPlan | null = null;
    service
      .updatePace('exam-001', 'light')
      .subscribe((p) => (emitted = p));

    const req = httpMock.expectOne(paceUrl);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ pace: 'light' });
    req.flush(buildPlan({ pace: 'light' }));

    expect(emitted).not.toBeNull();
    expect(service.paceUpdateState().status).toBe('success');
    expect(service.planState().status).toBe('success');
    expect(service.currentPlan()?.pace).toBe('light');
  });

  it('percent-encodes the exam id in the pace path', () => {
    service.updatePace('exam 01/x', 'standard').subscribe();
    const req = httpMock.expectOne(`${base}/exam%2001%2Fx/pace`);
    expect(req.request.method).toBe('PUT');
    req.flush(buildPlan());
  });

  // -------------------------------------------------------------------------
  // updatePace — error (catchError) path
  // -------------------------------------------------------------------------

  it('sets error state and emits null on pace-update failure (catchError arm)', () => {
    let emitted: StudyPlan | null | undefined;
    service
      .updatePace('exam-001', 'intensive')
      .subscribe((p) => (emitted = p));
    httpMock.expectOne(paceUrl).error(new ProgressEvent('error'));

    expect(emitted).toBeNull();
    const paceState = service.paceUpdateState();
    expect(paceState.status).toBe('error');
    if (paceState.status === 'error') {
      expect(paceState.error.code).toBe('PACE_UPDATE_FAILED');
    }
    // planState untouched (still idle) — the success tap never ran
    expect(service.planState().status).toBe('idle');
  });

  // -------------------------------------------------------------------------
  // resetState
  // -------------------------------------------------------------------------

  it('resetState returns both states to idle and clears computed', () => {
    service.loadPlan('exam-001').subscribe();
    httpMock.expectOne(loadUrl).flush(buildPlan());
    expect(service.planState().status).toBe('success');

    service.resetState();

    expect(service.planState().status).toBe('idle');
    expect(service.paceUpdateState().status).toBe('idle');
    expect(service.currentPlan()).toBeNull();
    expect(service.currentWeek()).toBeNull();
    expect(service.daysRemaining()).toBe(0);
    expect(service.overallProgress()).toBe(0);
  });
});
