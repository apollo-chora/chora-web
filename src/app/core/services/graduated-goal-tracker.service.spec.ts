import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { GraduatedGoalTrackerService } from './graduated-goal-tracker.service';
import { AuthService } from '../auth/auth.service';

interface Goal {
  id: string;
  status: string;
  goal_label: string;
}

const goal = (id: string, status: 'active' | 'achieved'): Goal => ({
  id,
  status,
  goal_label: `Goal ${id}`,
});

describe('GraduatedGoalTrackerService (ADR-204 §3, CHO-1962)', () => {
  let svc: GraduatedGoalTrackerService;
  let currentGcid: string | null;

  beforeEach(() => {
    localStorage.clear();
    currentGcid = 'gcid-1';
    TestBed.configureTestingModule({
      providers: [
        GraduatedGoalTrackerService,
        { provide: AuthService, useValue: { gcid: () => currentGcid } },
      ],
    });
    svc = TestBed.inject(GraduatedGoalTrackerService);
  });

  it('first observation establishes a silent baseline (no celebration for pre-existing achieved)', () => {
    const newly = svc.detectNewlyGraduated([goal('a', 'achieved'), goal('b', 'active')]);
    expect(newly).toEqual([]);
  });

  it('returns a goal that transitions to achieved after the baseline', () => {
    svc.detectNewlyGraduated([goal('a', 'active'), goal('b', 'active')]); // baseline: none achieved
    const newly = svc.detectNewlyGraduated([goal('a', 'achieved'), goal('b', 'active')]);
    expect(newly.map((g) => g.id)).toEqual(['a']);
  });

  it('does not re-celebrate an already-seen achieved goal (dedup across calls)', () => {
    svc.detectNewlyGraduated([goal('a', 'active')]); // baseline
    expect(svc.detectNewlyGraduated([goal('a', 'achieved')]).map((g) => g.id)).toEqual(['a']);
    // Subsequent loads with the same achieved goal → nothing new.
    expect(svc.detectNewlyGraduated([goal('a', 'achieved')])).toEqual([]);
  });

  it('returns multiple newly-graduated goals at once', () => {
    svc.detectNewlyGraduated([goal('a', 'active'), goal('b', 'active')]); // baseline
    const newly = svc.detectNewlyGraduated([goal('a', 'achieved'), goal('b', 'achieved')]);
    expect(newly.map((g) => g.id).sort()).toEqual(['a', 'b']);
  });

  it('ignores active goals', () => {
    svc.detectNewlyGraduated([]); // baseline (empty)
    expect(svc.detectNewlyGraduated([goal('a', 'active'), goal('b', 'active')])).toEqual([]);
  });

  it('degrades safely (treats as baseline) when localStorage holds corrupt JSON', () => {
    localStorage.setItem('chora.graduated-goals.gcid-1', '{not-valid-json');
    // Corrupt store reads as null → first observation re-baselines silently,
    // never throwing into the render path.
    expect(svc.detectNewlyGraduated([goal('a', 'achieved')])).toEqual([]);
    // The re-written baseline now tracks 'a'; a brand-new graduation surfaces.
    expect(svc.detectNewlyGraduated([goal('a', 'achieved'), goal('z', 'achieved')]).map((g) => g.id)).toEqual(['z']);
  });

  it('treats a valid-but-non-array stored value as an empty baseline', () => {
    // Valid JSON that is not an array of ids → seen-set is empty, so currently-
    // achieved goals are surfaced rather than throwing.
    localStorage.setItem('chora.graduated-goals.gcid-1', '{"corrupt":true}');
    expect(svc.detectNewlyGraduated([goal('a', 'achieved')]).map((g) => g.id)).toEqual(['a']);
  });

  it('keys an anonymous learner (no GCID) under "anon"', () => {
    currentGcid = null;
    // First observation under the anon key baselines silently…
    expect(svc.detectNewlyGraduated([goal('a', 'achieved')])).toEqual([]);
    // …then a brand-new graduation surfaces for the same anon key.
    expect(svc.detectNewlyGraduated([goal('a', 'achieved'), goal('b', 'achieved')]).map((g) => g.id)).toEqual(['b']);
    expect(localStorage.getItem('chora.graduated-goals.anon')).not.toBeNull();
  });

  it('isolates baselines per GCID (no cross-user leak on a shared device)', () => {
    // Learner 1 baselines with "a" already achieved.
    svc.detectNewlyGraduated([goal('a', 'achieved')]);
    // Switch to a different learner — first observation is still a silent baseline.
    currentGcid = 'gcid-2';
    expect(svc.detectNewlyGraduated([goal('a', 'achieved')])).toEqual([]); // gcid-2 baseline
    expect(svc.detectNewlyGraduated([goal('a', 'achieved'), goal('z', 'achieved')]).map((g) => g.id)).toEqual(['z']);
    // Back to learner 1 — their baseline already had "a"; nothing new.
    currentGcid = 'gcid-1';
    expect(svc.detectNewlyGraduated([goal('a', 'achieved')])).toEqual([]);
  });
});
