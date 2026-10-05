import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';

import { MeAssessmentResultComponent } from './me-assessment-result.component';
import { MeAssessmentsService } from '../me-assessments.service';
import type { ResultState } from '../me-assessments.model';

/** MeAssessmentResultComponent spec — Phase X.3.3 (result polling). */

const ASSESSMENT_ID = '01985e7f-1234-7abc-8def-000000000a01';
const SUBMISSION_ID = '01985e7f-1234-7abc-8def-000000000601';

class StubMeAssessmentsService {
  readonly _resultState: WritableSignal<ResultState> = signal<ResultState>({
    status: 'loading',
  });
  readonly resultState = this._resultState.asReadonly();
  loadResultCalls: { aid: string; sid: string }[] = [];
  loadResult(aid: string, sid: string): void {
    this.loadResultCalls.push({ aid, sid });
  }

  /**
   * Result component parallel-loads the assessment detail so the per-
   * question grade rows can render `prompt.stem` alongside the score
   * breakdown (FE-BUG-RESULT-STEM-MISSING fix, 2026-05-17 smoke).
   * The stub returns a frozen empty detail so the template's `@if (stem)`
   * gate short-circuits and the rest of the assertions keep passing.
   */
  readonly detail = signal<null>(null).asReadonly();
  loadAssessmentCalls: string[] = [];
  loadAssessment(aid: string): void {
    this.loadAssessmentCalls.push(aid);
  }
}

function setup(): {
  fixture: ComponentFixture<MeAssessmentResultComponent>;
  component: MeAssessmentResultComponent;
  element: HTMLElement;
  service: StubMeAssessmentsService;
} {
  const service = new StubMeAssessmentsService();
  TestBed.configureTestingModule({
    imports: [MeAssessmentResultComponent],
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
              get: (k: string) => {
                if (k === 'assessmentId') return ASSESSMENT_ID;
                if (k === 'submissionId') return SUBMISSION_ID;
                return null;
              },
            },
            queryParamMap: {
              get: () => null,
            },
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(MeAssessmentResultComponent);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
    service,
  };
}

describe('MeAssessmentResultComponent (Phase X.3.3)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('init / load', () => {
    it('creates', () => {
      const { component } = setup();
      expect(component).toBeTruthy();
    });

    it('fires service.loadResult() on mount', () => {
      const { service } = setup();
      expect(service.loadResultCalls.length).toBeGreaterThanOrEqual(1);
      expect(service.loadResultCalls[0].aid).toBe(ASSESSMENT_ID);
      expect(service.loadResultCalls[0].sid).toBe(SUBMISSION_ID);
    });

    it('renders skeleton while loading', () => {
      const { element } = setup();
      expect(
        element.querySelector('[data-testid="me-result-loading"]'),
      ).toBeTruthy();
    });
  });

  describe('PENDING_RELEASE branch', () => {
    it('renders the holding panel when state=pending', () => {
      const { service, fixture, element } = setup();
      service._resultState.set({
        status: 'pending',
        message:
          'Your submission has been graded. Results will be released by your instructor.',
      });
      fixture.detectChanges();
      const panel = element.querySelector('[data-testid="me-result-pending"]');
      expect(panel).toBeTruthy();
      expect(panel?.textContent).toContain('Your submission has been graded');
    });

    it('does NOT render the released body when pending', () => {
      const { service, fixture, element } = setup();
      service._resultState.set({ status: 'pending', message: '...' });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="me-result-released"]'),
      ).toBeNull();
    });
  });

  describe('RELEASED branch — MCQ rows', () => {
    function setupReleased() {
      const ctx = setup();
      ctx.service._resultState.set({
        status: 'released',
        result: {
          submission_id: SUBMISSION_ID,
          total_points_earned: 8,
          total_points_possible: 10,
          passing_threshold_percent: 70,
          passed: true,
          per_question_grades: [
            {
              test_set_question_id: 'tsq-1',
              question_id: 'q-1',
              question_type: 'mcq',
              points_earned: 8,
              points_possible: 10,
              correct: true,
              grading_dispatch: 'DETERMINISTIC',
              learner_answer: { mcq_choice_id: 'opt-a' },
              mcq_post_grade: {
                options: [
                  {
                    option_id: 'opt-a',
                    label: 'A',
                    text: 'Story points',
                    is_correct: true,
                  },
                  {
                    option_id: 'opt-b',
                    label: 'B',
                    text: 'T-shirt sizing',
                    is_correct: false,
                  },
                ],
              },
            },
          ],
          released_at: '2026-05-20T16:00:00Z',
        },
      });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('renders the released container', () => {
      const { element } = setupReleased();
      expect(
        element.querySelector('[data-testid="me-result-released"]'),
      ).toBeTruthy();
    });

    it('renders total points earned / possible', () => {
      const { element } = setupReleased();
      const score = element.querySelector('[data-testid="me-result-score"]');
      expect(score?.textContent).toContain('8');
      expect(score?.textContent).toContain('10');
    });

    it('renders passed badge when passed=true', () => {
      const { element } = setupReleased();
      const badge = element.querySelector(
        '[data-testid="me-result-passed-badge"]',
      );
      expect(badge).toBeTruthy();
      expect(badge?.getAttribute('data-passed')).toBe('true');
    });

    it('renders MCQ row with learner answer, correct mark, points', () => {
      const { element } = setupReleased();
      const row = element.querySelector(
        '[data-testid="me-result-row-tsq-1"]',
      ) as HTMLElement;
      expect(row).toBeTruthy();
      expect(row.getAttribute('data-question-type')).toBe('mcq');
      expect(
        row.querySelector('[data-testid="me-result-row-learner-answer"]')
          ?.textContent,
      ).toContain('A');
      expect(
        row.querySelector('[data-testid="me-result-row-correct-mark"]')
          ?.getAttribute('data-correct'),
      ).toBe('true');
      expect(
        row.querySelector('[data-testid="me-result-row-points"]')?.textContent,
      ).toContain('8');
    });

    it('marks the correct option in mcq_post_grade.options', () => {
      const { element } = setupReleased();
      const correct = element.querySelector(
        '[data-testid="me-result-row-tsq-1"] [data-testid="me-result-option-opt-a"]',
      );
      expect(correct?.getAttribute('data-is-correct')).toBe('true');
      const incorrect = element.querySelector(
        '[data-testid="me-result-row-tsq-1"] [data-testid="me-result-option-opt-b"]',
      );
      expect(incorrect?.getAttribute('data-is-correct')).toBe('false');
    });

    it('flags the learner-picked option with data-selected on the reveal', () => {
      // tsq-1 fixture: learner picked opt-a (the correct one).
      const { element } = setupReleased();
      const picked = element.querySelector(
        '[data-testid="me-result-row-tsq-1"] [data-testid="me-result-option-opt-a"]',
      );
      const notPicked = element.querySelector(
        '[data-testid="me-result-row-tsq-1"] [data-testid="me-result-option-opt-b"]',
      );
      expect(picked?.getAttribute('data-selected')).toBe('true');
      expect(notPicked?.getAttribute('data-selected')).toBe('false');
    });

    it('tints the YOUR ANSWER summary box by correctness (correct → data-correct=true)', () => {
      const { element } = setupReleased();
      const box = element.querySelector(
        '[data-testid="me-result-row-tsq-1"] [data-testid="me-result-row-learner-answer"]',
      );
      expect(box?.getAttribute('data-correct')).toBe('true');
    });
  });

  describe('RELEASED branch — chosen WRONG option indicator', () => {
    function setupReleasedWrongPick() {
      const ctx = setup();
      ctx.service._resultState.set({
        status: 'released',
        result: {
          submission_id: SUBMISSION_ID,
          total_points_earned: 0,
          total_points_possible: 10,
          passing_threshold_percent: 70,
          passed: false,
          per_question_grades: [
            {
              test_set_question_id: 'tsq-w',
              question_id: 'q-w',
              question_type: 'mcq',
              points_earned: 0,
              points_possible: 10,
              correct: false,
              grading_dispatch: 'DETERMINISTIC',
              learner_answer: { mcq_choice_id: 'opt-b' },
              mcq_post_grade: {
                options: [
                  { option_id: 'opt-a', label: 'A', text: 'Right', is_correct: true },
                  { option_id: 'opt-b', label: 'B', text: 'Wrong', is_correct: false },
                ],
              },
            },
          ],
        },
      });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('marks the chosen wrong option selected + not-correct, and the correct one as the answer', () => {
      const { element } = setupReleasedWrongPick();
      const chosenWrong = element.querySelector(
        '[data-testid="me-result-row-tsq-w"] [data-testid="me-result-option-opt-b"]',
      );
      const theAnswer = element.querySelector(
        '[data-testid="me-result-row-tsq-w"] [data-testid="me-result-option-opt-a"]',
      );
      expect(chosenWrong?.getAttribute('data-selected')).toBe('true');
      expect(chosenWrong?.getAttribute('data-is-correct')).toBe('false');
      expect(chosenWrong?.classList.contains('is-wrong')).toBe(true);
      expect(theAnswer?.getAttribute('data-selected')).toBe('false');
      expect(theAnswer?.getAttribute('data-is-correct')).toBe('true');
    });

    it('tints the YOUR ANSWER summary box red (data-correct=false) on a wrong pick', () => {
      const { element } = setupReleasedWrongPick();
      const box = element.querySelector(
        '[data-testid="me-result-row-tsq-w"] [data-testid="me-result-row-learner-answer"]',
      );
      expect(box?.getAttribute('data-correct')).toBe('false');
    });

    it('isOptionSelected() resolves single + multi choice shapes', () => {
      const { component } = setupReleasedWrongPick();
      const g = component.grades()[0];
      expect(component.isOptionSelected(g, 'opt-b')).toBe(true);
      expect(component.isOptionSelected(g, 'opt-a')).toBe(false);
      // multi-choice shape
      const multi = {
        ...g,
        learner_answer: { mcq_choice_ids: ['opt-a', 'opt-b'] },
      };
      expect(component.isOptionSelected(multi, 'opt-a')).toBe(true);
      expect(component.isOptionSelected(multi, 'opt-c')).toBe(false);
    });
  });

  describe('RELEASED branch — MCQ row without learner_answer', () => {
    // E2E-BE-RESULT-LEARNER-ANSWER landed in BE ack 44a097a3 (smoke 2026-05-17).
    // The earlier INFERRED fallback (path 3 — derive learner pick from
    // is_correct + points_earned) is now obsolete. When the BE omits
    // learner_answer the FE must render "No answer" via the template's
    // @else branch — never invent a pick from the grading verdict.
    function setupReleasedNoLearnerAnswer() {
      const ctx = setup();
      ctx.service._resultState.set({
        status: 'released',
        result: {
          submission_id: SUBMISSION_ID,
          total_points_earned: 8,
          total_points_possible: 10,
          passing_threshold_percent: 70,
          passed: true,
          per_question_grades: [
            {
              test_set_question_id: 'tsq-3',
              question_id: 'q-3',
              question_type: 'mcq',
              points_earned: 8,
              points_possible: 10,
              correct: true,
              grading_dispatch: 'DETERMINISTIC',
              // learner_answer intentionally omitted — exercises the
              // path-3 deletion: BE no longer needs to be inferred from.
              mcq_post_grade: {
                options: [
                  {
                    option_id: 'opt-a',
                    label: 'A',
                    text: 'Story points',
                    is_correct: true,
                  },
                  {
                    option_id: 'opt-b',
                    label: 'B',
                    text: 'T-shirt sizing',
                    is_correct: false,
                  },
                ],
              },
            },
          ],
        },
      });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('mcqAnswerDisplay() returns null when learner_answer is omitted', () => {
      const { component } = setupReleasedNoLearnerAnswer();
      const grade = component.grades()[0];
      expect(component.mcqAnswerDisplay(grade)).toBeNull();
    });

    it('renders the "No answer" template branch (not the inferred option)', () => {
      const { element } = setupReleasedNoLearnerAnswer();
      const answerCell = element.querySelector(
        '[data-testid="me-result-row-tsq-3"] [data-testid="me-result-row-learner-answer"]',
      ) as HTMLElement;
      expect(answerCell).toBeTruthy();
      // The @else branch renders the translate key; ensure we do NOT
      // surface the correct option's label/text from is_correct inference.
      expect(answerCell.querySelector('em')).toBeTruthy();
      expect(answerCell.textContent).not.toContain('Story points');
    });
  });

  describe('RELEASED branch — OE rows', () => {
    function setupReleasedWithOe() {
      const ctx = setup();
      ctx.service._resultState.set({
        status: 'released',
        result: {
          submission_id: SUBMISSION_ID,
          total_points_earned: 0,
          total_points_possible: 10,
          passing_threshold_percent: 70,
          passed: false,
          per_question_grades: [
            {
              test_set_question_id: 'tsq-2',
              question_id: 'q-2',
              question_type: 'oe',
              points_earned: 0,
              points_possible: 10,
              grading_dispatch: 'LLM_EVALUATOR',
              learner_answer: { oe_response_text: 'Planning poker is...' },
              oe_batch_pending: true,
            },
          ],
        },
      });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('renders OE row with the OE_BATCH_PENDING chip', () => {
      const { element } = setupReleasedWithOe();
      const row = element.querySelector(
        '[data-testid="me-result-row-tsq-2"]',
      ) as HTMLElement;
      expect(row.getAttribute('data-question-type')).toBe('oe');
      const chip = row.querySelector('[data-testid="me-result-oe-pending"]');
      expect(chip).toBeTruthy();
      expect(chip?.textContent).toContain('OE_BATCH_PENDING');
    });

    it('shows the learner OE response text', () => {
      const { element } = setupReleasedWithOe();
      const row = element.querySelector(
        '[data-testid="me-result-row-tsq-2"]',
      ) as HTMLElement;
      expect(
        row.querySelector('[data-testid="me-result-row-learner-answer"]')
          ?.textContent,
      ).toContain('Planning poker is...');
    });
  });

  describe('error branch', () => {
    it('renders role=alert error banner on 5xx', () => {
      const { service, fixture, element } = setup();
      service._resultState.set({
        status: 'error',
        error: 'aplus.me_assessments.result.error_upstream',
      });
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="me-result-error"]');
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });

    it('retry CTA re-fires service.loadResult()', () => {
      const { service, fixture, element } = setup();
      service._resultState.set({
        status: 'error',
        error: 'aplus.me_assessments.result.error_generic',
      });
      fixture.detectChanges();
      const before = service.loadResultCalls.length;
      (
        element.querySelector(
          '[data-testid="me-result-retry"]',
        ) as HTMLButtonElement
      ).click();
      expect(service.loadResultCalls.length).toBe(before + 1);
    });
  });

  describe('polling', () => {
    it('exposes startPolling() / stopPolling() public surface', () => {
      const { component } = setup();
      expect(typeof component.startPolling).toBe('function');
      expect(typeof component.stopPolling).toBe('function');
    });

    it('manually firing one poll tick re-calls loadResult()', () => {
      const { component, service } = setup();
      const before = service.loadResultCalls.length;
      component.firePollTick();
      expect(service.loadResultCalls.length).toBe(before + 1);
    });

    // ── Deterministic clock ────────────────────────────────────────
    //
    // These two used real timers and real sleeps against a real setInterval,
    // which is a RACE, not a slow test. The second one failed on main as
    // "expected 3 to be 2" under load 35 to 56 and passed on re-run at 17.
    //
    // ⚠ A BIGGER TIMEOUT MAKES THIS WORSE, NOT BETTER. The assertion is a
    // COUNT: more time is more room for another interval to fire, so a budget
    // raises the failure rate. Only an exact clock fixes a count.
    //
    // `setup()` runs BEFORE the fake clock is installed, so TestBed and
    // component creation keep real timers; only the polling interval under
    // test is faked. Every test restores real timers in a finally, because a
    // leaked fake clock would silently break every spec that runs after it in
    // the same file.
    it('polls exactly once per interval while pending', () => {
      const { component, service } = setup();
      vi.useFakeTimers();
      try {
        service._resultState.set({ status: 'pending', message: 'pending' });
        const before = service.loadResultCalls.length;
        component.startPolling(50);
        vi.advanceTimersByTime(150);
        component.stopPolling();
        // EXACTLY three, not "at least three". The old assertion was
        // toBeGreaterThanOrEqual(3) because a real clock cannot promise the
        // count; a fake one can, so the test now says what it means.
        expect(service.loadResultCalls.length).toBe(before + 3);
      } finally {
        vi.useRealTimers();
      }
    });

    it('stops polling automatically when state flips to released', () => {
      const { fixture, component, service } = setup();
      vi.useFakeTimers();
      try {
        service._resultState.set({ status: 'pending', message: 'pending' });
        component.startPolling(50);
        vi.advanceTimersByTime(100);
        service._resultState.set({
          status: 'released',
          result: {
            submission_id: SUBMISSION_ID,
            total_points_earned: 1,
            total_points_possible: 1,
            passing_threshold_percent: 0,
            passed: true,
            per_question_grades: [],
          },
        });
        // THE FIX FOR THE RACE: flush the effect that calls stopPolling()
        // BEFORE snapshotting. The old test snapshotted immediately after
        // set(), so a tick could land between the snapshot and the effect
        // actually stopping the interval, and the count came back one high.
        fixture.detectChanges();
        const callsAtRelease = service.loadResultCalls.length;
        // Ten intervals' worth. On a real clock this would be flaky in the
        // other direction; on a fake one it is simply proof that nothing
        // further fires.
        vi.advanceTimersByTime(500);
        expect(service.loadResultCalls.length).toBe(callsAtRelease);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
