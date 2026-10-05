import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { MeTranscriptService } from './me-transcript.service';
import {
  mapTranscriptEntry,
  mapTranscriptList,
  normalizeTranscriptKind,
} from './me-transcript.model';
import type {
  TranscriptEntryWire,
  TranscriptListResponse,
} from './me-transcript.model';

/**
 * MeTranscriptService spec — A+ per-learner transcript (W6 outcome spine).
 */

const ENTRY_ID = '01985e7f-1234-7abc-8def-000000000c01';
const GCID = '00000000-0000-7000-8000-000000001999';
const ASSESSMENT_REF = '01985e7f-1234-7abc-8def-000000000a01';

function buildWire(
  overrides: Partial<TranscriptEntryWire> = {},
): TranscriptEntryWire {
  return {
    entry_id: ENTRY_ID,
    gcid: GCID,
    kind: 'assessment',
    source_ref: ASSESSMENT_REF,
    title: 'Agile Estimation — Cohort May 2026',
    score_earned: 40,
    score_possible: 50,
    score_percent: 80,
    passed: true,
    course_id: null,
    occurred_at: '2026-05-20T16:00:00Z',
    ...overrides,
  };
}

function buildResponse(
  overrides: Partial<TranscriptListResponse> = {},
): TranscriptListResponse {
  return { items: [buildWire()], ...overrides };
}

function setup(): {
  service: MeTranscriptService;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(MeTranscriptService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('me-transcript.model mappers', () => {
  describe('normalizeTranscriptKind()', () => {
    it('passes through assessment', () => {
      expect(normalizeTranscriptKind('assessment')).toBe('assessment');
    });
    it('passes through certification', () => {
      expect(normalizeTranscriptKind('certification')).toBe('certification');
    });
    it('falls back to assessment for an unknown kind', () => {
      expect(normalizeTranscriptKind('mystery')).toBe('assessment');
    });
  });

  describe('mapTranscriptEntry()', () => {
    it('maps every snake_case field to camelCase', () => {
      const e = mapTranscriptEntry(buildWire());
      expect(e.entryId).toBe(ENTRY_ID);
      expect(e.gcid).toBe(GCID);
      expect(e.kind).toBe('assessment');
      expect(e.sourceRef).toBe(ASSESSMENT_REF);
      expect(e.title).toBe('Agile Estimation — Cohort May 2026');
      expect(e.scoreEarned).toBe(40);
      expect(e.scorePossible).toBe(50);
      expect(e.scorePercent).toBe(80);
      expect(e.passed).toBe(true);
      expect(e.courseId).toBeNull();
      expect(e.occurredAt).toBe('2026-05-20T16:00:00Z');
    });

    it('preserves explicit nulls (certification carries no score) — NOT coerced to 0', () => {
      const e = mapTranscriptEntry(
        buildWire({
          kind: 'certification',
          source_ref: 'cert-1',
          title: 'Data Literacy — Certified',
          score_earned: null,
          score_possible: null,
          score_percent: null,
          passed: null,
          course_id: 'course-42',
        }),
      );
      expect(e.kind).toBe('certification');
      expect(e.scoreEarned).toBeNull();
      expect(e.scorePossible).toBeNull();
      expect(e.scorePercent).toBeNull();
      expect(e.passed).toBeNull();
      expect(e.courseId).toBe('course-42');
    });

    it('preserves a real 0 score_percent (does NOT map 0 → null)', () => {
      const e = mapTranscriptEntry(buildWire({ score_percent: 0, passed: false }));
      expect(e.scorePercent).toBe(0);
      expect(e.passed).toBe(false);
    });
  });

  describe('mapTranscriptList()', () => {
    it('maps every item', () => {
      const out = mapTranscriptList(buildResponse({ items: [buildWire(), buildWire({ entry_id: 'e2' })] }));
      expect(out.length).toBe(2);
      expect(out[1].entryId).toBe('e2');
    });
    it('returns [] for a missing items key', () => {
      expect(mapTranscriptList({}).length).toBe(0);
    });
    it('returns [] for a null response', () => {
      expect(mapTranscriptList(null).length).toBe(0);
    });
  });
});

describe('MeTranscriptService', () => {
  let service: MeTranscriptService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ service, httpMock } = setup());
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('loadTranscript()', () => {
    it('issues GET /api/v1/me/transcript', () => {
      service.loadTranscript();
      const req = httpMock.expectOne((r) =>
        r.url.endsWith('/api/v1/me/transcript'),
      );
      expect(req.request.method).toBe('GET');
      req.flush(buildResponse());
    });

    it('does NOT send a limit param when limit is omitted', () => {
      service.loadTranscript();
      const req = httpMock.expectOne((r) =>
        r.url.endsWith('/api/v1/me/transcript'),
      );
      expect(req.request.params.has('limit')).toBe(false);
      req.flush(buildResponse());
    });

    it('sends limit param when provided', () => {
      service.loadTranscript(25);
      const req = httpMock.expectOne((r) =>
        r.url.endsWith('/api/v1/me/transcript'),
      );
      expect(req.request.params.get('limit')).toBe('25');
      req.flush(buildResponse());
    });

    it('transitions loading → success and maps items to camelCase', () => {
      expect(service.state().status).toBe('loading');
      service.loadTranscript();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/me/transcript'))
        .flush(buildResponse());
      const s = service.state();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.items.length).toBe(1);
        expect(s.items[0].entryId).toBe(ENTRY_ID);
        expect(s.items[0].scorePercent).toBe(80);
      }
    });

    it('exposes mapped items via the items() computed', () => {
      service.loadTranscript();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/me/transcript'))
        .flush(buildResponse());
      expect(service.items().length).toBe(1);
      expect(service.items()[0].kind).toBe('assessment');
    });

    it('preserves the BE newest-first ordering (no client re-sort)', () => {
      service.loadTranscript();
      httpMock.expectOne((r) => r.url.endsWith('/api/v1/me/transcript')).flush({
        items: [
          buildWire({ entry_id: 'newest' }),
          buildWire({ entry_id: 'middle' }),
          buildWire({ entry_id: 'oldest' }),
        ],
      });
      const items = service.items();
      expect(items[0].entryId).toBe('newest');
      expect(items[2].entryId).toBe('oldest');
    });

    it('null-safe: certification row keeps null score/pass (never 0%)', () => {
      service.loadTranscript();
      httpMock.expectOne((r) => r.url.endsWith('/api/v1/me/transcript')).flush({
        items: [
          buildWire({
            entry_id: 'cert-row',
            kind: 'certification',
            score_earned: null,
            score_possible: null,
            score_percent: null,
            passed: null,
            course_id: 'course-9',
          }),
        ],
      });
      const row = service.items()[0];
      expect(row.kind).toBe('certification');
      expect(row.scorePercent).toBeNull();
      expect(row.passed).toBeNull();
      expect(row.courseId).toBe('course-9');
    });

    it('renders an empty success state when items is empty', () => {
      service.loadTranscript();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/me/transcript'))
        .flush({ items: [] });
      const s = service.state();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.items.length).toBe(0);
      }
    });

    it('maps 401/403 to error_unauthorised', () => {
      service.loadTranscript();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/me/transcript'))
        .flush(null, { status: 403, statusText: 'Forbidden' });
      const s = service.state();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.me_transcript.list.error_unauthorised');
      }
    });

    it('maps 5xx to error_upstream', () => {
      service.loadTranscript();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/me/transcript'))
        .flush(null, { status: 503, statusText: 'Service Unavailable' });
      const s = service.state();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.me_transcript.list.error_upstream');
      }
    });

    it('maps other failures to error_generic', () => {
      service.loadTranscript();
      httpMock
        .expectOne((r) => r.url.endsWith('/api/v1/me/transcript'))
        .flush(null, { status: 418, statusText: "I'm a teapot" });
      const s = service.state();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.me_transcript.list.error_generic');
      }
    });
  });
});
