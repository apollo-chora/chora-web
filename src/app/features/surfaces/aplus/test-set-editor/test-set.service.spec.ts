/**
 * TestSetService spec — X.2 (ADR-155).
 *
 * 10-op CRUD against `chora-contracts/openapi/delivery-test-sets.yaml`:
 *   - listTestSets / createTestSet / getTestSet / updateTestSet / deleteTestSet
 *   - publishTestSet / archiveTestSet
 *   - addQuestionToTestSet / updateTestSetQuestion / removeTestSetQuestion
 *
 * Per chora-web CLAUDE.md §6: Vitest 4 + `httpMock.verify()` in afterEach.
 * Per `feedback_no_stubs_real_wiring`: real wire calls, fail-loud on 5xx.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { TestSetService } from './test-set.service';
import {
  DEFAULT_GRADING_CONFIG,
  type TestSet,
  type TestSetListResponse,
  type TestSetQuestion,
  type TestSetWithQuestions,
} from './test-set-editor.model';

const TENANT_ID = '11111111-1111-7111-8111-111111111111';
const TEST_SET_ID = '01985e7f-1234-7abc-8def-00000000ts01';
const TEST_SET_QUESTION_ID = '01985e7f-1234-7abc-8def-00000000tq01';
const QUESTION_ID = '01985e7f-1234-7abc-8def-000000000001';
const AUTHOR_GCID = '00000000-0000-7000-8000-000000001999';

function buildTestSet(overrides: Partial<TestSet> = {}): TestSet {
  return {
    test_set_id: TEST_SET_ID,
    tenant_id: TENANT_ID,
    author_gcid: AUTHOR_GCID,
    title: 'Agile Estimation — Mid-Term',
    description: 'Mid-term assessment.',
    learner_facing_name: 'Agile Estimation Quiz',
    tags: ['agile', 'mid-term'],
    state: 'DRAFT',
    total_points: 0,
    question_count: 0,
    revision_number: 1,
    parent_test_set_id: null,
    default_grading_config: DEFAULT_GRADING_CONFIG,
    deleted_at: null,
    created_at: '2026-05-15T08:00:00Z',
    updated_at: '2026-05-15T08:00:00Z',
    published_at: null,
    archived_at: null,
    ...overrides,
  };
}

function buildTestSetQuestion(overrides: Partial<TestSetQuestion> = {}): TestSetQuestion {
  return {
    test_set_question_id: TEST_SET_QUESTION_ID,
    test_set_id: TEST_SET_ID,
    question_id: QUESTION_ID,
    question_atom_id: '01985e7f-1234-7abc-8def-000000000a01',
    question_revision_number: 1,
    points: 10,
    display_order: 1,
    required: true,
    snapshot: {
      question_id: QUESTION_ID,
      atom_id: '01985e7f-1234-7abc-8def-000000000a01',
      atom_title: 'SOLID — Open-Closed Principle',
      question_type: 'mcq',
      prompt_preview: 'Which describes the Open-Closed Principle...',
      revision_number: 1,
    },
    added_at: '2026-05-15T08:30:00Z',
    ...overrides,
  };
}

function buildTestSetWithQuestions(): TestSetWithQuestions {
  return {
    ...buildTestSet({ total_points: 10, question_count: 1 }),
    questions: [buildTestSetQuestion()],
  };
}

function setup(): { service: TestSetService; httpMock: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(TestSetService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('TestSetService', () => {
  let service: TestSetService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ service, httpMock } = setup());
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('listTestSets()', () => {
    it('GETs /api/v1/test-sets with default sort + page_size', () => {
      service.listTestSets({}).subscribe();
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/v1/test-sets'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('sort')).toBe('created_at:desc');
      expect(req.request.params.get('page_size')).toBe('20');
      req.flush({ items: [] });
    });

    it('returns the canonical {items, next_page_token, total} envelope', () => {
      let captured: TestSetListResponse | undefined;
      service.listTestSets({}).subscribe((res) => (captured = res));
      httpMock.expectOne((r) => r.url.endsWith('/api/v1/test-sets')).flush({
        items: [buildTestSet()],
        next_page_token: 'token-abc',
        total: 5,
      });
      expect(captured?.items.length).toBe(1);
      expect(captured?.items[0].test_set_id).toBe(TEST_SET_ID);
      expect(captured?.next_page_token).toBe('token-abc');
      expect(captured?.total).toBe(5);
    });

    it('sends explicit state filter (DRAFT + PUBLISHED) as repeated params', () => {
      service.listTestSets({ state: ['DRAFT', 'PUBLISHED'] }).subscribe();
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/v1/test-sets'));
      expect(req.request.params.getAll('state')).toEqual(['DRAFT', 'PUBLISHED']);
      req.flush({ items: [] });
    });

    it('forwards source_job_id for the 1c batch discovery poll', () => {
      // Lane 1c (CHO-1703 / ADR-180 D10): the batch-authoring FE polls
      // `GET /test-sets?source_job_id={job_id}` (2s, ≤30s) after accept to
      // discover the event-assembled DRAFT test set.
      const jobId = '01985e7f-9999-7abc-8def-00000000jb01';
      service.listTestSets({ source_job_id: jobId }).subscribe();
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/v1/test-sets'));
      expect(req.request.params.get('source_job_id')).toBe(jobId);
      req.flush({ items: [] });
    });
  });

  describe('createTestSet()', () => {
    it('POSTs /api/v1/test-sets with the create request body', () => {
      let captured: TestSet | undefined;
      service
        .createTestSet({
          title: 'New Quiz',
          tags: ['demo'],
          default_grading_config: DEFAULT_GRADING_CONFIG,
        })
        .subscribe((ts) => (captured = ts));
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/v1/test-sets'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        title: 'New Quiz',
        tags: ['demo'],
        default_grading_config: DEFAULT_GRADING_CONFIG,
      });
      req.flush(buildTestSet({ title: 'New Quiz' }));
      expect(captured?.title).toBe('New Quiz');
      expect(captured?.state).toBe('DRAFT');
    });
  });

  describe('getTestSet()', () => {
    it('GETs /api/v1/test-sets/{id} and returns TestSetWithQuestions', () => {
      let captured: TestSetWithQuestions | undefined;
      service.getTestSet(TEST_SET_ID).subscribe((ts) => (captured = ts));
      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`),
      );
      expect(req.request.method).toBe('GET');
      req.flush(buildTestSetWithQuestions());
      expect(captured?.questions.length).toBe(1);
      expect(captured?.questions[0].points).toBe(10);
    });

    it('propagates 404 with NotFound code', () => {
      let errStatus: number | undefined;
      service.getTestSet(TEST_SET_ID).subscribe({
        error: (err: { status: number }) => (errStatus = err.status),
      });
      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`),
      );
      req.flush({ error: { code: 'NOT_FOUND' } }, {
        status: 404,
        statusText: 'Not Found',
      });
      expect(errStatus).toBe(404);
    });
  });

  describe('updateTestSet()', () => {
    it('PATCHes /api/v1/test-sets/{id} with metadata diff', () => {
      service.updateTestSet(TEST_SET_ID, { title: 'Renamed' }).subscribe();
      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`),
      );
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ title: 'Renamed' });
      req.flush(buildTestSet({ title: 'Renamed' }));
    });
  });

  describe('deleteTestSet()', () => {
    it('DELETEs /api/v1/test-sets/{id} and resolves on 204', () => {
      let ok = false;
      service.deleteTestSet(TEST_SET_ID).subscribe(() => (ok = true));
      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`),
      );
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect(ok).toBe(true);
    });
  });

  describe('publishTestSet()', () => {
    it('POSTs /api/v1/test-sets/{id}/publish and returns PUBLISHED test-set', () => {
      let captured: TestSet | undefined;
      service.publishTestSet(TEST_SET_ID).subscribe((ts) => (captured = ts));
      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}/publish`),
      );
      expect(req.request.method).toBe('POST');
      req.flush(buildTestSet({ state: 'PUBLISHED', published_at: '2026-05-15T09:00:00Z' }));
      expect(captured?.state).toBe('PUBLISHED');
    });

    it('propagates 409 DELIVERY_TEST_SET_NO_QUESTIONS', () => {
      let errStatus: number | undefined;
      let errCode: string | undefined;
      service.publishTestSet(TEST_SET_ID).subscribe({
        error: (err: { status: number; error: { code: string } }) => {
          errStatus = err.status;
          errCode = err.error?.code;
        },
      });
      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}/publish`),
      );
      req.flush(
        { code: 'DELIVERY_TEST_SET_NO_QUESTIONS', message: 'empty test-set' },
        { status: 409, statusText: 'Conflict' },
      );
      expect(errStatus).toBe(409);
      expect(errCode).toBe('DELIVERY_TEST_SET_NO_QUESTIONS');
    });
  });

  describe('archiveTestSet()', () => {
    it('POSTs /api/v1/test-sets/{id}/archive and returns ARCHIVED test-set', () => {
      let captured: TestSet | undefined;
      service.archiveTestSet(TEST_SET_ID).subscribe((ts) => (captured = ts));
      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}/archive`),
      );
      expect(req.request.method).toBe('POST');
      req.flush(buildTestSet({ state: 'ARCHIVED', archived_at: '2026-05-15T10:00:00Z' }));
      expect(captured?.state).toBe('ARCHIVED');
    });
  });

  describe('addQuestion()', () => {
    it('POSTs /api/v1/test-sets/{id}/questions with the AddTestSetQuestionRequest body', () => {
      let captured: TestSetQuestion | undefined;
      service
        .addQuestion(TEST_SET_ID, {
          question_atom_id: '01985e7f-1234-7abc-8def-000000000a01',
          question_id: QUESTION_ID,
          question_type: 'mcq',
          points: 10,
        })
        .subscribe((q) => (captured = q));
      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}/questions`),
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        question_atom_id: '01985e7f-1234-7abc-8def-000000000a01',
        question_id: QUESTION_ID,
        question_type: 'mcq',
        points: 10,
      });
      req.flush(buildTestSetQuestion());
      expect(captured?.test_set_question_id).toBe(TEST_SET_QUESTION_ID);
      expect(captured?.points).toBe(10);
    });

    it('propagates 409 DELIVERY_TEST_SET_PUBLISHED_IMMUTABLE on PUBLISHED parent', () => {
      let errStatus: number | undefined;
      let errCode: string | undefined;
      service
        .addQuestion(TEST_SET_ID, { question_atom_id: '01985e7f-1234-7abc-8def-000000000a01', question_id: QUESTION_ID, question_type: 'mcq', points: 10 })
        .subscribe({
          error: (err: { status: number; error: { error: { code: string } } }) => {
            errStatus = err.status;
            errCode = err.error?.error?.code;
          },
        });
      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}/questions`),
      );
      req.flush(
        { error: { code: 'DELIVERY_TEST_SET_PUBLISHED_IMMUTABLE', message: 'frozen' } },
        { status: 409, statusText: 'Conflict' },
      );
      expect(errStatus).toBe(409);
      expect(errCode).toBe('DELIVERY_TEST_SET_PUBLISHED_IMMUTABLE');
    });
  });

  describe('updateQuestion()', () => {
    it('PATCHes /api/v1/test-sets/{tsId}/questions/{tsqId} with points/display_order/required', () => {
      service
        .updateQuestion(TEST_SET_ID, TEST_SET_QUESTION_ID, { points: 25 })
        .subscribe();
      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}/questions/${TEST_SET_QUESTION_ID}`),
      );
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ points: 25 });
      req.flush(buildTestSetQuestion({ points: 25 }));
    });

    it('PATCHes only display_order when reordering (CR2-C1)', () => {
      service
        .updateQuestion(TEST_SET_ID, TEST_SET_QUESTION_ID, { display_order: 4 })
        .subscribe();
      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}/questions/${TEST_SET_QUESTION_ID}`),
      );
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ display_order: 4 });
      req.flush(buildTestSetQuestion({ display_order: 4 }));
    });
  });

  describe('removeQuestion()', () => {
    it('DELETEs /api/v1/test-sets/{tsId}/questions/{tsqId} and resolves on 204', () => {
      let ok = false;
      service
        .removeQuestion(TEST_SET_ID, TEST_SET_QUESTION_ID)
        .subscribe(() => (ok = true));
      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}/questions/${TEST_SET_QUESTION_ID}`),
      );
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect(ok).toBe(true);
    });
  });
});
