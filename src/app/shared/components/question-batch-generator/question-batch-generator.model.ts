/**
 * Shared mixed-type batch composer model (CHO-1819 P4).
 *
 * The composer lets an author build a batch as a list of per-type quotas
 * (e.g. 8 MCQ + 2 OE), each optionally illustrated up to a per-type image cap.
 * It emits a {@link QuestionBatchPlan} the embedding surface (A+ atom authoring,
 * R+ assessment authoring) maps onto the backend `settings.type_plan`.
 */

/** Question types the composer supports (Phyllis scope). */
export type ComposerQuestionType = 'mcq' | 'oe';

/** One per-type quota row in the composer. */
export interface ComposerQuotaRow {
  readonly question_type: ComposerQuestionType;
  /** Questions of this type (>= 1). */
  readonly count: number;
  /** How many of this type's questions MAY get an AI image (0..count). */
  readonly max_images: number;
  /**
   * CHO-1825 — deterministic per-type author toggle. When true, EVERY question
   * of this type MUST carry a STEM image (independent of the discretionary
   * `max_images` AI budget). Absent/false ⇒ no forced stem image.
   */
  readonly image_for_stem?: boolean;
  /**
   * CHO-1825 — deterministic per-type author toggle. When true, EVERY question
   * of this type MUST carry a MODEL-ANSWER image. Absent/false ⇒ none.
   */
  readonly image_for_answer?: boolean;
}

/**
 * The composer's emitted plan. `valid` gates the embedding surface's Generate
 * CTA; `type_plan` is the per-type breakdown with `max_images` already zeroed
 * when the master "Allow AI images" toggle is off (so the surface never has to
 * re-derive it).
 */
export interface QuestionBatchPlan {
  readonly type_plan: readonly ComposerQuotaRow[];
  /** Sum of all quota counts. */
  readonly total: number;
  /** True when the "Allow AI images" master toggle is on. */
  readonly allow_images: boolean;
  /** True when total ∈ [1, maxTotal] and every quota is well-formed. */
  readonly valid: boolean;
}

/** Human label for a question type (FE display only). */
export const COMPOSER_TYPE_LABEL: Readonly<Record<ComposerQuestionType, string>> = {
  mcq: 'Multiple choice',
  oe: 'Open-ended',
};
