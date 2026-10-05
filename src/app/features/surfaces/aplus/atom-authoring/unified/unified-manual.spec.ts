import { describe, it, expect } from 'vitest';

import {
  MIN_MCQ_OPTIONS,
  type EditableQuestion,
} from '../../../../../shared/components/chora-question-editor/chora-question-editor.model';
import type { UnifiedManualRow } from './unified-review.model';
import {
  manualRowToReviewItem,
  newManualRow,
  validateManualRow,
} from './unified-manual';

const E = 'shared.question_editor.error';

describe('newManualRow', () => {
  it('mcq: blank prompt + ≥2 empty options, exactly one correct (the first)', () => {
    const row = newManualRow('mcq');

    expect(row.edit.question_type).toBe('mcq');
    expect(row.edit.prompt).toBe('');
    expect(row.edit.model_answer).toBe('');

    // ≥ MIN_MCQ_OPTIONS options, all blank (empty label + explainer).
    expect(row.edit.options.length).toBeGreaterThanOrEqual(MIN_MCQ_OPTIONS);
    expect(row.edit.options.length).toBeGreaterThanOrEqual(2);
    for (const opt of row.edit.options) {
      expect(opt.label).toBe('');
      expect(opt.explainer).toBe('');
      expect(opt.option_id).toBeNull();
    }

    // Exactly one correct, and it is the FIRST option.
    expect(row.edit.options.filter((o) => o.is_correct)).toHaveLength(1);
    expect(row.edit.options[0].is_correct).toBe(true);
    expect(row.edit.options.every((o, i) => o.is_correct === (i === 0))).toBe(
      true,
    );
  });

  it('oe: question_type oe, empty model_answer, no options, blank prompt', () => {
    const row = newManualRow('oe');

    expect(row.edit.question_type).toBe('oe');
    expect(row.edit.prompt).toBe('');
    expect(row.edit.model_answer).toBe('');
    expect(row.edit.options).toEqual([]);
  });

  it('assigns a non-empty tempId', () => {
    const row = newManualRow('mcq');
    expect(typeof row.tempId).toBe('string');
    expect(row.tempId.length).toBeGreaterThan(0);
  });

  it('two calls yield DISTINCT tempIds', () => {
    const a = newManualRow('mcq');
    const b = newManualRow('mcq');
    const c = newManualRow('oe');
    expect(a.tempId).not.toBe(b.tempId);
    expect(a.tempId).not.toBe(c.tempId);
    expect(b.tempId).not.toBe(c.tempId);
  });
});

describe('validateManualRow', () => {
  it('a fresh MCQ row is INVALID (empty prompt + empty option labels)', () => {
    const result = validateManualRow(newManualRow('mcq'));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`${E}.prompt_required`);
    expect(result.errors).toContain(`${E}.option_label_required`);
    // Explainer is OPTIONAL (ADR-189) — blank explainers must NOT invalidate.
    expect(result.errors).not.toContain(`${E}.option_explainer_required`);
    // The starter set already has exactly one correct option, so the
    // exactly-one-correct rule must NOT fire on a fresh row.
    expect(result.errors).not.toContain(`${E}.exactly_one_correct`);
  });

  it('a fresh OE row is INVALID (empty prompt)', () => {
    const result = validateManualRow(newManualRow('oe'));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`${E}.prompt_required`);
  });

  it('a fully-populated MCQ row is VALID', () => {
    const edit: EditableQuestion = {
      question_type: 'mcq',
      prompt: 'What is 2 + 2?',
      options: [
        { option_id: null, label: '3', is_correct: false, explainer: 'Too low.' },
        { option_id: null, label: '4', is_correct: true, explainer: 'Correct sum.' },
      ],
      model_answer: '',
    };
    const row: UnifiedManualRow = { tempId: 'manual-mcq-1', edit };

    const result = validateManualRow(row);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('a fully-populated OE row is VALID', () => {
    const edit: EditableQuestion = {
      question_type: 'oe',
      prompt: 'Explain photosynthesis.',
      options: [],
      model_answer: 'Plants convert light into chemical energy.',
    };
    const row: UnifiedManualRow = { tempId: 'manual-oe-1', edit };

    const result = validateManualRow(row);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('manualRowToReviewItem', () => {
  it("maps fields and sets kind 'manual' (selected defaults to true)", () => {
    const row = newManualRow('mcq');

    const item = manualRowToReviewItem(row);

    expect(item.kind).toBe('manual');
    expect(item.selected).toBe(true);
    if (item.kind === 'manual') {
      expect(item.tempId).toBe(row.tempId);
      expect(item.edit).toBe(row.edit); // same reference — live edits flow through
    }
    // The manual variant carries no AI-only fields.
    expect('draftId' in item).toBe(false);
    expect('candidate' in item).toBe(false);
  });

  it('honours an explicit selected=false', () => {
    const row = newManualRow('oe');

    const item = manualRowToReviewItem(row, false);

    expect(item.kind).toBe('manual');
    expect(item.selected).toBe(false);
  });
});
