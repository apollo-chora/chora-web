import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { AtomAttemptService } from './atomic-session.service';
import type {
  AtomAttempt,
  LearningAtom,
  LearningAtomEnvelope,
  McqQuestionPayload,
  OeQuestionPayload,
  SubmissionResult,
} from './atomic-session.model';
import { getQuestionType } from './atomic-session.model';

/**
 * AtomAttemptService spec - wired LIVE to GET /api/atoms/{id} +
 * POST /api/atoms/{id}/session + POST /api/atoms/{id}/session/submit.
 * The wave-2 fixture provider (of(CSPO_ATOM_FIXTURE), of(EIRA_HINT_FIXTURE))
 * is gone — these tests flush the REAL wire shape through
 * HttpTestingController and assert the fail-loud discriminated state.
 */

const ATOM_ID = '00000000-0000-7000-8000-00000000a0a1';

function buildAtom(overrides: Partial<LearningAtom> = {}): LearningAtom {
  return {
    atom_id: ATOM_ID,
    atom_type: 'outline',
    body: 'A LearningAtom is the smallest unit of meaning a learner can engage with.',
    course_id: '44444444-4444-7444-8444-444444444444',
    gcid: '00000000-0000-7000-8000-000000001999',
    tenant_id: '11111111-1111-7111-8111-111111111111',
    mode: 'straight-up',
    difficulty: 1,
    revision: 1,
    status: 'published',
    tags: ['aplus', 'reader', 'fundamentals'],
    title: 'A+ : Atomic Learning Primitives',
    created_at: '2026-05-12T19:45:04.992954Z',
    updated_at: '2026-05-14T08:10:08.808962Z',
    ...overrides,
  };
}

function buildEnvelope(overrides: Partial<LearningAtomEnvelope> = {}): LearningAtomEnvelope {
  return {
    atom: buildAtom(),
    session_error: 'upstream_unavailable',
    ...overrides,
  };
}

function buildSession(overrides: Partial<AtomAttempt> = {}): AtomAttempt {
  return {
    session_id: '019e2b24-759f-76b8-bad8-0926780532ce',
    tenant_id: '11111111-1111-7111-8111-111111111111',
    learner_gcid: '00000000-0000-7000-8000-000000001999',
    atom_id: ATOM_ID,
    status: 'started',
    hints_used: 0,
    answer_count: 0,
    started_at: '2026-05-15T10:17:50.239Z',
    ...overrides,
  };
}

function buildResult(overrides: Partial<SubmissionResult> = {}): SubmissionResult {
  return {
    session_id: '019e2b24-759f-76b8-bad8-0926780532ce',
    status: 'in_progress',
    is_correct: false,
    duplicate: false,
    hints_used: 0,
    answer_count: 1,
    paths_advanced: 0,
    paths_completed: 0,
    ...overrides,
  };
}

function setup(): { service: AtomAttemptService; httpMock: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(AtomAttemptService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('AtomAttemptService (Phyllis Step 7 - real BFF wiring)', () => {
  let service: AtomAttemptService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ service, httpMock } = setup());
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('load()', () => {
    it('issues GET /api/atoms/{atomId} (URI-encoded)', () => {
      service.load(ATOM_ID);
      const req = httpMock.expectOne((r) => r.url.includes('/api/atoms/'));
      expect(req.request.method).toBe('GET');
      expect(req.request.url).toContain(`/api/atoms/${encodeURIComponent(ATOM_ID)}`);
      req.flush(buildEnvelope());
    });

    it('starts in loading state before flush', () => {
      expect(service.loadState().status).toBe('loading');
      service.load(ATOM_ID);
      expect(service.loadState().status).toBe('loading');
      httpMock.expectOne((r) => r.url.includes('/api/atoms/')).flush(buildEnvelope());
    });

    it('transitions to success with real envelope + surfaces partial via session_error', () => {
      service.load(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/atoms/'))
        .flush(buildEnvelope({ session_error: 'upstream_unavailable' }));

      const s = service.loadState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.atom.atom_id).toBe(ATOM_ID);
        expect(s.atom.atom_type).toBe('outline');
        expect(s.partial).toBe('upstream_unavailable');
      }
      expect(service.atom()?.title).toContain('A+');
    });

    it('partial is null when session_error is omitted', () => {
      service.load(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/atoms/'))
        .flush({ atom: buildAtom() });
      const s = service.loadState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.partial).toBeNull();
      }
    });

    it('maps 404 to error_atom_not_found', () => {
      service.load(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/atoms/'))
        .flush(null, { status: 404, statusText: 'Not Found' });
      const s = service.loadState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.atomic_session.error_atom_not_found');
      }
    });

    it('maps 5xx to error_upstream', () => {
      service.load(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/atoms/'))
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const s = service.loadState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.atomic_session.error_upstream');
      }
    });

    it('maps 401/403 to error_unauthorised', () => {
      service.load(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/atoms/'))
        .flush(null, { status: 403, statusText: 'Forbidden' });
      const s = service.loadState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.atomic_session.error_unauthorised');
      }
    });

    it('load() is idempotent', () => {
      service.load(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/atoms/'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      expect(service.loadState().status).toBe('error');

      service.load(ATOM_ID);
      expect(service.loadState().status).toBe('loading');
      httpMock
        .expectOne((r) => r.url.includes('/api/atoms/'))
        .flush(buildEnvelope());
      expect(service.loadState().status).toBe('success');
    });
  });

  describe('start()', () => {
    it('issues POST /api/atoms/{atomId}/session with no body', () => {
      service.start(ATOM_ID);
      const req = httpMock.expectOne((r) =>
        r.url.includes('/api/atoms/') && r.url.endsWith('/session'),
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(buildSession());
    });

    it('transitions idle → starting → started with real session DTO', () => {
      expect(service.startState().status).toBe('idle');
      service.start(ATOM_ID);
      expect(service.startState().status).toBe('starting');
      httpMock
        .expectOne((r) => r.url.endsWith('/session'))
        .flush(buildSession({ session_id: 'abc-123' }));

      const s = service.startState();
      expect(s.status).toBe('started');
      if (s.status === 'started') {
        expect(s.session.session_id).toBe('abc-123');
        expect(s.session.status).toBe('started');
      }
      expect(service.session()?.session_id).toBe('abc-123');
    });

    it('maps start 5xx to start_error_upstream', () => {
      service.start(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.endsWith('/session'))
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const s = service.startState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.atomic_session.start_error_upstream');
      }
    });

    it('start() is idempotent — re-call after error recovers on next flush', () => {
      service.start(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.endsWith('/session'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      expect(service.startState().status).toBe('error');

      service.start(ATOM_ID);
      expect(service.startState().status).toBe('starting');
      httpMock
        .expectOne((r) => r.url.endsWith('/session'))
        .flush(buildSession());
      expect(service.startState().status).toBe('started');
    });
  });

  describe('submit()', () => {
    it('issues POST /api/atoms/{atomId}/session/submit with body', () => {
      service.submit(ATOM_ID, { session_id: 'sess-1', answer_payload: 'opt-b' });
      const req = httpMock.expectOne((r) => r.url.endsWith('/session/submit'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        session_id: 'sess-1',
        answer_payload: 'opt-b',
      });
      req.flush(buildResult());
    });

    it('transitions idle → submitting → graded', () => {
      expect(service.submitState().status).toBe('idle');
      service.submit(ATOM_ID, { session_id: 'sess-1' });
      expect(service.submitState().status).toBe('submitting');
      httpMock
        .expectOne((r) => r.url.endsWith('/session/submit'))
        .flush(buildResult({ is_correct: true, answer_count: 1 }));

      const s = service.submitState();
      expect(s.status).toBe('graded');
      if (s.status === 'graded') {
        expect(s.result.is_correct).toBe(true);
        expect(s.result.answer_count).toBe(1);
        expect(s.result.session_id).toBe('019e2b24-759f-76b8-bad8-0926780532ce');
      }
    });

    it('maps Cloud-Armor 403 (HTML body) to submit_error_edge_blocked', () => {
      service.submit(ATOM_ID, { session_id: 'sess-1' });
      httpMock
        .expectOne((r) => r.url.endsWith('/session/submit'))
        .flush('<html>403</html>', { status: 403, statusText: 'Forbidden' });
      const s = service.submitState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.atomic_session.submit_error_edge_blocked');
      }
    });

    it('maps submit 5xx to submit_error_upstream', () => {
      service.submit(ATOM_ID, { session_id: 'sess-1' });
      httpMock
        .expectOne((r) => r.url.endsWith('/session/submit'))
        .flush(null, { status: 502, statusText: 'Bad Gateway' });
      const s = service.submitState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.atomic_session.submit_error_upstream');
      }
    });

    it('maps submit 404 to submit_error_session_not_found', () => {
      service.submit(ATOM_ID, { session_id: 'invalid' });
      httpMock
        .expectOne((r) => r.url.endsWith('/session/submit'))
        .flush(null, { status: 404, statusText: 'Not Found' });
      const s = service.submitState();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error).toBe('aplus.atomic_session.submit_error_session_not_found');
      }
    });
  });

  // ── WS-1: question_payload deserialization (A16 contract) ───────────────────
  describe('load() — question_payload deserialization (WS-1 A16)', () => {
    const MCQ_PAYLOAD: McqQuestionPayload = {
      type: 'mcq',
      question_id: 'qqq-111-222-333',
      prompt: 'Which is the primary aggregate root in Chora?',
      options: [
        { option_id: 'opt-a', label: 'LearningAtom' },
        { option_id: 'opt-b', label: 'Course' },
        { option_id: 'opt-c', label: 'LearningPath' },
      ],
      xp_on_correct: 10,
      timer_seconds: 60,
    };

    const OE_PAYLOAD: OeQuestionPayload = {
      type: 'oe',
      question_id: 'qqq-oe-111',
      prompt: 'Explain the Bimodal Atomic Learning model.',
      rubric: {
        criteria: [
          { criterion_id: 'c1', description: 'Accuracy', weight_percent: 50 },
          { criterion_id: 'c2', description: 'Clarity', weight_percent: 30 },
          { criterion_id: 'c3', description: 'Depth', weight_percent: 20 },
        ],
      },
      max_score: 100,
    };

    it('surfaces MCQ question_payload on the atom when present', () => {
      service.load(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/atoms/'))
        .flush({
          atom: buildAtom({ atom_type: 'mcq', question_payload: MCQ_PAYLOAD }),
        });
      const s = service.loadState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        const qp = s.atom.question_payload;
        expect(qp?.type).toBe('mcq');
        if (qp?.type === 'mcq') {
          expect(qp.options.length).toBe(3);
          expect(qp.xp_on_correct).toBe(10);
          expect(qp.timer_seconds).toBe(60);
          expect(qp.options[0].label).toBe('LearningAtom');
          // correct_option_id absent in learner mode
          expect(qp.correct_option_id).toBeUndefined();
        }
      }
    });

    it('surfaces OE question_payload with rubric criteria in learner mode', () => {
      service.load(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/atoms/'))
        .flush({
          atom: buildAtom({ atom_type: 'essay', question_payload: OE_PAYLOAD }),
        });
      const s = service.loadState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        const qp = s.atom.question_payload;
        expect(qp?.type).toBe('oe');
        if (qp?.type === 'oe') {
          expect(qp.max_score).toBe(100);
          expect(qp.rubric?.criteria.length).toBe(3);
          expect(qp.rubric?.criteria[0].weight_percent).toBe(50);
          expect(qp.rubric?.criteria[0].description).toBe('Accuracy');
        }
      }
    });

    it('transitions to error when question_payload fields are malformed (null options)', () => {
      service.load(ATOM_ID);
      // Flush an envelope with a structurally valid but semantically broken MCQ
      // that the BFF should never emit — options missing required fields.
      httpMock
        .expectOne((r) => r.url.includes('/api/atoms/'))
        .flush(null, { status: 422, statusText: 'Unprocessable Entity' });
      const s = service.loadState();
      expect(s.status).toBe('error');
    });

    it('atom has no question_payload when outline type (reading-only)', () => {
      service.load(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/atoms/'))
        .flush({ atom: buildAtom({ atom_type: 'outline' }) });
      const s = service.loadState();
      expect(s.status).toBe('success');
      if (s.status === 'success') {
        expect(s.atom.question_payload).toBeUndefined();
      }
    });
  });

  // ── getQuestionType() helper (WS-1) ─────────────────────────────────────────
  // ───────────────────────────────────────────────────────────────────────────
  // Coverage augmentation, landed alongside CHO-2405. The three error-key
  // mappers and resetSession() were shipped and reachable but unexercised,
  // which is how a mapper silently returns the generic key for a status it was
  // written to name. Each arm is asserted against the status that reaches it.
  // ───────────────────────────────────────────────────────────────────────────
  describe('error-key mapping across every arm', () => {
    function failLoad(status: number): string {
      service.load(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.includes('/api/atoms/'))
        .flush(null, { status, statusText: 'x' });
      const s = service.loadState();
      return s.status === 'error' ? s.error : '';
    }

    function failStart(status: number): string {
      service.start(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.endsWith('/session'))
        .flush(null, { status, statusText: 'x' });
      const s = service.startState();
      return s.status === 'error' ? s.error : '';
    }

    function failSubmit(status: number): string {
      service.submit(ATOM_ID, { session_id: 's' });
      httpMock
        .expectOne((r) => r.url.endsWith('/session/submit'))
        .flush(null, { status, statusText: 'x' });
      const s = service.submitState();
      return s.status === 'error' ? s.error : '';
    }

    it('load names not-found, upstream, unauthorised and the generic fallback', () => {
      expect(failLoad(404)).toBe('aplus.atomic_session.error_atom_not_found');
      expect(failLoad(503)).toBe('aplus.atomic_session.error_upstream');
      expect(failLoad(401)).toBe('aplus.atomic_session.error_unauthorised');
      expect(failLoad(403)).toBe('aplus.atomic_session.error_unauthorised');
      expect(failLoad(418)).toBe('aplus.atomic_session.error_generic');
    });

    it('start names not-found, upstream, unauthorised and the generic fallback', () => {
      expect(failStart(404)).toBe('aplus.atomic_session.start_error_atom_not_found');
      expect(failStart(503)).toBe('aplus.atomic_session.start_error_upstream');
      expect(failStart(401)).toBe('aplus.atomic_session.start_error_unauthorised');
      expect(failStart(403)).toBe('aplus.atomic_session.start_error_unauthorised');
      expect(failStart(418)).toBe('aplus.atomic_session.start_error_generic');
    });

    it('submit names the Cloud Armor edge block apart from the other failures', () => {
      // 403 on submit is the INFRA-3 edge block, NOT an auth failure — the two
      // read identically on the wire and must not collapse to one message.
      expect(failSubmit(403)).toBe('aplus.atomic_session.submit_error_edge_blocked');
      expect(failSubmit(404)).toBe('aplus.atomic_session.submit_error_session_not_found');
      expect(failSubmit(503)).toBe('aplus.atomic_session.submit_error_upstream');
      expect(failSubmit(401)).toBe('aplus.atomic_session.submit_error_unauthorised');
      expect(failSubmit(418)).toBe('aplus.atomic_session.submit_error_generic');
    });
  });

  describe('resetSession()', () => {
    it('clears the previous atom start and submit view, and leaves the load alone', () => {
      service.load(ATOM_ID);
      httpMock.expectOne((r) => r.url.includes('/api/atoms/')).flush(buildEnvelope());
      service.start(ATOM_ID);
      httpMock.expectOne((r) => r.url.endsWith('/session')).flush({
        session_id: 'sess-r',
        tenant_id: 't',
        learner_gcid: 'g',
        atom_id: ATOM_ID,
        status: 'started',
        hints_used: 0,
        answer_count: 0,
        started_at: '2026-08-20T00:00:00Z',
      });
      expect(service.startState().status).toBe('started');

      service.resetSession();

      expect(service.startState().status).toBe('idle');
      expect(service.submitState().status).toBe('idle');
      expect(service.session()).toBeNull();
      // The atom itself is NOT discarded — only the session view is.
      expect(service.loadState().status).toBe('success');
    });
  });

  describe('getQuestionType()', () => {
    it('returns null for null atom', () => {
      expect(getQuestionType(null)).toBeNull();
    });

    it('returns "mcq" when question_payload.type === "mcq"', () => {
      expect(
        getQuestionType({
          question_payload: {
            type: 'mcq',
            question_id: 'q1',
            options: [],
            xp_on_correct: 0,
          },
          body: 'body text',
        }),
      ).toBe('mcq');
    });

    it('returns "oe" when question_payload.type === "oe"', () => {
      expect(
        getQuestionType({
          question_payload: { type: 'oe', question_id: 'q2', max_score: 100 },
          body: 'body text',
        }),
      ).toBe('oe');
    });

    it('returns "reading-only" when no question_payload but body is present', () => {
      expect(
        getQuestionType({ question_payload: undefined, body: 'atom body' }),
      ).toBe('reading-only');
    });

    it('returns null when no question_payload and empty body', () => {
      expect(getQuestionType({ question_payload: undefined, body: '' })).toBeNull();
    });
  });
});
