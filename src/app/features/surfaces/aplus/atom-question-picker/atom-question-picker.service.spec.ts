/**
 * AtomQuestionPickerService spec — RED phase first.
 *
 * Wired LIVE against `GET /api/atoms/questions/search` per
 * `chora-contracts/openapi/creation-questions.yaml#searchQuestions`.
 *
 * Per chora-web CLAUDE.md §6:
 *   - Vitest 4
 *   - `provideHttpClient()` + `provideHttpClientTesting()`
 *   - `httpMock.verify()` in afterEach
 *
 * Per memory `feedback_no_stubs_real_wiring`: real BFF call; fail loud
 * on error; no in-memory fixtures.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { AtomQuestionPickerService } from './atom-question-picker.service';
import type {
  QuestionSearchResult,
  QuestionSearchResponse,
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
 * The envelope the LIVE handler actually writes, verified against
 * `services/chora-creation/internal/adapter/http/questions_handler.go`
 * (`questionSearchResponse`): `{items, page, per, total, partial_result,
 * saved_truncated}`. There is NO `next_page_token` — the cursor envelope this
 * fixture used to fabricate does not exist on any deployed code path.
 */
function buildResponse(overrides: Partial<QuestionSearchResponse> = {}): QuestionSearchResponse {
  return {
    items: [buildResult()],
    page: 1,
    per: 20,
    total: 47,
    ...overrides,
  };
}

function setup(): { service: AtomQuestionPickerService; httpMock: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(AtomQuestionPickerService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('AtomQuestionPickerService', () => {
  let service: AtomQuestionPickerService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ service, httpMock } = setup());
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('search()', () => {
    it('GETs /api/atoms/questions/search with default sort + per', () => {
      service.search({}).subscribe();
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/atoms/questions/search'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('sort')).toBe('created_at:desc');
      expect(req.request.params.get('per')).toBe('20');
      req.flush(buildResponse());
    });

    it('sends free-text needle as `q` param', () => {
      service.search({ q: 'agile' }).subscribe();
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/atoms/questions/search'));
      expect(req.request.params.get('q')).toBe('agile');
      req.flush(buildResponse());
    });

    it('sends multi-value `question_type` filter using append() (?question_type=mcq&question_type=oe)', () => {
      service.search({ question_type: ['mcq', 'oe'] }).subscribe();
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/atoms/questions/search'));
      expect(req.request.params.getAll('question_type')).toEqual(['mcq', 'oe']);
      req.flush(buildResponse());
    });

    it('sends multi-value `topic_node_id` filter', () => {
      const nodeA = '01985e7f-1234-7abc-8def-000000000c01';
      const nodeB = '01985e7f-1234-7abc-8def-000000000c02';
      service.search({ topic_node_id: [nodeA, nodeB] }).subscribe();
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/atoms/questions/search'));
      expect(req.request.params.getAll('topic_node_id')).toEqual([nodeA, nodeB]);
      req.flush(buildResponse());
    });

    it('sends multi-value `tag` filter', () => {
      service.search({ tag: ['solid', 'oop'] }).subscribe();
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/atoms/questions/search'));
      expect(req.request.params.getAll('tag')).toEqual(['solid', 'oop']);
      req.flush(buildResponse());
    });

    it('sends `per=50` when explicitly chosen', () => {
      // The defect this asserts against: the FE sent `page_size`, which the BE
      // never reads, so it silently fell back to its own default per=20. The
      // 50 the caller asked for never reached the query.
      service.search({ per: 50 }).subscribe();
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/atoms/questions/search'));
      expect(req.request.params.get('per')).toBe('50');
      req.flush(buildResponse({ per: 50 }));
    });

    it('sends `page` (1-based) for the next page request', () => {
      service.search({ page: 3 }).subscribe();
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/atoms/questions/search'));
      expect(req.request.params.get('page')).toBe('3');
      req.flush(buildResponse({ page: 3 }));
    });

    it('sends NONE of the params the BE does not read (page_size/page_token/include_total)', () => {
      // These three were the whole bug: the FE spoke a cursor dialect that no
      // deployed handler has ever parsed. Asserting their ABSENCE keeps them
      // from creeping back in as decorative query string.
      service.search({ per: 50, page: 2 }).subscribe();
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/atoms/questions/search'));
      expect(req.request.params.get('page_size')).toBeNull();
      expect(req.request.params.get('page_token')).toBeNull();
      expect(req.request.params.get('include_total')).toBeNull();
      req.flush(buildResponse());
    });

    it('sends `author_gcid` for the server-side author filter', () => {
      const gcid = '00000000-0000-7000-8000-000000001999';
      service.search({ author_gcid: gcid }).subscribe();
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/atoms/questions/search'));
      expect(req.request.params.get('author_gcid')).toBe(gcid);
      req.flush(buildResponse());
    });

    it('returns the real {items, page, per, total} envelope unchanged', () => {
      let captured: QuestionSearchResponse | undefined;
      service.search({}).subscribe((res) => (captured = res));
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/atoms/questions/search'));
      req.flush(buildResponse());
      expect(captured?.items.length).toBe(1);
      expect(captured?.page).toBe(1);
      expect(captured?.per).toBe(20);
      expect(captured?.total).toBe(47);
    });

    it('carries `total` unconditionally — it is not gated on an opt-in param', () => {
      // The BE writes Total on every response (questions_handler.go
      // writeJSON(questionSearchResponse{...})); the old `include_total` knob
      // implied a count you had to ask for, and asking did nothing.
      let captured: QuestionSearchResponse | undefined;
      service.search({}).subscribe((res) => (captured = res));
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/atoms/questions/search'));
      req.flush(buildResponse({ total: 47 }));
      expect(captured?.total).toBe(47);
    });

    it('propagates 5xx so the component can render the fail-loud banner', () => {
      let errStatus: number | undefined;
      service.search({}).subscribe({
        error: (err: { status: number }) => (errStatus = err.status),
      });
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/atoms/questions/search'));
      req.flush({ error: { code: 'INTERNAL', message: 'oops' } }, {
        status: 500,
        statusText: 'Internal Server Error',
      });
      expect(errStatus).toBe(500);
    });
  });

  describe("search() source='enrolled' (ADR-243)", () => {
    it('asks chora-consumption, NOT the chora-creation reuse search', () => {
      // The two sources answer DIFFERENT entitlement questions. 'enrolled' asks
      // "does this learner already have access?"; the reuse search asks "may
      // this learner reuse this?". Sending 'enrolled' to the reuse search would
      // silently reproduce the 2-of-367 result this decision exists to fix.
      service.search({ source: 'enrolled' }).subscribe();
      const req = httpMock.expectOne((r) =>
        r.url.includes('/api/v1/me/concept-graph/attachable-atoms'),
      );
      expect(req.request.method).toBe('GET');
      httpMock.expectNone((r) => r.url.includes('/questions/search'));
      req.flush({ items: [] });
    });

    it('labels every row with the entitlement that admitted it', () => {
      let out: QuestionSearchResponse | undefined;
      service.search({ source: 'enrolled' }).subscribe((r) => (out = r));
      httpMock
        .expectOne((r) => r.url.includes('/attachable-atoms'))
        .flush({
          items: [
            { atomId: 'a-1', title: 'Adding fractions', atomType: 'mcq', source: 'enrolled' },
            { atomId: 'a-2', title: 'Explain equivalence', atomType: 'essay', source: 'enrolled' },
          ],
        });

      expect(out?.items.length).toBe(2);
      for (const row of out?.items ?? []) {
        expect(row.source).toBe('enrolled');
      }
      // The open-ended atom must not be mislabelled as an MCQ.
      expect(out?.items[1].question_type).toBe('oe');
    });

    it('filters client-side on the query without a second round-trip', () => {
      let out: QuestionSearchResponse | undefined;
      service.search({ source: 'enrolled', q: 'fraction' }).subscribe((r) => (out = r));
      httpMock
        .expectOne((r) => r.url.includes('/attachable-atoms'))
        .flush({
          items: [
            { atomId: 'a-1', title: 'Adding fractions', source: 'enrolled' },
            { atomId: 'a-2', title: 'Photosynthesis', source: 'enrolled' },
          ],
        });
      httpMock.verify(); // no follow-up request
      expect(out?.items.map((r) => r.id)).toEqual(['a-1']);
    });
  });

  describe('getAtomProjection() — picker v2 lazy-fetch', () => {
    it('GETs /api/atoms/{id} with the encoded atomId', () => {
      service.getAtomProjection(ATOM_ID).subscribe();
      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/atoms/${ATOM_ID}`),
      );
      expect(req.request.method).toBe('GET');
      req.flush({ atom: { atom_id: ATOM_ID, atom_type: 'mcq' } });
    });

    it('unwraps the {atom: ...} envelope (returns the inner atom, not the wrapper)', () => {
      let captured: { atom_id: string; atom_type: string } | undefined;
      service.getAtomProjection(ATOM_ID).subscribe((atom) => {
        captured = atom;
      });
      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/atoms/${ATOM_ID}`),
      );
      req.flush({
        atom: {
          atom_id: ATOM_ID,
          atom_type: 'mcq',
          mcq_payload: {
            question_id: '01985e7f-1234-7abc-8def-000000000b01',
          },
        },
      });
      expect(captured?.atom_id).toBe(ATOM_ID);
      expect(captured?.atom_type).toBe('mcq');
      // The envelope key `atom` is unwrapped — caller sees the inner shape directly.
      expect((captured as unknown as { atom?: unknown }).atom).toBeUndefined();
    });

    it('URL-encodes the atomId in the request path', () => {
      // Belt-and-braces — UUIDv7 doesn't need encoding but the service
      // uses encodeURIComponent() so a string with a `/` would be encoded.
      const trickyId = 'abc/def';
      service.getAtomProjection(trickyId).subscribe();
      const req = httpMock.expectOne((r) =>
        r.url.endsWith('/api/atoms/abc%2Fdef'),
      );
      req.flush({ atom: { atom_id: trickyId, atom_type: 'mcq' } });
    });

    it('propagates 5xx so the picker can render the detail-load-error variant', () => {
      let errStatus: number | undefined;
      service.getAtomProjection(ATOM_ID).subscribe({
        error: (err: { status: number }) => (errStatus = err.status),
      });
      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/api/atoms/${ATOM_ID}`),
      );
      req.flush(null, { status: 500, statusText: 'Internal Server Error' });
      expect(errStatus).toBe(500);
    });
  });
});
