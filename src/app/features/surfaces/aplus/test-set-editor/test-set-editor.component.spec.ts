/**
 * TestSetEditorComponent spec — X.2 (ADR-155).
 *
 * Three internal modes (route-derived):
 *   list   — `/a/test-sets`                  (no :testSetId param)
 *   new    — `/a/test-sets/new`              (creates draft + redirects)
 *   edit   — `/a/test-sets/:testSetId/edit`  (loads + edits a single set)
 *
 * Per chora-web CLAUDE.md §6: Vitest 4 + provideHttpClientTesting +
 * httpMock.verify() in afterEach.
 * Per `feedback_no_stubs_real_wiring`: real BFF wire shapes flushed
 * through HttpTestingController.
 *
 * **NEVER `fakeAsync`** per the canonical chora-web testing memo (Vitest
 * + Angular ProxyZone is incompatible). Router navigation asserted via
 * `vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true)` per
 * daily-dose.component.spec.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';

import { TestSetEditorComponent } from './test-set-editor.component';
import { TranslateService } from '../../../../core/services/translate.service';
import {
  DEFAULT_GRADING_CONFIG,
  type QuestionSnapshot,
  type TestSet,
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
    description: '',
    learner_facing_name: null,
    tags: ['mid-term'],
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

function buildTestSetWithQuestions(overrides: Partial<TestSetWithQuestions> = {}): TestSetWithQuestions {
  return {
    ...buildTestSet({ total_points: 10, question_count: 1 }),
    questions: [buildTestSetQuestion()],
    ...overrides,
  };
}

interface SetupOptions {
  readonly testSetId?: string;
  readonly newRoute?: boolean;
  /** `?from_bank=` query param — seeds a fresh draft from a question bank (CHO-1980). */
  readonly fromBank?: string;
}

function setup(opts: SetupOptions = {}): {
  fixture: ComponentFixture<TestSetEditorComponent>;
  httpMock: HttpTestingController;
} {
  const route = {
    snapshot: {
      paramMap: {
        get: (key: string) => (key === 'testSetId' ? opts.testSetId ?? null : null),
      },
      queryParamMap: {
        get: (key: string) => (key === 'from_bank' ? opts.fromBank ?? null : null),
      },
      data: opts.newRoute ? { mode: 'new' } : {},
      url: opts.newRoute
        ? [{ path: 'test-sets' }, { path: 'new' }]
        : opts.testSetId
          ? [{ path: 'test-sets' }, { path: opts.testSetId }, { path: 'edit' }]
          : [{ path: 'test-sets' }],
    },
    paramMap: of({
      get: (key: string) => (key === 'testSetId' ? opts.testSetId ?? null : null),
    }),
  };

  TestBed.configureTestingModule({
    imports: [TestSetEditorComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([
        { path: 'a/test-sets', children: [] },
        { path: 'a/test-sets/:testSetId/edit', children: [] },
      ]),
      TranslateService,
      { provide: ActivatedRoute, useValue: route },
    ],
  });

  const fixture = TestBed.createComponent(TestSetEditorComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, httpMock };
}

describe('TestSetEditorComponent', () => {
  let fixture: ComponentFixture<TestSetEditorComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  afterEach(() => {
    // Drain fire-and-forget AUTHOR question-image projections (CHO-1638) —
    // `/api/atoms/{atomId}/questions/{qid}` GETs the per-MCQ-row image
    // hydration effect fires. They are fail-soft UI enhancements, not the
    // behaviour under test, so the per-test flush lists don't enumerate
    // them; drain any leftovers before verifying the focused requests.
    httpMock
      ?.match(
        (r) =>
          r.method === 'GET' &&
          /\/api\/atoms\/[^/]+\/questions\/[^/]+$/.test(r.url),
      )
      .forEach((req) => req.flush({}));
    httpMock?.verify();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // LIST mode — /a/test-sets
  // ═══════════════════════════════════════════════════════════════════════
  describe('list mode', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const r = setup();
      fixture = r.fixture;
      httpMock = r.httpMock;
      element = fixture.nativeElement as HTMLElement;
    });

    it('renders the list root', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/test-sets'))
        .flush({ items: [], next_page_token: null });
      fixture.detectChanges();
      const root = element.querySelector('[data-testid="aplus-test-set-list"]');
      expect(root).not.toBeNull();
    });

    it('fires GET /api/v1/test-sets on mount', () => {
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/v1/test-sets'));
      expect(req.request.method).toBe('GET');
      req.flush({ items: [buildTestSet()], next_page_token: null });
    });

    it('renders a card per test-set on success', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/test-sets'))
        .flush({
          items: [
            buildTestSet({ test_set_id: 'ts-1', title: 'Quiz One' }),
            buildTestSet({ test_set_id: 'ts-2', title: 'Quiz Two' }),
          ],
          next_page_token: null,
        });
      fixture.detectChanges();
      const cards = element.querySelectorAll(
        '[data-testid^="aplus-test-set-card-"]',
      );
      expect(cards.length).toBe(2);
    });

    it('renders empty state when no test-sets', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/test-sets'))
        .flush({ items: [], next_page_token: null });
      fixture.detectChanges();
      const empty = element.querySelector('[data-testid="aplus-test-set-empty"]');
      expect(empty).not.toBeNull();
    });

    it('renders error banner + retry on 5xx', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/test-sets'))
        .flush(null, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="aplus-test-set-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
    });

    it('list-mode 404 renders the list-scope error, NOT the detail not-found message', () => {
      // Regression for the 2026-05-16 smoke finding: 404 on the LIST
      // endpoint (e.g., gateway hasn't claimed the path yet) previously
      // mapped through the same `error_not_found` key as a detail-mode
      // 404, surfacing "This test set doesn't exist or has been
      // removed." on the index page. List-mode 404 → list-scope error.
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/test-sets'))
        .flush(null, { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="aplus-test-set-error"]');
      expect(err).not.toBeNull();
      expect(err?.textContent ?? '').not.toContain("doesn't exist");
      expect(err?.textContent ?? '').not.toContain('removed');
    });

    it('"New test set" CTA triggers createTestSet + navigates to /a/test-sets/{id}/edit', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/test-sets'))
        .flush({ items: [], next_page_token: null });
      fixture.detectChanges();

      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

      const cta = element.querySelector(
        '[data-testid="aplus-test-set-new-cta"]',
      ) as HTMLButtonElement;
      expect(cta).not.toBeNull();
      cta.click();

      const create = httpMock.expectOne((r) =>
        r.url.endsWith('/api/v1/test-sets') && r.method === 'POST',
      );
      expect(create.request.method).toBe('POST');
      create.flush(buildTestSet({ test_set_id: 'ts-new' }));

      expect(navSpy).toHaveBeenCalledWith('/a/studio/test-sets/ts-new/edit');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // NEW mode — /a/test-sets/new
  // ═══════════════════════════════════════════════════════════════════════
  describe('new mode', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const r = setup({ newRoute: true });
      fixture = r.fixture;
      httpMock = r.httpMock;
      element = fixture.nativeElement as HTMLElement;
    });

    it('POSTs /api/v1/test-sets immediately + navigates to /edit URL on response', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

      const req = httpMock.expectOne((r) =>
        r.url.endsWith('/api/v1/test-sets') && r.method === 'POST',
      );
      req.flush(buildTestSet({ test_set_id: 'ts-fresh' }));

      expect(navSpy).toHaveBeenCalledWith('/a/studio/test-sets/ts-fresh/edit');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // NEW mode seeded from a question bank — /a/studio/test-sets/new?from_bank=
  // (CHO-1980: re-surface the orphaned builder, seeded from a bank's questions)
  // ═══════════════════════════════════════════════════════════════════════
  describe('new mode — seed from a question bank (CHO-1980)', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const r = setup({ newRoute: true, fromBank: 'qb-77' });
      fixture = r.fixture;
      httpMock = r.httpMock;
      element = fixture.nativeElement as HTMLElement;
    });

    it('mints a draft, seeds it from every bank question, then navigates to edit', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

      // 1. mint the DRAFT.
      const create = httpMock.expectOne(
        (r) => r.url.endsWith('/api/v1/test-sets') && r.method === 'POST',
      );
      create.flush(buildTestSet({ test_set_id: 'ts-seeded' }));

      // 2. fetch the bank's questions (the GET carries page/page_size params —
      //    match by PATH only). The bank list is enriched with atom_id +
      //    question_id, so NO per-atom projection hop is needed to seed.
      const bankReq = httpMock.expectOne(
        (r) =>
          r.url.endsWith('/api/v1/question-banks/qb-77/questions') &&
          r.method === 'GET',
      );
      bankReq.flush({
        items: [
          { question_id: 'q1', atom_id: 'atom1', question_type: 'mcq' },
          { question_id: 'q2', atom_id: 'atom2', question_type: 'oe' },
        ],
        total: 2,
        page: 1,
        page_size: 100,
      });

      // 3. one add per bank question, addressing the DISTINCT atom + question ids.
      const adds = httpMock.match(
        (r) =>
          r.url.endsWith('/api/v1/test-sets/ts-seeded/questions') &&
          r.method === 'POST',
      );
      expect(adds.length).toBe(2);
      expect(adds[0].request.body).toMatchObject({
        question_atom_id: 'atom1',
        question_id: 'q1',
        question_type: 'mcq',
      });
      expect(adds[1].request.body).toMatchObject({
        question_atom_id: 'atom2',
        question_id: 'q2',
        question_type: 'oe',
      });
      adds.forEach((a) => a.flush({}));

      // 4. land on the seeded edit view.
      expect(navSpy).toHaveBeenCalledWith('/a/studio/test-sets/ts-seeded/edit');
    });

    it('still navigates to edit when the bank seed has no usable questions', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/test-sets') && r.method === 'POST')
        .flush(buildTestSet({ test_set_id: 'ts-empty' }));
      httpMock
        .expectOne(
          (r) =>
            r.url.endsWith('/api/v1/question-banks/qb-77/questions') &&
            r.method === 'GET',
        )
        .flush({ items: [], total: 0, page: 1, page_size: 100 });

      // No adds fired; the (empty) draft is still opened so the author isn't stuck.
      httpMock.verify();
      expect(navSpy).toHaveBeenCalledWith('/a/studio/test-sets/ts-empty/edit');
    });

    it('opens the (partially-seeded) draft even when a seed add fails', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/test-sets') && r.method === 'POST')
        .flush(buildTestSet({ test_set_id: 'ts-x' }));
      httpMock
        .expectOne(
          (r) =>
            r.url.endsWith('/api/v1/question-banks/qb-77/questions') &&
            r.method === 'GET',
        )
        .flush({
          items: [{ question_id: 'q1', atom_id: 'atom1', question_type: 'mcq' }],
          total: 1,
          page: 1,
          page_size: 100,
        });
      const adds = httpMock.match(
        (r) =>
          r.url.endsWith('/api/v1/test-sets/ts-x/questions') && r.method === 'POST',
      );
      expect(adds.length).toBe(1);
      adds[0].flush('boom', { status: 500, statusText: 'Server Error' });

      // The DRAFT is real — the author lands on it rather than being stranded.
      expect(navSpy).toHaveBeenCalledWith('/a/studio/test-sets/ts-x/edit');
    });

    it('pages through ALL bank questions (no silent truncation) before seeding', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/test-sets') && r.method === 'POST')
        .flush(buildTestSet({ test_set_id: 'ts-big' }));
      // page 1 — total (150) exceeds the page size (100), so a 2nd page is fetched.
      httpMock
        .expectOne(
          (r) =>
            r.url.endsWith('/api/v1/question-banks/qb-77/questions') &&
            r.method === 'GET',
        )
        .flush({
          items: [{ question_id: 'q1', atom_id: 'atom1', question_type: 'mcq' }],
          total: 150,
          page: 1,
          page_size: 100,
        });
      // page 2 — 2×100 ≥ 150, so paging stops here.
      httpMock
        .expectOne(
          (r) =>
            r.url.endsWith('/api/v1/question-banks/qb-77/questions') &&
            r.method === 'GET',
        )
        .flush({
          items: [{ question_id: 'q2', atom_id: 'atom2', question_type: 'oe' }],
          total: 150,
          page: 2,
          page_size: 100,
        });

      const adds = httpMock.match(
        (r) =>
          r.url.endsWith('/api/v1/test-sets/ts-big/questions') && r.method === 'POST',
      );
      expect(adds.length).toBe(2); // BOTH pages' questions seeded.
      adds.forEach((a) => a.flush({}));
      expect(navSpy).toHaveBeenCalledWith('/a/studio/test-sets/ts-big/edit');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // EDIT mode — /a/test-sets/:testSetId/edit
  // ═══════════════════════════════════════════════════════════════════════
  describe('edit mode', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const r = setup({ testSetId: TEST_SET_ID });
      fixture = r.fixture;
      httpMock = r.httpMock;
      element = fixture.nativeElement as HTMLElement;
    });

    it('GETs /api/v1/test-sets/{id} on mount', () => {
      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`),
      );
      expect(req.request.method).toBe('GET');
      req.flush(buildTestSetWithQuestions());
      fixture.detectChanges();
      // DRAFT state mounts the embedded picker — drain its initial fetch.
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush({ items: [], next_page_token: null });
    });

    it('renders the editor shell with the test-set title', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions({ title: 'Agile Mid-Term' }));
      fixture.detectChanges();

      const editor = element.querySelector(
        '[data-testid="aplus-test-set-editor"]',
      );
      expect(editor).not.toBeNull();
      // Per 1e776b6c (FE-BUG-5): DRAFT state renders the title as an
      // editable <input data-testid="aplus-test-set-title-input">
      // bound via [ngModel]="titleDraft()". PUBLISHED / ARCHIVED falls
      // back to the read-only h1 testid `aplus-test-set-title`.
      // `buildTestSetWithQuestions` defaults to DRAFT, so the input
      // renders and titleDraft is seeded from the loaded testSet.title.
      // Assert on the signal value (the intent) — ngModel writes to
      // DOM only after Angular's CD propagates the FormControl write.
      const titleInput = element.querySelector(
        '[data-testid="aplus-test-set-title-input"]',
      ) as HTMLInputElement | null;
      expect(titleInput).not.toBeNull();
      expect(fixture.componentInstance.titleDraft()).toBe('Agile Mid-Term');
      // DRAFT state mounts the embedded picker which fires an initial search.
      // Drain it so httpMock.verify() passes clean.
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush({ items: [], next_page_token: null });
    });

    it('renders one question card per included question', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions({
          questions: [
            buildTestSetQuestion({
              test_set_question_id: 'tsq-1',
              points: 10,
            }),
            buildTestSetQuestion({
              test_set_question_id: 'tsq-2',
              points: 20,
              snapshot: {
                question_id: 'q-2',
                atom_id: '01985e7f-1234-7abc-8def-000000000a02',
                atom_title: 'SOLID — Liskov Substitution',
                question_type: 'oe',
                prompt_preview: 'Second question preview...',
                revision_number: 1,
              },
            }),
          ],
        }));
      fixture.detectChanges();

      const cards = element.querySelectorAll(
        '[data-testid^="aplus-tsq-card-"]',
      );
      expect(cards.length).toBe(2);
      // DRAFT state mounts the embedded picker — drain its initial fetch.
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush({ items: [], next_page_token: null });
    });

    it('seeds the inline editor with the full answer key (correct option + grounding) per question', () => {
      // PUBLISHED → read-only, no embedded picker to drain.
      const atomId = '01985e7f-1234-7abc-8def-000000000a01';
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(
          buildTestSetWithQuestions({
            state: 'PUBLISHED',
            questions: [buildTestSetQuestion({ test_set_question_id: 'tsq-1' })],
          }),
        );
      fixture.detectChanges();

      // The per-row answer-key hydration fires GET the AUTHOR question
      // projection; flush a real MCQ payload with is_correct + explainer.
      httpMock
        .expectOne((r) =>
          new RegExp(`/api/atoms/${atomId}/questions/[^/]+$`).test(r.url),
        )
        .flush({
          question: {
            type: 'mcq',
            mcq: {
              options: [
                {
                  option_id: 'opt_1',
                  label: 'The correct one',
                  is_correct: true,
                  explainer: 'Grounding for the right answer.',
                },
                {
                  option_id: 'opt_2',
                  label: 'A distractor',
                  is_correct: false,
                  explainer: 'Why this is wrong.',
                },
              ],
            },
          },
        });
      fixture.detectChanges();

      // PUBLISHED test-sets still render the INLINE EDITOR — editing a
      // question's content mints a new AtomRevision, independent of the
      // test-set's publish state (#6, 2026-06-20).
      const editor = element.querySelector(
        '[data-testid="aplus-tsq-tsq-1-editor"]',
      );
      expect(editor).not.toBeNull();
      // The editable model is seeded from the AUTHOR projection: correct option
      // flagged + its grounding preserved.
      const edit = fixture.componentInstance.editableFor('tsq-1');
      const opt1 = edit?.options.find((o) => o.option_id === 'opt_1');
      expect(opt1?.is_correct).toBe(true);
      expect(opt1?.explainer).toBe('Grounding for the right answer.');
      // The correct option's radio (index 0) is checked in the rendered editor.
      const correctRadio = element.querySelector(
        '[data-testid="aplus-tsq-tsq-1-correct-0"]',
      ) as HTMLInputElement | null;
      expect(correctRadio?.checked).toBe(true);
    });

    it('renders the generated question + answer images in the inline editor row', () => {
      const atomId = '01985e7f-1234-7abc-8def-000000000a01';
      const stemImg = 'https://example.test/stem.png?sig=abc';
      const answerImg = 'https://example.test/answer.png?sig=def';
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(
          buildTestSetWithQuestions({
            state: 'PUBLISHED',
            questions: [buildTestSetQuestion({ test_set_question_id: 'tsq-1' })],
          }),
        );
      fixture.detectChanges();

      // The AUTHOR projection carries the generated illustrations (CHO-1638).
      httpMock
        .expectOne((r) =>
          new RegExp(`/api/atoms/${atomId}/questions/[^/]+$`).test(r.url),
        )
        .flush({
          question: {
            type: 'mcq',
            mcq: {
              image_url: stemImg,
              answer_image_url: answerImg,
              options: [
                { option_id: 'opt_1', label: 'A', is_correct: true, explainer: 'x' },
                { option_id: 'opt_2', label: 'B', is_correct: false, explainer: 'y' },
              ],
            },
          },
        });
      fixture.detectChanges();

      // The row is in the inline-editor branch, but the generated stem image is
      // projected into the editor's stemMedia slot, and the model-answer image
      // renders below — so an author still SEES the generated illustrations.
      const stem = element.querySelector(
        '[data-testid="aplus-tsq-tsq-1-img"]',
      ) as HTMLImageElement | null;
      expect(stem).not.toBeNull();
      expect(stem?.getAttribute('src')).toBe(stemImg);

      const answer = element.querySelector(
        '[data-testid="aplus-tsq-tsq-1-answer-image-img"]',
      ) as HTMLImageElement | null;
      expect(answer).not.toBeNull();
      expect(answer?.getAttribute('src')).toBe(answerImg);
    });

    it('saves an edited question via PATCH /atoms/{id}/questions/{qid} then re-fetches', () => {
      const atomId = '01985e7f-1234-7abc-8def-000000000a01';
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(
          buildTestSetWithQuestions({
            state: 'PUBLISHED',
            questions: [buildTestSetQuestion({ test_set_question_id: 'tsq-1' })],
          }),
        );
      fixture.detectChanges();

      const mcqDetail = {
        question: {
          type: 'mcq',
          mcq: {
            options: [
              { option_id: 'opt_1', label: 'A', is_correct: true, explainer: 'x' },
              { option_id: 'opt_2', label: 'B', is_correct: false, explainer: 'y' },
            ],
          },
        },
      };
      httpMock
        .expectOne((r) =>
          new RegExp(`/api/atoms/${atomId}/questions/[^/]+$`).test(r.url),
        )
        .flush(mcqDetail);
      fixture.detectChanges();

      const inst = fixture.componentInstance;
      const seeded = inst.editableFor('tsq-1');
      expect(seeded).not.toBeNull();
      // Edit the prompt → dirty + valid ⇒ Save enabled.
      inst.onQuestionEdited('tsq-1', { ...seeded!, prompt: 'Edited prompt' });
      expect(inst.canSaveQuestion('tsq-1')).toBe(true);

      inst.saveQuestion(buildTestSetQuestion({ test_set_question_id: 'tsq-1' }));

      const patch = httpMock.expectOne(
        (r) =>
          r.method === 'PATCH' &&
          new RegExp(`/api/atoms/${atomId}/questions/[^/]+$`).test(r.url),
      );
      expect((patch.request.body as { prompt: string }).prompt).toBe('Edited prompt');
      expect(
        (patch.request.body as { mcq_payload: { options: unknown[] } }).mcq_payload
          .options.length,
      ).toBe(2);
      patch.flush({});

      // Success re-fetches the detail (resets the dirty baseline).
      httpMock
        .expectOne(
          (r) =>
            r.method === 'GET' &&
            new RegExp(`/api/atoms/${atomId}/questions/[^/]+$`).test(r.url),
        )
        .flush(mcqDetail);
      fixture.detectChanges();

      expect(inst.questionSaveState('tsq-1')).toBe('saved');
      expect(inst.isQuestionDirty('tsq-1')).toBe(false);
    });

    it('embedded picker emits picked event → POSTs /questions with points=10 default', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions({ questions: [] }));
      fixture.detectChanges();
      // The mount of the picker triggers an initial /api/atoms/questions/search.
      const pickerInitial = httpMock.expectOne((r) =>
        r.url.endsWith('/api/atoms/questions/search'),
      );
      pickerInitial.flush({ items: [], next_page_token: null });
      fixture.detectChanges();

      // Simulate the picker emitting via direct invocation on the host
      fixture.componentInstance.onPickedQuestion({
        id: QUESTION_ID,
        title: 'Picked atom title',
        stem: 'Picked stem preview',
        question_type: 'mcq',
      });

      // Per LEG3-D R3 (ADR-155 D1): onPickedQuestion first fetches the
      // atom projection to extract the embedded mcq_payload.question_id,
      // THEN POSTs addQuestion with BOTH distinct UUIDs.
      const embeddedQuestionId = '01985e7f-1234-7abc-8def-000000000q01';
      const projReq = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/atoms/${QUESTION_ID}`),
      );
      projReq.flush({
        atom: {
          atom_id: QUESTION_ID,
          atom_type: 'mcq',
          mcq_payload: { question_id: embeddedQuestionId },
        },
      });

      const addReq = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}/questions`) && r.method === 'POST',
      );
      expect(addReq.request.body).toEqual({
        question_atom_id: QUESTION_ID,
        question_id: embeddedQuestionId,
        question_type: 'mcq',
        points: 10,
      });
      addReq.flush(buildTestSetQuestion());

      // The component triggers a reload after the add — flush so verify() passes.
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions());
    });

    it('per-question points slider PATCHes /questions/{tsqId}', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions());
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush({ items: [], next_page_token: null });
      fixture.detectChanges();

      const slider = element.querySelector(
        `[data-testid="aplus-tsq-points-${TEST_SET_QUESTION_ID}"]`,
      ) as HTMLInputElement;
      expect(slider).not.toBeNull();
      slider.value = '50';
      slider.dispatchEvent(new Event('change'));

      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}/questions/${TEST_SET_QUESTION_ID}`) &&
        r.method === 'PATCH',
      );
      expect(req.request.body).toEqual({ points: 50 });
      req.flush(buildTestSetQuestion({ points: 50 }));

      // Component re-loads the editor after PATCH.
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions());
    });

    // ─── T0 D11 (CHO-1703): points idiom = typed number input ─────────────
    it('renders points as a typed number input with 1-100 bounds', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions());
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush({ items: [], next_page_token: null });
      fixture.detectChanges();

      const input = element.querySelector(
        `[data-testid="aplus-tsq-points-${TEST_SET_QUESTION_ID}"]`,
      ) as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.type).toBe('number');
      expect(input.getAttribute('min')).toBe('1');
      expect(input.getAttribute('max')).toBe('100');
      expect(input.value).toBe('10');
    });

    it('clamps typed out-of-range points to bounds before PATCH', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions());
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush({ items: [], next_page_token: null });
      fixture.detectChanges();

      const input = element.querySelector(
        `[data-testid="aplus-tsq-points-${TEST_SET_QUESTION_ID}"]`,
      ) as HTMLInputElement;
      input.value = '250';
      input.dispatchEvent(new Event('change'));

      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}/questions/${TEST_SET_QUESTION_ID}`) &&
        r.method === 'PATCH',
      );
      expect(req.request.body).toEqual({ points: 100 });
      req.flush(buildTestSetQuestion({ points: 100 }));

      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions());
    });

    it('empty points input restores the row without PATCHing', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions());
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush({ items: [], next_page_token: null });
      fixture.detectChanges();

      const input = element.querySelector(
        `[data-testid="aplus-tsq-points-${TEST_SET_QUESTION_ID}"]`,
      ) as HTMLInputElement;
      input.value = '';
      input.dispatchEvent(new Event('change'));

      // No PATCH — the editor reloads to restore the persisted value.
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions());
    });

    // ─── CR2-C1: drag-reorder → PATCH display_order ───────────────────────
    describe('drag-reorder (CR2-C1)', () => {
      // OE snapshots keep the per-row MCQ-image + atom-projection effects
      // inert so the only HTTP this block drives is the GET + picker search
      // + the reorder PATCHes.
      const oeSnap = (qid: string, atomId: string): QuestionSnapshot => ({
        question_id: qid,
        atom_id: atomId,
        atom_title: `Atom ${qid}`,
        question_type: 'oe',
        prompt_preview: `Prompt ${qid}`,
        revision_number: 1,
      });
      const oeQuestion = (tsq: string, order: number): TestSetQuestion =>
        buildTestSetQuestion({
          test_set_question_id: tsq,
          question_id: `q-${tsq}`,
          question_atom_id: `a-${tsq}`,
          display_order: order,
          snapshot: oeSnap(`q-${tsq}`, `a-${tsq}`),
        });

      it('PATCHes display_order for each moved row + optimistically reorders the DOM', () => {
        httpMock
          .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
          .flush(
            buildTestSetWithQuestions({
              questions: [oeQuestion('tsq-1', 1), oeQuestion('tsq-2', 2), oeQuestion('tsq-3', 3)],
            }),
          );
        fixture.detectChanges();
        httpMock
          .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
          .flush({ items: [], next_page_token: null });
        fixture.detectChanges();

        // Drag the 3rd row to the top: [1,2,3] → [3,1,2].
        fixture.componentInstance.onReorder({
          previousIndex: 2,
          currentIndex: 0,
        } as unknown as CdkDragDrop<readonly TestSetQuestion[]>);
        fixture.detectChanges();

        // Optimistic DOM reorder — visible before the server confirms.
        const ids = Array.from(
          element.querySelectorAll('[data-testid^="aplus-tsq-card-"]'),
        ).map((el) => el.getAttribute('data-testid'));
        expect(ids).toEqual([
          'aplus-tsq-card-tsq-3',
          'aplus-tsq-card-tsq-1',
          'aplus-tsq-card-tsq-2',
        ]);

        // Each row whose order changed is PATCHed with its new 1-based order.
        const patches = httpMock.match(
          (r) =>
            r.url.includes(`/api/v1/test-sets/${TEST_SET_ID}/questions/`) &&
            r.method === 'PATCH',
        );
        expect(patches.length).toBe(3);
        const bodyFor = (tsq: string) =>
          patches.find((p) => p.request.url.endsWith(`/questions/${tsq}`))!.request.body;
        expect(bodyFor('tsq-3')).toEqual({ display_order: 1 });
        expect(bodyFor('tsq-1')).toEqual({ display_order: 2 });
        expect(bodyFor('tsq-2')).toEqual({ display_order: 3 });
        patches.forEach((p) => p.flush(buildTestSetQuestion()));

        // Settles with a single reload.
        httpMock
          .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
          .flush(buildTestSetWithQuestions());
      });

      it('is a no-op when dropped at the same index', () => {
        httpMock
          .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
          .flush(
            buildTestSetWithQuestions({
              questions: [oeQuestion('tsq-1', 1), oeQuestion('tsq-2', 2)],
            }),
          );
        fixture.detectChanges();
        httpMock
          .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
          .flush({ items: [], next_page_token: null });

        fixture.componentInstance.onReorder({
          previousIndex: 1,
          currentIndex: 1,
        } as unknown as CdkDragDrop<readonly TestSetQuestion[]>);

        httpMock.expectNone((r) => r.method === 'PATCH');
      });

      it('does nothing on a PUBLISHED (non-editable) test-set', () => {
        httpMock
          .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
          .flush(
            buildTestSetWithQuestions({
              state: 'PUBLISHED',
              published_at: '2026-05-15T09:00:00Z',
              questions: [oeQuestion('tsq-1', 1), oeQuestion('tsq-2', 2)],
            }),
          );
        fixture.detectChanges();

        fixture.componentInstance.onReorder({
          previousIndex: 1,
          currentIndex: 0,
        } as unknown as CdkDragDrop<readonly TestSetQuestion[]>);

        httpMock.expectNone((r) => r.method === 'PATCH');
      });

      it('errors the reorder action + reloads when a PATCH fails', () => {
        httpMock
          .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
          .flush(
            buildTestSetWithQuestions({
              questions: [oeQuestion('tsq-1', 1), oeQuestion('tsq-2', 2)],
            }),
          );
        fixture.detectChanges();
        httpMock
          .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
          .flush({ items: [], next_page_token: null });
        fixture.detectChanges();

        fixture.componentInstance.onReorder({
          previousIndex: 1,
          currentIndex: 0,
        } as unknown as CdkDragDrop<readonly TestSetQuestion[]>);

        const patches = httpMock.match(
          (r) =>
            r.url.includes(`/api/v1/test-sets/${TEST_SET_ID}/questions/`) &&
            r.method === 'PATCH',
        );
        expect(patches.length).toBe(2);
        // First write succeeds, second fails → forkJoin surfaces the error.
        patches[0].flush(buildTestSetQuestion());
        patches[1].flush(null, { status: 500, statusText: 'Server Error' });

        expect(fixture.componentInstance.reorderAction().status).toBe('error');

        // The component reloads (reverting the optimistic order) after failure.
        httpMock
          .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
          .flush(buildTestSetWithQuestions());
      });
    });

    it('remove button DELETEs the inclusion row', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions());
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush({ items: [], next_page_token: null });
      fixture.detectChanges();

      const remove = element.querySelector(
        `[data-testid="aplus-tsq-remove-${TEST_SET_QUESTION_ID}"]`,
      ) as HTMLButtonElement;
      expect(remove).not.toBeNull();
      remove.click();

      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}/questions/${TEST_SET_QUESTION_ID}`) &&
        r.method === 'DELETE',
      );
      req.flush(null, { status: 204, statusText: 'No Content' });

      // Component re-loads the editor after DELETE.
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions({ questions: [] }));
    });

    it('publish CTA POSTs /publish and navigates to /a/test-sets', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions());
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush({ items: [], next_page_token: null });
      fixture.detectChanges();

      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

      const cta = element.querySelector(
        '[data-testid="aplus-test-set-publish-cta"]',
      ) as HTMLButtonElement;
      expect(cta).not.toBeNull();
      cta.click();

      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}/publish`),
      );
      expect(req.request.method).toBe('POST');
      req.flush(buildTestSet({ state: 'PUBLISHED' }));

      expect(navSpy).toHaveBeenCalledWith('/a/studio/test-sets');
    });

    it('archive CTA POSTs /archive', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions());
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush({ items: [], next_page_token: null });
      fixture.detectChanges();

      const cta = element.querySelector(
        '[data-testid="aplus-test-set-archive-cta"]',
      ) as HTMLButtonElement;
      expect(cta).not.toBeNull();
      cta.click();

      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}/archive`),
      );
      expect(req.request.method).toBe('POST');
      req.flush(buildTestSet({ state: 'ARCHIVED' }));
    });

    it('renders error banner on load 5xx', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(null, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      const err = element.querySelector(
        '[data-testid="aplus-test-set-editor-error"]',
      );
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLISHED immutability (ADR-155 D5)
  // ═══════════════════════════════════════════════════════════════════════
  describe('PUBLISHED state — immutability per ADR-155 D5', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const r = setup({ testSetId: TEST_SET_ID });
      fixture = r.fixture;
      httpMock = r.httpMock;
      element = fixture.nativeElement as HTMLElement;
    });

    it('shows "Archive + Create new" CTA instead of edit on PUBLISHED test-sets', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush({
          ...buildTestSetWithQuestions({ state: 'PUBLISHED', published_at: '2026-05-15T09:00:00Z' }),
          questions: [buildTestSetQuestion()],
        });
      fixture.detectChanges();
      // PUBLISHED test-sets do NOT mount the picker (canEdit() is false).

      const archiveAndNew = element.querySelector(
        '[data-testid="aplus-test-set-archive-and-create-new-cta"]',
      );
      expect(archiveAndNew).not.toBeNull();

      const publishCta = element.querySelector(
        '[data-testid="aplus-test-set-publish-cta"]',
      );
      expect(publishCta).toBeNull();
    });

    // ─── T0 D11 (CHO-1703): explicit immutability explainer ───────────────
    it('shows the immutability explainer (why + recreate path) on PUBLISHED sets', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush({
          ...buildTestSetWithQuestions({ state: 'PUBLISHED', published_at: '2026-05-15T09:00:00Z' }),
          questions: [buildTestSetQuestion()],
        });
      fixture.detectChanges();

      const explainer = element.querySelector(
        '[data-testid="aplus-test-set-published-explainer"]',
      );
      expect(explainer).not.toBeNull();
      expect(explainer?.getAttribute('role')).toBe('note');
      // Copy must NOT leak internal ADR jargon to end users.
      expect(explainer?.textContent ?? '').not.toContain('ADR-155');
    });

    it('does not show the explainer on DRAFT sets', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions());
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush({ items: [], next_page_token: null });

      const explainer = element.querySelector(
        '[data-testid="aplus-test-set-published-explainer"]',
      );
      expect(explainer).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Ticket B — new coverage for paths landed in today's 12-commit batch.
  // Per docs/m13/p1-spec-drift-followups-2026-05-17.md.
  // ═══════════════════════════════════════════════════════════════════════

  describe('Title input save flow (1e776b6c FE-BUG-5)', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const r = setup({ testSetId: TEST_SET_ID });
      fixture = r.fixture;
      httpMock = r.httpMock;
      element = fixture.nativeElement as HTMLElement;
    });

    it('PATCHes /test-sets/{id} when titleDraft changes + saveTitle() fires', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions({ title: 'Original Title' }));
      fixture.detectChanges();
      // Drain the picker's initial search so httpMock.verify() stays clean.
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush({ items: [], next_page_token: null });

      fixture.componentInstance.titleDraft.set('Edited Title');
      fixture.componentInstance.saveTitle();

      const patch = httpMock.expectOne(
        (r) =>
          r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`) &&
          r.method === 'PATCH',
      );
      expect(patch.request.body).toEqual({ title: 'Edited Title' });
      patch.flush(buildTestSet({ title: 'Edited Title' }));
      expect(fixture.componentInstance.titleAction().status).toBe('success');
    });

    it('reverts titleDraft to persisted value when empty + does NOT fire PATCH', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions({ title: 'Persisted' }));
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush({ items: [], next_page_token: null });

      // Empty draft → component reverts; NO PATCH fires.
      fixture.componentInstance.titleDraft.set('   ');
      fixture.componentInstance.saveTitle();
      httpMock.expectNone(
        (r) =>
          r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`) &&
          r.method === 'PATCH',
      );
      expect(fixture.componentInstance.titleDraft()).toBe('Persisted');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CJ#1 P1 — Title row visual heading + DRAFT badge alignment
  // Reference: docs/m13/cj1-ui-design-refinement-plan-2026-05-17.md
  //   §"Test-set editor — screens 07/08/09"
  //
  // The title input is the page heading (no separate h1) — visually large +
  // bold. The DRAFT/PUBLISHED/ARCHIVED state badge sits to the right of the
  // title row (DOM order: input → badge).
  // ═══════════════════════════════════════════════════════════════════════
  describe('Title row visual heading (CJ#1 P1)', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const r = setup({ testSetId: TEST_SET_ID });
      fixture = r.fixture;
      httpMock = r.httpMock;
      element = fixture.nativeElement as HTMLElement;
    });

    it('DRAFT state title input carries the heading-styled class hook', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions({ title: 'Mid-Term Quiz' }));
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush({ items: [], next_page_token: null });

      const titleInput = element.querySelector(
        '[data-testid="aplus-test-set-title-input"]',
      ) as HTMLInputElement | null;
      expect(titleInput).not.toBeNull();
      // The input IS the heading — it carries the heading-style class hook
      // so SCSS can style it as h1-sized + bold, and tests have a stable
      // selector for the visual-heading affordance.
      expect(titleInput?.classList.contains('test-set-editor__title-input--heading')).toBe(true);
    });

    it('DRAFT state DOM order is input → badge (badge sits to the right of title)', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions({ title: 'Mid-Term Quiz' }));
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush({ items: [], next_page_token: null });

      const header = element.querySelector('.test-set-editor__header');
      expect(header).not.toBeNull();

      const titleInput = header?.querySelector(
        '[data-testid="aplus-test-set-title-input"]',
      ) as HTMLElement | null;
      const stateBadge = header?.querySelector(
        '.test-set-editor__state',
      ) as HTMLElement | null;
      expect(titleInput).not.toBeNull();
      expect(stateBadge).not.toBeNull();

      // DOM-order assertion: input appears BEFORE state badge.
      const position = titleInput!.compareDocumentPosition(stateBadge!);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('PUBLISHED state keeps the read-only h1 heading + badge to its right', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush({
          ...buildTestSetWithQuestions({
            state: 'PUBLISHED',
            published_at: '2026-05-15T09:00:00Z',
          }),
          questions: [buildTestSetQuestion()],
        });
      fixture.detectChanges();
      // PUBLISHED state does NOT mount the picker (canEdit() is false).

      const heading = element.querySelector(
        '[data-testid="aplus-test-set-title"]',
      ) as HTMLElement | null;
      const stateBadge = element.querySelector(
        '.test-set-editor__state',
      ) as HTMLElement | null;
      expect(heading).not.toBeNull();
      expect(stateBadge).not.toBeNull();

      // h1 → badge DOM order preserved in non-editable mode too.
      const position = heading!.compareDocumentPosition(stateBadge!);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('title input keeps its aria-label + data-testid hooks', () => {
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/v1/test-sets/${TEST_SET_ID}`))
        .flush(buildTestSetWithQuestions({ title: 'Mid-Term Quiz' }));
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush({ items: [], next_page_token: null });

      const titleInput = element.querySelector(
        '[data-testid="aplus-test-set-title-input"]',
      ) as HTMLInputElement | null;
      expect(titleInput).not.toBeNull();
      // aria-label must be preserved on the input (accessibility).
      expect(titleInput?.hasAttribute('aria-label')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// CHO-2402 — a PUBLISHED set renders from the copy pinned at publish.
//
// chora-delivery now ships `payload_snapshot` on published rows. Before this,
// the editor had nothing pinned to render and fell through to the live atom,
// so an author reviewing a locked set saw a stem the learners sitting it never
// see. A DRAFT row still follows the live question, which is the design.
// ---------------------------------------------------------------------------
describe('TestSetEditorComponent — the pinned copy (CHO-2402)', () => {
  const PINNED_STEM = 'Which SOLID principle states that a class should have exactly one reason to change?';

  it('renders the pinned stem and asks the live atom for nothing', async () => {
    const { fixture, httpMock } = setup({ testSetId: TEST_SET_ID });
    const published = buildTestSetWithQuestions({
      state: 'PUBLISHED',
      published_at: '2026-08-17T03:32:00Z',
      questions: [
        buildTestSetQuestion({
          snapshot: undefined,
          snapshot_at: '2026-08-17T03:32:00Z',
          payload_snapshot: {
            stem: PINNED_STEM,
            options: [
              { option_id: 'o1', label: 'The Single Responsibility Principle', is_correct: true, explainer: 'Correct.' },
              { option_id: 'o2', label: 'The Open-Closed Principle', is_correct: false, explainer: 'Not this one.' },
            ],
          },
        }),
      ],
    });
    httpMock.expectOne((r) => r.url.includes(`/test-sets/${TEST_SET_ID}`)).flush(published);
    await fixture.whenStable();
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.pinnedStemFor(cmp.testSetQuestions()[0])).toBe(PINNED_STEM);

    const review = cmp.questionDetails()[buildTestSetQuestion().question_atom_id];
    expect(review, 'a published row must have a review built from its own pinned copy').toBeTruthy();
    expect(review.prompt).toBe(PINNED_STEM);
    expect(review.options.map((o) => o.label)).toEqual([
      'The Single Responsibility Principle',
      'The Open-Closed Principle',
    ]);

    // No live lookup for a row that carries its own copy.
    httpMock.expectNone((r) => r.url.includes('/questions/'));
    httpMock.expectNone((r) => /\/api\/atoms\/[^/]+$/.test(r.url));
    httpMock.verify();
  });

  it('still follows the live question on a draft row', async () => {
    const { fixture, httpMock } = setup({ testSetId: TEST_SET_ID });
    const draft = buildTestSetWithQuestions({
      questions: [buildTestSetQuestion({ snapshot: undefined, payload_snapshot: undefined })],
    });
    httpMock.expectOne((r) => r.url.includes(`/test-sets/${TEST_SET_ID}`)).flush(draft);
    await fixture.whenStable();
    fixture.detectChanges();

    // Only the row's own projection lookup, not the picker's search endpoint.
    const live = httpMock.match((r) => /\/api\/atoms\/[0-9a-f-]+$/.test(r.url));
    expect(live.length, 'a draft row has no pinned copy, so it must ask the live atom').toBeGreaterThan(0);
    live.forEach((r) => r.flush({ atom: { title: 'live', mcq_payload: { prompt: 'the live wording' } } }));
    httpMock.match(() => true).forEach((r) => r.flush({ items: [], total: 0 }));
  });
});
