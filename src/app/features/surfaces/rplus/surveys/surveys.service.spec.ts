/**
 * SurveysService spec — R+ /r/surveys
 * (real BFF wiring; HttpTestingController flushes real envelopes).
 *
 * Verifies the service issues the documented HTTP shape on the BFF and
 * maps the snake_case backend envelope into the typed FE model.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { SurveysService } from './surveys.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { environment } from '../../../../../environments/environment';

const BASE = `${environment.bffBaseUrl}/api/v1/surveys`;

describe('SurveysService', () => {
  let service: SurveysService;
  let httpMock: HttpTestingController;
  let tenants: TenantContextService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SurveysService);
    httpMock = TestBed.inject(HttpTestingController);
    tenants = TestBed.inject(TenantContextService);
    tenants.setCurrentTenant({
      id: 'tenant-001',
      name: 'MTM Singapore',
      slug: 'mtm',
      logoUrl: null,
    });
  });

  afterEach(() => httpMock.verify());

  describe('list', () => {
    it('GETs /api/v1/surveys on the BFF (no filters)', async () => {
      const promise = firstValueFrom(service.list());
      const req = httpMock.expectOne(BASE);
      expect(req.request.method).toBe('GET');
      req.flush({ items: [] });
      const out = await promise;
      expect(out.totalSurveys).toBe(0);
      expect(out.items).toEqual([]);
    });

    it('maps the backend survey envelope into the typed model', async () => {
      const promise = firstValueFrom(service.list());
      const req = httpMock.expectOne(BASE);
      req.flush({
        items: [
          {
            id: 'survey-001',
            tenant_id: 'tenant-001',
            course_id: 'course-cspo',
            title: 'Mid-course pulse',
            questions: [
              {
                question_id: 'q1',
                prompt: 'How clear were the slides?',
                type: 'LIKERT',
              },
              {
                question_id: 'q2',
                prompt: 'Choose:',
                type: 'MULTIPLE_CHOICE',
                options: ['A', 'B'],
              },
            ],
            distributed_to: ['gcid-1', 'gcid-2'],
            state: 'DISTRIBUTED',
            response_count: 1,
            created_at: '2026-05-20T10:00:00Z',
            updated_at: '2026-05-21T11:00:00Z',
            distributed_at: '2026-05-21T11:00:00Z',
          },
        ],
      });
      const out = await promise;
      expect(out.totalSurveys).toBe(1);
      const survey = out.items[0]!;
      expect(survey.id).toBe('survey-001');
      expect(survey.tenantId).toBe('tenant-001');
      expect(survey.courseId).toBe('course-cspo');
      expect(survey.title).toBe('Mid-course pulse');
      expect(survey.state).toBe('DISTRIBUTED');
      expect(survey.responseCount).toBe(1);
      expect(survey.distributedAt).toBe('2026-05-21T11:00:00Z');
      expect(survey.closedAt).toBeNull();
      expect(survey.questions.length).toBe(2);
      expect(survey.questions[0]!.questionId).toBe('q1');
      expect(survey.questions[1]!.options).toEqual(['A', 'B']);
      expect(survey.distributedTo).toEqual(['gcid-1', 'gcid-2']);
    });

    it('coerces missing optional fields to null in the model', async () => {
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(BASE).flush({
        items: [
          {
            id: 'survey-002',
            tenant_id: 'tenant-001',
            course_id: 'course-x',
            title: 'Draft survey',
            questions: [],
            distributed_to: [],
            state: 'DRAFT',
            response_count: 0,
            created_at: '2026-05-26T09:00:00Z',
            updated_at: '2026-05-26T09:00:00Z',
          },
        ],
      });
      const out = await promise;
      const s = out.items[0]!;
      expect(s.state).toBe('DRAFT');
      expect(s.distributedAt).toBeNull();
      expect(s.closedAt).toBeNull();
    });

    it('forwards state filter as ?state= query param', async () => {
      const promise = firstValueFrom(service.list({ state: 'DRAFT' }));
      const req = httpMock.expectOne(
        (r) => r.url === BASE && r.params.get('state') === 'DRAFT',
      );
      expect(req.request.method).toBe('GET');
      req.flush({ items: [] });
      await promise;
    });

    it('omits the state param when filter not supplied', async () => {
      const promise = firstValueFrom(service.list());
      const req = httpMock.expectOne(BASE);
      expect(req.request.params.has('state')).toBe(false);
      req.flush({ items: [] });
      await promise;
    });

    it('pulls tenantName from TenantContextService', async () => {
      tenants.setCurrentTenant({
        id: 'tenant-009',
        name: 'Acme Learning Co',
        slug: 'acme',
        logoUrl: null,
      });
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(BASE).flush({ items: [] });
      const out = await promise;
      expect(out.tenantName).toBe('Acme Learning Co');
    });

    it('defaults tenantName to "Current tenant" when no tenant context', async () => {
      tenants.setCurrentTenant(null as never);
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(BASE).flush({ items: [] });
      const out = await promise;
      expect(out.tenantName).toBe('Current tenant');
    });
  });

  describe('get', () => {
    it('GETs /api/v1/surveys/{id}', async () => {
      const promise = firstValueFrom(service.get('survey-001'));
      const req = httpMock.expectOne(`${BASE}/survey-001`);
      expect(req.request.method).toBe('GET');
      req.flush({
        id: 'survey-001',
        tenant_id: 'tenant-001',
        course_id: 'course-x',
        title: 'T',
        questions: [],
        distributed_to: [],
        state: 'DRAFT',
        response_count: 0,
        created_at: '2026-05-26T09:00:00Z',
        updated_at: '2026-05-26T09:00:00Z',
      });
      const s = await promise;
      expect(s.id).toBe('survey-001');
    });
  });

  describe('create', () => {
    it('POSTs to /api/v1/surveys with author payload', async () => {
      const promise = firstValueFrom(
        service.create({
          courseId: 'course-cspo',
          title: 'Mid-course pulse',
          questions: [
            { prompt: 'P1?', type: 'LIKERT' },
            {
              prompt: 'Choose:',
              type: 'MULTIPLE_CHOICE',
              options: ['A', 'B'],
            },
          ],
        }),
      );
      const req = httpMock.expectOne(BASE);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        course_id: 'course-cspo',
        title: 'Mid-course pulse',
        questions: [
          { prompt: 'P1?', type: 'LIKERT' },
          { prompt: 'Choose:', type: 'MULTIPLE_CHOICE', options: ['A', 'B'] },
        ],
      });
      req.flush({
        id: 'survey-new',
        tenant_id: 'tenant-001',
        course_id: 'course-cspo',
        title: 'Mid-course pulse',
        questions: [
          { question_id: 'q1', prompt: 'P1?', type: 'LIKERT' },
          {
            question_id: 'q2',
            prompt: 'Choose:',
            type: 'MULTIPLE_CHOICE',
            options: ['A', 'B'],
          },
        ],
        distributed_to: [],
        state: 'DRAFT',
        response_count: 0,
        created_at: '2026-05-26T10:00:00Z',
        updated_at: '2026-05-26T10:00:00Z',
      });
      const s = await promise;
      expect(s.id).toBe('survey-new');
      expect(s.state).toBe('DRAFT');
    });
  });

  describe('publish', () => {
    it('POSTs to /{id}/publish with recipients', async () => {
      const promise = firstValueFrom(
        service.publish('survey-001', ['gcid-a', 'gcid-b']),
      );
      const req = httpMock.expectOne(`${BASE}/survey-001/publish`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ recipients: ['gcid-a', 'gcid-b'] });
      req.flush({
        id: 'survey-001',
        tenant_id: 'tenant-001',
        course_id: 'course-x',
        title: 'T',
        questions: [],
        distributed_to: ['gcid-a', 'gcid-b'],
        state: 'DISTRIBUTED',
        response_count: 0,
        created_at: '2026-05-26T10:00:00Z',
        updated_at: '2026-05-26T11:00:00Z',
        distributed_at: '2026-05-26T11:00:00Z',
      });
      const s = await promise;
      expect(s.state).toBe('DISTRIBUTED');
      expect(s.distributedTo).toEqual(['gcid-a', 'gcid-b']);
    });
  });

  describe('close', () => {
    it('POSTs to /{id}/close', async () => {
      const promise = firstValueFrom(service.close('survey-001'));
      const req = httpMock.expectOne(`${BASE}/survey-001/close`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({
        id: 'survey-001',
        tenant_id: 'tenant-001',
        course_id: 'course-x',
        title: 'T',
        questions: [],
        distributed_to: ['gcid-a'],
        state: 'CLOSED',
        response_count: 1,
        created_at: '2026-05-26T10:00:00Z',
        updated_at: '2026-05-26T12:00:00Z',
        distributed_at: '2026-05-26T11:00:00Z',
        closed_at: '2026-05-26T12:00:00Z',
      });
      const s = await promise;
      expect(s.state).toBe('CLOSED');
      expect(s.closedAt).toBe('2026-05-26T12:00:00Z');
    });
  });

  describe('submitResponse', () => {
    it('POSTs to /{id}/responses with answers', async () => {
      const promise = firstValueFrom(
        service.submitResponse('survey-001', {
          answers: [
            { questionId: 'q1', value: '5' },
            { questionId: 'q2', value: 'good' },
          ],
        }),
      );
      const req = httpMock.expectOne(`${BASE}/survey-001/responses`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        answers: [
          { question_id: 'q1', value: '5' },
          { question_id: 'q2', value: 'good' },
        ],
      });
      req.flush({
        id: 'resp-001',
        survey_id: 'survey-001',
        gcid: 'gcid-phyllis',
        answers: [
          { question_id: 'q1', value: '5' },
          { question_id: 'q2', value: 'good' },
        ],
        submitted_at: '2026-05-26T13:00:00Z',
      });
      const r = await promise;
      expect(r.id).toBe('resp-001');
      expect(r.gcid).toBe('gcid-phyllis');
      expect(r.answers.length).toBe(2);
      expect(r.answers[0]!.questionId).toBe('q1');
    });
  });

  describe('listResponses', () => {
    it('GETs /{id}/responses', async () => {
      const promise = firstValueFrom(service.listResponses('survey-001'));
      const req = httpMock.expectOne(`${BASE}/survey-001/responses`);
      expect(req.request.method).toBe('GET');
      req.flush({
        items: [
          {
            id: 'resp-001',
            survey_id: 'survey-001',
            gcid: 'gcid-a',
            answers: [{ question_id: 'q1', value: '5' }],
            submitted_at: '2026-05-26T13:00:00Z',
          },
          {
            id: 'resp-002',
            survey_id: 'survey-001',
            gcid: 'gcid-b',
            answers: [{ question_id: 'q1', value: '3' }],
            submitted_at: '2026-05-26T13:30:00Z',
          },
        ],
      });
      const out = await promise;
      expect(out.totalResponses).toBe(2);
      expect(out.surveyId).toBe('survey-001');
      expect(out.items[0]!.gcid).toBe('gcid-a');
      expect(out.items[1]!.gcid).toBe('gcid-b');
    });
  });

  describe('url encoding', () => {
    it('url-encodes survey id segments in action URLs', async () => {
      const id = 'with/slash';
      const promise = firstValueFrom(service.close(id));
      const req = httpMock.expectOne(
        `${BASE}/${encodeURIComponent(id)}/close`,
      );
      req.flush({
        id,
        tenant_id: 'tenant-001',
        course_id: 'course-x',
        title: 'T',
        questions: [],
        distributed_to: [],
        state: 'CLOSED',
        response_count: 0,
        created_at: '2026-05-26T00:00:00Z',
        updated_at: '2026-05-26T01:00:00Z',
        closed_at: '2026-05-26T01:00:00Z',
      });
      await promise;
    });
  });
});
