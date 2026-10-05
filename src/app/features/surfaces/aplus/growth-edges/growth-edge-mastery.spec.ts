import { describe, it, expect } from 'vitest';
import { masteryPercent, masteryLabelKey } from './growth-edge-mastery';

describe('growth-edge mastery helpers (ADR-196 B2)', () => {
  describe('masteryPercent', () => {
    it('inverts shakiness: strength 0 (mastered) → 100% full bar', () => {
      expect(masteryPercent(0)).toBe(100);
    });

    it('strength 1 (shakiest) → 0% empty bar', () => {
      expect(masteryPercent(1)).toBe(0);
    });

    it('a just-grown edge (strength 0.05) reads ~95% mastered', () => {
      expect(masteryPercent(0.05)).toBe(95);
    });

    it('rounds to the nearest integer', () => {
      expect(masteryPercent(0.333)).toBe(67); // (1-0.333)*100 = 66.7 → 67
    });

    it('clamps out-of-range inputs', () => {
      expect(masteryPercent(-0.5)).toBe(100);
      expect(masteryPercent(1.5)).toBe(0);
    });
  });

  describe('masteryLabelKey', () => {
    it('high shakiness → very shaky', () => {
      expect(masteryLabelKey(0.9)).toBe('aplus.growth_edges.shaky_high');
      expect(masteryLabelKey(0.75)).toBe('aplus.growth_edges.shaky_high');
    });

    it('mid shakiness → getting there', () => {
      expect(masteryLabelKey(0.6)).toBe('aplus.growth_edges.shaky_mid');
      expect(masteryLabelKey(0.4)).toBe('aplus.growth_edges.shaky_mid');
    });

    it('low shakiness (near grown) → almost grown', () => {
      expect(masteryLabelKey(0.2)).toBe('aplus.growth_edges.shaky_low');
      expect(masteryLabelKey(0.05)).toBe('aplus.growth_edges.shaky_low');
    });
  });
});
