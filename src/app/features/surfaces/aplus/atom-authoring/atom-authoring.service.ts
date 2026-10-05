/**
 * AtomAuthoringService — A+ atom authoring service.
 *
 * Wired through `BffClientService` per chora-web/CLAUDE.md §3. M14.iter5.B
 * (big-bang fail-loud directive 2026-05-13): all wave-3 fixtures killed.
 *
 * Phase C (2026-05-15) adds 9 new BFF-bound methods for the CR Question
 * Authoring flow against the BE-locked `creation-questions.yaml` spec.
 * The legacy `loadDraft()` + `runAiAssist()` are kept intact during the
 * transition — Phase H rewires the component to the new shapes + drops
 * `runAiAssist`.
 *
 * BFF endpoints (chora-gateway):
 *   - GET    /api/atoms                                       — list (wave-3 CRUD)
 *   - GET    /api/atoms/new                                   — empty draft template (F2 paydown)
 *   - GET    /api/atoms/:id                                   — load draft + question projection (Phase C)
 *   - POST   /api/atoms                                       — create draft (wave-3 CRUD)
 *   - POST   /api/atoms/ai-assist                             — invoke QGen pipeline (legacy)
 *   - GET    /api/atoms/question-types                        — 16-enum registry (Phase C / D feeder)
 *   - POST   /api/atoms/:id/questions                         — manual create (Phase C)
 *   - PATCH  /api/atoms/:id/questions/:q_id                   — edit / save-draft (Phase C)
 *   - DELETE /api/atoms/:id/questions/:q_id                   — per-question delete (Phase C, BE A18 ask)
 *   - POST   /api/atoms/:id/questions/:q_id/ai-model-answer-jobs — path 2 (5 mana)
 *   - POST   /api/atoms/:id/question-jobs                     — path 3 ai-draft + path 4 batch
 *   - GET    /api/atoms/:id/question-jobs/:job_id             — uniform D4 poll
 *   - POST   /api/atoms/:id/question-jobs/:job_id/accept      — subset-commit
 */
import { Injectable, inject } from '@angular/core';
import { HttpHeaders } from '@angular/common/http';
import { Observable, throwError, timer } from 'rxjs';
import { catchError, map, of, startWith, switchMap, takeWhile } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  authorQuestionToAtomContent,
  fromWireCognitiveLevel,
  type AcceptGenerationJobRequest,
  type AcceptGenerationJobResponse,
  type AiAssistJob,
  type AiAssistJobStatus,
  type AiAssistRequest,
  type AtomContent,
  type AtomDraft,
  type AuthorQuestionWire,
  type AtomDraftLoadState,
  type AtomWithProjection,
  type CognitiveLevel,
  type ReuseAudience,
  type CreateQuestionRequest,
  type EditQuestionRequest,
  type GenerateBatchRequest,
  type GenerateModelAnswerRequest,
  type GenerateQuestionJobRequest,
  type Question,
  type QuestionGenerationJob,
  type QuestionSaveEnvelope,
  type RegenerateImageRequest,
  type QuestionTypeOption,
  type WireCognitiveLevel,
} from './atom-authoring.model';

/**
 * FE-BUG-4 (2026-05-16) — adapter for BE's `{question, revision}`
 * createQuestion response shape. The FE model + saveQuestion handler
 * both expect `{question, atom_revision: {revision_id, revision_number}}`.
 * Deployed BE returns the parent atom-revision summary at `revision`
 * key (full QuestionRevision row). Map either to the FE-canonical
 * envelope.
 */
function adaptQuestionSave(
  raw:
    | QuestionSaveEnvelope
    | { question: Question; revision: { revision_id: string; revision_number: number } },
): QuestionSaveEnvelope {
  if ('atom_revision' in raw && raw.atom_revision) {
    return raw;
  }
  const r = (raw as { revision?: { revision_id: string; revision_number: number } }).revision;
  if (!r) {
    throw { status: 500, message: 'createQuestion: no revision in response' };
  }
  return {
    question: raw.question,
    atom_revision: { revision_id: r.revision_id, revision_number: r.revision_number },
  };
}

/**
 * Whether the AI-Assist job has reached a terminal status. Used by
 * `pollAiAssistUntilTerminal` to stop the RxJS poll loop. Exported so
 * the component can branch on terminal vs in-flight without
 * duplicating the enum check.
 */
export function isTerminalAiAssistStatus(status: AiAssistJobStatus): boolean {
  return status === 'COMPLETED' || status === 'REFUSED' || status === 'FAILED';
}

/**
 * Default ceiling for the AI-Assist poll loop, in milliseconds.
 *
 * Raised 90s → 360s (2026-06-01, B1) to mirror the orchestrator's qgen
 * crew callback bound `QGEN_CREW_CALLBACK_TIMEOUT_SECONDS=300`: the
 * actor↔critic loop runs up to `max_attempts=4` on the high tier
 * (~150-160s observed) under a 300s hard wait. The FE must outlast that
 * backend bound plus the queue → dispatch → publish → persist edges, or
 * it abandons a job that is still legitimately running — the W5 symptom
 * was a backend `COMPLETED` at ~160s while the drawer showed "timed out
 * after 90s". 60s headroom over the 300s loop covers the async edges;
 * fast runs still finish in ~20-60s and end the loop early via the
 * `takeWhile` terminal-status check (no idle wait to the ceiling).
 */
export const AI_ASSIST_POLL_TIMEOUT_MS = 360_000;

@Injectable({ providedIn: 'root' })
export class AtomAuthoringService {
  private readonly bff = inject(BffClientService);

  // ═════════════════════════════════════════════════════════════════════
  // Legacy methods (kept during Phase C → Phase H transition)
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Load the canonical draft for the given mode + atom id, surfaced as
   * a discriminated load state.
   *
   * NULL atomId → GET /api/atoms/new (server returns empty draft template)
   * non-null    → GET /api/atoms/:id (server returns existing draft)
   *
   * The returned stream emits `{status:'loading'}` synchronously then
   * either `{status:'success',data}` or `{status:'error',error:i18nKey}`.
   *
   * Phase H replaces with `loadAtomWithProjection()` below.
   */
  loadDraft(atomId: string | null): Observable<AtomDraftLoadState> {
    const path = atomId
      ? `/api/atoms/${encodeURIComponent(atomId)}`
      : '/api/atoms/new';
    // BE wraps the draft in an envelope: `{atom: AtomDraft, session_error?: string}`
    // (matches the atomic-session GET shape — A16 projection). Live edge probe
    // 2026-05-15 confirmed wrapped shape. Unwrap defensively so the legacy
    // direct-cast (pre-Phase-H) doesn't surface `undefined` to title/body.
    type WireDraft = AtomDraft & { cognitive_level?: string };
    return this.bff
      .get<{ atom?: WireDraft } & WireDraft>(path)
      .pipe(
        map((raw): AtomDraftLoadState => {
          const wire = (raw && raw.atom ? raw.atom : (raw as WireDraft));
          const data = this.hydrateCognitiveLevel(wire);
          return { status: 'success', data };
        }),
        startWith<AtomDraftLoadState>({ status: 'loading' }),
        catchError((err: unknown) =>
          of<AtomDraftLoadState>({
            status: 'error',
            error: this.errorKey(err),
          }),
        ),
      );
  }

  /**
   * E2E-BE-COGNITIVE-LEVEL wire-in hydrator. BE serialises `cognitive_level`
   * in snake_case with the older-Bloom enum
   * (`knowledge|comprehension|application|analysis|synthesis|evaluation`).
   * FE uses revised-Bloom labels (`remembering|...|creating`). Map at the
   * wire boundary so downstream signals only ever see the FE-canonical
   * vocabulary. When the BE value is missing or unrecognised the existing
   * `cognitiveLevel` (camelCase, already-FE-canonical) is preserved — and
   * when neither is present we default to `'applying'` to match the
   * component initialiser (kept consistent with the empty-draft fixture).
   */
  private hydrateCognitiveLevel(
    wire: AtomDraft & { cognitive_level?: string },
  ): AtomDraft {
    const fromBe = fromWireCognitiveLevel(wire.cognitive_level ?? null);
    const existing: CognitiveLevel | undefined = wire.cognitiveLevel;
    const hydrated: CognitiveLevel = fromBe ?? existing ?? 'applying';
    // Drop the snake_case wire field so the FE-canonical shape doesn't
    // leak `cognitive_level` into downstream code paths.
    const rest = { ...wire } as AtomDraft & { cognitive_level?: string };
    delete rest.cognitive_level;
    return { ...rest, cognitiveLevel: hydrated };
  }

  /**
   * Start an async AI-Assist job — POST /api/atoms/ai-assist (202).
   *
   * Per `docs/m13/handoff-mcq-ai-assist-be-ready-2026-05-17.md` §2 +
   * `services/chora-creation/internal/adapter/http/ai_assist_async_handler.go`:
   * BE returns a 202 + AiAssistJob envelope with `status: 'QUEUED'`,
   * publishes `chora.creation.ai_assist.started.v1`, and the
   * chora-ai-kernel-orchestrator picks it up via the qgen 2-agent crew
   * (generator → critic). Caller drives the poll via `pollAiAssist`.
   *
   * Per [[feedback-no-stubs-real-wiring]] this is the canonical FE path
   * — there is no sync fallback. If `QGEN_CREW_ENABLED=false` on the
   * orchestrator the job sits at QUEUED until the 90s poll timeout.
   *
   * W8 AUTHOR-OPT-IN: the request is POSTed verbatim, so the optional
   * `image_for_stem` / `image_for_answer` booleans (when set by the drawer
   * toggles) ride straight through to the BE in the body. The BE honours
   * them and returns the image URL(s) on the candidate (`image_url` for the
   * stem, `answer_image_url` for the model answer). No request-shaping here —
   * the typed `AiAssistRequest` carries the flags.
   */
  startAiAssist(request: AiAssistRequest): Observable<AiAssistJob> {
    return this.bff.post<AiAssistJob>('/api/atoms/ai-assist', request);
  }

  /**
   * Poll a single AI-Assist job — GET /api/atoms/ai-assist/{job_id}.
   * Single-shot call; caller composes the polling cadence via
   * `pollAiAssistUntilTerminal` or its own RxJS pipeline.
   */
  getAiAssistJob(jobId: string): Observable<AiAssistJob> {
    return this.bff.get<AiAssistJob>(
      `/api/atoms/ai-assist/${encodeURIComponent(jobId)}`,
    );
  }

  /**
   * Poll `getAiAssistJob` every `intervalMs` until the job reaches a
   * terminal status (COMPLETED | REFUSED | FAILED) or the cumulative
   * elapsed time exceeds `timeoutMs`. Defaults: 2s interval (keeps the
   * live `pipeline_trace` widget responsive) + `AI_ASSIST_POLL_TIMEOUT_MS`
   * (360s) — sized to outlast the orchestrator's 300s qgen-loop callback
   * bound; a fast 2-agent run still completes in ~20-60s and ends the
   * loop early via the `takeWhile` terminal-status check.
   *
   * Emits each intermediate `AiAssistJob` as it arrives so the caller
   * can drive a `polling` state with the latest `pipeline_trace` for
   * the live IMDA D2 widget. The final emission is the terminal job.
   * On timeout, emits a synthetic error so the caller can show a
   * "timed out — try again" banner.
   */
  pollAiAssistUntilTerminal(
    jobId: string,
    opts: { intervalMs?: number; timeoutMs?: number } = {},
  ): Observable<AiAssistJob> {
    const intervalMs = opts.intervalMs ?? 2000;
    const timeoutMs = opts.timeoutMs ?? AI_ASSIST_POLL_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;

    return timer(0, intervalMs).pipe(
      switchMap(() => {
        if (Date.now() > deadline) {
          return throwError(() => ({
            status: 0,
            code: 'ai_assist_poll_timeout',
            message: `poll exceeded ${timeoutMs}ms`,
          }));
        }
        return this.getAiAssistJob(jobId);
      }),
      takeWhile((job) => !isTerminalAiAssistStatus(job.status), true),
    );
  }

  private errorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 404) return 'aplus.atom_authoring.error_not_found';
      if (e.status >= 500) return 'aplus.atom_authoring.error_upstream';
      if (e.status === 401 || e.status === 403) {
        return 'aplus.atom_authoring.error_unauthorised';
      }
    }
    return 'aplus.atom_authoring.error_generic';
  }

  // ═════════════════════════════════════════════════════════════════════
  // Phase C — Question Authoring CR methods (9 new endpoints)
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Phase I.5 — POST /api/atoms (createAtom). Mints a new LearningAtom
   * in DRAFT and returns the assigned atomId. Required precondition
   * before any `/api/atoms/{atom_id}/*` call when the user is on
   * `/a/atoms/new` (server template returns `atomId=null`).
   *
   * `CreateAtomRequest` per `creation-admin.yaml` (ADR-156 Phase 1):
   *   required: question_type (a.k.a. atom_type alias), stem, locale
   *   optional: title, cognitive_level, topic_node_ids, difficulty
   *
   * `stem` (NEW per ADR-156 Decision #1) — REQUIRED ≥1 char after trim
   * per BE deploy `9f63ae00` (HTTP handlers landed 2026-05-17). Without
   * stem the BE returns 400 CREATION_INVALID_ATOM. Callers derive stem
   * from the live question prompt or fall back to title — see
   * `AtomAuthoringComponent.deriveAtomStem`.
   *
   * Response: 201 `LearningAtom` (with `atomId` assigned).
   *
   * BE wraps responses in `{atom, session_error?}` aggregator envelope;
   * unwrap defensively (mirrors loadDraft + loadQuestionTypes pattern).
   */
  createAtom(req: {
    /**
     * CHO-2178 — only flavours chora-creation can actually represent. The old
     * union offered TRUE_FALSE and MATCHING, which the domain calls invalid:
     * the BE used to accept them, persist them, and then fail the outbox
     * marshal forever, leaving the atom published-but-invisible. It now
     * answers 400 CREATION_ATOM_TYPE_UNSUPPORTED. OUTLINE is newly sendable.
     */
    atom_type:
      | 'MULTIPLE_CHOICE'
      | 'SHORT_ANSWER'
      | 'ESSAY'
      | 'FILL_BLANK'
      | 'MULTIMEDIA'
      | 'OUTLINE';
    /**
     * Canonical question prompt — REQUIRED per ADR-156 Decision #1 +
     * BE deploy `9f63ae00`. Caller is responsible for the ≥1-char-after-
     * trim invariant; this signature does not re-validate.
     */
    stem: string;
    title: string;
    locale: string;
    difficulty?: number;
    /**
     * Optional BE-canonical (older Bloom) cognitive-level enum per
     * `creation-admin.yaml#CognitiveLevel` + ADR-156 Decision #3. FE
     * pickers carry the revised-Bloom label; callers MUST map via
     * `toWireCognitiveLevel()` before invoking.
     */
    cognitive_level?: WireCognitiveLevel;
  }): Observable<{ atomId: string }> {
    return this.bff
      .post<{
        atom?: { atomId?: string; atom_id?: string };
        atomId?: string;
        atom_id?: string;
      }>('/api/atoms', req)
      .pipe(
        map((raw) => {
          // FE-BUG-3 (2026-05-16): BE returns flat snake_case
          // `{atom_id, tenant_id, gcid, ...}` per deployed reality.
          // Earlier shape was `{atom: {atomId}}`; both accepted.
          const atomId =
            raw.atom?.atomId ??
            raw.atom?.atom_id ??
            raw.atomId ??
            raw.atom_id;
          if (!atomId) {
            throw { status: 500, message: 'createAtom: no atomId in response' };
          }
          return { atomId };
        }),
      );
  }

  /**
   * Phase K — POST /api/atoms/{atom_id}/publish (per
   * `creation-admin.yaml#publishAtom`). Transitions atom DRAFT →
   * PUBLISHED + publishes `chora.creation.atom.published.v1`.
   *
   * Contract responses (per OpenAPI):
   *   200 — LearningAtom (`atomId, title, status: 'PUBLISHED', ...`)
   *   404 — ATOM_NOT_FOUND
   *   409 — Conflict (likely NO_PUBLISHED_REVISION; A22 ask pending
   *         BE on the canonical sub-code enum)
   *
   * The gateway aggregator may wrap with `{atom, session_error?}`
   * (same pattern as loadDraft) since this is `/api/atoms/{id}/*` —
   * unwrap defensively until BE confirms via A22.
   */
  publishAtom(atomId: string): Observable<Record<string, unknown>> {
    return this.bff
      .post<{ atom?: Record<string, unknown> } & Record<string, unknown>>(
        `/api/atoms/${encodeURIComponent(atomId)}/publish`,
        {},
      )
      .pipe(
        map((raw) => {
          const data = raw.atom ?? raw;
          return data as Record<string, unknown>;
        }),
      );
  }

  /**
   * POST /v1/atoms/{atom_id}/share — share a published atom to the C+ feed.
   * Requires an Idempotency-Key header (contract §7.1 step 5). Returns the
   * share entry ID + author display name.
   */
  shareAtom(atomId: string, body: {
    license_terms: string;
    caption?: string;
    royalty_rate?: { kind: string; value: number } | null;
  }): Observable<{ share_entry_id: string; author_display_name: string; created_at: string }> {
    const idemKey = crypto.randomUUID();
    const headers = new HttpHeaders({ 'Idempotency-Key': idemKey });
    return this.bff.post(
      `/v1/atoms/${encodeURIComponent(atomId)}/share`,
      body,
      { headers },
    );
  }

  /** DELETE /v1/atoms/{id}/share — revoke a shared atom from the feed. */
  revokeShare(atomId: string): Observable<void> {
    return this.bff.delete(`/v1/atoms/${encodeURIComponent(atomId)}/share`).pipe(map(() => undefined));
  }

  /**
   * PATCH /api/atoms/{atom_id}/reuse-visibility — ADR-229 WS-5 (CHO-2401).
   *
   * The author-only consent mutation per
   * `chora-contracts/openapi/creation-admin.yaml#changeAtomReuseVisibility`.
   * The BE echoes the atom with the persisted audience; refusals stay loud
   * and untranslated here (403 CREATION_NOT_AUTHOR, 409
   * CREATION_ATOM_ORPHANED_FROZEN / CREATION_ATOM_ARCHIVED) — the caller
   * maps them to copy.
   */
  changeReuseVisibility(
    atomId: string,
    audience: ReuseAudience,
  ): Observable<{ reuse_visibility?: string }> {
    return this.bff.patch(
      `/api/atoms/${encodeURIComponent(atomId)}/reuse-visibility`,
      { reuse_visibility: audience },
    );
  }

  /**
   * GET /api/atoms/question-types — server-driven 16-enum registry per
   * `creation-questions.yaml#listQuestionTypes`. Canonical envelope
   * `{items: [QuestionTypeOption]}` per BE gateway fix `d4dd716c` —
   * the chora-gateway proxy now claims the static `/api/atoms/question-types`
   * path BEFORE the parametric `/api/atoms/{atom_id}` (which keeps its
   * `{atom, session}` wrap), so this route forwards byte-identical.
   */
  loadQuestionTypes(): Observable<readonly QuestionTypeOption[]> {
    return this.bff
      .get<{ items: readonly QuestionTypeOption[] }>('/api/atoms/question-types')
      .pipe(map((r) => r.items));
  }

  /**
   * GET /api/atoms/{atom_id} — atom + optional `question` projection
   * (A16 closed; learner-safe shape strips `correct_option_id` +
   * per-option `explainer` from `mcq_payload`. The AUTHOR projection
   * comes back full via the admin GET — same envelope).
   *
   * Normalises a missing `question` field to `null` so consumers can
   * use plain `if (p.question)` to gate render of the edit form.
   */
  loadAtomWithProjection(atomId: string): Observable<AtomWithProjection> {
    return this.bff
      .get<{ atom: AtomDraft; question?: Question | null }>(
        `/api/atoms/${encodeURIComponent(atomId)}`,
      )
      .pipe(
        map((r) => ({ atom: r.atom, question: r.question ?? null })),
      );
  }

  /**
   * Re-open support (CHO-1638). The atom GET only carries the LEARNER-safe
   * projection (no answer key, no images), so to hydrate the editor on
   * `/a/atoms/{id}/edit` we (1) read the `question_id` off the atom's
   * projection, then (2) GET the full AUTHOR question
   * (`/api/atoms/{id}/questions/{question_id}`) — which the BE now returns with
   * the per-option answer key AND `gs://` images minted to signed URLs — and
   * convert it to the editable `AtomContent`. Emits `null` when the atom has no
   * question yet (fresh draft) or on any load error (best-effort; the manual
   * picker still works).
   */
  loadQuestionForEdit(
    atomId: string,
  ): Observable<{ content: AtomContent; questionId: string } | null> {
    const enc = encodeURIComponent(atomId);
    return this.bff
      .get<{
        atom?: {
          mcq_payload?: { question_id?: string };
          question_payload?: { question_id?: string };
        };
      }>(`/api/atoms/${enc}`)
      .pipe(
        switchMap((r) => {
          const qid =
            r?.atom?.question_payload?.question_id ??
            r?.atom?.mcq_payload?.question_id ??
            null;
          if (!qid) {
            return of<{ content: AtomContent; questionId: string } | null>(
              null,
            );
          }
          return this.bff
            .get<{ question: AuthorQuestionWire }>(
              `/api/atoms/${enc}/questions/${encodeURIComponent(qid)}`,
            )
            .pipe(
              map((qr) => {
                const content = authorQuestionToAtomContent(qr.question);
                return content
                  ? { content, questionId: qr.question.question_id }
                  : null;
              }),
            );
        }),
        catchError(() =>
          of<{ content: AtomContent; questionId: string } | null>(null),
        ),
      );
  }

  /**
   * POST /api/atoms/{atom_id}/questions — manual create OR commit-AI-candidate.
   * The wire body has no FE `kind` tag (callers pre-serialise via
   * `toCreateRequest(content)` from the model module). 201 returns the
   * `{question, atom_revision}` save envelope.
   *
   * BE error codes: CREATION_QUESTION_INVALID_TYPE / _PAYLOAD_INVALID /
   * _DUPLICATE / _NOT_FOUND. Surfaced as 4xx by the caller.
   */
  createQuestion(
    atomId: string,
    request: CreateQuestionRequest,
  ): Observable<QuestionSaveEnvelope> {
    return this.bff
      .post<QuestionSaveEnvelope | { question: Question; revision: { revision_id: string; revision_number: number } }>(
        `/api/atoms/${encodeURIComponent(atomId)}/questions`,
        request,
      )
      .pipe(map((raw) => adaptQuestionSave(raw)));
  }

  /**
   * PATCH /api/atoms/{atom_id}/questions/{question_id} — partial edit.
   * Only fields present in `request` are updated. `type` is immutable
   * post-create (BE rejects with 400/422 if attempted). Each successful
   * edit appends a new `QuestionRevision` + bumps the parent
   * `AtomRevision` (returned in the envelope).
   */
  editQuestion(
    atomId: string,
    questionId: string,
    request: EditQuestionRequest,
  ): Observable<QuestionSaveEnvelope> {
    return this.bff
      .patch<QuestionSaveEnvelope | { question: Question; revision: { revision_id: string; revision_number: number } }>(
        `/api/atoms/${encodeURIComponent(atomId)}/questions/${encodeURIComponent(questionId)}`,
        request,
      )
      .pipe(map((raw) => adaptQuestionSave(raw)));
  }

  /**
   * DELETE /api/atoms/{atom_id}/questions/{question_id} — soft-delete the
   * embedded question (atom shell remains). Per ddd-enforcement #5.
   */
  deleteQuestion(atomId: string, questionId: string): Observable<void> {
    return this.bff.delete<void>(
      `/api/atoms/${encodeURIComponent(atomId)}/questions/${encodeURIComponent(questionId)}`,
    );
  }

  /**
   * DELETE /api/atoms/{atom_id} — atom-level soft-delete.
   *
   * Acknowledged by BE at `d2ec6ee7 docs(m13): ack a508f184 to FE — BE
   * atom DELETE handler is LIVE`. Handler at
   * `services/chora-creation/internal/adapter/http/handler.go:638`:
   * sets `deleted_at` + `status=archived`, repo UPSERT (no hard delete),
   * subsequent GET returns 404 with code CREATION_ATOM_NOT_FOUND,
   * picker search excludes deleted rows.
   *
   * Known edge issue: Cloud Armor blocks DELETE method at the edge
   * (403 HTML) — filed Infra-side at ad408b28. Until that closes the
   * browser-initiated DELETE will 403; port-forward + service-to-
   * service calls work today.
   */
  deleteAtom(atomId: string): Observable<void> {
    return this.bff.delete<void>(
      `/api/atoms/${encodeURIComponent(atomId)}`,
    );
  }

  /**
   * POST /api/atoms/{atom_id}/questions/{question_id}/ai-model-answer-jobs
   * — path 2 (5 mana, `question_authoring_model_answer`). Async. Returns
   * a `QuestionGenerationJob` envelope; consumer polls via
   * `pollGenerationJob()`. `Idempotency-Key` header is contract-mandated.
   *
   * Mana debit happens at job-start; BE refunds on LLM failure
   * (mirrors `mana_quoter` pattern).
   */
  generateModelAnswer(
    atomId: string,
    questionId: string,
    request: GenerateModelAnswerRequest,
    idempotencyKey: string,
  ): Observable<QuestionGenerationJob> {
    const headers = new HttpHeaders({ 'Idempotency-Key': idempotencyKey });
    return this.bff.post<QuestionGenerationJob>(
      `/api/atoms/${encodeURIComponent(atomId)}/questions/${encodeURIComponent(questionId)}/ai-model-answer-jobs`,
      request,
      { headers },
    );
  }

  /**
   * POST /api/atoms/{atom_id}/question-jobs {type:"manual"} — CHO-1826 U4.
   * Opens a manual authoring session: the backend creates a `manual_draft`
   * job already in `succeeded` status (no LLM dispatch, no mana debit, no
   * generation_requested event). The author composes questions by hand and
   * commits them via {@link acceptGenerationJob} with INLINE manual candidates
   * (no draft_id), which the backend mints free as source_type=manual. No
   * Idempotency-Key — the backend manual path debits nothing and is safe to
   * re-issue (a duplicate just yields an empty unused job).
   */
  createManualJob(atomId: string): Observable<QuestionGenerationJob> {
    return this.bff.post<QuestionGenerationJob>(
      `/api/atoms/${encodeURIComponent(atomId)}/question-jobs`,
      { type: 'manual' },
    );
  }

  /**
   * POST /api/atoms/{atom_id}/question-jobs — unified path 3 (ai-draft,
   * 10 mana) + path 4 (batch_source_material, 50 + 5×accepted).
   *
   * - path 3: JSON body. Mana debited at job-start.
   * - path 4: multipart FormData with `file` (≤ 32MB PDF/DOCX/MD/TXT) + a single
   *   `settings` JSON part ({job_type, question_type, count, difficulty,
   *   grounding_mode, context}) per the backend contract.
   *   50-mana parse-cost debited at job-start; 5-mana per-item debit deferred to
   *   `acceptGenerationJob()` time.
   *
   * `Idempotency-Key` header contract-mandated for both shapes.
   */
  generateQuestionJob(
    atomId: string,
    request: GenerateQuestionJobRequest,
    idempotencyKey: string,
  ): Observable<QuestionGenerationJob> {
    const headers = new HttpHeaders({ 'Idempotency-Key': idempotencyKey });
    const url = `/api/atoms/${encodeURIComponent(atomId)}/question-jobs`;

    if (request.job_type === 'batch_source_material') {
      const form = this.buildBatchFormData(request);
      return this.bff.post<QuestionGenerationJob>(url, form, { headers });
    }

    // The single-question ai_draft JSON contract keys the discriminant on
    // `type` (questionJobReq), NOT `job_type` — `job_type` is only the
    // multipart `settings` field on the batch path. The backend decodes with
    // DisallowUnknownFields, so map at the wire boundary and emit only the
    // accepted fields (extras like the FE-only `job_type` would 400).
    const body: Record<string, unknown> = {
      type: request.job_type,
      question_type: request.question_type,
      prompt: request.prompt,
      difficulty: request.difficulty,
    };
    if (request.count != null) {
      body['count'] = request.count;
    }
    // CHO-1826 Gap #4 — forward the forced-image opt-in only when set
    // (proto3-false elision keeps the legacy ai_draft body byte-stable; the
    // backend questionJobReq accepts these via DisallowUnknownFields).
    if (request.image_for_stem) {
      body['image_for_stem'] = true;
    }
    if (request.image_for_answer) {
      body['image_for_answer'] = true;
    }
    // CHO-1657 — forward the author hint map (subject / cognitive_level /
    // difficulty) only when non-empty (byte-stable legacy body). The backend
    // carries it into settings_json → ai_assist.started.v1 metadata (proto f12).
    if (request.metadata && Object.keys(request.metadata).length > 0) {
      body['metadata'] = request.metadata;
    }
    return this.bff.post<QuestionGenerationJob>(url, body, { headers });
  }

  /**
   * Builds the batch multipart body to the backend contract
   * (createBatchSourceMaterialJob): source part(s) + a single `settings`
   * JSON part (NOT separate fields).
   *
   * Lane 1c (CHO-1703 / ADR-180 D7) part names per creation-questions.yaml
   * v1.5.0: `files` (repeated, 1..5 sources) + optional `rubric_file` (≤1)
   * — the new-client shape. The legacy single `file` part is kept for
   * back-compat when a caller still supplies `request.file` (exactly one of
   * `file` / `files` is present per the contract). Carries the EPIC-1a
   * grounding_mode + the author's context hint.
   */
  private buildBatchFormData(request: GenerateBatchRequest): FormData {
    const form = new FormData();
    if (request.files && request.files.length > 0) {
      for (const f of request.files) {
        form.append('files', f);
      }
      if (request.rubric_file) {
        form.append('rubric_file', request.rubric_file);
      }
    } else if (request.file) {
      form.append('file', request.file);
    }
    // CHO-1819 P4: when a mixed-type plan is supplied, the batch becomes the
    // single-pass set lane — question_type flips to "mixed", count is the sum,
    // and the per-type quotas ride `settings.type_plan` (the backend validates
    // them via aiassist.NewTypePlan). Empty/absent ⇒ the legacy single-type
    // settings byte-for-byte unchanged.
    const plan = request.type_plan ?? [];
    const mixed = plan.length > 0;
    const planTotal = plan.reduce((sum, q) => sum + q.count, 0);
    const settings: Record<string, unknown> = {
      job_type: request.job_type,
      question_type: mixed ? 'mixed' : request.question_type,
      count: mixed ? planTotal : request.question_count,
      difficulty: request.difficulty,
      grounding_mode: request.grounding_mode,
      context: request.context ?? '',
    };
    if (mixed) {
      settings['type_plan'] = plan.map((q) => ({
        question_type: q.question_type,
        count: q.count,
        max_images: q.max_images,
        // CHO-1825 — deterministic per-type image toggles. Emitted only when set
        // (proto3-omit-false parity), so a plan with no forced images keeps the
        // byte-identical 3-key quota shape the backend already validates.
        ...(q.image_for_stem ? { image_for_stem: true } : {}),
        ...(q.image_for_answer ? { image_for_answer: true } : {}),
      }));
    }
    // CHO-1657 — preserve the author hint map through the batch settings
    // passthrough (subject / cognitive_level / difficulty); only when non-empty.
    if (request.metadata && Object.keys(request.metadata).length > 0) {
      settings['metadata'] = request.metadata;
    }
    form.append('settings', JSON.stringify(settings));
    return form;
  }

  /**
   * GET /api/atoms/{atom_id}/question-jobs/{job_id} — uniform D4 poll.
   * Returns the same `QuestionGenerationJob` envelope for paths 2/3/4.
   * Consumer applies backoff (2s/4s/8s/16s) or honours `poll_after_ms`
   * when present on the envelope.
   */
  pollGenerationJob(
    atomId: string,
    jobId: string,
  ): Observable<QuestionGenerationJob> {
    return this.bff.get<QuestionGenerationJob>(
      `/api/atoms/${encodeURIComponent(atomId)}/question-jobs/${encodeURIComponent(jobId)}`,
    );
  }

  /**
   * POST /api/atoms/{atom_id}/question-jobs/{job_id}/accept — commit
   * a subset of AI candidates. The unselected candidates are simply not
   * committed; no separate reject route exists (BE design D2 +
   * acceptance subset semantics handle the "delete-AI-candidate" UX
   * implicitly). For batch jobs the per-item 5-mana debit is applied
   * here; for single-question jobs the up-front debit is the only one.
   */
  acceptGenerationJob(
    atomId: string,
    jobId: string,
    request: AcceptGenerationJobRequest,
  ): Observable<AcceptGenerationJobResponse> {
    return this.bff.post<AcceptGenerationJobResponse>(
      `/api/atoms/${encodeURIComponent(atomId)}/question-jobs/${encodeURIComponent(jobId)}/accept`,
      request,
    );
  }

  /**
   * POST /api/atoms/{atom_id}/question-jobs/{parent_job_id}/regenerate-image —
   * CHO-1819 P3 review image regenerate. Creates a lightweight `image_regen` job
   * that re-renders ONE image (stem|answer) for a single candidate of the parent
   * batch job with a refined prompt, WITHOUT re-running the batch. Returns 202 +
   * the image_regen `QuestionGenerationJob` envelope; the caller polls it via
   * `pollGenerationJob` until `succeeded` (its `candidate_questions` then carries
   * the 1-element `[{draft_id, placement, image_url}]` patch the chora-creation
   * terminal stamps) or `failed`. The PARENT job stays `succeeded` — only the
   * targeted candidate image changes. `Idempotency-Key` header is contract-
   * mandated for the question-jobs mutating surface (mirrors the sibling POSTs).
   */
  regenerateImage(
    atomId: string,
    parentJobId: string,
    request: RegenerateImageRequest,
    idempotencyKey: string,
  ): Observable<QuestionGenerationJob> {
    const headers = new HttpHeaders({ 'Idempotency-Key': idempotencyKey });
    return this.bff.post<QuestionGenerationJob>(
      `/api/atoms/${encodeURIComponent(atomId)}/question-jobs/${encodeURIComponent(parentJobId)}/regenerate-image`,
      request,
      { headers },
    );
  }
}
