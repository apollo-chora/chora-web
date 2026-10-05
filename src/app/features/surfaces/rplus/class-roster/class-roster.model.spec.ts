import { describe, it, expect } from 'vitest';
import { clampProgress, EMPTY_COHORT_ROSTER } from './class-roster.model';

describe('clampProgress', () => {
  it('returns 0 when value is negative (defensive)', () => {
    expect(clampProgress(-5)).toBe(0);
  });

  it('returns 0 for non-finite input', () => {
    expect(clampProgress(Number.NaN)).toBe(0);
    expect(clampProgress(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('clamps values above 100 down to 100', () => {
    expect(clampProgress(105)).toBe(100);
  });

  it('rounds to the nearest integer within range', () => {
    expect(clampProgress(33.3)).toBe(33);
    expect(clampProgress(91.7)).toBe(92);
  });

  it('passes through 0 and 100 unchanged', () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(100)).toBe(100);
  });
});

describe('EMPTY_COHORT_ROSTER', () => {
  it('is a stable empty sentinel with no learners', () => {
    expect(EMPTY_COHORT_ROSTER.learners).toEqual([]);
    expect(EMPTY_COHORT_ROSTER.rosterSize).toBe(0);
    expect(EMPTY_COHORT_ROSTER.courseId).toBe('');
    expect(EMPTY_COHORT_ROSTER.cohortName).toBe('');
  });
});
