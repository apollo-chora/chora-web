/**
 * Surveys model — R+ /r/surveys surface (Wave-5 R+ Stage C-lite).
 *
 * Maps the chora-delivery GET /api/v1/surveys wire shape into the typed
 * FE model the R+ Surveys screen renders. Backend response shape (per
 * services/chora-delivery/internal/adapter/http/survey_handler.go::surveyDTO):
 *
 *   {
 *     items: [
 *       {
 *         id: string,
 *         tenant_id: string,
 *         course_id: string,
 *         title: string,
 *         questions: [
 *           { question_id: string, prompt: string, type: 'LIKERT' | 'TEXT' | 'MULTIPLE_CHOICE', options?: string[] }
 *         ],
 *         distributed_to: string[],            // gcids the survey was published to
 *         state: 'DRAFT' | 'DISTRIBUTED' | 'CLOSED',
 *         response_count: number,
 *         created_at: ISO8601,
 *         updated_at: ISO8601,
 *         distributed_at?: ISO8601,            // present once published
 *         closed_at?: ISO8601,                 // present once closed
 *       }, ...
 *     ]
 *   }
 *
 * Domain ↔ URL terminology reconciliation:
 *
 *   The instructor-facing CTA reads "Publish" (matches /publish URL action),
 *   but the canonical FSM state value is `DISTRIBUTED` per the
 *   chora-delivery domain. The FE preserves the wire value verbatim and
 *   renders the localised label via the i18n key
 *   `rplus.surveys.state.DISTRIBUTED` = "Published" so the user sees a
 *   coherent term while the wire stays honest to the domain (per
 *   feedback_no_stubs_real_wiring).
 *
 * Domain anchors:
 *   - `Survey` aggregate root — see services/chora-delivery/internal/
 *     domain/survey/survey.go (DRAFT → DISTRIBUTED → CLOSED FSM)
 *   - `SurveyResponse` aggregate — append-only, one row per (survey_id, gcid)
 *   - `LearningAtom` per CLAUDE.md remains the primary aggregate; Survey
 *     is a Delivery-domain feedback-collection artefact orthogonal to atoms.
 */

export type SurveyState = 'DRAFT' | 'DISTRIBUTED' | 'CLOSED';

export const SURVEY_STATES: readonly SurveyState[] = [
  'DRAFT',
  'DISTRIBUTED',
  'CLOSED',
];

export type QuestionType = 'LIKERT' | 'TEXT' | 'MULTIPLE_CHOICE';

export const QUESTION_TYPES: readonly QuestionType[] = [
  'LIKERT',
  'TEXT',
  'MULTIPLE_CHOICE',
];

export interface SurveyQuestion {
  /** Stable UUIDv7 — back-filled by the BE on create when omitted. */
  readonly questionId: string;
  /** Author-typed prompt. */
  readonly prompt: string;
  /** LIKERT (1-5) | TEXT (free-form) | MULTIPLE_CHOICE (options[]). */
  readonly type: QuestionType;
  /** Author-defined options — present iff type === MULTIPLE_CHOICE. */
  readonly options: readonly string[];
}

export interface Survey {
  /** Survey UUIDv7 — opaque stable id. */
  readonly id: string;
  /** Owning tenant id (always = current tenant — RLS-enforced). */
  readonly tenantId: string;
  /** Course the survey belongs to. */
  readonly courseId: string;
  /** Author-typed title. */
  readonly title: string;
  /** Author-defined question list. */
  readonly questions: readonly SurveyQuestion[];
  /** GCIDs the survey was published to (empty until DISTRIBUTED). */
  readonly distributedTo: readonly string[];
  /** Lifecycle FSM state. */
  readonly state: SurveyState;
  /** Running submitted-response count (admin projection). */
  readonly responseCount: number;
  /** RFC-3339 creation timestamp. */
  readonly createdAt: string;
  /** RFC-3339 last-update timestamp. */
  readonly updatedAt: string;
  /** RFC-3339 publish timestamp (null until DISTRIBUTED). */
  readonly distributedAt: string | null;
  /** RFC-3339 close timestamp (null until CLOSED). */
  readonly closedAt: string | null;
}

export interface SurveyList {
  /** Tenant display name (header pill — pulled from TenantContextService). */
  readonly tenantName: string;
  /** Total surveys count for the badge. */
  readonly totalSurveys: number;
  /** Survey rows sorted by created_at DESC (newest first). */
  readonly items: readonly Survey[];
}

export interface SurveyAnswer {
  readonly questionId: string;
  readonly value: string;
}

export interface SurveyResponse {
  readonly id: string;
  readonly surveyId: string;
  readonly gcid: string;
  readonly answers: readonly SurveyAnswer[];
  readonly submittedAt: string;
}

export interface SurveyResponseList {
  readonly surveyId: string;
  readonly totalResponses: number;
  readonly items: readonly SurveyResponse[];
}

export type StateBadgeVariant =
  | 'badge-neutral' // DRAFT (still being authored)
  | 'badge-success' // DISTRIBUTED (live + accepting responses)
  | 'badge-info'; // CLOSED (final)

/**
 * Returns the polyglass badge variant class for the given survey state.
 *   - DRAFT       → badge-neutral (still in author's hands)
 *   - DISTRIBUTED → badge-success (live + accepting responses)
 *   - CLOSED      → badge-info    (read-only summary)
 */
export function stateBadgeVariant(state: SurveyState): StateBadgeVariant {
  switch (state) {
    case 'DRAFT':
      return 'badge-neutral';
    case 'DISTRIBUTED':
      return 'badge-success';
    case 'CLOSED':
      return 'badge-info';
  }
}

/**
 * Returns the user-facing state label translation key. We map the canonical
 * domain state `DISTRIBUTED` onto an instructor-friendly localisation key
 * suffix so the FE can render "Published" while the wire stays
 * `DISTRIBUTED`.
 */
export function stateLabelKey(state: SurveyState): string {
  return `rplus.surveys.state.${state}`;
}

/**
 * Returns whether the survey can currently accept new responses. Mirrors
 * the BE `Survey.CanAcceptResponse()` (DISTRIBUTED only).
 */
export function canAcceptResponse(state: SurveyState): boolean {
  return state === 'DISTRIBUTED';
}

/**
 * Returns whether the publish action is available for the given state.
 * Only DRAFT surveys can be published.
 */
export function canPublish(state: SurveyState): boolean {
  return state === 'DRAFT';
}

/**
 * Returns whether the close action is available for the given state.
 * Only DISTRIBUTED surveys can be closed.
 */
export function canClose(state: SurveyState): boolean {
  return state === 'DISTRIBUTED';
}
