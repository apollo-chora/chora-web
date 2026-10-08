/**
 * Survey domain models for post-course feedback, survey templates,
 * questions, responses, and analytics.
 *
 * Source of truth: chora-contracts/openapi/delivery-admin.yaml
 * Backend returns snake_case JSON — these interfaces match directly.
 */

// ---------------------------------------------------------------------------
// Enums / Literal Unions
// ---------------------------------------------------------------------------

export type SurveyStatus = 'draft' | 'published' | 'archived';

export type QuestionType = 'rating' | 'text' | 'multiple_choice' | 'scale';

// ---------------------------------------------------------------------------
// Survey Template (aggregate root)
// ---------------------------------------------------------------------------

export interface SurveyTemplate {
  id: string;
  tenant_id: string;
  title: string;
  description: string;
  status: SurveyStatus;
  linked_session_id: string | null;
  question_count: number;
  created_by_gcid: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Survey Question (child entity — accessed via aggregate root)
// ---------------------------------------------------------------------------

export interface SurveyQuestion {
  id: string;
  question_text: string;
  question_type: QuestionType;
  options: Record<string, unknown>;
  order_index: number;
  required: boolean;
}

// ---------------------------------------------------------------------------
// Survey Detail (template + questions)
// ---------------------------------------------------------------------------

export interface SurveyDetail extends SurveyTemplate {
  questions: SurveyQuestion[];
}

// ---------------------------------------------------------------------------
// Survey Response (append-only)
// ---------------------------------------------------------------------------

export interface SurveyResponse {
  id: string;
  survey_id: string;
  gcid: string;
  answers: Record<string, unknown>;
  completed_at: string;
}

// ---------------------------------------------------------------------------
// Survey Analytics
// ---------------------------------------------------------------------------

export interface QuestionBreakdown {
  question_id: string;
  question_text: string;
  question_type: string;
  average_value: number | null;
  response_count: number;
}

export interface SurveyAnalytics {
  survey_id: string;
  response_count: number;
  completion_rate: number;
  average_rating: number | null;
  question_breakdowns: QuestionBreakdown[];
}

// ---------------------------------------------------------------------------
// Request Payloads
// ---------------------------------------------------------------------------

export interface QuestionInput {
  question_text: string;
  question_type: QuestionType;
  options?: Record<string, unknown>;
  required?: boolean;
}

export interface CreateSurveyRequest {
  title: string;
  description?: string;
  linked_session_id?: string;
  questions: QuestionInput[];
}

export interface UpdateSurveyRequest {
  title: string;
  description?: string;
  questions?: QuestionInput[];
}

export interface SubmitResponseRequest {
  answers: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// List Responses (paginated)
// ---------------------------------------------------------------------------

export interface SurveyListResponse {
  data: SurveyTemplate[];
}

// ---------------------------------------------------------------------------
// Wire DTOs (CHO-2353)
//
// What chora-delivery ACTUALLY returns, verified live 2026-07-23. This feature
// was originally authored against a different, imagined contract; the service
// is the adapter seam that translates these into the model types above, so the
// components and templates keep working against one shape.
//
// Do not widen the model to match the wire: the templates already switch on
// `question_type: rating|text|multiple_choice|scale`, and the wire vocabulary
// (LIKERT|TEXT|MCQ) is a delivery-domain concern.
// ---------------------------------------------------------------------------

/** Backend Survey FSM. Distinct from the FE `SurveyStatus` filter vocabulary. */
export type WireSurveyState = 'DRAFT' | 'DISTRIBUTED' | 'CLOSED';

export interface WireSurveyQuestion {
  question_id: string;
  prompt: string;
  /** LIKERT (1-5) | TEXT | MCQ. Unknown values degrade to a text control. */
  type: string;
}

export interface WireSurvey {
  id: string;
  tenant_id?: string;
  course_id?: string;
  title: string;
  state: WireSurveyState;
  questions?: WireSurveyQuestion[];
  distributed_to?: string[];
  response_count?: number;
  distributed_at?: string;
  closed_at?: string;
  created_at?: string;
  updated_at?: string;
}

/** GET /api/v1/surveys envelope. Note `items`, not `data`. */
export interface WireSurveyListResponse {
  items?: WireSurvey[];
}

/** POST /api/v1/surveys/{id}/responses body. `value` is always a string. */
export interface WireAnswer {
  question_id: string;
  value: string;
}

export interface ResponseListResponse {
  data: SurveyResponse[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALL_SURVEY_STATUSES: SurveyStatus[] = [
  'draft',
  'published',
  'archived',
];

export const ALL_QUESTION_TYPES: QuestionType[] = [
  'rating',
  'text',
  'multiple_choice',
  'scale',
];

// ---------------------------------------------------------------------------
// Label Maps (i18n keys)
// ---------------------------------------------------------------------------

export const SURVEY_STATUS_LABELS: Record<SurveyStatus, string> = {
  draft: 'survey.status_draft',
  published: 'survey.status_published',
  archived: 'survey.status_archived',
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  rating: 'survey.question_type_rating',
  text: 'survey.question_type_text',
  multiple_choice: 'survey.question_type_multiple_choice',
  scale: 'survey.question_type_scale',
};

// ---------------------------------------------------------------------------
// Discriminated Union States
// ---------------------------------------------------------------------------

export type SurveyListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; surveys: SurveyTemplate[] }
  | { status: 'error'; error: { code: string; message: string } };

export type SurveyDetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; survey: SurveyDetail }
  | { status: 'error'; error: { code: string; message: string } };

export type SurveyResponseState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; response: SurveyResponse }
  | { status: 'error'; error: { code: string; message: string } };

export type SurveyAnalyticsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; analytics: SurveyAnalytics }
  | { status: 'error'; error: { code: string; message: string } };

export type ResponseListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; responses: SurveyResponse[] }
  | { status: 'error'; error: { code: string; message: string } };
