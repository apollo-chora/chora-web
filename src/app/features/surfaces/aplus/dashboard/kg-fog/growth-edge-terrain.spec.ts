import { describe, expect, it } from 'vitest';

import {
  TERRAIN_DUE_LABEL_KEY,
  TERRAIN_LABEL_KEY,
  isDue,
  nextBestIndex,
  terrainBand,
  terrainLabelKey,
  terrainMasteryPercent,
} from './growth-edge-terrain';

describe('growth-edge-terrain (ADR-204 Slice A — weakness terrain)', () => {
  describe('terrainBand', () => {
    it('returns solid for a missing edge (null / undefined)', () => {
      expect(terrainBand(null)).toBe('solid');
      expect(terrainBand(undefined)).toBe('solid');
    });

    it('returns shaky at and above the 0.66 threshold', () => {
      expect(terrainBand({ strength: 0.66 })).toBe('shaky');
      expect(terrainBand({ strength: 0.9 })).toBe('shaky');
      expect(terrainBand({ strength: 1 })).toBe('shaky');
    });

    it('returns wobbly in the 0.33..0.66 band', () => {
      expect(terrainBand({ strength: 0.33 })).toBe('wobbly');
      expect(terrainBand({ strength: 0.5 })).toBe('wobbly');
      expect(terrainBand({ strength: 0.65 })).toBe('wobbly');
    });

    it('returns solid below 0.33 (mastered / fresh)', () => {
      expect(terrainBand({ strength: 0 })).toBe('solid');
      expect(terrainBand({ strength: 0.32 })).toBe('solid');
    });

    it('clamps out-of-range strengths before banding', () => {
      expect(terrainBand({ strength: 2 })).toBe('shaky');
      expect(terrainBand({ strength: -1 })).toBe('solid');
    });
  });

  describe('TERRAIN_LABEL_KEY / terrainLabelKey', () => {
    it('maps each band to its i18n key', () => {
      expect(TERRAIN_LABEL_KEY.shaky).toBe('aplus.kg_terrain.shaky');
      expect(TERRAIN_LABEL_KEY.wobbly).toBe('aplus.kg_terrain.wobbly');
      expect(TERRAIN_LABEL_KEY.solid).toBe('aplus.kg_terrain.solid');
    });

    it('resolves the label key straight from an edge', () => {
      expect(terrainLabelKey({ strength: 0.8 })).toBe('aplus.kg_terrain.shaky');
      expect(terrainLabelKey({ strength: 0.4 })).toBe('aplus.kg_terrain.wobbly');
      expect(terrainLabelKey(null)).toBe('aplus.kg_terrain.solid');
    });
  });

  describe('terrainMasteryPercent (mastery = 1 - strength, reuses the mastery helper)', () => {
    it('inverts strength into a 0..100 mastery percent', () => {
      expect(terrainMasteryPercent({ strength: 0 })).toBe(100);
      expect(terrainMasteryPercent({ strength: 1 })).toBe(0);
      expect(terrainMasteryPercent({ strength: 0.25 })).toBe(75);
    });

    it('treats a missing edge as fully mastered (100)', () => {
      expect(terrainMasteryPercent(null)).toBe(100);
      expect(terrainMasteryPercent(undefined)).toBe(100);
    });
  });

  describe('isDue (ADR-204 P2 — orthogonal due-⏰ overlay)', () => {
    it('is true whenever the edge carries isDue, regardless of colour band', () => {
      expect(isDue({ isDue: true })).toBe(true);
    });

    it('is false for a not-due, missing-flag, or missing edge', () => {
      expect(isDue({ isDue: false })).toBe(false);
      expect(isDue({})).toBe(false);
      expect(isDue(null)).toBe(false);
      expect(isDue(undefined)).toBe(false);
    });

    it('exposes the due i18n key', () => {
      expect(TERRAIN_DUE_LABEL_KEY).toBe('aplus.kg_terrain.due');
    });
  });

  describe('nextBestIndex (Slice C-base — deterministic next-best edge)', () => {
    it('returns the index of the single shakiest (max-strength) edge', () => {
      expect(
        nextBestIndex([{ strength: 0.2 }, { strength: 0.9 }, { strength: 0.5 }]),
      ).toBe(1);
    });

    it('skips null / undefined entries (no edge on screen)', () => {
      expect(nextBestIndex([null, undefined, { strength: 0.3 }])).toBe(2);
    });

    it('resolves ties to the earliest index (stable order)', () => {
      expect(nextBestIndex([{ strength: 0.7 }, { strength: 0.7 }])).toBe(0);
    });

    it('returns -1 when nothing carries an edge', () => {
      expect(nextBestIndex([null, undefined])).toBe(-1);
      expect(nextBestIndex([])).toBe(-1);
    });

    it('clamps out-of-range strengths before comparing', () => {
      expect(nextBestIndex([{ strength: 2 }, { strength: 0.9 }])).toBe(0);
    });
  });
});
