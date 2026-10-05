/**
 * The turn action: the one primary action on every A+ screen (plan section 3.1,
 * HUD bottom right).
 *
 * A pure resolver rather than a component method, so the rule is testable
 * without a TestBed and cannot quietly acquire a dependency on the view.
 */

/** A maps read, and whether it actually reported. */
export interface MapsReadView {
  /**
   * False while loading and false on failure.
   *
   * This distinction is the point of the type. `GoalService.goals()` collapses
   * to `[]` on loading AND on error, so anything reading it cannot tell "this
   * learner has no maps" from "I could not find out". A turn action inheriting
   * that defect would tell an established learner to sow their first seed
   * because a read blipped, which is a confidently wrong instruction rather
   * than a missing one.
   */
  readonly reported: boolean;
  readonly mapCount: number;
}

export type TurnActionKind = 'dose' | 'seed' | 'suppressed';

export interface TurnAction {
  readonly kind: TurnActionKind;
  /** Absent when suppressed. */
  readonly route?: string;
  /** Absent when suppressed. */
  readonly labelKey?: string;
}

/**
 * Routes that carry their own primary action, where the HUD stands down.
 *
 * The plan asks for "the next atom while in a dose". The HUD cannot produce
 * that without the dose exposing a next-atom seam, and inventing one here would
 * mean a second reader of the dose's state. Until row C5 draws that seam, the
 * HUD suppresses itself rather than showing a second, weaker primary action
 * beside the real one.
 */
const SELF_DRIVEN_PREFIXES: readonly string[] = [
  '/a/daily-dose',
  '/a/atoms',
];

/** Day one sends the learner to the atlas, not to `/a/start`. */
const SEED_ROUTE = '/a/knowledge';
const DOSE_ROUTE = '/a/daily-dose';

/** Path only: a query string or fragment must not change the answer. */
function pathOf(url: string): string {
  return url.split(/[?#]/, 1)[0] ?? '';
}

/**
 * Segment-wise prefix match. A bare `startsWith` would also match
 * `/a/daily-dose-planning`, suppressing the action on an unrelated screen.
 */
function isUnder(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function resolveTurnAction(url: string, maps: MapsReadView): TurnAction {
  const path = pathOf(url);

  if (SELF_DRIVEN_PREFIXES.some((p) => isUnder(path, p))) {
    return { kind: 'suppressed' };
  }

  // Day one is claimed ONLY from a read that reported. An unreported read falls
  // through to the dose, which is always safe and always available.
  if (maps.reported && maps.mapCount === 0) {
    return { kind: 'seed', route: SEED_ROUTE, labelKey: 'aplus.shell.turn.seed' };
  }

  return { kind: 'dose', route: DOSE_ROUTE, labelKey: 'aplus.shell.turn.dose' };
}
