/**
 * QuizBuilderService spec — R+ M9 wave-5 (real BFF wiring).
 *
 * Verifies the 5 operations:
 *   - GET    /api/v1/live-quizzes
 *   - GET    /api/v1/live-quizzes/{id}
 *   - POST   /api/v1/live-quizzes
 *   - PATCH  /api/v1/live-quizzes/{id}
 *   - POST   /api/v1/live-quizzes/{id}/publish
 *
 * Pattern mirrors wbl.service.spec.ts (chora-web/CLAUDE.md §6):
 *   - provideHttpClient() + provideHttpClientTesting()
 *   - HttpTestingController.expectOne + req.flush
 *   - httpMock.verify() in afterEach
 * No inline mocks per `feedback_no_stubs_real_wiring`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { QuizBuilderService } from './quiz-builder.service';
import { environment } from '../../../../../environments/environment';
import type {
  BackendLiveQuiz,
  BackendLiveQuizQuestion,
} from './quiz-builder.model';

const ROOT = `${environment.bffBaseUrl}/api/v1/live-quizzes`;

function backendQuiz(
  overrides: Partial<BackendLiveQuiz> = {},
): BackendLiveQuiz {
  return {
    id: 'lq-001',
    tenant_id: 'tenant-001',
    course_id: 'course-cspo',
    instructor_gcid: 'gcid-mr-chen',
    title: 'CSPO Sprint Planning',
    state: 'DRAFT',
    questions: [],
    created_at: '2026-05-26T10:00:00Z',
    updated_at: '2026-05-26T10:00:00Z',
    ...overrides,
  };
}

function validQuestion(): BackendLiveQuizQuestion {
  return {
    question_id: 'q1',
    prompt: 'Which Scrum ceremony kicks off a Sprint?',
    timer_seconds: 60,
    points: 10,
    options: [
      { label: 'Sprint Review', is_correct: false },
      { label: 'Sprint Planning', is_correct: true },
      { label: 'Daily Scrum', is_correct: false },
      { label: 'Retrospective', is_correct: false },
    ],
  };
}

describe('QuizBuilderService', () => {
  let service: QuizBuilderService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(QuizBuilderService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('list', () => {
    it('GETs /api/v1/live-quizzes on the BFF and maps the envelope', async () => {
      const promise = firstValueFrom(service.list());
      const req = httpMock.expectOne(ROOT);
      expect(req.request.method).toBe('GET');
      req.flush({ items: [backendQuiz({ id: 'lq-aaa', title: 'A' })] });

      const out = await promise;
      expect(out).toHaveLength(1);
      expect(out[0]!.id).toBe('lq-aaa');
      expect(out[0]!.title).toBe('A');
      expect(out[0]!.state).toBe('DRAFT');
    });

    it('returns an empty list when BE has no rows', async () => {
      const promise = firstValueFrom(service.list());
      httpMock.expectOne(ROOT).flush({ items: [] });
      const out = await promise;
      expect(out).toHaveLength(0);
    });
  });

  describe('get(id)', () => {
    it('GETs /api/v1/live-quizzes/{id}', async () => {
      const promise = firstValueFrom(service.get('lq-xyz'));
      const req = httpMock.expectOne(`${ROOT}/lq-xyz`);
      expect(req.request.method).toBe('GET');
      req.flush(backendQuiz({ id: 'lq-xyz', title: 'XYZ' }));
      const out = await promise;
      expect(out.id).toBe('lq-xyz');
      expect(out.title).toBe('XYZ');
    });

    it('URL-encodes the id', async () => {
      const promise = firstValueFrom(service.get('lq with space'));
      httpMock
        .expectOne(`${ROOT}/lq%20with%20space`)
        .flush(backendQuiz({ id: 'lq with space' }));
      await promise;
    });
  });

  describe('create', () => {
    it('POSTs course_id + title to /api/v1/live-quizzes', async () => {
      const promise = firstValueFrom(
        service.create({
          courseId: 'course-cspo',
          title: 'Sprint Planning',
        }),
      );
      const req = httpMock.expectOne(ROOT);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        course_id: 'course-cspo',
        title: 'Sprint Planning',
      });
      req.flush(
        backendQuiz({
          id: 'lq-new',
          title: 'Sprint Planning',
          state: 'DRAFT',
        }),
      );
      const out = await promise;
      expect(out.id).toBe('lq-new');
      expect(out.state).toBe('DRAFT');
    });
  });

  describe('update', () => {
    it('PATCHes title + questions to /api/v1/live-quizzes/{id}', async () => {
      const promise = firstValueFrom(
        service.update('lq-001', {
          title: 'Sprint Planning v2',
          questions: [validQuestion()],
        }),
      );
      const req = httpMock.expectOne(`${ROOT}/lq-001`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({
        title: 'Sprint Planning v2',
        questions: [validQuestion()],
      });
      req.flush(
        backendQuiz({
          id: 'lq-001',
          title: 'Sprint Planning v2',
          questions: [validQuestion()],
        }),
      );
      const out = await promise;
      expect(out.title).toBe('Sprint Planning v2');
      expect(out.items).toHaveLength(1);
      expect(out.items[0]!.correctKey).toBe('B');
    });
  });

  describe('publish', () => {
    it('POSTs /api/v1/live-quizzes/{id}/publish with an empty body', async () => {
      const promise = firstValueFrom(service.publish('lq-001'));
      const req = httpMock.expectOne(`${ROOT}/lq-001/publish`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(
        backendQuiz({
          id: 'lq-001',
          state: 'PUBLISHED',
          published_at: '2026-05-26T11:00:00Z',
          questions: [validQuestion()],
        }),
      );
      const out = await promise;
      expect(out.state).toBe('PUBLISHED');
      expect(out.publishedAt).toBe('2026-05-26T11:00:00Z');
    });
  });
});
