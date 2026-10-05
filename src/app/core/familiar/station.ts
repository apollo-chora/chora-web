/**
 * Where a companion is stationed (C3), derived once for every surface that
 * asks.
 *
 * The roster screen and the dashboard's party strip answer the same question
 * from the same bond (`attachedFamiliarId`, ADR-212 D5), so they call the same
 * function. Two derivations drift, and the one that drifts is the one fewer
 * people look at.
 */
import type { MapCard } from '../../features/surfaces/aplus/my-knowledge/maps.model';

/** Where a companion is, or why the caller cannot say. */
export type Station =
  | { readonly kind: 'stationed'; readonly mapTitle: string; readonly goalId: string }
  | { readonly kind: 'unstationed' }
  | { readonly kind: 'unknown' };

/**
 * A maps read, with whether it actually reported.
 *
 * ⚠ A bare array cannot express "the read failed". An empty one would then
 * mean both "this learner has no maps" and "I could not find out", and every
 * companion would render as idle while it may be marching. The dashboard's
 * existing bond derivation has that defect today: `GoalService.goals()`
 * returns `[]` on loading AND on error, so nothing downstream can tell the
 * difference. That service's own `lead` counter takes the opposite approach
 * for the same reason, returning null rather than zero so the ranker can tell
 * "no signal" from "no goals".
 */
export interface MapsReport {
  readonly reported: boolean;
  readonly cards: readonly MapCard[];
}

/**
 * Resolve one companion's station.
 *
 * An unreported read answers `unknown` even when the list happens to hold a
 * matching card: if the read failed, the SPA does not know, and half-knowing
 * is the state that produces confident wrong answers.
 */
export function stationFrom(report: MapsReport, familiarId: string): Station {
  if (!report.reported) return { kind: 'unknown' };
  // The bond is 1:1 server-side, so two claims mean the data is wrong. Taking
  // the first is deterministic and keeps a broken bond from blanking the whole
  // strip; it is not a merge, and it is not pretending the conflict is fine.
  const card = report.cards.find((c) => c.attachedFamiliarId === familiarId);
  if (!card) return { kind: 'unstationed' };
  // A bound map whose title did not resolve still means the companion is ON a
  // map. Reporting it as unstationed would lose a real fact to a cosmetic one,
  // so the caller gets the binding and an empty title to render around.
  return { kind: 'stationed', mapTitle: card.title, goalId: card.goalId };
}
