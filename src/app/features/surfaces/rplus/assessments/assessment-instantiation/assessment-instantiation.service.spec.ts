import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { AssessmentInstantiationService } from './assessment-instantiation.service';
import type {
  CreateAssessmentRequest,
  CreatedAssessment,
  TestSetListResponse,
  TestSetPickerRow,
} from './assessment-instantiation.model';

/**
 * AssessmentInstantiationService spec — R+ Phase X.4.
 *
 * Wired LIVE to the real BFF routes:
 *   - GET  /api/v1/test-sets?state=PUBLISHED → loadPublishedTestSets()
 *   - POST /api/v1/assessments               → createAssessment()
 *
 * Per chora-web CLAUDE.md §6 — `httpMock.verify()` in afterEach.
 */

const TEST_SET_A: TestSetPickerRow = {
  test_set_id: '01985e7f-1234-7abc-8def-000000000a01',
  tenant_id: '11111111-1111-7111-8111-111111111111',
  author_gcid: '00000000-0000-7000-8000-000000001999',
  title: 'Agile Estimation Test Set',
  description: 'Mid-term agile estimation set.',
  learner_facing_name: 'Agile Estimation',
  state: 'PUBLISHED',
  total_points: 100,
  question_count: 10,
  revision_number: 1,
  created_at: '2026-05-10T10:00:00Z',
  updated_at: '2026-05-12T10:00:00Z',
  published_at: '2026-05-12T10:00:00Z',
};

const TEST_SET_B: TestSetPickerRow = {
  ...TEST_SET_A,
  test_set_id: '01985e7f-1234-7abc-8def-000000000a02',
  title: 'Velocity & Burndown Test Set',
  question_count: 5,
};

const CREATED_ASSESSMENT: CreatedAssessment = {
  assessment_id: '019e2b24-759f-76b8-bad8-000000000a01',
  tenant_id: '11111111-1111-7111-8111-111111111111',
  instructor_gcid: '00000000-0000-7000-8000-000000001999',
  test_set_id: TEST_SET_A.test_set_id,
  title: 'Agile Estimation — Cohort May 2026',
  invited_gcids: ['00000000-0000-7000-8000-000000002001'],
  state: 'DRAFT',
  created_at: '2026-05-16T10:00:00Z',
};

function buildRequest(): CreateAssessmentRequest {
  return {
    test_set_id: TEST_SET_A.test_set_id,
    title_override: 'Agile Estimation — Cohort May 2026',
    invited_gcids: ['00000000-0000-7000-8000-000000002001'],
    grading_config_override: { auto_release: false },
    max_attempts: 1,
  };
}

function setup(): {
  service: AssessmentInstantiationService;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const service = TestBed.inject(AssessmentInstantiationService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

describe('AssessmentInstantiationService (R+ Phase X.4)', () => {
  let service: AssessmentInstantiationService;
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

  describe('loadPublishedTestSets()', () => {
    it('issues GET /api/v1/test-sets?state=PUBLISHED and flushes items into success', () => {
      service.loadPublishedTestSets();
      const req = httpMock.expectOne(
        (r) =>
          r.url.includes('/api/v1/test-sets') &&
          r.params.get('state') === 'PUBLISHED',
      );
      expect(req.request.method).toBe('GET');
      const body: TestSetListResponse = {
        items: [TEST_SET_A, TEST_SET_B],
        next_page_token: null,
        total: 2,
      };
      req.flush(body);
      const s = service.testSetsState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.items.length).toBe(2);
        expect(s.items[0].test_set_id).toBe(TEST_SET_A.test_set_id);
      }
    });

    it('exposes loading until flush', () => {
      expect(service.testSetsState().status).toBe('idle');
      service.loadPublishedTestSets();
      expect(service.testSetsState().status).toBe('loading');
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/test-sets'))
        .flush({ items: [], next_page_token: null, total: 0 });
    });

    it('maps 5xx to error_upstream', () => {
      service.loadPublishedTestSets();
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/test-sets'))
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const s = service.testSetsState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe(
          'rplus.assessment_instantiation.test_set_picker_error',
        );
      }
    });

    it('maps a network error to picker_error', () => {
      service.loadPublishedTestSets();
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/test-sets'))
        .error(new ProgressEvent('error'));
      const s = service.testSetsState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe(
          'rplus.assessment_instantiation.test_set_picker_error',
        );
      }
    });
  });

  describe('createAssessment()', () => {
    it('issues POST /api/v1/assessments with the canonical body shape', () => {
      service.createAssessment(buildRequest());
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/v1/assessments'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(buildRequest());
      req.flush(CREATED_ASSESSMENT, { status: 201, statusText: 'Created' });
      const s = service.createState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.assessment.assessment_id).toBe(
          CREATED_ASSESSMENT.assessment_id,
        );
      }
    });

    it('flips createState to submitting immediately', () => {
      service.createAssessment(buildRequest());
      expect(service.createState().status).toBe('submitting');
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/assessments'))
        .flush(CREATED_ASSESSMENT, { status: 201, statusText: 'Created' });
    });

    it('maps 400 to submit_error_4xx with no field-errors', () => {
      service.createAssessment(buildRequest());
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/assessments'))
        .flush(null, { status: 400, statusText: 'Bad Request' });
      const s = service.createState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.errorKey).toBe('rplus.assessment_instantiation.submit_error_4xx');
      }
    });

    it('maps 422 with details to submit_error_4xx + field errors', () => {
      service.createAssessment(buildRequest());
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/assessments'))
        .flush(
          {
            error: {
              code: 'DELIVERY_VALIDATION_FAILED',
              message: 'Invalid window',
              details: {
                title: 'Title is too long',
                scheduled_open_at: 'open >= close',
              },
            },
          },
          { status: 422, statusText: 'Unprocessable Entity' },
        );
      const s = service.createState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.errorKey).toBe('rplus.assessment_instantiation.submit_error_4xx');
        expect(s.fieldErrors?.['title']).toBe('Title is too long');
        expect(s.fieldErrors?.['scheduled_open_at']).toBe('open >= close');
      }
    });

    it('maps 5xx to submit_error_5xx', () => {
      service.createAssessment(buildRequest());
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/assessments'))
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const s = service.createState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.errorKey).toBe('rplus.assessment_instantiation.submit_error_5xx');
      }
    });

    it('maps a network error to submit_error_generic', () => {
      service.createAssessment(buildRequest());
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/assessments'))
        .error(new ProgressEvent('error'));
      const s = service.createState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.errorKey).toBe(
          'rplus.assessment_instantiation.submit_error_generic',
        );
      }
    });

    it('reset() clears createState back to idle', () => {
      service.createAssessment(buildRequest());
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/assessments'))
        .flush(null, { status: 500, statusText: 'Internal' });
      expect(service.createState().status).toBe('error');
      service.resetCreate();
      expect(service.createState().status).toBe('idle');
    });
  });
});
