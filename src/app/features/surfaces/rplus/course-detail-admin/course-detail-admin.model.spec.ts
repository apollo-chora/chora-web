import { describe, it, expect } from 'vitest';
import {
  reorderAtoms,
  courseStatusBadgeVariant,
  type CourseAtom,
} from './course-detail-admin.model';

const a = (
  id: string,
  position: number,
  status: 'Draft' | 'Published' = 'Published',
): CourseAtom => ({
  atomId: id,
  title: `Atom ${id}`,
  position,
  status,
  topic: 'Scrum',
  estimatedMinutes: 12,
});

describe('course-detail-admin.model — reorderAtoms', () => {
  const seed: CourseAtom[] = [a('1', 1), a('2', 2), a('3', 3), a('4', 4)];

  it('moves an atom up by 1 position (delta = -1)', () => {
    const out = reorderAtoms(seed, '3', -1);
    expect(out.map((x) => x.atomId)).toEqual(['1', '3', '2', '4']);
  });

  it('moves an atom down by 1 position (delta = +1)', () => {
    const out = reorderAtoms(seed, '2', 1);
    expect(out.map((x) => x.atomId)).toEqual(['1', '3', '2', '4']);
  });

  it('clamps an overflow positive delta to the array end', () => {
    const out = reorderAtoms(seed, '1', 99);
    expect(out.map((x) => x.atomId)).toEqual(['2', '3', '4', '1']);
  });

  it('clamps an overflow negative delta to the array start', () => {
    const out = reorderAtoms(seed, '4', -99);
    expect(out.map((x) => x.atomId)).toEqual(['4', '1', '2', '3']);
  });

  it('re-stamps 1-based positions after the move', () => {
    const out = reorderAtoms(seed, '3', -2);
    expect(out.map((x) => x.position)).toEqual([1, 2, 3, 4]);
    expect(out[0].atomId).toBe('3');
  });

  it('returns the input unchanged for an unknown atom id', () => {
    const out = reorderAtoms(seed, 'unknown', 1);
    expect(out).toBe(seed);
  });

  it('returns the input unchanged for a no-op delta', () => {
    const out = reorderAtoms(seed, '2', 0);
    expect(out).toBe(seed);
  });

  it('does not mutate the input array', () => {
    const snapshot = seed.map((x) => x.atomId);
    reorderAtoms(seed, '4', -2);
    expect(seed.map((x) => x.atomId)).toEqual(snapshot);
  });
});

describe('course-detail-admin.model — courseStatusBadgeVariant', () => {
  it('Published → badge-success', () => {
    expect(courseStatusBadgeVariant('Published')).toBe('badge-success');
  });
  it('Draft → badge-warning', () => {
    expect(courseStatusBadgeVariant('Draft')).toBe('badge-warning');
  });
  it('Awaiting Review → badge-info', () => {
    expect(courseStatusBadgeVariant('Awaiting Review')).toBe('badge-info');
  });
  it('Archived → badge-neutral', () => {
    expect(courseStatusBadgeVariant('Archived')).toBe('badge-neutral');
  });
});
