/**
 * previewAcceptMana spec — CHO-1826 U4.3 unified authoring mana preview.
 *
 * Pure-logic tally over the SELECTED review items (the `PreviewManaFn`
 * contract). No Angular / TestBed — direct function calls with inline
 * UnifiedReviewItem fixtures. Asserts the text/image/manual tiering, the
 * selected-only gate, and that `total` derives from the exported constants.
 */
import { describe, it, expect } from 'vitest';

import { previewAcceptMana } from './unified-mana.preview';
import {
  MANA_PER_IMAGE_QUESTION,
  MANA_PER_MANUAL_QUESTION,
  MANA_PER_TEXT_QUESTION,
  type UnifiedReviewItem,
} from './unified-review.model';
import type { QuestionDraftCandidate } from '../atom-authoring.model';
import type { EditableQuestion } from '../../../../../shared/components/chora-question-editor/chora-question-editor.model';

// ── Fixtures ────────────────────────────────────────────────────────
function editStub(): EditableQuestion {
  return { question_type: 'mcq', prompt: 'q', options: [], model_answer: '' };
}

interface AiOpts {
  readonly selected: boolean;
  readonly draftId?: string;
  /** Set (incl. '') to put it on the candidate; omit to leave the field absent. */
  readonly imageUrl?: string;
  readonly answerImageUrl?: string;
}

/** Build an AI review row with a minimal candidate (optionally image-bearing). */
function aiItem(opts: AiOpts): UnifiedReviewItem {
  const draftId = opts.draftId ?? 'd-1';
  const candidate: QuestionDraftCandidate = {
    draft_id: draftId,
    type: 'mcq',
    prompt: 'What is photosynthesis?',
    mcq_payload: {
      options: [
        { option_id: '0', label: 'A', is_correct: true, explainer: 'yes' },
        { option_id: '1', label: 'B', is_correct: false, explainer: 'no' },
      ],
    },
    ...(opts.imageUrl !== undefined ? { image_url: opts.imageUrl } : {}),
    ...(opts.answerImageUrl !== undefined
      ? { answer_image_url: opts.answerImageUrl }
      : {}),
  };
  return {
    kind: 'ai',
    draftId,
    candidate,
    edit: editStub(),
    selected: opts.selected,
    edited: false,
  };
}

/** Build a manual (hand-authored, free) review row. */
function manualItem(opts: {
  readonly selected: boolean;
  readonly tempId?: string;
}): UnifiedReviewItem {
  return {
    kind: 'manual',
    tempId: opts.tempId ?? 'm-1',
    edit: editStub(),
    selected: opts.selected,
  };
}

// ── Specs ───────────────────────────────────────────────────────────
describe('previewAcceptMana', () => {
  it('returns all zeros for an empty array', () => {
    expect(previewAcceptMana([])).toEqual({
      textCount: 0,
      imageCount: 0,
      manualCount: 0,
      total: 0,
    });
  });

  it('tallies 3 selected AI text questions as text 3 / total 30', () => {
    const items: readonly UnifiedReviewItem[] = [
      aiItem({ selected: true, draftId: 'd-1' }),
      aiItem({ selected: true, draftId: 'd-2' }),
      aiItem({ selected: true, draftId: 'd-3' }),
    ];
    expect(previewAcceptMana(items)).toEqual({
      textCount: 3,
      imageCount: 0,
      manualCount: 0,
      total: 30,
    });
  });

  it('counts an AI row with a stem image_url as the image tier (+20)', () => {
    const items: readonly UnifiedReviewItem[] = [
      aiItem({ selected: true, imageUrl: 'https://cdn.chora/x.png' }),
    ];
    expect(previewAcceptMana(items)).toEqual({
      textCount: 0,
      imageCount: 1,
      manualCount: 0,
      total: 20,
    });
  });

  it('counts an AI row with ONLY answer_image_url as the image tier', () => {
    const items: readonly UnifiedReviewItem[] = [
      aiItem({ selected: true, answerImageUrl: 'https://cdn.chora/a.png' }),
    ];
    expect(previewAcceptMana(items)).toEqual({
      textCount: 0,
      imageCount: 1,
      manualCount: 0,
      total: 20,
    });
  });

  it('treats an empty-string image_url as the text tier (non-empty check)', () => {
    const items: readonly UnifiedReviewItem[] = [
      aiItem({ selected: true, imageUrl: '', answerImageUrl: '' }),
    ];
    expect(previewAcceptMana(items)).toEqual({
      textCount: 1,
      imageCount: 0,
      manualCount: 0,
      total: 10,
    });
  });

  it('counts selected manual rows as free (manualCount, 0 mana)', () => {
    const items: readonly UnifiedReviewItem[] = [
      manualItem({ selected: true, tempId: 'm-1' }),
      manualItem({ selected: true, tempId: 'm-2' }),
    ];
    expect(previewAcceptMana(items)).toEqual({
      textCount: 0,
      imageCount: 0,
      manualCount: 2,
      total: 0,
    });
  });

  it('tallies a mixed selection (2 text + 1 image + 1 manual) as total 40', () => {
    const items: readonly UnifiedReviewItem[] = [
      aiItem({ selected: true, draftId: 'd-1' }),
      aiItem({ selected: true, draftId: 'd-2' }),
      aiItem({ selected: true, draftId: 'd-3', imageUrl: 'https://cdn.chora/x.png' }),
      manualItem({ selected: true, tempId: 'm-1' }),
    ];
    expect(previewAcceptMana(items)).toEqual({
      textCount: 2,
      imageCount: 1,
      manualCount: 1,
      total: 40,
    });
  });

  it('excludes DESELECTED items from every tally', () => {
    const items: readonly UnifiedReviewItem[] = [
      aiItem({ selected: false, draftId: 'd-1' }), // text — excluded
      aiItem({ selected: false, draftId: 'd-2', imageUrl: 'https://cdn.chora/x.png' }), // image — excluded
      manualItem({ selected: false, tempId: 'm-1' }), // manual — excluded
      aiItem({ selected: true, draftId: 'd-3' }), // the only counted row
    ];
    expect(previewAcceptMana(items)).toEqual({
      textCount: 1,
      imageCount: 0,
      manualCount: 0,
      total: 10,
    });
  });

  it('derives total from the exported constants (not hardcoded literals)', () => {
    const items: readonly UnifiedReviewItem[] = [
      aiItem({ selected: true, draftId: 'd-1' }),
      aiItem({ selected: true, draftId: 'd-2', imageUrl: 'https://cdn.chora/x.png' }),
      manualItem({ selected: true, tempId: 'm-1' }),
    ];
    const expected =
      1 * MANA_PER_TEXT_QUESTION +
      1 * MANA_PER_IMAGE_QUESTION +
      1 * MANA_PER_MANUAL_QUESTION;
    expect(previewAcceptMana(items).total).toBe(expected);
  });
});
