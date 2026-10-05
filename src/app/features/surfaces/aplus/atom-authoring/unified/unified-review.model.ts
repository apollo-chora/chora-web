/**
 * Shared contract for the CHO-1826 U4.3 unified review + accept slice.
 *
 * Pure types + constants — NO Angular. Every U4.3 unit (the accept-request
 * builder, the mana-cost preview, the manual-row helpers, the presentational
 * review-list component) and the parent UnifiedAtomAuthoringComponent depend
 * ONLY on this file + existing model types, so they can be built in parallel
 * without colliding.
 */
import type {
  AcceptGenerationJobRequest,
  QuestionDraftCandidate,
} from '../atom-authoring.model';
import type { EditableQuestion } from '../../../../../shared/components/chora-question-editor/chora-question-editor.model';

/**
 * Indicative per-question accept-time mana prices (CHO-1826 U3b catalogue
 * floor). The backend price-plan layer (ADR-178) is AUTHORITATIVE — these
 * drive the FE PREVIEW only (label it "approx" in the UI). A question that
 * carries any image (stem and/or answer) is the image tier; manual questions
 * are free.
 */
export const MANA_PER_TEXT_QUESTION = 10;
export const MANA_PER_IMAGE_QUESTION = 20;
export const MANA_PER_MANUAL_QUESTION = 0;

/** Discriminator for a review row's origin. */
export type UnifiedReviewKind = 'ai' | 'manual';

/**
 * One row in the interleaved review list — either an AI-generated draft or a
 * hand-authored manual question. `selected` gates inclusion in the accept;
 * `edit` is the live editable state (seeded from the AI draft on first open,
 * or authored from scratch for a manual row). Order in the array is the
 * submission/commit order (drag-reorder mutates the array).
 */
export type UnifiedReviewItem =
  | {
      readonly kind: 'ai';
      /** The AI draft's id (the accept key for a draft-backed candidate). */
      readonly draftId: string;
      /** The original generated candidate — source of images + citations. */
      readonly candidate: QuestionDraftCandidate;
      /** Live editable state (seeded from `candidate`). */
      readonly edit: EditableQuestion;
      readonly selected: boolean;
      /** Optional per-atom title override (atom_meta_override.title). */
      readonly titleOverride?: string;
      /** True once the author changed `edit` from the generated seed —
       *  only then does the builder emit prompt/payload overrides
       *  (byte-stable: an untouched AI row commits as just {draft_id}). */
      readonly edited: boolean;
    }
  | {
      readonly kind: 'manual';
      /** FE-only temp id (never sent on the wire). */
      readonly tempId: string;
      readonly edit: EditableQuestion;
      readonly selected: boolean;
      readonly titleOverride?: string;
    };

/** A client-side, hand-authored question awaiting commit as an INLINE manual
 *  AcceptedCandidate (no draft_id). Thin wrapper the manual helpers produce. */
export interface UnifiedManualRow {
  readonly tempId: string;
  readonly edit: EditableQuestion;
}

/** Author-curated test-set composition (Lane 1c) carried on the accept. */
export interface UnifiedTestSetConfig {
  readonly enabled: boolean;
  readonly title: string;
  readonly description?: string;
  /** Per-row points, keyed by the row's draftId (AI) or tempId (manual). */
  readonly pointsByKey?: Readonly<Record<string, number>>;
}

/** Mana cost preview over the SELECTED items (indicative — see constants). */
export interface ManaPreview {
  readonly textCount: number; // selected AI text questions (×10)
  readonly imageCount: number; // selected AI image questions (×20)
  readonly manualCount: number; // selected manual questions (×0)
  readonly total: number; // indicative mana
}

// ── Function contracts the parallel units implement (separate files) ──────

/**
 * `unified-accept.builder.ts` — pure. Build the mixed accept request from the
 * SELECTED review items, preserving array order:
 *   - AI row   → { draft_id } always; if `edited` add prompt_override +
 *                mcq_payload_override|oe_payload_override (from `edit`) +
 *                (when the candidate carries images) image_url/answer_image_url;
 *                if `titleOverride` add atom_meta_override:{title}.
 *   - manual   → { type: edit.question_type, prompt_override: edit.prompt,
 *                mcq_payload_override|oe_payload_override (from `edit`),
 *                atom_meta_override:{title} when titleOverride }. No draft_id.
 *   - test_set → present only when cfg.enabled, items keyed in selected order
 *                (draft_id for AI; manual rows have no draft_id so they are
 *                NOT placed in test_set items — note this limitation).
 */
export type BuildAcceptRequestFn = (
  items: readonly UnifiedReviewItem[],
  testSet?: UnifiedTestSetConfig,
) => AcceptGenerationJobRequest;

/**
 * `unified-mana.preview.ts` — pure. Tally the SELECTED items: an AI row is the
 * image tier when its `candidate` carries a stem and/or answer image, else the
 * text tier; manual rows are free. total = text×10 + image×20.
 */
export type PreviewManaFn = (items: readonly UnifiedReviewItem[]) => ManaPreview;
