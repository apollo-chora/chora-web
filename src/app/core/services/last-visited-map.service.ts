import { Injectable, Signal, computed, inject, signal } from '@angular/core';

import { AuthService } from '../auth/auth.service';

/**
 * LastVisitedMapService — remembers which map (a Goal, ADR-214) the learner most
 * recently OPENED, so the A+ dashboard's map-preview card can honestly surface
 * (and label) the "last visited learning goal" instead of an arbitrary active
 * one. A learner holds several maps; this is the one they were last in.
 *
 * FE-only + best-effort: the open is recorded client-side because the Goal
 * aggregate carries no server-side "visited" timestamp (createdAt / updatedAt
 * track authoring, not viewing). Persisted per-learner in localStorage so it
 * survives reloads; a degraded read resolves to `null` (→ the card falls back to
 * the active goal) and NEVER throws into the render path. Mirrors
 * GrownEdgeTrackerService's per-GCID localStorage pattern.
 */
@Injectable({ providedIn: 'root' })
export class LastVisitedMapService {
  private readonly auth = inject(AuthService);
  private static readonly PREFIX = 'chora.last-visited-map.';

  /** Bumped on each record() so `lastVisitedId` re-reads storage reactively. */
  private readonly _rev = signal(0);

  /**
   * The goalId of the map the current learner most recently opened, or `null`
   * when none is recorded (or storage is unavailable). Reactive to record() and
   * to a learner switch (auth.gcid is a signal).
   */
  readonly lastVisitedId: Signal<string | null> = computed(() => {
    this._rev();
    return this.read(this.auth.gcid());
  });

  /**
   * Record that the learner opened the map for `goalId`. Best-effort no-op on an
   * empty id or unavailable storage.
   */
  record(goalId: string): void {
    if (!goalId) return;
    this.write(this.auth.gcid(), goalId);
    this._rev.update((n) => n + 1);
  }

  private storageKey(gcid: string | null): string {
    return LastVisitedMapService.PREFIX + (gcid ?? 'anon');
  }

  private read(gcid: string | null): string | null {
    try {
      return localStorage.getItem(this.storageKey(gcid));
    } catch {
      return null;
    }
  }

  private write(gcid: string | null, goalId: string): void {
    try {
      localStorage.setItem(this.storageKey(gcid), goalId);
    } catch {
      /* storage full / private mode — best-effort, non-fatal */
    }
  }
}
