import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';

/**
 * GraduatedGoalTrackerService (ADR-204 §3, CHO-1962) — detects when a
 * learner-owned Goal has newly reached "achieved" (graduation) since the
 * learner last saw their goals, so a surface can fire the "goal achieved 🎓"
 * celebration.
 *
 * The graduation itself happens in chora-consumption: when a learner masters
 * every concept in a Goal's concept set, the BE flips the Goal's `status` to
 * `'achieved'`. This is the FE-only, honest reward detector: it diffs the
 * current achieved-goal ids against a per-learner baseline persisted in
 * localStorage. The first observation establishes the baseline silently (no
 * celebration for goals already achieved), so only genuinely-new transitions
 * celebrate — and the persisted set dedups across surfaces + reloads (the first
 * surface to load after a graduation celebrates; others won't double-fire).
 *
 * Generic over a minimal `{ id, status }` shape so this core service never
 * depends on a feature module (hexagonal layering). GoalDTO uses `goalId`, so
 * the dashboard maps `{ id: goalId, status }` at the call site.
 */

interface GraduatedLike {
  readonly id: string;
  readonly status: string;
}

@Injectable({ providedIn: 'root' })
export class GraduatedGoalTrackerService {
  private readonly auth = inject(AuthService);
  private static readonly PREFIX = 'chora.graduated-goals.';

  /**
   * Returns the subset of `goals` that are now achieved but were NOT achieved
   * the last time this learner's goals were observed. The first call for a
   * learner (no baseline yet) returns [] and records the baseline.
   */
  detectNewlyGraduated<T extends GraduatedLike>(goals: readonly T[]): T[] {
    const achieved = goals.filter((g) => g.status === 'achieved');
    const key = GraduatedGoalTrackerService.PREFIX + (this.auth.gcid() ?? 'anon');
    const stored = this.read(key);

    if (stored === null) {
      // First observation for this learner — establish the baseline silently.
      this.write(
        key,
        achieved.map((g) => g.id),
      );
      return [];
    }

    const seen = new Set(stored);
    const newly = achieved.filter((g) => !seen.has(g.id));
    if (newly.length > 0) {
      this.write(key, [...stored, ...newly.map((g) => g.id)]);
    }
    return newly;
  }

  private read(key: string): string[] | null {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) {
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === 'string')
        : [];
    } catch {
      // Storage unavailable/corrupt — degrade to "baseline" so we never
      // celebrate stale data and never throw into the render path.
      return null;
    }
  }

  private write(key: string, ids: string[]): void {
    try {
      localStorage.setItem(key, JSON.stringify([...new Set(ids)]));
    } catch {
      /* storage full / private mode — non-fatal, celebration is best-effort */
    }
  }
}
