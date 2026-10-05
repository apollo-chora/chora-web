/**
 * CHO-1826 U4.3 — unified-authoring manual-row helpers.
 *
 * Pure logic (NO Angular): factory + validation + projection for a
 * hand-authored ("manual") question row in the interleaved review list. A
 * manual row carries an FE-only `tempId` (never sent on the wire) and a live
 * `EditableQuestion`; it commits as an INLINE AcceptedCandidate (no draft_id)
 * via the accept builder. Validation reuses the shared question-editor rules so
 * the manual path is gated identically to the AI-edit path.
 */
import {
  blankOption,
  MIN_MCQ_OPTIONS,
  validateEditableQuestion,
  type EditableOption,
  type EditableQuestion,
  type QuestionValidation,
} from '../../../../../shared/components/chora-question-editor/chora-question-editor.model';
import type {
  UnifiedManualRow,
  UnifiedReviewItem,
} from './unified-review.model';

/**
 * A fresh, collision-resistant temp id for a manual row. Prefers the platform
 * `crypto.randomUUID()`; falls back to a time+random token when the Web Crypto
 * API is unavailable (e.g. a non-secure context or an old test runtime).
 */
function newTempId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The MCQ starter option set: `MIN_MCQ_OPTIONS` blank options with the FIRST
 * marked correct, satisfying the editor's exactly-one-correct invariant out of
 * the gate. The author then fills labels/explainers and may move the correct
 * marker or add options (up to MAX_MCQ_OPTIONS).
 */
function mcqStarterOptions(): EditableOption[] {
  return Array.from({ length: MIN_MCQ_OPTIONS }, (_unused, index) => ({
    ...blankOption(),
    is_correct: index === 0,
  }));
}

/**
 * Build a fresh manual row of the given type with a blank `EditableQuestion`.
 * MCQ seeds `MIN_MCQ_OPTIONS` empty options (first correct); OE seeds no
 * options. Prompt + model_answer start empty.
 */
export function newManualRow(type: 'mcq' | 'oe'): UnifiedManualRow {
  const edit: EditableQuestion =
    type === 'mcq'
      ? {
          question_type: 'mcq',
          prompt: '',
          options: mcqStarterOptions(),
          model_answer: '',
        }
      : {
          question_type: 'oe',
          prompt: '',
          options: [],
          model_answer: '',
        };
  return { tempId: newTempId(), edit };
}

/**
 * Validate a manual row by delegating to the shared question-editor validator —
 * the manual path is gated by exactly the same rules as the AI-edit path
 * (non-empty prompt; MCQ: 2-6 options, every label + explainer non-empty,
 * exactly one correct).
 */
export function validateManualRow(row: UnifiedManualRow): QuestionValidation {
  return validateEditableQuestion(row.edit);
}

/**
 * Project a manual row into its `UnifiedReviewItem` (the `kind: 'manual'`
 * variant) for the interleaved review list. `selected` gates inclusion in the
 * accept (defaults to selected). The `edit` reference is shared, so live edits
 * to the row stay reflected in the review item.
 */
export function manualRowToReviewItem(
  row: UnifiedManualRow,
  selected = true,
): UnifiedReviewItem {
  return {
    kind: 'manual',
    tempId: row.tempId,
    edit: row.edit,
    selected,
  };
}
