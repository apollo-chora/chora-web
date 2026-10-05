/**
 * QuestionBankDetailComponent spec — the `/r/question-banks/:id` Detail page.
 *
 * Real QuestionBanksService over HttpTestingController (no service mock per
 * feedback_no_stubs_real_wiring). `:id` is set via componentRef.setInput (the
 * withComponentInputBinding idiom). The embedded reused AtomQuestionPicker is
 * driven via the parent's handler for the add path; the toggle test flushes the
 * picker's mount-time search.
 *
 * Coverage:
 *   - mount → GET /question-banks/:id (metadata) + GET /:id/questions (list)
 *   - renders bank name + visibility badge + tags + a row per question
 *   - bank 404 → not-found state (back to list)
 *   - questions fetch error → loud questions error panel
 *   - remove a question → DELETE → refresh + toast
 *   - "Add questions" toggles the embedded picker (mount search fires)
 *   - picking a question → POST /:id/questions {question_id} → refresh + toast
 *   - bulk pick → N POSTs → refresh + toast
 *   - assemble dialog → POST /:id/assemble-test-set {title,description} (202)
 *     → success toast + closes; validation blocks submit; 400 → loud banner
 *   - axe a11y sweep (0 critical/serious)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { QuestionBankDetailComponent } from './question-bank-detail.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import type { QuestionRef } from '../../aplus/atom-question-picker/atom-question-picker.model';
import { environment } from '../../../../../environments/environment';

const BASE = environment.bffBaseUrl;
const DETAIL_URL = `${BASE}/api/v1/question-banks/qb1`;
const QUESTIONS_URL = `${BASE}/api/v1/question-banks/qb1/questions`;
const ASSEMBLE_URL = `${BASE}/api/v1/question-banks/qb1/assemble-test-set`;
const SEARCH_ENDPOINT = '/api/atoms/questions/search';
const ATOM_BASE = `${BASE}/api/atoms`;

/** GET /api/atoms/{id} envelope with an embedded MCQ question_id (resolve step). */
function atomEnv(questionId: string): Record<string, unknown> {
  return { atom: { mcq_payload: { question_id: questionId } } };
}

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
  items: [],
};

// R6 D2: the wire ALREADY carries the stem. `listQuestions` on the backend
// calls ListItemsEnrichedPage and returns EnrichedQuestionBankItem
// {question_id, atom_id, question_type, prompt, position, added_at}, resolved
// by an intra-DB JOIN, and its own comment says why: "the row would otherwise
// show only the opaque question_id". The FE declared a wire type without
// `prompt` and so dropped it at the type boundary.
const QUESTIONS_BODY = {
  items: [
    {
      question_id: 'q1',
      position: 0,
      added_at: '2026-06-01T01:00:00Z',
      prompt: 'What is an improper fraction?',
      question_type: 'MCQ',
      atom_id: 'atom-1',
    },
    {
      question_id: 'q2',
      position: 1,
      added_at: '2026-06-01T02:00:00Z',
      prompt: 'Convert 7/4 to a mixed number.',
      question_type: 'MCQ',
      atom_id: 'atom-2',
    },
  ],
  total: 2,
};

const PICKER_RESPONSE = {
  items: [
    {
      id: 'q7',
      title: 'Open-Closed Principle',
      stem: 'Which statement best describes OCP?',
      question_type: 'mcq',
      tenant_id: 't1',
      author_gcid: 'g1',
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
    },
  ],
  next_page_token: null,
  total: 1,
};

function setup(): {
  fixture: ComponentFixture<QuestionBankDetailComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
} {
  TestBed.configureTestingModule({
    imports: [QuestionBankDetailComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(QuestionBankDetailComponent);
  fixture.componentRef.setInput('id', 'qb1');
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, httpMock, element: fixture.nativeElement as HTMLElement };
}

/** Mount + flush the two initial GETs (detail + questions). */
function loaded(questionsBody: Record<string, unknown> = QUESTIONS_BODY): {
  fixture: ComponentFixture<QuestionBankDetailComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
} {
  const built = setup();
  built.httpMock.expectOne(DETAIL_URL).flush(BANK_DTO);
  built.httpMock.expectOne(QUESTIONS_URL).flush(questionsBody);
  built.fixture.detectChanges();
  return built;
}

function flushPickerSearch(httpMock: HttpTestingController): void {
  httpMock.expectOne((r) => r.url.endsWith(SEARCH_ENDPOINT)).flush(PICKER_RESPONSE);
}

describe('QuestionBankDetailComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => {
    try {
      TestBed.inject(HttpTestingController).verify();
    } catch {
      /* already verified in-body */
    }
  });

  describe('load', () => {
    it('GETs the bank + its questions on mount and renders metadata + rows', () => {
      const { fixture, httpMock, element } = setup();
      const detail = httpMock.expectOne(DETAIL_URL);
      expect(detail.request.method).toBe('GET');
      detail.flush(BANK_DTO);
      const questions = httpMock.expectOne(QUESTIONS_URL);
      expect(questions.request.method).toBe('GET');
      questions.flush(QUESTIONS_BODY);
      fixture.detectChanges();

      expect(element.querySelector('[data-testid="qb-detail-name"]')?.textContent).toContain(
        'Algebra Pool',
      );
      expect(element.querySelector('[data-testid="qb-detail-visibility"]')).not.toBeNull();
      const text = element.textContent ?? '';
      expect(text).toContain('math');
      expect(text).toContain('algebra');
      // one row per question + a remove button each
      expect(element.querySelector('[data-testid="qb-question-q1"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="qb-question-q2"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="qb-question-remove-q1"]')).not.toBeNull();
      httpMock.verify();
    });

    it('labels each question with its STEM, not its raw id (R6 D2)', () => {
      // A bare UUID where a question label belongs tells the learner nothing
      // and reads as a defect. The prompt is on the wire; render it.
      const { element, httpMock } = loaded();
      const row = element.querySelector('[data-testid="qb-question-q1"]')!;

      expect(row.textContent).toContain('What is an improper fraction?');
      httpMock.verify();
    });

    it('falls back to the id, marked as an id, when a prompt is absent', () => {
      // An older row, or one whose atom lookup found nothing, has no prompt.
      // Showing the id is then honest; showing it as if it were a title is not,
      // so it keeps the `is-unresolved` marking rather than sitting where a
      // stem belongs.
      const { element, httpMock } = loaded({
        items: [{ question_id: 'q9', position: 0, added_at: '' }],
        total: 1,
      });
      const row = element.querySelector('[data-testid="qb-question-q9"]')!;

      expect(row.textContent).toContain('q9');
      expect(row.querySelector('.is-unresolved')).not.toBeNull();
      httpMock.verify();
    });

    it('renders an honest empty-state when the bank has no questions', () => {
      const { element, httpMock } = loaded({ items: [], total: 0 });
      expect(element.querySelector('[data-testid="qb-questions-empty"]')).not.toBeNull();
      httpMock.verify();
    });

    it('shows the not-found state on a 404 bank (with a back link)', () => {
      const { fixture, httpMock, element } = setup();
      httpMock.expectOne(DETAIL_URL).flush('nope', { status: 404, statusText: 'Not Found' });
      // questions GET still fires on mount; resolve it so verify() is clean.
      httpMock.expectOne(QUESTIONS_URL).flush({ items: [], total: 0 });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="qb-detail-error"]');
      expect(err?.getAttribute('role')).toBe('alert');
      expect(element.querySelector('[data-testid="qb-detail-notfound-back"]')).not.toBeNull();
      httpMock.verify();
    });

    it('shows a loud questions error panel when the questions fetch fails', () => {
      const { fixture, httpMock, element } = setup();
      httpMock.expectOne(DETAIL_URL).flush(BANK_DTO);
      httpMock.expectOne(QUESTIONS_URL).flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="qb-questions-error"]');
      expect(err?.getAttribute('role')).toBe('alert');
      httpMock.verify();
    });
  });

  describe('remove a question', () => {
    it('DELETEs the membership then refreshes the list + toasts', () => {
      const { fixture, httpMock, element } = loaded();
      const toast = TestBed.inject(ToastService);
      element.querySelector<HTMLButtonElement>('[data-testid="qb-question-remove-q1"]')!.click();
      const del = httpMock.expectOne(`${QUESTIONS_URL}/q1`);
      expect(del.request.method).toBe('DELETE');
      del.flush(null, { status: 204, statusText: 'No Content' });
      // refresh
      httpMock.expectOne(QUESTIONS_URL).flush({ items: [QUESTIONS_BODY.items[1]], total: 1 });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="qb-question-q1"]')).toBeNull();
      expect(toast.toasts().length).toBe(1);
      httpMock.verify();
    });

    it('toasts an error (no refresh) when the DELETE fails', () => {
      const { httpMock, element } = loaded();
      const toast = TestBed.inject(ToastService);
      element.querySelector<HTMLButtonElement>('[data-testid="qb-question-remove-q1"]')!.click();
      httpMock
        .expectOne(`${QUESTIONS_URL}/q1`)
        .flush('boom', { status: 500, statusText: 'Server Error' });
      expect(toast.toasts().length).toBe(1);
      expect(toast.toasts()[0].type).toBe('error');
      // afterEach verify() asserts NO refresh GET fired on the error path.
      httpMock.verify();
    });
  });

  describe('questions error retry', () => {
    it('re-fetches the questions list via the retry button', () => {
      const { fixture, httpMock, element } = setup();
      httpMock.expectOne(DETAIL_URL).flush(BANK_DTO);
      httpMock.expectOne(QUESTIONS_URL).flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      element.querySelector<HTMLButtonElement>('[data-testid="qb-questions-retry"]')!.click();
      httpMock.expectOne(QUESTIONS_URL).flush(QUESTIONS_BODY);
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="qb-questions"]')).not.toBeNull();
      httpMock.verify();
    });
  });

  describe('add questions (embedded picker)', () => {
    it('toggles the embedded picker (its mount search fires) on "Add questions"', () => {
      const { fixture, httpMock, element } = loaded();
      expect(element.querySelector('[data-testid="qb-picker"]')).toBeNull();
      element.querySelector<HTMLButtonElement>('[data-testid="qb-add-toggle"]')!.click();
      fixture.detectChanges();
      // The reused picker fires its mount-time search against the BFF.
      flushPickerSearch(httpMock);
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="qb-picker"]')).not.toBeNull();
      expect(element.querySelector('chora-aplus-atom-question-picker')).not.toBeNull();
      // A second toggle closes (unmounts) the picker.
      element.querySelector<HTMLButtonElement>('[data-testid="qb-add-toggle"]')!.click();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="qb-picker"]')).toBeNull();
      httpMock.verify();
    });

    it('resolves atom_id → question_id, then toasts an error (no refresh) when the add POST fails', () => {
      const { fixture, httpMock } = loaded();
      const toast = TestBed.inject(ToastService);
      fixture.componentInstance.onQuestionPicked({
        id: 'q7',
        title: 'T',
        stem: 's',
        question_type: 'mcq',
      });
      httpMock.expectOne(`${ATOM_BASE}/q7`).flush(atomEnv('realq7')); // resolve
      httpMock.expectOne(QUESTIONS_URL).flush('boom', { status: 500, statusText: 'Server Error' });
      expect(toast.toasts().length).toBe(1);
      expect(toast.toasts()[0].type).toBe('error');
      // afterEach verify() asserts NO refresh GET fired on the error path.
      httpMock.verify();
    });

    it('onQuestionsPicked([]) is a no-op (no requests)', () => {
      const { fixture, httpMock } = loaded();
      fixture.componentInstance.onQuestionsPicked([]);
      httpMock.verify();
    });

    it('onQuestionPicked RESOLVES atom_id → question_id then POSTs the resolved id + refreshes + toasts', () => {
      const { fixture, httpMock } = loaded();
      const toast = TestBed.inject(ToastService);
      // The picker emits the ATOM id (q7); the bank needs the embedded question_id (realq7).
      fixture.componentInstance.onQuestionPicked({
        id: 'q7',
        title: 'Open-Closed Principle',
        stem: 'Which statement best describes OCP?',
        question_type: 'mcq',
      });
      httpMock.expectOne(`${ATOM_BASE}/q7`).flush(atomEnv('realq7'));

      const post = httpMock.expectOne(QUESTIONS_URL);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({ question_id: 'realq7' }); // RESOLVED, not the atom id
      post.flush({ question_id: 'realq7', position: 2, added_at: '2026-06-10T00:00:00Z' });
      // refresh
      httpMock.expectOne(QUESTIONS_URL).flush({ items: [], total: 0 });
      fixture.detectChanges();
      expect(toast.toasts().length).toBe(1);
      expect(toast.toasts()[0].type).toBe('success');
      httpMock.verify();
    });

    it('does NOT post + toasts when the picked atom has no live question (seed atom)', () => {
      const { fixture, httpMock } = loaded();
      const toast = TestBed.inject(ToastService);
      fixture.componentInstance.onQuestionPicked({
        id: 'seed1',
        title: 'S',
        stem: 's',
        question_type: 'mcq',
      });
      httpMock.expectOne(`${ATOM_BASE}/seed1`).flush({ atom: { atom_id: 'seed1' } });
      expect(toast.toasts()[0].type).toBe('error');
      // afterEach verify() asserts NO add POST fired.
      httpMock.verify();
    });

    it('onQuestionsPicked (bulk) resolves each atom_id then POSTs the resolved ids + refreshes once', () => {
      const { fixture, httpMock } = loaded();
      const refs: readonly QuestionRef[] = [
        { id: 'q7', title: 'A', stem: 's', question_type: 'mcq' },
        { id: 'q8', title: 'B', stem: 's', question_type: 'oe' },
      ];
      fixture.componentInstance.onQuestionsPicked(refs);

      httpMock.expectOne(`${ATOM_BASE}/q7`).flush(atomEnv('realq7'));
      httpMock.expectOne(`${ATOM_BASE}/q8`).flush(atomEnv('realq8'));

      const posts = httpMock.match(QUESTIONS_URL);
      expect(posts).toHaveLength(2);
      expect(posts.every((p) => p.request.method === 'POST')).toBe(true);
      expect(posts.map((p) => p.request.body)).toEqual([
        { question_id: 'realq7' },
        { question_id: 'realq8' },
      ]);
      posts.forEach((p) => p.flush({ question_id: 'x', position: 0, added_at: '' }));
      // single refresh after the batch
      httpMock.expectOne(QUESTIONS_URL).flush({ items: [], total: 0 });
      fixture.detectChanges();
      httpMock.verify();
    });

    it('bulk: skips + toasts when a picked atom has no live question (no post)', () => {
      const { fixture, httpMock } = loaded();
      const toast = TestBed.inject(ToastService);
      fixture.componentInstance.onQuestionsPicked([
        { id: 'seed1', title: 'S', stem: 's', question_type: 'mcq' },
      ]);
      httpMock.expectOne(`${ATOM_BASE}/seed1`).flush({ atom: { atom_id: 'seed1' } });
      expect(toast.toasts().some((t) => t.type === 'error')).toBe(true);
      httpMock.verify(); // no add POST
    });
  });

  describe('assemble test-set', () => {
    it('opens the dialog and POSTs { title, description } → success toast + closes', () => {
      const { fixture, httpMock, element } = loaded();
      const toast = TestBed.inject(ToastService);
      element.querySelector<HTMLButtonElement>('[data-testid="qb-assemble-toggle"]')!.click();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="qb-assemble-form"]')).not.toBeNull();

      const c = fixture.componentInstance;
      c.assembleTitle.set('Midterm Test');
      c.assembleDescription.set('From the algebra pool');
      c.submitAssemble();

      const post = httpMock.expectOne(ASSEMBLE_URL);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({
        title: 'Midterm Test',
        description: 'From the algebra pool',
      });
      post.flush(
        { job_id: 'job-7', test_set_status: 'ASSEMBLING' },
        { status: 202, statusText: 'Accepted' },
      );
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="qb-assemble-form"]')).toBeNull();
      expect(toast.toasts().length).toBe(1);
      expect(toast.toasts()[0].type).toBe('success');
      httpMock.verify();
    });

    it('drives title + description from typed DOM events and submits via the button', () => {
      const { fixture, httpMock, element } = loaded();
      element.querySelector<HTMLButtonElement>('[data-testid="qb-assemble-toggle"]')!.click();
      fixture.detectChanges();
      const c = fixture.componentInstance;

      const title = element.querySelector<HTMLInputElement>('[data-testid="qb-assemble-title"]')!;
      title.value = 'Typed Title';
      title.dispatchEvent(new Event('input'));
      expect(c.assembleTitle()).toBe('Typed Title');

      const desc = element.querySelector<HTMLTextAreaElement>(
        '[data-testid="qb-assemble-description"]',
      )!;
      desc.value = 'Typed desc';
      desc.dispatchEvent(new Event('input'));
      expect(c.assembleDescription()).toBe('Typed desc');

      // Click the actual submit button → native submit → onAssembleSubmit.
      element.querySelector<HTMLButtonElement>('[data-testid="qb-assemble-submit"]')!.click();
      const post = httpMock.expectOne(ASSEMBLE_URL);
      expect(post.request.body).toEqual({ title: 'Typed Title', description: 'Typed desc' });
      post.flush(
        { job_id: 'j1', test_set_status: 'ASSEMBLING' },
        { status: 202, statusText: 'Accepted' },
      );
      httpMock.verify();
    });

    it('blocks submit + shows a field error when the title is empty (no POST)', () => {
      const { fixture, httpMock, element } = loaded();
      element.querySelector<HTMLButtonElement>('[data-testid="qb-assemble-toggle"]')!.click();
      fixture.detectChanges();
      fixture.componentInstance.submitAssemble();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="qb-assemble-error-title"]')).not.toBeNull();
      // afterEach verify() asserts no POST fired.
      httpMock.verify();
    });

    it('surfaces a plain-string assemble error body', () => {
      const { fixture, httpMock, element } = loaded();
      element.querySelector<HTMLButtonElement>('[data-testid="qb-assemble-toggle"]')!.click();
      fixture.detectChanges();
      fixture.componentInstance.assembleTitle.set('X');
      fixture.componentInstance.submitAssemble();
      httpMock
        .expectOne(ASSEMBLE_URL)
        .flush('bare assemble error', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="qb-assemble-error"]')?.textContent).toContain(
        'bare assemble error',
      );
      httpMock.verify();
    });

    it('cancel closes the dialog and resets the draft', () => {
      const { fixture, httpMock, element } = loaded();
      element.querySelector<HTMLButtonElement>('[data-testid="qb-assemble-toggle"]')!.click();
      fixture.detectChanges();
      fixture.componentInstance.assembleTitle.set('Draft');
      element.querySelector<HTMLButtonElement>('[data-testid="qb-assemble-cancel"]')!.click();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="qb-assemble-form"]')).toBeNull();
      expect(fixture.componentInstance.assembleTitle()).toBe('');
      httpMock.verify();
    });

    it('surfaces a loud banner on a 400 (empty bank)', () => {
      const { fixture, httpMock, element } = loaded();
      element.querySelector<HTMLButtonElement>('[data-testid="qb-assemble-toggle"]')!.click();
      fixture.detectChanges();
      const c = fixture.componentInstance;
      c.assembleTitle.set('X');
      c.submitAssemble();
      httpMock
        .expectOne(ASSEMBLE_URL)
        .flush({ error: 'bank is empty' }, { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="qb-assemble-error"]');
      expect(banner?.getAttribute('role')).toBe('alert');
      expect(banner?.textContent).toContain('bank is empty');
      httpMock.verify();
    });
  });

  describe('a11y', () => {
    it('has zero critical/serious WCAG violations (loaded detail)', async () => {
      const { httpMock, element } = loaded();
      const axe = (await import('axe-core')).default;
      const results = await axe.run(element);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
      httpMock.verify();
    }, 30000);
  });
});
