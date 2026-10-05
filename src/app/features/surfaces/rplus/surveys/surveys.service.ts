/**
 * SurveysService — R+ /r/surveys BFF wiring (real, no stubs per
 * feedback_no_stubs_real_wiring).
 *
 * Per chora-web/CLAUDE.md §3 all HTTP goes through BffClientService. The
 * service surfaces seven operations matched 1:1 to the chora-delivery
 * survey_handler.go routes (mounted at /api/v1/surveys):
 *
 *   1. list(filters?)             — GET /api/v1/surveys[?state=DRAFT|...]
 *   2. get(id)                    — GET /api/v1/surveys/{id}
 *   3. create(req)                — POST /api/v1/surveys (DRAFT shell)
 *   4. publish(id, recipients)    — POST /api/v1/surveys/{id}/publish
 *   5. close(id)                  — POST /api/v1/surveys/{id}/close
 *   6. submitResponse(id, body)   — POST /api/v1/surveys/{id}/responses
 *   7. listResponses(id)          — GET /api/v1/surveys/{id}/responses
 *
 * Tenant + GCID are resolved off the validated mesh claims the chora-gateway
 * BFF stamps (RequireChoraSessionJWT). The downstream chora-delivery
 * handler scopes the list to the tenant via X-Tenant-Id; no explicit
 * tenant_id is sent on the wire.
 *
 * If the BFF/backend hasn't yet wired the route the call will 404/5xx —
 * per feedback_no_stubs_real_wiring we fail-loud here rather than fake
 * an in-memory result.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import type {
  QuestionType,
  Survey,
  SurveyAnswer,
  SurveyList,
  SurveyResponse,
  SurveyResponseList,
  SurveyState,
} from './surveys.model';

/**
 * Backend wire shape mirrors the snake_case envelope emitted by
 * services/chora-delivery/internal/adapter/http/survey_handler.go
 * ::surveyDTO. Optional fields land only after the corresponding
 * lifecycle transition.
 */
interface BackendSurveyQuestion {
  readonly question_id: string;
  readonly prompt: string;
  readonly type: QuestionType;
  readonly options?: readonly string[];
}

interface BackendSurvey {
  readonly id: string;
  readonly tenant_id: string;
  readonly course_id: string;
  readonly title: string;
  readonly questions: readonly BackendSurveyQuestion[];
  readonly distributed_to: readonly string[];
  readonly state: SurveyState;
  readonly response_count: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly distributed_at?: string;
  readonly closed_at?: string;
}

interface BackendSurveyList {
  readonly items: readonly BackendSurvey[];
}

interface BackendSurveyAnswer {
  readonly question_id: string;
  readonly value: string;
}

interface BackendSurveyResponse {
  readonly id: string;
  readonly survey_id: string;
  readonly gcid: string;
  readonly answers: readonly BackendSurveyAnswer[];
  readonly submitted_at: string;
}

interface BackendSurveyResponseList {
  readonly items: readonly BackendSurveyResponse[];
}

export interface SurveyListFilters {
  readonly state?: SurveyState;
}

export interface CreateSurveyQuestion {
  readonly questionId?: string;
  readonly prompt: string;
  readonly type: QuestionType;
  readonly options?: readonly string[];
}

export interface CreateSurveyRequest {
  readonly courseId: string;
  readonly title: string;
  readonly questions: readonly CreateSurveyQuestion[];
}

export interface SubmitSurveyResponseRequest {
  readonly answers: readonly SurveyAnswer[];
}

@Injectable({ providedIn: 'root' })
export class SurveysService {
  private readonly bff = inject(BffClientService);
  private readonly tenants = inject(TenantContextService);

  /**
   * List surveys for the current tenant. The optional `state` filter
   * narrows the projection at the wire — the backend already scopes the
   * list by tenant via the validated mesh claims (X-Tenant-Id), so no
   * tenant_id param is sent.
   */
  list(filters?: SurveyListFilters): Observable<SurveyList> {
    let params = new HttpParams();
    if (filters?.state) {
      params = params.set('state', filters.state);
    }
    const hasParams = params.keys().length > 0;
    return this.bff
      .get<BackendSurveyList>(
        '/api/v1/surveys',
        hasParams ? params : undefined,
      )
      .pipe(
        map((resp) => ({
          tenantName: this.tenants.currentTenant()?.name ?? 'Current tenant',
          totalSurveys: resp.items.length,
          items: resp.items.map(mapBackendSurvey),
        })),
      );
  }

  /** Single survey fetch — 404 from the BE bubbles up as an HTTP error. */
  get(surveyId: string): Observable<Survey> {
    return this.bff
      .get<BackendSurvey>(`/api/v1/surveys/${encodeURIComponent(surveyId)}`)
      .pipe(map(mapBackendSurvey));
  }

  /**
   * Create a DRAFT survey. The BFF stamps the author gcid header from
   * the validated mesh claims — the FE only forwards the body.
   */
  create(req: CreateSurveyRequest): Observable<Survey> {
    return this.bff
      .post<BackendSurvey>('/api/v1/surveys', {
        course_id: req.courseId,
        title: req.title,
        questions: req.questions.map((q) => ({
          ...(q.questionId ? { question_id: q.questionId } : {}),
          prompt: q.prompt,
          type: q.type,
          ...(q.options && q.options.length > 0
            ? { options: [...q.options] }
            : {}),
        })),
      })
      .pipe(map(mapBackendSurvey));
  }

  /**
   * Publish a DRAFT survey to the supplied recipient gcids. Maps onto the
   * domain's Survey.Distribute(recipients) — the URL action `/publish`
   * preserves instructor-facing terminology while the wire state value
   * stays DISTRIBUTED.
   */
  publish(surveyId: string, recipients: readonly string[]): Observable<Survey> {
    return this.bff
      .post<BackendSurvey>(
        `/api/v1/surveys/${encodeURIComponent(surveyId)}/publish`,
        { recipients: [...recipients] },
      )
      .pipe(map(mapBackendSurvey));
  }

  /** Close a DISTRIBUTED survey — no more responses accepted. */
  close(surveyId: string): Observable<Survey> {
    return this.bff
      .post<BackendSurvey>(
        `/api/v1/surveys/${encodeURIComponent(surveyId)}/close`,
        {},
      )
      .pipe(map(mapBackendSurvey));
  }

  /**
   * Submit a SurveyResponse on behalf of the calling learner (gcid stamped
   * by the BFF from validated mesh claims).
   */
  submitResponse(
    surveyId: string,
    req: SubmitSurveyResponseRequest,
  ): Observable<SurveyResponse> {
    return this.bff
      .post<BackendSurveyResponse>(
        `/api/v1/surveys/${encodeURIComponent(surveyId)}/responses`,
        {
          answers: req.answers.map((a) => ({
            question_id: a.questionId,
            value: a.value,
          })),
        },
      )
      .pipe(map(mapBackendResponse));
  }

  /**
   * Admin-only — list all SurveyResponses for the given survey. The BE
   * gates this to instructor / admin / training-admin.
   */
  listResponses(surveyId: string): Observable<SurveyResponseList> {
    return this.bff
      .get<BackendSurveyResponseList>(
        `/api/v1/surveys/${encodeURIComponent(surveyId)}/responses`,
      )
      .pipe(
        map((resp) => ({
          surveyId,
          totalResponses: resp.items.length,
          items: resp.items.map(mapBackendResponse),
        })),
      );
  }
}

function mapBackendSurvey(s: BackendSurvey): Survey {
  return {
    id: s.id,
    tenantId: s.tenant_id,
    courseId: s.course_id,
    title: s.title,
    questions: s.questions.map((q) => ({
      questionId: q.question_id,
      prompt: q.prompt,
      type: q.type,
      options: q.options ?? [],
    })),
    distributedTo: s.distributed_to ?? [],
    state: s.state,
    responseCount: s.response_count,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    distributedAt: s.distributed_at ?? null,
    closedAt: s.closed_at ?? null,
  };
}

function mapBackendResponse(r: BackendSurveyResponse): SurveyResponse {
  return {
    id: r.id,
    surveyId: r.survey_id,
    gcid: r.gcid,
    answers: r.answers.map((a) => ({
      questionId: a.question_id,
      value: a.value,
    })),
    submittedAt: r.submitted_at,
  };
}
