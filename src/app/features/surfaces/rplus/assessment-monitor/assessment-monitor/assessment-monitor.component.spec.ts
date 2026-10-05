import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, computed, signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AssessmentMonitorComponent } from './assessment-monitor.component';
import { AssessmentMonitorService } from '../assessment-monitor.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { TranslateService } from '../../../../../core/services/translate.service';
import type { QuestionReview } from '../../../../../shared/components/chora-question-review/chora-question-review.model';
import type {
  Assessment,
  AssessmentActionState,
  AssessmentLoadState,
  AssessmentMonitor,
  MonitorLoadState,
  MonitorTestSet,
  MonitorTestSetLoadState,
  Submission,
  SubmissionsLoadState,
} from '../assessment-monitor.model';

/**
 * AssessmentMonitorComponent spec — `/r/assessments/:id/monitor` instructor surface.
 *
 * Validates: load fan-out (assessment + monitor + submissions), per-state CTA
 * gating (DRAFT→Publish, OPEN→Force Close, CLOSED→Release Results, RELEASED→
 * success badge, ARCHIVED→all CTAs disabled), the release-results confirm
 * dialog flow, and per-CTA error / loading branches.
 */

const ASSESSMENT_ID = '019e2b24-759f-76b8-bad8-0000000000a1';
const SUBMISSION_ID_A = '019e2b24-759f-76b8-bad8-000000000601';
const SUBMISSION_ID_B = '019e2b24-759f-76b8-bad8-000000000602';

function buildAssessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    assessment_id: ASSESSMENT_ID,
    tenant_id: '11111111-1111-7111-8111-111111111111',
    instructor_gcid: '00000000-0000-7000-8000-000000001999',
    test_set_id: '01985e7f-1234-7abc-8def-000000000a01',
    test_set_revision_snapshot: 1,
    class_id: null,
    invited_gcids: ['00000000-0000-7000-8000-000000002001'],
    title: 'Agile Estimation — Cohort May 2026',
    learner_facing_name: null,
    state: 'OPEN',
    scheduled_open_at: '2026-05-20T09:00:00Z',
    scheduled_close_at: '2026-05-20T11:00:00Z',
    max_attempts: 1,
    shuffle_questions: true,
    shuffle_mcq_options: true,
    total_points: 100,
    question_count: 10,
    grading_config_snapshot: {
      mcq_dispatch: 'DETERMINISTIC',
      passing_threshold_percent: 70,
      per_question_feedback_enabled: false,
      auto_release: false,
    },
    deleted_at: null,
    created_at: '2026-05-15T10:00:00Z',
    updated_at: '2026-05-15T10:00:00Z',
    published_at: null,
    closed_at: null,
    released_at: null,
    archived_at: null,
    ...overrides,
  };
}

function buildMonitor(
  overrides: Partial<AssessmentMonitor> = {},
): AssessmentMonitor {
  return {
    assessment_id: ASSESSMENT_ID,
    state: 'OPEN',
    total_invited: 12,
    total_started: 8,
    total_submitted: 5,
    total_graded: 0,
    in_progress_count: 3,
    total_released: 0,
    average_score_percent: null,
    median_score_percent: null,
    passed_count: null,
    failed_count: null,
    per_question_pass_rate: [],
    ...overrides,
  };
}

function buildSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    submission_id: SUBMISSION_ID_A,
    assessment_id: ASSESSMENT_ID,
    tenant_id: '11111111-1111-7111-8111-111111111111',
    learner_gcid: '00000000-0000-7000-8000-000000002001',
    attempt_number: 1,
    state: 'SUBMITTED',
    started_at: '2026-05-20T09:05:00Z',
    submitted_at: '2026-05-20T09:30:00Z',
    last_saved_at: '2026-05-20T09:30:00Z',
    answers: [],
    learner_display_name: 'Phyllis Tan',
    score_percent: null,
    ...overrides,
  };
}

class StubAssessmentMonitorService {
  readonly _assessmentState: WritableSignal<AssessmentLoadState> =
    signal<AssessmentLoadState>({ status: 'loading' });
  readonly assessmentState = this._assessmentState.asReadonly();
  readonly assessment = computed<Assessment | null>(() => {
    const s = this._assessmentState();
    return s.status === 'success' ? s.assessment : null;
  });

  readonly _monitorState: WritableSignal<MonitorLoadState> =
    signal<MonitorLoadState>({ status: 'loading' });
  readonly monitorState = this._monitorState.asReadonly();
  readonly monitor = computed<AssessmentMonitor | null>(() => {
    const s = this._monitorState();
    return s.status === 'success' ? s.monitor : null;
  });

  readonly _submissionsState: WritableSignal<SubmissionsLoadState> =
    signal<SubmissionsLoadState>({ status: 'loading' });
  readonly submissionsState = this._submissionsState.asReadonly();
  readonly submissions = computed<readonly Submission[]>(() => {
    const s = this._submissionsState();
    return s.status === 'success' ? s.submissions : [];
  });

  readonly _publishState: WritableSignal<AssessmentActionState> =
    signal<AssessmentActionState>({ status: 'idle' });
  readonly publishState = this._publishState.asReadonly();

  readonly _forceCloseState: WritableSignal<AssessmentActionState> =
    signal<AssessmentActionState>({ status: 'idle' });
  readonly forceCloseState = this._forceCloseState.asReadonly();

  readonly _releaseState: WritableSignal<AssessmentActionState> =
    signal<AssessmentActionState>({ status: 'idle' });
  readonly releaseState = this._releaseState.asReadonly();

  readonly _archiveState: WritableSignal<AssessmentActionState> =
    signal<AssessmentActionState>({ status: 'idle' });
  readonly archiveState = this._archiveState.asReadonly();

  readonly _testSetState: WritableSignal<MonitorTestSetLoadState> =
    signal<MonitorTestSetLoadState>({ status: 'idle' });
  readonly testSetState = this._testSetState.asReadonly();
  readonly testSet = computed<MonitorTestSet | null>(() => {
    const s = this._testSetState();
    return s.status === 'success' ? s.testSet : null;
  });

  // Unused (list page) signals.
  readonly listState = signal({ status: 'loading' as const }).asReadonly();
  readonly assessments = signal<readonly Assessment[]>([]).asReadonly();

  loadAssessmentCalls: string[] = [];
  loadMonitorCalls: string[] = [];
  loadSubmissionsCalls: string[] = [];
  loadTestSetCalls: string[] = [];
  getQuestionDetailCalls: { atomId: string; questionId: string }[] = [];
  questionReviewStub: QuestionReview | null = null;
  publishCalls: string[] = [];
  forceCloseCalls: string[] = [];
  releaseResultsCalls: string[] = [];
  archiveCalls: string[] = [];

  loadList(): void { /* stub */ }
  loadAssessment(id: string): void {
    this.loadAssessmentCalls.push(id);
  }
  loadMonitor(id: string): void {
    this.loadMonitorCalls.push(id);
  }
  loadSubmissions(id: string): void {
    this.loadSubmissionsCalls.push(id);
  }
  loadTestSet(id: string): void {
    this.loadTestSetCalls.push(id);
  }
  getQuestionDetail(atomId: string, questionId: string): Observable<QuestionReview> {
    this.getQuestionDetailCalls.push({ atomId, questionId });
    return of(
      this.questionReviewStub ?? {
        question_type: 'mcq',
        options: [],
        model_answer: null,
        rubric: [],
        question_image_url: null,
        answer_image_url: null,
      },
    );
  }
  publish(id: string): void {
    this.publishCalls.push(id);
  }
  forceClose(id: string): void {
    this.forceCloseCalls.push(id);
  }
  releaseResults(id: string): void {
    this.releaseResultsCalls.push(id);
  }
  archive(id: string): void {
    this.archiveCalls.push(id);
  }
}

class StubConfirmDialogService {
  confirmCalls: { title: string; message: string }[] = [];
  resolveValue = true;
  confirm(opts: { title: string; message: string }): Promise<boolean> {
    this.confirmCalls.push({ title: opts.title, message: opts.message });
    return Promise.resolve(this.resolveValue);
  }
}

class StubToastService {
  showCalls: { message: string; type: string }[] = [];
  show(message: string, type: string): string {
    this.showCalls.push({ message, type });
    return 'toast-stub';
  }
}

function setup(): {
  fixture: ComponentFixture<AssessmentMonitorComponent>;
  element: HTMLElement;
  service: StubAssessmentMonitorService;
  confirm: StubConfirmDialogService;
  toast: StubToastService;
} {
  const service = new StubAssessmentMonitorService();
  const confirm = new StubConfirmDialogService();
  const toast = new StubToastService();
  const stubRoute = {
    snapshot: {
      paramMap: {
        get: (key: string) => (key === 'assessmentId' ? ASSESSMENT_ID : null),
      },
    },
  } as unknown as ActivatedRoute;

  TestBed.configureTestingModule({
    imports: [AssessmentMonitorComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: ActivatedRoute, useValue: stubRoute },
      { provide: AssessmentMonitorService, useValue: service },
      { provide: ConfirmDialogService, useValue: confirm },
      { provide: ToastService, useValue: toast },
    ],
  });
  const fixture = TestBed.createComponent(AssessmentMonitorComponent);
  fixture.detectChanges();
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    service,
    confirm,
    toast,
  };
}

describe('AssessmentMonitorComponent (R+ /r/assessments/:id/monitor)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('init / fan-out load', () => {
    it('creates', () => {
      const { fixture } = setup();
      expect(fixture.componentInstance).toBeTruthy();
    });

    it('fans out three loads on init (assessment + monitor + submissions)', () => {
      const { service } = setup();
      expect(service.loadAssessmentCalls).toContain(ASSESSMENT_ID);
      expect(service.loadMonitorCalls).toContain(ASSESSMENT_ID);
      expect(service.loadSubmissionsCalls).toContain(ASSESSMENT_ID);
    });

    it('has data-testid="rplus-assessment-monitor" + surface-rplus root', () => {
      const { element } = setup();
      const root = element.querySelector(
        '[data-testid="rplus-assessment-monitor"]',
      ) as HTMLElement;
      expect(root).toBeTruthy();
      expect(root.classList.contains('surface-rplus')).toBe(true);
    });
  });

  describe('loading branch', () => {
    it('renders loading skeleton while any of the 3 loads is in-flight', () => {
      const { element } = setup();
      const panel = element.querySelector(
        '[data-testid="assessment-monitor-loading"]',
      );
      expect(panel).toBeTruthy();
    });

    it('does NOT render the monitor body while loading', () => {
      const { element } = setup();
      expect(
        element.querySelector('[data-testid="assessment-monitor-body"]'),
      ).toBeNull();
    });
  });

  describe('error branch (fail loud)', () => {
    it('renders a role=alert banner when assessment load errors', () => {
      const { service, fixture, element } = setup();
      service._assessmentState.set({
        status: 'error',
        error: 'rplus.assessment_monitor.error_not_found',
      });
      service._monitorState.set({
        status: 'success',
        monitor: buildMonitor(),
      });
      service._submissionsState.set({ status: 'success', submissions: [] });
      fixture.detectChanges();
      const banner = element.querySelector(
        '[data-testid="assessment-monitor-error"]',
      );
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });

    it('retry CTA re-fires all three loads', () => {
      const { service, fixture, element } = setup();
      service._assessmentState.set({
        status: 'error',
        error: 'rplus.assessment_monitor.error_upstream',
      });
      service._monitorState.set({
        status: 'success',
        monitor: buildMonitor(),
      });
      service._submissionsState.set({ status: 'success', submissions: [] });
      fixture.detectChanges();
      const before = {
        a: service.loadAssessmentCalls.length,
        m: service.loadMonitorCalls.length,
        s: service.loadSubmissionsCalls.length,
      };
      (
        element.querySelector(
          '[data-testid="assessment-monitor-retry"]',
        ) as HTMLButtonElement
      ).click();
      expect(service.loadAssessmentCalls.length).toBe(before.a + 1);
      expect(service.loadMonitorCalls.length).toBe(before.m + 1);
      expect(service.loadSubmissionsCalls.length).toBe(before.s + 1);
    });
  });

  describe('success branch — body render', () => {
    function loadAll(
      service: StubAssessmentMonitorService,
      state: Assessment['state'] = 'OPEN',
      monitor: Partial<AssessmentMonitor> = {},
      submissions: readonly Submission[] = [buildSubmission()],
    ): void {
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment({ state }),
      });
      service._monitorState.set({
        status: 'success',
        monitor: buildMonitor({ state, ...monitor }),
      });
      service._submissionsState.set({ status: 'success', submissions });
    }

    it('renders assessment title + state pill', () => {
      const { service, fixture, element } = setup();
      loadAll(service, 'OPEN');
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="assessment-monitor-title"]')
          ?.textContent,
      ).toContain('Agile Estimation');
      const pill = element.querySelector(
        '[data-testid="assessment-monitor-state"]',
      ) as HTMLElement;
      expect(pill.getAttribute('data-state')).toBe('OPEN');
    });

    it('renders cohort progress counts (invited / in-progress / submitted / abandoned)', () => {
      const { service, fixture, element } = setup();
      loadAll(service, 'OPEN', {
        total_invited: 12,
        total_started: 8,
        total_submitted: 5,
        in_progress_count: 3,
      });
      fixture.detectChanges();
      const invited = element.querySelector(
        '[data-testid="cohort-progress-invited"]',
      );
      expect(invited?.textContent).toContain('12');
      const inProgress = element.querySelector(
        '[data-testid="cohort-progress-in-progress"]',
      );
      expect(inProgress?.textContent).toContain('3');
      const submitted = element.querySelector(
        '[data-testid="cohort-progress-submitted"]',
      );
      expect(submitted?.textContent).toContain('5');
      // abandoned = invited - started = 12 - 8 = 4
      const abandoned = element.querySelector(
        '[data-testid="cohort-progress-abandoned"]',
      );
      expect(abandoned?.textContent).toContain('4');
    });

    it('renders submissions table with one row per submission', () => {
      const { service, fixture, element } = setup();
      loadAll(service, 'OPEN', {}, [
        buildSubmission({
          submission_id: SUBMISSION_ID_A,
          learner_display_name: 'Phyllis Tan',
        }),
        buildSubmission({
          submission_id: SUBMISSION_ID_B,
          learner_display_name: 'Aisha Khan',
          state: 'GRADED',
        }),
      ]);
      fixture.detectChanges();
      const rows = element.querySelectorAll('[data-testid="submission-row"]');
      expect(rows.length).toBe(2);
      const firstName = rows[0].querySelector(
        '[data-testid="submission-learner-name"]',
      );
      expect(firstName?.textContent).toContain('Phyllis Tan');
    });

    it('submission row renders state chip + "Pending release" chip pre-RELEASED (P1 design refinement 2026-05-17)', () => {
      const { service, fixture, element } = setup();
      loadAll(service, 'CLOSED', {}, [
        buildSubmission({
          state: 'GRADED',
          score_percent: null,
        }),
      ]);
      fixture.detectChanges();
      const stateChip = element.querySelector(
        '[data-testid="submission-state"]',
      ) as HTMLElement;
      expect(stateChip.getAttribute('data-state')).toBe('GRADED');
      // P1 design refinement: pre-RELEASED, the score column shows the
      // "Pending release" chip (BE doesn't backfill score until RELEASED;
      // showing "0%" was confusing UX in CJ#1 smoke #4).
      const score = element.querySelector('[data-testid="submission-score"]');
      expect(score?.textContent ?? '').toContain(
        'rplus.assessment_monitor.score_pending_release',
      );
      // The chip MUST be present — verifies the chip styling hook
      const chip = element.querySelector(
        '[data-testid="submission-score-pending"]',
      );
      expect(chip).toBeTruthy();
    });

    it('submission row renders numeric score post-release (RELEASED state)', () => {
      const { service, fixture, element } = setup();
      loadAll(service, 'RELEASED', {}, [
        buildSubmission({
          state: 'RELEASED',
          score_percent: 85.5,
        }),
      ]);
      fixture.detectChanges();
      const score = element.querySelector('[data-testid="submission-score"]');
      expect(score?.textContent).toContain('85.5');
      // Post-RELEASED → no pending chip
      const chip = element.querySelector(
        '[data-testid="submission-score-pending"]',
      );
      expect(chip).toBeNull();
    });

    it('shows a "Pending review" chip (not 0%) for a graded-but-unapproved submission even when the assessment is RELEASED', () => {
      const { service, fixture, element } = setup();
      // The assessment lifecycle is RELEASED, but THIS submission is still
      // GRADED + PENDING_REVIEW (OE awaiting instructor approval, ADR-172) so
      // its score is withheld. It must NOT render the misleading "0%".
      loadAll(service, 'RELEASED', {}, [
        buildSubmission({
          state: 'GRADED',
          score_percent: null,
          review_status: 'PENDING_REVIEW',
        }),
      ]);
      fixture.detectChanges();
      const score = element.querySelector('[data-testid="submission-score"]');
      expect(score?.textContent ?? '').not.toContain('0%');
      expect(score?.textContent ?? '').toContain(
        'rplus.assessment_monitor.score_pending_review',
      );
      const reviewChip = element.querySelector(
        '[data-testid="submission-score-pending-review"]',
      );
      expect(reviewChip).toBeTruthy();
    });

    it('submission row score column is "Pending release" chip across OPEN / CLOSED / GRADING / GRADED states', () => {
      const preReleased: Assessment['state'][] = [
        'OPEN',
        'CLOSED',
        'GRADING',
        'GRADED',
      ];
      for (const state of preReleased) {
        TestBed.resetTestingModule();
        const { service, fixture, element } = setup();
        loadAll(service, state, {}, [
          buildSubmission({
            state: state === 'OPEN' ? 'SUBMITTED' : 'GRADED',
            score_percent: state === 'GRADED' ? 0 : null,
          }),
        ]);
        fixture.detectChanges();
        const chip = element.querySelector(
          '[data-testid="submission-score-pending"]',
        );
        expect(chip, `pending chip should render for state=${state}`).toBeTruthy();
      }
    });

    it('Average score stat-card renders state="pending" pre-RELEASED (P1 design refinement 2026-05-17)', () => {
      const { service, fixture, element } = setup();
      // Per the P1 refinement: render the Average score card with state=pending
      // even when BE has not backfilled average_score_percent yet (the BE
      // contract only populates this post-RELEASED).
      loadAll(service, 'CLOSED', { average_score_percent: null }, []);
      fixture.detectChanges();
      const card = element.querySelector(
        '[data-testid="cohort-progress-average-score"]',
      );
      expect(card).toBeTruthy();
      // The chora-stat-card primitive renders the em-dash when state=pending
      expect(card?.textContent).toContain('–');
    });

    it('Average score stat-card renders state="value" post-RELEASED', () => {
      const { service, fixture, element } = setup();
      loadAll(service, 'RELEASED', { average_score_percent: 72.5 }, []);
      fixture.detectChanges();
      const card = element.querySelector(
        '[data-testid="cohort-progress-average-score"]',
      );
      expect(card).toBeTruthy();
      // Post-RELEASED — real numeric value rendered
      expect(card?.textContent).toContain('72.5');
      // And no em-dash from pending fallback
      expect(card?.textContent).not.toContain('—');
    });

    it('renders empty-submissions placeholder when zero submissions', () => {
      const { service, fixture, element } = setup();
      loadAll(service, 'OPEN', {}, []);
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="submissions-empty"]'),
      ).toBeTruthy();
    });
  });

  describe('CTA visibility per state', () => {
    function setState(
      service: StubAssessmentMonitorService,
      state: Assessment['state'],
      monitorOverrides: Partial<AssessmentMonitor> = {},
    ): void {
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment({ state }),
      });
      service._monitorState.set({
        status: 'success',
        monitor: buildMonitor({ state, ...monitorOverrides }),
      });
      service._submissionsState.set({ status: 'success', submissions: [] });
    }

    it('DRAFT shows Publish CTA only', () => {
      const { service, fixture, element } = setup();
      setState(service, 'DRAFT');
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="cta-publish"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="cta-force-close"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="cta-release-results"]'),
      ).toBeNull();
    });

    it('OPEN shows Force-close AND Release Results CTAs (Release loosened per 1e776b6c)', () => {
      const { service, fixture, element } = setup();
      setState(service, 'OPEN');
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="cta-publish"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="cta-force-close"]'),
      ).toBeTruthy();
      // Per 1e776b6c (FE-BUG-RELEASE-CTA-WRONG-STATE-GATE): the Release
      // Results gate now returns true on OPEN OR CLOSED (BE allows
      // direct release from OPEN; curl-smoked in CJ#1). Force-close
      // remains useful as a window-curtailment CTA but is no longer
      // a prerequisite for releasing results.
      expect(
        element.querySelector('[data-testid="cta-release-results"]'),
      ).toBeTruthy();
    });

    it('CLOSED shows Release Results CTA (THE critical demo CTA)', () => {
      const { service, fixture, element } = setup();
      setState(service, 'CLOSED', { total_submitted: 5 });
      fixture.detectChanges();
      const cta = element.querySelector(
        '[data-testid="cta-release-results"]',
      ) as HTMLButtonElement;
      expect(cta).toBeTruthy();
      expect(cta.disabled).toBe(false);
    });

    it('CLOSED with zero submissions disables the Release Results CTA', () => {
      const { service, fixture, element } = setup();
      setState(service, 'CLOSED', { total_submitted: 0 });
      fixture.detectChanges();
      const cta = element.querySelector(
        '[data-testid="cta-release-results"]',
      ) as HTMLButtonElement;
      expect(cta).toBeTruthy();
      expect(cta.disabled).toBe(true);
    });

    it('RELEASED renders the success badge and shows no CTAs', () => {
      const { service, fixture, element } = setup();
      setState(service, 'RELEASED');
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="released-badge"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="cta-release-results"]'),
      ).toBeNull();
    });

    it('CLOSED with a PENDING_REVIEW submission disables Release + shows a grading-queue hint', () => {
      const { service, fixture, element } = setup();
      // Releasing now would silently release zero submissions (the OE awaits
      // instructor approval) — the CTA must be gated, mirroring the queue.
      setState(service, 'CLOSED', { total_submitted: 1, total_graded: 1 });
      service._submissionsState.set({
        status: 'success',
        submissions: [
          buildSubmission({ state: 'GRADED', review_status: 'PENDING_REVIEW' }),
        ],
      });
      fixture.detectChanges();
      const cta = element.querySelector(
        '[data-testid="cta-release-results"]',
      ) as HTMLButtonElement;
      expect(cta.disabled).toBe(true);
      expect(
        element.querySelector('[data-testid="release-blocked-review"]'),
      ).toBeTruthy();
    });

    it('RELEASED with graded-but-unreleased submissions shows a results-partial warning', () => {
      const { service, fixture, element } = setup();
      setState(service, 'RELEASED', { total_graded: 1, total_released: 0 });
      service._submissionsState.set({
        status: 'success',
        submissions: [
          buildSubmission({ state: 'GRADED', review_status: 'PENDING_REVIEW' }),
        ],
      });
      fixture.detectChanges();
      const warn = element.querySelector(
        '[data-testid="results-partial-warning"]',
      );
      expect(warn).toBeTruthy();
      // released / graded counts surfaced so RELEASED isn't mistaken for "all out".
      expect(warn?.textContent ?? '').toContain('0/1');
    });

    it('RELEASED with all submissions released shows no results-partial warning', () => {
      const { service, fixture, element } = setup();
      setState(service, 'RELEASED', { total_graded: 2, total_released: 2 });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="results-partial-warning"]'),
      ).toBeNull();
    });

    it('ARCHIVED renders the archive badge and shows no actionable CTAs', () => {
      const { service, fixture, element } = setup();
      setState(service, 'ARCHIVED');
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="archived-badge"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="cta-publish"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="cta-archive"]'),
      ).toBeNull();
    });

    it('non-ARCHIVED states show an Archive CTA', () => {
      const { service, fixture, element } = setup();
      setState(service, 'OPEN');
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="cta-archive"]'),
      ).toBeTruthy();
    });
  });

  describe('Release Results flow', () => {
    function setClosed(
      service: StubAssessmentMonitorService,
      submitted = 5,
    ): void {
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment({ state: 'CLOSED' }),
      });
      service._monitorState.set({
        status: 'success',
        monitor: buildMonitor({
          state: 'CLOSED',
          total_submitted: submitted,
        }),
      });
      service._submissionsState.set({
        status: 'success',
        submissions: [buildSubmission({ state: 'GRADED' })],
      });
    }

    it('clicking Release CTA opens a confirm dialog with the submission count', async () => {
      const { service, fixture, element, confirm } = setup();
      setClosed(service, 5);
      fixture.detectChanges();
      (
        element.querySelector(
          '[data-testid="cta-release-results"]',
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
      expect(confirm.confirmCalls.length).toBe(1);
      // The dialog message must reference the submitted count for transparency
      expect(confirm.confirmCalls[0].message).toContain('5');
    });

    it('confirming the dialog fires service.releaseResults()', async () => {
      const { service, fixture, element, confirm } = setup();
      setClosed(service);
      fixture.detectChanges();
      confirm.resolveValue = true;
      (
        element.querySelector(
          '[data-testid="cta-release-results"]',
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
      await Promise.resolve();
      expect(service.releaseResultsCalls).toContain(ASSESSMENT_ID);
    });

    it('cancelling the dialog does NOT fire releaseResults()', async () => {
      const { service, fixture, element, confirm } = setup();
      setClosed(service);
      fixture.detectChanges();
      confirm.resolveValue = false;
      (
        element.querySelector(
          '[data-testid="cta-release-results"]',
        ) as HTMLButtonElement
      ).click();
      await Promise.resolve();
      await Promise.resolve();
      expect(service.releaseResultsCalls).not.toContain(ASSESSMENT_ID);
    });

    it('on release success — refreshes monitor + assessment + shows success toast', async () => {
      const { service, fixture, toast } = setup();
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment({ state: 'CLOSED' }),
      });
      service._monitorState.set({
        status: 'success',
        monitor: buildMonitor({ state: 'CLOSED', total_submitted: 5 }),
      });
      service._submissionsState.set({ status: 'success', submissions: [] });
      fixture.detectChanges();
      const beforeReload = {
        a: service.loadAssessmentCalls.length,
        m: service.loadMonitorCalls.length,
        s: service.loadSubmissionsCalls.length,
      };
      // Simulate the release-results round-trip flipping the state signal to success
      service._releaseState.set({
        status: 'success',
        assessment: buildAssessment({ state: 'RELEASED' }),
      });
      fixture.detectChanges();
      // After release-state turns success, the component should re-fan the loaders + toast.
      expect(service.loadAssessmentCalls.length).toBeGreaterThan(beforeReload.a);
      expect(service.loadMonitorCalls.length).toBeGreaterThan(beforeReload.m);
      expect(service.loadSubmissionsCalls.length).toBeGreaterThan(
        beforeReload.s,
      );
      expect(
        toast.showCalls.some((t) =>
          t.message.includes('rplus.assessment_monitor.toast_released'),
        ),
      ).toBe(true);
    });

    it('on release error — surfaces the error banner with the translated key', () => {
      const { service, fixture, element } = setup();
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment({ state: 'CLOSED' }),
      });
      service._monitorState.set({
        status: 'success',
        monitor: buildMonitor({ state: 'CLOSED', total_submitted: 5 }),
      });
      service._submissionsState.set({ status: 'success', submissions: [] });
      service._releaseState.set({
        status: 'error',
        error: 'rplus.assessment_monitor.error_conflict',
      });
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="release-error"]');
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });

    it('release CTA disabled while submitting', () => {
      const { service, fixture, element } = setup();
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment({ state: 'CLOSED' }),
      });
      service._monitorState.set({
        status: 'success',
        monitor: buildMonitor({ state: 'CLOSED', total_submitted: 5 }),
      });
      service._submissionsState.set({ status: 'success', submissions: [] });
      service._releaseState.set({ status: 'submitting' });
      fixture.detectChanges();
      const cta = element.querySelector(
        '[data-testid="cta-release-results"]',
      ) as HTMLButtonElement;
      expect(cta.disabled).toBe(true);
    });
  });

  describe('Publish CTA', () => {
    it('clicking Publish fires service.publish()', () => {
      const { service, fixture, element } = setup();
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment({ state: 'DRAFT' }),
      });
      service._monitorState.set({
        status: 'success',
        monitor: buildMonitor({ state: 'DRAFT', total_submitted: 0 }),
      });
      service._submissionsState.set({ status: 'success', submissions: [] });
      fixture.detectChanges();
      (
        element.querySelector('[data-testid="cta-publish"]') as HTMLButtonElement
      ).click();
      expect(service.publishCalls).toContain(ASSESSMENT_ID);
    });
  });

  describe('Force-close CTA', () => {
    it('clicking Force-close fires service.forceClose()', () => {
      const { service, fixture, element } = setup();
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment({ state: 'OPEN' }),
      });
      service._monitorState.set({
        status: 'success',
        monitor: buildMonitor({ state: 'OPEN' }),
      });
      service._submissionsState.set({ status: 'success', submissions: [] });
      fixture.detectChanges();
      (
        element.querySelector(
          '[data-testid="cta-force-close"]',
        ) as HTMLButtonElement
      ).click();
      expect(service.forceCloseCalls).toContain(ASSESSMENT_ID);
    });
  });

  describe('Archive CTA', () => {
    it('clicking Archive opens a confirm dialog then fires service.archive() on accept', async () => {
      const { service, fixture, element, confirm } = setup();
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment({ state: 'CLOSED' }),
      });
      service._monitorState.set({
        status: 'success',
        monitor: buildMonitor({ state: 'CLOSED' }),
      });
      service._submissionsState.set({ status: 'success', submissions: [] });
      fixture.detectChanges();
      confirm.resolveValue = true;
      (
        element.querySelector('[data-testid="cta-archive"]') as HTMLButtonElement
      ).click();
      await Promise.resolve();
      await Promise.resolve();
      expect(service.archiveCalls).toContain(ASSESSMENT_ID);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Ticket B — new coverage for paths landed in today's 12-commit batch.
  // Per docs/m13/p1-spec-drift-followups-2026-05-17.md.
  // ═══════════════════════════════════════════════════════════════════════

  describe('UUID guard on assessmentId route param (1e776b6c FE-BUG-RPLUS-ROUTE-PLACEHOLDER)', () => {
    function setupWithRouteParam(rawAssessmentId: string): {
      fixture: ComponentFixture<AssessmentMonitorComponent>;
      service: StubAssessmentMonitorService;
    } {
      const service = new StubAssessmentMonitorService();
      const confirm = new StubConfirmDialogService();
      const toast = new StubToastService();
      const stubRoute = {
        snapshot: {
          paramMap: {
            get: (key: string) =>
              key === 'assessmentId' ? rawAssessmentId : null,
          },
        },
      } as unknown as ActivatedRoute;

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [AssessmentMonitorComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          { provide: ActivatedRoute, useValue: stubRoute },
          { provide: AssessmentMonitorService, useValue: service },
          { provide: ConfirmDialogService, useValue: confirm },
          { provide: ToastService, useValue: toast },
        ],
      });
      const fixture = TestBed.createComponent(AssessmentMonitorComponent);
      fixture.detectChanges();
      return { fixture, service };
    }

    it('resolves assessmentId to empty string when the route param is the literal `{id}` placeholder', () => {
      const { fixture } = setupWithRouteParam('{id}');
      expect(fixture.componentInstance.assessmentId).toBe('');
    });

    it('resolves assessmentId to empty string when the route param is URL-encoded `%7Bid%7D`', () => {
      const { fixture } = setupWithRouteParam('%7Bid%7D');
      expect(fixture.componentInstance.assessmentId).toBe('');
    });

    it('resolves assessmentId to the raw value when it is a canonical UUIDv4-shaped string', () => {
      const validUuid = '019e3145-c272-7f2d-9f73-64512b0b13e6';
      const { fixture } = setupWithRouteParam(validUuid);
      expect(fixture.componentInstance.assessmentId).toBe(validUuid);
    });

    it('does NOT fan out the three loads when the assessmentId fails the UUID guard', () => {
      const { service } = setupWithRouteParam('{id}');
      expect(service.loadAssessmentCalls.length).toBe(0);
      expect(service.loadMonitorCalls.length).toBe(0);
      expect(service.loadSubmissionsCalls.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Augmentation — view-helper methods + early-return guards + ICU resolver
  // + remaining lifecycle-effect refresh paths + errorKey precedence.
  // ═══════════════════════════════════════════════════════════════════════

  describe('view-helper methods', () => {
    it('badgeClass maps each AssessmentState to its variant fragment', () => {
      const { fixture } = setup();
      const c = fixture.componentInstance;
      expect(c.badgeClass('DRAFT')).toBe('badge-neutral');
      expect(c.badgeClass('SCHEDULED')).toBe('badge-info');
      expect(c.badgeClass('OPEN')).toBe('badge-success');
      expect(c.badgeClass('CLOSED')).toBe('badge-warning');
      expect(c.badgeClass('GRADING')).toBe('badge-info');
      expect(c.badgeClass('GRADED')).toBe('badge-info');
      expect(c.badgeClass('RELEASED')).toBe('badge-success');
      expect(c.badgeClass('ARCHIVED')).toBe('badge-neutral');
    });

    it('submissionBadgeClass maps each SubmissionState to its variant fragment', () => {
      const { fixture } = setup();
      const c = fixture.componentInstance;
      expect(c.submissionBadgeClass('IN_PROGRESS')).toBe('badge-info');
      expect(c.submissionBadgeClass('SUBMITTED')).toBe('badge-warning');
      expect(c.submissionBadgeClass('GRADING')).toBe('badge-info');
      expect(c.submissionBadgeClass('GRADED')).toBe('badge-info');
      expect(c.submissionBadgeClass('RELEASED')).toBe('badge-success');
      expect(c.submissionBadgeClass('ARCHIVED')).toBe('badge-neutral');
    });

    it('trackBySubmissionId returns the submission_id', () => {
      const { fixture } = setup();
      const sub = buildSubmission({ submission_id: SUBMISSION_ID_B });
      expect(fixture.componentInstance.trackBySubmissionId(0, sub)).toBe(
        SUBMISSION_ID_B,
      );
    });

    it('formatScore returns "0%" defensively when score_percent is null', () => {
      const { fixture } = setup();
      const sub = buildSubmission({ score_percent: null });
      expect(fixture.componentInstance.formatScore(sub)).toBe('0%');
    });

    it('formatScore returns "0%" defensively when score_percent is undefined', () => {
      const { fixture } = setup();
      const sub = buildSubmission({ score_percent: undefined });
      expect(fixture.componentInstance.formatScore(sub)).toBe('0%');
    });

    it('formatScore returns the BE-supplied percent with a "%" suffix', () => {
      const { fixture } = setup();
      const sub = buildSubmission({ score_percent: 91.25 });
      expect(fixture.componentInstance.formatScore(sub)).toBe('91.25%');
    });

    it('formatScore renders 0 (not null) as "0%"', () => {
      const { fixture } = setup();
      const sub = buildSubmission({ score_percent: 0 });
      expect(fixture.componentInstance.formatScore(sub)).toBe('0%');
    });

    it('pendingReleaseLabel returns the i18n key when translations are unloaded (fail-loud)', () => {
      const { fixture } = setup();
      expect(fixture.componentInstance.pendingReleaseLabel()).toBe(
        'rplus.assessment_monitor.score_pending_release',
      );
    });

    it('cohort() returns the loaded monitor envelope', () => {
      const { service, fixture } = setup();
      service._monitorState.set({
        status: 'success',
        monitor: buildMonitor({ total_invited: 9 }),
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.cohort()?.total_invited).toBe(9);
    });

    it('cohort() returns null when the monitor envelope is not loaded', () => {
      const { fixture } = setup();
      // default monitorState is 'loading' → monitor() is null
      expect(fixture.componentInstance.cohort()).toBeNull();
    });

    it('abandonedCount floors at 0 when started exceeds invited (drift defense)', () => {
      const { service, fixture } = setup();
      service._monitorState.set({
        status: 'success',
        monitor: buildMonitor({ total_invited: 4, total_started: 9 }),
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.abandonedCount()).toBe(0);
    });

    it('abandonedCount returns 0 when the monitor is null', () => {
      const { fixture } = setup();
      expect(fixture.componentInstance.abandonedCount()).toBe(0);
    });
  });

  describe('scoreIsPending computed', () => {
    it('is true when no assessment is loaded (currentState null)', () => {
      const { fixture } = setup();
      expect(fixture.componentInstance.scoreIsPending()).toBe(true);
      expect(fixture.componentInstance.averageScoreCardState()).toBe('pending');
    });

    it('is false only for RELEASED', () => {
      const { service, fixture } = setup();
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment({ state: 'RELEASED' }),
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.scoreIsPending()).toBe(false);
      expect(fixture.componentInstance.averageScoreCardState()).toBe('value');
    });
  });

  describe('errorKey precedence', () => {
    function loadOk(service: StubAssessmentMonitorService): void {
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment({ state: 'OPEN' }),
      });
      service._monitorState.set({ status: 'success', monitor: buildMonitor() });
      service._submissionsState.set({ status: 'success', submissions: [] });
    }

    it('surfaces the monitor error when only the monitor load fails', () => {
      const { service, fixture, element } = setup();
      loadOk(service);
      service._monitorState.set({
        status: 'error',
        error: 'rplus.assessment_monitor.error_upstream',
      });
      fixture.detectChanges();
      const banner = element.querySelector(
        '[data-testid="assessment-monitor-error"]',
      );
      expect(banner?.textContent).toContain(
        'rplus.assessment_monitor.error_upstream',
      );
      expect(fixture.componentInstance.errorKey()).toBe(
        'rplus.assessment_monitor.error_upstream',
      );
    });

    it('surfaces the submissions error when only the submissions load fails', () => {
      const { service, fixture } = setup();
      loadOk(service);
      service._submissionsState.set({
        status: 'error',
        error: 'rplus.assessment_monitor.error_not_found',
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.errorKey()).toBe(
        'rplus.assessment_monitor.error_not_found',
      );
    });

    it('errorKey is empty string when no load is in error', () => {
      const { service, fixture } = setup();
      loadOk(service);
      fixture.detectChanges();
      expect(fixture.componentInstance.errorKey()).toBe('');
    });

    it('releaseErrorKey is empty string when releaseState is not error', () => {
      const { fixture } = setup();
      // default releaseState is 'idle'
      expect(fixture.componentInstance.releaseErrorKey()).toBe('');
    });
  });

  describe('CTA early-return guards (empty assessmentId)', () => {
    function setupNoId(): {
      fixture: ComponentFixture<AssessmentMonitorComponent>;
      service: StubAssessmentMonitorService;
      confirm: StubConfirmDialogService;
    } {
      const service = new StubAssessmentMonitorService();
      const confirm = new StubConfirmDialogService();
      const toast = new StubToastService();
      const stubRoute = {
        snapshot: {
          paramMap: { get: () => '{id}' }, // fails UUID guard → empty id
        },
      } as unknown as ActivatedRoute;

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [AssessmentMonitorComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          { provide: ActivatedRoute, useValue: stubRoute },
          { provide: AssessmentMonitorService, useValue: service },
          { provide: ConfirmDialogService, useValue: confirm },
          { provide: ToastService, useValue: toast },
        ],
      });
      const fixture = TestBed.createComponent(AssessmentMonitorComponent);
      fixture.detectChanges();
      return { fixture, service, confirm };
    }

    it('publish() is a no-op when assessmentId is empty', () => {
      const { fixture, service } = setupNoId();
      fixture.componentInstance.publish();
      expect(service.publishCalls.length).toBe(0);
    });

    it('forceClose() is a no-op when assessmentId is empty', () => {
      const { fixture, service } = setupNoId();
      fixture.componentInstance.forceClose();
      expect(service.forceCloseCalls.length).toBe(0);
    });

    it('retry() is a no-op when assessmentId is empty (guarded fanOutLoad)', () => {
      const { fixture, service } = setupNoId();
      fixture.componentInstance.retry();
      expect(service.loadAssessmentCalls.length).toBe(0);
    });

    it('openReleaseConfirm() does NOT open the dialog when assessmentId is empty', async () => {
      const { fixture, confirm } = setupNoId();
      await fixture.componentInstance.openReleaseConfirm();
      expect(confirm.confirmCalls.length).toBe(0);
    });

    it('openArchiveConfirm() does NOT open the dialog when assessmentId is empty', async () => {
      const { fixture, confirm } = setupNoId();
      await fixture.componentInstance.openArchiveConfirm();
      expect(confirm.confirmCalls.length).toBe(0);
    });
  });

  describe('openReleaseConfirm releaseEnabled guard', () => {
    it('does NOT open the dialog when release is not enabled (state not CLOSED)', async () => {
      const { service, fixture, confirm } = setup();
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment({ state: 'OPEN' }),
      });
      // OPEN monitor → isReleaseEnabled returns false (requires CLOSED)
      service._monitorState.set({
        status: 'success',
        monitor: buildMonitor({ state: 'OPEN', total_submitted: 5 }),
      });
      service._submissionsState.set({ status: 'success', submissions: [] });
      fixture.detectChanges();
      await fixture.componentInstance.openReleaseConfirm();
      expect(confirm.confirmCalls.length).toBe(0);
      expect(service.releaseResultsCalls.length).toBe(0);
    });

    it('does NOT open the dialog when CLOSED but zero submitted', async () => {
      const { service, fixture, confirm } = setup();
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment({ state: 'CLOSED' }),
      });
      service._monitorState.set({
        status: 'success',
        monitor: buildMonitor({ state: 'CLOSED', total_submitted: 0 }),
      });
      service._submissionsState.set({ status: 'success', submissions: [] });
      fixture.detectChanges();
      await fixture.componentInstance.openReleaseConfirm();
      expect(confirm.confirmCalls.length).toBe(0);
    });
  });

  describe('openReleaseConfirm ICU plural resolution', () => {
    function setClosed(service: StubAssessmentMonitorService, submitted: number): void {
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment({ state: 'CLOSED' }),
      });
      service._monitorState.set({
        status: 'success',
        monitor: buildMonitor({ state: 'CLOSED', total_submitted: submitted }),
      });
      service._submissionsState.set({ status: 'success', submissions: [] });
    }

    it('picks the =1 branch and interpolates {count} when count is 1', async () => {
      const { service, fixture, confirm } = setup();
      const translate = TestBed.inject(TranslateService);
      vi.spyOn(translate, 'instant').mockReturnValue(
        '{count, plural, =1 {Release results to {count} learner?} other {Release results to {count} learners?}}',
      );
      setClosed(service, 1);
      fixture.detectChanges();
      await fixture.componentInstance.openReleaseConfirm();
      expect(confirm.confirmCalls.length).toBe(1);
      expect(confirm.confirmCalls[0].message).toBe(
        'Release results to 1 learner?',
      );
    });

    it('picks the other branch and interpolates {count} when count is plural', async () => {
      const { service, fixture, confirm } = setup();
      const translate = TestBed.inject(TranslateService);
      vi.spyOn(translate, 'instant').mockReturnValue(
        '{count, plural, =1 {Release results to {count} learner?} other {Release results to {count} learners?}}',
      );
      setClosed(service, 7);
      fixture.detectChanges();
      await fixture.componentInstance.openReleaseConfirm();
      expect(confirm.confirmCalls[0].message).toBe(
        'Release results to 7 learners?',
      );
    });

    it('substitutes {count} for a non-ICU template that contains the placeholder', async () => {
      const { service, fixture, confirm } = setup();
      const translate = TestBed.inject(TranslateService);
      vi.spyOn(translate, 'instant').mockReturnValue(
        'Releasing for {count} submissions.',
      );
      setClosed(service, 4);
      fixture.detectChanges();
      await fixture.componentInstance.openReleaseConfirm();
      expect(confirm.confirmCalls[0].message).toBe(
        'Releasing for 4 submissions.',
      );
    });

    it('appends |count for a non-ICU template lacking the placeholder (unloaded-key fallback)', async () => {
      const { service, fixture, confirm } = setup();
      // Real TranslateService.instant returns the key (no translations loaded),
      // which contains no `{count}` → resolver appends `|count` for transparency.
      setClosed(service, 3);
      fixture.detectChanges();
      await fixture.componentInstance.openReleaseConfirm();
      expect(confirm.confirmCalls[0].message).toBe(
        'rplus.release_confirm.body|3',
      );
    });
  });

  describe('lifecycle success-effect refresh (publish / forceClose / archive)', () => {
    function loadOpen(service: StubAssessmentMonitorService): void {
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment({ state: 'OPEN' }),
      });
      service._monitorState.set({
        status: 'success',
        monitor: buildMonitor({ state: 'OPEN' }),
      });
      service._submissionsState.set({ status: 'success', submissions: [] });
    }

    it('publish success re-fans the three loaders', () => {
      const { service, fixture } = setup();
      loadOpen(service);
      fixture.detectChanges();
      const before = service.loadAssessmentCalls.length;
      service._publishState.set({
        status: 'success',
        assessment: buildAssessment({ state: 'SCHEDULED' }),
      });
      fixture.detectChanges();
      expect(service.loadAssessmentCalls.length).toBeGreaterThan(before);
    });

    it('forceClose success re-fans the three loaders', () => {
      const { service, fixture } = setup();
      loadOpen(service);
      fixture.detectChanges();
      const before = service.loadMonitorCalls.length;
      service._forceCloseState.set({
        status: 'success',
        assessment: buildAssessment({ state: 'CLOSED' }),
      });
      fixture.detectChanges();
      expect(service.loadMonitorCalls.length).toBeGreaterThan(before);
    });

    it('archive success re-fans the three loaders', () => {
      const { service, fixture } = setup();
      loadOpen(service);
      fixture.detectChanges();
      const before = service.loadSubmissionsCalls.length;
      service._archiveState.set({
        status: 'success',
        assessment: buildAssessment({ state: 'ARCHIVED' }),
      });
      fixture.detectChanges();
      expect(service.loadSubmissionsCalls.length).toBeGreaterThan(before);
    });
  });

  describe('breadcrumb + grading-queue link', () => {
    it('renders the grading-queue link when assessmentId is present', () => {
      const { element } = setup();
      const link = element.querySelector(
        '[data-testid="assessment-monitor-grading-queue-link"]',
      );
      expect(link).toBeTruthy();
    });

    it('shows a pending-review count on the grading-queue CTA when submissions await review', () => {
      const { service, fixture, element } = setup();
      service._submissionsState.set({
        status: 'success',
        submissions: [
          buildSubmission({ state: 'GRADED', review_status: 'PENDING_REVIEW' }),
          buildSubmission({ state: 'GRADED', review_status: 'PENDING_REVIEW' }),
        ],
      });
      fixture.detectChanges();
      const count = element.querySelector(
        '[data-testid="grading-queue-pending-count"]',
      );
      expect(count).toBeTruthy();
      expect(count?.textContent ?? '').toContain('2');
    });
  });

  describe('questions panel', () => {
    function buildMonitorTestSet(
      overrides: Partial<MonitorTestSet> = {},
    ): MonitorTestSet {
      return {
        test_set_id: '01985e7f-1234-7abc-8def-000000000a01',
        title: 'Agile Estimation — Mid-Term',
        total_points: 20,
        question_count: 2,
        questions: [
          {
            test_set_question_id: 'tsq-1',
            question_id: 'q-1',
            question_atom_id: 'atom-1',
            question_type: 'mcq',
            points: 10,
            display_order: 1,
            snapshot: {
              question_type: 'mcq',
              prompt_preview: 'What is the Open-Closed Principle?',
            },
          },
          {
            test_set_question_id: 'tsq-2',
            question_id: 'q-2',
            question_atom_id: 'atom-2',
            question_type: 'oe',
            points: 10,
            display_order: 2,
            snapshot: {
              question_type: 'oe',
              prompt_preview: 'Explain dependency inversion.',
            },
          },
        ],
        ...overrides,
      };
    }

    it('loads the assigned test-set once the assessment resolves test_set_id', () => {
      const { service, fixture } = setup();
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment(),
      });
      fixture.detectChanges();
      expect(service.loadTestSetCalls).toContain(
        '01985e7f-1234-7abc-8def-000000000a01',
      );
    });

    it('renders a question row per test-set question', () => {
      const { service, fixture, element } = setup();
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment(),
      });
      service._monitorState.set({ status: 'success', monitor: buildMonitor() });
      service._submissionsState.set({ status: 'success', submissions: [] });
      service._testSetState.set({
        status: 'success',
        testSet: buildMonitorTestSet(),
      });
      fixture.detectChanges();

      const panel = element.querySelector(
        '[data-testid="assessment-monitor-questions"]',
      );
      expect(panel).toBeTruthy();
      const rows = element.querySelectorAll(
        '[data-testid^="monitor-question-"]',
      );
      expect(rows.length).toBe(2);
      expect(element.textContent).toContain(
        'What is the Open-Closed Principle?',
      );
    });

    it('hydrates + reveals each question answer key', () => {
      const { service, fixture, element } = setup();
      service.questionReviewStub = {
        question_type: 'mcq',
        options: [
          {
            option_id: 'opt_1',
            label: 'Correct',
            is_correct: true,
            explainer: 'Because.',
          },
        ],
        model_answer: null,
        rubric: [],
        question_image_url: null,
        answer_image_url: null,
      };
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment(),
      });
      service._monitorState.set({ status: 'success', monitor: buildMonitor() });
      service._submissionsState.set({ status: 'success', submissions: [] });
      service._testSetState.set({
        status: 'success',
        testSet: buildMonitorTestSet(),
      });
      fixture.detectChanges();

      expect(service.getQuestionDetailCalls.length).toBe(2);
      const review = element.querySelector(
        '[data-testid="monitor-q-tsq-1-review"]',
      );
      expect(review).toBeTruthy();
      const correct = element.querySelector(
        '[data-testid="monitor-q-tsq-1-option-opt_1"]',
      );
      expect(correct?.getAttribute('data-is-correct')).toBe('true');
    });

    it('falls back to the projection prompt for the stem when snapshot lacks one', () => {
      const { service, fixture, element } = setup();
      service.questionReviewStub = {
        question_type: 'mcq',
        prompt: 'Recovered stem from the answer-key projection.',
        options: [],
        model_answer: null,
        rubric: [],
        question_image_url: null,
        answer_image_url: null,
      };
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment(),
      });
      service._monitorState.set({ status: 'success', monitor: buildMonitor() });
      service._submissionsState.set({ status: 'success', submissions: [] });
      service._testSetState.set({
        status: 'success',
        testSet: buildMonitorTestSet({
          questions: [
            {
              test_set_question_id: 'tsq-1',
              question_id: 'q-1',
              question_atom_id: 'atom-1',
              question_type: 'mcq',
              points: 10,
              display_order: 1,
              // snapshot intentionally omitted (pre-snapshot test-set)
            },
          ],
        }),
      });
      fixture.detectChanges();
      expect(element.textContent).toContain(
        'Recovered stem from the answer-key projection.',
      );
    });

    it('shows a fail-soft note when the test-set load errors', () => {
      const { service, fixture, element } = setup();
      service._assessmentState.set({
        status: 'success',
        assessment: buildAssessment(),
      });
      service._monitorState.set({ status: 'success', monitor: buildMonitor() });
      service._submissionsState.set({ status: 'success', submissions: [] });
      service._testSetState.set({
        status: 'error',
        error: 'rplus.assessment_monitor.questions_error',
      });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="questions-error"]'),
      ).toBeTruthy();
    });
  });
});
