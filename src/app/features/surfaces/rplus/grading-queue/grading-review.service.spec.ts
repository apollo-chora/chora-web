import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { GradingReviewService } from './grading-review.service';
import type {
  ApproveAllResponse,
  EditGradesRequest,
  EditOverallCommentRequest,
  GradingReviewDetail,
} from './grading-review.model';
import { environment } from '../../../../../environments/environment';

const BASE = environment.bffBaseUrl;
const AID = 'assess-001';
const SID = 'sub-001';

function makeDetail(
  overrides: Partial<GradingReviewDetail> = {},
): GradingReviewDetail {
  return {
    submission_id: SID,
    assessment_id: AID,
    learner_gcid: '00000000-0000-7000-8000-000000000abc',
    state: 'GRADED',
    review_status: 'PENDING_REVIEW',
    total_points_earned: 7,
    total_points_possible: 10,
    passing_threshold_percent: 50,
    questions: [],
    ...overrides,
  };
}

describe('GradingReviewService', () => {
  let service: GradingReviewService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GradingReviewService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ── Initial state ────────────────────────────────────────────────

  it('starts every state signal at idle', () => {
    expect(service.detailState().status).toBe('idle');
    expect(service.detail()).toBeNull();
    expect(service.editGradesState().status).toBe('idle');
    expect(service.editOverallCommentState().status).toBe('idle');
    expect(service.approveState().status).toBe('idle');
    expect(service.approveAllState().status).toBe('idle');
    expect(service.releaseState().status).toBe('idle');
  });

  // ── loadGradingDetail ────────────────────────────────────────────

  it('GETs the grading-detail path and stores success state', () => {
    service.loadGradingDetail(AID, SID);
    expect(service.detailState().status).toBe('loading');

    const req = httpMock.expectOne(
      `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/submissions/${encodeURIComponent(SID)}/grading`,
    );
    expect(req.request.method).toBe('GET');

    const detail = makeDetail();
    req.flush(detail);

    const s = service.detailState();
    expect(s.status).toBe('success');
    if (s.status === 'success') {
      expect(s.detail.submission_id).toBe(SID);
    }
    expect(service.detail()?.submission_id).toBe(SID);
  });

  it('encodes assessment + submission ids in the grading path', () => {
    service.loadGradingDetail('a/b', 's d');
    const req = httpMock.expectOne(
      `${BASE}/api/v1/assessments/a%2Fb/submissions/s%20d/grading`,
    );
    req.flush(makeDetail());
    expect(service.detailState().status).toBe('success');
  });

  it('maps a 404 on detail load to error_not_found', () => {
    service.loadGradingDetail(AID, SID);
    httpMock
      .expectOne(
        `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/submissions/${encodeURIComponent(SID)}/grading`,
      )
      .flush(null, { status: 404, statusText: 'Not Found' });

    const s = service.detailState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('rplus.grading_queue.error_not_found');
    }
    expect(service.detail()).toBeNull();
  });

  it('maps a 500 on detail load to error_upstream', () => {
    service.loadGradingDetail(AID, SID);
    httpMock
      .expectOne(
        `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/submissions/${encodeURIComponent(SID)}/grading`,
      )
      .flush(null, { status: 503, statusText: 'Service Unavailable' });

    const s = service.detailState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('rplus.grading_queue.error_upstream');
    }
  });

  it('maps a 401 on detail load to error_unauthorised', () => {
    service.loadGradingDetail(AID, SID);
    httpMock
      .expectOne(
        `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/submissions/${encodeURIComponent(SID)}/grading`,
      )
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    const s = service.detailState();
    if (s.status === 'error') {
      expect(s.error).toBe('rplus.grading_queue.error_unauthorised');
    }
  });

  it('maps a 403 on detail load to error_unauthorised', () => {
    service.loadGradingDetail(AID, SID);
    httpMock
      .expectOne(
        `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/submissions/${encodeURIComponent(SID)}/grading`,
      )
      .flush(null, { status: 403, statusText: 'Forbidden' });

    const s = service.detailState();
    if (s.status === 'error') {
      expect(s.error).toBe('rplus.grading_queue.error_unauthorised');
    }
  });

  it('maps an unmapped detail status (400) to error_generic', () => {
    service.loadGradingDetail(AID, SID);
    httpMock
      .expectOne(
        `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/submissions/${encodeURIComponent(SID)}/grading`,
      )
      .flush(null, { status: 400, statusText: 'Bad Request' });

    const s = service.detailState();
    if (s.status === 'error') {
      expect(s.error).toBe('rplus.grading_queue.error_generic');
    }
  });

  // ── clearDetail / clearApproveState ──────────────────────────────

  it('clearDetail resets detail + edit + approve states to idle', () => {
    service.loadGradingDetail(AID, SID);
    httpMock
      .expectOne(
        `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/submissions/${encodeURIComponent(SID)}/grading`,
      )
      .flush(makeDetail());
    expect(service.detailState().status).toBe('success');

    service.clearDetail();
    expect(service.detailState().status).toBe('idle');
    expect(service.detail()).toBeNull();
    expect(service.editGradesState().status).toBe('idle');
    expect(service.editOverallCommentState().status).toBe('idle');
    expect(service.approveState().status).toBe('idle');
  });

  it('clearApproveState resets only the approve latch, leaving detail intact', () => {
    service.loadGradingDetail(AID, SID);
    httpMock
      .expectOne(
        `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/submissions/${encodeURIComponent(SID)}/grading`,
      )
      .flush(makeDetail({ review_status: 'APPROVED' }));

    service.clearApproveState();
    expect(service.approveState().status).toBe('idle');
    // detail survives the approve-latch reset
    expect(service.detail()?.review_status).toBe('APPROVED');
    expect(service.detailState().status).toBe('success');
  });

  // ── editGrades ───────────────────────────────────────────────────

  it('PATCHes the grades path and mirrors success into detail signal', () => {
    const body: EditGradesRequest = {
      question_edits: [
        { test_set_question_id: 'tsq-1', points_earned: 5, reason: 'partial' },
      ],
    };
    service.editGrades(AID, SID, body);
    expect(service.editGradesState().status).toBe('submitting');

    const req = httpMock.expectOne(
      `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/submissions/${encodeURIComponent(SID)}/grades`,
    );
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(body);

    const refreshed = makeDetail({ total_points_earned: 5 });
    req.flush(refreshed);

    const s = service.editGradesState();
    expect(s.status).toBe('success');
    if (s.status === 'success') {
      expect(s.detail.total_points_earned).toBe(5);
    }
    // canonical detail signal is updated too (no second GET)
    expect(service.detail()?.total_points_earned).toBe(5);
  });

  it('maps a 409 on editGrades to error_conflict and leaves detail untouched', () => {
    service.editGrades(AID, SID, { question_edits: [] });
    httpMock
      .expectOne(
        `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/submissions/${encodeURIComponent(SID)}/grades`,
      )
      .flush(null, { status: 409, statusText: 'Conflict' });

    const s = service.editGradesState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('rplus.grading_queue.error_conflict');
    }
    expect(service.detail()).toBeNull();
  });

  // ── editOverallComment ───────────────────────────────────────────

  it('PATCHes the overall-comment path and mirrors success into detail', () => {
    const body: EditOverallCommentRequest = {
      overall_comment: 'Strong work overall.',
    };
    service.editOverallComment(AID, SID, body);
    expect(service.editOverallCommentState().status).toBe('submitting');

    const req = httpMock.expectOne(
      `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/submissions/${encodeURIComponent(SID)}/overall-comment`,
    );
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(body);

    const refreshed = makeDetail({
      overall_comment: 'Strong work overall.',
      overall_comment_provenance: 'HUMAN',
    });
    req.flush(refreshed);

    const s = service.editOverallCommentState();
    expect(s.status).toBe('success');
    expect(service.detail()?.overall_comment).toBe('Strong work overall.');
    expect(service.detail()?.overall_comment_provenance).toBe('HUMAN');
  });

  it('maps a 500 on editOverallComment to error_upstream', () => {
    service.editOverallComment(AID, SID, { overall_comment: 'x' });
    httpMock
      .expectOne(
        `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/submissions/${encodeURIComponent(SID)}/overall-comment`,
      )
      .flush(null, { status: 500, statusText: 'Server Error' });

    const s = service.editOverallCommentState();
    if (s.status === 'error') {
      expect(s.error).toBe('rplus.grading_queue.error_upstream');
    }
  });

  // ── approveSubmission ────────────────────────────────────────────

  it('POSTs the approve path then refreshes the detail on success', () => {
    service.approveSubmission(AID, SID);
    expect(service.approveState().status).toBe('submitting');

    const req = httpMock.expectOne(
      `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/submissions/${encodeURIComponent(SID)}/approve`,
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    // POST returns a Submission echo (not used for state payload)
    req.flush({ id: SID });

    expect(service.approveState().status).toBe('success');

    // success triggers a follow-up GET to refresh the detail
    const refresh = httpMock.expectOne(
      `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/submissions/${encodeURIComponent(SID)}/grading`,
    );
    expect(refresh.request.method).toBe('GET');
    refresh.flush(makeDetail({ review_status: 'APPROVED' }));

    expect(service.detail()?.review_status).toBe('APPROVED');
  });

  it('maps a 409 on approveSubmission to error_conflict and does NOT refresh', () => {
    service.approveSubmission(AID, SID);
    httpMock
      .expectOne(
        `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/submissions/${encodeURIComponent(SID)}/approve`,
      )
      .flush(null, { status: 409, statusText: 'Conflict' });

    const s = service.approveState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('rplus.grading_queue.error_conflict');
    }
    // no follow-up GET issued on error (httpMock.verify in afterEach proves it)
    httpMock.expectNone(
      `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/submissions/${encodeURIComponent(SID)}/grading`,
    );
  });

  // ── approveAll ───────────────────────────────────────────────────

  it('POSTs approve-all with the default empty body', () => {
    service.approveAll(AID);
    expect(service.approveAllState().status).toBe('submitting');

    const req = httpMock.expectOne(
      `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/approve-all`,
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});

    const result: ApproveAllResponse = {
      assessment_id: AID,
      approved_submission_count: 3,
      released: false,
    };
    req.flush(result);

    const s = service.approveAllState();
    expect(s.status).toBe('success');
    if (s.status === 'success') {
      expect(s.result.approved_submission_count).toBe(3);
      expect(s.result.released).toBe(false);
    }
  });

  it('POSTs approve-all with a release body (approve-and-release)', () => {
    service.approveAll(AID, { release: true, release_announcement: 'Done!' });

    const req = httpMock.expectOne(
      `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/approve-all`,
    );
    expect(req.request.body).toEqual({
      release: true,
      release_announcement: 'Done!',
    });

    req.flush({
      assessment_id: AID,
      approved_submission_count: 5,
      released: true,
    } satisfies ApproveAllResponse);

    const s = service.approveAllState();
    if (s.status === 'success') {
      expect(s.result.released).toBe(true);
    }
  });

  it('maps a 500 on approve-all to error_upstream', () => {
    service.approveAll(AID);
    httpMock
      .expectOne(
        `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/approve-all`,
      )
      .flush(null, { status: 502, statusText: 'Bad Gateway' });

    const s = service.approveAllState();
    if (s.status === 'error') {
      expect(s.error).toBe('rplus.grading_queue.error_upstream');
    }
  });

  // ── releaseResults ───────────────────────────────────────────────

  it('POSTs release-results and stores success', () => {
    service.releaseResults(AID);
    expect(service.releaseState().status).toBe('submitting');

    const req = httpMock.expectOne(
      `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/release-results`,
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({});

    expect(service.releaseState().status).toBe('success');
  });

  it('maps a 409 on release-results to error_conflict (not all approved gate)', () => {
    service.releaseResults(AID);
    httpMock
      .expectOne(
        `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/release-results`,
      )
      .flush(null, { status: 409, statusText: 'Conflict' });

    const s = service.releaseState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('rplus.grading_queue.error_conflict');
    }
  });

  it('maps a non-numeric error on release-results to error_generic', () => {
    service.releaseResults(AID);
    const req = httpMock.expectOne(
      `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/release-results`,
    );
    // network-level error (ProgressEvent) — no numeric status
    req.error(new ProgressEvent('network'));

    const s = service.releaseState();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('rplus.grading_queue.error_generic');
    }
  });

  // ── clearBulkStates ──────────────────────────────────────────────

  it('clearBulkStates resets approve-all + release to idle', () => {
    service.approveAll(AID);
    httpMock
      .expectOne(
        `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/approve-all`,
      )
      .flush({
        assessment_id: AID,
        approved_submission_count: 1,
        released: false,
      } satisfies ApproveAllResponse);
    service.releaseResults(AID);
    httpMock
      .expectOne(
        `${BASE}/api/v1/assessments/${encodeURIComponent(AID)}/release-results`,
      )
      .flush({});

    expect(service.approveAllState().status).toBe('success');
    expect(service.releaseState().status).toBe('success');

    service.clearBulkStates();
    expect(service.approveAllState().status).toBe('idle');
    expect(service.releaseState().status).toBe('idle');
  });
});
