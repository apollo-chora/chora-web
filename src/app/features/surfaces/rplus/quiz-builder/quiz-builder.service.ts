/**
 * QuizBuilderService — R+ M9 wave-5 (real BFF wiring).
 *
 * Calls chora-gateway BFF which proxies verbatim to chora-delivery's
 * live_quiz_handler.go (M9 wave-5 BE landed in this same commit). 5 ops:
 *
 *   1. list()            — GET   /api/v1/live-quizzes
 *   2. get(id)           — GET   /api/v1/live-quizzes/{id}
 *   3. create(req)       — POST  /api/v1/live-quizzes        → DRAFT
 *   4. update(id, patch) — PATCH /api/v1/live-quizzes/{id}   → EditDraft
 *   5. publish(id)       — POST  /api/v1/live-quizzes/{id}/publish → PUBLISHED
 *
 * The wave-3 hard-coded CSPO fixture (`getCspoDraft()`) is REMOVED per
 * `feedback_no_stubs_real_wiring` — empty BE list ⇒ empty FE list (the
 * composer renders the "Start a new quiz" empty state).
 *
 * Tenant + GCID propagation: the chora-gateway BFF stamps validated mesh
 * claims (RequireChoraSessionJWT). chora-delivery's handler scopes list +
 * single-row lookups by tenant via X-Tenant-Id; no explicit tenant_id
 * param is sent on the wire.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  mapBackendLiveQuiz,
  type BackendLiveQuiz,
  type BackendLiveQuizList,
  type BackendLiveQuizQuestion,
  type QuizDraft,
} from './quiz-builder.model';

/** Create payload (matches BE createLiveQuizReq). */
export interface CreateLiveQuizRequest {
  readonly courseId: string;
  readonly title: string;
}

/** Patch payload (matches BE patchLiveQuizReq). */
export interface PatchLiveQuizRequest {
  readonly title: string;
  readonly questions: readonly BackendLiveQuizQuestion[];
  /** Whole-quiz time budget in seconds (ADR-168 Task #9). */
  readonly quiz_time_limit_seconds?: number;
  /** Post-reveal explainer disclosure policy (ADR-168 Task #9). */
  readonly explainer_mode?: string;
}

@Injectable({ providedIn: 'root' })
export class QuizBuilderService {
  private readonly bff = inject(BffClientService);

  /** GET /api/v1/live-quizzes — list current-tenant quizzes. */
  list(): Observable<readonly QuizDraft[]> {
    return this.bff
      .get<BackendLiveQuizList>('/api/v1/live-quizzes')
      .pipe(
        map((resp) => (resp.items ?? []).map(mapBackendLiveQuiz)),
      );
  }

  /** GET /api/v1/live-quizzes/{id} — single quiz. */
  get(id: string): Observable<QuizDraft> {
    return this.bff
      .get<BackendLiveQuiz>(`/api/v1/live-quizzes/${encodeURIComponent(id)}`)
      .pipe(map(mapBackendLiveQuiz));
  }

  /** POST /api/v1/live-quizzes — create DRAFT. */
  create(req: CreateLiveQuizRequest): Observable<QuizDraft> {
    return this.bff
      .post<BackendLiveQuiz>('/api/v1/live-quizzes', {
        course_id: req.courseId,
        title: req.title,
      })
      .pipe(map(mapBackendLiveQuiz));
  }

  /** PATCH /api/v1/live-quizzes/{id} — EditDraft (DRAFT-only; 409 otherwise). */
  update(id: string, patch: PatchLiveQuizRequest): Observable<QuizDraft> {
    return this.bff
      .patch<BackendLiveQuiz>(
        `/api/v1/live-quizzes/${encodeURIComponent(id)}`,
        patch,
      )
      .pipe(map(mapBackendLiveQuiz));
  }

  /** POST /api/v1/live-quizzes/{id}/publish — DRAFT → PUBLISHED. */
  publish(id: string): Observable<QuizDraft> {
    return this.bff
      .post<BackendLiveQuiz>(
        `/api/v1/live-quizzes/${encodeURIComponent(id)}/publish`,
        {},
      )
      .pipe(map(mapBackendLiveQuiz));
  }
}
