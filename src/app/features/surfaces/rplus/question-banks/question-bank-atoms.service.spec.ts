/**
 * QuestionBankAtomsService (R+) spec — resolve a picker/clone ATOM id → the
 * embedded QUESTION id before adding to a bank. Real adapter over
 * HttpTestingController (no mock per feedback_no_stubs_real_wiring).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { QuestionBankAtomsService } from './question-bank-atoms.service';
import { environment } from '../../../../../environments/environment';

const BASE = environment.bffBaseUrl;

describe('QuestionBankAtomsService (R+)', () => {
  let service: QuestionBankAtomsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(QuestionBankAtomsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('resolves the embedded MCQ question_id (NOT the atom id)', async () => {
    const promise = firstValueFrom(service.resolveQuestionId('a1'));
    const req = httpMock.expectOne(`${BASE}/api/atoms/a1`);
    expect(req.request.method).toBe('GET');
    req.flush({ atom: { mcq_payload: { question_id: 'qid-1' } } });
    expect(await promise).toBe('qid-1');
  });

  it('resolves the embedded OE / essay question_id', async () => {
    const oe = firstValueFrom(service.resolveQuestionId('a2'));
    httpMock.expectOne(`${BASE}/api/atoms/a2`).flush({ atom: { oe_payload: { question_id: 'qid-2' } } });
    expect(await oe).toBe('qid-2');

    const essay = firstValueFrom(service.resolveQuestionId('a3'));
    httpMock.expectOne(`${BASE}/api/atoms/a3`).flush({ atom: { essay_payload: { question_id: 'qid-3' } } });
    expect(await essay).toBe('qid-3');
  });

  it("returns '' when the atom has no live question (seed atom)", async () => {
    const promise = firstValueFrom(service.resolveQuestionId('seed'));
    httpMock.expectOne(`${BASE}/api/atoms/seed`).flush({ atom: { atom_id: 'seed' } });
    expect(await promise).toBe('');
  });

  it('URL-encodes the id and propagates a 404 (fail-loud)', async () => {
    const promise = firstValueFrom(service.resolveQuestionId('a/b'));
    httpMock
      .expectOne(`${BASE}/api/atoms/a%2Fb`)
      .flush('nope', { status: 404, statusText: 'Not Found' });
    await expect(promise).rejects.toMatchObject({ status: 404 });
  });
});
