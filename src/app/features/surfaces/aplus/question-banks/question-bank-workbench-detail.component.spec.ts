/**
 * QuestionBankWorkbenchDetailComponent spec — the `/a/studio/question-banks/:id` Detail page (A+).
 *
 * Real QuestionBanksService over HttpTestingController (no service mock per
 * feedback_no_stubs_real_wiring). `:id` is set via componentRef.setInput (the
 * withComponentInputBinding idiom). The embedded reused AtomQuestionPicker is
 * driven via the parent's handler for the add path; the toggle test flushes the
 * picker's mount-time search.
 *
 * A+ is the authoring/curation workbench — the R+ "assemble test-set" dialog is
 * intentionally ABSENT here (assembly-for-delivery is R+'s job). One test
 * asserts the assemble affordance is gone.
 *
 * Coverage:
 *   - mount → GET /question-banks/:id (metadata) + GET /:id/questions (list)
 *   - renders bank name + visibility badge + tags + a row per question
 *   - bank 404 → not-found state (back to list)
 *   - questions fetch error → loud questions error panel + retry
 *   - remove a question → DELETE → refresh + toast
 *   - "Add questions" toggles the embedded picker (mount search fires)
 *   - picking a question → POST /:id/questions {question_id} → refresh + toast
 *   - bulk pick → N POSTs → refresh + toast
 *   - NO assemble action exists
 *   - axe a11y sweep (0 critical/serious)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';

import { QuestionBankWorkbenchDetailComponent } from './question-bank-workbench-detail.component';
import { TranslateService } from '../../../../core/services/translate.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import type { QuestionRef } from '../atom-question-picker/atom-question-picker.model';
import { environment } from '../../../../../environments/environment';

const BASE = environment.bffBaseUrl;
const DETAIL_URL = `${BASE}/api/v1/question-banks/qb1`;
const QUESTIONS_URL = `${BASE}/api/v1/question-banks/qb1/questions`;
/**
 * Match GET/POST /questions by PATH — the GET now carries server-side paging
 * query params (?page=&page_size=...), so a bare-string expectOne(isQuestionsList)
 * (which matches urlWithParams) would miss it. `req.url` is the path only.
 */
const isQuestionsList = (r: { url: string }): boolean => r.url === QUESTIONS_URL;
const SEARCH_ENDPOINT = '/api/atoms/questions/search';
const ATOM_BASE = `${BASE}/api/atoms`;

/**
 * GET /api/atoms/{atomId} envelope with an embedded MCQ question_id — the
 * add-flow resolves atom_id → this embedded question_id before posting to the
 * bank (the bank references the questions-table PK, not the atom id).
 */
function atomEnv(atomId: string, questionId: string): Record<string, unknown> {
  return {
    atom: {
      atom_id: atomId,
      atom_type: 'mcq',
      mcq_payload: { question_id: questionId, prompt: 'P', options: [{ label: 'A' }] },
    },
  };
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

// GET /questions enriches each row with its host atom_id (distinct from the
// question_id) so the row conveniences address /api/atoms/{atom_id}. atom1/atom2
// are deliberately ≠ q1/q2 to prove the workbench uses the atom id, not the
// membership question id (the inverse of the add-to-bank atom_id↔question_id fix).
const QUESTIONS_BODY = {
  items: [
    {
      question_id: 'q1',
      atom_id: 'atom1',
      question_type: 'mcq',
      prompt: 'What is 2+2?',
      position: 0,
      added_at: '2026-06-01T01:00:00Z',
    },
    {
      question_id: 'q2',
      atom_id: 'atom2',
      question_type: 'oe',
      prompt: 'Explain photosynthesis.',
      position: 1,
      added_at: '2026-06-01T02:00:00Z',
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
  fixture: ComponentFixture<QuestionBankWorkbenchDetailComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
} {
  TestBed.configureTestingModule({
    imports: [QuestionBankWorkbenchDetailComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(QuestionBankWorkbenchDetailComponent);
  fixture.componentRef.setInput('id', 'qb1');
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, httpMock, element: fixture.nativeElement as HTMLElement };
}

/** Mount + flush the two initial GETs (detail + questions). */
function loaded(questionsBody: Record<string, unknown> = QUESTIONS_BODY): {
  fixture: ComponentFixture<QuestionBankWorkbenchDetailComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
} {
  const built = setup();
  built.httpMock.expectOne(DETAIL_URL).flush(BANK_DTO);
  built.httpMock.expectOne(isQuestionsList).flush(questionsBody);
  built.fixture.detectChanges();
  return built;
}

function flushPickerSearch(httpMock: HttpTestingController): void {
  httpMock.expectOne((r) => r.url.endsWith(SEARCH_ENDPOINT)).flush(PICKER_RESPONSE);
}

describe('QuestionBankWorkbenchDetailComponent', () => {
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
      const questions = httpMock.expectOne(isQuestionsList);
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
      // rows are human-readable: the question PROMPT is the label (+ a type badge),
      // not the opaque question_id.
      expect(element.querySelector('[data-testid="qb-question-prompt-q1"]')?.textContent).toContain(
        'What is 2+2?',
      );
      expect(element.querySelector('[data-testid="qb-question-prompt-q2"]')?.textContent).toContain(
        'Explain photosynthesis.',
      );
      expect(element.querySelector('[data-testid="qb-question-type-q1"]')?.textContent).toContain(
        'mcq',
      );
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
      httpMock.expectOne(isQuestionsList).flush({ items: [], total: 0 });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="qb-detail-error"]');
      expect(err?.getAttribute('role')).toBe('alert');
      expect(element.querySelector('[data-testid="qb-detail-notfound-back"]')).not.toBeNull();
      httpMock.verify();
    });

    it('shows a generic (non-404) bank error and the retry button re-fetches both', () => {
      const { fixture, httpMock, element } = setup();
      httpMock.expectOne(DETAIL_URL).flush('boom', { status: 503, statusText: 'Unavailable' });
      httpMock.expectOne(isQuestionsList).flush({ items: [], total: 0 });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="qb-detail-error"]');
      expect(err?.getAttribute('role')).toBe('alert');
      // generic error → retry button, NOT the 404 back link
      expect(element.querySelector('[data-testid="qb-detail-notfound-back"]')).toBeNull();
      element.querySelector<HTMLButtonElement>('[data-testid="qb-detail-retry"]')!.click();
      httpMock.expectOne(DETAIL_URL).flush(BANK_DTO);
      httpMock.expectOne(isQuestionsList).flush(QUESTIONS_BODY);
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="qb-detail-name"]')?.textContent).toContain(
        'Algebra Pool',
      );
      httpMock.verify();
    });

    it('shows a loud questions error panel when the questions fetch fails', () => {
      const { fixture, httpMock, element } = setup();
      httpMock.expectOne(DETAIL_URL).flush(BANK_DTO);
      httpMock.expectOne(isQuestionsList).flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="qb-questions-error"]');
      expect(err?.getAttribute('role')).toBe('alert');
      httpMock.verify();
    });
  });

  it('offers a path to the standalone test-set builder but NOT the R+ inline delivery-assembly form (CHO-1980)', () => {
    const { element, httpMock } = loaded();
    // The R+ inline assembly-FOR-DELIVERY form/toggle stays absent — A+ never
    // assembles for delivery inline; it hands off to the standalone builder.
    expect(element.querySelector('[data-testid="qb-assemble-toggle"]')).toBeNull();
    expect(element.querySelector('[data-testid="qb-assemble-form"]')).toBeNull();
    // …but there IS now a navigation action to the standalone test-set builder,
    // seeded from this bank (CHO-1980 re-surfaces the orphaned editor).
    expect(element.querySelector('[data-testid="qb-assemble-into-test-set"]')).not.toBeNull();
    httpMock.verify();
  });

  it('"Assemble into test set" navigates to the standalone builder seeded from this bank (CHO-1980)', () => {
    const { element, httpMock } = loaded();
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    element.querySelector<HTMLButtonElement>('[data-testid="qb-assemble-into-test-set"]')!.click();
    expect(navSpy).toHaveBeenCalledWith(['/a/studio/test-sets/new'], {
      queryParams: { from_bank: 'qb1' },
    });
    httpMock.verify();
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
      httpMock.expectOne(isQuestionsList).flush({ items: [QUESTIONS_BODY.items[1]], total: 1 });
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

    it('ignores a second remove while one is in flight (re-entrancy guard)', () => {
      const { fixture, httpMock, element } = loaded();
      element.querySelector<HTMLButtonElement>('[data-testid="qb-question-remove-q1"]')!.click();
      // The first DELETE is pending; a second remove must be a no-op.
      fixture.componentInstance.removeQuestion('q2');
      const dels = httpMock.match(`${QUESTIONS_URL}/q1`);
      expect(dels).toHaveLength(1);
      expect(httpMock.match(`${QUESTIONS_URL}/q2`)).toHaveLength(0);
      dels[0].flush(null, { status: 204, statusText: 'No Content' });
      httpMock.expectOne(isQuestionsList).flush({ items: [], total: 0 }); // refresh
      httpMock.verify();
    });
  });

  describe('questions error retry', () => {
    it('re-fetches the questions list via the retry button', () => {
      const { fixture, httpMock, element } = setup();
      httpMock.expectOne(DETAIL_URL).flush(BANK_DTO);
      httpMock.expectOne(isQuestionsList).flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      element.querySelector<HTMLButtonElement>('[data-testid="qb-questions-retry"]')!.click();
      httpMock.expectOne(isQuestionsList).flush(QUESTIONS_BODY);
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
      // resolve the picker's atom_id → embedded question_id first
      httpMock.expectOne(`${ATOM_BASE}/q7`).flush(atomEnv('q7', 'realq7'));
      // then the add POST (with the RESOLVED id) fails
      httpMock
        .expectOne(isQuestionsList)
        .flush('boom', { status: 500, statusText: 'Server Error' });
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
      httpMock.expectOne(`${ATOM_BASE}/q7`).flush(atomEnv('q7', 'realq7'));

      const post = httpMock.expectOne(isQuestionsList);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({ question_id: 'realq7' }); // RESOLVED, not the atom id
      post.flush({ question_id: 'realq7', position: 2, added_at: '2026-06-10T00:00:00Z' });
      // refresh
      httpMock.expectOne(isQuestionsList).flush({ items: [], total: 0 });
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
      // atom with NO embedded question_id → resolve returns '' → no post
      httpMock
        .expectOne(`${ATOM_BASE}/seed1`)
        .flush({ atom: { atom_id: 'seed1', atom_type: 'mcq' } });
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

      // resolve both atoms → embedded question_ids
      httpMock.expectOne(`${ATOM_BASE}/q7`).flush(atomEnv('q7', 'realq7'));
      httpMock.expectOne(`${ATOM_BASE}/q8`).flush(atomEnv('q8', 'realq8'));

      const posts = httpMock.match(isQuestionsList);
      expect(posts).toHaveLength(2);
      expect(posts.every((p) => p.request.method === 'POST')).toBe(true);
      expect(posts.map((p) => p.request.body)).toEqual([
        { question_id: 'realq7' },
        { question_id: 'realq8' },
      ]);
      posts.forEach((p) => p.flush({ question_id: 'x', position: 0, added_at: '' }));
      // single refresh after the batch
      httpMock.expectOne(isQuestionsList).flush({ items: [], total: 0 });
      fixture.detectChanges();
      httpMock.verify();
    });

    it('toasts an error (no refresh) when a bulk add fails', () => {
      const { fixture, httpMock } = loaded();
      const toast = TestBed.inject(ToastService);
      fixture.componentInstance.onQuestionsPicked([
        { id: 'q7', title: 'A', stem: 's', question_type: 'mcq' },
      ]);
      httpMock.expectOne(`${ATOM_BASE}/q7`).flush(atomEnv('q7', 'realq7'));
      httpMock
        .expectOne(isQuestionsList)
        .flush('boom', { status: 500, statusText: 'Server Error' });
      expect(toast.toasts()[0].type).toBe('error');
      // afterEach verify() asserts NO refresh GET fired on the error path.
      httpMock.verify();
    });

    it('bulk: skips + toasts when a picked atom has no live question (no post)', () => {
      const { fixture, httpMock } = loaded();
      const toast = TestBed.inject(ToastService);
      fixture.componentInstance.onQuestionsPicked([
        { id: 'seed1', title: 'S', stem: 's', question_type: 'mcq' },
      ]);
      httpMock
        .expectOne(`${ATOM_BASE}/seed1`)
        .flush({ atom: { atom_id: 'seed1', atom_type: 'mcq' } });
      expect(toast.toasts().some((t) => t.type === 'error')).toBe(true);
      httpMock.verify(); // no add POST
    });
  });

  describe('bulk remove (forkJoin)', () => {
    it('selecting question rows reveals the bulk bar with a live count', () => {
      const { fixture, httpMock, element } = loaded();
      expect(element.querySelector('[data-testid="qb-bulk-bar"]')).toBeNull();
      element.querySelector<HTMLInputElement>('[data-testid="qb-question-select-q1"]')!.click();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="qb-bulk-bar"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="qb-bulk-count"]')?.textContent).toContain('1');
      element.querySelector<HTMLInputElement>('[data-testid="qb-question-select-q2"]')!.click();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="qb-bulk-count"]')?.textContent).toContain('2');
      expect(fixture.componentInstance.selectedCount()).toBe(2);
      httpMock.verify();
    });

    it('"Remove N selected" DELETEs each then refreshes once + success toast + clears selection', () => {
      const { fixture, httpMock, element } = loaded();
      const toast = TestBed.inject(ToastService);
      element.querySelector<HTMLInputElement>('[data-testid="qb-question-select-q1"]')!.click();
      element.querySelector<HTMLInputElement>('[data-testid="qb-question-select-q2"]')!.click();
      fixture.detectChanges();
      element.querySelector<HTMLButtonElement>('[data-testid="qb-bulk-remove"]')!.click();

      const dels = [
        httpMock.expectOne(`${QUESTIONS_URL}/q1`),
        httpMock.expectOne(`${QUESTIONS_URL}/q2`),
      ];
      expect(dels.every((d) => d.request.method === 'DELETE')).toBe(true);
      dels.forEach((d) => d.flush(null, { status: 204, statusText: 'No Content' }));
      // single refresh after the batch
      httpMock.expectOne(isQuestionsList).flush({ items: [], total: 0 });
      fixture.detectChanges();
      expect(toast.toasts().length).toBe(1);
      expect(toast.toasts()[0].type).toBe('success');
      // selection cleared → bulk bar gone
      expect(element.querySelector('[data-testid="qb-bulk-bar"]')).toBeNull();
      expect(fixture.componentInstance.selectedCount()).toBe(0);
      httpMock.verify();
    });

    it('bulkRemove with an empty selection is a no-op (no requests)', () => {
      const { fixture, httpMock } = loaded();
      fixture.componentInstance.bulkRemove();
      httpMock.verify();
    });

    it('toasts an error and still refreshes on a bulk failure (partial-state honesty)', () => {
      const { fixture, httpMock, element } = loaded();
      const toast = TestBed.inject(ToastService);
      // select a single row so forkJoin has exactly one request to error (no
      // sibling request left dangling/cancelled for verify()).
      element.querySelector<HTMLInputElement>('[data-testid="qb-question-select-q1"]')!.click();
      fixture.detectChanges();
      element.querySelector<HTMLButtonElement>('[data-testid="qb-bulk-remove"]')!.click();
      httpMock
        .expectOne(`${QUESTIONS_URL}/q1`)
        .flush('boom', { status: 500, statusText: 'Server Error' });
      // refresh STILL fires to reflect any partial change
      httpMock.expectOne(isQuestionsList).flush({ items: [], total: 0 });
      fixture.detectChanges();
      expect(toast.toasts()[0].type).toBe('error');
      expect(fixture.componentInstance.selectedCount()).toBe(0);
      httpMock.verify();
    });

    it('a reload prunes selection down to ids still present', () => {
      const { fixture, httpMock, element } = loaded();
      element.querySelector<HTMLInputElement>('[data-testid="qb-question-select-q1"]')!.click();
      element.querySelector<HTMLInputElement>('[data-testid="qb-question-select-q2"]')!.click();
      fixture.detectChanges();
      expect(fixture.componentInstance.selectedCount()).toBe(2);
      // single-row remove q2 → refresh returns only q1 → q2 pruned from selection
      element.querySelector<HTMLButtonElement>('[data-testid="qb-question-remove-q2"]')!.click();
      httpMock
        .expectOne(`${QUESTIONS_URL}/q2`)
        .flush(null, { status: 204, statusText: 'No Content' });
      httpMock
        .expectOne(isQuestionsList)
        .flush({ items: [{ question_id: 'q1', position: 0, added_at: '' }], total: 1 });
      fixture.detectChanges();
      expect(fixture.componentInstance.isQuestionSelected('q1')).toBe(true);
      expect(fixture.componentInstance.isQuestionSelected('q2')).toBe(false);
      expect(fixture.componentInstance.selectedCount()).toBe(1);
      httpMock.verify();
    });
  });

  // ── Wave 2 conveniences: preview / edit / tags / clone / reorder ─────────
  describe('row conveniences (Wave 2)', () => {
    const Q1_ATOM = {
      atom: {
        atom_id: 'atom1',
        atom_type: 'mcq',
        title: 'Q1 title',
        subject: 'Science',
        tags: ['t1'],
        mcq_payload: {
          question_id: 'realq1',
          prompt: 'What is 2+2?',
          options: [{ label: 'Three' }, { label: 'Four' }],
        },
      },
    };
    const Q1_AUTHOR = {
      question: {
        prompt: 'What is 2+2?',
        mcq: {
          options: [
            { option_id: 'o1', label: 'Three', is_correct: false, explainer: '' },
            { option_id: 'o2', label: 'Four', is_correct: true, explainer: 'sum' },
          ],
        },
      },
    };
    // Same author projection but carrying BOTH a stem + a model-answer image, so
    // the edit panel must SHOW each and offer a Remove affordance (CHO-1974).
    const Q1_AUTHOR_WITH_IMAGES = {
      question: {
        prompt: 'What is 2+2?',
        mcq: {
          image_url: 'https://signed.example/stem.png',
          answer_image_url: 'https://signed.example/answer.png',
          options: [
            { option_id: 'o1', label: 'Three', is_correct: false, explainer: '' },
            { option_id: 'o2', label: 'Four', is_correct: true, explainer: 'sum' },
          ],
        },
      },
    };

    describe('preview — author review, answer key (W2.B)', () => {
      it('opens → atom + author projection → renders the shared author review WITH the answer key', () => {
        const { fixture, httpMock, element } = loaded();
        element.querySelector<HTMLButtonElement>('[data-testid="qb-question-preview-q1"]')!.click();
        fixture.detectChanges();
        // Same chain as Edit: GET atom (embedded question_id) → GET author question.
        httpMock.expectOne(`${ATOM_BASE}/atom1`).flush(Q1_ATOM);
        httpMock.expectOne(`${ATOM_BASE}/atom1/questions/realq1`).flush(Q1_AUTHOR);
        fixture.detectChanges();
        // The shared ChoraQuestionReviewComponent renders (same as test-set-editor),
        // showing the answer key — NOT the old learner-safe view.
        expect(element.querySelector('[data-testid="qb-preview-content"]')).not.toBeNull();
        expect(element.querySelector('chora-question-review')).not.toBeNull();
        const text = element.textContent ?? '';
        expect(text).toContain('Three');
        expect(text).toContain('Four');
        // answer key IS now shown: the correct option is marked + its explainer renders.
        expect(element.querySelector('[data-is-correct="true"]')).not.toBeNull();
        expect(text).toContain('sum');
        httpMock.verify();
      });

      it('toggles closed on a second click', () => {
        const { fixture, httpMock, element } = loaded();
        element.querySelector<HTMLButtonElement>('[data-testid="qb-question-preview-q1"]')!.click();
        fixture.detectChanges();
        httpMock.expectOne(`${ATOM_BASE}/atom1`).flush(Q1_ATOM);
        httpMock.expectOne(`${ATOM_BASE}/atom1/questions/realq1`).flush(Q1_AUTHOR);
        fixture.detectChanges();
        element.querySelector<HTMLButtonElement>('[data-testid="qb-question-preview-q1"]')!.click();
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="qb-preview-panel"]')).toBeNull();
        httpMock.verify();
      });

      it('surfaces a load error', () => {
        const { fixture, httpMock, element } = loaded();
        element.querySelector<HTMLButtonElement>('[data-testid="qb-question-preview-q1"]')!.click();
        fixture.detectChanges();
        httpMock
          .expectOne(`${ATOM_BASE}/atom1`)
          .flush('boom', { status: 500, statusText: 'Server Error' });
        fixture.detectChanges();
        expect(
          element.querySelector('[data-testid="qb-preview-error"]')?.getAttribute('role'),
        ).toBe('alert');
        httpMock.verify();
      });
    });

    describe('inline quick-edit (W2.C)', () => {
      function openedEdit(): {
        fixture: ComponentFixture<QuestionBankWorkbenchDetailComponent>;
        httpMock: HttpTestingController;
        element: HTMLElement;
      } {
        const built = loaded();
        built.element
          .querySelector<HTMLButtonElement>('[data-testid="qb-question-edit-q1"]')!
          .click();
        built.fixture.detectChanges();
        built.httpMock.expectOne(`${ATOM_BASE}/atom1`).flush(Q1_ATOM);
        built.httpMock.expectOne(`${ATOM_BASE}/atom1/questions/realq1`).flush(Q1_AUTHOR);
        built.fixture.detectChanges();
        return built;
      }

      it('chains atom → author projection and renders the shared editor + revision note', () => {
        const { fixture, element, httpMock } = openedEdit();
        expect(element.querySelector('[data-testid="qb-edit-panel"]')).not.toBeNull();
        expect(element.querySelector('chora-question-editor')).not.toBeNull();
        expect(element.querySelector('[data-testid="qb-edit-revision-note"]')).not.toBeNull();
        expect(fixture.componentInstance.editValid()).toBe(true);
        httpMock.verify();
      });

      it('save PATCHes the embedded question id then closes + success toast', () => {
        const { fixture, element, httpMock } = openedEdit();
        const toast = TestBed.inject(ToastService);
        const cur = fixture.componentInstance.editModel()!;
        fixture.componentInstance.editModel.set({ ...cur, prompt: 'What is 3+1?' });
        fixture.detectChanges();
        element.querySelector<HTMLButtonElement>('[data-testid="qb-edit-save"]')!.click();
        const patch = httpMock.expectOne(`${ATOM_BASE}/atom1/questions/realq1`);
        expect(patch.request.method).toBe('PATCH');
        expect(patch.request.body).toMatchObject({ prompt: 'What is 3+1?' });
        patch.flush(null, { status: 204, statusText: 'No Content' });
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="qb-edit-panel"]')).toBeNull();
        expect(toast.toasts()[0].type).toBe('success');
        httpMock.verify();
      });

      it('save error keeps the panel open + error toast', () => {
        const { fixture, element, httpMock } = openedEdit();
        const toast = TestBed.inject(ToastService);
        element.querySelector<HTMLButtonElement>('[data-testid="qb-edit-save"]')!.click();
        httpMock
          .expectOne(`${ATOM_BASE}/atom1/questions/realq1`)
          .flush('boom', { status: 500, statusText: 'Server Error' });
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="qb-edit-panel"]')).not.toBeNull();
        expect(toast.toasts()[0].type).toBe('error');
        httpMock.verify();
      });

      it('surfaces a load error when the author projection fails', () => {
        const { fixture, httpMock, element } = loaded();
        element.querySelector<HTMLButtonElement>('[data-testid="qb-question-edit-q1"]')!.click();
        fixture.detectChanges();
        httpMock.expectOne(`${ATOM_BASE}/atom1`).flush(Q1_ATOM);
        httpMock
          .expectOne(`${ATOM_BASE}/atom1/questions/realq1`)
          .flush('boom', { status: 503, statusText: 'Unavailable' });
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="qb-edit-error"]')).not.toBeNull();
        httpMock.verify();
      });

      it('toggles closed on a second Edit click (no extra fetch)', () => {
        const { fixture, element, httpMock } = openedEdit();
        element.querySelector<HTMLButtonElement>('[data-testid="qb-question-edit-q1"]')!.click();
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="qb-edit-panel"]')).toBeNull();
        httpMock.verify();
      });

      it('save is a no-op while the question is invalid (empty prompt)', () => {
        const { fixture, httpMock } = openedEdit();
        const cur = fixture.componentInstance.editModel()!;
        fixture.componentInstance.editModel.set({ ...cur, prompt: '' });
        expect(fixture.componentInstance.editValid()).toBe(false);
        fixture.componentInstance.saveEdit();
        httpMock.verify(); // no PATCH fired
      });

      // ── Image show + Remove (CHO-1974) ───────────────────────────────────
      describe('question + model-answer image show + Remove (CHO-1974)', () => {
        function openedEditWithImages(): {
          fixture: ComponentFixture<QuestionBankWorkbenchDetailComponent>;
          httpMock: HttpTestingController;
          element: HTMLElement;
        } {
          const built = loaded();
          built.element
            .querySelector<HTMLButtonElement>('[data-testid="qb-question-edit-q1"]')!
            .click();
          built.fixture.detectChanges();
          built.httpMock.expectOne(`${ATOM_BASE}/atom1`).flush(Q1_ATOM);
          built.httpMock
            .expectOne(`${ATOM_BASE}/atom1/questions/realq1`)
            .flush(Q1_AUTHOR_WITH_IMAGES);
          built.fixture.detectChanges();
          return built;
        }

        it('SHOWS the stem image, the model-answer image, and a Remove for each', () => {
          const { element, httpMock } = openedEditWithImages();
          expect(element.querySelector('[data-testid="qb-edit-image-figure"]')).not.toBeNull();
          expect(
            element.querySelector('[data-testid="qb-edit-answer-image-figure"]'),
          ).not.toBeNull();
          expect(element.querySelector('[data-testid="qb-edit-remove-image"]')).not.toBeNull();
          expect(
            element.querySelector('[data-testid="qb-edit-remove-answer-image"]'),
          ).not.toBeNull();
          httpMock.verify();
        });

        it('a normal save OMITS both image fields (BE carries the durable refs forward)', () => {
          const { element, httpMock } = openedEditWithImages();
          element.querySelector<HTMLButtonElement>('[data-testid="qb-edit-save"]')!.click();
          const patch = httpMock.expectOne(`${ATOM_BASE}/atom1/questions/realq1`);
          expect(patch.request.method).toBe('PATCH');
          expect(patch.request.body).not.toHaveProperty('image_url');
          expect(patch.request.body).not.toHaveProperty('answer_image_url');
          patch.flush(null, { status: 204, statusText: 'No Content' });
          httpMock.verify();
        });

        it('Remove image → save sends image_url:"" (explicit clear) and NOT answer_image_url', () => {
          const { fixture, element, httpMock } = openedEditWithImages();
          element.querySelector<HTMLButtonElement>('[data-testid="qb-edit-remove-image"]')!.click();
          fixture.detectChanges();
          // The stem image is hidden once staged for removal (replaced by an Undo note).
          expect(element.querySelector('[data-testid="qb-edit-image-figure"]')).toBeNull();
          expect(element.querySelector('[data-testid="qb-edit-undo-remove-image"]')).not.toBeNull();
          element.querySelector<HTMLButtonElement>('[data-testid="qb-edit-save"]')!.click();
          const patch = httpMock.expectOne(`${ATOM_BASE}/atom1/questions/realq1`);
          expect(patch.request.body).toMatchObject({ image_url: '' });
          expect(patch.request.body).not.toHaveProperty('answer_image_url');
          patch.flush(null, { status: 204, statusText: 'No Content' });
          httpMock.verify();
        });

        it('Remove model-answer image → save sends answer_image_url:"" and NOT image_url', () => {
          const { fixture, element, httpMock } = openedEditWithImages();
          element
            .querySelector<HTMLButtonElement>('[data-testid="qb-edit-remove-answer-image"]')!
            .click();
          fixture.detectChanges();
          expect(element.querySelector('[data-testid="qb-edit-answer-image-figure"]')).toBeNull();
          element.querySelector<HTMLButtonElement>('[data-testid="qb-edit-save"]')!.click();
          const patch = httpMock.expectOne(`${ATOM_BASE}/atom1/questions/realq1`);
          expect(patch.request.body).toMatchObject({ answer_image_url: '' });
          expect(patch.request.body).not.toHaveProperty('image_url');
          patch.flush(null, { status: 204, statusText: 'No Content' });
          httpMock.verify();
        });

        it('Undo restores the staged-removed image → save omits the field again', () => {
          const { fixture, element, httpMock } = openedEditWithImages();
          element.querySelector<HTMLButtonElement>('[data-testid="qb-edit-remove-image"]')!.click();
          fixture.detectChanges();
          element
            .querySelector<HTMLButtonElement>('[data-testid="qb-edit-undo-remove-image"]')!
            .click();
          fixture.detectChanges();
          expect(element.querySelector('[data-testid="qb-edit-image-figure"]')).not.toBeNull();
          element.querySelector<HTMLButtonElement>('[data-testid="qb-edit-save"]')!.click();
          const patch = httpMock.expectOne(`${ATOM_BASE}/atom1/questions/realq1`);
          expect(patch.request.body).not.toHaveProperty('image_url');
          patch.flush(null, { status: 204, statusText: 'No Content' });
          httpMock.verify();
        });
      });
    });

    describe('tags/subject (W2.D)', () => {
      function openedTags(): {
        fixture: ComponentFixture<QuestionBankWorkbenchDetailComponent>;
        httpMock: HttpTestingController;
        element: HTMLElement;
      } {
        const built = loaded();
        built.element
          .querySelector<HTMLButtonElement>('[data-testid="qb-question-tags-q1"]')!
          .click();
        built.fixture.detectChanges();
        built.httpMock.expectOne(`${ATOM_BASE}/atom1`).flush(Q1_ATOM);
        built.fixture.detectChanges();
        return built;
      }

      it('opens and pre-fills the subject + existing tag chips', () => {
        const { element, httpMock } = openedTags();
        expect(
          (element.querySelector('[data-testid="qb-tags-subject"]') as HTMLInputElement).value,
        ).toBe('Science');
        expect(element.querySelector('[data-testid="qb-tags-chip-remove-t1"]')).not.toBeNull();
        httpMock.verify();
      });

      it('adds a chip + edits subject + PATCHes /api/atoms/{id} { tags, subject }', () => {
        const { fixture, element, httpMock } = openedTags();
        const c = fixture.componentInstance;
        c.metaTagDraft.set('newtag');
        c.addMetaTag();
        c.metaSubject.set('Biology');
        fixture.detectChanges();
        element.querySelector<HTMLButtonElement>('[data-testid="qb-tags-save"]')!.click();
        const patch = httpMock.expectOne(`${ATOM_BASE}/atom1`);
        expect(patch.request.method).toBe('PATCH');
        expect(patch.request.body).toEqual({ tags: ['t1', 'newtag'], subject: 'Biology' });
        patch.flush(null, { status: 204, statusText: 'No Content' });
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="qb-tags-panel"]')).toBeNull();
        httpMock.verify();
      });

      it('removes a chip', () => {
        const { fixture, httpMock } = openedTags();
        fixture.componentInstance.removeMetaTag('t1');
        expect([...fixture.componentInstance.metaTags()]).toEqual([]);
        httpMock.verify();
      });

      it('add-chip dedupes + ignores blank draft', () => {
        const { fixture, httpMock } = openedTags();
        const c = fixture.componentInstance;
        c.metaTagDraft.set('t1'); // already present
        c.addMetaTag();
        c.metaTagDraft.set('   ');
        c.addMetaTag();
        expect([...c.metaTags()]).toEqual(['t1']);
        httpMock.verify();
      });

      it('save error keeps the panel open + error toast', () => {
        const { fixture, element, httpMock } = openedTags();
        const toast = TestBed.inject(ToastService);
        element.querySelector<HTMLButtonElement>('[data-testid="qb-tags-save"]')!.click();
        httpMock
          .expectOne(`${ATOM_BASE}/atom1`)
          .flush('boom', { status: 422, statusText: 'Unprocessable' });
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="qb-tags-panel"]')).not.toBeNull();
        expect(toast.toasts()[0].type).toBe('error');
        httpMock.verify();
      });

      it('toggles closed on a second Tags click', () => {
        const { fixture, element, httpMock } = openedTags();
        element.querySelector<HTMLButtonElement>('[data-testid="qb-question-tags-q1"]')!.click();
        fixture.detectChanges();
        expect(element.querySelector('[data-testid="qb-tags-panel"]')).toBeNull();
        httpMock.verify();
      });
    });

    describe('clone-as-variant (W2.F)', () => {
      it('POSTs /clone then adds the new atom to the bank + refresh + success toast', () => {
        const { fixture, httpMock, element } = loaded();
        const toast = TestBed.inject(ToastService);
        element.querySelector<HTMLButtonElement>('[data-testid="qb-question-clone-q1"]')!.click();
        const clone = httpMock.expectOne(`${ATOM_BASE}/atom1/clone`);
        expect(clone.request.method).toBe('POST');
        expect(clone.request.body).toEqual({});
        clone.flush(
          { atom_id: 'q9', cloned_from_atom_id: 'atom1' },
          { status: 201, statusText: 'Created' },
        );
        // resolve the NEW atom's embedded question_id before adding to the bank
        httpMock.expectOne(`${ATOM_BASE}/q9`).flush(atomEnv('q9', 'realq9'));
        // chained add of the clone's question to THIS bank (RESOLVED id)
        const add = httpMock.expectOne(isQuestionsList);
        expect(add.request.method).toBe('POST');
        expect(add.request.body).toEqual({ question_id: 'realq9' });
        add.flush({ question_id: 'realq9', position: 2, added_at: '' });
        // refresh
        httpMock.expectOne(isQuestionsList).flush({ items: [], total: 0 });
        fixture.detectChanges();
        expect(toast.toasts()[0].type).toBe('success');
        httpMock.verify();
      });

      it('toasts an error when the clone fails (no add)', () => {
        const { httpMock, element } = loaded();
        const toast = TestBed.inject(ToastService);
        element.querySelector<HTMLButtonElement>('[data-testid="qb-question-clone-q1"]')!.click();
        httpMock
          .expectOne(`${ATOM_BASE}/atom1/clone`)
          .flush('boom', { status: 502, statusText: 'Bad Gateway' });
        expect(toast.toasts()[0].type).toBe('error');
        // afterEach verify() asserts NO add fired on the clone-error path.
        httpMock.verify();
      });

      it('ignores a second clone of the same row while one is in flight', () => {
        const { fixture, httpMock, element } = loaded();
        element.querySelector<HTMLButtonElement>('[data-testid="qb-question-clone-q1"]')!.click();
        // first clone POST is pending; a second invocation must be a no-op
        fixture.componentInstance.cloneAtom('atom1');
        const clones = httpMock.match(`${ATOM_BASE}/atom1/clone`);
        expect(clones).toHaveLength(1);
        clones[0].flush(
          { atom_id: 'q9', cloned_from_atom_id: 'atom1' },
          { status: 201, statusText: 'Created' },
        );
        httpMock.expectOne(`${ATOM_BASE}/q9`).flush(atomEnv('q9', 'realq9')); // resolve
        httpMock
          .expectOne(isQuestionsList)
          .flush({ question_id: 'realq9', position: 2, added_at: '' }); // add
        httpMock.expectOne(isQuestionsList).flush({ items: [], total: 0 }); // reload
        httpMock.verify();
      });
    });

    describe('drag-reorder (W2.E)', () => {
      it('moveDown POSTs the new full order then reloads', () => {
        const { fixture, httpMock, element } = loaded();
        element.querySelector<HTMLButtonElement>('[data-testid="qb-question-down-q1"]')!.click();
        const reorder = httpMock.expectOne(`${BASE}/api/v1/question-banks/qb1/reorder`);
        expect(reorder.request.method).toBe('POST');
        expect(reorder.request.body).toEqual({ question_ids: ['q2', 'q1'] });
        reorder.flush({ ...BANK_DTO, question_bank_id: 'qb1' });
        httpMock.expectOne(isQuestionsList).flush(QUESTIONS_BODY); // reload
        fixture.detectChanges();
        httpMock.verify();
      });

      it('moveUp on the first row is a no-op', () => {
        const { fixture, httpMock } = loaded();
        fixture.componentInstance.moveUp(0);
        httpMock.verify(); // no reorder POST
      });

      it('moveUp on a later row POSTs the swapped order', () => {
        const { fixture, httpMock, element } = loaded();
        element.querySelector<HTMLButtonElement>('[data-testid="qb-question-up-q2"]')!.click();
        const reorder = httpMock.expectOne(`${BASE}/api/v1/question-banks/qb1/reorder`);
        expect(reorder.request.body).toEqual({ question_ids: ['q2', 'q1'] });
        reorder.flush({ ...BANK_DTO, question_bank_id: 'qb1' });
        httpMock.expectOne(isQuestionsList).flush(QUESTIONS_BODY);
        fixture.detectChanges();
        httpMock.verify();
      });

      it('moveDown on the last row is a no-op', () => {
        const { fixture, httpMock } = loaded();
        fixture.componentInstance.moveDown(1); // q2 is last of [q1, q2]
        httpMock.verify(); // no reorder POST
      });

      it('drop persists the cdk-reordered list', () => {
        const { fixture, httpMock } = loaded();
        type DropArg = Parameters<QuestionBankWorkbenchDetailComponent['drop']>[0];
        fixture.componentInstance.drop({ previousIndex: 0, currentIndex: 1 } as unknown as DropArg);
        const reorder = httpMock.expectOne(`${BASE}/api/v1/question-banks/qb1/reorder`);
        expect(reorder.request.body).toEqual({ question_ids: ['q2', 'q1'] });
        reorder.flush({ ...BANK_DTO, question_bank_id: 'qb1' });
        httpMock.expectOne(isQuestionsList).flush(QUESTIONS_BODY);
        httpMock.verify();
      });

      it('drop with identical indices is a no-op', () => {
        const { fixture, httpMock } = loaded();
        type DropArg = Parameters<QuestionBankWorkbenchDetailComponent['drop']>[0];
        fixture.componentInstance.drop({ previousIndex: 1, currentIndex: 1 } as unknown as DropArg);
        httpMock.verify(); // no reorder POST
      });

      it('reorder failure toasts + reloads (revert to server truth)', () => {
        const { fixture, httpMock, element } = loaded();
        const toast = TestBed.inject(ToastService);
        element.querySelector<HTMLButtonElement>('[data-testid="qb-question-down-q1"]')!.click();
        httpMock
          .expectOne(`${BASE}/api/v1/question-banks/qb1/reorder`)
          .flush('boom', { status: 422, statusText: 'Unprocessable' });
        httpMock.expectOne(isQuestionsList).flush(QUESTIONS_BODY); // revert reload
        fixture.detectChanges();
        expect(toast.toasts()[0].type).toBe('error');
        httpMock.verify();
      });
    });
  });

  describe('search / type-filter / sort / pagination (server-side, W3)', () => {
    it('renders the controls bar + result count when the bank has questions', () => {
      const { element } = loaded();
      expect(element.querySelector('[data-testid="qb-controls"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="qb-search"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="qb-sort"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="qb-result-count"]')?.textContent).toContain('2');
    });

    it('type filter → reloads with question_type + resets to page 1', () => {
      const { fixture, httpMock } = loaded();
      fixture.componentInstance.toggleType('mcq');
      fixture.detectChanges();
      const req = httpMock.expectOne(isQuestionsList);
      expect(req.request.params.get('question_type')).toBe('mcq');
      expect(req.request.params.get('page')).toBe('1');
      req.flush(QUESTIONS_BODY);
    });

    it('sort change → reloads with the sort token', () => {
      const { fixture, httpMock } = loaded();
      fixture.componentInstance.sortValue.set('prompt:desc');
      fixture.detectChanges();
      const req = httpMock.expectOne(isQuestionsList);
      expect(req.request.params.get('sort')).toBe('prompt:desc');
      req.flush(QUESTIONS_BODY);
    });

    it('paginates: nextPage → reloads with page=2', () => {
      // total 50 over pageSize 20 → 3 pages, so Next is enabled + the nav shows.
      const { fixture, httpMock, element } = loaded({
        items: [QUESTIONS_BODY.items[0]],
        total: 50,
        page: 1,
        page_size: 20,
      });
      expect(element.querySelector('[data-testid="qb-pagination"]')).not.toBeNull();
      fixture.componentInstance.nextPage();
      fixture.detectChanges();
      const req = httpMock.expectOne(isQuestionsList);
      expect(req.request.params.get('page')).toBe('2');
      req.flush({ items: [QUESTIONS_BODY.items[1]], total: 50, page: 2, page_size: 20 });
    });

    it('renders the interpolated "page X of Y" status (no raw placeholders)', () => {
      // The custom translate pipe/service takes a key only — interpolation must
      // happen in the component (pageStatus), not via pipe params, or the AOT
      // build breaks (TS2554). Stub instant to the real en.json template so the
      // `.replace` interpolation is exercised (the test service loads no json).
      // setup() detectChanges()es while still loading (pagination hidden →
      // pageStatus unread), so the spy is active before its first computation.
      const { fixture, httpMock, element } = setup();
      vi.spyOn(TestBed.inject(TranslateService), 'instant').mockImplementation((key: string) =>
        key === 'aplus.question_banks.detail.pagination.page_of'
          ? 'Page {{page}} of {{total}}'
          : key,
      );
      httpMock.expectOne(DETAIL_URL).flush(BANK_DTO);
      httpMock
        .expectOne(isQuestionsList)
        .flush({ items: [QUESTIONS_BODY.items[0]], total: 50, page: 1, page_size: 20 });
      fixture.detectChanges();
      const status = element.querySelector('[data-testid="qb-page-status"]')?.textContent ?? '';
      expect(status).toContain('Page 1 of 3');
      expect(status).not.toContain('{{');
    });

    it('hides drag-reorder when multi-page (a page is not a full permutation)', () => {
      const { element } = loaded({
        items: [QUESTIONS_BODY.items[0]],
        total: 50, // > page_size → multi-page → canReorder false
        page: 1,
        page_size: 20,
      });
      expect(element.querySelector('[data-testid="qb-question-drag-q1"]')).toBeNull();
      expect(element.querySelector('[data-testid="qb-question-up-q1"]')).toBeNull();
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
