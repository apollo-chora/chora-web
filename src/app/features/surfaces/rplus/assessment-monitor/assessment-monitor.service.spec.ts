import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { AssessmentMonitorService } from './assessment-monitor.service';
import { firstValueFrom } from 'rxjs';
import type {
  Assessment,
  AssessmentListResponse,
  AssessmentMonitor,
  MonitorTestSet,
  Submission,
  SubmissionListResponse,
} from './assessment-monitor.model';
import type { AuthorQuestionRaw } from '../../../../shared/components/chora-question-review/chora-question-review.model';

/**
 * AssessmentMonitorService spec — R+ Phase X.5 instructor surfaces.
 *
 * Wired LIVE to the real BFF routes per `delivery-assessments.yaml`. The
 * spec covers list / detail / monitor / submissions / lifecycle CTAs
 * (publish / force-close / release-results / archive) and error mapping.
 * Per chora-web CLAUDE.md §6 — `httpMock.verify()` in afterEach.
 */

const TENANT_ID = '11111111-1111-7111-8111-111111111111';
const INSTRUCTOR_GCID = '00000000-0000-7000-8000-000000001999';
const ASSESSMENT_ID_A = '019e2b24-759f-76b8-bad8-0000000000a1';
const ASSESSMENT_ID_B = '019e2b24-759f-76b8-bad8-0000000000b2';
const TEST_SET_ID = '01985e7f-1234-7abc-8def-000000000a01';
const SUBMISSION_ID_A = '019e2b24-759f-76b8-bad8-000000000601';

function buildAssessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    assessment_id: ASSESSMENT_ID_A,
    tenant_id: TENANT_ID,
    instructor_gcid: INSTRUCTOR_GCID,
    test_set_id: TEST_SET_ID,
    test_set_revision_snapshot: 1,
    class_id: null,
    invited_gcids: null,
    title: 'Agile Estimation — Cohort May 2026',
    learner_facing_name: null,
    state: 'DRAFT',
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
    assessment_id: ASSESSMENT_ID_A,
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
    assessment_id: ASSESSMENT_ID_A,
    tenant_id: TENANT_ID,
    learner_gcid: '00000000-0000-7000-8000-000000002001',
    attempt_number: 1,
    state: 'SUBMITTED',
    started_at: '2026-05-20T09:05:00Z',
    submitted_at: '2026-05-20T09:30:00Z',
    last_saved_at: '2026-05-20T09:30:00Z',
    answers: [],
    ...overrides,
  };
}

function setup(): {
  service: AssessmentMonitorService;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const service = TestBed.inject(AssessmentMonitorService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

describe('AssessmentMonitorService (R+ Phase X.5)', () => {
  let service: AssessmentMonitorService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const r = setup();
    service = r.service;
    httpMock = r.httpMock;
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ── loadList ────────────────────────────────────────────────────────

  describe('loadList()', () => {
    it('issues GET /api/v1/assessments and flushes the assessments into success', () => {
      service.loadList();
      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/assessments'));
      expect(req.request.method).toBe('GET');
      const body: AssessmentListResponse = {
        items: [
          buildAssessment(),
          buildAssessment({ assessment_id: ASSESSMENT_ID_B, state: 'OPEN' }),
        ],
        next_page_token: null,
        total: 2,
      };
      req.flush(body);

      const state = service.listState();
      expect(state.status).toBe('success');
      if (state.status === 'success') {
        expect(state.assessments.length).toBe(2);
        expect(state.assessments[0].assessment_id).toBe(ASSESSMENT_ID_A);
      }
    });

    it('exposes loading until flush', () => {
      expect(service.listState().status).toBe('loading');
      service.loadList();
      expect(service.listState().status).toBe('loading');
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/assessments'))
        .flush({ items: [], next_page_token: null, total: 0 });
    });

    it('maps 5xx to error_upstream', () => {
      service.loadList();
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/assessments'))
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const state = service.listState();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('rplus.assessment_list.error_upstream');
      }
    });

    it('maps 401/403 to error_unauthorised', () => {
      service.loadList();
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/assessments'))
        .flush(null, { status: 403, statusText: 'Forbidden' });
      const state = service.listState();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('rplus.assessment_list.error_unauthorised');
      }
    });

    it('maps a network error (status 0) to error_generic', () => {
      service.loadList();
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/assessments'))
        .error(new ProgressEvent('error'));
      const state = service.listState();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('rplus.assessment_list.error_generic');
      }
    });

    it('loadList() is idempotent — second call resets to loading and recovers', () => {
      service.loadList();
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/assessments'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      expect(service.listState().status).toBe('error');
      service.loadList();
      expect(service.listState().status).toBe('loading');
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/assessments'))
        .flush({ items: [buildAssessment()], next_page_token: null, total: 1 });
      expect(service.listState().status).toBe('success');
    });
  });

  // ── loadAssessment ──────────────────────────────────────────────────

  describe('loadAssessment()', () => {
    it('issues GET /api/v1/assessments/{id} (URI-encoded)', () => {
      service.loadAssessment(ASSESSMENT_ID_A);
      const req = httpMock.expectOne((r) =>
        r.url.includes('/api/v1/assessments/'),
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.url).toContain(
        `/api/v1/assessments/${encodeURIComponent(ASSESSMENT_ID_A)}`,
      );
      req.flush(buildAssessment({ state: 'OPEN' }));
      const s = service.assessmentState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.assessment.state).toBe('OPEN');
      }
    });

    it('maps 404 to error_not_found', () => {
      service.loadAssessment(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/assessments/'))
        .flush(null, { status: 404, statusText: 'Not Found' });
      const s = service.assessmentState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_not_found');
      }
    });
  });

  // ── loadMonitor ─────────────────────────────────────────────────────

  describe('loadMonitor()', () => {
    it('issues GET /api/v1/assessments/{id}/monitor', () => {
      service.loadMonitor(ASSESSMENT_ID_A);
      const req = httpMock.expectOne((r) =>
        r.url.endsWith(
          `/api/v1/assessments/${encodeURIComponent(ASSESSMENT_ID_A)}/monitor`,
        ),
      );
      expect(req.request.method).toBe('GET');
      req.flush(buildMonitor());
      const s = service.monitorState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.monitor.total_submitted).toBe(5);
        expect(s.monitor.in_progress_count).toBe(3);
      }
    });

    it('maps 5xx to error_upstream', () => {
      service.loadMonitor(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.endsWith('/monitor'))
        .flush(null, { status: 503, statusText: 'Service Unavailable' });
      const s = service.monitorState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_upstream');
      }
    });
  });

  // ── loadSubmissions ─────────────────────────────────────────────────

  describe('loadSubmissions()', () => {
    it('issues GET /api/v1/assessments/{id}/submissions', () => {
      service.loadSubmissions(ASSESSMENT_ID_A);
      const req = httpMock.expectOne((r) =>
        r.url.endsWith(
          `/api/v1/assessments/${encodeURIComponent(ASSESSMENT_ID_A)}/submissions`,
        ),
      );
      expect(req.request.method).toBe('GET');
      const body: SubmissionListResponse = {
        items: [buildSubmission(), buildSubmission({ state: 'GRADED' })],
        next_page_token: null,
      };
      req.flush(body);
      const s = service.submissionsState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.submissions.length).toBe(2);
      }
    });

    it('maps 404 to error_not_found', () => {
      service.loadSubmissions(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.endsWith('/submissions'))
        .flush(null, { status: 404, statusText: 'Not Found' });
      const s = service.submissionsState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_not_found');
      }
    });
  });

  // ── publish CTA ─────────────────────────────────────────────────────

  describe('publish()', () => {
    it('issues POST /api/v1/assessments/{id}/publish and flushes 200 → success', () => {
      service.publish(ASSESSMENT_ID_A);
      const req = httpMock.expectOne((r) => r.url.endsWith('/publish'));
      expect(req.request.method).toBe('POST');
      req.flush(buildAssessment({ state: 'SCHEDULED' }));
      const s = service.publishState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.assessment.state).toBe('SCHEDULED');
      }
    });

    it('maps 409 to error_conflict', () => {
      service.publish(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.endsWith('/publish'))
        .flush(null, { status: 409, statusText: 'Conflict' });
      const s = service.publishState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_conflict');
      }
    });
  });

  // ── forceClose CTA ──────────────────────────────────────────────────

  describe('forceClose()', () => {
    it('issues POST /api/v1/assessments/{id}/force-close → success', () => {
      service.forceClose(ASSESSMENT_ID_A);
      const req = httpMock.expectOne((r) => r.url.endsWith('/force-close'));
      expect(req.request.method).toBe('POST');
      req.flush(buildAssessment({ state: 'CLOSED' }));
      const s = service.forceCloseState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.assessment.state).toBe('CLOSED');
      }
    });
  });

  // ── releaseResults CTA — THE CRITICAL DEMO ACTION ───────────────────

  describe('releaseResults()', () => {
    it('issues POST /api/v1/assessments/{id}/release-results → success flips state to RELEASED', () => {
      service.releaseResults(ASSESSMENT_ID_A);
      const req = httpMock.expectOne((r) =>
        r.url.endsWith('/release-results'),
      );
      expect(req.request.method).toBe('POST');
      req.flush(buildAssessment({ state: 'RELEASED' }));
      const s = service.releaseState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.assessment.state).toBe('RELEASED');
      }
    });

    it('maps 409 (not yet GRADED) to error_conflict', () => {
      service.releaseResults(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.endsWith('/release-results'))
        .flush(null, { status: 409, statusText: 'Conflict' });
      const s = service.releaseState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_conflict');
      }
    });

    it('maps 5xx to error_upstream', () => {
      service.releaseResults(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.endsWith('/release-results'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      const s = service.releaseState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_upstream');
      }
    });

    it('maps 401/403 to error_unauthorised', () => {
      service.releaseResults(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.endsWith('/release-results'))
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      const s = service.releaseState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_unauthorised');
      }
    });
  });

  // ── archive CTA ─────────────────────────────────────────────────────

  describe('archive()', () => {
    it('issues POST /api/v1/assessments/{id}/archive → success', () => {
      service.archive(ASSESSMENT_ID_A);
      const req = httpMock.expectOne((r) => r.url.endsWith('/archive'));
      expect(req.request.method).toBe('POST');
      req.flush(buildAssessment({ state: 'ARCHIVED' }));
      const s = service.archiveState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.assessment.state).toBe('ARCHIVED');
      }
    });

    it('maps 404 to error_not_found', () => {
      service.archive(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.endsWith('/archive'))
        .flush(null, { status: 404, statusText: 'Not Found' });
      const s = service.archiveState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_not_found');
      }
    });
  });

  // ── Initial signal states ───────────────────────────────────────────

  describe('initial states', () => {
    it('all load states start at loading', () => {
      expect(service.listState().status).toBe('loading');
      expect(service.assessmentState().status).toBe('loading');
      expect(service.monitorState().status).toBe('loading');
      expect(service.submissionsState().status).toBe('loading');
    });

    it('all action states start at idle', () => {
      expect(service.publishState().status).toBe('idle');
      expect(service.forceCloseState().status).toBe('idle');
      expect(service.releaseState().status).toBe('idle');
      expect(service.archiveState().status).toBe('idle');
    });
  });

  // ── computed projections ────────────────────────────────────────────

  describe('computed projections', () => {
    it('assessments computed returns [] while loading and items on success', () => {
      expect(service.assessments()).toEqual([]);
      service.loadList();
      // still loading → []
      expect(service.assessments()).toEqual([]);
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/assessments'))
        .flush({
          items: [buildAssessment(), buildAssessment({ assessment_id: ASSESSMENT_ID_B })],
          next_page_token: null,
          total: 2,
        });
      expect(service.assessments().length).toBe(2);
      expect(service.assessments()[0].assessment_id).toBe(ASSESSMENT_ID_A);
    });

    it('assessments computed returns [] after an error', () => {
      service.loadList();
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/assessments'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      expect(service.assessments()).toEqual([]);
    });

    it('assessment computed returns null while loading and the row on success', () => {
      expect(service.assessment()).toBeNull();
      service.loadAssessment(ASSESSMENT_ID_A);
      expect(service.assessment()).toBeNull();
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/assessments/'))
        .flush(buildAssessment({ state: 'OPEN' }));
      expect(service.assessment()).not.toBeNull();
      expect(service.assessment()!.state).toBe('OPEN');
    });

    it('assessment computed returns null after an error', () => {
      service.loadAssessment(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/assessments/'))
        .flush(null, { status: 404, statusText: 'Not Found' });
      expect(service.assessment()).toBeNull();
    });

    it('monitor computed returns null while loading and the envelope on success', () => {
      expect(service.monitor()).toBeNull();
      service.loadMonitor(ASSESSMENT_ID_A);
      expect(service.monitor()).toBeNull();
      httpMock
        .expectOne((r) => r.url.endsWith('/monitor'))
        .flush(buildMonitor({ total_submitted: 7 }));
      expect(service.monitor()).not.toBeNull();
      expect(service.monitor()!.total_submitted).toBe(7);
    });

    it('monitor computed returns null after an error', () => {
      service.loadMonitor(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.endsWith('/monitor'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      expect(service.monitor()).toBeNull();
    });

    it('submissions computed returns [] while loading and rows on success', () => {
      expect(service.submissions()).toEqual([]);
      service.loadSubmissions(ASSESSMENT_ID_A);
      expect(service.submissions()).toEqual([]);
      httpMock
        .expectOne((r) => r.url.endsWith('/submissions'))
        .flush({ items: [buildSubmission()], next_page_token: null });
      expect(service.submissions().length).toBe(1);
    });

    it('submissions computed returns [] after an error', () => {
      service.loadSubmissions(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.endsWith('/submissions'))
        .flush(null, { status: 404, statusText: 'Not Found' });
      expect(service.submissions()).toEqual([]);
    });
  });

  // ── submitting transition (idle → submitting before flush) ──────────

  describe('action submitting transitions', () => {
    it('publish flips to submitting before the response arrives', () => {
      expect(service.publishState().status).toBe('idle');
      service.publish(ASSESSMENT_ID_A);
      expect(service.publishState().status).toBe('submitting');
      httpMock
        .expectOne((r) => r.url.endsWith('/publish'))
        .flush(buildAssessment({ state: 'SCHEDULED' }));
      expect(service.publishState().status).toBe('success');
    });

    it('forceClose flips to submitting before the response arrives', () => {
      service.forceClose(ASSESSMENT_ID_A);
      expect(service.forceCloseState().status).toBe('submitting');
      httpMock
        .expectOne((r) => r.url.endsWith('/force-close'))
        .flush(buildAssessment({ state: 'CLOSED' }));
      expect(service.forceCloseState().status).toBe('success');
    });

    it('releaseResults flips to submitting before the response arrives', () => {
      service.releaseResults(ASSESSMENT_ID_A);
      expect(service.releaseState().status).toBe('submitting');
      httpMock
        .expectOne((r) => r.url.endsWith('/release-results'))
        .flush(buildAssessment({ state: 'RELEASED' }));
      expect(service.releaseState().status).toBe('success');
    });

    it('archive flips to submitting before the response arrives', () => {
      service.archive(ASSESSMENT_ID_A);
      expect(service.archiveState().status).toBe('submitting');
      httpMock
        .expectOne((r) => r.url.endsWith('/archive'))
        .flush(buildAssessment({ state: 'ARCHIVED' }));
      expect(service.archiveState().status).toBe('success');
    });

    it('action states are independent — publishing leaves the others idle', () => {
      service.publish(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.endsWith('/publish'))
        .flush(buildAssessment({ state: 'SCHEDULED' }));
      expect(service.publishState().status).toBe('success');
      expect(service.forceCloseState().status).toBe('idle');
      expect(service.releaseState().status).toBe('idle');
      expect(service.archiveState().status).toBe('idle');
    });
  });

  // ── error-key branch coverage ───────────────────────────────────────

  describe('listErrorKey branches', () => {
    it('maps a 400 (non-auth, sub-500) to error_generic', () => {
      service.loadList();
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/assessments'))
        .flush(null, { status: 400, statusText: 'Bad Request' });
      const s = service.listState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_list.error_generic');
      }
    });

    it('maps 401 (not just 403) to error_unauthorised', () => {
      service.loadList();
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/assessments'))
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      const s = service.listState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_list.error_unauthorised');
      }
    });
  });

  describe('monitorErrorKey branches', () => {
    it('loadAssessment maps 5xx to error_upstream', () => {
      service.loadAssessment(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/assessments/'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      const s = service.assessmentState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_upstream');
      }
    });

    it('loadAssessment maps 401/403 to error_unauthorised', () => {
      service.loadAssessment(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/assessments/'))
        .flush(null, { status: 403, statusText: 'Forbidden' });
      const s = service.assessmentState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_unauthorised');
      }
    });

    it('loadAssessment maps a non-numeric (network) error to error_generic', () => {
      service.loadAssessment(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/assessments/'))
        .error(new ProgressEvent('error'));
      const s = service.assessmentState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_generic');
      }
    });

    it('loadMonitor maps 404 to error_not_found', () => {
      service.loadMonitor(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.endsWith('/monitor'))
        .flush(null, { status: 404, statusText: 'Not Found' });
      const s = service.monitorState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_not_found');
      }
    });

    it('loadMonitor maps 401/403 to error_unauthorised', () => {
      service.loadMonitor(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.endsWith('/monitor'))
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      const s = service.monitorState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_unauthorised');
      }
    });

    it('loadSubmissions maps 5xx to error_upstream', () => {
      service.loadSubmissions(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.endsWith('/submissions'))
        .flush(null, { status: 503, statusText: 'Service Unavailable' });
      const s = service.submissionsState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_upstream');
      }
    });

    it('loadSubmissions maps a non-numeric (network) error to error_generic', () => {
      service.loadSubmissions(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.endsWith('/submissions'))
        .error(new ProgressEvent('error'));
      const s = service.submissionsState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_generic');
      }
    });
  });

  describe('actionErrorKey branches', () => {
    it('forceClose maps 404 to error_not_found', () => {
      service.forceClose(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.endsWith('/force-close'))
        .flush(null, { status: 404, statusText: 'Not Found' });
      const s = service.forceCloseState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_not_found');
      }
    });

    it('forceClose maps 5xx to error_upstream', () => {
      service.forceClose(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.endsWith('/force-close'))
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const s = service.forceCloseState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_upstream');
      }
    });

    it('publish maps 401/403 to error_unauthorised', () => {
      service.publish(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.endsWith('/publish'))
        .flush(null, { status: 403, statusText: 'Forbidden' });
      const s = service.publishState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_unauthorised');
      }
    });

    it('archive maps a non-numeric (network) error to error_generic', () => {
      service.archive(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.endsWith('/archive'))
        .error(new ProgressEvent('error'));
      const s = service.archiveState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_generic');
      }
    });

    it('archive maps a 400 (non-auth, non-conflict, sub-500) to error_generic', () => {
      service.archive(ASSESSMENT_ID_A);
      httpMock
        .expectOne((r) => r.url.endsWith('/archive'))
        .flush(null, { status: 400, statusText: 'Bad Request' });
      const s = service.archiveState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_generic');
      }
    });
  });

  // ── loadTestSet (questions panel) ───────────────────────────────────

  describe('loadTestSet()', () => {
    const testSet: MonitorTestSet = {
      test_set_id: TEST_SET_ID,
      title: 'Agile Estimation — Question Set',
      total_points: 100,
      question_count: 2,
      questions: [
        {
          test_set_question_id: 'tq-1',
          question_id: 'q-1',
          question_atom_id: 'a-1',
          question_type: 'mcq',
          points: 50,
          display_order: 1,
          snapshot: {
            question_type: 'mcq',
            prompt_preview: 'What is velocity?',
            atom_title: 'Velocity',
          },
        },
      ],
    };

    it('starts idle, then issues GET /api/v1/test-sets/{id} → success with the computed testSet', () => {
      expect(service.testSetState().status).toBe('idle');
      service.loadTestSet(TEST_SET_ID);
      expect(service.testSetState().status).toBe('loading');
      const req = httpMock.expectOne(
        (r) =>
          r.url.endsWith(
            `/api/v1/test-sets/${encodeURIComponent(TEST_SET_ID)}`,
          ) && r.method === 'GET',
      );
      req.flush(testSet);
      const s = service.testSetState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.testSet.title).toBe('Agile Estimation — Question Set');
        expect(s.testSet.questions.length).toBe(1);
      }
      expect(service.testSet()).toEqual(testSet);
    });

    it('maps 404 (non-author without test-set read scope) to error_not_found — fail-soft for the panel', () => {
      service.loadTestSet(TEST_SET_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/test-sets/'))
        .flush(null, { status: 404, statusText: 'Not Found' });
      const s = service.testSetState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_not_found');
      }
      expect(service.testSet()).toBeNull();
    });

    it('maps 5xx to error_upstream', () => {
      service.loadTestSet(TEST_SET_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/test-sets/'))
        .flush(null, { status: 503, statusText: 'Service Unavailable' });
      const s = service.testSetState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_upstream');
      }
    });

    it('maps 401/403 to error_unauthorised', () => {
      service.loadTestSet(TEST_SET_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/test-sets/'))
        .flush(null, { status: 403, statusText: 'Forbidden' });
      const s = service.testSetState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_unauthorised');
      }
    });

    it('maps a network error (status 0) to error_generic', () => {
      service.loadTestSet(TEST_SET_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/test-sets/'))
        .error(new ProgressEvent('error'));
      const s = service.testSetState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('rplus.assessment_monitor.error_generic');
      }
    });

    it('loadTestSet() is idempotent — a second call can recover from a prior error', () => {
      service.loadTestSet(TEST_SET_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/test-sets/'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      expect(service.testSetState().status).toBe('error');

      service.loadTestSet(TEST_SET_ID);
      expect(service.testSetState().status).toBe('loading');
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/test-sets/'))
        .flush(testSet);
      expect(service.testSetState().status).toBe('success');
    });
  });

  // ── getQuestionDetail (author projection → QuestionReview) ──────────

  describe('getQuestionDetail()', () => {
    it('GETs /api/atoms/{atomId}/questions/{questionId} and normalises the MCQ author projection', async () => {
      const raw: AuthorQuestionRaw = {
        question: {
          type: 'mcq',
          prompt: 'Pick the best answer',
          mcq: {
            image_url: 'https://img.chora.site/atom/a1.png',
            answer_image_url: 'https://img.chora.site/atom/ans.png',
            options: [
              {
                option_id: 'o-1',
                label: 'Correct Option',
                is_correct: true,
                explainer: 'Because it is',
              },
              { option_id: 'o-2', text: '  Wrong Option  ', is_correct: false, explainer: null },
            ],
          },
        },
      };

      const promise = firstValueFrom(service.getQuestionDetail('atom-9', 'q-7'));
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.endsWith('/api/atoms/atom-9/questions/q-7'),
      );
      req.flush(raw);
      const review = await promise;
      expect(review.question_type).toBe('mcq');
      expect(review.prompt).toBe('Pick the best answer');
      expect(review.options).toEqual([
        { option_id: 'o-1', label: 'Correct Option', is_correct: true, explainer: 'Because it is' },
        { option_id: 'o-2', label: 'Wrong Option', is_correct: false, explainer: null },
      ]);
      expect(review.model_answer).toBeNull();
      expect(review.question_image_url).toBe('https://img.chora.site/atom/a1.png');
      expect(review.answer_image_url).toBe('https://img.chora.site/atom/ans.png');
    });

    it('normalises an OE author projection with model answer + rubric', async () => {
      const raw: AuthorQuestionRaw = {
        question: {
          type: 'oe',
          prompt: 'Explain velocity',
          oe: {
            model_answer: 'The rate at which a team completes work.',
            image_url: 'https://img.chora.site/oe.png',
            answer_image_url: 'https://img.chora.site/oe-ans.png',
            rubric: {
              criteria: [
                { description: 'Defines velocity', weight_percent: 40 },
                { title: 'Example', weight: 60 },
              ],
            },
          },
        },
      };

      const promise = firstValueFrom(service.getQuestionDetail('atom-9', 'q-8'));
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.endsWith('/api/atoms/atom-9/questions/q-8'),
      );
      req.flush(raw);
      const review = await promise;
      expect(review.question_type).toBe('oe');
      expect(review.model_answer).toContain('rate');
      expect(review.rubric).toEqual([
        { title: 'Defines velocity', description: null, weight: 40 },
        { title: 'Example', description: null, weight: 60 },
      ]);
      expect(review.question_image_url).toBe('https://img.chora.site/oe.png');
    });
  });
});
