import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { formatDate } from '@angular/common';
import { WritableSignal, computed, signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';

import { MeAssessmentComponent } from './me-assessment.component';
import { MeAssessmentsService } from '../me-assessments.service';
import type {
  AutosaveState,
  LearnerAssessmentDetail,
  MeAssessmentDetailLoadState,
  StartSubmissionState,
  Submission,
  SubmissionLoadState,
  SubmissionStartedResponse,
  SubmitFinalState,
} from '../me-assessments.model';

/** MeAssessmentComponent spec — Phase X.3.2 (cover + canvas). */

const ASSESSMENT_ID = '01985e7f-1234-7abc-8def-000000000a01';
const SUBMISSION_ID = '01985e7f-1234-7abc-8def-000000000601';

function buildDetail(
  overrides: Partial<LearnerAssessmentDetail> = {},
): LearnerAssessmentDetail {
  return {
    assessment_id: ASSESSMENT_ID,
    title: 'Agile Estimation — Cohort May 2026',
    state: 'OPEN',
    scheduled_open_at: '2026-05-20T09:00:00Z',
    scheduled_close_at: '2026-05-20T11:00:00Z',
    max_attempts: 1,
    learner_attempt_count: 0,
    learner_remaining_attempts: 1,
    question_count: 2,
    total_points: 20,
    time_limit_seconds: 7200,
    questions: [
      {
        test_set_question_id: 'tsq-1',
        question_id: 'q-1',
        question_type: 'mcq',
        prompt: 'Which technique is non-numerical?',
        points_possible: 10,
        display_order: 1,
        required: true,
        mcq: {
          options: [
            { option_id: 'opt-a', label: 'A', text: 'Story points' },
            { option_id: 'opt-b', label: 'B', text: 'T-shirt sizing' },
          ],
          scoring_mode: 'single_correct',
        },
      },
      {
        test_set_question_id: 'tsq-2',
        question_id: 'q-2',
        question_type: 'oe',
        prompt: 'Explain when to use planning poker.',
        points_possible: 10,
        display_order: 2,
        required: false,
        oe: { min_response_chars: 50, max_response_chars: 1000 },
      },
    ],
    ...overrides,
  };
}

function buildSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    submission_id: SUBMISSION_ID,
    assessment_id: ASSESSMENT_ID,
    tenant_id: '11111111-1111-7111-8111-111111111111',
    learner_gcid: '00000000-0000-7000-8000-000000001999',
    attempt_number: 1,
    state: 'IN_PROGRESS',
    started_at: '2026-05-20T09:05:00Z',
    answers: [],
    last_saved_at: null,
    ...overrides,
  };
}

function buildStarted(): SubmissionStartedResponse {
  return {
    submission_id: SUBMISSION_ID,
    attempt_number: 1,
    opens_at: '2026-05-20T09:00:00Z',
    closes_at: '2026-05-20T11:00:00Z',
    time_limit_seconds: 7200,
    idempotent_replay: false,
  };
}

class StubMeAssessmentsService {
  readonly _detailState: WritableSignal<MeAssessmentDetailLoadState> = signal({
    status: 'loading',
  });
  readonly _startState: WritableSignal<StartSubmissionState> = signal({
    status: 'idle',
  });
  readonly _submissionState: WritableSignal<SubmissionLoadState> = signal({
    status: 'idle',
  });
  readonly _autosaveState: WritableSignal<AutosaveState> = signal({
    status: 'idle',
  });
  readonly _submitFinalState: WritableSignal<SubmitFinalState> = signal({
    status: 'idle',
  });

  readonly detailState = this._detailState.asReadonly();
  readonly startState = this._startState.asReadonly();
  readonly submissionState = this._submissionState.asReadonly();
  readonly autosaveState = this._autosaveState.asReadonly();
  readonly submitFinalState = this._submitFinalState.asReadonly();

  readonly detail = computed<LearnerAssessmentDetail | null>(() => {
    const s = this._detailState();
    return s.status === 'success' ? s.detail : null;
  });
  readonly started = computed<SubmissionStartedResponse | null>(() => {
    const s = this._startState();
    return s.status === 'started' ? s.started : null;
  });
  readonly submission = computed<Submission | null>(() => {
    const s = this._submissionState();
    return s.status === 'success' ? s.submission : null;
  });

  loadCalls: string[] = [];
  startCalls: string[] = [];
  loadSubmissionCalls: { aid: string; sid: string }[] = [];
  autosaveCalls: { aid: string; sid: string; body: unknown }[] = [];
  submitFinalCalls: { aid: string; sid: string }[] = [];

  loadAssessment(id: string): void { this.loadCalls.push(id); }
  startSubmission(id: string): void { this.startCalls.push(id); }
  loadSubmission(aid: string, sid: string): void {
    this.loadSubmissionCalls.push({ aid, sid });
  }
  autosave(aid: string, sid: string, body: unknown): void {
    this.autosaveCalls.push({ aid, sid, body });
  }
  submitFinal(aid: string, sid: string): void {
    this.submitFinalCalls.push({ aid, sid });
  }
  resetAutosaveIdle(): void { /* no-op */ }
}

function setup(): {
  fixture: ComponentFixture<MeAssessmentComponent>;
  component: MeAssessmentComponent;
  element: HTMLElement;
  service: StubMeAssessmentsService;
} {
  const service = new StubMeAssessmentsService();
  TestBed.configureTestingModule({
    imports: [MeAssessmentComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: MeAssessmentsService, useValue: service },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: {
              get: (k: string) => (k === 'assessmentId' ? ASSESSMENT_ID : null),
            },
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(MeAssessmentComponent);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
    service,
  };
}

describe('MeAssessmentComponent (Phase X.3.2)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('init / load', () => {
    it('creates', () => {
      const { component } = setup();
      expect(component).toBeTruthy();
    });

    it('fires service.loadAssessment() with the route assessmentId on mount', () => {
      const { service } = setup();
      expect(service.loadCalls).toContain(ASSESSMENT_ID);
    });

    it('renders skeleton while detail is loading', () => {
      const { element } = setup();
      expect(
        element.querySelector('[data-testid="me-assessment-loading"]'),
      ).toBeTruthy();
    });

    it('renders error banner on detail load failure', () => {
      const { service, fixture, element } = setup();
      service._detailState.set({
        status: 'error',
        error: 'aplus.me_assessments.detail.error_upstream',
      });
      fixture.detectChanges();
      const banner = element.querySelector(
        '[data-testid="me-assessment-load-error"]',
      );
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });
  });

  describe('cover (start CTA)', () => {
    function setupSuccess() {
      const ctx = setup();
      ctx.service._detailState.set({
        status: 'success',
        detail: buildDetail(),
      });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('renders the assessment title + Start CTA when state=idle', () => {
      const { element } = setupSuccess();
      expect(
        element.querySelector('[data-testid="me-assessment-cover-title"]')
          ?.textContent,
      ).toContain('Agile Estimation');
      expect(
        element.querySelector('[data-testid="me-assessment-start"]'),
      ).toBeTruthy();
    });

    it('Start CTA fires service.startSubmission(assessmentId)', () => {
      const { service, element } = setupSuccess();
      (
        element.querySelector(
          '[data-testid="me-assessment-start"]',
        ) as HTMLButtonElement
      ).click();
      expect(service.startCalls).toContain(ASSESSMENT_ID);
    });

    it('renders the starting state while in flight', () => {
      const ctx = setupSuccess();
      ctx.service._startState.set({ status: 'starting' });
      ctx.fixture.detectChanges();
      expect(
        ctx.element.querySelector('[data-testid="me-assessment-starting"]'),
      ).toBeTruthy();
    });

    it('renders the start-error banner on POST failure', () => {
      const ctx = setupSuccess();
      ctx.service._startState.set({
        status: 'error',
        error: 'aplus.me_assessments.start.error_conflict',
      });
      ctx.fixture.detectChanges();
      const banner = ctx.element.querySelector(
        '[data-testid="me-assessment-start-error"]',
      );
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });

    it('transitions to canvas state after start succeeds', () => {
      const ctx = setupSuccess();
      ctx.service._startState.set({
        status: 'started',
        started: buildStarted(),
      });
      ctx.fixture.detectChanges();
      expect(
        ctx.element.querySelector('[data-testid="me-assessment-canvas"]'),
      ).toBeTruthy();
    });
  });

  describe('cover state gating (CHO-2182)', () => {
    function setupWith(overrides: Partial<LearnerAssessmentDetail>) {
      const ctx = setup();
      ctx.service._detailState.set({
        status: 'success',
        detail: buildDetail(overrides),
      });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('offers Start when state=OPEN with attempts remaining', () => {
      const { element } = setupWith({
        state: 'OPEN',
        learner_remaining_attempts: 1,
      });
      expect(
        element.querySelector('[data-testid="me-assessment-start"]'),
      ).toBeTruthy();
    });

    it('does NOT offer Start for a SCHEDULED (not-yet-open) assessment', () => {
      const { element } = setupWith({
        state: 'SCHEDULED',
        learner_remaining_attempts: 1,
      });
      expect(
        element.querySelector('[data-testid="me-assessment-start"]'),
      ).toBeNull();
    });

    it('shows the scheduled-open state with the humanised open time for SCHEDULED', () => {
      const { element } = setupWith({
        state: 'SCHEDULED',
        scheduled_open_at: '2026-05-20T09:00:00Z',
        learner_remaining_attempts: 1,
      });
      const scheduled = element.querySelector(
        '[data-testid="me-assessment-scheduled"]',
      );
      expect(scheduled).toBeTruthy();
      expect(scheduled?.textContent).toContain(
        formatDate('2026-05-20T09:00:00Z', 'medium', 'en-US'),
      );
      expect(scheduled?.textContent).not.toContain('2026-05-20T09:00:00Z');
    });

    it('does NOT offer Start for a CLOSED assessment and shows its state', () => {
      const { element } = setupWith({
        state: 'CLOSED',
        learner_remaining_attempts: 1,
      });
      expect(
        element.querySelector('[data-testid="me-assessment-start"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="me-assessment-state"]'),
      ).toBeTruthy();
    });

    it('does NOT offer Start for a GRADING assessment and shows its state', () => {
      const { element } = setupWith({
        state: 'GRADING',
        learner_remaining_attempts: 1,
      });
      expect(
        element.querySelector('[data-testid="me-assessment-start"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="me-assessment-state"]'),
      ).toBeTruthy();
    });

    it('shows the View-result CTA (not Start, not a state chip) for RELEASED with a prior submission', () => {
      const { element } = setupWith({
        state: 'RELEASED',
        learner_latest_submission_id: SUBMISSION_ID,
        learner_remaining_attempts: 0,
      });
      expect(
        element.querySelector('[data-testid="me-assessment-view-result"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="me-assessment-start"]'),
      ).toBeNull();
      // A viewable result supersedes the bare state chip.
      expect(
        element.querySelector('[data-testid="me-assessment-state"]'),
      ).toBeNull();
    });
  });

  describe('draft pickup (idempotent start)', () => {
    it('picks up existing IN_PROGRESS submission when start returns idempotent_replay=true', () => {
      const { service, fixture } = setup();
      service._detailState.set({ status: 'success', detail: buildDetail() });
      fixture.detectChanges();
      service._startState.set({
        status: 'started',
        started: { ...buildStarted(), idempotent_replay: true },
      });
      fixture.detectChanges();
      const calls = service.loadSubmissionCalls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls[calls.length - 1].sid).toBe(SUBMISSION_ID);
    });
  });

  describe('working canvas — MCQ + autosave', () => {
    function setupStarted() {
      const ctx = setup();
      ctx.service._detailState.set({
        status: 'success',
        detail: buildDetail(),
      });
      ctx.fixture.detectChanges();
      ctx.service._startState.set({
        status: 'started',
        started: buildStarted(),
      });
      ctx.service._submissionState.set({
        status: 'success',
        submission: buildSubmission(),
      });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('renders per-MCQ question with options', () => {
      const { element } = setupStarted();
      expect(
        element.querySelector('[data-testid="me-assessment-question-tsq-1"]'),
      ).toBeTruthy();
      expect(
        element.querySelectorAll(
          '[data-testid^="me-assessment-mcq-option-tsq-1-"]',
        ).length,
      ).toBe(2);
    });

    it('renders OE textarea for OE questions', () => {
      const { element } = setupStarted();
      expect(
        element.querySelector('[data-testid="me-assessment-oe-tsq-2"]'),
      ).toBeTruthy();
    });

    it('wires question-stem id + aria-describedby on each MCQ option for WCAG AA', () => {
      const { element } = setupStarted();
      // Stem heading carries the stable id used as the describedby target.
      const stem = element.querySelector(
        '[data-testid="me-assessment-question-tsq-1"] [data-testid="me-assessment-question-prompt"]',
      );
      expect(stem?.id).toBe('me-assessment-stem-tsq-1');
      // Each <button role="radio"> describes itself by the stem id so SR
      // announces "<marker> <text>, <stem>, radio not checked".
      const optionBtns = element.querySelectorAll(
        '[data-testid^="me-assessment-mcq-option-tsq-1-"]',
      );
      expect(optionBtns.length).toBe(2);
      optionBtns.forEach((btn) => {
        expect(btn.getAttribute('aria-describedby')).toBe(
          'me-assessment-stem-tsq-1',
        );
      });
    });

    it('MCQ option click triggers debounced autosave (~500ms)', async () => {
      const { service, element } = setupStarted();
      const before = service.autosaveCalls.length;
      (
        element.querySelector(
          '[data-testid="me-assessment-mcq-option-tsq-1-opt-a"]',
        ) as HTMLButtonElement
      ).click();
      await new Promise((r) => setTimeout(r, 600));
      const after = service.autosaveCalls.length;
      expect(after).toBeGreaterThan(before);
      const lastCall = service.autosaveCalls[service.autosaveCalls.length - 1];
      expect(lastCall.aid).toBe(ASSESSMENT_ID);
      expect(lastCall.sid).toBe(SUBMISSION_ID);
    });

    it('autosave pill cycles idle → saving → saved with timestamp', () => {
      const { service, fixture, element } = setupStarted();
      const pillIdle = element.querySelector(
        '[data-testid="me-assessment-autosave-pill"]',
      );
      expect(pillIdle?.getAttribute('data-state')).toBe('idle');

      service._autosaveState.set({ status: 'saving' });
      fixture.detectChanges();
      expect(
        element
          .querySelector('[data-testid="me-assessment-autosave-pill"]')
          ?.getAttribute('data-state'),
      ).toBe('saving');

      const savedAt = '2026-05-20T09:10:00Z';
      service._autosaveState.set({ status: 'saved', saved_at: savedAt });
      fixture.detectChanges();
      const savedPill = element.querySelector(
        '[data-testid="me-assessment-autosave-pill"]',
      );
      expect(savedPill?.getAttribute('data-state')).toBe('saved');
      // Learner-facing: a humanised local time, never the raw ISO stamp.
      expect(savedPill?.textContent).toContain(
        formatDate(savedAt, 'mediumTime', 'en-US'),
      );
      expect(savedPill?.textContent).not.toContain(savedAt);
    });

    it('humanises a nanosecond-precision saved_at (no raw ISO leak)', () => {
      const { service, fixture, element } = setupStarted();
      // Go time.Time marshals RFC3339Nano (9 fractional digits). The pill must
      // never surface that raw to a learner (bug: "SAVED …148799088Z").
      const nano = '2026-05-20T09:10:00.148799088Z';
      service._autosaveState.set({ status: 'saved', saved_at: nano });
      fixture.detectChanges();
      const pill = element.querySelector(
        '[data-testid="me-assessment-autosave-pill"]',
      );
      expect(pill?.textContent).not.toContain('148799088');
      expect(pill?.textContent).not.toContain(nano);
      expect(pill?.textContent).toContain(
        formatDate(nano, 'mediumTime', 'en-US'),
      );
    });

    it('autosave pill shows save-failed branch on error', () => {
      const { service, fixture, element } = setupStarted();
      service._autosaveState.set({
        status: 'error',
        error: 'aplus.me_assessments.autosave.error_save_failed',
      });
      fixture.detectChanges();
      const pill = element.querySelector(
        '[data-testid="me-assessment-autosave-pill"]',
      );
      expect(pill?.getAttribute('data-state')).toBe('error');
      expect(pill?.getAttribute('role')).toBe('status');
    });
  });

  describe('submit flow', () => {
    function setupStarted() {
      const ctx = setup();
      ctx.service._detailState.set({
        status: 'success',
        detail: buildDetail(),
      });
      ctx.service._startState.set({
        status: 'started',
        started: buildStarted(),
      });
      ctx.service._submissionState.set({
        status: 'success',
        submission: buildSubmission(),
      });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('renders Submit CTA in canvas footer', () => {
      const { element } = setupStarted();
      expect(
        element.querySelector('[data-testid="me-assessment-submit"]'),
      ).toBeTruthy();
    });

    it('Submit CTA fires service.submitFinal(assessmentId, submissionId)', () => {
      const { service, element } = setupStarted();
      (
        element.querySelector(
          '[data-testid="me-assessment-submit"]',
        ) as HTMLButtonElement
      ).click();
      expect(service.submitFinalCalls.length).toBe(1);
      expect(service.submitFinalCalls[0].aid).toBe(ASSESSMENT_ID);
      expect(service.submitFinalCalls[0].sid).toBe(SUBMISSION_ID);
    });

    it('renders submitting state while in flight', () => {
      const ctx = setupStarted();
      ctx.service._submitFinalState.set({ status: 'submitting' });
      ctx.fixture.detectChanges();
      expect(
        ctx.element.querySelector('[data-testid="me-assessment-submitting"]'),
      ).toBeTruthy();
    });

    it('renders submit-error banner on submit failure', () => {
      const ctx = setupStarted();
      ctx.service._submitFinalState.set({
        status: 'error',
        error: 'aplus.me_assessments.submit.error_required_unanswered',
      });
      ctx.fixture.detectChanges();
      const banner = ctx.element.querySelector(
        '[data-testid="me-assessment-submit-error"]',
      );
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });

    it('exposes a navigate target to /result on submit success', () => {
      const ctx = setupStarted();
      ctx.service._submitFinalState.set({
        status: 'submitted',
        response: {
          submission_id: SUBMISSION_ID,
          state: 'SUBMITTED',
          grading_job_id: 'job-1',
        },
      });
      ctx.fixture.detectChanges();
      const link = ctx.element.querySelector(
        '[data-testid="me-assessment-go-result"]',
      ) as HTMLAnchorElement;
      expect(link).toBeTruthy();
      expect(link.getAttribute('href')).toBe(
        `/a/me/assessments/${ASSESSMENT_ID}/result/${SUBMISSION_ID}`,
      );
    });
  });

  describe('heartbeat keep-alive autosave', () => {
    function setupStarted() {
      const ctx = setup();
      ctx.service._detailState.set({
        status: 'success',
        detail: buildDetail(),
      });
      ctx.service._startState.set({
        status: 'started',
        started: buildStarted(),
      });
      ctx.service._submissionState.set({
        status: 'success',
        submission: buildSubmission(),
      });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('exposes a startHeartbeat() and stopHeartbeat() control surface', () => {
      const { component } = setupStarted();
      expect(typeof component.startHeartbeat).toBe('function');
      expect(typeof component.stopHeartbeat).toBe('function');
    });

    it('manually-triggered heartbeat fires autosave even when no fields changed', () => {
      const { service, component } = setupStarted();
      const before = service.autosaveCalls.length;
      component.fireHeartbeat();
      expect(service.autosaveCalls.length).toBe(before + 1);
    });
  });
});
