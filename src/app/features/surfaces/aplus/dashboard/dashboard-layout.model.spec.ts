import { describe, it, expect } from 'vitest';

import {
  DEFAULT_ORDER,
  reconcileOrder,
  type WrapperKey,
} from './dashboard-layout.model';

describe('DEFAULT_ORDER', () => {
  it('is the map-dominant order [map, cast, courses, study, transcript]', () => {
    expect([...DEFAULT_ORDER]).toEqual([
      'map',
      'cast',
      'courses',
      'study',
      'transcript',
    ]);
  });

  it('places study immediately after courses — they are siblings', () => {
    // Both wrappers render LearningPaths; they differ ONLY by provenance
    // (source_type 'course' vs 'collection', ADR-233). Adjacency is the IA
    // claim: someone else's curriculum, then your own curation.
    const order = [...DEFAULT_ORDER];
    expect(order.indexOf('study')).toBe(order.indexOf('courses') + 1);
  });

  it('places transcript last — outcomes close the narrative', () => {
    // CHO-2237: the dashboard reads map → activity → their curriculum → your
    // curation → your OUTCOMES. The transcript is the record of what the rest
    // produced, so it anchors the tail.
    const order = [...DEFAULT_ORDER];
    expect(order[order.length - 1]).toBe('transcript');
  });
});

describe('reconcileOrder — the study wrapper migration (CHO-2217)', () => {
  it('appends study to an existing learner order WITHOUT disturbing their arrangement', () => {
    // The real migration case: every learner who ever reordered has a stored
    // 3-key order. Adding a wrapper must not reset or reshuffle it — the model
    // header is explicit that adding is reconcileOrder's job, not a rename.
    expect(reconcileOrder(['cast', 'courses', 'map'] as WrapperKey[])).toEqual([
      'cast',
      'courses',
      'map',
      'study',
      'transcript',
    ]);
  });

  it('keeps a learner who already has study exactly where they put it', () => {
    expect(
      reconcileOrder(['study', 'map', 'cast', 'courses'] as WrapperKey[]),
    ).toEqual(['study', 'map', 'cast', 'courses', 'transcript']);
  });
});

describe('reconcileOrder — the transcript wrapper migration (CHO-2237)', () => {
  it('appends transcript to an existing 4-key learner order WITHOUT disturbing it', () => {
    // Every learner who reordered after CHO-2226 has a stored 4-key order.
    expect(
      reconcileOrder(['study', 'cast', 'courses', 'map'] as WrapperKey[]),
    ).toEqual(['study', 'cast', 'courses', 'map', 'transcript']);
  });

  it('keeps a learner who already has transcript exactly where they put it', () => {
    expect(
      reconcileOrder([
        'transcript',
        'map',
        'cast',
        'courses',
        'study',
      ] as WrapperKey[]),
    ).toEqual(['transcript', 'map', 'cast', 'courses', 'study']);
  });
});

describe('reconcileOrder', () => {
  it('returns an unchanged, already-canonical candidate equal to itself', () => {
    expect(
      reconcileOrder(['map', 'cast', 'courses', 'study', 'transcript']),
    ).toEqual(['map', 'cast', 'courses', 'study', 'transcript']);
  });

  it('preserves a valid permutation of all known keys', () => {
    expect(
      reconcileOrder(['cast', 'transcript', 'study', 'courses', 'map']),
    ).toEqual(['cast', 'transcript', 'study', 'courses', 'map']);
  });

  it('drops keys not in the known set (a wrapper was removed)', () => {
    expect(
      reconcileOrder(['map', 'zzz', 'cast', 'courses', 'study'] as WrapperKey[]),
    ).toEqual(['map', 'cast', 'courses', 'study', 'transcript']);
  });

  it('appends missing known keys in DEFAULT_ORDER relative order (a wrapper was added)', () => {
    expect(reconcileOrder(['courses'])).toEqual([
      'courses',
      'map',
      'cast',
      'study',
      'transcript',
    ]);
    expect(reconcileOrder(['cast'])).toEqual([
      'cast',
      'map',
      'courses',
      'study',
      'transcript',
    ]);
    expect(reconcileOrder(['courses', 'map'])).toEqual([
      'courses',
      'map',
      'cast',
      'study',
      'transcript',
    ]);
  });

  it('dedupes, first occurrence wins', () => {
    expect(reconcileOrder(['map', 'map', 'cast', 'courses', 'cast'])).toEqual([
      'map',
      'cast',
      'courses',
      'study',
      'transcript',
    ]);
  });

  // These four assert the FALLBACK, so they compare against DEFAULT_ORDER
  // itself rather than restating its value. A literal here is a second copy of
  // the order that silently drifts the moment a wrapper is added — which is
  // exactly what happened when `study` landed.
  it('maps an empty candidate to DEFAULT_ORDER', () => {
    expect(reconcileOrder([])).toEqual([...DEFAULT_ORDER]);
  });

  it('maps null / undefined / non-array candidates to DEFAULT_ORDER', () => {
    expect(reconcileOrder(null)).toEqual([...DEFAULT_ORDER]);
    expect(reconcileOrder(undefined)).toEqual([...DEFAULT_ORDER]);
    expect(reconcileOrder('nope' as unknown as readonly WrapperKey[])).toEqual([
      ...DEFAULT_ORDER,
    ]);
  });

  it('maps an all-unknown candidate to DEFAULT_ORDER', () => {
    expect(
      reconcileOrder(['x', 'y'] as unknown as readonly WrapperKey[]),
    ).toEqual([...DEFAULT_ORDER]);
  });

  it('honours a shrunk known-key set — drops keys no longer registered', () => {
    expect(reconcileOrder(['map', 'cast', 'courses'], ['map', 'cast'])).toEqual([
      'map',
      'cast',
    ]);
  });

  it('does not mutate the input candidate', () => {
    const input: WrapperKey[] = ['courses'];
    reconcileOrder(input);
    expect(input).toEqual(['courses']);
  });
});
