/**
 * QuestionBanksService spec — real BFF wiring for the R+ QuestionBank surface.
 *
 * Mirrors the offerings.service.spec idiom: every method hits the right
 * URL/method/body and maps the snake_case wire DTO to the camelCase FE model.
 * The aggregate key is `question_bank_id` (mapped → `id`, like the offerings
 * `assessment_id` lesson). Fail-loud: HTTP errors propagate untouched (no
 * fixture, no silent empty list) per feedback_no_stubs_real_wiring.
 *
 * Endpoints under test:
 *   - listMine        GET    /api/v1/me/question-banks
 *   - getBank         GET    /api/v1/question-banks/:id            (with items)
 *   - createBank      POST   /api/v1/question-banks
 *   - deleteBank      DELETE /api/v1/question-banks/:id            (204)
 *   - listQuestions   GET    /api/v1/question-banks/:id/questions
 *   - addQuestion     POST   /api/v1/question-banks/:id/questions  ({question_id})
 *   - removeQuestion  DELETE /api/v1/question-banks/:id/questions/:qid (204)
 *   - assembleTestSet POST   /api/v1/question-banks/:id/assemble-test-set (202)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { QuestionBanksService } from './question-banks.service';
import { environment } from '../../../../../environments/environment';

const BASE = environment.bffBaseUrl;

const BANK_DTO = {
  question_bank_id: 'qb1',
  tenant_id: 't1',
  owner_gcid: 'g1',
  name: 'Algebra Pool',
  description: 'Reusable algebra questions',
  visibility: 'PRIVATE',
  tags: ['math', 'algebra'],
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-02T00:00:00Z',
  items: [
    { question_id: 'q1', position: 0, added_at: '2026-06-01T01:00:00Z' },
    { question_id: 'q2', position: 1, added_at: '2026-06-01T02:00:00Z' },
  ],
};

describe('QuestionBanksService', () => {
  let service: QuestionBanksService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(QuestionBanksService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('listMine', () => {
    it('GETs /me/question-banks and maps the wire page (question_bank_id → id)', async () => {
      const promise = firstValueFrom(service.listMine());
      const req = httpMock.expectOne(`${BASE}/api/v1/me/question-banks`);
      expect(req.request.method).toBe('GET');
      req.flush({ items: [BANK_DTO], total: 1 });

      const page = await promise;
      expect(page.total).toBe(1);
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({
        id: 'qb1',
        tenantId: 't1',
        ownerGcid: 'g1',
        name: 'Algebra Pool',
        description: 'Reusable algebra questions',
        visibility: 'PRIVATE',
        createdAt: '2026-06-01T00:00:00Z',
        updatedAt: '2026-06-02T00:00:00Z',
      });
      expect([...page.items[0].tags]).toEqual(['math', 'algebra']);
      expect(page.items[0].items).toHaveLength(2);
      expect(page.items[0].items[0]).toMatchObject({
        questionId: 'q1',
        position: 0,
        addedAt: '2026-06-01T01:00:00Z',
      });
    });

    it('maps a sparse/empty body to an empty page (defensive defaults)', async () => {
      const promise = firstValueFrom(service.listMine());
      httpMock.expectOne(`${BASE}/api/v1/me/question-banks`).flush({});
      const page = await promise;
      expect(page.items).toEqual([]);
      expect(page.total).toBe(0);
    });

    it('defaults a missing description / tags / items to safe empties', async () => {
      const promise = firstValueFrom(service.listMine());
      httpMock.expectOne(`${BASE}/api/v1/me/question-banks`).flush({
        items: [
          {
            question_bank_id: 'qb2',
            tenant_id: 't1',
            owner_gcid: 'g1',
            name: 'Sparse Pool',
            visibility: 'TENANT_INTERNAL',
            created_at: '2026-06-05T00:00:00Z',
            updated_at: '2026-06-05T00:00:00Z',
          },
        ],
      });
      const page = await promise;
      expect(page.items[0]).toMatchObject({
        id: 'qb2',
        name: 'Sparse Pool',
        description: '',
        visibility: 'TENANT_INTERNAL',
      });
      expect([...page.items[0].tags]).toEqual([]);
      expect(page.items[0].items).toEqual([]);
    });

    it('propagates HTTP errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.listMine());
      httpMock
        .expectOne(`${BASE}/api/v1/me/question-banks`)
        .flush('down', { status: 503, statusText: 'Service Unavailable' });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('getBank', () => {
    it('GETs the detail endpoint and maps the wire DTO with items', async () => {
      const promise = firstValueFrom(service.getBank('qb1'));
      const req = httpMock.expectOne(`${BASE}/api/v1/question-banks/qb1`);
      expect(req.request.method).toBe('GET');
      req.flush(BANK_DTO);

      const bank = await promise;
      expect(bank).toMatchObject({ id: 'qb1', name: 'Algebra Pool', visibility: 'PRIVATE' });
      expect(bank.items).toHaveLength(2);
      expect(bank.items[1]).toMatchObject({ questionId: 'q2', position: 1 });
    });

    it('URL-encodes the id segment', () => {
      service.getBank('a/b').subscribe();
      httpMock.expectOne(`${BASE}/api/v1/question-banks/a%2Fb`).flush(BANK_DTO);
    });

    it('propagates a 404 (fail-loud, no placeholder)', async () => {
      const promise = firstValueFrom(service.getBank('missing'));
      httpMock
        .expectOne(`${BASE}/api/v1/question-banks/missing`)
        .flush('not found', { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('createBank', () => {
    it('POSTs the snake_case body and maps the 201', async () => {
      const promise = firstValueFrom(
        service.createBank({
          name: 'New Pool',
          description: 'desc',
          visibility: 'TENANT_INTERNAL',
          tags: ['a', 'b'],
        }),
      );
      const req = httpMock.expectOne(`${BASE}/api/v1/question-banks`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        name: 'New Pool',
        description: 'desc',
        visibility: 'TENANT_INTERNAL',
        tags: ['a', 'b'],
      });
      req.flush(
        { ...BANK_DTO, question_bank_id: 'qb9', name: 'New Pool', visibility: 'TENANT_INTERNAL' },
        { status: 201, statusText: 'Created' },
      );

      const bank = await promise;
      expect(bank.id).toBe('qb9');
      expect(bank.name).toBe('New Pool');
      expect(bank.visibility).toBe('TENANT_INTERNAL');
    });

    it('propagates a 400 validation error (fail-loud)', async () => {
      const promise = firstValueFrom(
        service.createBank({ name: '', description: '', visibility: 'PRIVATE', tags: [] }),
      );
      httpMock
        .expectOne(`${BASE}/api/v1/question-banks`)
        .flush({ error: 'name required' }, { status: 400, statusText: 'Bad Request' });
      await expect(promise).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('deleteBank', () => {
    it('DELETEs the bank and resolves void on 204', async () => {
      const promise = firstValueFrom(service.deleteBank('qb1'));
      const req = httpMock.expectOne(`${BASE}/api/v1/question-banks/qb1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect(await promise).toBeUndefined();
    });

    it('URL-encodes the id segment', () => {
      service.deleteBank('a/b').subscribe();
      httpMock.expectOne(`${BASE}/api/v1/question-banks/a%2Fb`).flush(null, { status: 204, statusText: 'No Content' });
    });

    it('propagates HTTP errors (fail-loud)', async () => {
      const promise = firstValueFrom(service.deleteBank('qb1'));
      httpMock
        .expectOne(`${BASE}/api/v1/question-banks/qb1`)
        .flush('boom', { status: 500, statusText: 'Server Error' });
      await expect(promise).rejects.toMatchObject({ status: 500 });
    });
  });

  describe('listQuestions', () => {
    it('GETs /question-banks/:id/questions and maps the items', async () => {
      const promise = firstValueFrom(service.listQuestions('qb1'));
      const req = httpMock.expectOne(`${BASE}/api/v1/question-banks/qb1/questions`);
      expect(req.request.method).toBe('GET');
      req.flush({
        items: [{ question_id: 'q1', position: 0, added_at: '2026-06-01T01:00:00Z' }],
        total: 1,
      });
      const items = await promise;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ questionId: 'q1', position: 0, addedAt: '2026-06-01T01:00:00Z' });
    });

    it('maps a sparse body to an empty list (defensive)', async () => {
      const promise = firstValueFrom(service.listQuestions('qb1'));
      httpMock.expectOne(`${BASE}/api/v1/question-banks/qb1/questions`).flush({});
      expect(await promise).toEqual([]);
    });

    it('propagates HTTP errors (fail-loud)', async () => {
      const promise = firstValueFrom(service.listQuestions('qb1'));
      httpMock
        .expectOne(`${BASE}/api/v1/question-banks/qb1/questions`)
        .flush('boom', { status: 503, statusText: 'Service Unavailable' });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('addQuestion', () => {
    it('POSTs { question_id } and resolves void', async () => {
      const promise = firstValueFrom(service.addQuestion('qb1', 'q7'));
      const req = httpMock.expectOne(`${BASE}/api/v1/question-banks/qb1/questions`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ question_id: 'q7' });
      req.flush({ question_id: 'q7', position: 2, added_at: '2026-06-10T00:00:00Z' });
      expect(await promise).toBeUndefined();
    });

    it('propagates a 409 duplicate (fail-loud)', async () => {
      const promise = firstValueFrom(service.addQuestion('qb1', 'q1'));
      httpMock
        .expectOne(`${BASE}/api/v1/question-banks/qb1/questions`)
        .flush({ error: 'already in bank' }, { status: 409, statusText: 'Conflict' });
      await expect(promise).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('removeQuestion', () => {
    it('DELETEs the question membership and resolves void on 204', async () => {
      const promise = firstValueFrom(service.removeQuestion('qb1', 'q1'));
      const req = httpMock.expectOne(`${BASE}/api/v1/question-banks/qb1/questions/q1`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect(await promise).toBeUndefined();
    });

    it('URL-encodes both id segments', () => {
      service.removeQuestion('a/b', 'c/d').subscribe();
      httpMock
        .expectOne(`${BASE}/api/v1/question-banks/a%2Fb/questions/c%2Fd`)
        .flush(null, { status: 204, statusText: 'No Content' });
    });

    it('propagates HTTP errors (fail-loud)', async () => {
      const promise = firstValueFrom(service.removeQuestion('qb1', 'q1'));
      httpMock
        .expectOne(`${BASE}/api/v1/question-banks/qb1/questions/q1`)
        .flush('boom', { status: 500, statusText: 'Server Error' });
      await expect(promise).rejects.toMatchObject({ status: 500 });
    });
  });

  describe('assembleTestSet', () => {
    it('POSTs { title, description } and maps the 202 (job_id → jobId)', async () => {
      const promise = firstValueFrom(
        service.assembleTestSet('qb1', { title: 'Midterm', description: 'auto' }),
      );
      const req = httpMock.expectOne(`${BASE}/api/v1/question-banks/qb1/assemble-test-set`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ title: 'Midterm', description: 'auto' });
      req.flush(
        { job_id: 'job-7', test_set_status: 'ASSEMBLING' },
        { status: 202, statusText: 'Accepted' },
      );
      const result = await promise;
      expect(result).toEqual({ jobId: 'job-7', testSetStatus: 'ASSEMBLING' });
    });

    it('propagates a 400 (empty bank) fail-loud', async () => {
      const promise = firstValueFrom(
        service.assembleTestSet('qb1', { title: 'X', description: '' }),
      );
      httpMock
        .expectOne(`${BASE}/api/v1/question-banks/qb1/assemble-test-set`)
        .flush({ error: 'bank empty' }, { status: 400, statusText: 'Bad Request' });
      await expect(promise).rejects.toMatchObject({ status: 400 });
    });
  });
});
