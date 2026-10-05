/**
 * SurveyService: REST adapter for survey templates and responses.
 *
 * Source of truth: chora-delivery's live /api/v1/surveys surface.
 *
 * CHO-2353: this service is the ADAPTER SEAM. The feature was originally
 * authored against a contract chora-delivery never implemented, so the wire
 * shape and the model shape genuinely differ; everything above this file works
 * against the model types, and the translation happens here and nowhere else.
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';
import type {
  SurveyTemplate,
  SurveyDetail,
  SurveyQuestion,
  QuestionType,
  SurveyStatus,
  SurveyResponse,
  SurveyListState,
  SurveyDetailState,
  SurveyResponseState,
  SurveyListResponse,
  SubmitResponseRequest,
  WireSurvey,
  WireSurveyListResponse,
  WireAnswer,
} from '../models/survey.model';

// ---------------------------------------------------------------------------
// Endpoint paths
// ---------------------------------------------------------------------------

const SURVEYS_PATH = '/api/v1/surveys';

// ---------------------------------------------------------------------------
// Wire -> model mapping (CHO-2353)
// ---------------------------------------------------------------------------

/**
 * Backend FSM -> the filter vocabulary the list UI already speaks.
 * CLOSED maps to `archived`: a closed survey no longer accepts responses, which
 * is what `archived` means to the learner-facing filter.
 */
function mapState(state: string | undefined): SurveyStatus {
  switch (state) {
    case 'DISTRIBUTED':
      return 'published';
    case 'CLOSED':
      return 'archived';
    default:
      return 'draft';
  }
}

/**
 * Backend question vocabulary -> the control the template renders.
 * LIKERT is a 1-5 scale, which is the template's `rating` control.
 *
 * An unrecognised wire type degrades to `text` rather than passing through.
 * Returning something unknown is what caused the original defect: no template
 * branch matched, so the question rendered with NO input at all and the learner
 * silently could not answer. A textarea is always answerable.
 */
function mapQuestionType(type: string | undefined): QuestionType {
  switch ((type ?? '').toUpperCase()) {
    case 'LIKERT':
      return 'rating';
    case 'MCQ':
      return 'multiple_choice';
    case 'SCALE':
      return 'scale';
    default:
      return 'text';
  }
}

function mapQuestion(q: { question_id: string; prompt: string; type: string }, idx: number): SurveyQuestion {
  return {
    id: q.question_id,
    question_text: q.prompt,
    question_type: mapQuestionType(q.type),
    options: {},
    order_index: idx,
    // The wire carries NO per-question required flag, so none is invented here.
    // Marking survey questions mandatory would block submission on an optional
    // free-text prompt ("what would you change?") and is a requirement the
    // delivery domain never expressed.
    required: false,
  };
}

function mapSurveyTemplate(w: WireSurvey): SurveyTemplate {
  return {
    id: w.id,
    tenant_id: w.tenant_id ?? '',
    title: w.title,
    description: '',
    status: mapState(w.state),
    linked_session_id: null,
    question_count: (w.questions ?? []).length,
    created_by_gcid: '',
    created_at: w.created_at ?? '',
    updated_at: w.updated_at ?? '',
  };
}

function mapSurveyDetail(w: WireSurvey): SurveyDetail {
  return {
    ...mapSurveyTemplate(w),
    questions: (w.questions ?? []).map(mapQuestion),
  };
}

/**
 * The form collects a Record<questionId, value>; the wire wants an array of
 * {question_id, value} with string values. Unanswered questions are omitted
 * rather than sent as null, which the backend would reject.
 */
function mapAnswers(answers: Record<string, unknown>): WireAnswer[] {
  return Object.entries(answers)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([question_id, v]) => ({ question_id, value: String(v) }));
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class SurveyService {
  private readonly bff = inject(BffClientService);

  // --- Signal state (private + readonly) ---
  private readonly _surveyListState = signal<SurveyListState>({ status: 'idle' });
  readonly surveyListState = this._surveyListState.asReadonly();

  private readonly _surveyDetailState = signal<SurveyDetailState>({ status: 'idle' });
  readonly surveyDetailState = this._surveyDetailState.asReadonly();

  private readonly _responseState = signal<SurveyResponseState>({ status: 'idle' });
  readonly responseState = this._responseState.asReadonly();

  // --- Computed ---
  readonly surveys = computed(() => {
    const s = this._surveyListState();
    return s.status === 'success' ? s.surveys : [];
  });

  readonly publishedSurveys = computed(() =>
    this.surveys().filter((s) => s.status === 'published'),
  );

  readonly surveyDetail = computed(() => {
    const s = this._surveyDetailState();
    return s.status === 'success' ? s.survey : null;
  });

  // -------------------------------------------------------------------------
  // Survey Template methods
  // -------------------------------------------------------------------------

  loadSurveys(): Observable<SurveyListResponse | null> {
    this._surveyListState.set({ status: 'loading' });

    return this.bff.get<WireSurveyListResponse>(SURVEYS_PATH).pipe(
      map((res): SurveyListResponse => ({
        data: (res?.items ?? []).map(mapSurveyTemplate),
      })),
      tap((res) => {
        this._surveyListState.set({ status: 'success', surveys: res.data });
      }),
      catchError((err: Error) => {
        this._surveyListState.set({
          status: 'error',
          error: { code: 'SURVEY_LIST_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  loadSurveyDetail(surveyId: string): Observable<SurveyDetail | null> {
    this._surveyDetailState.set({ status: 'loading' });

    return this.bff.get<WireSurvey>(
      `${SURVEYS_PATH}/${encodeURIComponent(surveyId)}`,
    ).pipe(
      map((w) => mapSurveyDetail(w)),
      tap((survey) => {
        this._surveyDetailState.set({ status: 'success', survey });
      }),
      catchError((err: Error) => {
        this._surveyDetailState.set({
          status: 'error',
          error: { code: 'SURVEY_DETAIL_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  submitResponse(surveyId: string, data: SubmitResponseRequest): Observable<SurveyResponse | null> {
    this._responseState.set({ status: 'loading' });

    return this.bff.post<SurveyResponse>(
      `${SURVEYS_PATH}/${encodeURIComponent(surveyId)}/responses`,
      { answers: mapAnswers(data.answers) },
    ).pipe(
      tap((response) => {
        this._responseState.set({ status: 'success', response });
      }),
      catchError((err: Error) => {
        this._responseState.set({
          status: 'error',
          error: { code: 'SURVEY_RESPONSE_SUBMIT_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // State reset
  // -------------------------------------------------------------------------

  resetState(): void {
    this._surveyListState.set({ status: 'idle' });
    this._surveyDetailState.set({ status: 'idle' });
    this._responseState.set({ status: 'idle' });
  }
}
