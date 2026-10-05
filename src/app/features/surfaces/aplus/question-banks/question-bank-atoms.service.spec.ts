/**
 * QuestionBankAtomsService spec — the /api/atoms/* adapter for the A+ workbench
 * conveniences (preview-as-learner, inline quick-edit, tags/subject, clone).
 *
 * Real adapter over HttpTestingController (no mock per feedback_no_stubs_real_wiring).
 *
 * Data-flow nuance (resolved from test-set.service + the picker): a bank
 * membership row carries only the ATOM id; the REAL question_id is EMBEDDED in
 * the atom projection (`mcq_payload.question_id` / `oe_payload.question_id`).
 * So edit/preview first GET /api/atoms/{id} (learner-safe projection, which also
 * yields the embedded question_id), then GET/PATCH the
 * /api/atoms/{id}/questions/{qid} sub-resource for the author answer key.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { QuestionBankAtomsService, editsToRequest } from './question-bank-atoms.service';
import type { EditableQuestion } from '../../../../shared/components/chora-question-editor/chora-question-editor.model';
import { environment } from '../../../../../environments/environment';

const BASE = environment.bffBaseUrl;

const MCQ_ATOM = {
  atom: {
    atom_id: 'a1',
    atom_type: 'mcq',
    title: 'Open-Closed Principle',
    subject: 'Software Design',
    tags: ['oop', 'solid'],
    mcq_payload: {
      question_id: 'qid-1',
      prompt: 'Which best describes OCP?',
      options: [
        { option_id: 'o1', label: 'Open for extension' },
        { option_id: 'o2', label: 'Closed for everything' },
      ],
    },
  },
};

const OE_ATOM = {
  atom: {
    atom_id: 'a2',
    atom_type: 'essay',
    title: 'Explain recursion',
    subject: 'CS',
    tags: [],
    oe_payload: { question_id: 'qid-2', prompt: 'Explain recursion in your own words.' },
  },
};

const AUTHOR_MCQ = {
  question: {
    prompt: 'Which best describes OCP?',
    mcq: {
      options: [
        { option_id: 'o1', label: 'Open for extension', is_correct: true, explainer: 'Correct' },
        { option_id: 'o2', label: 'Closed for everything', is_correct: false, explainer: 'No' },
      ],
    },
  },
};

/** Same author projection but carrying BOTH illustrations (stem + answer key). */
const AUTHOR_MCQ_WITH_IMAGES = {
  question: {
    prompt: 'Which best describes OCP?',
    mcq: {
      image_url: 'https://signed.example/stem.png',
      answer_image_url: 'https://signed.example/answer.png',
      options: [
        { option_id: 'o1', label: 'Open for extension', is_correct: true, explainer: 'Correct' },
        { option_id: 'o2', label: 'Closed for everything', is_correct: false, explainer: 'No' },
      ],
    },
  },
};

describe('QuestionBankAtomsService', () => {
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

  describe('getAtom (preview + meta + embedded question id)', () => {
    it('GETs /api/atoms/{id} and maps the learner-safe MCQ projection + meta', async () => {
      const promise = firstValueFrom(service.getAtom('a1'));
      const req = httpMock.expectOne(`${BASE}/api/atoms/a1`);
      expect(req.request.method).toBe('GET');
      req.flush(MCQ_ATOM);
      const atom = await promise;
      expect(atom).toMatchObject({
        atomId: 'a1',
        title: 'Open-Closed Principle',
        subject: 'Software Design',
        questionId: 'qid-1',
        isOpenEnded: false,
        prompt: 'Which best describes OCP?',
      });
      expect([...atom.tags]).toEqual(['oop', 'solid']);
      expect(atom.options.map((o) => o.label)).toEqual([
        'Open for extension',
        'Closed for everything',
      ]);
    });

    it('maps an OE atom (open-ended, no options, embedded oe question id)', async () => {
      const promise = firstValueFrom(service.getAtom('a2'));
      httpMock.expectOne(`${BASE}/api/atoms/a2`).flush(OE_ATOM);
      const atom = await promise;
      expect(atom).toMatchObject({ atomId: 'a2', questionId: 'qid-2', isOpenEnded: true });
      expect(atom.options).toEqual([]);
    });

    it('maps an essay_payload atom + an option carrying `text` (defensive branches)', async () => {
      const promise = firstValueFrom(service.getAtom('a3'));
      httpMock.expectOne(`${BASE}/api/atoms/a3`).flush({
        atom: {
          atom_id: 'a3',
          atom_type: 'essay',
          essay_payload: { question_id: 'qid-3', prompt: 'Discuss.' },
        },
      });
      const atom = await promise;
      expect(atom).toMatchObject({ questionId: 'qid-3', isOpenEnded: true, prompt: 'Discuss.' });

      // An MCQ option may ship `text` instead of `label`.
      const promise2 = firstValueFrom(service.getAtom('a4'));
      httpMock.expectOne(`${BASE}/api/atoms/a4`).flush({
        atom: {
          atom_id: 'a4',
          atom_type: 'mcq',
          mcq_payload: { question_id: 'qid-4', options: [{ text: 'From text' }] },
        },
      });
      const atom2 = await promise2;
      expect(atom2.options.map((o) => o.label)).toEqual(['From text']);
    });

    it('maps a sparse/empty envelope to safe defaults (no payload)', async () => {
      const promise = firstValueFrom(service.getAtom('a5'));
      httpMock.expectOne(`${BASE}/api/atoms/a5`).flush({});
      const atom = await promise;
      expect(atom).toEqual({
        atomId: '',
        atomType: '',
        title: '',
        subject: '',
        tags: [],
        questionId: '',
        isOpenEnded: true,
        prompt: '',
        options: [],
      });
    });

    it('URL-encodes the id + propagates a 404 (fail-loud)', async () => {
      const promise = firstValueFrom(service.getAtom('a/b'));
      httpMock
        .expectOne(`${BASE}/api/atoms/a%2Fb`)
        .flush('nope', { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('resolveQuestionId (atom_id → embedded question_id)', () => {
    it('returns the embedded MCQ question_id (NOT the atom id)', async () => {
      const promise = firstValueFrom(service.resolveQuestionId('a1'));
      httpMock.expectOne(`${BASE}/api/atoms/a1`).flush(MCQ_ATOM);
      expect(await promise).toBe('qid-1');
    });

    it('returns the embedded OE question_id', async () => {
      const promise = firstValueFrom(service.resolveQuestionId('a2'));
      httpMock.expectOne(`${BASE}/api/atoms/a2`).flush(OE_ATOM);
      expect(await promise).toBe('qid-2');
    });

    it("returns '' when the atom has no live question (seed atom — caller must not post)", async () => {
      const promise = firstValueFrom(service.resolveQuestionId('seed'));
      httpMock.expectOne(`${BASE}/api/atoms/seed`).flush({ atom: { atom_id: 'seed', atom_type: 'mcq' } });
      expect(await promise).toBe('');
    });

    it('propagates a 404 (fail-loud)', async () => {
      const promise = firstValueFrom(service.resolveQuestionId('ghost'));
      httpMock
        .expectOne(`${BASE}/api/atoms/ghost`)
        .flush('nope', { status: 404, statusText: 'Not Found' });
      await expect(promise).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('getEditableQuestion (chains projection → author detail → editable)', () => {
    it('GETs the atom then the author question, returning {questionId, editable}', async () => {
      const promise = firstValueFrom(service.getEditableQuestion('a1'));
      httpMock.expectOne(`${BASE}/api/atoms/a1`).flush(MCQ_ATOM);
      const author = httpMock.expectOne(`${BASE}/api/atoms/a1/questions/qid-1`);
      expect(author.request.method).toBe('GET');
      author.flush(AUTHOR_MCQ);
      const { questionId, editable } = await promise;
      expect(questionId).toBe('qid-1');
      expect(editable.question_type).toBe('mcq');
      expect(editable.prompt).toBe('Which best describes OCP?');
      expect(editable.options.map((o) => o.is_correct)).toEqual([true, false]);
    });

    it('surfaces BOTH the stem + model-answer image urls (so the panel can show + Remove them)', async () => {
      const promise = firstValueFrom(service.getEditableQuestion('a1'));
      httpMock.expectOne(`${BASE}/api/atoms/a1`).flush(MCQ_ATOM);
      httpMock.expectOne(`${BASE}/api/atoms/a1/questions/qid-1`).flush(AUTHOR_MCQ_WITH_IMAGES);
      const { questionImageUrl, answerImageUrl } = await promise;
      expect(questionImageUrl).toBe('https://signed.example/stem.png');
      expect(answerImageUrl).toBe('https://signed.example/answer.png');
    });

    it('reports null image urls when the question carries no illustrations', async () => {
      const promise = firstValueFrom(service.getEditableQuestion('a1'));
      httpMock.expectOne(`${BASE}/api/atoms/a1`).flush(MCQ_ATOM);
      httpMock.expectOne(`${BASE}/api/atoms/a1/questions/qid-1`).flush(AUTHOR_MCQ);
      const { questionImageUrl, answerImageUrl } = await promise;
      expect(questionImageUrl).toBeNull();
      expect(answerImageUrl).toBeNull();
    });

    it('propagates an author-projection error (fail-loud)', async () => {
      const promise = firstValueFrom(service.getEditableQuestion('a1'));
      httpMock.expectOne(`${BASE}/api/atoms/a1`).flush(MCQ_ATOM);
      httpMock
        .expectOne(`${BASE}/api/atoms/a1/questions/qid-1`)
        .flush('boom', { status: 503, statusText: 'Unavailable' });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('getQuestionReview (chains projection → author detail → QuestionReview)', () => {
    it('GETs the atom then the author question, returning the answer-key review', async () => {
      const promise = firstValueFrom(service.getQuestionReview('a1'));
      httpMock.expectOne(`${BASE}/api/atoms/a1`).flush(MCQ_ATOM);
      const author = httpMock.expectOne(`${BASE}/api/atoms/a1/questions/qid-1`);
      expect(author.request.method).toBe('GET');
      author.flush(AUTHOR_MCQ);
      const review = await promise;
      expect(review.question_type).toBe('mcq');
      // The review carries the ANSWER KEY (is_correct per option) — the author
      // review the workbench Preview now renders, NOT a learner-safe projection.
      expect(review.options.map((o) => o.is_correct)).toEqual([true, false]);
    });

    it('propagates an author-projection error (fail-loud)', async () => {
      const promise = firstValueFrom(service.getQuestionReview('a1'));
      httpMock.expectOne(`${BASE}/api/atoms/a1`).flush(MCQ_ATOM);
      httpMock
        .expectOne(`${BASE}/api/atoms/a1/questions/qid-1`)
        .flush('boom', { status: 503, statusText: 'Unavailable' });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('editQuestion', () => {
    it('PATCHes /api/atoms/{id}/questions/{qid} with the edit body', async () => {
      const promise = firstValueFrom(
        service.editQuestion('a1', 'qid-1', { prompt: 'New prompt' }),
      );
      const req = httpMock.expectOne(`${BASE}/api/atoms/a1/questions/qid-1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ prompt: 'New prompt' });
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect(await promise).toBeUndefined();
    });

    it('passes the clear-path image fields through verbatim ("" = explicit clear)', async () => {
      const promise = firstValueFrom(
        service.editQuestion('a1', 'qid-1', {
          prompt: 'New prompt',
          image_url: '',
          answer_image_url: '',
        }),
      );
      const req = httpMock.expectOne(`${BASE}/api/atoms/a1/questions/qid-1`);
      expect(req.request.body).toEqual({
        prompt: 'New prompt',
        image_url: '',
        answer_image_url: '',
      });
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect(await promise).toBeUndefined();
    });
  });

  describe('updateMeta (tags + subject — ADR-156 PATCH /api/atoms/{id})', () => {
    it('PATCHes /api/atoms/{id} with { tags, subject }', async () => {
      const promise = firstValueFrom(
        service.updateMeta('a1', { tags: ['oop', 'solid'], subject: 'Design' }),
      );
      const req = httpMock.expectOne(`${BASE}/api/atoms/a1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ tags: ['oop', 'solid'], subject: 'Design' });
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect(await promise).toBeUndefined();
    });

    it('propagates a 422 (fail-loud)', async () => {
      const promise = firstValueFrom(service.updateMeta('a1', { tags: [], subject: 'x' }));
      httpMock
        .expectOne(`${BASE}/api/atoms/a1`)
        .flush({ error: 'too long' }, { status: 422, statusText: 'Unprocessable' });
      await expect(promise).rejects.toMatchObject({ status: 422 });
    });
  });

  describe('clone', () => {
    it('POSTs /api/atoms/{id}/clone with a title and maps the 201', async () => {
      const promise = firstValueFrom(service.clone('a1', 'Copy of OCP'));
      const req = httpMock.expectOne(`${BASE}/api/atoms/a1/clone`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ title: 'Copy of OCP' });
      // chora-creation returns the flat cloned atom: { atom_id, cloned_from_atom_id, … }
      req.flush({ atom_id: 'a9', cloned_from_atom_id: 'a1' }, { status: 201, statusText: 'Created' });
      expect(await promise).toEqual({ atomId: 'a9', clonedFrom: 'a1' });
    });

    it('treats a whitespace-only title as no title (empty body) + maps empty 201 fields', async () => {
      const promise = firstValueFrom(service.clone('a1', '   '));
      const req = httpMock.expectOne(`${BASE}/api/atoms/a1/clone`);
      expect(req.request.body).toEqual({});
      req.flush({}, { status: 201, statusText: 'Created' });
      expect(await promise).toEqual({ atomId: '', clonedFrom: '' });
    });

    it('POSTs an empty body when no title is given', async () => {
      const promise = firstValueFrom(service.clone('a1'));
      const req = httpMock.expectOne(`${BASE}/api/atoms/a1/clone`);
      expect(req.request.body).toEqual({});
      req.flush({ atom_id: 'a9', cloned_from_atom_id: 'a1' }, { status: 201, statusText: 'Created' });
      await promise;
    });

    it('propagates a 5xx (fail-loud)', async () => {
      const promise = firstValueFrom(service.clone('a1'));
      httpMock
        .expectOne(`${BASE}/api/atoms/a1/clone`)
        .flush('boom', { status: 502, statusText: 'Bad Gateway' });
      await expect(promise).rejects.toMatchObject({ status: 502 });
    });
  });
});

describe('editsToRequest', () => {
  it('builds the MCQ edit body (options with ids, blank id for new options)', () => {
    const q: EditableQuestion = {
      question_type: 'mcq',
      prompt: '  Which? ',
      options: [
        { option_id: 'o1', label: ' A ', is_correct: true, explainer: ' yes ' },
        { option_id: null, label: 'B', is_correct: false, explainer: '' },
      ],
      model_answer: '',
    };
    expect(editsToRequest(q)).toEqual({
      prompt: 'Which?',
      mcq_payload: {
        options: [
          { option_id: 'o1', label: 'A', is_correct: true, explainer: 'yes' },
          { option_id: '', label: 'B', is_correct: false, explainer: '' },
        ],
      },
    });
  });

  it('builds the OE edit body (trimmed model answer)', () => {
    const q: EditableQuestion = {
      question_type: 'oe',
      prompt: ' Explain ',
      options: [],
      model_answer: '  because ',
    };
    expect(editsToRequest(q)).toEqual({
      prompt: 'Explain',
      oe_payload: { model_answer: 'because' },
    });
  });

  it('NEVER includes image fields — a normal save omits them so the BE carries the durable ref forward', () => {
    const mcq: EditableQuestion = {
      question_type: 'mcq',
      prompt: 'Q',
      options: [
        { option_id: 'o1', label: 'A', is_correct: true, explainer: '' },
        { option_id: 'o2', label: 'B', is_correct: false, explainer: '' },
      ],
      model_answer: '',
    };
    const oe: EditableQuestion = {
      question_type: 'oe',
      prompt: 'Q',
      options: [],
      model_answer: 'A',
    };
    expect(editsToRequest(mcq)).not.toHaveProperty('image_url');
    expect(editsToRequest(mcq)).not.toHaveProperty('answer_image_url');
    expect(editsToRequest(oe)).not.toHaveProperty('image_url');
    expect(editsToRequest(oe)).not.toHaveProperty('answer_image_url');
  });
});
