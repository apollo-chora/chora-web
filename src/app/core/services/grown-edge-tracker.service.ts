import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';

/**
 * GrownEdgeTrackerService (ADR-196 B2) — detects when a Growth Edge has newly
 * reached "grown" since the learner last saw their edges, so a surface can fire
 * the "you grew an edge 🌱" celebration.
 *
 * The grow itself happens during practice on another surface (a focused dose
 * recovers the edge in chora-consumption); B3 will push the realtime
 * weakness.grown.v1 event. Until then this is a FE-only, honest detector: it
 * diffs the current grown-edge ids against a per-learner baseline persisted in
 * localStorage. The first observation establishes the baseline silently (no
 * celebration for edges already grown), so only genuinely-new transitions
 * celebrate — and the persisted set dedups across surfaces + reloads (the first
 * surface to load after a grow celebrates; others won't double-fire).
 *
 * Generic over a minimal `{ id, status }` shape so this core service never
 * depends on a feature module (hexagonal layering).
 */

interface GrownLike {
  readonly id: string;
  readonly status: string;
}

@Injectable({ providedIn: 'root' })
export class GrownEdgeTrackerService {
  private readonly auth = inject(AuthService);
  private static readonly PREFIX = 'chora.grown-edges.';

  /**
   * Returns the subset of `edges` that are now grown but were NOT grown the
   * last time this learner's edges were observed. The first call for a learner
   * (no baseline yet) returns [] and records the baseline.
   */
  detectNewlyGrown<T extends GrownLike>(edges: readonly T[]): T[] {
    const grown = edges.filter((e) => e.status === 'grown');
    const key = GrownEdgeTrackerService.PREFIX + (this.auth.gcid() ?? 'anon');
    const stored = this.read(key);

    if (stored === null) {
      // First observation for this learner — establish the baseline silently.
      this.write(
        key,
        grown.map((e) => e.id),
      );
      return [];
    }

    const seen = new Set(stored);
    const newly = grown.filter((e) => !seen.has(e.id));
    if (newly.length > 0) {
      this.write(key, [...stored, ...newly.map((e) => e.id)]);
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
