/**
 * `unified-mana.preview.ts` — CHO-1826 U4.3 unified authoring mana preview.
 *
 * Pure tally over the SELECTED review items, implementing the `PreviewManaFn`
 * contract declared in `unified-review.model.ts`. No Angular, no side effects —
 * a single deterministic pass so the parent UnifiedAtomAuthoringComponent and
 * the presentational review list can both derive the indicative accept-time
 * mana figure from the same source.
 *
 * Tiering (per the contract JSDoc): an AI row whose candidate carries a stem
 * (`image_url`) and/or model-answer (`answer_image_url`) image is the IMAGE
 * tier (×MANA_PER_IMAGE_QUESTION); any other AI row is the TEXT tier
 * (×MANA_PER_TEXT_QUESTION); a manual row is FREE (×MANA_PER_MANUAL_QUESTION).
 * The backend price-plan layer (ADR-178) is AUTHORITATIVE — this drives the FE
 * PREVIEW only (label it "approx" in the UI).
 */
import {
  MANA_PER_IMAGE_QUESTION,
  MANA_PER_MANUAL_QUESTION,
  MANA_PER_TEXT_QUESTION,
  type ManaPreview,
  type PreviewManaFn,
  type UnifiedReviewItem,
} from './unified-review.model';

/** True when `value` is a non-empty string (a real image URL is present). */
function hasImage(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0;
}

/**
 * `previewAcceptMana` — tally the SELECTED items into a `ManaPreview`. An AI row
 * is the image tier when its candidate carries a stem and/or answer image, else
 * the text tier; manual rows are free. Deselected items are ignored entirely.
 * `total = text×MANA_PER_TEXT_QUESTION + image×MANA_PER_IMAGE_QUESTION +
 * manual×MANA_PER_MANUAL_QUESTION`.
 */
export const previewAcceptMana: PreviewManaFn = (
  items: readonly UnifiedReviewItem[],
): ManaPreview => {
  let textCount = 0;
  let imageCount = 0;
  let manualCount = 0;

  for (const item of items) {
    if (!item.selected) {
      continue;
    }
    if (item.kind === 'manual') {
      manualCount += 1;
      continue;
    }
    // kind === 'ai': image tier when the candidate carries any image.
    const { candidate } = item;
    if (hasImage(candidate.image_url) || hasImage(candidate.answer_image_url)) {
      imageCount += 1;
    } else {
      textCount += 1;
    }
  }

  const total =
    textCount * MANA_PER_TEXT_QUESTION +
    imageCount * MANA_PER_IMAGE_QUESTION +
    manualCount * MANA_PER_MANUAL_QUESTION;

  return { textCount, imageCount, manualCount, total };
};
