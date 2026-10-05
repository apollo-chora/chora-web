/**
 * unified-accept.builder spec — CHO-1826 U4.3 (unified authoring accept).
 *
 * Pure-logic coverage of `buildAcceptRequest`: AI draft rows (untouched /
 * edited MCQ / edited OE / image re-attach / title override), inline manual
 * rows (no draft_id), order preservation, deselection, and the curated
 * test_set block (AI-only items, default points, byte-stable omission).
 */
import { describe, it, expect } from 'vitest';

import { buildAcceptRequest } from './unified-accept.builder';
import type { UnifiedReviewItem } from './unified-review.model';
import type { EditableQuestion } from '../../../../../shared/components/chora-question-editor/chora-question-editor.model';
import type { QuestionDraftCandidate } from '../atom-authoring.model';

// ── Fixtures ──────────────────────────────────────────────────────────
function mcqEdit(over: Partial<EditableQuestion> = {}): EditableQuestion {
  return {
    question_type: 'mcq',
    prompt: 'What is 2 + 2?',
    options: [
      { option_id: 'o1', label: '4', is_correct: true, explainer: 'Correct.' },
      { option_id: 'o2', label: '5', is_correct: false, explainer: 'Nope.' },
    ],
    model_answer: '',
    ...over,
  };
}

function oeEdit(over: Partial<EditableQuestion> = {}): EditableQuestion {
  return {
    question_type: 'oe',
    prompt: 'Explain gravity.',
    options: [],
    model_answer: 'A force of attraction.',
    ...over,
  };
}

function mcqCandidate(
  over: Partial<QuestionDraftCandidate> = {},
): QuestionDraftCandidate {
  return {
    draft_id: 'd1',
    type: 'mcq',
    prompt: 'What is 2 + 2?',
    mcq_payload: {
      options: [
        { option_id: 'o1', label: '4', is_correct: true, explainer: 'Correct.' },
        { option_id: 'o2', label: '5', is_correct: false, explainer: 'Nope.' },
      ],
    },
    ...over,
  };
}

function oeCandidate(
  over: Partial<QuestionDraftCandidate> = {},
): QuestionDraftCandidate {
  return {
    draft_id: 'd2',
    type: 'oe',
    prompt: 'Explain gravity.',
    oe_payload: {
      model_answer: 'Original answer.',
      rubric: [{ criterion_id: 'c1', title: 'Clarity', weight: 1 }],
    },
    ...over,
  };
}

interface AiRowOpts {
  draftId?: string;
  candidate?: QuestionDraftCandidate;
  edit?: EditableQuestion;
  selected?: boolean;
  edited?: boolean;
  titleOverride?: string;
}

function aiRow(opts: AiRowOpts = {}): UnifiedReviewItem {
  const draftId = opts.draftId ?? 'd1';
  const base = {
    kind: 'ai' as const,
    draftId,
    candidate: opts.candidate ?? mcqCandidate({ draft_id: draftId }),
    edit: opts.edit ?? mcqEdit(),
    selected: opts.selected ?? true,
    edited: opts.edited ?? false,
  };
  return opts.titleOverride !== undefined
    ? { ...base, titleOverride: opts.titleOverride }
    : base;
}

interface ManualRowOpts {
  tempId?: string;
  edit?: EditableQuestion;
  selected?: boolean;
  titleOverride?: string;
}

function manualRow(opts: ManualRowOpts = {}): UnifiedReviewItem {
  const base = {
    kind: 'manual' as const,
    tempId: opts.tempId ?? 't1',
    edit: opts.edit ?? mcqEdit(),
    selected: opts.selected ?? true,
  };
  return opts.titleOverride !== undefined
    ? { ...base, titleOverride: opts.titleOverride }
    : base;
}

// ── AI rows ───────────────────────────────────────────────────────────
describe('buildAcceptRequest — AI rows', () => {
  it('emits exactly { draft_id } for an untouched selected AI row', () => {
    const req = buildAcceptRequest([aiRow({ draftId: 'd1', edited: false })]);
    expect(req.accepted_candidates).toEqual([{ draft_id: 'd1' }]);
    // Strict key check (toEqual ignores undefined props): no override leaks.
    expect(Object.keys(req.accepted_candidates[0])).toEqual(['draft_id']);
    expect('test_set' in req).toBe(false);
  });

  it('emits prompt_override + mcq_payload_override (trimmed, null→"") for an edited AI MCQ', () => {
    const edit = mcqEdit({
      prompt: '  Edited prompt  ',
      options: [
        { option_id: 'o1', label: ' A ', is_correct: true, explainer: ' ex A ' },
        { option_id: null, label: ' B ', is_correct: false, explainer: ' ex B ' },
      ],
    });
    const req = buildAcceptRequest([aiRow({ draftId: 'd1', edit, edited: true })]);
    expect(req.accepted_candidates[0]).toEqual({
      draft_id: 'd1',
      prompt_override: 'Edited prompt',
      mcq_payload_override: {
        options: [
          { option_id: 'o1', label: 'A', is_correct: true, explainer: 'ex A' },
          { option_id: '', label: 'B', is_correct: false, explainer: 'ex B' },
        ],
      },
    });
  });

  it('emits oe_payload_override { model_answer } only for an edited AI OE (drops candidate rubric)', () => {
    const candidate = oeCandidate({ draft_id: 'd2' });
    const edit = oeEdit({ prompt: '  OE prompt  ', model_answer: '  the answer  ' });
    const req = buildAcceptRequest([
      aiRow({ draftId: 'd2', candidate, edit, edited: true }),
    ]);
    expect(req.accepted_candidates[0]).toEqual({
      draft_id: 'd2',
      prompt_override: 'OE prompt',
      oe_payload_override: { model_answer: 'the answer' },
    });
  });

  it('re-attaches candidate.image_url (and answer_image_url) on an edited AI row', () => {
    const candidate = mcqCandidate({
      draft_id: 'd1',
      image_url: 'https://cdn/stem.png',
      answer_image_url: 'https://cdn/answer.png',
    });
    const req = buildAcceptRequest([
      aiRow({ draftId: 'd1', candidate, edited: true }),
    ]);
    const c = req.accepted_candidates[0];
    expect(c.image_url).toBe('https://cdn/stem.png');
    expect(c.answer_image_url).toBe('https://cdn/answer.png');
  });

  it('re-attaches only the present image (stem only ⇒ no answer_image_url key)', () => {
    const candidate = mcqCandidate({
      draft_id: 'd1',
      image_url: 'https://cdn/stem.png',
    });
    const req = buildAcceptRequest([
      aiRow({ draftId: 'd1', candidate, edited: true }),
    ]);
    const c = req.accepted_candidates[0];
    expect(c.image_url).toBe('https://cdn/stem.png');
    expect('answer_image_url' in c).toBe(false);
  });

  it('does NOT attach images on an UNEDITED AI row (override is not sent ⇒ draft keeps them)', () => {
    const candidate = mcqCandidate({
      draft_id: 'd1',
      image_url: 'https://cdn/stem.png',
    });
    const req = buildAcceptRequest([
      aiRow({ draftId: 'd1', candidate, edited: false }),
    ]);
    expect(Object.keys(req.accepted_candidates[0])).toEqual(['draft_id']);
  });

  it('adds atom_meta_override.title (trimmed) for an AI row with a titleOverride', () => {
    const req = buildAcceptRequest([
      aiRow({ draftId: 'd1', edited: false, titleOverride: '  My Title  ' }),
    ]);
    expect(req.accepted_candidates[0]).toEqual({
      draft_id: 'd1',
      atom_meta_override: { title: 'My Title' },
    });
  });

  it('ignores a whitespace-only titleOverride', () => {
    const req = buildAcceptRequest([
      aiRow({ draftId: 'd1', edited: false, titleOverride: '   ' }),
    ]);
    expect(Object.keys(req.accepted_candidates[0])).toEqual(['draft_id']);
  });
});

// ── Inline manual rows ────────────────────────────────────────────────
describe('buildAcceptRequest — inline manual rows', () => {
  it('emits an inline manual MCQ with type + overrides and NO draft_id', () => {
    const edit = mcqEdit({ prompt: '  Manual MCQ  ' });
    const req = buildAcceptRequest([manualRow({ edit })]);
    const c = req.accepted_candidates[0];
    expect('draft_id' in c).toBe(false);
    expect(c.type).toBe('mcq');
    expect(c.prompt_override).toBe('Manual MCQ');
    expect(c.mcq_payload_override).toEqual({
      options: [
        { option_id: 'o1', label: '4', is_correct: true, explainer: 'Correct.' },
        { option_id: 'o2', label: '5', is_correct: false, explainer: 'Nope.' },
      ],
    });
    expect(c.oe_payload_override).toBeUndefined();
  });

  it('emits an inline manual OE (with titleOverride) and NO draft_id', () => {
    const edit = oeEdit({ prompt: '  Manual OE  ', model_answer: '  ans  ' });
    const req = buildAcceptRequest([manualRow({ edit, titleOverride: 'T' })]);
    expect(req.accepted_candidates[0]).toEqual({
      type: 'oe',
      prompt_override: 'Manual OE',
      oe_payload_override: { model_answer: 'ans' },
      atom_meta_override: { title: 'T' },
    });
    expect('draft_id' in req.accepted_candidates[0]).toBe(false);
  });
});

// ── Selection + ordering ──────────────────────────────────────────────
describe('buildAcceptRequest — selection + ordering', () => {
  it('preserves array order across mixed AI + manual rows', () => {
    const req = buildAcceptRequest([
      aiRow({ draftId: 'd1', edited: false }),
      manualRow({ tempId: 't1', edit: mcqEdit() }),
      aiRow({ draftId: 'd2', candidate: mcqCandidate({ draft_id: 'd2' }), edited: false }),
    ]);
    expect(req.accepted_candidates).toHaveLength(3);
    expect(req.accepted_candidates[0].draft_id).toBe('d1');
    expect(req.accepted_candidates[1].draft_id).toBeUndefined();
    expect(req.accepted_candidates[1].type).toBe('mcq');
    expect(req.accepted_candidates[2].draft_id).toBe('d2');
  });

  it('excludes deselected rows (AI and manual)', () => {
    const req = buildAcceptRequest([
      aiRow({ draftId: 'd1', selected: false }),
      manualRow({ tempId: 't1', selected: false }),
      aiRow({ draftId: 'd2', selected: true, candidate: mcqCandidate({ draft_id: 'd2' }) }),
    ]);
    expect(req.accepted_candidates).toHaveLength(1);
    expect(req.accepted_candidates[0].draft_id).toBe('d2');
  });
});

// ── Test-set block ────────────────────────────────────────────────────
describe('buildAcceptRequest — test_set block', () => {
  it('builds the test_set with selected AI draft_id items in order + points, excluding manual + deselected', () => {
    const items = [
      aiRow({ draftId: 'd1', candidate: mcqCandidate({ draft_id: 'd1' }) }),
      manualRow({ tempId: 't1' }), // no draft_id → excluded from items
      aiRow({ draftId: 'd2', candidate: mcqCandidate({ draft_id: 'd2' }) }),
      aiRow({
        draftId: 'd3',
        selected: false,
        candidate: mcqCandidate({ draft_id: 'd3' }),
      }),
    ];
    const req = buildAcceptRequest(items, {
      enabled: true,
      title: '  My Test Set  ',
      description: '  desc  ',
      pointsByKey: { d1: 5, d2: 3 },
    });
    expect(req.test_set).toEqual({
      title: 'My Test Set',
      description: 'desc',
      items: [
        { draft_id: 'd1', points: 5, display_order: 1 },
        { draft_id: 'd2', points: 3, display_order: 2 },
      ],
    });
    // The manual row still commits as its own candidate (just not in the test set).
    expect(req.accepted_candidates).toHaveLength(3);
  });

  it('defaults points to 1 when a draftId is absent from pointsByKey, and omits description when absent', () => {
    const req = buildAcceptRequest(
      [aiRow({ draftId: 'd1', candidate: mcqCandidate({ draft_id: 'd1' }) })],
      { enabled: true, title: 'TS' },
    );
    expect(req.test_set?.items).toEqual([
      { draft_id: 'd1', points: 1, display_order: 1 },
    ]);
    expect('description' in (req.test_set ?? {})).toBe(false);
  });

  it('omits the test_set key entirely when disabled or absent', () => {
    const items = [aiRow({ draftId: 'd1' })];
    const disabled = buildAcceptRequest(items, { enabled: false, title: 'TS' });
    expect('test_set' in disabled).toBe(false);
    const absent = buildAcceptRequest(items);
    expect('test_set' in absent).toBe(false);
  });
});
