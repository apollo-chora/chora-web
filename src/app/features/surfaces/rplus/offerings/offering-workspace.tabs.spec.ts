/**
 * offering-workspace.tabs spec — the object-derived tab matrix (W2.D).
 *
 * Asserts each delivery_type yields the plan §4 tab set in order, that only
 * `overview` is available in P0, and that label keys are stable.
 */
import { describe, it, expect } from 'vitest';

import {
  offeringTabs,
  offeringTabLabelKey,
  type OfferingTabId,
} from './offering-workspace.tabs';

function ids(deliveryType: 'graduate' | 'short' | 'async'): readonly OfferingTabId[] {
  return offeringTabs(deliveryType).map((t) => t.id);
}

describe('offeringTabs', () => {
  it('derives the graduate tab set in plan order', () => {
    expect(ids('graduate')).toEqual([
      'overview',
      'curriculum',
      'prerequisites',
      'sections',
      'roster',
      'assessments',
      'certification',
      'transcript',
    ]);
  });

  it('derives the short-course tab set in plan order', () => {
    expect(ids('short')).toEqual([
      'overview',
      'prerequisites',
      'schedule',
      'roster',
      'attendance',
      'assessments',
      'certification',
    ]);
  });

  it('derives the async (lightest) tab set in plan order', () => {
    expect(ids('async')).toEqual(['overview', 'prerequisites', 'publish', 'analytics']);
  });

  it('includes prerequisites (ADR-226) in every delivery-type matrix (course-level, not delivery-gated)', () => {
    for (const dt of ['graduate', 'short', 'async'] as const) {
      expect(ids(dt)).toContain('prerequisites');
    }
  });

  it('always leads with overview', () => {
    for (const dt of ['graduate', 'short', 'async'] as const) {
      expect(offeringTabs(dt)[0].id).toBe('overview');
    }
  });

  it('marks every tab as available (W2.D/W3.A/W7/CHO-1985/CHO-1986/CHO-1987/ADR-226/W6) — transcript (W6) is the last to land, leaving no remaining placeholder', () => {
    const AVAILABLE: ReadonlySet<OfferingTabId> = new Set<OfferingTabId>([
      'overview',
      'curriculum',
      'prerequisites',
      'sections',
      'roster',
      'assessments',
      'certification',
      'transcript',
      'analytics',
      'schedule',
      'attendance',
      'publish',
    ]);
    for (const dt of ['graduate', 'short', 'async'] as const) {
      for (const tab of offeringTabs(dt)) {
        expect(tab.available).toBe(AVAILABLE.has(tab.id));
      }
    }
  });

  it('marks the graduate-only sections tab available (W7)', () => {
    const sections = offeringTabs('graduate').find((t) => t.id === 'sections');
    expect(sections?.available).toBe(true);
  });

  it('builds a stable, namespaced label key per tab', () => {
    expect(offeringTabLabelKey('overview')).toBe('rplus.offerings.workspace.tab.overview');
    expect(offeringTabLabelKey('transcript')).toBe('rplus.offerings.workspace.tab.transcript');
    for (const tab of offeringTabs('graduate')) {
      expect(tab.labelKey).toBe(`rplus.offerings.workspace.tab.${tab.id}`);
    }
  });
});
