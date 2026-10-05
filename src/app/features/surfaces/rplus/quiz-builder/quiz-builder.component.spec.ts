import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { QuizBuilderComponent } from './quiz-builder.component';
import { environment } from '../../../../../environments/environment';
import type {
  BackendLiveQuiz,
  BackendLiveQuizQuestion,
} from './quiz-builder.model';
import type {
  QuestionSearchResponse,
  QuestionSearchResult,
} from '../../aplus/atom-question-picker/atom-question-picker.model';
import type { AtomProjectionResponse } from '../../aplus/test-set-editor/test-set-editor.model';

const ROOT = `${environment.bffBaseUrl}/api/v1/live-quizzes`;

/** Atom id used across the Add-from-Atom picker tests. */
const PICKED_ATOM_ID = '01985e7f-1234-7abc-8def-000000000a01';

/** One picker search row (questions ARE atoms intra-domain — id is the atom id). */
function pickerResult(
  overrides: Partial<QuestionSearchResult> = {},
): QuestionSearchResult {
  return {
    id: PICKED_ATOM_ID,
    title: 'SOLID — Open-Closed Principle',
    stem: 'Which statement best describes the Open-Closed Principle?',
    question_type: 'mcq',
    tenant_id: 'tenant-001',
    author_gcid: 'gcid-author',
    created_at: '2026-05-15T08:12:33Z',
    updated_at: '2026-05-15T09:02:11Z',
    ...overrides,
  };
}

function pickerResponse(
  items: readonly QuestionSearchResult[] = [pickerResult()],
): QuestionSearchResponse {
  return { items, page: 1, per: 20, total: items.length };
}

/** Full atom projection envelope returned by GET /api/atoms/{id}. */
function atomProjection(): AtomProjectionResponse {
  return {
    atom: {
      atom_id: PICKED_ATOM_ID,
      atom_type: 'mcq',
      title: 'SOLID — Open-Closed Principle',
      mcq_payload: {
        question_id: 'q-embedded',
        prompt: 'Which statement best describes the Open-Closed Principle?',
        options: [
          { option_id: 'o1', label: 'A', text: 'Open for extension' },
          { option_id: 'o2', label: 'B', text: 'Closed for everything' },
          { option_id: 'o3', label: 'C', text: 'Always rewrite' },
          { option_id: 'o4', label: 'D', text: 'Never test' },
        ],
      },
    },
  };
}

/** Drain the embedded picker's mount-time search so httpMock stays clean. */
function flushPickerSearch(
  httpMock: HttpTestingController,
  items: readonly QuestionSearchResult[] = [pickerResult()],
): void {
  httpMock
    .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
    .flush(pickerResponse(items));
}

function backendQuiz(
  overrides: Partial<BackendLiveQuiz> = {},
): BackendLiveQuiz {
  return {
    id: 'lq-new',
    tenant_id: 'tenant-001',
    course_id: '',
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
    question_id: 'q-1',
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

function setup(): {
  fixture: ComponentFixture<QuizBuilderComponent>;
  element: HTMLElement;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [QuizBuilderComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(QuizBuilderComponent);
  fixture.detectChanges();
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('QuizBuilderComponent', () => {
  let fixture: ComponentFixture<QuizBuilderComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.resetTestingModule();
    const s = setup();
    fixture = s.fixture;
    element = s.element;
    httpMock = s.httpMock;
  });

  afterEach(() => {
    vi.useRealTimers();
    httpMock.verify();
  });

  describe('initial render', () => {
    it('renders surface-rplus accent', () => {
      const root = element.querySelector(
        '[data-testid="rplus-quiz-builder"]',
      );
      expect(root?.className).toContain('surface-rplus');
    });

    it('starts in DRAFT state', () => {
      const state = element.querySelector(
        '[data-testid="quiz-builder-state"]',
      );
      expect(state?.textContent?.trim()).toBe('DRAFT');
    });

    it('shows the empty state when there are no questions', () => {
      const empty = element.querySelector(
        '[data-testid="quiz-builder-empty"]',
      );
      expect(empty).not.toBeNull();
    });

    it('renders the meta form with title + course inputs', () => {
      const title = element.querySelector(
        '[data-testid="quiz-builder-title-input"]',
      );
      const course = element.querySelector(
        '[data-testid="quiz-builder-course-input"]',
      );
      expect(title).not.toBeNull();
      expect(course).not.toBeNull();
    });

    it('disables Publish until the draft is valid + saved', () => {
      const cta = element.querySelector(
        '[data-testid="quiz-builder-publish"]',
      ) as HTMLButtonElement;
      expect(cta.disabled).toBe(true);
    });

    it('items count KPI is 0', () => {
      const count = element.querySelector(
        '[data-testid="quiz-builder-items-count"]',
      );
      expect(count?.textContent).toContain('0');
    });
  });

  describe('addQuestion()', () => {
    it('appends a blank question and selects it', () => {
      const add = element.querySelector(
        '[data-testid="quiz-builder-add"]',
      ) as HTMLButtonElement;
      add.click();
      fixture.detectChanges();
      const count = element.querySelector(
        '[data-testid="quiz-builder-items-count"]',
      );
      expect(count?.textContent).toContain('1');
      // Preview pane shows the new (empty-prompt) item
      const preview = element.querySelector(
        '[data-testid="quiz-builder-preview-prompt"]',
      );
      expect(preview).not.toBeNull();
    });

    it('a freshly-added question renders 4 option inputs A/B/C/D', () => {
      const add = element.querySelector(
        '[data-testid="quiz-builder-add"]',
      ) as HTMLButtonElement;
      add.click();
      fixture.detectChanges();
      const radios = element.querySelectorAll(
        'input[type="radio"][class="quiz-builder__correct-toggle"]',
      );
      expect(radios.length).toBe(4);
    });
  });

  // L5.2 (CHO-1704 WS3) — per-question ×2 round flag.
  describe('double points toggle', () => {
    it('round-trips the per-question doublePoints flag via the checkbox', () => {
      const add = element.querySelector(
        '[data-testid="quiz-builder-add"]',
      ) as HTMLButtonElement;
      add.click();
      fixture.detectChanges();
      const toggle = element.querySelector(
        '[data-testid="quiz-builder-double-0"]',
      ) as HTMLInputElement;
      expect(toggle).not.toBeNull();
      expect(toggle.checked).toBe(false);
      expect(fixture.componentInstance.draft().items[0]!.doublePoints).toBe(
        false,
      );
      toggle.click();
      fixture.detectChanges();
      expect(fixture.componentInstance.draft().items[0]!.doublePoints).toBe(
        true,
      );
      toggle.click();
      fixture.detectChanges();
      expect(fixture.componentInstance.draft().items[0]!.doublePoints).toBe(
        false,
      );
    });
  });

  describe('saveDraft()', () => {
    it('POSTs /api/v1/live-quizzes when there is no id', () => {
      // 1) Type a title
      const titleInput = element.querySelector(
        '[data-testid="quiz-builder-title-input"]',
      ) as HTMLInputElement;
      titleInput.value = 'CSPO Sprint Planning';
      titleInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      // 2) Click Save Draft
      const save = element.querySelector(
        '[data-testid="quiz-builder-save"]',
      ) as HTMLButtonElement;
      save.click();
      fixture.detectChanges();

      const req = httpMock.expectOne(ROOT);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        course_id: '',
        title: 'CSPO Sprint Planning',
      });
      req.flush(
        backendQuiz({ id: 'lq-new', title: 'CSPO Sprint Planning' }),
      );
      fixture.detectChanges();

      const status = element.querySelector(
        '[data-testid="quiz-builder-status"]',
      );
      expect(status?.textContent).toContain(
        'rplus.quizBuilder.status_saved',
      );
    });

    it('refuses to save when title is blank and surfaces an inline error', () => {
      const save = element.querySelector(
        '[data-testid="quiz-builder-save"]',
      ) as HTMLButtonElement;
      save.click();
      fixture.detectChanges();
      // No HTTP call must fire (httpMock.verify() in afterEach catches stray)
      const err = element.querySelector(
        '[data-testid="quiz-builder-error"]',
      );
      expect(err?.textContent).toContain(
        'rplus.quizBuilder.error_title_required',
      );
    });

    it('PATCHes when an id exists and a question is present', () => {
      // 1) Type title + Save (POST round-trip).
      const titleInput = element.querySelector(
        '[data-testid="quiz-builder-title-input"]',
      ) as HTMLInputElement;
      titleInput.value = 'CSPO Sprint Planning';
      titleInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const save = element.querySelector(
        '[data-testid="quiz-builder-save"]',
      ) as HTMLButtonElement;
      save.click();
      fixture.detectChanges();
      const postReq = httpMock.expectOne(ROOT);
      postReq.flush(backendQuiz({ id: 'lq-001' }));
      fixture.detectChanges();

      // 2) Add a question + Save again → PATCH.
      const add = element.querySelector(
        '[data-testid="quiz-builder-add"]',
      ) as HTMLButtonElement;
      add.click();
      fixture.detectChanges();
      save.click();
      fixture.detectChanges();

      const patchReq = httpMock.expectOne(`${ROOT}/lq-001`);
      expect(patchReq.request.method).toBe('PATCH');
      expect(typeof patchReq.request.body).toBe('object');
      const body = patchReq.request.body as Record<string, unknown>;
      expect(body['title']).toBe('CSPO Sprint Planning');
      const qs = body['questions'] as readonly unknown[];
      expect(qs).toHaveLength(1);
      patchReq.flush(
        backendQuiz({
          id: 'lq-001',
          title: 'CSPO Sprint Planning',
          questions: [
            {
              question_id: 'q-x',
              prompt: '',
              timer_seconds: 60,
              points: 10,
              options: [
                { label: '', is_correct: true },
                { label: '', is_correct: false },
                { label: '', is_correct: false },
                { label: '', is_correct: false },
              ],
            },
          ],
        }),
      );
      fixture.detectChanges();
    });

    it('immediately patches questions when the first save also has items', () => {
      // 1) Type title.
      const titleInput = element.querySelector(
        '[data-testid="quiz-builder-title-input"]',
      ) as HTMLInputElement;
      titleInput.value = 'CSPO';
      titleInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      // 2) Add a question.
      (element.querySelector(
        '[data-testid="quiz-builder-add"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      // 3) Save → POST followed by PATCH chain.
      (element.querySelector(
        '[data-testid="quiz-builder-save"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();

      const postReq = httpMock.expectOne(ROOT);
      postReq.flush(backendQuiz({ id: 'lq-001' }));
      fixture.detectChanges();

      const patchReq = httpMock.expectOne(`${ROOT}/lq-001`);
      expect(patchReq.request.method).toBe('PATCH');
      patchReq.flush(backendQuiz({ id: 'lq-001' }));
      fixture.detectChanges();
    });
  });

  describe('publish()', () => {
    it('publishes the draft once a valid + saved item exists', () => {
      // Bootstrap a saved DRAFT with one valid question via successive HTTP
      // rounds. The component keeps its LOCAL items on create (the POST
      // response's questions are NOT absorbed — create only mints id/state),
      // so we add an item locally first. With local items present the first
      // save chains POST → follow-up PATCH; the PATCH response IS absorbed
      // (draftSignal.set(updated)), so the valid question lands in the draft
      // and the Publish CTA un-gates.
      const titleInput = element.querySelector(
        '[data-testid="quiz-builder-title-input"]',
      ) as HTMLInputElement;
      titleInput.value = 'CSPO Sprint Planning';
      titleInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="quiz-builder-add"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="quiz-builder-save"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      const postReq = httpMock.expectOne(ROOT);
      postReq.flush(
        backendQuiz({
          id: 'lq-001',
          title: 'CSPO Sprint Planning',
        }),
      );
      fixture.detectChanges();
      // Local items triggered the follow-up PATCH — flush it with a valid
      // question so the absorbed draft becomes publishable.
      const patchReq = httpMock.expectOne(`${ROOT}/lq-001`);
      expect(patchReq.request.method).toBe('PATCH');
      patchReq.flush(
        backendQuiz({
          id: 'lq-001',
          title: 'CSPO Sprint Planning',
          questions: [validQuestion()],
        }),
      );
      fixture.detectChanges();

      // Publish should now be enabled.
      const cta = element.querySelector(
        '[data-testid="quiz-builder-publish"]',
      ) as HTMLButtonElement;
      expect(cta.disabled).toBe(false);
      cta.click();
      fixture.detectChanges();

      const pubReq = httpMock.expectOne(`${ROOT}/lq-001/publish`);
      expect(pubReq.request.method).toBe('POST');
      pubReq.flush(
        backendQuiz({
          id: 'lq-001',
          title: 'CSPO Sprint Planning',
          state: 'PUBLISHED',
          published_at: '2026-05-26T11:00:00Z',
          questions: [validQuestion()],
        }),
      );
      fixture.detectChanges();

      const state = element.querySelector(
        '[data-testid="quiz-builder-state"]',
      );
      expect(state?.textContent?.trim()).toBe('PUBLISHED');
      const status = element.querySelector(
        '[data-testid="quiz-builder-status"]',
      );
      expect(status?.textContent).toContain(
        'rplus.quizBuilder.status_published',
      );
    });

    it('refuses to publish until the draft is saved (no id) and surfaces inline error', () => {
      // Type title, add valid question, but DON'T save.
      const titleInput = element.querySelector(
        '[data-testid="quiz-builder-title-input"]',
      ) as HTMLInputElement;
      titleInput.value = 'CSPO';
      titleInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="quiz-builder-add"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();

      // hasUnsavedId disables the Publish CTA — so an attempt is gated at the
      // button level. Verify the disabled state.
      const cta = element.querySelector(
        '[data-testid="quiz-builder-publish"]',
      ) as HTMLButtonElement;
      expect(cta.disabled).toBe(true);
    });
  });

  describe('a11y', () => {
    it('uses aria-live polite on the valid pill', () => {
      const pill = element.querySelector(
        '[data-testid="quiz-builder-valid"]',
      );
      expect(pill?.getAttribute('aria-live')).toBe('polite');
    });

    it('uses an <ol> for the items list', () => {
      const items = element.querySelector(
        '[data-testid="quiz-builder-items"]',
      );
      expect(items?.tagName).toBe('OL');
    });
  });

  describe('ADR-168 — quiz-level time-limit + explainer-mode', () => {
    it('renders the time-limit + explainer-mode controls', () => {
      expect(
        element.querySelector(
          '[data-testid="quiz-builder-time-limit-input"]',
        ),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="quiz-builder-explainer-mode"]'),
      ).not.toBeNull();
    });

    it('clamps a positive below-minimum quiz time-limit up to the minimum', () => {
      const input = element.querySelector(
        '[data-testid="quiz-builder-time-limit-input"]',
      ) as HTMLInputElement;
      input.value = '3';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      // A positive value below MIN_QUIZ_TIME_LIMIT_SECONDS (5) clamps up to
      // the minimum; only <= 0 means unlimited (0). See setQuizTimeLimit.
      expect(fixture.componentInstance.quizTimeLimitSeconds()).toBe(5);
    });

    it('keeps a valid quiz time-limit verbatim', () => {
      const input = element.querySelector(
        '[data-testid="quiz-builder-time-limit-input"]',
      ) as HTMLInputElement;
      input.value = '600';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(fixture.componentInstance.quizTimeLimitSeconds()).toBe(600);
    });

    it('updates explainer-mode from the selector', () => {
      const select = element.querySelector(
        '[data-testid="quiz-builder-explainer-mode"]',
      ) as HTMLSelectElement;
      select.value = 'IMMEDIATE';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(fixture.componentInstance.explainerMode()).toBe('IMMEDIATE');
    });

    it('sends quiz_time_limit_seconds + explainer_mode on PATCH', () => {
      // Save (POST) to get an id.
      const titleInput = element.querySelector(
        '[data-testid="quiz-builder-title-input"]',
      ) as HTMLInputElement;
      titleInput.value = 'CSPO';
      titleInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="quiz-builder-add"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="quiz-builder-save"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      httpMock.expectOne(ROOT).flush(backendQuiz({ id: 'lq-001' }));
      fixture.detectChanges();

      const patchReq = httpMock.expectOne(`${ROOT}/lq-001`);
      const body = patchReq.request.body as Record<string, unknown>;
      expect(body['quiz_time_limit_seconds']).toBe(0);
      expect(body['explainer_mode']).toBe('END_OF_QUESTION');
      patchReq.flush(backendQuiz({ id: 'lq-001' }));
      fixture.detectChanges();
    });
  });

  describe('ADR-168 — per-option explainer input', () => {
    it('renders an explainer input alongside each option', () => {
      (element.querySelector(
        '[data-testid="quiz-builder-add"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      const explainers = element.querySelectorAll(
        'input[class="quiz-builder__option-explainer"]',
      );
      expect(explainers.length).toBe(4);
    });

    it('captures typed explainer text into the working copy', () => {
      (element.querySelector(
        '[data-testid="quiz-builder-add"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      const qid = fixture.componentInstance.items()[0]!.questionId;
      const input = element.querySelector(
        `[data-testid="quiz-builder-explainer-${qid}-A"]`,
      ) as HTMLInputElement;
      input.value = 'Because Newton.';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const optA = fixture.componentInstance
        .items()[0]!
        .options.find((o) => o.key === 'A');
      expect(optA?.explainer).toBe('Because Newton.');
    });
  });

  describe('ADR-168 — Add from Atom (reused AtomQuestionPicker)', () => {
    it('opens the composer and embeds the reused question picker', () => {
      (element.querySelector(
        '[data-testid="quiz-builder-add-from-atom"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      // The embedded picker fires its mount-time search against the BFF.
      flushPickerSearch(httpMock);
      fixture.detectChanges();
      // Composer + embedded picker are present (no manual atom-id input).
      expect(
        element.querySelector('[data-testid="quiz-builder-atom-picker"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="quiz-builder-atom-id-input"]'),
      ).toBeNull();
    });

    it('the embedded picker searches GET /api/atoms/questions/search on open', () => {
      (element.querySelector(
        '[data-testid="quiz-builder-add-from-atom"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      const req = httpMock.expectOne((r) =>
        r.url.endsWith('/api/atoms/questions/search'),
      );
      expect(req.request.method).toBe('GET');
      req.flush(pickerResponse());
      fixture.detectChanges();
    });

    it('selecting a question fetches its atom projection and composes a pre-filled MCQ item', () => {
      // 1) Open composer → picker mounts + fires search → flush a result row.
      (element.querySelector(
        '[data-testid="quiz-builder-add-from-atom"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      flushPickerSearch(httpMock);
      fixture.detectChanges();

      // 2) Quick-add the row (the picker's per-row "+" emits pickedQuestion).
      const quickAdd = element.querySelector(
        `[data-testid="aplus-question-picker-quick-add-${PICKED_ATOM_ID}"]`,
      ) as HTMLButtonElement;
      expect(quickAdd).not.toBeNull();
      quickAdd.click();
      fixture.detectChanges();

      // 3) The host resolves the full projection via GET /api/atoms/{id}.
      const projReq = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/atoms/${PICKED_ATOM_ID}`,
      );
      expect(projReq.request.method).toBe('GET');
      projReq.flush(atomProjection());
      fixture.detectChanges();

      // 4) A new item is composed with the atom_id provenance + pre-filled
      //    prompt/options sourced from the atom's mcq_payload.
      const items = fixture.componentInstance.items();
      expect(items).toHaveLength(1);
      expect(items[0]!.atomId).toBe(PICKED_ATOM_ID);
      expect(items[0]!.prompt).toBe(
        'Which statement best describes the Open-Closed Principle?',
      );
      expect(items[0]!.options.map((o) => o.text)).toEqual([
        'Open for extension',
        'Closed for everything',
        'Always rewrite',
        'Never test',
      ]);
      // Provenance badge renders for the atom-composed question.
      expect(
        element.querySelector(
          `[data-testid="quiz-builder-atom-badge-${items[0]!.questionId}"]`,
        ),
      ).not.toBeNull();
      // Composer auto-closes after composition.
      expect(fixture.componentInstance.atomComposerOpen()).toBe(false);
    });

    it('falls back to the picker stem when the projection fetch errors', () => {
      (element.querySelector(
        '[data-testid="quiz-builder-add-from-atom"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      flushPickerSearch(httpMock);
      fixture.detectChanges();

      (element.querySelector(
        `[data-testid="aplus-question-picker-quick-add-${PICKED_ATOM_ID}"]`,
      ) as HTMLButtonElement).click();
      fixture.detectChanges();

      // Projection fetch fails — host still composes a shell from the ref.
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/atoms/${PICKED_ATOM_ID}`)
        .flush('boom', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      const items = fixture.componentInstance.items();
      expect(items).toHaveLength(1);
      expect(items[0]!.atomId).toBe(PICKED_ATOM_ID);
      // Prompt falls back to the picker row's stem.
      expect(items[0]!.prompt).toBe(
        'Which statement best describes the Open-Closed Principle?',
      );
      // Four blank options for hand-authoring.
      expect(items[0]!.options).toHaveLength(4);
      expect(items[0]!.options.every((o) => o.text === '')).toBe(true);
    });

    it('cancel closes the composer without adding a question', () => {
      (element.querySelector(
        '[data-testid="quiz-builder-add-from-atom"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      flushPickerSearch(httpMock);
      fixture.detectChanges();

      (element.querySelector(
        '[data-testid="quiz-builder-atom-cancel"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.componentInstance.atomComposerOpen()).toBe(false);
      expect(fixture.componentInstance.items()).toHaveLength(0);
    });

    it('onAtomPicked with a blank id surfaces an inline error and adds nothing', () => {
      const comp = fixture.componentInstance;
      comp.onAtomPicked({
        id: '   ',
        title: 't',
        stem: 's',
        question_type: 'mcq',
      });
      fixture.detectChanges();
      expect(comp.errorMessage()).toBe(
        'rplus.quizBuilder.error_atom_id_required',
      );
      expect(comp.items()).toHaveLength(0);
      // No projection HTTP fires for a blank id (httpMock.verify in afterEach).
    });
  });

  // -----------------------------------------------------------------------
  // Added coverage: item composition, clamping, preview, error paths.
  // -----------------------------------------------------------------------

  /** Add `n` blank questions via the component API. Returns their ids. */
  function addQuestions(n: number): string[] {
    const comp = fixture.componentInstance;
    for (let i = 0; i < n; i++) comp.addQuestion();
    fixture.detectChanges();
    return comp.items().map((it) => it.questionId);
  }

  describe('item composition', () => {
    it('selectItem() moves the preview focus to the chosen index', () => {
      const comp = fixture.componentInstance;
      addQuestions(2);
      comp.setPrompt(comp.items()[1]!.questionId, 'Second prompt');
      comp.selectItem(1);
      fixture.detectChanges();
      expect(comp.selectedIndex()).toBe(1);
      const prompt = element.querySelector(
        '[data-testid="quiz-builder-preview-prompt"]',
      );
      expect(prompt?.textContent).toContain('Second prompt');
    });

    it('removeQuestion() drops the item and re-clamps the selected index', () => {
      const comp = fixture.componentInstance;
      const ids = addQuestions(2);
      comp.selectItem(1);
      fixture.detectChanges();
      comp.removeQuestion(ids[1]!);
      fixture.detectChanges();
      expect(comp.items()).toHaveLength(1);
      // selectedIndex was 1 (== new length) → clamps to length-1 = 0.
      expect(comp.selectedIndex()).toBe(0);
    });

    it('setPrompt() writes the prompt into the working copy', () => {
      const comp = fixture.componentInstance;
      const [id] = addQuestions(1);
      comp.setPrompt(id!, 'What is a Sprint?');
      fixture.detectChanges();
      expect(comp.items()[0]!.prompt).toBe('What is a Sprint?');
    });

    it('setOptionText() updates only the targeted option', () => {
      const comp = fixture.componentInstance;
      const [id] = addQuestions(1);
      comp.setOptionText(id!, 'B', 'Sprint Planning');
      fixture.detectChanges();
      const optB = comp.items()[0]!.options.find((o) => o.key === 'B');
      const optA = comp.items()[0]!.options.find((o) => o.key === 'A');
      expect(optB?.text).toBe('Sprint Planning');
      expect(optA?.text).toBe('');
    });

    it('setOptionExplainer() updates only the targeted option explainer', () => {
      const comp = fixture.componentInstance;
      const [id] = addQuestions(1);
      comp.setOptionExplainer(id!, 'C', 'Because cadence.');
      fixture.detectChanges();
      const optC = comp.items()[0]!.options.find((o) => o.key === 'C');
      expect(optC?.explainer).toBe('Because cadence.');
    });

    it('setCorrect() moves the canonical correct-answer key', () => {
      const comp = fixture.componentInstance;
      const [id] = addQuestions(1);
      comp.setCorrect(id!, 'D');
      fixture.detectChanges();
      expect(comp.items()[0]!.correctKey).toBe('D');
    });

    it('setTimer() clamps below the minimum and rounds', () => {
      const comp = fixture.componentInstance;
      const [id] = addQuestions(1);
      comp.setTimer(id!, 1.4); // < MIN_TIMER_SECONDS (5) → clamps to 5
      fixture.detectChanges();
      expect(comp.items()[0]!.timerSeconds).toBe(5);
    });

    it('setTimer() clamps above the maximum', () => {
      const comp = fixture.componentInstance;
      const [id] = addQuestions(1);
      comp.setTimer(id!, 9999); // > MAX_TIMER_SECONDS (600)
      fixture.detectChanges();
      expect(comp.items()[0]!.timerSeconds).toBe(600);
    });

    it('setTimerSoft() ignores out-of-range intermediates while typing (§4.6 quirk)', () => {
      // Typing "20" used to clamp the intermediate "2" to 5 and write it
      // back under the caret — the user ended up with "50".
      const comp = fixture.componentInstance;
      const [id] = addQuestions(1);
      comp.setTimer(id!, 20);
      comp.setTimerSoft(id!, 2); // mid-typing, below min → no commit
      fixture.detectChanges();
      expect(comp.items()[0]!.timerSeconds).toBe(20);
      comp.setTimerSoft(id!, 25); // in-range live value → commits
      fixture.detectChanges();
      expect(comp.items()[0]!.timerSeconds).toBe(25);
    });

    it('timer input commits softly on input and clamps on change', () => {
      const comp = fixture.componentInstance;
      const [id] = addQuestions(1);
      comp.setTimer(id!, 20);
      fixture.detectChanges();
      const input = (fixture.nativeElement as HTMLElement).querySelector(
        `[data-testid="quiz-builder-timer-${id}"]`,
      ) as HTMLInputElement;
      input.value = '2'; // below min — must NOT clobber the field
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(comp.items()[0]!.timerSeconds).toBe(20);
      input.dispatchEvent(new Event('change')); // blur/Enter — clamp commits
      fixture.detectChanges();
      expect(comp.items()[0]!.timerSeconds).toBe(5);
    });

    it('setScoreSoft() ignores out-of-range intermediates while typing', () => {
      const comp = fixture.componentInstance;
      const [id] = addQuestions(1);
      comp.setScore(id!, 10);
      comp.setScoreSoft(id!, 0); // "0" en route to "05"/cleared field
      fixture.detectChanges();
      expect(comp.items()[0]!.scorePoints).toBe(10);
      comp.setScoreSoft(id!, 42);
      fixture.detectChanges();
      expect(comp.items()[0]!.scorePoints).toBe(42);
    });

    it('setScore() clamps below the minimum', () => {
      const comp = fixture.componentInstance;
      const [id] = addQuestions(1);
      comp.setScore(id!, 0); // < MIN_SCORE_POINTS (1)
      fixture.detectChanges();
      expect(comp.items()[0]!.scorePoints).toBe(1);
    });

    it('setScore() clamps above the maximum and rounds', () => {
      const comp = fixture.componentInstance;
      const [id] = addQuestions(1);
      comp.setScore(id!, 250.7); // > MAX_SCORE_POINTS (100)
      fixture.detectChanges();
      expect(comp.items()[0]!.scorePoints).toBe(100);
    });

    it('typing into the prompt input writes through (stringFromEvent)', () => {
      const comp = fixture.componentInstance;
      const [id] = addQuestions(1);
      const input = element.querySelector(
        `[data-testid="quiz-builder-prompt-${id}"]`,
      ) as HTMLInputElement;
      input.value = 'Live-typed prompt';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(comp.items()[0]!.prompt).toBe('Live-typed prompt');
    });

    it('changing a correct-toggle radio updates correctKey (change handler)', () => {
      const comp = fixture.componentInstance;
      const [id] = addQuestions(1);
      const radioC = element.querySelector(
        `[data-testid="quiz-builder-correct-${id}-C"]`,
      ) as HTMLInputElement;
      radioC.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(comp.items()[0]!.correctKey).toBe('C');
    });

    it('committing a timer number input clamps + rounds (numberFromEvent)', () => {
      // §4.6: the clamp moved from (input) to (change) — eager clamping
      // rewrote intermediates under the caret (typing "20" became "50").
      const comp = fixture.componentInstance;
      const [id] = addQuestions(1);
      const input = element.querySelector(
        `[data-testid="quiz-builder-timer-${id}"]`,
      ) as HTMLInputElement;
      input.value = '2';
      input.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(comp.items()[0]!.timerSeconds).toBe(5);
    });

    it('removing via the trash button drops the item from the list', () => {
      const comp = fixture.componentInstance;
      const [id] = addQuestions(1);
      const remove = element.querySelector(
        `[data-testid="quiz-builder-remove-${id}"]`,
      ) as HTMLButtonElement;
      remove.click();
      fixture.detectChanges();
      expect(comp.items()).toHaveLength(0);
      // Empty state returns.
      expect(
        element.querySelector('[data-testid="quiz-builder-empty"]'),
      ).not.toBeNull();
    });
  });

  describe('quiz-level time-limit edge cases', () => {
    it('setQuizTimeLimit(0) means unlimited (0)', () => {
      const comp = fixture.componentInstance;
      comp.setQuizTimeLimit(0);
      fixture.detectChanges();
      expect(comp.quizTimeLimitSeconds()).toBe(0);
    });

    it('setQuizTimeLimit clamps above MAX down to the maximum', () => {
      const comp = fixture.componentInstance;
      comp.setQuizTimeLimit(99999); // > MAX_QUIZ_TIME_LIMIT_SECONDS (3600)
      fixture.detectChanges();
      expect(comp.quizTimeLimitSeconds()).toBe(3600);
    });

    it('setQuizTimeLimit coerces a non-finite value to unlimited (0)', () => {
      const comp = fixture.componentInstance;
      comp.setQuizTimeLimit(Number.NaN);
      fixture.detectChanges();
      expect(comp.quizTimeLimitSeconds()).toBe(0);
    });
  });

  describe('KPIs + preview rendering', () => {
    it('aggregates totalScore + totalSeconds across questions', () => {
      const comp = fixture.componentInstance;
      addQuestions(2); // 2 × default (10 pts, 60s)
      fixture.detectChanges();
      expect(comp.totalScore()).toBe(20);
      expect(comp.totalSeconds()).toBe(120);
      const score = element.querySelector(
        '[data-testid="quiz-builder-total-score"]',
      );
      const secs = element.querySelector(
        '[data-testid="quiz-builder-total-seconds"]',
      );
      expect(score?.textContent).toContain('20');
      expect(secs?.textContent).toContain('120');
    });

    it('highlights the correct option in the preview pane', () => {
      const comp = fixture.componentInstance;
      const [id] = addQuestions(1);
      comp.setOptionText(id!, 'A', 'Wrong');
      comp.setOptionText(id!, 'B', 'Right');
      comp.setCorrect(id!, 'B');
      fixture.detectChanges();
      const correct = element.querySelector(
        '[data-testid="quiz-builder-preview-option-B"]',
      );
      expect(correct?.className).toContain(
        'quiz-builder__preview-option--correct',
      );
    });

    it('renders a per-option explainer in the preview when mode is not NEVER', () => {
      const comp = fixture.componentInstance;
      const [id] = addQuestions(1);
      comp.setExplainerMode('IMMEDIATE');
      comp.setOptionExplainer(id!, 'A', 'Reveal me.');
      fixture.detectChanges();
      const explainer = element.querySelector(
        '[data-testid="quiz-builder-preview-explainer-A"]',
      );
      expect(explainer?.textContent).toContain('Reveal me.');
    });

    it('hides the per-option explainer in the preview when mode is NEVER', () => {
      const comp = fixture.componentInstance;
      const [id] = addQuestions(1);
      comp.setExplainerMode('NEVER');
      comp.setOptionExplainer(id!, 'A', 'Hidden.');
      fixture.detectChanges();
      const explainer = element.querySelector(
        '[data-testid="quiz-builder-preview-explainer-A"]',
      );
      expect(explainer).toBeNull();
    });

    it('shows the preview meta timer + score for the selected item', () => {
      addQuestions(1);
      fixture.detectChanges();
      const timer = element.querySelector(
        '[data-testid="quiz-builder-preview-timer"]',
      );
      const score = element.querySelector(
        '[data-testid="quiz-builder-preview-score"]',
      );
      expect(timer?.textContent).toContain('60');
      expect(score?.textContent).toContain('10');
    });

    it('renders per-item validation errors for an incomplete question', () => {
      const [id] = addQuestions(1); // blank prompt + blank options → invalid
      fixture.detectChanges();
      const errs = element.querySelector(
        `[data-testid="quiz-builder-errors-${id}"]`,
      );
      expect(errs).not.toBeNull();
      expect(errs?.textContent).toContain('Prompt is required.');
    });
  });

  describe('persistence error paths', () => {
    function saveWithTitle(title: string): void {
      const titleInput = element.querySelector(
        '[data-testid="quiz-builder-title-input"]',
      ) as HTMLInputElement;
      titleInput.value = title;
      titleInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="quiz-builder-save"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
    }

    it('maps a 409 create failure to error_conflict', () => {
      saveWithTitle('CSPO');
      httpMock
        .expectOne(ROOT)
        .flush('conflict', { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      const err = element.querySelector(
        '[data-testid="quiz-builder-error"]',
      );
      expect(err?.textContent).toContain('rplus.quizBuilder.error_conflict');
      expect(fixture.componentInstance.saving()).toBe(false);
    });

    it('maps a 403 create failure to error_forbidden', () => {
      saveWithTitle('CSPO');
      httpMock
        .expectOne(ROOT)
        .flush('nope', { status: 403, statusText: 'Forbidden' });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="quiz-builder-error"]')
          ?.textContent,
      ).toContain('rplus.quizBuilder.error_forbidden');
    });

    it('maps a 400 create failure to error_validation', () => {
      saveWithTitle('CSPO');
      httpMock
        .expectOne(ROOT)
        .flush('bad', { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="quiz-builder-error"]')
          ?.textContent,
      ).toContain('rplus.quizBuilder.error_validation');
    });

    it('maps a 500 create failure to error_generic', () => {
      saveWithTitle('CSPO');
      httpMock
        .expectOne(ROOT)
        .flush('boom', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="quiz-builder-error"]')
          ?.textContent,
      ).toContain('rplus.quizBuilder.error_generic');
    });

    it('surfaces a PATCH error and clears the saving flag', () => {
      // First save (POST) to mint an id.
      saveWithTitle('CSPO');
      httpMock.expectOne(ROOT).flush(backendQuiz({ id: 'lq-001' }));
      fixture.detectChanges();
      // Add a question and save again → PATCH, which we fail.
      (element.querySelector(
        '[data-testid="quiz-builder-add"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="quiz-builder-save"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      httpMock
        .expectOne(`${ROOT}/lq-001`)
        .flush('conflict', { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="quiz-builder-error"]')
          ?.textContent,
      ).toContain('rplus.quizBuilder.error_conflict');
      expect(fixture.componentInstance.saving()).toBe(false);
    });

    /**
     * Reach a PUBLISHED quiz. The first save with local items already present
     * chains POST → follow-up PATCH (mirrors the original publish() spec),
     * then Publish lands the PUBLISHED response.
     */
    function reachPublished(): void {
      const titleInput = element.querySelector(
        '[data-testid="quiz-builder-title-input"]',
      ) as HTMLInputElement;
      titleInput.value = 'CSPO Sprint Planning';
      titleInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="quiz-builder-add"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="quiz-builder-save"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      httpMock.expectOne(ROOT).flush(backendQuiz({ id: 'lq-001' }));
      fixture.detectChanges();
      httpMock.expectOne(`${ROOT}/lq-001`).flush(
        backendQuiz({
          id: 'lq-001',
          title: 'CSPO Sprint Planning',
          questions: [validQuestion()],
        }),
      );
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="quiz-builder-publish"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      httpMock.expectOne(`${ROOT}/lq-001/publish`).flush(
        backendQuiz({
          id: 'lq-001',
          title: 'CSPO Sprint Planning',
          state: 'PUBLISHED',
          questions: [validQuestion()],
        }),
      );
      fixture.detectChanges();
    }

    /** Reach a publishable, saved DRAFT (POST → follow-up PATCH absorbed). */
    function reachSavedPublishableDraft(): void {
      const titleInput = element.querySelector(
        '[data-testid="quiz-builder-title-input"]',
      ) as HTMLInputElement;
      titleInput.value = 'CSPO Sprint Planning';
      titleInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="quiz-builder-add"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="quiz-builder-save"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      httpMock.expectOne(ROOT).flush(backendQuiz({ id: 'lq-001' }));
      fixture.detectChanges();
      httpMock.expectOne(`${ROOT}/lq-001`).flush(
        backendQuiz({
          id: 'lq-001',
          title: 'CSPO Sprint Planning',
          questions: [validQuestion()],
        }),
      );
      fixture.detectChanges();
    }

    it('saving an already-published quiz surfaces error_published_immutable', () => {
      reachPublished();
      expect(fixture.componentInstance.isPublished()).toBe(true);
      // Call saveDraft() directly — the button is disabled, but the method
      // guard sets the immutable error.
      fixture.componentInstance.saveDraft();
      fixture.detectChanges();
      expect(fixture.componentInstance.errorMessage()).toBe(
        'rplus.quizBuilder.error_published_immutable',
      );
    });

    it('surfaces a publish error and clears the saving flag', () => {
      reachSavedPublishableDraft();
      (element.querySelector(
        '[data-testid="quiz-builder-publish"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      httpMock
        .expectOne(`${ROOT}/lq-001/publish`)
        .flush('boom', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="quiz-builder-error"]')
          ?.textContent,
      ).toContain('rplus.quizBuilder.error_generic');
      expect(fixture.componentInstance.saving()).toBe(false);
      // State stayed DRAFT (publish failed).
      expect(fixture.componentInstance.state()).toBe('DRAFT');
    });
  });

  describe('publish() guard branches (direct method calls)', () => {
    it('refuses to publish with no id and sets error_save_before_publish', () => {
      fixture.componentInstance.publish();
      fixture.detectChanges();
      expect(fixture.componentInstance.errorMessage()).toBe(
        'rplus.quizBuilder.error_save_before_publish',
      );
    });

    it('refuses to publish a saved-but-invalid draft (error_invalid_draft)', () => {
      // Save to get an id (no questions → invalid draft).
      const titleInput = element.querySelector(
        '[data-testid="quiz-builder-title-input"]',
      ) as HTMLInputElement;
      titleInput.value = 'CSPO';
      titleInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="quiz-builder-save"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      httpMock.expectOne(ROOT).flush(backendQuiz({ id: 'lq-001' }));
      fixture.detectChanges();
      // id present but no questions → isValid() false.
      fixture.componentInstance.publish();
      fixture.detectChanges();
      expect(fixture.componentInstance.errorMessage()).toBe(
        'rplus.quizBuilder.error_invalid_draft',
      );
    });
  });

  describe('published immutability guards', () => {
    /** Drive the component into the PUBLISHED state. */
    function publishHappyPath(): void {
      const titleInput = element.querySelector(
        '[data-testid="quiz-builder-title-input"]',
      ) as HTMLInputElement;
      titleInput.value = 'CSPO Sprint Planning';
      titleInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="quiz-builder-add"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="quiz-builder-save"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      httpMock.expectOne(ROOT).flush(backendQuiz({ id: 'lq-001' }));
      fixture.detectChanges();
      httpMock.expectOne(`${ROOT}/lq-001`).flush(
        backendQuiz({
          id: 'lq-001',
          title: 'CSPO Sprint Planning',
          questions: [validQuestion()],
        }),
      );
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="quiz-builder-publish"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      httpMock.expectOne(`${ROOT}/lq-001/publish`).flush(
        backendQuiz({
          id: 'lq-001',
          title: 'CSPO Sprint Planning',
          state: 'PUBLISHED',
          questions: [validQuestion()],
        }),
      );
      fixture.detectChanges();
    }

    it('addQuestion() is a no-op once published', () => {
      publishHappyPath();
      const before = fixture.componentInstance.items().length;
      fixture.componentInstance.addQuestion();
      fixture.detectChanges();
      expect(fixture.componentInstance.items().length).toBe(before);
    });

    it('mutateItem-based setters are no-ops once published', () => {
      publishHappyPath();
      const qid = fixture.componentInstance.items()[0]!.questionId;
      const before = fixture.componentInstance.items()[0]!.prompt;
      fixture.componentInstance.setPrompt(qid, 'MUTATED');
      fixture.detectChanges();
      expect(fixture.componentInstance.items()[0]!.prompt).toBe(before);
    });

    it('openAtomComposer() / setQuizTimeLimit() / setExplainerMode() are no-ops once published', () => {
      publishHappyPath();
      const limitBefore =
        fixture.componentInstance.quizTimeLimitSeconds();
      const modeBefore = fixture.componentInstance.explainerMode();
      fixture.componentInstance.openAtomComposer();
      fixture.componentInstance.setQuizTimeLimit(120);
      fixture.componentInstance.setExplainerMode('IMMEDIATE');
      fixture.detectChanges();
      expect(fixture.componentInstance.atomComposerOpen()).toBe(false);
      expect(fixture.componentInstance.quizTimeLimitSeconds()).toBe(
        limitBefore,
      );
      expect(fixture.componentInstance.explainerMode()).toBe(modeBefore);
    });

    it('onAtomPicked() is a no-op once published', () => {
      publishHappyPath();
      const before = fixture.componentInstance.items().length;
      fixture.componentInstance.onAtomPicked({
        id: PICKED_ATOM_ID,
        title: 't',
        stem: 's',
        question_type: 'mcq',
      });
      fixture.detectChanges();
      // No projection HTTP fires (guard returns before the picker call).
      expect(fixture.componentInstance.items().length).toBe(before);
    });
  });

  describe('event readers', () => {
    it('numberFromEvent() reads the parsed input value', () => {
      const input = document.createElement('input');
      input.value = '42';
      const evt = { target: input } as unknown as Event;
      expect(fixture.componentInstance.numberFromEvent(evt)).toBe(42);
    });

    it('stringFromEvent() reads the raw input value', () => {
      const input = document.createElement('input');
      input.value = 'hello';
      const evt = { target: input } as unknown as Event;
      expect(fixture.componentInstance.stringFromEvent(evt)).toBe('hello');
    });

    it('errorsFor() returns the per-item validation errors', () => {
      addQuestions(1);
      const item = fixture.componentInstance.items()[0]!;
      const errs = fixture.componentInstance.errorsFor(item);
      expect(errs.length).toBeGreaterThan(0);
    });

    it('numberFromEvent() falls back to 0 when the target value is absent (?? arm)', () => {
      // event.target is null → optional-chain skipped → ?? 0 fallback.
      const evt = { target: null } as unknown as Event;
      expect(fixture.componentInstance.numberFromEvent(evt)).toBe(0);
    });

    it('stringFromEvent() falls back to "" when the target is null (?? arm)', () => {
      const evt = { target: null } as unknown as Event;
      expect(fixture.componentInstance.stringFromEvent(evt)).toBe('');
    });
  });

  // -----------------------------------------------------------------------
  // Branch-targeted augmentation — the remaining UNCOVERED conditional arms.
  // -----------------------------------------------------------------------
  describe('uncovered conditional arms', () => {
    /** Add `n` blank questions via the component API. Returns their ids. */
    function addLocal(n: number): string[] {
      const comp = fixture.componentInstance;
      for (let i = 0; i < n; i++) comp.addQuestion();
      fixture.detectChanges();
      return comp.items().map((it) => it.questionId);
    }

    it('valueChanges keeps prior title/courseId when the control values go non-string (ngOnInit ternary falsy arms)', () => {
      const comp = fixture.componentInstance;
      // Seed a known title/courseId via the normal string path first.
      comp['metaForm'].setValue({ title: 'Seeded', courseId: 'course-9' });
      fixture.detectChanges();
      expect(comp.draft().title).toBe('Seeded');
      expect(comp.draft().courseId).toBe('course-9');

      // Setting the controls to null keeps them mounted (template still binds
      // their `.touched` flag) but makes valueChanges emit `null` for each →
      // `typeof value.title === 'string'` is FALSE → the ternary falsy arm
      // preserves the prior draft values (L188/L190 arm1).
      comp['metaForm'].setValue({ title: null, courseId: null });
      fixture.detectChanges();
      expect(comp.draft().title).toBe('Seeded');
      expect(comp.draft().courseId).toBe('course-9');
    });

    it('saveDraft preserves draft title/courseId when the form values are non-string (saveDraft ternary falsy arms)', () => {
      const comp = fixture.componentInstance;
      // Put a non-blank title directly into the draft signal (so the blank
      // guard passes) while the form controls hold non-string values.
      comp['draftSignal'].set({
        ...comp.draft(),
        title: 'Draft-side Title',
        courseId: 'draft-course',
      });
      // Set the form controls to null (kept mounted) → both saveDraft ternaries
      // take the `: this.draftSignal().title/courseId` arm (L414/L418 arm1).
      // valueChanges fires first but its falsy arm also preserves the draft.
      comp['metaForm'].setValue({ title: null, courseId: null });
      fixture.detectChanges();

      comp.saveDraft();
      fixture.detectChanges();

      const req = httpMock.expectOne(ROOT);
      expect(req.request.method).toBe('POST');
      // toCreatePayload(current) trims the draft-side title (form was non-string).
      expect(req.request.body).toEqual({
        course_id: 'draft-course',
        title: 'Draft-side Title',
      });
      req.flush(backendQuiz({ id: 'lq-arm', title: 'Draft-side Title' }));
      fixture.detectChanges();
      expect(comp.statusMessage()).toContain('rplus.quizBuilder.status_saved');
    });

    it('removeQuestion() is a no-op once published (isPublished true arm)', () => {
      const comp = fixture.componentInstance;
      const [id] = addLocal(1);
      // Force the working copy into a non-DRAFT state so isPublished() is true.
      comp['draftSignal'].set({ ...comp.draft(), state: 'PUBLISHED' });
      fixture.detectChanges();
      const before = comp.items().length;
      comp.removeQuestion(id!);
      fixture.detectChanges();
      expect(comp.items().length).toBe(before);
    });

    it('removeQuestion() leaves the selected index alone when it is still in range (if-false arm)', () => {
      const comp = fixture.componentInstance;
      const ids = addLocal(3);
      comp.selectItem(0);
      fixture.detectChanges();
      // Remove the LAST item: selectedIndex (0) is still < new length (2),
      // so the re-clamp `if (selectedIndex >= next.length)` is FALSE (L217 arm1).
      comp.removeQuestion(ids[2]!);
      fixture.detectChanges();
      expect(comp.items()).toHaveLength(2);
      expect(comp.selectedIndex()).toBe(0);
    });

    it('composeFromAtom falls through prompt + option-text nullish chains (?? arms) to title then blank', () => {
      const comp = fixture.componentInstance;
      // Open the composer so the picker mounts + fires its search.
      comp.openAtomComposer();
      fixture.detectChanges();
      flushPickerSearch(httpMock);
      fixture.detectChanges();

      // Drive onAtomPicked with a runtime ref whose `stem` is undefined →
      // prompt chain `mcq?.prompt ?? ref.stem ?? ref.title ?? ''` falls past
      // the nullish prompt + nullish stem to `ref.title` (L354 arm2/3).
      comp.onAtomPicked({
        id: PICKED_ATOM_ID,
        title: 'Fallback Title',
        // stem deliberately undefined at runtime to exercise the nullish chain.
        stem: undefined as unknown as string,
        question_type: 'mcq',
      });
      fixture.detectChanges();

      // Flush a projection with a NULL prompt and options that exercise both
      // the `o.text ?? o.label ?? ''` arms: one with only a label, one with
      // neither text nor label.
      const projReq = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/atoms/${PICKED_ATOM_ID}`,
      );
      projReq.flush({
        atom: {
          atom_id: PICKED_ATOM_ID,
          atom_type: 'mcq',
          title: 'SOLID',
          mcq_payload: {
            question_id: 'q-embedded',
            // prompt omitted → mcq?.prompt is undefined (nullish).
            options: [
              // text omitted → falls to label (L357 arm1).
              { option_id: 'o1', label: 'Label-only' },
              // both omitted at runtime → falls to '' (L357 arm2).
              {
                option_id: 'o2',
                label: undefined as unknown as string,
              },
            ],
          },
        },
      } as unknown as AtomProjectionResponse);
      fixture.detectChanges();

      const items = comp.items();
      expect(items).toHaveLength(1);
      // prompt fell through to ref.title.
      expect(items[0]!.prompt).toBe('Fallback Title');
      // First two options resolved label / '' ; itemFromAtom pads to 4.
      expect(items[0]!.options[0]!.text).toBe('Label-only');
      expect(items[0]!.options[1]!.text).toBe('');
    });

    it('composeFromAtom falls all the way to "" when ref has no stem and no title', () => {
      const comp = fixture.componentInstance;
      comp.openAtomComposer();
      fixture.detectChanges();
      flushPickerSearch(httpMock);
      fixture.detectChanges();

      // Both stem AND title undefined → prompt chain ends at '' (L354 arm3).
      comp.onAtomPicked({
        id: PICKED_ATOM_ID,
        title: undefined as unknown as string,
        stem: undefined as unknown as string,
        question_type: 'mcq',
      });
      fixture.detectChanges();

      // Projection error → composeFromAtom called with null atom → mcq null →
      // prompt = '' and four blank options.
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/atoms/${PICKED_ATOM_ID}`)
        .flush('boom', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      const items = comp.items();
      expect(items).toHaveLength(1);
      expect(items[0]!.prompt).toBe('');
      expect(items[0]!.options).toHaveLength(4);
      expect(items[0]!.options.every((o) => o.text === '')).toBe(true);
    });

    it('errKey maps a non-object (string) error to error_generic (&& short-circuit arm)', () => {
      const comp = fixture.componentInstance;
      // Save to mint an id, then fail the PATCH with a NON-object error so the
      // errKey guard `err && typeof err === 'object' && 'status' in err` takes
      // the false short-circuit arm (status stays 0 → error_generic, L515 arm1).
      comp['draftSignal'].set({
        ...comp.draft(),
        id: 'lq-strerr',
        title: 'Has Id',
      });
      // Drive runPatch directly via the private method to feed a raw string err.
      comp['service'].update = () =>
        ({
          pipe: () => ({
            subscribe: (handlers: { error: (e: unknown) => void }) => {
              handlers.error('plain-string-error');
            },
          }),
        }) as never;
      comp['runPatch'](comp.draft());
      fixture.detectChanges();
      expect(comp.errorMessage()).toBe('rplus.quizBuilder.error_generic');
      expect(comp.saving()).toBe(false);
    });
  });

  describe('launchSession() (L5)', () => {
    const armedWire = {
      id: 'sess-NEW',
      tenant_id: 'tenant-001',
      live_quiz_id: 'lq-pub',
      instructor_gcid: 'gcid-mr-chen',
      state: 'ARMED',
      current_question_id: '',
      response_counts: {},
      joined_learners: 0,
      created_at: '2026-05-26T10:00:00Z',
      updated_at: '2026-05-26T10:00:00Z',
    };

    it('starts an ARMED session + navigates to the presenter when published', () => {
      const comp = fixture.componentInstance;
      comp['draftSignal'].set({ ...comp.draft(), id: 'lq-pub', state: 'PUBLISHED' });
      const navSpy = vi
        .spyOn(TestBed.inject(Router), 'navigate')
        .mockResolvedValue(true);

      comp.launchSession();

      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/live-quizzes/lq-pub/sessions`,
      );
      expect(req.request.method).toBe('POST');
      req.flush(armedWire);

      expect(navSpy).toHaveBeenCalledWith(['/r/classroom'], {
        queryParams: { session_id: 'sess-NEW' },
      });
      expect(comp.launching()).toBe(false);
    });

    it('refuses to launch an unpublished draft (no BFF call)', () => {
      const comp = fixture.componentInstance;
      comp['draftSignal'].set({ ...comp.draft(), id: '', state: 'DRAFT' });

      comp.launchSession();

      httpMock.expectNone((r) => r.url.includes('/sessions'));
      expect(comp.errorMessage()).toBe(
        'rplus.quizBuilder.error_publish_before_launch',
      );
    });

    it('maps a 409 to the conflict error key + clears launching', () => {
      const comp = fixture.componentInstance;
      comp['draftSignal'].set({ ...comp.draft(), id: 'lq-pub', state: 'PUBLISHED' });
      vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      comp.launchSession();

      httpMock
        .expectOne(
          `${environment.bffBaseUrl}/api/v1/live-quizzes/lq-pub/sessions`,
        )
        .flush({ message: 'already live' }, {
          status: 409,
          statusText: 'Conflict',
        });

      expect(comp.errorMessage()).toBe('rplus.quizBuilder.error_conflict');
      expect(comp.launching()).toBe(false);
    });
  });
});
