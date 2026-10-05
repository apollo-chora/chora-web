/**
 * AtomQuestionPickerComponent spec — X.1 component (ADR-155 D1).
 *
 * Standalone OnPush picker; reusable inside the test-set editor (X.2).
 *
 * RED-first: writes the component contract via tests, then the
 * implementation makes them GREEN. Per chora-web CLAUDE.md §6:
 *   - Vitest 4 + TestBed
 *   - `httpMock.verify()` in afterEach
 *   - `data-testid` selectors
 *   - **NEVER `fakeAsync`** — Vitest + Angular ProxyZone is incompatible.
 *     Use `vi.useFakeTimers()` / `vi.advanceTimersByTime()` instead (per
 *     canonical chora-web testing memo; see daily-dose.component.spec.ts).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import {
  AtomQuestionPickerComponent,
  resolvePlural,
} from './atom-question-picker.component';
import { TranslateService } from '../../../../core/services/translate.service';
import type {
  QuestionRef,
  QuestionSearchResponse,
  QuestionSearchResult,
} from './atom-question-picker.model';

const ATOM_ID = '01985e7f-1234-7abc-8def-000000000a01';

function buildResult(overrides: Partial<QuestionSearchResult> = {}): QuestionSearchResult {
  return {
    id: ATOM_ID,
    title: 'SOLID — Open-Closed Principle',
    stem: 'Which of the following statements best describes the Open-Closed Principle...',
    question_type: 'mcq',
    tenant_id: '11111111-1111-7111-8111-111111111111',
    author_gcid: '00000000-0000-7000-8000-000000001999',
    created_at: '2026-05-15T08:12:33Z',
    updated_at: '2026-05-15T09:02:11Z',
    ...overrides,
  };
}

/**
 * The envelope the live handler writes — `{items, page, per, total}`, no
 * cursor. `total: 1` with `per: 20` means "one row, no further page", which is
 * what the old `next_page_token: null` was standing in for.
 */
function buildResponse(overrides: Partial<QuestionSearchResponse> = {}): QuestionSearchResponse {
  return {
    items: [buildResult()],
    page: 1,
    per: 20,
    total: 1,
    ...overrides,
  };
}

function setup(): {
  fixture: ComponentFixture<AtomQuestionPickerComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [AtomQuestionPickerComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      TranslateService,
    ],
  });
  const fixture = TestBed.createComponent(AtomQuestionPickerComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, httpMock };
}

describe('resolvePlural (question-count ICU — CHO-2158-FE)', () => {
  const TEMPLATE = '{count, plural, one {# question} other {# questions}}';

  it('renders the singular branch for exactly 1', () => {
    expect(resolvePlural(TEMPLATE, 1)).toBe('1 question');
  });

  it('renders the plural branch for 0', () => {
    expect(resolvePlural(TEMPLATE, 0)).toBe('0 questions');
  });

  it('renders the plural branch for 2', () => {
    expect(resolvePlural(TEMPLATE, 2)).toBe('2 questions');
  });

  it('degrades a non-ICU string (untranslated key) to the bare count', () => {
    expect(resolvePlural('aplus.atom_question_picker.count_label', 3)).toBe('3');
  });
});

describe('AtomQuestionPickerComponent', () => {
  let fixture: ComponentFixture<AtomQuestionPickerComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.resetTestingModule();
    const r = setup();
    fixture = r.fixture;
    httpMock = r.httpMock;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    vi.useRealTimers();
    httpMock.verify();
  });

  describe('initial mount', () => {
    it('renders the picker root with search input + empty results panel', () => {
      const root = element.querySelector('[data-testid="aplus-question-picker"]');
      expect(root).not.toBeNull();
      const input = element.querySelector(
        '[data-testid="aplus-question-picker-search-input"]',
      ) as HTMLInputElement | null;
      expect(input).not.toBeNull();
      expect(input?.tagName).toBe('INPUT');
      // Drain the initial mount fetch so httpMock.verify() passes clean.
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [] }));
    });

    it('renders the page-size <select> with options 10/20/50/100 + default 20', () => {
      const pageSize = element.querySelector(
        '[data-testid="aplus-question-picker-page-size"]',
      ) as HTMLSelectElement | null;
      expect(pageSize).not.toBeNull();
      const opts = Array.from(pageSize!.options).map((o) => o.value);
      expect(opts).toEqual(['10', '20', '50', '100']);
      // Default selection is verified authoritatively by the next test
      // ("fires the initial search exactly once on mount with default sort
      // + per"), which asserts per=20 on the outbound request.
      // The select.value DOM property has Angular CD timing quirks with
      // [value]="pageSize()" + nested @for option rendering — the search
      // request is the deterministic check.
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [] }));
    });

    it('fires the initial search exactly once on mount with default sort + per', () => {
      const req = httpMock.expectOne((r) =>
        r.url.endsWith('/api/atoms/questions/search'),
      );
      expect(req.request.params.get('sort')).toBe('created_at:desc');
      expect(req.request.params.get('per')).toBe('20');
      req.flush(buildResponse({ items: [] }));
    });
  });

  // The picker fetches its candidate list at open-time only. If the author
  // creates a question in another tab and returns to a left-open picker, the
  // list must self-heal — so a tab-visibility regain re-fetches the first page.
  describe('stale-picker self-heal (refresh on tab re-entry)', () => {
    const setVisibility = (state: string): void => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => state,
      });
    };

    afterEach(() => {
      // Drop the per-test override so the jsdom default is restored.
      delete (document as unknown as { visibilityState?: unknown }).visibilityState;
    });

    it('re-fetches the first page when the tab regains visibility', () => {
      // Drain the initial mount fetch (the list the author saw before).
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [buildResult({ id: 'stale-row' })] }));

      // Author returns to the tab → picker should re-query for fresh candidates.
      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));

      const refetch = httpMock.expectOne((r) =>
        r.url.endsWith('/api/atoms/questions/search'),
      );
      // A first-page refresh — no stale page index carried over (an omitted
      // `page` is the BE's default of 1).
      expect(refetch.request.params.has('page')).toBe(false);
      refetch.flush(buildResponse({ items: [buildResult({ id: 'fresh-row' })] }));
    });

    it('does NOT re-fetch while the tab is hidden', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [] }));

      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));

      // Guarded by visibilityState === 'visible' — no spurious request.
      httpMock.expectNone((r) => r.url.endsWith('/api/atoms/questions/search'));
    });
  });

  describe('debounced search', () => {
    it('does NOT fire an immediate second search on every keystroke (debounced 300ms)', () => {
      const initial = httpMock.expectOne((r) =>
        r.url.endsWith('/api/atoms/questions/search'),
      );
      initial.flush(buildResponse({ items: [] }));

      const input = element.querySelector(
        '[data-testid="aplus-question-picker-search-input"]',
      ) as HTMLInputElement;
      input.value = 'a';
      input.dispatchEvent(new Event('input'));
      vi.advanceTimersByTime(50);
      input.value = 'ag';
      input.dispatchEvent(new Event('input'));
      vi.advanceTimersByTime(50);
      input.value = 'agi';
      input.dispatchEvent(new Event('input'));
      // Still inside debounce window — no request yet.
      httpMock.expectNone((r) => r.url.endsWith('/api/atoms/questions/search'));
      vi.advanceTimersByTime(350);
      // Exactly one request fires after the debounce window elapses.
      const req = httpMock.expectOne((r) =>
        r.url.endsWith('/api/atoms/questions/search'),
      );
      expect(req.request.params.get('q')).toBe('agi');
      req.flush(buildResponse({ items: [] }));
    });
  });

  describe('filter chips — question_type multi-select', () => {
    it('appends ?question_type=mcq when MCQ chip is toggled', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [] }));

      const chip = element.querySelector(
        '[data-testid="aplus-question-picker-chip-mcq"]',
      ) as HTMLButtonElement;
      expect(chip).not.toBeNull();
      chip.click();
      vi.advanceTimersByTime(350);

      const req = httpMock.expectOne((r) =>
        r.url.endsWith('/api/atoms/questions/search'),
      );
      expect(req.request.params.getAll('question_type')).toEqual(['mcq']);
      req.flush(buildResponse({ items: [] }));
    });

    it('sends two question_type values when both MCQ + OE chips are active', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [] }));

      const mcq = element.querySelector(
        '[data-testid="aplus-question-picker-chip-mcq"]',
      ) as HTMLButtonElement;
      const oe = element.querySelector(
        '[data-testid="aplus-question-picker-chip-oe"]',
      ) as HTMLButtonElement;
      mcq.click();
      vi.advanceTimersByTime(350);
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [] }));
      oe.click();
      vi.advanceTimersByTime(350);

      const req = httpMock.expectOne((r) =>
        r.url.endsWith('/api/atoms/questions/search'),
      );
      expect(req.request.params.getAll('question_type')).toEqual(['mcq', 'oe']);
      req.flush(buildResponse({ items: [] }));
    });
  });

  describe('page-size <select>', () => {
    it('changing to 50 retriggers a search with ?per=50', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [] }));

      const pageSize = element.querySelector(
        '[data-testid="aplus-question-picker-page-size"]',
      ) as HTMLSelectElement;
      pageSize.value = '50';
      pageSize.dispatchEvent(new Event('change'));
      vi.advanceTimersByTime(350);

      const req = httpMock.expectOne((r) =>
        r.url.endsWith('/api/atoms/questions/search'),
      );
      expect(req.request.params.get('per')).toBe('50');
      req.flush(buildResponse({ items: [] }));
    });
  });

  // Page-number pagination. This block used to be titled "cursor pagination"
  // and drove `next_page_token`, a field no deployed handler has ever written —
  // so every one of these paths was green against a fiction while the live
  // Load-more control could not render at all. End-of-list is now arithmetic
  // over the `total` the BE really sends.
  describe('page-number pagination', () => {
    it('renders "Load more" CTA when a further page exists (page*per < total)', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({
          items: [buildResult()],
          page: 1,
          per: 20,
          total: 47,
        }));
      fixture.detectChanges();

      const more = element.querySelector(
        '[data-testid="aplus-question-picker-load-more"]',
      ) as HTMLButtonElement | null;
      expect(more).not.toBeNull();
      expect(more?.disabled).toBe(false);
    });

    it('hides "Load more" once the served page covers the total (end-of-list)', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({
          items: [buildResult()],
          page: 1,
          per: 20,
          total: 1,
        }));
      fixture.detectChanges();

      const more = element.querySelector(
        '[data-testid="aplus-question-picker-load-more"]',
      );
      expect(more).toBeNull();
    });

    it('hides "Load more" on the LAST page of a multi-page set', () => {
      // page 3 of 3 at per=20, total=47: 3*20 = 60 >= 47 ⇒ nothing further.
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({
          items: [buildResult()],
          page: 3,
          per: 20,
          total: 47,
        }));
      fixture.detectChanges();

      expect(
        element.querySelector('[data-testid="aplus-question-picker-load-more"]'),
      ).toBeNull();
    });

    it('"Load more" sends ?page=2 and appends results', () => {
      const first = httpMock.expectOne((r) =>
        r.url.endsWith('/api/atoms/questions/search'),
      );
      first.flush(buildResponse({
        items: [buildResult({ id: 'q-1', title: 'Question one' })],
        page: 1,
        per: 20,
        total: 47,
      }));
      fixture.detectChanges();

      const more = element.querySelector(
        '[data-testid="aplus-question-picker-load-more"]',
      ) as HTMLButtonElement;
      more.click();

      const second = httpMock.expectOne((r) =>
        r.url.endsWith('/api/atoms/questions/search'),
      );
      expect(second.request.params.get('page')).toBe('2');
      second.flush(buildResponse({
        items: [buildResult({ id: 'q-2', title: 'Question two' })],
        page: 2,
        per: 20,
        total: 2,
      }));
      fixture.detectChanges();

      const cards = element.querySelectorAll(
        '[data-testid^="aplus-question-picker-card-"]',
      );
      // First page (1) + second page (1) = 2 rendered cards.
      expect(cards.length).toBe(2);
    });
  });

  describe('row interactions — quick-add vs expand (picker v2)', () => {
    it('clicking the quick-add "+" button emits pickedQuestion with full ref', () => {
      const initial = httpMock.expectOne((r) =>
        r.url.endsWith('/api/atoms/questions/search'),
      );
      initial.flush(buildResponse({ items: [buildResult()] }));
      fixture.detectChanges();

      const emitted: QuestionRef[] = [];
      fixture.componentInstance.pickedQuestion.subscribe((ref) =>
        emitted.push(ref),
      );

      const quickAdd = element.querySelector(
        `[data-testid="aplus-question-picker-quick-add-${ATOM_ID}"]`,
      ) as HTMLButtonElement | null;
      expect(quickAdd).not.toBeNull();
      quickAdd!.click();

      expect(emitted.length).toBe(1);
      expect(emitted[0].id).toBe(ATOM_ID);
      expect(emitted[0].title.length).toBeGreaterThan(0);
      expect(emitted[0].question_type).toBe('mcq');
      expect(emitted[0].stem.length).toBeGreaterThan(0);
    });

    it('clicking the row body toggles expand state (no pickedQuestion emission)', () => {
      const initial = httpMock.expectOne((r) =>
        r.url.endsWith('/api/atoms/questions/search'),
      );
      initial.flush(buildResponse({ items: [buildResult()] }));
      fixture.detectChanges();

      const emitted: QuestionRef[] = [];
      fixture.componentInstance.pickedQuestion.subscribe((ref) =>
        emitted.push(ref),
      );

      const card = element.querySelector(
        `[data-testid="aplus-question-picker-card-${ATOM_ID}"]`,
      ) as HTMLButtonElement;
      expect(card.getAttribute('aria-expanded')).toBe('false');
      card.click();
      fixture.detectChanges();

      // Now expanded — detail panel rendered, no emission.
      expect(card.getAttribute('aria-expanded')).toBe('true');
      const detail = element.querySelector(
        '[data-testid="aplus-question-picker-detail"]',
      );
      expect(detail).not.toBeNull();
      expect(emitted.length).toBe(0);

      // Drain the lazy-fetch GET that toggleExpanded fires (covered in detail
      // below — here we just need httpMock.verify() to pass clean).
      httpMock
        .expectOne((r) => r.url.includes(`/api/atoms/${ATOM_ID}`))
        .flush({ atom: { atom_id: ATOM_ID, atom_type: 'mcq' } });
    });

    it('clicking the row body twice toggles expand off (collapse)', () => {
      const initial = httpMock.expectOne((r) =>
        r.url.endsWith('/api/atoms/questions/search'),
      );
      initial.flush(buildResponse({ items: [buildResult()] }));
      fixture.detectChanges();

      const card = element.querySelector(
        `[data-testid="aplus-question-picker-card-${ATOM_ID}"]`,
      ) as HTMLButtonElement;
      card.click();
      fixture.detectChanges();
      // Drain the lazy-fetch from the first expand.
      httpMock
        .expectOne((r) => r.url.includes(`/api/atoms/${ATOM_ID}`))
        .flush({ atom: { atom_id: ATOM_ID, atom_type: 'mcq' } });
      expect(card.getAttribute('aria-expanded')).toBe('true');

      card.click();
      fixture.detectChanges();
      expect(card.getAttribute('aria-expanded')).toBe('false');
      const detail = element.querySelector(
        '[data-testid="aplus-question-picker-detail"]',
      );
      expect(detail).toBeNull();
    });
  });

  describe('sort dropdown (picker v2)', () => {
    it('renders 5 sort options with default created_at:desc', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [] }));

      const sort = element.querySelector(
        '[data-testid="aplus-question-picker-sort"]',
      ) as HTMLSelectElement;
      expect(sort).not.toBeNull();
      const values = Array.from(sort.options).map((o) => o.value);
      expect(values).toEqual([
        'created_at:desc',
        'created_at:asc',
        'updated_at:desc',
        'title:asc',
        'question_type:asc',
      ]);
      expect(sort.value).toBe('created_at:desc');
    });

    it('changing sort to title:asc retriggers search with ?sort=title:asc', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [] }));

      const sort = element.querySelector(
        '[data-testid="aplus-question-picker-sort"]',
      ) as HTMLSelectElement;
      sort.value = 'title:asc';
      sort.dispatchEvent(new Event('change'));
      vi.advanceTimersByTime(350);

      const req = httpMock.expectOne((r) =>
        r.url.endsWith('/api/atoms/questions/search'),
      );
      expect(req.request.params.get('sort')).toBe('title:asc');
      req.flush(buildResponse({ items: [] }));
    });
  });

  describe('multi-select state (picker v2)', () => {
    const ATOM_ID_2 = '01985e7f-1234-7abc-8def-000000000a02';

    it('bulk bar is hidden when selection is empty', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [buildResult()] }));
      fixture.detectChanges();

      expect(
        element.querySelector('[data-testid="aplus-question-picker-bulk-bar"]'),
      ).toBeNull();
    });

    it('checking a row checkbox surfaces the bulk bar with count = 1', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [buildResult()] }));
      fixture.detectChanges();

      const checkbox = element.querySelector(
        `[data-testid="aplus-question-picker-check-${ATOM_ID}"]`,
      ) as HTMLInputElement | null;
      expect(checkbox).not.toBeNull();
      checkbox!.checked = true;
      checkbox!.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      const bulkBar = element.querySelector(
        '[data-testid="aplus-question-picker-bulk-bar"]',
      );
      expect(bulkBar).not.toBeNull();
      const bulkAdd = element.querySelector(
        '[data-testid="aplus-question-picker-bulk-add"]',
      );
      expect(bulkAdd?.textContent).toContain('(1)');
    });

    it('checking 2 rows then clicking bulk-add emits pickedQuestions[] with 2 refs + clears selection', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(
          buildResponse({
            items: [buildResult(), buildResult({ id: ATOM_ID_2, title: 'Second atom' })],
            total: 2,
          }),
        );
      fixture.detectChanges();

      const emitted: (readonly QuestionRef[])[] = [];
      fixture.componentInstance.pickedQuestions.subscribe((refs) =>
        emitted.push(refs),
      );

      const check1 = element.querySelector(
        `[data-testid="aplus-question-picker-check-${ATOM_ID}"]`,
      ) as HTMLInputElement;
      const check2 = element.querySelector(
        `[data-testid="aplus-question-picker-check-${ATOM_ID_2}"]`,
      ) as HTMLInputElement;
      check1.checked = true;
      check1.dispatchEvent(new Event('change'));
      check2.checked = true;
      check2.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      const bulkAdd = element.querySelector(
        '[data-testid="aplus-question-picker-bulk-add"]',
      ) as HTMLButtonElement;
      bulkAdd.click();
      fixture.detectChanges();

      expect(emitted.length).toBe(1);
      expect(emitted[0].map((r) => r.id).sort()).toEqual(
        [ATOM_ID, ATOM_ID_2].sort(),
      );
      // Bulk bar disappears after the emit (selection cleared).
      expect(
        element.querySelector('[data-testid="aplus-question-picker-bulk-bar"]'),
      ).toBeNull();
    });

    it('bulk-clear empties the selection without emitting', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [buildResult()] }));
      fixture.detectChanges();

      const emitted: (readonly QuestionRef[])[] = [];
      fixture.componentInstance.pickedQuestions.subscribe((refs) =>
        emitted.push(refs),
      );

      const check = element.querySelector(
        `[data-testid="aplus-question-picker-check-${ATOM_ID}"]`,
      ) as HTMLInputElement;
      check.checked = true;
      check.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      const bulkClear = element.querySelector(
        '[data-testid="aplus-question-picker-bulk-clear"]',
      ) as HTMLButtonElement;
      bulkClear.click();
      fixture.detectChanges();

      expect(emitted.length).toBe(0);
      expect(
        element.querySelector('[data-testid="aplus-question-picker-bulk-bar"]'),
      ).toBeNull();
    });
  });

  describe('accordion expand + lazy-fetch (picker v2)', () => {
    it('expanding a row for the first time fires GET /api/atoms/{id}', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [buildResult()] }));
      fixture.detectChanges();

      const card = element.querySelector(
        `[data-testid="aplus-question-picker-card-${ATOM_ID}"]`,
      ) as HTMLButtonElement;
      card.click();
      fixture.detectChanges();

      const fetchReq = httpMock.expectOne((r) =>
        r.url.includes(`/api/atoms/${ATOM_ID}`),
      );
      expect(fetchReq.request.method).toBe('GET');
      fetchReq.flush({
        atom: {
          atom_id: ATOM_ID,
          atom_type: 'mcq',
          mcq_payload: {
            prompt: 'stub',
            question_id: '01985e7f-1234-7abc-8def-000000000b01',
            options: [],
          },
        },
      });

      // The atom flush carries a question_id, so the picker chains the
      // CHO-1638 illustration lazy-fetch — drain it or afterEach
      // httpMock.verify() reports it as the one open request.
      const imagesReq = httpMock.expectOne((r) =>
        r.url.includes(
          `/api/atoms/${ATOM_ID}/questions/01985e7f-1234-7abc-8def-000000000b01`,
        ),
      );
      expect(imagesReq.request.method).toBe('GET');
      imagesReq.flush({
        question: { mcq: { image_url: null, answer_image_url: null } },
      });
      fixture.detectChanges();

      // Detail panel now shows the ready state (no longer the loading variant).
      expect(
        element.querySelector(
          '.atom-question-picker__row-detail-loading',
        ),
      ).toBeNull();
    });

    it('expanding then collapsing then re-expanding does NOT re-fetch (cache hit)', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [buildResult()] }));
      fixture.detectChanges();

      const card = element.querySelector(
        `[data-testid="aplus-question-picker-card-${ATOM_ID}"]`,
      ) as HTMLButtonElement;
      card.click();
      fixture.detectChanges();
      httpMock
        .expectOne((r) => r.url.includes(`/api/atoms/${ATOM_ID}`))
        .flush({ atom: { atom_id: ATOM_ID, atom_type: 'mcq' } });
      fixture.detectChanges();

      // Collapse.
      card.click();
      fixture.detectChanges();
      // Re-expand — must NOT fire a second GET (cached payload).
      card.click();
      fixture.detectChanges();
      httpMock.expectNone((r) => r.url.includes(`/api/atoms/${ATOM_ID}`));
    });

    it('lazy-fetch error shows the detail-load-error variant', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [buildResult()] }));
      fixture.detectChanges();

      const card = element.querySelector(
        `[data-testid="aplus-question-picker-card-${ATOM_ID}"]`,
      ) as HTMLButtonElement;
      card.click();
      fixture.detectChanges();

      httpMock
        .expectOne((r) => r.url.includes(`/api/atoms/${ATOM_ID}`))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      fixture.detectChanges();

      const errMsg = element.querySelector(
        '.atom-question-picker__row-detail-error',
      );
      expect(errMsg).not.toBeNull();
    });
  });

  describe('AsyncState branches', () => {
    it('shows the loading panel before the first response', () => {
      const loading = element.querySelector(
        '[data-testid="aplus-question-picker-loading"]',
      );
      expect(loading).not.toBeNull();
      expect(loading?.getAttribute('role')).toBe('status');
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [] }));
    });

    it('shows the empty panel when response has zero items', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush({ items: [], page: 1, per: 20, total: 0 });
      fixture.detectChanges();

      const empty = element.querySelector(
        '[data-testid="aplus-question-picker-empty"]',
      );
      expect(empty).not.toBeNull();
    });

    it('shows the error banner + retry CTA on 5xx (fail-loud)', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush({ error: { code: 'INTERNAL' } }, {
          status: 500,
          statusText: 'Internal Server Error',
        });
      fixture.detectChanges();

      const err = element.querySelector(
        '[data-testid="aplus-question-picker-error"]',
      );
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');

      const retry = element.querySelector(
        '[data-testid="aplus-question-picker-retry"]',
      ) as HTMLButtonElement | null;
      expect(retry).not.toBeNull();
    });

    it('retry CTA re-fires the search', () => {
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      fixture.detectChanges();

      const retry = element.querySelector(
        '[data-testid="aplus-question-picker-retry"]',
      ) as HTMLButtonElement;
      retry.click();
      const req2 = httpMock.expectOne((r) =>
        r.url.endsWith('/api/atoms/questions/search'),
      );
      req2.flush(buildResponse({ items: [] }));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ADR-229 WS-2 (CHO-2133) — consent-gate affordances.
  //
  // The picker's results are narrowed SERVER-side to atoms the caller may
  // reuse (mine ∪ saved∩entitled ∪ tenant-visible ∪ granted). The UI
  // reflects that gate truthfully: an always-on "Usable by me" chip, per-row
  // provenance badges for the new granted/tenant source hints, and the
  // Amendment A1.3 "no longer shared" badge on orphan editions (field is
  // additive — absence is normal, never an error; camelised bridge variants
  // coalesce).
  // ═══════════════════════════════════════════════════════════════════════
  describe('ADR-229 consent-gate affordances (WS-2)', () => {
    it('renders the always-on "Usable by me" gate chip', () => {
      const gate = element.querySelector(
        '[data-testid="aplus-question-picker-usable-gate"]',
      );
      expect(gate).not.toBeNull();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [] }));
    });

    it('renders granted + tenant provenance badges from the server source hint', () => {
      const grantedRow = buildResult({ id: '01985e7f-1234-7abc-8def-00000000aa10', source: 'granted' });
      const tenantRow = buildResult({ id: '01985e7f-1234-7abc-8def-00000000aa11', source: 'tenant' });
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [grantedRow, tenantRow], total: 2 }));
      fixture.detectChanges();

      const granted = element.querySelector(
        `[data-testid="aplus-question-picker-source-${grantedRow.id}"]`,
      );
      expect(granted).not.toBeNull();
      expect(granted?.getAttribute('data-source')).toBe('granted');
      const tenant = element.querySelector(
        `[data-testid="aplus-question-picker-source-${tenantRow.id}"]`,
      );
      expect(tenant).not.toBeNull();
      expect(tenant?.getAttribute('data-source')).toBe('tenant');
    });

    it('renders the "no longer shared" orphan badge when a row carries orphaned_from_atom_id', () => {
      const orphanRow = buildResult({
        id: '01985e7f-1234-7abc-8def-00000000aa20',
        source: 'granted',
        orphaned_from_atom_id: '01985e7f-1234-7abc-8def-00000000aa99',
      });
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [orphanRow] }));
      fixture.detectChanges();

      const badge = element.querySelector(
        `[data-testid="aplus-question-picker-orphan-${orphanRow.id}"]`,
      );
      expect(badge).not.toBeNull();
    });

    it('coalesces the camelised orphanedFromAtomId bridge variant', () => {
      const orphanRow = {
        ...buildResult({ id: '01985e7f-1234-7abc-8def-00000000aa21', source: 'granted' }),
        orphanedFromAtomId: '01985e7f-1234-7abc-8def-00000000aa98',
      };
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [orphanRow] }));
      fixture.detectChanges();

      const badge = element.querySelector(
        `[data-testid="aplus-question-picker-orphan-${orphanRow.id}"]`,
      );
      expect(badge).not.toBeNull();
    });

    it('renders NO orphan badge when the field is absent (additive — absence is normal)', () => {
      const row = buildResult({ id: '01985e7f-1234-7abc-8def-00000000aa22' });
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
        .flush(buildResponse({ items: [row] }));
      fixture.detectChanges();

      const badge = element.querySelector(
        `[data-testid="aplus-question-picker-orphan-${row.id}"]`,
      );
      expect(badge).toBeNull();
    });
  });
});

/**
 * ADR-243 D2 + D7, the two-source picker.
 *
 * D2 is blunt about why these matter: "a picker that mixes two entitlement
 * models silently is strictly worse than either source alone", and it names
 * itself as "the decision most likely to be quietly dropped as polish".
 *
 * The two sources answer DIFFERENT questions. Source A (enrolment) asks "does
 * this learner already have access to this atom?"; Source B (ADR-229 tenant
 * reuse) asks "may this learner REUSE this atom in shareable work?". A learner
 * who cannot see which rule admitted a row cannot tell a missing atom from a
 * withheld one, and the next reader files the difference as a bug.
 */
describe('AtomQuestionPickerComponent, ADR-243 two-source entitlement', () => {
  let fixture: ComponentFixture<AtomQuestionPickerComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  /** Mounts with a host-supplied default source, set BEFORE the first CD so
   *  ngOnInit adopts it and the open-time request already asks the right
   *  question (the concept drawer passes defaultSource="enrolled"). */
  function mountWith(
    defaultSource: 'all' | 'enrolled',
    offerEnrolledSource = defaultSource === 'enrolled',
  ): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AtomQuestionPickerComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), TranslateService],
    });
    fixture = TestBed.createComponent(AtomQuestionPickerComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('defaultSource', defaultSource);
    fixture.componentRef.setInput('offerEnrolledSource', offerEnrolledSource);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    httpMock.verify();
  });

  const drainEnrolled = (items: unknown[] = []): void => {
    httpMock
      .expectOne((r) => r.url.includes('/attachable-atoms'))
      .flush({ items });
    fixture.detectChanges();
  };

  it('does NOT offer the enrolled chip to a REUSE host, which would leak the entitlement', () => {
    // ADR-243 D6: ADR-229's consent gate still governs every REUSE act -- test
    // sets, question banks, LiveQuiz arms, collections, duels. This picker is
    // shared with all of those hosts, so an unconditional enrolment chip would
    // hand a test-set author the atoms they happen to be ENROLLED in, which is
    // the reuse question answered with the private-map answer. The default is
    // therefore off: a host that forgets to opt in gets the reuse-only picker
    // rather than an entitlement leak.
    mountWith('all');
    httpMock
      .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
      .flush(buildResponse({ items: [] }));
    fixture.detectChanges();

    expect(
      element.querySelector('[data-testid="aplus-question-picker-chip-source-enrolled"]'),
    ).toBeNull();
  });

  it('refuses to switch to Source A when the host has not offered it', () => {
    // Belt and braces on the same rule: the chip is the only UI path, but a
    // programmatic setSource('enrolled') from a reuse host must not silently
    // change which entitlement question is being asked.
    mountWith('all');
    httpMock
      .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
      .flush(buildResponse({ items: [] }));
    fixture.detectChanges();

    fixture.componentInstance.setSource('enrolled');
    vi.advanceTimersByTime(400);
    expect(fixture.componentInstance.sourceFilter()).toBe('all');
  });

  it('offers ENROLLED as a source chip, so Source A is reachable and not a one-way door', () => {
    // Without this chip the concept drawer can only ever LEAVE the enrolment
    // source: defaultSource selects it once at mount, and the moment the learner
    // taps All / Mine / Saved there is no control that returns them to it. The
    // drawer's own comment claims "both sources stay reachable via the source
    // chips", which is the assertion this test makes true.
    mountWith('enrolled');
    drainEnrolled();

    const chip = element.querySelector(
      '[data-testid="aplus-question-picker-chip-source-enrolled"]',
    );
    expect(chip).not.toBeNull();
  });

  it('shows the enrolled chip as PRESSED when the host opened on Source A', () => {
    // With no chip pressed, every control reads "not selected" and the learner
    // cannot tell which entitlement they are looking at.
    mountWith('enrolled');
    drainEnrolled();

    const chip = element.querySelector(
      '[data-testid="aplus-question-picker-chip-source-enrolled"]',
    );
    expect(chip?.getAttribute('aria-pressed')).toBe('true');
  });

  it('returns to Source A after a detour through Source B', () => {
    mountWith('enrolled');
    drainEnrolled();

    // Leave for the reuse corpus...
    (
      element.querySelector(
        '[data-testid="aplus-question-picker-chip-source-all"]',
      ) as HTMLButtonElement
    ).click();
    vi.advanceTimersByTime(400);
    httpMock
      .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
      .flush(buildResponse({ items: [] }));
    fixture.detectChanges();

    // ...and back. This second request is the whole point: it must go to
    // chora-consumption, not to the reuse search.
    (
      element.querySelector(
        '[data-testid="aplus-question-picker-chip-source-enrolled"]',
      ) as HTMLButtonElement
    ).click();
    vi.advanceTimersByTime(400);
    drainEnrolled();
    expect(
      element
        .querySelector('[data-testid="aplus-question-picker-chip-source-enrolled"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('states the ENROLMENT reason when Source A is empty, not "author a new one"', () => {
    // D7: an empty source "renders as an honest empty section with its own
    // reason, never as a spinner, a failure, or a silent merge into the other".
    // The generic copy tells the reader to author an atom, which is advice for
    // an author looking at the reuse corpus and is simply wrong for a learner
    // with no enrolments: authoring one would not put it on their path.
    mountWith('enrolled');
    drainEnrolled([]);

    const empty = element.querySelector('[data-testid="aplus-question-picker-empty"]');
    expect(empty).not.toBeNull();
    expect(empty?.getAttribute('data-empty-source')).toBe('enrolled');
  });

  it('renders an explicit badge for an UNKNOWN reason rather than a blank chip', () => {
    // D2: "an unlabelled or unknown-labelled row is a defect, never a silently
    // blank chip". The wire is untyped at runtime, so a source value this build
    // does not know (a newer server, a future `friends` audience) must not
    // resolve to undefined and render as empty space, that is indistinguishable
    // from a row that carries no entitlement at all.
    mountWith('all');
    const row = {
      ...buildResult({ id: '01985e7f-1234-7abc-8def-00000000aa31' }),
      source: 'friends',
    } as unknown as QuestionSearchResult;
    httpMock
      .expectOne((r) => r.url.endsWith('/api/atoms/questions/search'))
      .flush(buildResponse({ items: [row] }));
    fixture.detectChanges();

    const badge = element.querySelector(
      `[data-testid="aplus-question-picker-source-${row.id}"]`,
    );
    expect(badge).not.toBeNull();
    expect(badge?.textContent?.trim()).not.toBe('');
  });
});
