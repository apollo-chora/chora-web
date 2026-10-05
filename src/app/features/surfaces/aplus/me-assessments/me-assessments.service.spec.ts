import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { MeAssessmentsService } from './me-assessments.service';
import type {
  AutosaveRequest,
  LearnerAssessmentDetail,
  LearnerAssessmentListResponse,
  LearnerAssessmentSummary,
  MySubmissionResultResponse,
  Submission,
  SubmissionStartedResponse,
  SubmissionSubmittedResponse,
} from './me-assessments.model';

/**
 * MeAssessmentsService spec — Phase X.3.
 */

const ASSESSMENT_ID = '01985e7f-1234-7abc-8def-000000000a01';
const SUBMISSION_ID = '01985e7f-1234-7abc-8def-000000000601';

function buildSummary(
  overrides: Partial<LearnerAssessmentSummary> = {},
): LearnerAssessmentSummary {
  return {
    assessment_id: ASSESSMENT_ID,
    title: 'Agile Estimation — Cohort May 2026',
    state: 'OPEN',
    scheduled_open_at: '2026-05-20T09:00:00Z',
    scheduled_close_at: '2026-05-20T11:00:00Z',
    max_attempts: 1,
    learner_attempt_count: 0,
    learner_remaining_attempts: 1,
    question_count: 5,
    total_points: 50,
    time_limit_seconds: 7200,
    ...overrides,
  };
}

function buildListResponse(
  overrides: Partial<LearnerAssessmentListResponse> = {},
): LearnerAssessmentListResponse {
  return {
    items: [buildSummary()],
    next_page_token: null,
    ...overrides,
  };
}

function buildDetail(
  overrides: Partial<LearnerAssessmentDetail> = {},
): LearnerAssessmentDetail {
  return {
    ...buildSummary(),
    questions: [
      {
        test_set_question_id: '01985e7f-1234-7abc-8def-000000000701',
        question_id: '01985e7f-1234-7abc-8def-000000000001',
        question_type: 'mcq',
        prompt: 'Which estimation technique is non-numerical?',
        points_possible: 10,
        display_order: 1,
        required: true,
        mcq: {
          options: [
            { option_id: 'opt-a', label: 'A', text: 'Story points' },
            { option_id: 'opt-b', label: 'B', text: 'T-shirt sizing' },
            { option_id: 'opt-c', label: 'C', text: 'Function points' },
          ],
          scoring_mode: 'single_correct',
        },
        oe: null,
      },
    ],
    ...overrides,
  };
}

function buildStartedResponse(
  overrides: Partial<SubmissionStartedResponse> = {},
): SubmissionStartedResponse {
  return {
    submission_id: SUBMISSION_ID,
    attempt_number: 1,
    opens_at: '2026-05-20T09:00:00Z',
    closes_at: '2026-05-20T11:00:00Z',
    time_limit_seconds: 7200,
    idempotent_replay: false,
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
    last_saved_at: null,
    answers: [],
    ...overrides,
  };
}

function buildSubmittedResponse(
  overrides: Partial<SubmissionSubmittedResponse> = {},
): SubmissionSubmittedResponse {
  return {
    submission_id: SUBMISSION_ID,
    state: 'SUBMITTED',
    grading_job_id: '01985e7f-1234-7abc-8def-000000000801',
    grading_eta_seconds: 30,
    ...overrides,
  };
}

function buildPendingReleaseResult(): MySubmissionResultResponse {
  return {
    state: 'PENDING_RELEASE',
    message:
      'Your submission has been graded. Results will be released by your instructor.',
  };
}

function buildReleasedResult(): MySubmissionResultResponse {
  return {
    state: 'RELEASED',
    result: {
      submission_id: SUBMISSION_ID,
      total_points_earned: 40,
      total_points_possible: 50,
      passing_threshold_percent: 70,
      passed: true,
      per_question_grades: [
        {
          test_set_question_id: '01985e7f-1234-7abc-8def-000000000701',
          question_id: '01985e7f-1234-7abc-8def-000000000001',
          question_type: 'mcq',
          points_earned: 10,
          points_possible: 10,
          correct: true,
          grading_dispatch: 'DETERMINISTIC',
        },
      ],
      instructor_comment: 'Well done.',
      released_at: '2026-05-20T16:00:00Z',
    },
  };
}

function setup(): {
  service: MeAssessmentsService;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(MeAssessmentsService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('MeAssessmentsService (Phase X.3)', () => {
  let service: MeAssessmentsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ service, httpMock } = setup());
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('listAssessments()', () => {
    it('issues GET /api/v1/me/assessments', () => {
      service.listAssessments();
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/v1/me/assessments'));
      expect(req.request.method).toBe('GET');
      req.flush(buildListResponse());
    });

    // ── CR2-C2 pagination tests ──────────────────────────────────────
    it('sends page_size param when pageSize is specified', () => {
      service.listAssessments({ pageSize: 50 });
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/v1/me/assessments'));
      expect(req.request.params.get('page_size')).toBe('50');
      req.flush(buildListResponse());
    });

    it('sends page_token param when pageToken is specified', () => {
      service.listAssessments({ pageToken: 'opaque-cursor-abc' });
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/v1/me/assessments'));
      expect(req.request.params.get('page_token')).toBe('opaque-cursor-abc');
      req.flush(buildListResponse());
    });

    it('stores nextPageToken from response in success state', () => {
      service.listAssessments();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/me/assessments'))
        .flush(buildListResponse({ next_page_token: 'tok-page-2' }));
      const s = service.listState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.nextPageToken).toBe('tok-page-2');
      }
    });

    it('stores nextPageToken=null when response has no next_page_token', () => {
      service.listAssessments();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/me/assessments'))
        .flush(buildListResponse({ next_page_token: null }));
      const s = service.listState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.nextPageToken).toBeNull();
      }
    });

    it('appends items when append:true', () => {
      // First page
      service.listAssessments();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/me/assessments'))
        .flush(
          buildListResponse({
            items: [buildSummary({ assessment_id: 'page1-a' })],
            next_page_token: 'tok-2',
          }),
        );
      expect(service.listState().status).toBe('success');

      // Second page (append)
      service.listAssessments({ pageToken: 'tok-2', append: true });
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/me/assessments'))
        .flush(
          buildListResponse({
            items: [buildSummary({ assessment_id: 'page2-b' })],
            next_page_token: null,
          }),
        );
      const s = service.listState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.items.length).toBe(2);
        expect(s.items[0].assessment_id).toBe('page1-a');
        expect(s.items[1].assessment_id).toBe('page2-b');
        expect(s.nextPageToken).toBeNull();
      }
    });

    it('does NOT reset state to loading when append:true', () => {
      // Prime with success
      service.listAssessments();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/me/assessments'))
        .flush(buildListResponse({ next_page_token: 'tok-2' }));
      expect(service.listState().status).toBe('success');

      // Append — state should stay success (not flicker to loading)
      service.listAssessments({ append: true, pageToken: 'tok-2' });
      expect(service.listState().status).toBe('success');
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/me/assessments'))
        .flush(buildListResponse({ next_page_token: null }));
    });

    it('returns assessments via the listState success branch', () => {
      service.listAssessments();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/me/assessments'))
        .flush(buildListResponse());
      const s = service.listState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.items.length).toBe(1);
        expect(s.items[0].assessment_id).toBe(ASSESSMENT_ID);
      }
    });

    it('maps 5xx to a translated error key', () => {
      service.listAssessments();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/me/assessments'))
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const s = service.listState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.me_assessments.list.error_upstream');
      }
    });

    it('maps 401/403 to error_unauthorised', () => {
      service.listAssessments();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/me/assessments'))
        .flush(null, { status: 403, statusText: 'Forbidden' });
      const s = service.listState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.me_assessments.list.error_unauthorised');
      }
    });

    it('renders empty list when items is empty', () => {
      service.listAssessments();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/me/assessments'))
        .flush({ items: [], next_page_token: null });
      const s = service.listState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.items.length).toBe(0);
      }
    });
  });

  describe('loadAssessment()', () => {
    it('issues GET /api/v1/me/assessments/{id}', () => {
      service.loadAssessment(ASSESSMENT_ID);
      const req = httpMock.expectOne(
        (r) => r.url.endsWith('/api/v1/me/assessments/' + encodeURIComponent(ASSESSMENT_ID)),
      );
      expect(req.request.method).toBe('GET');
      req.flush(buildDetail());
    });

    it('transitions loading → success', () => {
      expect(service.detailState().status).toBe('loading');
      service.loadAssessment(ASSESSMENT_ID);
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/me/assessments/' + ASSESSMENT_ID))
        .flush(buildDetail());
      const s = service.detailState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.detail.questions.length).toBe(1);
      }
    });

    it('maps 404 to error_not_found', () => {
      service.loadAssessment(ASSESSMENT_ID);
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/me/assessments/' + ASSESSMENT_ID))
        .flush(null, { status: 404, statusText: 'Not Found' });
      const s = service.detailState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.me_assessments.detail.error_not_found');
      }
    });
  });

  describe('startSubmission()', () => {
    it('issues POST /api/v1/me/assessments/{id}/submissions with empty body', () => {
      service.startSubmission(ASSESSMENT_ID);
      const req = httpMock.expectOne(
        (r) => r.url.endsWith('/api/v1/me/assessments/' + ASSESSMENT_ID + '/submissions'),
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(buildStartedResponse());
    });

    it('transitions idle → starting → started', () => {
      expect(service.startState().status).toBe('idle');
      service.startSubmission(ASSESSMENT_ID);
      expect(service.startState().status).toBe('starting');
      httpMock
        .expectOne((r) => r.url.endsWith('/submissions'))
        .flush(buildStartedResponse({ submission_id: 'new-1' }));
      const s = service.startState();
      expect(s.status).toBe('started');
      if (s.status === 'started') {
        expect(s.started.submission_id).toBe('new-1');
      }
    });

    it('maps 409 (max-attempts-exhausted) to error_conflict', () => {
      service.startSubmission(ASSESSMENT_ID);
      httpMock
        .expectOne((r) => r.url.endsWith('/submissions'))
        .flush(
          { error: { code: 'DELIVERY_SUBMISSION_MAX_ATTEMPTS_EXHAUSTED', message: '...' } },
          { status: 409, statusText: 'Conflict' },
        );
      const s = service.startState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.me_assessments.start.error_conflict');
      }
    });

    it('maps 403 to error_not_invited', () => {
      service.startSubmission(ASSESSMENT_ID);
      httpMock
        .expectOne((r) => r.url.endsWith('/submissions'))
        .flush(null, { status: 403, statusText: 'Forbidden' });
      const s = service.startState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.me_assessments.start.error_not_invited');
      }
    });
  });

  describe('loadSubmission()', () => {
    it('issues GET /api/v1/me/assessments/{id}/submissions/{subId}', () => {
      service.loadSubmission(ASSESSMENT_ID, SUBMISSION_ID);
      const req = httpMock.expectOne((r) =>
        r.url.endsWith(
          '/api/v1/me/assessments/' +
            ASSESSMENT_ID +
            '/submissions/' +
            SUBMISSION_ID,
        ),
      );
      expect(req.request.method).toBe('GET');
      req.flush(buildSubmission());
    });

    it('transitions loading → success', () => {
      service.loadSubmission(ASSESSMENT_ID, SUBMISSION_ID);
      httpMock
        .expectOne((r) => r.url.includes('/submissions/' + SUBMISSION_ID))
        .flush(buildSubmission({ state: 'IN_PROGRESS' }));
      const s = service.submissionState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.submission.submission_id).toBe(SUBMISSION_ID);
      }
    });
  });

  describe('autosave()', () => {
    it('issues PATCH /api/v1/me/assessments/{id}/submissions/{subId} with answers body', () => {
      const body: AutosaveRequest = {
        answers: [
          {
            test_set_question_id: 'q1',
            question_id: 'qid1',
            mcq_choice_id: 'opt-a',
          },
        ],
      };
      service.autosave(ASSESSMENT_ID, SUBMISSION_ID, body);
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'PATCH' &&
          r.url.endsWith('/api/v1/me/assessments/' + ASSESSMENT_ID + '/submissions/' + SUBMISSION_ID),
      );
      expect(req.request.body).toEqual(body);
      req.flush(buildSubmission());
    });

    it('transitions idle → saving → saved with timestamp', () => {
      expect(service.autosaveState().status).toBe('idle');
      service.autosave(ASSESSMENT_ID, SUBMISSION_ID, {
        answers: [
          { test_set_question_id: 'q1', question_id: 'qid1', mcq_choice_id: 'opt-a' },
        ],
      });
      expect(service.autosaveState().status).toBe('saving');
      const savedAt = '2026-05-20T09:10:00Z';
      httpMock
        .expectOne((r) => r.method === 'PATCH')
        .flush(buildSubmission({ last_saved_at: savedAt }));
      const s = service.autosaveState();
      expect(s.status).toBe('saved');
      if (s.status === 'saved') {
        expect(s.saved_at).toBe(savedAt);
      }
    });

    it('maps 409 to autosave error_window_closed', () => {
      service.autosave(ASSESSMENT_ID, SUBMISSION_ID, {
        answers: [
          { test_set_question_id: 'q1', question_id: 'qid1', mcq_choice_id: 'opt-a' },
        ],
      });
      httpMock
        .expectOne((r) => r.method === 'PATCH')
        .flush(
          { error: { code: 'DELIVERY_SUBMISSION_WINDOW_CLOSED', message: '...' } },
          { status: 409, statusText: 'Conflict' },
        );
      const s = service.autosaveState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.me_assessments.autosave.error_window_closed');
      }
    });

    it('maps 5xx to autosave error_save_failed', () => {
      service.autosave(ASSESSMENT_ID, SUBMISSION_ID, {
        answers: [
          { test_set_question_id: 'q1', question_id: 'qid1', mcq_choice_id: 'opt-a' },
        ],
      });
      httpMock
        .expectOne((r) => r.method === 'PATCH')
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const s = service.autosaveState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.me_assessments.autosave.error_save_failed');
      }
    });
  });

  describe('submitFinal()', () => {
    it('issues POST /api/v1/me/assessments/{id}/submissions/{subId}/submit', () => {
      service.submitFinal(ASSESSMENT_ID, SUBMISSION_ID);
      const req = httpMock.expectOne(
        (r) =>
          r.url.endsWith(
            '/api/v1/me/assessments/' +
              ASSESSMENT_ID +
              '/submissions/' +
              SUBMISSION_ID +
              '/submit',
          ),
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(buildSubmittedResponse());
    });

    it('transitions idle → submitting → submitted with grading_job_id', () => {
      expect(service.submitFinalState().status).toBe('idle');
      service.submitFinal(ASSESSMENT_ID, SUBMISSION_ID);
      expect(service.submitFinalState().status).toBe('submitting');
      httpMock
        .expectOne((r) => r.url.endsWith('/submit'))
        .flush(buildSubmittedResponse({ grading_job_id: 'job-99' }));
      const s = service.submitFinalState();
      expect(s.status).toBe('submitted');
      if (s.status === 'submitted') {
        expect(s.response.grading_job_id).toBe('job-99');
        expect(s.response.state).toBe('SUBMITTED');
      }
    });

    it('maps 409 (required questions unanswered) to error_required_unanswered', () => {
      service.submitFinal(ASSESSMENT_ID, SUBMISSION_ID);
      httpMock
        .expectOne((r) => r.url.endsWith('/submit'))
        .flush(
          {
            error: {
              code: 'DELIVERY_SUBMISSION_REQUIRED_QUESTIONS_UNANSWERED',
              message: '...',
            },
          },
          { status: 409, statusText: 'Conflict' },
        );
      const s = service.submitFinalState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.me_assessments.submit.error_required_unanswered');
      }
    });
  });

  describe('loadResult()', () => {
    it('issues GET /api/v1/me/assessments/{id}/submissions/{subId}/result', () => {
      service.loadResult(ASSESSMENT_ID, SUBMISSION_ID);
      const req = httpMock.expectOne(
        (r) =>
          r.url.endsWith(
            '/api/v1/me/assessments/' +
              ASSESSMENT_ID +
              '/submissions/' +
              SUBMISSION_ID +
              '/result',
          ),
      );
      expect(req.request.method).toBe('GET');
      req.flush(buildPendingReleaseResult());
    });

    it('maps PENDING_RELEASE envelope to resultState=pending with message', () => {
      service.loadResult(ASSESSMENT_ID, SUBMISSION_ID);
      httpMock
        .expectOne((r) => r.url.endsWith('/result'))
        .flush(buildPendingReleaseResult());
      const s = service.resultState();
      expect(s.status).toBe('pending');
      if (s.status === 'pending') {
        expect(s.message).toContain('Your submission has been graded');
      }
    });

    it('maps RELEASED envelope to resultState=released with full body', () => {
      service.loadResult(ASSESSMENT_ID, SUBMISSION_ID);
      httpMock
        .expectOne((r) => r.url.endsWith('/result'))
        .flush(buildReleasedResult());
      const s = service.resultState();
      expect(s.status).toBe('released');
      if (s.status === 'released') {
        expect(s.result.total_points_earned).toBe(40);
        expect(s.result.passed).toBe(true);
        expect(s.result.per_question_grades.length).toBe(1);
      }
    });

    it('flags OE rows without criterion_scores as oe_batch_pending', () => {
      service.loadResult(ASSESSMENT_ID, SUBMISSION_ID);
      httpMock.expectOne((r) => r.url.endsWith('/result')).flush({
        state: 'RELEASED',
        result: {
          submission_id: SUBMISSION_ID,
          total_points_earned: 0,
          total_points_possible: 10,
          passing_threshold_percent: 70,
          passed: false,
          per_question_grades: [
            {
              test_set_question_id: 'tsq-1',
              question_id: 'q-1',
              question_type: 'oe',
              points_earned: 0,
              points_possible: 10,
              grading_dispatch: 'LLM_EVALUATOR',
            },
          ],
        },
      });
      const s = service.resultState();
      expect(s.status).toBe('released');
      if (s.status === 'released') {
        const oe = s.result.per_question_grades[0];
        expect(oe.oe_batch_pending).toBe(true);
      }
    });

    it('does NOT flag MCQ rows as oe_batch_pending', () => {
      service.loadResult(ASSESSMENT_ID, SUBMISSION_ID);
      httpMock
        .expectOne((r) => r.url.endsWith('/result'))
        .flush(buildReleasedResult());
      const s = service.resultState();
      expect(s.status).toBe('released');
      if (s.status === 'released') {
        const mcq = s.result.per_question_grades[0];
        expect(mcq.oe_batch_pending).toBeFalsy();
      }
    });

    it('maps 5xx to result error_upstream', () => {
      service.loadResult(ASSESSMENT_ID, SUBMISSION_ID);
      httpMock
        .expectOne((r) => r.url.endsWith('/result'))
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const s = service.resultState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.me_assessments.result.error_upstream');
      }
    });
  });
});
