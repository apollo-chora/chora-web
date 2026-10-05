import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { GrownEdgeTrackerService } from './grown-edge-tracker.service';
import { AuthService } from '../auth/auth.service';

interface Edge {
  id: string;
  status: string;
  concept_label: string;
}

const edge = (id: string, status: 'active' | 'grown'): Edge => ({
  id,
  status,
  concept_label: `Concept ${id}`,
});

describe('GrownEdgeTrackerService (ADR-196 B2)', () => {
  let svc: GrownEdgeTrackerService;
  let currentGcid: string | null;

  beforeEach(() => {
    localStorage.clear();
    currentGcid = 'gcid-1';
    TestBed.configureTestingModule({
      providers: [
        GrownEdgeTrackerService,
        { provide: AuthService, useValue: { gcid: () => currentGcid } },
      ],
    });
    svc = TestBed.inject(GrownEdgeTrackerService);
  });

  it('first observation establishes a silent baseline (no celebration for pre-existing grown)', () => {
    const newly = svc.detectNewlyGrown([edge('a', 'grown'), edge('b', 'active')]);
    expect(newly).toEqual([]);
  });

  it('returns an edge that transitions to grown after the baseline', () => {
    svc.detectNewlyGrown([edge('a', 'active'), edge('b', 'active')]); // baseline: no grown
    const newly = svc.detectNewlyGrown([edge('a', 'grown'), edge('b', 'active')]);
    expect(newly.map((e) => e.id)).toEqual(['a']);
  });

  it('does not re-celebrate an already-seen grown edge', () => {
    svc.detectNewlyGrown([edge('a', 'active')]); // baseline
    expect(svc.detectNewlyGrown([edge('a', 'grown')]).map((e) => e.id)).toEqual(['a']);
    // Subsequent loads with the same grown edge → nothing new.
    expect(svc.detectNewlyGrown([edge('a', 'grown')])).toEqual([]);
  });

  it('returns multiple newly-grown edges at once', () => {
    svc.detectNewlyGrown([edge('a', 'active'), edge('b', 'active')]); // baseline
    const newly = svc.detectNewlyGrown([edge('a', 'grown'), edge('b', 'grown')]);
    expect(newly.map((e) => e.id).sort()).toEqual(['a', 'b']);
  });

  it('ignores active edges', () => {
    svc.detectNewlyGrown([]); // baseline (empty)
    expect(svc.detectNewlyGrown([edge('a', 'active'), edge('b', 'active')])).toEqual([]);
  });

  it('isolates baselines per GCID (no cross-user leak on a shared device)', () => {
    // Learner 1 baselines with "a" already grown.
    svc.detectNewlyGrown([edge('a', 'grown')]);
    // Switch to a different learner — "a" grown is NEW to them only if it
    // appears post-baseline; first observation is still a silent baseline.
    currentGcid = 'gcid-2';
    expect(svc.detectNewlyGrown([edge('a', 'grown')])).toEqual([]); // gcid-2 baseline
    expect(svc.detectNewlyGrown([edge('a', 'grown'), edge('z', 'grown')]).map((e) => e.id)).toEqual(['z']);
    // Back to learner 1 — their baseline already had "a"; nothing new.
    currentGcid = 'gcid-1';
    expect(svc.detectNewlyGrown([edge('a', 'grown')])).toEqual([]);
  });
});
