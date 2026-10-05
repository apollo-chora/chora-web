/**
 * CHO-1826 U4.3 — unified authoring accept-request builder.
 *
 * Pure function (NO Angular, no side effects). Maps the interleaved review
 * list (AI drafts + inline manual questions, in the author's commit order)
 * into the single `POST .../question-jobs/{job_id}/accept` body
 * (`AcceptGenerationJobRequest`). Implements `BuildAcceptRequestFn` exactly
 * per the JSDoc contract in `unified-review.model.ts`.
 *
 * Byte-stability: an UNTOUCHED, selected AI row commits as just `{ draft_id }`
 * (no override keys); override keys are emitted only when an edit/title/test-set
 * actually carries them — so the toggle-OFF request is bit-identical to the
 * pre-1c shape. Mirrors `batch-authoring.component.ts::accept()`, extended for
 * inline manual candidates (no draft_id) per CHO-1826 U4.
 */
import type {
  AcceptedCandidate,
  AcceptTestSetBlock,
  AcceptTestSetItem,
  McqPayload,
  OePayload,
  QuestionDraftCandidate,
} from '../atom-authoring.model';
import type { EditableQuestion } from '../../../../../shared/components/chora-question-editor/chora-question-editor.model';
import type { BuildAcceptRequestFn } from './unified-review.model';

/**
 * Build the typed payload override from the live editable state. MCQ maps each
 * option (empty option_id ⇒ backend assigns a UUIDv7 on persist); OE emits a
 * fresh `{ model_answer }` ONLY (the unified contract rebuilds the OE override
 * from `edit`, never spreading the candidate's other oe_payload fields).
 */
function buildPayloadOverride(
  edit: EditableQuestion,
): { mcq_payload_override: McqPayload } | { oe_payload_override: OePayload } {
  if (edit.question_type === 'mcq') {
    const payload: McqPayload = {
      options: edit.options.map((o) => ({
        option_id: o.option_id ?? '',
        label: o.label.trim(),
        is_correct: o.is_correct,
        explainer: o.explainer.trim(),
      })),
    };
    return { mcq_payload_override: payload };
  }
  return { oe_payload_override: { model_answer: edit.model_answer.trim() } };
}

/**
 * Re-attach the ORIGINAL candidate's image URLs (only the ones present). When
 * an AI row is edited, the override REPLACES the stored draft payload
 * server-side, so a text-only override would otherwise silently drop the
 * generated stem/answer images.
 */
function reattachImages(
  candidate: QuestionDraftCandidate,
): { image_url?: string; answer_image_url?: string } {
  const out: { image_url?: string; answer_image_url?: string } = {};
  if (candidate.image_url) {
    out.image_url = candidate.image_url;
  }
  if (candidate.answer_image_url) {
    out.answer_image_url = candidate.answer_image_url;
  }
  return out;
}

/** `atom_meta_override: { title }` fragment — only when titleOverride is non-empty after trim. */
function titleMetaOverride(
  titleOverride: string | undefined,
): { atom_meta_override?: { title: string } } {
  const title = titleOverride?.trim();
  return title ? { atom_meta_override: { title } } : {};
}

export const buildAcceptRequest: BuildAcceptRequestFn = (items, testSet) => {
  const acceptedCandidates: AcceptedCandidate[] = [];

  for (const item of items) {
    if (!item.selected) continue;

    if (item.kind === 'ai') {
      let out: AcceptedCandidate = { draft_id: item.draftId };
      if (item.edited) {
        out = {
          ...out,
          prompt_override: item.edit.prompt.trim(),
          ...buildPayloadOverride(item.edit),
          ...reattachImages(item.candidate),
        };
      }
      // titleOverride is independent of `edited` — an untouched AI row can
      // still carry an atom-title rename.
      out = { ...out, ...titleMetaOverride(item.titleOverride) };
      acceptedCandidates.push(out);
    } else {
      // Manual (inline) candidate: NO draft_id. The backend mints its own
      // atom (source_type=manual, FREE) from type + prompt_override +
      // *_payload_override.
      let out: AcceptedCandidate = {
        type: item.edit.question_type,
        prompt_override: item.edit.prompt.trim(),
        ...buildPayloadOverride(item.edit),
      };
      out = { ...out, ...titleMetaOverride(item.titleOverride) };
      acceptedCandidates.push(out);
    }
  }

  // Toggle OFF / absent ⇒ omit the test_set key entirely (byte-identical to
  // the pre-1c accept shape).
  if (!testSet?.enabled) {
    return { accepted_candidates: acceptedCandidates };
  }

  // KNOWN LIMITATION (U4.3): only AI rows carry a draft_id. Manual rows have
  // no draft_id, so they CANNOT be referenced by a test-set item — manual
  // questions still commit as their own atoms, just never into the test set.
  const testSetItems: AcceptTestSetItem[] = [];
  for (const item of items) {
    if (!item.selected || item.kind !== 'ai') continue;
    testSetItems.push({
      draft_id: item.draftId,
      points: testSet.pointsByKey?.[item.draftId] ?? 1,
      display_order: testSetItems.length + 1,
    });
  }

  const description = testSet.description?.trim();
  const testSetBlock: AcceptTestSetBlock = {
    title: testSet.title.trim(),
    ...(description ? { description } : {}),
    items: testSetItems,
  };

  return { accepted_candidates: acceptedCandidates, test_set: testSetBlock };
};
