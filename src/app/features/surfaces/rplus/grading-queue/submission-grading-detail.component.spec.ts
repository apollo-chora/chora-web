import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { SubmissionGradingDetailComponent } from './submission-grading-detail.component';
import { GradingReviewService } from './grading-review.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../environments/environment';
import type {
  GradingReviewDetail,
  GradingReviewQuestion,
} from './grading-review.model';

const AID = 'assess-001';
const SID = 'sub-001';

const GRADING_URL = `${environment.bffBaseUrl}/api/v1/assessments/${AID}/submissions/${SID}/grading`;
const GRADES_URL = `${environment.bffBaseUrl}/api/v1/assessments/${AID}/submissions/${SID}/grades`;
const OVERALL_URL = `${environment.bffBaseUrl}/api/v1/assessments/${AID}/submissions/${SID}/overall-comment`;
const APPROVE_URL = `${environment.bffBaseUrl}/api/v1/assessments/${AID}/submissions/${SID}/approve`;

function mcqQuestion(
  overrides: Partial<GradingReviewQuestion> = {},
): GradingReviewQuestion {
  return {
    test_set_question_id: 'tsq-mcq-1',
    question_id: 'q-mcq-1',
    question_type: 'mcq',
    grading_dispatch: 'DETERMINISTIC',
    points_earned: 1,
    points_possible: 1,
    prompt: 'What is 2 + 2?',
    correct: true,
    learner_answer: { mcq_choice_id: 'choice-b' },
    ...overrides,
  };
}

function oeQuestion(
  overrides: Partial<GradingReviewQuestion> = {},
): GradingReviewQuestion {
  return {
    test_set_question_id: 'tsq-oe-1',
    question_id: 'q-oe-1',
    question_type: 'oe',
    grading_dispatch: 'LLM_EVALUATOR',
    points_earned: 7,
    points_possible: 10,
    prompt: 'Explain photosynthesis.',
    score_provenance: 'AI',
    comment: 'Good but incomplete.',
    comment_provenance: 'AI',
    model_answer: 'Plants convert light to energy.',
    model_answer_provenance: 'AI',
    learner_answer: { oe_response_text: 'Plants make food from sunlight.' },
    criterion_scores: [
      {
        criterion_id: 'crit-1',
        title: 'Accuracy',
        score: 3,
        max_score: 5,
        feedback: 'Mostly right.',
      },
    ],
    rubric: [
      {
        criterion_id: 'crit-1',
        title: 'Accuracy',
        description: 'Is the answer factually correct?',
      },
    ],
    ...overrides,
  };
}

function detailFixture(
  overrides: Partial<GradingReviewDetail> = {},
): GradingReviewDetail {
  return {
    submission_id: SID,
    assessment_id: AID,
    learner_gcid: 'gcid-learner-1',
    attempt_number: 1,
    state: 'GRADED',
    review_status: 'PENDING_REVIEW',
    total_points_earned: 8,
    total_points_possible: 11,
    passing_threshold_percent: 50,
    passed: true,
    overall_comment: 'Solid attempt overall.',
    overall_comment_provenance: 'AI',
    questions: [mcqQuestion(), oeQuestion()],
    ...overrides,
  };
}

interface Built {
  fixture: ComponentFixture<SubmissionGradingDetailComponent>;
  httpMock: HttpTestingController;
  component: SubmissionGradingDetailComponent;
  element: HTMLElement;
  service: GradingReviewService;
}

/** Configure + create the component with required inputs, then flush GET. */
function setup(detail: GradingReviewDetail | null = detailFixture()): Built {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SubmissionGradingDetailComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });

  // Root singleton service — reset its shared state so prior tests don't leak.
  const service = TestBed.inject(GradingReviewService);
  service.clearDetail();
  service.clearBulkStates();

  const fixture = TestBed.createComponent(SubmissionGradingDetailComponent);
  fixture.componentRef.setInput('assessmentId', AID);
  fixture.componentRef.setInput('submissionId', SID);

  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges(); // runs constructor effect → GET .../grading

  if (detail !== null) {
    httpMock.expectOne(GRADING_URL).flush(detail);
    fixture.detectChanges();
  }

  return {
    fixture,
    httpMock,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
    service,
  };
}

describe('SubmissionGradingDetailComponent', () => {
  describe('shell + load lifecycle', () => {
    it('creates and issues the grading GET on input resolution', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [SubmissionGradingDetailComponent],
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const service = TestBed.inject(GradingReviewService);
      service.clearDetail();
      const fixture = TestBed.createComponent(
        SubmissionGradingDetailComponent,
      );
      fixture.componentRef.setInput('assessmentId', AID);
      fixture.componentRef.setInput('submissionId', SID);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();

      const req = httpMock.expectOne(GRADING_URL);
      expect(req.request.method).toBe('GET');
      req.flush(detailFixture());
      fixture.detectChanges();

      expect(fixture.componentInstance).toBeTruthy();
      httpMock.verify();
    });

    it('renders the loading state before the GET resolves', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [SubmissionGradingDetailComponent],
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const service = TestBed.inject(GradingReviewService);
      service.clearDetail();
      const fixture = TestBed.createComponent(
        SubmissionGradingDetailComponent,
      );
      fixture.componentRef.setInput('assessmentId', AID);
      fixture.componentRef.setInput('submissionId', SID);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-testid="grading-detail-loading"]'),
      ).not.toBeNull();
      expect(fixture.componentInstance.isLoading()).toBe(true);

      httpMock.expectOne(GRADING_URL).flush(detailFixture());
      httpMock.verify();
    });

    it('renders the detail body once loaded', () => {
      const { element, component } = setup();
      expect(
        element.querySelector('[data-testid="submission-grading-detail"]'),
      ).not.toBeNull();
      expect(component.isLoading()).toBe(false);
      expect(component.isError()).toBe(false);
      expect(component.detail()).not.toBeNull();
    });

    it('applies the surface-rplus accent on the root aside', () => {
      const { element } = setup();
      const root = element.querySelector(
        '[data-testid="submission-grading-detail"]',
      );
      expect(root?.className).toContain('surface-rplus');
    });
  });

  describe('error + retry', () => {
    it('renders the error state and maps a 404 to the not-found key', () => {
      const { fixture, httpMock, component, element } = setup(null);
      httpMock
        .expectOne(GRADING_URL)
        .flush({ error: 'nope' }, { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      expect(component.isError()).toBe(true);
      expect(component.errorKey()).toBe('rplus.grading_queue.error_not_found');
      const err = element.querySelector(
        '[data-testid="grading-detail-error"]',
      );
      expect(err).not.toBeNull();
      expect(err?.textContent).toContain(
        'rplus.grading_queue.error_not_found',
      );
      httpMock.verify();
    });

    it('maps a 500 to the upstream error key', () => {
      const { fixture, httpMock, component } = setup(null);
      httpMock
        .expectOne(GRADING_URL)
        .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(component.errorKey()).toBe('rplus.grading_queue.error_upstream');
      httpMock.verify();
    });

    it('retry() re-issues the grading GET', () => {
      const { fixture, httpMock, component, element } = setup(null);
      httpMock
        .expectOne(GRADING_URL)
        .flush({ error: 'nope' }, { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      const retryBtn = element.querySelector(
        '[data-testid="grading-detail-retry"]',
      ) as HTMLButtonElement;
      retryBtn.click();
      fixture.detectChanges();

      const retryReq = httpMock.expectOne(GRADING_URL);
      expect(retryReq.request.method).toBe('GET');
      retryReq.flush(detailFixture());
      fixture.detectChanges();

      expect(component.isError()).toBe(false);
      expect(component.detail()).not.toBeNull();
      httpMock.verify();
    });
  });

  describe('summary + rows render', () => {
    it('shows the review-status key and the total points', () => {
      const { element } = setup();
      const status = element.querySelector(
        '[data-testid="grading-detail-review-status"]',
      );
      expect(status?.textContent).toContain(
        'rplus.grading_queue.review_status_PENDING_REVIEW',
      );
      const total = element.querySelector(
        '[data-testid="grading-detail-total"]',
      );
      expect(total?.textContent).toContain('8');
      expect(total?.textContent).toContain('11');
    });

    it('renders one article per question (mcq + oe)', () => {
      const { element } = setup();
      const mcq = element.querySelector(
        '[data-testid="grading-detail-q-tsq-mcq-1"]',
      );
      const oe = element.querySelector(
        '[data-testid="grading-detail-q-tsq-oe-1"]',
      );
      expect(mcq).not.toBeNull();
      expect(oe).not.toBeNull();
    });

    it('renders the MCQ deterministic outcome read-only (correct)', () => {
      const { element } = setup();
      const outcome = element.querySelector(
        '[data-testid="grading-detail-mcq-outcome-tsq-mcq-1"]',
      );
      expect(outcome?.textContent).toContain(
        'rplus.grading_queue.mcq_correct',
      );
      expect(
        outcome?.classList.contains('grading-q__mcq-outcome--correct'),
      ).toBe(true);
    });

    it('renders the MCQ incorrect outcome variant', () => {
      const { element } = setup(
        detailFixture({
          questions: [mcqQuestion({ correct: false, points_earned: 0 })],
        }),
      );
      const outcome = element.querySelector(
        '[data-testid="grading-detail-mcq-outcome-tsq-mcq-1"]',
      );
      expect(outcome?.textContent).toContain(
        'rplus.grading_queue.mcq_incorrect',
      );
      expect(
        outcome?.classList.contains('grading-q__mcq-outcome--incorrect'),
      ).toBe(true);
    });

    it('renders the MCQ ungraded outcome when correct is null', () => {
      const { element } = setup(
        detailFixture({
          questions: [mcqQuestion({ correct: null })],
        }),
      );
      const outcome = element.querySelector(
        '[data-testid="grading-detail-mcq-outcome-tsq-mcq-1"]',
      );
      expect(outcome?.textContent).toContain(
        'rplus.grading_queue.mcq_ungraded',
      );
    });

    it('renders the OE learner answer + score input seeded from the detail', () => {
      const { element } = setup();
      const learner = element.querySelector(
        '[data-testid="grading-detail-learner-answer-tsq-oe-1"]',
      );
      expect(learner?.textContent).toContain(
        'Plants make food from sunlight.',
      );
      const scoreInput = element.querySelector(
        '[data-testid="grading-detail-score-input-tsq-oe-1"]',
      ) as HTMLInputElement;
      expect(scoreInput.value).toBe('7');
    });

    it('seeds the comment + model-answer textareas + overall comment', () => {
      const { element } = setup();
      const comment = element.querySelector(
        '[data-testid="grading-detail-comment-tsq-oe-1"]',
      ) as HTMLTextAreaElement;
      const model = element.querySelector(
        '[data-testid="grading-detail-model-answer-tsq-oe-1"]',
      ) as HTMLTextAreaElement;
      const overall = element.querySelector(
        '[data-testid="grading-detail-overall-comment"]',
      ) as HTMLTextAreaElement;
      expect(comment.value).toBe('Good but incomplete.');
      expect(model.value).toBe('Plants convert light to energy.');
      expect(overall.value).toBe('Solid attempt overall.');
    });

    it('renders the AI provenance badge by default and human when overridden', () => {
      const { element } = setup(
        detailFixture({
          questions: [oeQuestion({ score_provenance: 'HUMAN' })],
        }),
      );
      const badge = element.querySelector(
        '[data-testid="grading-detail-provenance-tsq-oe-1"]',
      );
      expect(badge?.textContent).toContain(
        'rplus.grading_queue.provenance_human',
      );
      expect(badge?.classList.contains('grading-q__provenance--human')).toBe(
        true,
      );
    });

    it('renders the quality-flag indicator when an OE question is flagged', () => {
      const { element } = setup(
        detailFixture({
          questions: [oeQuestion({ quality_flagged: true })],
        }),
      );
      const flag = element.querySelector(
        '[data-testid="grading-detail-quality-flag-tsq-oe-1"]',
      );
      expect(flag).not.toBeNull();
      const article = element.querySelector(
        '[data-testid="grading-detail-q-tsq-oe-1"]',
      );
      expect(article?.classList.contains('grading-q--flagged')).toBe(true);
    });
  });

  describe('computed signals', () => {
    it('oeQuestions filters out MCQ rows', () => {
      const { component } = setup();
      const oe = component.oeQuestions();
      expect(oe.length).toBe(1);
      expect(oe[0].question_type).toBe('oe');
    });

    it('isApproved + editingLocked are false for a pending submission', () => {
      const { component } = setup();
      expect(component.isApproved()).toBe(false);
      expect(component.editingLocked()).toBe(false);
    });

    it('isApproved + editingLocked are true for an APPROVED submission', () => {
      const { component } = setup(
        detailFixture({ review_status: 'APPROVED' }),
      );
      expect(component.isApproved()).toBe(true);
      expect(component.editingLocked()).toBe(true);
    });

    it('bufferFor returns an empty buffer for an unknown question id', () => {
      const { component } = setup();
      expect(component.bufferFor('does-not-exist')).toEqual({
        points_earned: '',
        comment: '',
        model_answer: '',
      });
    });

    it('provenanceKey + isHuman map provenance correctly', () => {
      const { component } = setup();
      expect(component.provenanceKey('HUMAN')).toBe(
        'rplus.grading_queue.provenance_human',
      );
      expect(component.provenanceKey('AI')).toBe(
        'rplus.grading_queue.provenance_ai',
      );
      expect(component.provenanceKey(undefined)).toBe(
        'rplus.grading_queue.provenance_ai',
      );
      expect(component.isHuman('HUMAN')).toBe(true);
      expect(component.isHuman('AI')).toBe(false);
    });

    it('trackByTsqid + trackByCriterion return stable keys', () => {
      const { component } = setup();
      expect(component.trackByTsqid(0, oeQuestion())).toBe('tsq-oe-1');
      expect(component.trackByCriterion(3, {})).toBe(3);
    });
  });

  describe('approved-locked rendering', () => {
    it('disables score input + shows the approved badge instead of CTAs', () => {
      const { element } = setup(
        detailFixture({ review_status: 'APPROVED' }),
      );
      const scoreInput = element.querySelector(
        '[data-testid="grading-detail-score-input-tsq-oe-1"]',
      ) as HTMLInputElement;
      expect(scoreInput.disabled).toBe(true);
      expect(
        element.querySelector('[data-testid="grading-detail-approved-badge"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="grading-detail-save"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="grading-detail-approve"]'),
      ).toBeNull();
    });
  });

  describe('buffer mutation handlers', () => {
    it('onScoreInput / onCommentInput / onModelAnswerInput patch the buffer', () => {
      const { component } = setup();
      component.onScoreInput('tsq-oe-1', '9');
      component.onCommentInput('tsq-oe-1', 'Edited comment');
      component.onModelAnswerInput('tsq-oe-1', 'Edited model');
      const buf = component.bufferFor('tsq-oe-1');
      expect(buf.points_earned).toBe('9');
      expect(buf.comment).toBe('Edited comment');
      expect(buf.model_answer).toBe('Edited model');
    });

    it('onOverallCommentInput updates the overall comment edit signal', () => {
      const { component } = setup();
      component.onOverallCommentInput('New overall feedback');
      expect(component.overallCommentEdit()).toBe('New overall feedback');
    });

    it('a score-input DOM event drives onScoreInput', () => {
      const { element, component, fixture } = setup();
      const input = element.querySelector(
        '[data-testid="grading-detail-score-input-tsq-oe-1"]',
      ) as HTMLInputElement;
      input.value = '5';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(component.bufferFor('tsq-oe-1').points_earned).toBe('5');
    });
  });

  describe('save flow', () => {
    it('PATCHes only the changed score artifact and flips provenance on success', () => {
      const { fixture, httpMock, component, element } = setup();

      component.onScoreInput('tsq-oe-1', '9');
      fixture.detectChanges();

      (
        element.querySelector(
          '[data-testid="grading-detail-save"]',
        ) as HTMLButtonElement
      ).click();

      const patch = httpMock.expectOne(GRADES_URL);
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.body).toEqual({
        question_edits: [
          { test_set_question_id: 'tsq-oe-1', points_earned: 9 },
        ],
      });
      patch.flush(
        detailFixture({
          questions: [
            oeQuestion({ points_earned: 9, score_provenance: 'HUMAN' }),
          ],
        }),
      );
      fixture.detectChanges();

      // Toast fired on success.
      const toast = TestBed.inject(ToastService);
      expect(
        toast.toasts().some((t) => t.message === 'rplus.grading_queue.toast_saved'),
      ).toBe(true);
      // Provenance flipped on the refreshed detail.
      expect(component.detail()?.questions[0].score_provenance).toBe('HUMAN');
      httpMock.verify();
    });

    it('PATCHes comment + model_answer when both changed', () => {
      const { fixture, httpMock, component } = setup();
      component.onCommentInput('tsq-oe-1', 'Reviewed comment');
      component.onModelAnswerInput('tsq-oe-1', 'Reviewed model answer');
      fixture.detectChanges();

      component.save();

      const patch = httpMock.expectOne(GRADES_URL);
      expect(patch.request.body).toEqual({
        question_edits: [
          {
            test_set_question_id: 'tsq-oe-1',
            comment: 'Reviewed comment',
            model_answer: 'Reviewed model answer',
          },
        ],
      });
      patch.flush(detailFixture());
      fixture.detectChanges();
      httpMock.verify();
    });

    it('PATCHes the overall comment when it changed (no grade edits)', () => {
      const { fixture, httpMock, component } = setup();
      component.onOverallCommentInput('Much better than expected.');
      fixture.detectChanges();

      component.save();

      const patch = httpMock.expectOne(OVERALL_URL);
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.body).toEqual({
        overall_comment: 'Much better than expected.',
      });
      patch.flush(
        detailFixture({
          overall_comment: 'Much better than expected.',
          overall_comment_provenance: 'HUMAN',
        }),
      );
      fixture.detectChanges();
      expect(component.detail()?.overall_comment_provenance).toBe('HUMAN');
      httpMock.verify();
    });

    it('issues NO request when nothing changed', () => {
      const { httpMock, component } = setup();
      component.save();
      httpMock.expectNone(GRADES_URL);
      httpMock.expectNone(OVERALL_URL);
      httpMock.verify();
    });

    it('does nothing when editing is locked (approved)', () => {
      const { httpMock, component } = setup(
        detailFixture({ review_status: 'APPROVED' }),
      );
      component.onScoreInput('tsq-oe-1', '9');
      component.save();
      httpMock.expectNone(GRADES_URL);
      httpMock.verify();
    });

    it('surfaces a save error key when the grades PATCH fails', () => {
      const { fixture, httpMock, component, element } = setup();
      component.onScoreInput('tsq-oe-1', '9');
      fixture.detectChanges();

      component.save();
      httpMock
        .expectOne(GRADES_URL)
        .flush(
          { error: 'conflict' },
          { status: 409, statusText: 'Conflict' },
        );
      fixture.detectChanges();

      expect(component.saveErrorKey()).toBe(
        'rplus.grading_queue.error_conflict',
      );
      const banner = element.querySelector(
        '[data-testid="grading-detail-save-error"]',
      );
      expect(banner).not.toBeNull();
      httpMock.verify();
    });

    it('does not emit a grade edit when the new score is not a number', () => {
      const { httpMock, component } = setup();
      component.onScoreInput('tsq-oe-1', 'abc');
      component.save();
      // 'abc' parses to NaN → skipped; no other edits → no PATCH at all.
      httpMock.expectNone(GRADES_URL);
      httpMock.verify();
    });

    it('emits both grade edits and overall-comment when both changed', () => {
      const { fixture, httpMock, component } = setup();
      component.onScoreInput('tsq-oe-1', '9');
      component.onOverallCommentInput('New overall.');
      fixture.detectChanges();

      component.save();

      const grades = httpMock.expectOne(GRADES_URL);
      expect(grades.request.method).toBe('PATCH');
      grades.flush(detailFixture());

      const overall = httpMock.expectOne(OVERALL_URL);
      expect(overall.request.method).toBe('PATCH');
      overall.flush(detailFixture({ overall_comment: 'New overall.' }));
      fixture.detectChanges();
      httpMock.verify();
    });
  });

  describe('approve flow', () => {
    it('POSTs approve, refetches the detail, toasts and emits approved', () => {
      const { fixture, httpMock, component, element } = setup();

      let approvedEmitted = 0;
      component.approved.subscribe(() => approvedEmitted++);

      (
        element.querySelector(
          '[data-testid="grading-detail-approve"]',
        ) as HTMLButtonElement
      ).click();

      const post = httpMock.expectOne(APPROVE_URL);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({});
      // The approve echo carries the resulting review_status (CHO-2343) — a
      // genuine approval flips it to APPROVED, which is what gates the toast.
      post.flush({ submission_id: SID, state: 'GRADED', review_status: 'APPROVED' });
      fixture.detectChanges();

      // approveSubmission success → loadGradingDetail refetch.
      httpMock
        .expectOne(GRADING_URL)
        .flush(detailFixture({ review_status: 'APPROVED' }));
      fixture.detectChanges();

      const toast = TestBed.inject(ToastService);
      expect(
        toast
          .toasts()
          .some((t) => t.message === 'rplus.grading_queue.toast_approved'),
      ).toBe(true);
      expect(approvedEmitted).toBe(1);
      expect(component.isApproved()).toBe(true);
      httpMock.verify();
    });

    it('surfaces an approve error key when the approve POST fails', () => {
      const { fixture, httpMock, component, element } = setup();
      component.approve();
      httpMock
        .expectOne(APPROVE_URL)
        .flush(
          { error: 'boom' },
          { status: 500, statusText: 'Server Error' },
        );
      fixture.detectChanges();

      expect(component.approveErrorKey()).toBe(
        'rplus.grading_queue.error_upstream',
      );
      const banner = element.querySelector(
        '[data-testid="grading-detail-approve-error"]',
      );
      expect(banner).not.toBeNull();
      httpMock.verify();
    });

    it('approve() is a no-op when already approved', () => {
      const { httpMock, component } = setup(
        detailFixture({ review_status: 'APPROVED' }),
      );
      component.approve();
      httpMock.expectNone(APPROVE_URL);
      httpMock.verify();
    });

    // ── CHO-2343 bug #2 — NotRequired / no-op approve ─────────────────
    it('hides Approve + shows "no review needed" for a NotRequired submission', () => {
      const { element, component } = setup(
        detailFixture({ review_status: '', state: 'RELEASED' }),
      );
      expect(component.approvalRequired()).toBe(false);
      expect(
        element.querySelector('[data-testid="grading-detail-approve"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="grading-detail-save"]'),
      ).toBeNull();
      expect(
        element.querySelector(
          '[data-testid="grading-detail-no-review-needed"]',
        ),
      ).not.toBeNull();
    });

    it('does NOT toast approved when the approve echo is unchanged (review_status not APPROVED)', () => {
      const { fixture, httpMock, component } = setup();
      let approvedEmitted = 0;
      component.approved.subscribe(() => approvedEmitted++);

      component.approve();
      // A no-op approve (MCQ-only / already-RELEASED) echoes review_status "".
      httpMock
        .expectOne(APPROVE_URL)
        .flush({ submission_id: SID, state: 'RELEASED', review_status: '' });
      fixture.detectChanges();
      // The service refetches the detail after a successful POST.
      httpMock
        .expectOne(GRADING_URL)
        .flush(detailFixture({ review_status: '', state: 'RELEASED' }));
      fixture.detectChanges();

      const toast = TestBed.inject(ToastService);
      expect(
        toast
          .toasts()
          .some((t) => t.message === 'rplus.grading_queue.toast_approved'),
      ).toBe(false);
      // The list still refreshes (approved bubbles) — just no false toast.
      expect(approvedEmitted).toBe(1);
      httpMock.verify();
    });
  });

  describe('close flow', () => {
    it('close() clears the detail and emits closed', () => {
      const { component, service } = setup();
      let closedEmitted = 0;
      component.closed.subscribe(() => closedEmitted++);

      component.close();

      expect(closedEmitted).toBe(1);
      expect(service.detailState().status).toBe('idle');
      expect(component.detail()).toBeNull();
    });

    it('the close button triggers close()', () => {
      const { fixture, element, component } = setup();
      let closedEmitted = 0;
      component.closed.subscribe(() => closedEmitted++);
      (
        element.querySelector(
          '[data-testid="grading-detail-close"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(closedEmitted).toBe(1);
    });
  });

  // ── Branch-completion cases (target the not-yet-covered conditional arms) ──
  describe('branch completion', () => {
    it('errorKey() returns empty in a non-error (success) state', () => {
      // errorKey ternary FALSE arm: status !== "error" → "".
      const { component } = setup();
      expect(component.detailState().status).toBe('success');
      expect(component.errorKey()).toBe('');
    });

    it('oeQuestions() falls back to [] when no detail is loaded', () => {
      // The `this.detail()?.questions ?? []` nullish arm (detail() === null).
      const { component } = setup(null);
      // Leave the GET pending → detail() is null (loading), not success.
      expect(component.detail()).toBeNull();
      expect(component.oeQuestions()).toEqual([]);
    });

    it('seeds buffers from null score / comment / model-answer + null overall', () => {
      // seedBuffers nullish/ternary fallback arms:
      //   points_earned null → '' ; comment null → '' ; model_answer null → '' ;
      //   overall_comment null → ''.
      const { component } = setup(
        detailFixture({
          overall_comment: null,
          questions: [
            oeQuestion({
              points_earned: null as unknown as number,
              comment: null,
              model_answer: null,
            }),
          ],
        }),
      );
      const buf = component.bufferFor('tsq-oe-1');
      expect(buf.points_earned).toBe('');
      expect(buf.comment).toBe('');
      expect(buf.model_answer).toBe('');
      expect(component.overallCommentEdit()).toBe('');
    });

    it('does NOT load when the assessment id resolves empty', () => {
      // Constructor effect guard `if (aid && sid)` → FALSE arm (no GET issued).
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [SubmissionGradingDetailComponent],
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const service = TestBed.inject(GradingReviewService);
      service.clearDetail();
      const fixture = TestBed.createComponent(SubmissionGradingDetailComponent);
      // Empty assessment id → guard short-circuits, no detail load.
      fixture.componentRef.setInput('assessmentId', '');
      fixture.componentRef.setInput('submissionId', SID);
      const httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();

      httpMock.expectNone(GRADING_URL);
      expect(fixture.componentInstance.detailState().status).toBe('idle');
      httpMock.verify();
    });

    it('patchBuffer creates a fresh buffer for an unseeded question id', () => {
      // patchBuffer `all[tsqid] ?? {...}` nullish arm — tsqid not in the map.
      const { component } = setup();
      component.onCommentInput('tsq-never-seeded', 'late comment');
      const buf = component.bufferFor('tsq-never-seeded');
      expect(buf).toEqual({
        points_earned: '',
        comment: 'late comment',
        model_answer: '',
      });
    });

    it('saveErrorKey() surfaces the overall-comment error when grades are clean', () => {
      // saveErrorKey: editGrades NOT error → fall through to editOverallComment
      // error arm (the second `if (o.status === "error")` TRUE branch).
      const { fixture, httpMock, component, element } = setup();
      component.onOverallCommentInput('Different overall comment.');
      fixture.detectChanges();

      component.save();

      // Only the overall-comment PATCH fires (no grade edits) and it fails.
      httpMock
        .expectOne(OVERALL_URL)
        .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      // editGrades stayed idle; the error comes solely from overall-comment.
      expect(component.editGradesState().status).toBe('idle');
      expect(component.saveErrorKey()).toBe('rplus.grading_queue.error_upstream');
      const banner = element.querySelector(
        '[data-testid="grading-detail-save-error"]',
      );
      expect(banner).not.toBeNull();
      httpMock.verify();
    });

    it('save() over a null-original detail emits each artifact as a change', () => {
      // buildQuestionEdits fallback arms: originalScore ternary (null → ''),
      // `q.comment ?? ''` and `q.model_answer ?? ''` nullish arms; plus the
      // save() `d.overall_comment ?? ''` nullish arm.
      const { fixture, httpMock, component } = setup(
        detailFixture({
          overall_comment: null,
          questions: [
            oeQuestion({
              points_earned: null as unknown as number,
              comment: null,
              model_answer: null,
            }),
          ],
        }),
      );

      // Change every artifact away from its null-seeded ('') baseline.
      component.onScoreInput('tsq-oe-1', '4');
      component.onCommentInput('tsq-oe-1', 'New comment');
      component.onModelAnswerInput('tsq-oe-1', 'New model answer');
      // Overall original is '' (from null) → set a non-empty value to diff.
      component.onOverallCommentInput('Overall now present.');
      fixture.detectChanges();

      component.save();

      const grades = httpMock.expectOne(GRADES_URL);
      expect(grades.request.method).toBe('PATCH');
      expect(grades.request.body).toEqual({
        question_edits: [
          {
            test_set_question_id: 'tsq-oe-1',
            points_earned: 4,
            comment: 'New comment',
            model_answer: 'New model answer',
          },
        ],
      });
      grades.flush(detailFixture());

      const overall = httpMock.expectOne(OVERALL_URL);
      expect(overall.request.body).toEqual({
        overall_comment: 'Overall now present.',
      });
      overall.flush(detailFixture());
      fixture.detectChanges();
      httpMock.verify();
    });
  });
});
