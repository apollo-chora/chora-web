import { describe, it, expect } from 'vitest';

import { normalizeConceptKey } from './concept-key';

describe('normalizeConceptKey', () => {
  it('lowercases and collapses whitespace to a single hyphen', () => {
    expect(normalizeConceptKey('Multiplication Tables')).toBe(
      'multiplication-tables',
    );
    expect(normalizeConceptKey('Sprint   Planning')).toBe('sprint-planning');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeConceptKey('  Weak spot  ')).toBe('weak-spot');
  });

  it('is idempotent on an already-normalised slug', () => {
    expect(normalizeConceptKey('multiplication-tables')).toBe(
      'multiplication-tables',
    );
  });

  it('collapses punctuation runs to a single hyphen and strips edges', () => {
    expect(normalizeConceptKey('Photosynthesis (light reactions)!')).toBe(
      'photosynthesis-light-reactions',
    );
    expect(normalizeConceptKey('C++ & Rust')).toBe('c-rust');
    expect(normalizeConceptKey('a / b / c')).toBe('a-b-c');
  });

  it('returns an empty string for a title with no alphanumerics', () => {
    expect(normalizeConceptKey('   ')).toBe('');
    expect(normalizeConceptKey('!!!')).toBe('');
  });

  it('keeps interior digits', () => {
    expect(normalizeConceptKey('Story Points 101')).toBe('story-points-101');
  });
});
