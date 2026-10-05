import { describe, it, expect } from 'vitest';
import {
  isAtomType,
  isAtomStatus,
  hasHints,
  hasStem,
  ATOM_TYPE_LABELS,
  ATOM_TYPE_ICONS,
  VALIDATION_RULE_LABELS,
  type AtomType,
  type AtomStatus,
  type ValidationRuleType,
} from './atom.models';

describe('atom.models type guards', () => {
  describe('isAtomType', () => {
    it('returns true for valid atom types', () => {
      const validTypes: AtomType[] = [
        'multiple_choice', 'fill_blank', 'true_false', 'short_answer',
        'matching', 'ordering', 'code', 'essay', 'multimedia', 'simulation',
      ];
      for (const t of validTypes) {
        expect(isAtomType(t)).toBe(true);
      }
    });

    it('returns false for invalid strings', () => {
      expect(isAtomType('unknown')).toBe(false);
      expect(isAtomType('')).toBe(false);
      expect(isAtomType('MULTIPLE_CHOICE')).toBe(false);
    });
  });

  describe('isAtomStatus', () => {
    it('returns true for valid statuses', () => {
      const validStatuses: AtomStatus[] = ['draft', 'published', 'archived'];
      for (const s of validStatuses) {
        expect(isAtomStatus(s)).toBe(true);
      }
    });

    it('returns false for invalid strings', () => {
      expect(isAtomStatus('active')).toBe(false);
      expect(isAtomStatus('PUBLISHED')).toBe(false);
    });
  });

  describe('hasHints', () => {
    it('returns true when content has hints array', () => {
      const content = {
        stem: 'What is 2+2?',
        options: [{ id: 1, text: '3' }, { id: 2, text: '4' }],
        hints: ['Think about basic addition'],
      } as Record<string, unknown>;
      expect(hasHints(content)).toBe(true);
    });

    it('returns false when content has no hints', () => {
      const content = { front: 'Capital of France', back: 'Paris' } as Record<string, unknown>;
      expect(hasHints(content)).toBe(false);
    });

    it('returns false when hints is not an array', () => {
      const content = { stem: 'test', hints: 'not-an-array' } as Record<string, unknown>;
      expect(hasHints(content)).toBe(false);
    });
  });

  describe('hasStem', () => {
    it('returns true when content has a stem string', () => {
      const content = {
        stem: 'What is 2+2?',
        options: [{ id: 1, text: '4' }],
      } as Record<string, unknown>;
      expect(hasStem(content)).toBe(true);
    });

    it('returns false when content has no stem', () => {
      const content = { front: 'Q', back: 'A' } as Record<string, unknown>;
      expect(hasStem(content)).toBe(false);
    });

    it('returns false when stem is not a string', () => {
      const content = { stem: 42 } as Record<string, unknown>;
      expect(hasStem(content)).toBe(false);
    });
  });
});

describe('atom.models constants', () => {
  it('ATOM_TYPE_LABELS has an entry for every AtomType', () => {
    const allTypes: AtomType[] = [
      'multiple_choice', 'fill_blank', 'true_false', 'short_answer',
      'matching', 'ordering', 'code', 'essay', 'multimedia', 'simulation',
    ];
    for (const t of allTypes) {
      expect(ATOM_TYPE_LABELS[t]).toBeTruthy();
    }
    expect(Object.keys(ATOM_TYPE_LABELS)).toHaveLength(10);
  });

  it('ATOM_TYPE_ICONS has an entry for every AtomType', () => {
    const allTypes: AtomType[] = [
      'multiple_choice', 'fill_blank', 'true_false', 'short_answer',
      'matching', 'ordering', 'code', 'essay', 'multimedia', 'simulation',
    ];
    for (const t of allTypes) {
      expect(ATOM_TYPE_ICONS[t]).toBeTruthy();
    }
    expect(Object.keys(ATOM_TYPE_ICONS)).toHaveLength(10);
  });

  it('VALIDATION_RULE_LABELS has an entry for every ValidationRuleType', () => {
    const allRules: ValidationRuleType[] = [
      'exact_match', 'regex', 'range', 'keyword', 'manual', 'llm_graded',
    ];
    for (const r of allRules) {
      expect(VALIDATION_RULE_LABELS[r]).toBeTruthy();
    }
    expect(Object.keys(VALIDATION_RULE_LABELS)).toHaveLength(6);
  });
});
