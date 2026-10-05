import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { LastVisitedMapService } from './last-visited-map.service';
import { AuthService } from '../auth/auth.service';

/**
 * LastVisitedMapService spec — the FE-only, per-learner memory of the last map
 * (a Goal) the learner opened. Backs the dashboard map-preview card's honest
 * "last visited learning goal" surface + label. localStorage-backed, GCID-keyed,
 * fail-soft (a degraded read is `null`, never a throw). gcid is mocked as a real
 * signal because AuthService.gcid IS a signal (the computed tracks it).
 */
describe('LastVisitedMapService', () => {
  let svc: LastVisitedMapService;
  let gcid: ReturnType<typeof signal<string | null>>;

  beforeEach(() => {
    localStorage.clear();
    gcid = signal<string | null>('gcid-1');
    TestBed.configureTestingModule({
      providers: [
        LastVisitedMapService,
        { provide: AuthService, useValue: { gcid } },
      ],
    });
    svc = TestBed.inject(LastVisitedMapService);
  });

  afterEach(() => localStorage.clear());

  it('returns null before any visit is recorded', () => {
    expect(svc.lastVisitedId()).toBeNull();
  });

  it('records and reactively returns the last opened goalId', () => {
    svc.record('goal-a');
    expect(svc.lastVisitedId()).toBe('goal-a');
    svc.record('goal-b');
    expect(svc.lastVisitedId()).toBe('goal-b');
  });

  it('ignores an empty goalId (keeps the prior visit)', () => {
    svc.record('goal-a');
    svc.record('');
    expect(svc.lastVisitedId()).toBe('goal-a');
  });

  it('isolates the record per learner (GCID-keyed)', () => {
    svc.record('goal-a'); // under gcid-1
    gcid.set('gcid-2');
    expect(svc.lastVisitedId()).toBeNull(); // gcid-2 has none
    svc.record('goal-z');
    expect(svc.lastVisitedId()).toBe('goal-z');
    gcid.set('gcid-1');
    expect(svc.lastVisitedId()).toBe('goal-a'); // gcid-1 retained
  });

  it('persists in localStorage under a GCID-scoped key', () => {
    svc.record('goal-a');
    expect(localStorage.getItem('chora.last-visited-map.gcid-1')).toBe('goal-a');
  });

  it('degrades gracefully (no throw) when storage write fails', () => {
    const orig = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error('QuotaExceeded');
    };
    expect(() => svc.record('goal-a')).not.toThrow();
    localStorage.setItem = orig;
  });
});
