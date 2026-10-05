import { describe, it, expect } from 'vitest';
import {
  IMDA_DIMENSIONS,
  RACI_MATRIX,
  type ImdaDimensionLabel,
} from './imda-dimensions';

describe('IMDA_DIMENSIONS catalogue (ADR-141 canonical)', () => {
  it('contains exactly 4 dimensions', () => {
    expect(IMDA_DIMENSIONS).toHaveLength(4);
  });

  it('numbers are 1..4 in order', () => {
    expect(IMDA_DIMENSIONS.map((d) => d.num)).toEqual([1, 2, 3, 4]);
  });

  it('uses the ADR-141 canonical labels (NOT v1 deprecated)', () => {
    const labels = IMDA_DIMENSIONS.map((d) => d.label);
    const expected: ImdaDimensionLabel[] = [
      'accountability',
      'transparency',
      'safety_and_robustness',
      'fairness_and_human_oversight',
    ];
    expect(labels).toEqual(expected);
  });

  it('does not contain any deprecated v1 labels', () => {
    const labels = IMDA_DIMENSIONS.map((d) => d.label as string);
    const deprecated = [
      'internal_governance',
      'risk_levels',
      'operations_management',
      'stakeholder_interaction',
    ];
    for (const bad of deprecated) {
      expect(labels).not.toContain(bad);
    }
  });

  it('each dimension has a matching accentClass dim-d{num}', () => {
    for (const d of IMDA_DIMENSIONS) {
      expect(d.accentClass).toBe(`dim-d${d.num}`);
    }
  });

  it('each dimension has at least one AI Verify principle', () => {
    for (const d of IMDA_DIMENSIONS) {
      expect(d.principles.length).toBeGreaterThan(0);
    }
  });
});

describe('RACI_MATRIX (Phase-D, static)', () => {
  it('has exactly 4 RACI entries', () => {
    expect(RACI_MATRIX).toHaveLength(4);
  });

  it('covers all 4 RACI roles', () => {
    const roles = RACI_MATRIX.map((r) => r.role);
    expect(roles).toContain('Responsible');
    expect(roles).toContain('Accountable');
    expect(roles).toContain('Consulted');
    expect(roles).toContain('Informed');
  });

  it('every entry has at least one item', () => {
    for (const r of RACI_MATRIX) {
      expect(r.items.length).toBeGreaterThan(0);
    }
  });
});
