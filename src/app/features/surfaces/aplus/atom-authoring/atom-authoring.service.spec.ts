import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import {
  AtomAuthoringService,
  isTerminalAiAssistStatus,
  AI_ASSIST_POLL_TIMEOUT_MS,
} from './atom-authoring.service';
import {
  toCreateRequest,
  toEditRequest,
  toWireCognitiveLevel,
  fromWireCognitiveLevel,
  type AcceptGenerationJobRequest,
  type AcceptGenerationJobResponse,
  type AiAssistJob,
  type AiAssistJobStatus,
  type AtomDraftLoadState,
  type AtomWithProjection,
  type CognitiveLevel,
  type GenerateAiDraftRequest,
  type GenerateBatchRequest,
  type McqContent,
  type OpenEndedContent,
  type Question,
  type QuestionGenerationJob,
  type QuestionSaveEnvelope,
  type QuestionTypeOption,
} from './atom-authoring.model';

/**
 * AtomAuthoringService — Phase C (CR Question Authoring) spec.
 *
 * Exercises the 9 NEW BFF-bound methods wired against the BE-locked
 * `chora-contracts/openapi/creation-questions.yaml` + design doc
 * `docs/m14/cr-question-authoring-design-2026-05-15.md`. Each method
 * is verified for URL + verb + body + headers + 200/204 mapping using
 * the sync flush pattern (matches `me-mana.service.spec.ts`).
 *
 * The 9th method (`deleteQuestion`) is wired against a DELETE route
 * that does NOT yet exist server-side (BE D2 currently blocks it).
 * The FE→BE ask A18 is filed in `handoff-fe-to-be-service-2026-05-14.md`
 * — per `feedback_no_stubs_real_wiring` the FE makes the real call
 * and fails loud with 404 until BE lands the route.
 */

const ATOM_ID = '00000000-0000-7000-8000-00000000a0a1';
const QUESTION_ID = '11111111-1111-7111-8111-1111111111aa';
const JOB_ID = 'job-019e2b24-759f-76b8-bad8-0926780532ce';
const IDEMP_KEY = 'idemp-abc-123';

function buildQuestionTypes(): readonly QuestionTypeOption[] {
  return [
    { code: 'mcq', label_en: 'Multiple Choice', label_zh: null, enabled: true, scope: 'phyllis' },
    { code: 'oe', label_en: 'Open-Ended', label_zh: null, enabled: true, scope: 'phyllis' },
    { code: 'reserved_short_answer', label_en: 'Short Answer', label_zh: null, enabled: false, scope: 'reserved' },
    { code: 'reserved_true_false', label_en: 'True / False', label_zh: null, enabled: false, scope: 'reserved' },
  ];
}

function buildQuestion(overrides: Partial<Question> = {}): Question {
  return {
    question_id: QUESTION_ID,
    atom_id: ATOM_ID,
    tenant_id: '22222222-2222-7222-8222-222222222222',
    type: 'mcq',
    prompt: 'Which is a Scrum role?',
    revision: 1,
    latest_revision_id: 'rev-aaaa-bbbb',
    created_at: '2026-05-15T10:00:00Z',
    updated_at: '2026-05-15T10:00:00Z',
    mcq_payload: {
      options: [
        { option_id: 'opt_1', label: 'Product Owner', is_correct: true, explainer: 'PO owns backlog priority' },
        { option_id: 'opt_2', label: 'Project Manager', is_correct: false, explainer: 'Not a Scrum role' },
      ],
    },
    ...overrides,
  };
}

function buildSaveEnvelope(): QuestionSaveEnvelope {
  return {
    question: buildQuestion(),
    atom_revision: { revision_id: 'rev-atom-001', revision_number: 2 },
  };
}

function buildJob(overrides: Partial<QuestionGenerationJob> = {}): QuestionGenerationJob {
  return {
    job_id: JOB_ID,
    atom_id: ATOM_ID,
    job_type: 'ai_draft',
    status: 'pending',
    created_at: '2026-05-15T10:00:00Z',
    updated_at: '2026-05-15T10:00:00Z',
    estimated_mana_cost: 10,
    ...overrides,
  };
}

function buildAiAssistJob(overrides: Partial<AiAssistJob> = {}): AiAssistJob {
  return {
    job_id: JOB_ID,
    status: 'QUEUED',
    question_type: 'mcq',
    attempt_count: 0,
    quality_warning: false,
    created_at: '2026-05-17T10:00:00Z',
    updated_at: '2026-05-17T10:00:00Z',
    ...overrides,
  };
}

function buildMcqContent(): McqContent {
  return {
    kind: 'manual',
    type: 'mcq',
    prompt: 'What is 2+2?',
    mcq_payload: {
      options: [
        { option_id: 'opt_a', label: '4', is_correct: true, explainer: 'Correct' },
        { option_id: 'opt_b', label: '5', is_correct: false, explainer: 'Off by one' },
      ],
    },
  };
}

function buildOeContent(): OpenEndedContent {
  return {
    kind: 'manual',
    type: 'oe',
    prompt: 'Explain story points.',
    oe_payload: {
      model_answer: 'Story points capture complexity + risk + effort.',
      rubric: [
        { criterion_id: 'c1', title: 'Captures complexity', weight: 0.4 },
      ],
    },
  };
}

function setup(): { service: AtomAuthoringService; httpMock: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(AtomAuthoringService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('AtomAuthoringService — Phase C CR Question Authoring', () => {
  let service: AtomAuthoringService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    ({ service, httpMock } = setup());
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ───────────────────────────────────────────────────────────────────
  // Wire serializers (pure functions, no HTTP)
  // ───────────────────────────────────────────────────────────────────
  describe('toCreateRequest()', () => {
    it('serializes MCQ content + drops the FE-only `kind` tag', () => {
      const c = buildMcqContent();
      const out = toCreateRequest(c);
      expect(out).toEqual({
        type: 'mcq',
        prompt: 'What is 2+2?',
        mcq_payload: c.mcq_payload,
      });
      expect('kind' in out).toBe(false);
    });

    it('serializes OE content + drops the FE-only `kind` tag', () => {
      const c = buildOeContent();
      const out = toCreateRequest(c);
      expect(out).toEqual({
        type: 'oe',
        prompt: 'Explain story points.',
        oe_payload: c.oe_payload,
      });
      expect('kind' in out).toBe(false);
    });

    it('preserves empty `rubric: []` in OE wire body (BE ack 11d5544e)', () => {
      // BE ack commit 11d5544e + image pin :44a097a (smoke 2026-05-17 ~04:47)
      // — chora-creation now decodes `rubric` as a flat array per OpenAPI.
      // Empty array MUST round-trip; the c52d9e79 strip workaround is dropped.
      const c: OpenEndedContent = {
        kind: 'manual',
        type: 'oe',
        prompt: 'Explain story points.',
        oe_payload: {
          model_answer: 'Story points capture complexity + risk + effort.',
          rubric: [],
        },
      };
      const out = toCreateRequest(c);
      expect(out.oe_payload).toBeDefined();
      expect(out.oe_payload?.rubric).toEqual([]);
    });

    it('still omits null min/max response chars + grader_tier (BE not yet acked)', () => {
      // These omissions are independent of the rubric ack — keep stripping
      // until BE confirms it accepts null for these optional fields.
      const c: OpenEndedContent = {
        kind: 'manual',
        type: 'oe',
        prompt: 'Explain story points.',
        oe_payload: {
          model_answer: 'Story points capture complexity + risk + effort.',
          rubric: [{ criterion_id: 'c1', title: 'Captures complexity', weight: 0.4 }],
          min_response_chars: null,
          max_response_chars: null,
          grader_tier: null,
        },
      };
      const out = toCreateRequest(c);
      expect(out.oe_payload).toBeDefined();
      expect('min_response_chars' in (out.oe_payload as object)).toBe(false);
      expect('max_response_chars' in (out.oe_payload as object)).toBe(false);
      expect('grader_tier' in (out.oe_payload as object)).toBe(false);
    });
  });

  describe('toEditRequest()', () => {
    it('serializes MCQ content to partial-edit shape', () => {
      const c = buildMcqContent();
      const out = toEditRequest(c);
      expect(out).toEqual({ prompt: 'What is 2+2?', mcq_payload: c.mcq_payload });
    });

    it('serializes OE content to partial-edit shape', () => {
      const c = buildOeContent();
      const out = toEditRequest(c);
      expect(out).toEqual({ prompt: 'Explain story points.', oe_payload: c.oe_payload });
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // Cognitive level wire mapping (E2E-BE-COGNITIVE-LEVEL)
  // FE labels follow the revised Bloom names (Remembering / Understanding /
  // Applying / Analyzing / Evaluating / Creating). BE accepts the older
  // Bloom lowercase enum (knowledge / comprehension / application /
  // analysis / synthesis / evaluation) per
  // `chora-contracts/openapi/creation-admin.yaml#CognitiveLevel`.
  // ───────────────────────────────────────────────────────────────────
  describe('toWireCognitiveLevel() — FE revised Bloom → BE older Bloom', () => {
    it('maps revised → older Bloom canonically', () => {
      expect(toWireCognitiveLevel('remembering')).toBe('knowledge');
      expect(toWireCognitiveLevel('understanding')).toBe('comprehension');
      expect(toWireCognitiveLevel('applying')).toBe('application');
      expect(toWireCognitiveLevel('analyzing')).toBe('analysis');
      expect(toWireCognitiveLevel('evaluating')).toBe('evaluation');
      expect(toWireCognitiveLevel('creating')).toBe('synthesis');
    });
  });

  describe('fromWireCognitiveLevel() — BE older Bloom → FE revised Bloom', () => {
    it('maps each BE enum value back to a FE label', () => {
      expect(fromWireCognitiveLevel('knowledge')).toBe('remembering');
      expect(fromWireCognitiveLevel('comprehension')).toBe('understanding');
      expect(fromWireCognitiveLevel('application')).toBe('applying');
      expect(fromWireCognitiveLevel('analysis')).toBe('analyzing');
      expect(fromWireCognitiveLevel('evaluation')).toBe('evaluating');
      expect(fromWireCognitiveLevel('synthesis')).toBe('creating');
    });

    it('returns null for unknown wire values (defensive)', () => {
      expect(fromWireCognitiveLevel('bogus')).toBeNull();
      expect(fromWireCognitiveLevel(undefined)).toBeNull();
      expect(fromWireCognitiveLevel(null)).toBeNull();
    });

    it('round-trips every FE label through the wire and back', () => {
      const labels: readonly CognitiveLevel[] = [
        'remembering',
        'understanding',
        'applying',
        'analyzing',
        'evaluating',
        'creating',
      ];
      for (const fe of labels) {
        const wire = toWireCognitiveLevel(fe);
        expect(fromWireCognitiveLevel(wire)).toBe(fe);
      }
    });
  });

  describe('createAtom() — cognitive_level wire body', () => {
    it('sends cognitive_level: "application" when FE picker = "applying"', () => {
      service
        .createAtom({
          atom_type: 'MULTIPLE_CHOICE',
          title: 'A',
          locale: 'en',
          stem: 'Stub stem',
          cognitive_level: 'application',
        })
        .subscribe();
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/api/atoms'),
      );
      expect(req.request.body.cognitive_level).toBe('application');
      req.flush({ atom: { atomId: ATOM_ID } });
    });

    it('omits cognitive_level when not provided', () => {
      service
        .createAtom({
          atom_type: 'MULTIPLE_CHOICE',
          title: 'A',
          locale: 'en',
          stem: 'Stub stem',
        })
        .subscribe();
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/api/atoms'),
      );
      expect('cognitive_level' in req.request.body).toBe(false);
      req.flush({ atom: { atomId: ATOM_ID } });
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // createAtom() — stem wire body (ADR-156 Phase 1 Decision #3)
  // BE deploy `9f63ae00` (HTTP handlers landed 2026-05-17) requires
  // top-level `stem TEXT NOT NULL ≥1 char after trim` per
  // `chora-contracts/openapi/creation-admin.yaml#CreateAtomRequest`
  // (required: [question_type, stem, locale]). Without stem the BE
  // returns 400 CREATION_INVALID_ATOM and the entire authoring flow
  // breaks on prod.
  // ───────────────────────────────────────────────────────────────────
  describe('createAtom() — stem wire body (ADR-156)', () => {
    it('sends `stem` on the POST body when provided', () => {
      service
        .createAtom({
          atom_type: 'SHORT_ANSWER',
          title: 'Re-smoke test',
          locale: 'en',
          stem: 'Define moment of inertia and explain why it matters.',
        })
        .subscribe();
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/api/atoms'),
      );
      expect(req.request.body.stem).toBe(
        'Define moment of inertia and explain why it matters.',
      );
      req.flush({ atom: { atomId: ATOM_ID } });
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // loadQuestionTypes() — Phase D feeder
  // ───────────────────────────────────────────────────────────────────
  describe('loadQuestionTypes()', () => {
    it('GETs /api/atoms/question-types and unwraps the {items} envelope', () => {
      let result: readonly QuestionTypeOption[] | undefined;
      service.loadQuestionTypes().subscribe((items) => {
        result = items;
      });
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/atoms/question-types'));
      expect(req.request.method).toBe('GET');
      req.flush({ items: buildQuestionTypes() });
      expect(result?.length).toBe(4);
      expect(result?.[0].code).toBe('mcq');
      expect(result?.[0].label_en).toBe('Multiple Choice');
      expect(result?.[0].scope).toBe('phyllis');
      expect(result?.[0].enabled).toBe(true);
      expect(result?.[2].enabled).toBe(false);
      expect(result?.[2].scope).toBe('reserved');
    });

  });

  // ───────────────────────────────────────────────────────────────────
  // publishAtom() — Phase K
  // ───────────────────────────────────────────────────────────────────
  describe('publishAtom()', () => {
    it('POSTs /api/atoms/{id}/publish and returns the LearningAtom (bare shape)', () => {
      let result: { status: string; atomId: string } | undefined;
      service.publishAtom(ATOM_ID).subscribe((atom) => {
        result = atom as { status: string; atomId: string };
      });
      const req = httpMock.expectOne(
        (r) => r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}/publish`),
      );
      expect(req.request.method).toBe('POST');
      req.flush({
        atomId: ATOM_ID,
        title: 'A',
        status: 'PUBLISHED',
      });
      expect(result?.status).toBe('PUBLISHED');
      expect(result?.atomId).toBe(ATOM_ID);
    });

    it('also unwraps the gateway aggregator {atom, session_error?} envelope (defensive)', () => {
      let result: { status: string } | undefined;
      service.publishAtom(ATOM_ID).subscribe((atom) => {
        result = atom as { status: string };
      });
      const req = httpMock.expectOne(
        (r) => r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}/publish`),
      );
      req.flush({
        atom: { atomId: ATOM_ID, status: 'PUBLISHED' },
        session_error: 'upstream_unavailable',
      });
      expect(result?.status).toBe('PUBLISHED');
    });

    it('propagates 404 errors so the component can show "atom not found"', () => {
      let errStatus: number | undefined;
      service.publishAtom(ATOM_ID).subscribe({
        error: (err: { status: number }) => {
          errStatus = err.status;
        },
      });
      const req = httpMock.expectOne(
        (r) => r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}/publish`),
      );
      req.flush(
        { error: { code: 'ATOM_NOT_FOUND', message: 'no such atom' } },
        { status: 404, statusText: 'Not Found' },
      );
      expect(errStatus).toBe(404);
    });

    it('propagates 409 CREATION_ATOM_NO_PUBLISHED_REVISION (A22 sub-code)', () => {
      let errStatus: number | undefined;
      let errCode: string | undefined;
      service.publishAtom(ATOM_ID).subscribe({
        error: (err: { status: number; error: { error: { code: string } } }) => {
          errStatus = err.status;
          errCode = err.error?.error?.code;
        },
      });
      const req = httpMock.expectOne(
        (r) => r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}/publish`),
      );
      req.flush(
        {
          error: {
            code: 'CREATION_ATOM_NO_PUBLISHED_REVISION',
            message: 'no published rev',
          },
        },
        { status: 409, statusText: 'Conflict' },
      );
      expect(errStatus).toBe(409);
      expect(errCode).toBe('CREATION_ATOM_NO_PUBLISHED_REVISION');
    });

    it('propagates 409 CREATION_ATOM_ARCHIVED (A22 sub-code)', () => {
      let errStatus: number | undefined;
      let errCode: string | undefined;
      service.publishAtom(ATOM_ID).subscribe({
        error: (err: { status: number; error: { error: { code: string } } }) => {
          errStatus = err.status;
          errCode = err.error?.error?.code;
        },
      });
      const req = httpMock.expectOne(
        (r) => r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}/publish`),
      );
      req.flush(
        {
          error: {
            code: 'CREATION_ATOM_ARCHIVED',
            message: 'atom is archived',
          },
        },
        { status: 409, statusText: 'Conflict' },
      );
      expect(errStatus).toBe(409);
      expect(errCode).toBe('CREATION_ATOM_ARCHIVED');
    });

    it('idempotent re-publish returns 200 with current_revision_number (A22)', () => {
      let captured: Record<string, unknown> | undefined;
      service.publishAtom(ATOM_ID).subscribe((atom) => {
        captured = atom;
      });
      const req = httpMock.expectOne(
        (r) => r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}/publish`),
      );
      req.flush({
        atom_id: ATOM_ID,
        status: 'PUBLISHED',
        current_revision_id: 'rev-uuid-7',
        current_revision_number: 7,
      });
      expect(captured?.['current_revision_number']).toBe(7);
      expect(captured?.['status']).toBe('PUBLISHED');
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // loadAtomWithProjection()
  // ───────────────────────────────────────────────────────────────────
  describe('loadAtomWithProjection()', () => {
    it('GETs /api/atoms/{id} and exposes the {atom, question} projection', () => {
      let result: AtomWithProjection | undefined;
      service.loadAtomWithProjection(ATOM_ID).subscribe((p) => {
        result = p;
      });
      const req = httpMock.expectOne((r) => r.url.includes(`/api/atoms/${encodeURIComponent(ATOM_ID)}`));
      expect(req.request.method).toBe('GET');
      req.flush({
        atom: {
          atomId: ATOM_ID,
          title: 'A',
          body: 'B',
          courseCode: 'C',
          topic: 'T',
          cognitiveLevel: 'applying',
          tags: [],
          prerequisites: [],
          objectives: [],
          state: 'DRAFT',
        },
        question: buildQuestion(),
      });
      expect(result?.atom.atomId).toBe(ATOM_ID);
      expect(result?.question?.question_id).toBe(QUESTION_ID);
    });

    it('normalises a missing `question` field to null', () => {
      let result: AtomWithProjection | undefined;
      service.loadAtomWithProjection(ATOM_ID).subscribe((p) => {
        result = p;
      });
      httpMock.expectOne((r) => r.url.includes(`/api/atoms/${encodeURIComponent(ATOM_ID)}`)).flush({
        atom: {
          atomId: ATOM_ID,
          title: '',
          body: '',
          courseCode: '',
          topic: '',
          cognitiveLevel: 'applying',
          tags: [],
          prerequisites: [],
          objectives: [],
          state: 'DRAFT',
        },
      });
      expect(result?.question).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // createQuestion()  POST /api/atoms/{id}/questions
  // ───────────────────────────────────────────────────────────────────
  describe('createQuestion()', () => {
    it('POSTs the serialised AtomContent body (MCQ) + returns the save envelope', () => {
      const c = buildMcqContent();
      let result: QuestionSaveEnvelope | undefined;
      service.createQuestion(ATOM_ID, toCreateRequest(c)).subscribe((env) => {
        result = env;
      });
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}/questions`),
      );
      expect(req.request.body).toEqual({
        type: 'mcq',
        prompt: 'What is 2+2?',
        mcq_payload: c.mcq_payload,
      });
      req.flush(buildSaveEnvelope());
      expect(result?.question.question_id).toBe(QUESTION_ID);
      expect(result?.atom_revision.revision_number).toBe(2);
    });

    it('POSTs OE shape when content.type=oe', () => {
      const c = buildOeContent();
      service.createQuestion(ATOM_ID, toCreateRequest(c)).subscribe();
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/questions'),
      );
      expect(req.request.body.type).toBe('oe');
      expect(req.request.body.oe_payload.model_answer).toContain('Story points');
      req.flush(buildSaveEnvelope());
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // editQuestion()  PATCH /api/atoms/{id}/questions/{q_id}
  // ───────────────────────────────────────────────────────────────────
  describe('editQuestion()', () => {
    it('PATCHes the partial-edit body + returns the new envelope', () => {
      let result: QuestionSaveEnvelope | undefined;
      service
        .editQuestion(ATOM_ID, QUESTION_ID, { prompt: 'Updated stem' })
        .subscribe((env) => {
          result = env;
        });
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'PATCH' &&
          r.url.endsWith(
            `/api/atoms/${encodeURIComponent(ATOM_ID)}/questions/${encodeURIComponent(QUESTION_ID)}`,
          ),
      );
      expect(req.request.body).toEqual({ prompt: 'Updated stem' });
      req.flush(buildSaveEnvelope());
      expect(result?.question.question_id).toBe(QUESTION_ID);
    });

    it('omits absent fields from the PATCH body', () => {
      service
        .editQuestion(ATOM_ID, QUESTION_ID, { mcq_payload: { options: [] } })
        .subscribe();
      const req = httpMock.expectOne((r) => r.method === 'PATCH');
      expect(req.request.body).toEqual({ mcq_payload: { options: [] } });
      expect('prompt' in req.request.body).toBe(false);
      expect('oe_payload' in req.request.body).toBe(false);
      req.flush(buildSaveEnvelope());
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // deleteQuestion()  DELETE /api/atoms/{id}/questions/{q_id}
  //   Wired against the BE A18 ask — fails loud with 404 until BE lands.
  // ───────────────────────────────────────────────────────────────────
  describe('deleteQuestion()', () => {
    it('DELETEs /api/atoms/{id}/questions/{q_id} (no body)', () => {
      service.deleteQuestion(ATOM_ID, QUESTION_ID).subscribe();
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'DELETE' &&
          r.url.endsWith(
            `/api/atoms/${encodeURIComponent(ATOM_ID)}/questions/${encodeURIComponent(QUESTION_ID)}`,
          ),
      );
      expect(req.request.body).toBeNull();
      req.flush(null, { status: 204, statusText: 'No Content' });
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // generateModelAnswer()  POST .../questions/{q_id}/ai-model-answer-jobs
  // ───────────────────────────────────────────────────────────────────
  describe('generateModelAnswer() — path 2 (5 mana)', () => {
    it('POSTs to /ai-model-answer-jobs with Idempotency-Key header', () => {
      let result: QuestionGenerationJob | undefined;
      service
        .generateModelAnswer(ATOM_ID, QUESTION_ID, { question_id: QUESTION_ID }, IDEMP_KEY)
        .subscribe((job) => {
          result = job;
        });
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'POST' &&
          r.url.endsWith(
            `/questions/${encodeURIComponent(QUESTION_ID)}/ai-model-answer-jobs`,
          ),
      );
      expect(req.request.headers.get('Idempotency-Key')).toBe(IDEMP_KEY);
      expect(req.request.body).toEqual({ question_id: QUESTION_ID });
      req.flush(buildJob({ job_type: 'ai_model_answer' }));
      expect(result?.job_id).toBe(JOB_ID);
      expect(result?.job_type).toBe('ai_model_answer');
    });

    it('supports regenerate=true flag', () => {
      service
        .generateModelAnswer(
          ATOM_ID,
          QUESTION_ID,
          { question_id: QUESTION_ID, regenerate: true },
          IDEMP_KEY,
        )
        .subscribe();
      const req = httpMock.expectOne((r) => r.method === 'POST');
      expect(req.request.body.regenerate).toBe(true);
      req.flush(buildJob({ job_type: 'ai_model_answer' }));
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // CHO-1826 U4 — manual authoring session + inline-manual accept
  // ───────────────────────────────────────────────────────────────────
  describe('createManualJob() — CHO-1826 U4 manual session', () => {
    it('POSTs {type:"manual"} to /question-jobs and returns the succeeded manual_draft job', () => {
      let result: QuestionGenerationJob | undefined;
      service.createManualJob(ATOM_ID).subscribe((job) => {
        result = job;
      });
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'POST' &&
          r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}/question-jobs`),
      );
      // No LLM, no mana, no source files — just opens the session.
      expect(req.request.body).toEqual({ type: 'manual' });
      req.flush(buildJob({ job_type: 'manual_draft', status: 'succeeded' }));
      expect(result?.job_id).toBe(JOB_ID);
      expect(result?.job_type).toBe('manual_draft');
      expect(result?.status).toBe('succeeded');
    });
  });

  describe('acceptGenerationJob() — CHO-1826 U4 inline manual candidate', () => {
    it('serializes an INLINE manual MCQ candidate (no draft_id, type set) in the accept body', () => {
      const request: AcceptGenerationJobRequest = {
        accepted_candidates: [
          {
            type: 'mcq',
            prompt_override: 'What is 2+2?',
            mcq_payload_override: {
              options: [
                { option_id: 'opt_a', label: '4', is_correct: true, explainer: 'Correct' },
                { option_id: 'opt_b', label: '5', is_correct: false, explainer: 'Off by one' },
              ],
            },
          },
        ],
      };
      service.acceptGenerationJob(ATOM_ID, JOB_ID, request).subscribe();
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'POST' &&
          r.url.endsWith(
            `/api/atoms/${encodeURIComponent(ATOM_ID)}/question-jobs/${encodeURIComponent(JOB_ID)}/accept`,
          ),
      );
      const cand = (req.request.body as AcceptGenerationJobRequest).accepted_candidates[0];
      expect(cand.draft_id).toBeUndefined();
      expect(cand.type).toBe('mcq');
      expect(cand.prompt_override).toBe('What is 2+2?');
      req.flush({ persisted: [], mana_debited: 0 } as AcceptGenerationJobResponse);
    });

    it('still serializes an AI draft-backed candidate (draft_id, no type) — interleave-safe', () => {
      const request: AcceptGenerationJobRequest = {
        accepted_candidates: [{ draft_id: 'draft-xyz', prompt_override: 'edited' }],
      };
      service.acceptGenerationJob(ATOM_ID, JOB_ID, request).subscribe();
      const req = httpMock.expectOne((r) => r.method === 'POST');
      const cand = (req.request.body as AcceptGenerationJobRequest).accepted_candidates[0];
      expect(cand.draft_id).toBe('draft-xyz');
      expect(cand.type).toBeUndefined();
      req.flush({ persisted: [], mana_debited: 0 } as AcceptGenerationJobResponse);
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // generateQuestionJob()  POST .../question-jobs
  // ───────────────────────────────────────────────────────────────────
  describe('generateQuestionJob() — path 3 ai-draft + path 4 batch', () => {
    it('path 3 (10 mana) — POSTs JSON body keyed on `type` with Idempotency-Key', () => {
      const request: GenerateAiDraftRequest = {
        job_type: 'ai_draft',
        question_type: 'mcq',
        prompt: 'Sprint planning facilitation',
        difficulty: 3,
        count: 2,
      };
      let result: QuestionGenerationJob | undefined;
      service.generateQuestionJob(ATOM_ID, request, IDEMP_KEY).subscribe((job) => {
        result = job;
      });
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'POST' &&
          r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}/question-jobs`),
      );
      expect(req.request.headers.get('Idempotency-Key')).toBe(IDEMP_KEY);
      // Wire contract: the ai_draft JSON body keys the discriminant on `type`
      // (questionJobReq, DisallowUnknownFields) — NOT the FE-model `job_type`,
      // which is only the multipart batch `settings` field.
      expect(req.request.body).toEqual({
        type: 'ai_draft',
        question_type: 'mcq',
        prompt: 'Sprint planning facilitation',
        difficulty: 3,
        count: 2,
      });
      req.flush(buildJob({ job_type: 'ai_draft' }));
      expect(result?.job_type).toBe('ai_draft');
    });

    it('path 3 — forwards image_for_stem/image_for_answer into the ai_draft body when opted in (CHO-1826 Gap #4)', () => {
      const request: GenerateAiDraftRequest = {
        job_type: 'ai_draft',
        question_type: 'mcq',
        prompt: 'Photosynthesis in plants',
        difficulty: 3,
        count: 1,
        image_for_stem: true,
        image_for_answer: true,
      };
      service.generateQuestionJob(ATOM_ID, request, IDEMP_KEY).subscribe();
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'POST' &&
          r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}/question-jobs`),
      );
      expect(req.request.body).toEqual({
        type: 'ai_draft',
        question_type: 'mcq',
        prompt: 'Photosynthesis in plants',
        difficulty: 3,
        count: 1,
        image_for_stem: true,
        image_for_answer: true,
      });
      req.flush(buildJob({ job_type: 'ai_draft' }));
    });

    it('path 3 — omits image flags from the ai_draft body when the author did not opt in (byte-stable legacy)', () => {
      const request: GenerateAiDraftRequest = {
        job_type: 'ai_draft',
        question_type: 'mcq',
        prompt: 'No images here',
        difficulty: 2,
      };
      service.generateQuestionJob(ATOM_ID, request, IDEMP_KEY).subscribe();
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'POST' &&
          r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}/question-jobs`),
      );
      expect('image_for_stem' in (req.request.body as object)).toBe(false);
      expect('image_for_answer' in (req.request.body as object)).toBe(false);
      req.flush(buildJob({ job_type: 'ai_draft' }));
    });

    it('path 4 (50+5×n) — POSTs multipart: file + settings JSON part (backend contract)', () => {
      const file = new File(['source material'], 'topic.pdf', { type: 'application/pdf' });
      const request: GenerateBatchRequest = {
        job_type: 'batch_source_material',
        file,
        question_type: 'mcq',
        question_count: 10,
        difficulty: 3,
        grounding_mode: 'strict',
        context: 'Chapter 4 only',
      };
      let result: QuestionGenerationJob | undefined;
      service.generateQuestionJob(ATOM_ID, request, IDEMP_KEY).subscribe((job) => {
        result = job;
      });
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'POST' &&
          r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}/question-jobs`),
      );
      expect(req.request.headers.get('Idempotency-Key')).toBe(IDEMP_KEY);
      const form = req.request.body as FormData;
      expect(form instanceof FormData).toBe(true);
      expect(form.get('file')).toBeInstanceOf(File);
      // The backend reads a single `settings` JSON part (NOT separate fields).
      const settings = JSON.parse(form.get('settings') as string);
      expect(settings.job_type).toBe('batch_source_material');
      expect(settings.question_type).toBe('mcq');
      expect(settings.count).toBe(10);
      expect(settings.difficulty).toBe(3);
      expect(settings.grounding_mode).toBe('strict');
      // Growth-Edge targeting moved off the author path — never serialised now.
      expect('target_growth_edges' in settings).toBe(false);
      expect(settings.context).toBe('Chapter 4 only');
      req.flush(buildJob({ job_type: 'batch_source_material' }));
      expect(result?.job_type).toBe('batch_source_material');
    });

    it('path 4 (CHO-1819 mixed) — type_plan flips question_type to "mixed" + count to the sum', () => {
      const file = new File(['source material'], 'topic.pdf', { type: 'application/pdf' });
      const request: GenerateBatchRequest = {
        job_type: 'batch_source_material',
        file,
        question_type: 'mcq',
        question_count: 0,
        type_plan: [
          { question_type: 'mcq', count: 8, max_images: 3 },
          { question_type: 'oe', count: 2, max_images: 1 },
        ],
        difficulty: 3,
        grounding_mode: 'strict',
      };
      service.generateQuestionJob(ATOM_ID, request, IDEMP_KEY).subscribe();
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'POST' &&
          r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}/question-jobs`),
      );
      const form = req.request.body as FormData;
      const settings = JSON.parse(form.get('settings') as string);
      // Mixed: question_type "mixed", count == sum(quota.count), typed type_plan.
      expect(settings.question_type).toBe('mixed');
      expect(settings.count).toBe(10);
      expect(settings.type_plan).toEqual([
        { question_type: 'mcq', count: 8, max_images: 3 },
        { question_type: 'oe', count: 2, max_images: 1 },
      ]);
      req.flush(buildJob({ job_type: 'batch_source_material' }));
    });

    it('path 4 (CHO-1825) — forced per-type image flags ride settings.type_plan', () => {
      const file = new File(['source'], 'topic.pdf', { type: 'application/pdf' });
      const request: GenerateBatchRequest = {
        job_type: 'batch_source_material',
        file,
        question_type: 'mcq',
        question_count: 0,
        type_plan: [
          { question_type: 'mcq', count: 2, max_images: 0, image_for_stem: true },
          { question_type: 'oe', count: 1, max_images: 0, image_for_answer: true },
        ],
        difficulty: 3,
        grounding_mode: 'starting_point',
      };
      service.generateQuestionJob(ATOM_ID, request, IDEMP_KEY).subscribe();
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'POST' &&
          r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}/question-jobs`),
      );
      const settings = JSON.parse((req.request.body as FormData).get('settings') as string);
      // Forced flags emitted only on the toggled part (proto3-omit-false parity).
      expect(settings.type_plan).toEqual([
        { question_type: 'mcq', count: 2, max_images: 0, image_for_stem: true },
        { question_type: 'oe', count: 1, max_images: 0, image_for_answer: true },
      ]);
      req.flush(buildJob({ job_type: 'batch_source_material' }));
    });

    it('path 4 (1c multi-file) — POSTs repeated files parts + rubric_file + settings', () => {
      // Lane 1c (CHO-1703 / ADR-180 D7): contract field names are `files`
      // (repeated, 1..5) + optional `rubric_file` + `settings`. The new
      // shape must NOT carry the legacy single-file `file` part.
      const f1 = new File(['exam paper'], 'paper.pdf', { type: 'application/pdf' });
      const f2 = new File(['diagram bytes'], 'diagram.png', { type: 'image/png' });
      const rubric = new File(['mark scheme'], 'scheme.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const request: GenerateBatchRequest = {
        job_type: 'batch_source_material',
        files: [f1, f2],
        rubric_file: rubric,
        question_type: 'oe',
        question_count: 4,
        difficulty: 2,
        grounding_mode: 'starting_point',
      };
      service.generateQuestionJob(ATOM_ID, request, IDEMP_KEY).subscribe();
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'POST' &&
          r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}/question-jobs`),
      );
      const form = req.request.body as FormData;
      expect(form instanceof FormData).toBe(true);
      const files = form.getAll('files');
      expect(files.length).toBe(2);
      expect((files[0] as File).name).toBe('paper.pdf');
      expect((files[1] as File).name).toBe('diagram.png');
      expect((form.get('rubric_file') as File).name).toBe('scheme.docx');
      expect(form.get('file')).toBeNull();
      const settings = JSON.parse(form.get('settings') as string);
      expect(settings.job_type).toBe('batch_source_material');
      expect(settings.question_type).toBe('oe');
      expect(settings.count).toBe(4);
      req.flush(buildJob({ job_type: 'batch_source_material' }));
    });

    it('path 4 (1c multi-file) — omits rubric_file part when none supplied', () => {
      const f1 = new File(['only source'], 'notes.md', { type: 'text/markdown' });
      const request: GenerateBatchRequest = {
        job_type: 'batch_source_material',
        files: [f1],
        question_type: 'mcq',
        question_count: 3,
        difficulty: 3,
        grounding_mode: 'strict',
      };
      service.generateQuestionJob(ATOM_ID, request, IDEMP_KEY).subscribe();
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'POST' &&
          r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}/question-jobs`),
      );
      const form = req.request.body as FormData;
      expect(form.getAll('files').length).toBe(1);
      expect(form.get('rubric_file')).toBeNull();
      expect(form.get('file')).toBeNull();
      req.flush(buildJob({ job_type: 'batch_source_material' }));
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // pollGenerationJob()  GET .../question-jobs/{job_id}
  // ───────────────────────────────────────────────────────────────────
  describe('pollGenerationJob()', () => {
    it('GETs the job by id + returns the envelope (uniform D4 lifecycle)', () => {
      let result: QuestionGenerationJob | undefined;
      service.pollGenerationJob(ATOM_ID, JOB_ID).subscribe((job) => {
        result = job;
      });
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.endsWith(`/question-jobs/${encodeURIComponent(JOB_ID)}`),
      );
      req.flush(
        buildJob({
          status: 'ready_for_review',
          drafts: [
            { draft_id: 'd1', type: 'mcq', prompt: 'Q1', payload: {}, status: 'ready_for_review' },
            { draft_id: 'd2', type: 'mcq', prompt: 'Q2', payload: {}, status: 'ready_for_review' },
          ],
        }),
      );
      expect(result?.status).toBe('ready_for_review');
      expect(result?.drafts?.length).toBe(2);
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // acceptGenerationJob()  POST .../question-jobs/{job_id}/accept
  //   New body shape per bd34b47c: {accepted_candidates: [{draft_id, *_override}]}
  //   Editability invariant — each candidate is independently editable
  //   pre-persist (HITL edit-before-publish flow).
  // ───────────────────────────────────────────────────────────────────
  describe('acceptGenerationJob()', () => {
    it('POSTs accepted_candidates subset (no overrides = persist AI as-is)', () => {
      let result: AcceptGenerationJobResponse | undefined;
      service
        .acceptGenerationJob(ATOM_ID, JOB_ID, {
          accepted_candidates: [{ draft_id: 'd1' }],
        })
        .subscribe((r) => {
          result = r;
        });
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'POST' &&
          r.url.endsWith(`/question-jobs/${encodeURIComponent(JOB_ID)}/accept`),
      );
      expect(req.request.body).toEqual({
        accepted_candidates: [{ draft_id: 'd1' }],
      });
      const resp: AcceptGenerationJobResponse = {
        questions: [buildQuestion()],
        mana_charged: 5,
      };
      req.flush(resp);
      expect(result?.questions?.length).toBe(1);
      expect(result?.questions?.[0].question_id).toBe(QUESTION_ID);
      expect(result?.mana_charged).toBe(5);
    });

    it('subset-reject is supported by simply omitting unwanted draft_ids', () => {
      service
        .acceptGenerationJob(ATOM_ID, JOB_ID, {
          accepted_candidates: [
            { draft_id: 'keep-1' },
            { draft_id: 'keep-3' },
          ],
        })
        .subscribe();
      const req = httpMock.expectOne((r) => r.method === 'POST');
      expect(req.request.body.accepted_candidates).toEqual([
        { draft_id: 'keep-1' },
        { draft_id: 'keep-3' },
      ]);
      req.flush({ questions: [buildQuestion(), buildQuestion()], mana_charged: 10 });
    });

    it('per-candidate prompt_override + mcq_payload_override edits AI output pre-persist', () => {
      const candidate = {
        draft_id: 'd-mcq',
        prompt_override: 'Author-edited stem',
        mcq_payload_override: {
          options: [
            { option_id: 'edited-1', label: 'A', is_correct: true, explainer: 'New explainer' },
            { option_id: 'edited-2', label: 'B', is_correct: false, explainer: 'Wrong' },
          ],
        },
      };
      service
        .acceptGenerationJob(ATOM_ID, JOB_ID, { accepted_candidates: [candidate] })
        .subscribe();
      const req = httpMock.expectOne((r) => r.method === 'POST');
      expect(req.request.body.accepted_candidates[0]).toEqual(candidate);
      req.flush({ questions: [buildQuestion()], mana_charged: 5 });
    });

    it('per-candidate atom_meta_override carries title/tags/difficulty for batch jobs', () => {
      const candidate = {
        draft_id: 'd-batch-1',
        atom_meta_override: {
          title: 'Sprint planning facilitation',
          tags: ['scrum', 'planning'],
          difficulty: 3,
        },
      };
      service
        .acceptGenerationJob(ATOM_ID, JOB_ID, { accepted_candidates: [candidate] })
        .subscribe();
      const req = httpMock.expectOne((r) => r.method === 'POST');
      expect(req.request.body.accepted_candidates[0].atom_meta_override).toEqual(
        candidate.atom_meta_override,
      );
      req.flush({ questions: [buildQuestion()], mana_charged: 5 });
    });

    it('empty accepted_candidates is contract-valid (rejects ALL drafts)', () => {
      service
        .acceptGenerationJob(ATOM_ID, JOB_ID, { accepted_candidates: [] })
        .subscribe();
      const req = httpMock.expectOne((r) => r.method === 'POST');
      expect(req.request.body.accepted_candidates).toEqual([]);
      req.flush({ questions: [], mana_charged: 0 });
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // regenerateImage()  POST .../question-jobs/{parent_job_id}/regenerate-image
  // ───────────────────────────────────────────────────────────────────
  describe('regenerateImage() — CHO-1819 P3 review image regenerate', () => {
    it('POSTs draft_id/placement/prompt to the parent job + Idempotency-Key', () => {
      let result: QuestionGenerationJob | undefined;
      service
        .regenerateImage(
          ATOM_ID,
          JOB_ID,
          { draft_id: 'd-1', placement: 'stem', prompt: 'a clearer diagram' },
          IDEMP_KEY,
        )
        .subscribe((job) => {
          result = job;
        });
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'POST' &&
          r.url.endsWith(
            `/question-jobs/${encodeURIComponent(JOB_ID)}/regenerate-image`,
          ),
      );
      expect(req.request.headers.get('Idempotency-Key')).toBe(IDEMP_KEY);
      expect(req.request.body).toEqual({
        draft_id: 'd-1',
        placement: 'stem',
        prompt: 'a clearer diagram',
      });
      req.flush(buildJob({ job_type: 'image_regen', status: 'requested' }));
      expect(result?.job_id).toBe(JOB_ID);
      expect(result?.job_type).toBe('image_regen');
    });

    it('passes placement=answer + optional mode through verbatim', () => {
      service
        .regenerateImage(
          ATOM_ID,
          JOB_ID,
          { draft_id: 'd-2', placement: 'answer', prompt: 'cleaner figure', mode: 'diagram' },
          IDEMP_KEY,
        )
        .subscribe();
      const req = httpMock.expectOne((r) => r.method === 'POST');
      expect(req.request.body).toEqual({
        draft_id: 'd-2',
        placement: 'answer',
        prompt: 'cleaner figure',
        mode: 'diagram',
      });
      req.flush(buildJob({ job_type: 'image_regen' }));
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // loadDraft()  GET /api/atoms/new | /api/atoms/{id}  (legacy)
  //   Discriminated load state: loading → success | error.
  // ───────────────────────────────────────────────────────────────────
  describe('loadDraft()', () => {
    it('null atomId GETs /api/atoms/new and emits loading then success', () => {
      const states: AtomDraftLoadState[] = [];
      service.loadDraft(null).subscribe((s) => states.push(s));
      const req = httpMock.expectOne((r) => r.url.endsWith('/api/atoms/new'));
      expect(req.request.method).toBe('GET');
      req.flush({
        atom: {
          atomId: null,
          title: '',
          body: '',
          courseCode: '',
          topic: '',
          cognitiveLevel: 'applying',
          tags: [],
          prerequisites: [],
          objectives: [],
          state: 'DRAFT',
        },
      });
      // startWith emits 'loading' synchronously, then 'success'.
      expect(states[0]).toEqual({ status: 'loading' });
      expect(states[1].status).toBe('success');
    });

    it('non-null atomId GETs /api/atoms/{id} (encoded)', () => {
      service.loadDraft(ATOM_ID).subscribe();
      const req = httpMock.expectOne(
        (r) => r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}`),
      );
      expect(req.request.method).toBe('GET');
      req.flush({ atomId: ATOM_ID, title: 'A', cognitiveLevel: 'applying' });
    });

    it('unwraps the {atom} aggregator envelope', () => {
      let success: AtomDraftLoadState | undefined;
      service.loadDraft(ATOM_ID).subscribe((s) => {
        if (s.status === 'success') success = s;
      });
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}`))
        .flush({
          atom: { atomId: ATOM_ID, title: 'Wrapped', cognitiveLevel: 'analyzing' },
        });
      expect(success?.status).toBe('success');
      if (success?.status === 'success') {
        expect(success.data.title).toBe('Wrapped');
        expect(success.data.cognitiveLevel).toBe('analyzing');
      }
    });

    it('accepts a bare (unwrapped) draft shape', () => {
      let success: AtomDraftLoadState | undefined;
      service.loadDraft(ATOM_ID).subscribe((s) => {
        if (s.status === 'success') success = s;
      });
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}`))
        .flush({ atomId: ATOM_ID, title: 'Bare', cognitiveLevel: 'creating' });
      if (success?.status === 'success') {
        expect(success.data.title).toBe('Bare');
      }
    });

    it('hydrates the snake_case BE cognitive_level (older Bloom → FE label)', () => {
      let success: AtomDraftLoadState | undefined;
      service.loadDraft(ATOM_ID).subscribe((s) => {
        if (s.status === 'success') success = s;
      });
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}`))
        .flush({ atom: { atomId: ATOM_ID, title: 'C', cognitive_level: 'analysis' } });
      if (success?.status === 'success') {
        // 'analysis' (older Bloom) → 'analyzing' (FE revised Bloom)
        expect(success.data.cognitiveLevel).toBe('analyzing');
        // wire field stripped from the FE-canonical shape
        expect('cognitive_level' in (success.data as object)).toBe(false);
      }
    });

    it('defaults cognitiveLevel to "applying" when neither wire nor camelCase present', () => {
      let success: AtomDraftLoadState | undefined;
      service.loadDraft(ATOM_ID).subscribe((s) => {
        if (s.status === 'success') success = s;
      });
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}`))
        .flush({ atom: { atomId: ATOM_ID, title: 'D' } });
      if (success?.status === 'success') {
        expect(success.data.cognitiveLevel).toBe('applying');
      }
    });

    it('maps 404 to error key error_not_found', () => {
      let final: AtomDraftLoadState | undefined;
      service.loadDraft(ATOM_ID).subscribe((s) => {
        final = s;
      });
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}`))
        .flush(null, { status: 404, statusText: 'Not Found' });
      expect(final).toEqual({
        status: 'error',
        error: 'aplus.atom_authoring.error_not_found',
      });
    });

    it('maps 500 to error key error_upstream', () => {
      let final: AtomDraftLoadState | undefined;
      service.loadDraft(ATOM_ID).subscribe((s) => {
        final = s;
      });
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}`))
        .flush(null, { status: 500, statusText: 'Server Error' });
      expect(final).toEqual({
        status: 'error',
        error: 'aplus.atom_authoring.error_upstream',
      });
    });

    it('maps 401 to error key error_unauthorised', () => {
      let final: AtomDraftLoadState | undefined;
      service.loadDraft(ATOM_ID).subscribe((s) => {
        final = s;
      });
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}`))
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      expect(final).toEqual({
        status: 'error',
        error: 'aplus.atom_authoring.error_unauthorised',
      });
    });

    it('maps 403 to error key error_unauthorised', () => {
      let final: AtomDraftLoadState | undefined;
      service.loadDraft(ATOM_ID).subscribe((s) => {
        final = s;
      });
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}`))
        .flush(null, { status: 403, statusText: 'Forbidden' });
      expect(final).toEqual({
        status: 'error',
        error: 'aplus.atom_authoring.error_unauthorised',
      });
    });

    it('maps an unknown/non-HTTP error to error key error_generic', () => {
      let final: AtomDraftLoadState | undefined;
      service.loadDraft(ATOM_ID).subscribe((s) => {
        final = s;
      });
      // HttpErrorResponse with status 0 / network-style failure → generic.
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}`))
        .error(new ProgressEvent('error'));
      expect(final?.status).toBe('error');
      if (final?.status === 'error') {
        // status 0 → no specific branch → generic
        expect(final.error).toBe('aplus.atom_authoring.error_generic');
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // isTerminalAiAssistStatus() — exported pure predicate
  // ───────────────────────────────────────────────────────────────────
  describe('isTerminalAiAssistStatus()', () => {
    it('is true for terminal statuses', () => {
      const terminal: AiAssistJobStatus[] = ['COMPLETED', 'REFUSED', 'FAILED'];
      for (const s of terminal) {
        expect(isTerminalAiAssistStatus(s)).toBe(true);
      }
    });

    it('is false for in-flight statuses', () => {
      const inflight: AiAssistJobStatus[] = ['QUEUED', 'IN_PROGRESS'];
      for (const s of inflight) {
        expect(isTerminalAiAssistStatus(s)).toBe(false);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // startAiAssist()  POST /api/atoms/ai-assist  (legacy)
  // ───────────────────────────────────────────────────────────────────
  describe('startAiAssist()', () => {
    it('POSTs the request verbatim to /api/atoms/ai-assist', () => {
      let result: AiAssistJob | undefined;
      service
        .startAiAssist({
          question_type: 'mcq',
          prompt: 'Sprint roles',
          metadata: { cognitive_level: 'application', difficulty: '3' },
          image_for_stem: true,
        })
        .subscribe((j) => {
          result = j;
        });
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/api/atoms/ai-assist'),
      );
      // W8 author-opt-in flag rides through verbatim.
      expect(req.request.body.image_for_stem).toBe(true);
      expect(req.request.body.metadata.difficulty).toBe('3');
      req.flush(buildAiAssistJob({ status: 'QUEUED' }));
      expect(result?.job_id).toBe(JOB_ID);
      expect(result?.status).toBe('QUEUED');
    });

    it('propagates a 5xx so the drawer can show an error banner', () => {
      let errStatus: number | undefined;
      service
        .startAiAssist({ question_type: 'oe', prompt: 'Explain' })
        .subscribe({ error: (e: { status: number }) => (errStatus = e.status) });
      httpMock
        .expectOne((r) => r.url.endsWith('/api/atoms/ai-assist'))
        .flush(null, { status: 503, statusText: 'Service Unavailable' });
      expect(errStatus).toBe(503);
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // getAiAssistJob()  GET /api/atoms/ai-assist/{job_id}  (legacy)
  // ───────────────────────────────────────────────────────────────────
  describe('getAiAssistJob()', () => {
    it('GETs the job by id (encoded)', () => {
      let result: AiAssistJob | undefined;
      service.getAiAssistJob(JOB_ID).subscribe((j) => {
        result = j;
      });
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.endsWith(`/api/atoms/ai-assist/${encodeURIComponent(JOB_ID)}`),
      );
      req.flush(buildAiAssistJob({ status: 'IN_PROGRESS', attempt_count: 1 }));
      expect(result?.status).toBe('IN_PROGRESS');
      expect(result?.attempt_count).toBe(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // pollAiAssistUntilTerminal()  — RxJS timer poll loop
  //   timer(0, intervalMs) fires immediately at t=0, so the first poll
  //   resolves synchronously under HttpTestingController. A COMPLETED on
  //   the first emission ends the loop early (takeWhile inclusive=true).
  // ───────────────────────────────────────────────────────────────────
  describe('pollAiAssistUntilTerminal()', () => {
    it('exposes the 360s default ceiling constant', () => {
      expect(AI_ASSIST_POLL_TIMEOUT_MS).toBe(360_000);
    });

    // NOTE: pollAiAssistUntilTerminal uses RxJS `timer(0, intervalMs)`. The
    // first emission lands on the next macrotask, so we `await macrotask()`
    // (a real setTimeout(0)) before asserting the HTTP poll. fakeAsync/tick is
    // unavailable here — this module imports the Vitest globals, which detaches
    // Angular's ProxyZone (per the repo's Vitest runner conventions).
    const macrotask = () => new Promise<void>((r) => setTimeout(r, 0));

    it('emits the terminal COMPLETED job and stops on the first poll', async () => {
      const seen: AiAssistJob[] = [];
      let completed = false;
      service
        .pollAiAssistUntilTerminal(JOB_ID, { intervalMs: 2000 })
        .subscribe({
          next: (j) => seen.push(j),
          complete: () => (completed = true),
        });
      await macrotask();
      const req = httpMock.expectOne(
        (r) => r.url.endsWith(`/api/atoms/ai-assist/${encodeURIComponent(JOB_ID)}`),
      );
      req.flush(buildAiAssistJob({ status: 'COMPLETED', attempt_count: 1 }));
      // takeWhile(inclusive=true) emits the terminal job then completes —
      // no further interval tick issues another poll.
      expect(seen.at(-1)?.status).toBe('COMPLETED');
      expect(completed).toBe(true);
    });

    it('emits a REFUSED job as terminal', async () => {
      const seen: AiAssistJob[] = [];
      service.pollAiAssistUntilTerminal(JOB_ID).subscribe((j) => seen.push(j));
      await macrotask();
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/atoms/ai-assist/${encodeURIComponent(JOB_ID)}`))
        .flush(buildAiAssistJob({ status: 'REFUSED' }));
      expect(seen.at(-1)?.status).toBe('REFUSED');
    });

    it('throws a synthetic poll-timeout error once the deadline passes', async () => {
      // The service sets `deadline = Date.now() + timeoutMs` and gates on
      // `Date.now() > deadline`, STRICTLY greater. With timeoutMs:0 the
      // deadline is the subscribe instant, so the gate only trips if at least
      // 1ms of wall clock passes before timer(0,...) fires its first tick.
      // Nothing guarantees that: on an idle machine the tick can land in the
      // SAME millisecond, the gate reads false, an HTTP GET goes out instead
      // of the timeout, and both `caught` and httpMock.verify() fail. Observed
      // exactly once across full-suite runs on 2026-08-20 and not reproducible
      // in isolation, which is what a sub-millisecond race looks like.
      // timeoutMs:-1 puts the deadline strictly in the past, so the first tick
      // trips the gate whatever the scheduler does. Same intent, no race.
      let caught: { code?: string; status?: number } | undefined;
      service
        .pollAiAssistUntilTerminal(JOB_ID, { timeoutMs: -1 })
        .subscribe({
          error: (e: { code?: string; status?: number }) => (caught = e),
        });
      await macrotask();
      expect(caught?.code).toBe('ai_assist_poll_timeout');
      expect(caught?.status).toBe(0);
      // No HTTP request was issued — the deadline gate short-circuits.
      httpMock.verify();
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // loadQuestionForEdit()  — 2-hop re-open hydrate (CHO-1638)
  // ───────────────────────────────────────────────────────────────────
  describe('loadQuestionForEdit()', () => {
    const QID = '33333333-3333-7333-8333-3333333333cc';

    it('reads question_id off mcq_payload then GETs the full author question (MCQ)', () => {
      let result: { content: McqContent; questionId: string } | null | undefined;
      service.loadQuestionForEdit(ATOM_ID).subscribe((r) => {
        result = r as { content: McqContent; questionId: string } | null;
      });
      // hop 1 — atom GET carries the learner projection w/ question_id.
      const enc = encodeURIComponent(ATOM_ID);
      const atomReq = httpMock.expectOne(
        (r) => r.method === 'GET' && r.url.endsWith(`/api/atoms/${enc}`),
      );
      atomReq.flush({ atom: { mcq_payload: { question_id: QID } } });
      // hop 2 — full author question.
      const qReq = httpMock.expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.endsWith(`/api/atoms/${enc}/questions/${encodeURIComponent(QID)}`),
      );
      qReq.flush({
        question: {
          question_id: QID,
          type: 'mcq',
          prompt: 'Re-opened stem',
          mcq: {
            options: [
              { option_id: 'o1', label: 'A', is_correct: true, explainer: 'yes' },
            ],
            image_url: 'https://signed/stem.png',
          },
        },
      });
      expect(result?.questionId).toBe(QID);
      expect(result?.content.kind).toBe('manual');
      expect(result?.content.type).toBe('mcq');
      expect(result?.content.prompt).toBe('Re-opened stem');
    });

    it('reads question_id off question_payload (OE) and normalises the nested rubric', () => {
      let result: { content: OpenEndedContent; questionId: string } | null | undefined;
      service.loadQuestionForEdit(ATOM_ID).subscribe((r) => {
        result = r as { content: OpenEndedContent; questionId: string } | null;
      });
      const enc = encodeURIComponent(ATOM_ID);
      httpMock
        .expectOne((r) => r.method === 'GET' && r.url.endsWith(`/api/atoms/${enc}`))
        .flush({ atom: { question_payload: { question_id: QID } } });
      httpMock
        .expectOne(
          (r) => r.url.endsWith(`/api/atoms/${enc}/questions/${encodeURIComponent(QID)}`),
        )
        .flush({
          question: {
            question_id: QID,
            type: 'oe',
            prompt: 'Explain X',
            oe: {
              model_answer: 'Because Y',
              rubric: {
                criteria: [
                  { criterion_id: 'k1', description: 'Captures Y', weight_percent: 60 },
                ],
              },
            },
          },
        });
      expect(result?.questionId).toBe(QID);
      expect(result?.content.type).toBe('oe');
      // weight_percent/100 → flat weight
      expect(result?.content.oe_payload.rubric?.[0].weight).toBe(0.6);
      expect(result?.content.oe_payload.rubric?.[0].title).toBe('Captures Y');
    });

    it('emits null (no 2nd hop) when the atom has no question yet', () => {
      let result: unknown;
      let emitted = false;
      service.loadQuestionForEdit(ATOM_ID).subscribe((r) => {
        result = r;
        emitted = true;
      });
      const enc = encodeURIComponent(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/atoms/${enc}`))
        .flush({ atom: {} });
      expect(emitted).toBe(true);
      expect(result).toBeNull();
      // No second GET for the question.
      httpMock.expectNone(
        (r) => r.url.includes('/questions/'),
      );
    });

    it('emits null when the author question converts to an unsupported shape', () => {
      let result: unknown;
      service.loadQuestionForEdit(ATOM_ID).subscribe((r) => {
        result = r;
      });
      const enc = encodeURIComponent(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/atoms/${enc}`))
        .flush({ atom: { mcq_payload: { question_id: QID } } });
      httpMock
        .expectOne(
          (r) => r.url.endsWith(`/api/atoms/${enc}/questions/${encodeURIComponent(QID)}`),
        )
        // type mcq but no `mcq` body → authorQuestionToAtomContent returns null.
        .flush({ question: { question_id: QID, type: 'mcq', prompt: 'x' } });
      expect(result).toBeNull();
    });

    it('swallows a load error and emits null (best-effort hydrate)', () => {
      let result: unknown = 'unset';
      let errored = false;
      service.loadQuestionForEdit(ATOM_ID).subscribe({
        next: (r) => (result = r),
        error: () => (errored = true),
      });
      const enc = encodeURIComponent(ATOM_ID);
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/atoms/${enc}`))
        .flush(null, { status: 500, statusText: 'Server Error' });
      expect(errored).toBe(false);
      expect(result).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // deleteAtom()  DELETE /api/atoms/{id}
  // ───────────────────────────────────────────────────────────────────
  describe('deleteAtom()', () => {
    it('DELETEs /api/atoms/{id} (encoded, no body)', () => {
      service.deleteAtom(ATOM_ID).subscribe();
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'DELETE' &&
          r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}`),
      );
      expect(req.request.body).toBeNull();
      req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('propagates a 403 (Cloud Armor edge block — known infra edge)', () => {
      let errStatus: number | undefined;
      service
        .deleteAtom(ATOM_ID)
        .subscribe({ error: (e: { status: number }) => (errStatus = e.status) });
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/atoms/${encodeURIComponent(ATOM_ID)}`))
        .flush('<html>403</html>', { status: 403, statusText: 'Forbidden' });
      expect(errStatus).toBe(403);
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // adaptQuestionSave (via createQuestion / editQuestion) — FE-BUG-4
  //   BE may return `{question, revision}` instead of `{question,
  //   atom_revision}`. The adapter maps either to the FE-canonical shape.
  // ───────────────────────────────────────────────────────────────────
  describe('adaptQuestionSave — legacy {question, revision} BE shape', () => {
    it('createQuestion maps `revision` → `atom_revision` envelope', () => {
      let result: QuestionSaveEnvelope | undefined;
      service
        .createQuestion(ATOM_ID, toCreateRequest(buildMcqContent()))
        .subscribe((env) => {
          result = env;
        });
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/questions'),
      );
      req.flush({
        question: buildQuestion(),
        revision: { revision_id: 'rev-legacy-9', revision_number: 9 },
      });
      expect(result?.atom_revision.revision_id).toBe('rev-legacy-9');
      expect(result?.atom_revision.revision_number).toBe(9);
      expect(result?.question.question_id).toBe(QUESTION_ID);
    });

    it('editQuestion maps `revision` → `atom_revision` envelope', () => {
      let result: QuestionSaveEnvelope | undefined;
      service
        .editQuestion(ATOM_ID, QUESTION_ID, { prompt: 'p' })
        .subscribe((env) => {
          result = env;
        });
      const req = httpMock.expectOne((r) => r.method === 'PATCH');
      req.flush({
        question: buildQuestion(),
        revision: { revision_id: 'rev-legacy-2', revision_number: 2 },
      });
      expect(result?.atom_revision.revision_number).toBe(2);
    });

    it('throws a 500 when the BE response carries neither atom_revision nor revision', () => {
      let errStatus: number | undefined;
      let errMessage: string | undefined;
      service
        .createQuestion(ATOM_ID, toCreateRequest(buildMcqContent()))
        .subscribe({
          error: (e: { status: number; message: string }) => {
            errStatus = e.status;
            errMessage = e.message;
          },
        });
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/questions'),
      );
      // No revision / atom_revision key at all.
      req.flush({ question: buildQuestion() });
      expect(errStatus).toBe(500);
      expect(errMessage).toContain('no revision');
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // createAtom() — atomId extraction across BE response shapes (FE-BUG-3)
  // ───────────────────────────────────────────────────────────────────
  describe('createAtom() — atomId extraction', () => {
    it('reads atomId from flat snake_case {atom_id}', () => {
      let result: { atomId: string } | undefined;
      service
        .createAtom({ atom_type: 'MULTIPLE_CHOICE', title: 'A', locale: 'en', stem: 's' })
        .subscribe((r) => {
          result = r;
        });
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/api/atoms'),
      );
      req.flush({ atom_id: ATOM_ID, tenant_id: 't', gcid: 'g' });
      expect(result?.atomId).toBe(ATOM_ID);
    });

    it('reads atomId from nested {atom: {atom_id}} snake_case', () => {
      let result: { atomId: string } | undefined;
      service
        .createAtom({ atom_type: 'MULTIPLE_CHOICE', title: 'A', locale: 'en', stem: 's' })
        .subscribe((r) => {
          result = r;
        });
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/atoms'))
        .flush({ atom: { atom_id: ATOM_ID } });
      expect(result?.atomId).toBe(ATOM_ID);
    });

    it('throws a 500 when no atomId is present in the response', () => {
      let errStatus: number | undefined;
      service
        .createAtom({ atom_type: 'MULTIPLE_CHOICE', title: 'A', locale: 'en', stem: 's' })
        .subscribe({ error: (e: { status: number }) => (errStatus = e.status) });
      httpMock
        .expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/atoms'))
        .flush({ tenant_id: 't' });
      expect(errStatus).toBe(500);
    });
  });

  // ───────────────────────────────────────────────────────────────────
  // changeReuseVisibility() — ADR-229 WS-5 (CHO-2401)
  // The author-only consent mutation per
  // `chora-contracts/openapi/creation-admin.yaml#changeAtomReuseVisibility`.
  // ───────────────────────────────────────────────────────────────────
  describe('changeReuseVisibility() — ADR-229 author audience mutation', () => {
    it('PATCHes /api/atoms/{id}/reuse-visibility with the bare audience body', () => {
      let echoed: string | undefined;
      service
        .changeReuseVisibility(ATOM_ID, 'tenant')
        .subscribe((r) => (echoed = r.reuse_visibility));
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'PATCH' &&
          r.url.endsWith(`/api/atoms/${ATOM_ID}/reuse-visibility`),
      );
      expect(req.request.body).toEqual({ reuse_visibility: 'tenant' });
      req.flush({ atom_id: ATOM_ID, reuse_visibility: 'tenant' });
      expect(echoed).toBe('tenant');
    });

    it('propagates the BE refusal untouched — the gate must stay loud', () => {
      let errStatus: number | undefined;
      service
        .changeReuseVisibility(ATOM_ID, 'private')
        .subscribe({ error: (e: { status: number }) => (errStatus = e.status) });
      httpMock
        .expectOne((r) => r.url.endsWith(`/api/atoms/${ATOM_ID}/reuse-visibility`))
        .flush(null, { status: 403, statusText: 'Forbidden' });
      expect(errStatus).toBe(403);
    });
  });
});
