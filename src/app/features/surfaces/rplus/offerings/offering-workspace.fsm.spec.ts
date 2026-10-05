/**
 * offering-workspace.fsm spec — the object-derived lifecycle action matrix (W2.D).
 *
 * Asserts each FSM state yields exactly the legal transitions (mirroring the
 * backend offering.go FSM), in order (primary first, destructive archive last),
 * with archive flagged destructive and ARCHIVED terminal.
 */
import { describe, it, expect } from 'vitest';

import {
  offeringActions,
  offeringActionLabelKey,
  offeringConflictKey,
} from './offering-workspace.fsm';
import type { OfferingState } from './offerings.model';

function ids(state: OfferingState): readonly string[] {
  return offeringActions(state).map((a) => a.id);
}

describe('offeringActions', () => {
  it('DRAFT → launch then archive', () => {
    expect(ids('DRAFT')).toEqual(['launch', 'archive']);
  });

  it('LAUNCHED → start then archive', () => {
    expect(ids('LAUNCHED')).toEqual(['start', 'archive']);
  });

  it('RUNNING → conclude then archive', () => {
    expect(ids('RUNNING')).toEqual(['conclude', 'archive']);
  });

  it('CONCLUDED → archive only', () => {
    expect(ids('CONCLUDED')).toEqual(['archive']);
  });

  it('ARCHIVED → no actions (terminal)', () => {
    expect(offeringActions('ARCHIVED')).toEqual([]);
  });

  it('flags ONLY archive as destructive', () => {
    for (const state of ['DRAFT', 'LAUNCHED', 'RUNNING', 'CONCLUDED'] as const) {
      for (const a of offeringActions(state)) {
        expect(a.destructive).toBe(a.id === 'archive');
      }
    }
  });

  it('always trails with archive while non-terminal', () => {
    for (const state of ['DRAFT', 'LAUNCHED', 'RUNNING', 'CONCLUDED'] as const) {
      const list = offeringActions(state);
      expect(list[list.length - 1].id).toBe('archive');
    }
  });

  it('builds stable namespaced action + conflict keys', () => {
    expect(offeringActionLabelKey('launch')).toBe('rplus.offerings.workspace.action.launch');
    expect(offeringConflictKey('start')).toBe('rplus.offerings.workspace.conflict.start');
  });
});
