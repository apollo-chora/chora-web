/**
 * The HOME reconcile (ADR-240 Track B H2, D3) - injected into the shared
 * PreferenceLayoutEngine as its `reconcile` seam with TItem = HomePin.
 *
 * DISTINCT from the A+ `reconcileOrder`, and deliberately NOT a parametrisation
 * of it. A home pin list is a user-curated SUBSET of a large pinnable registry,
 * so:
 *   - drop pins whose id is not in `knownIds` (a pin left the registry);
 *   - dedupe by id, FIRST occurrence wins;
 *   - PRESERVE the user's subset and its order;
 *   - NEVER auto-add a known-but-absent id (an unpin must survive a reconcile);
 *   - an intentionally empty home STAYS EMPTY (D7) - no DEFAULT_ORDER refill.
 *
 * That last pair is exactly why `reconcileOrder` (total over its set, refills an
 * empty candidate with DEFAULT_ORDER) cannot be reused: under it an unpin would
 * be indistinguishable from an add, and an empty home would silently repopulate.
 *
 * `knownIds` is the vocabulary only (HOME_PIN_IDS today, a BFF manifest's set
 * later). Capability / surface filtering is a RENDER concern (`home-pin.filter`)
 * and never happens here, so a lost capability hides a pin but never deletes it
 * from the persisted layout (ADR-240 D4). Pure + framework-free (no Angular, no
 * TestBed), matching the H1 backbone.
 */
import type { HomePin } from './home-pin.registry';

export function reconcilePins(
  candidate: readonly HomePin[] | null | undefined,
  knownIds: ReadonlySet<string>,
): HomePin[] {
  const raw: readonly HomePin[] = Array.isArray(candidate) ? candidate : [];
  const seen = new Set<string>();
  const out: HomePin[] = [];

  for (const pin of raw) {
    // Runtime-guard the element: the engine casts untyped localStorage / server
    // JSON to HomePin[], so an id may be missing, blank, or non-string.
    if (
      pin != null &&
      typeof pin.id === 'string' &&
      knownIds.has(pin.id) &&
      !seen.has(pin.id)
    ) {
      seen.add(pin.id);
      // Pass the whole element through (not a fresh { id }) so H5 position
      // fields survive a reconcile untouched. v1 HomePin is { id }; keying on
      // id keeps this forward-compatible.
      out.push(pin);
    }
  }

  // Empty stays empty: no candidate, all-unknown, or an explicit [] all yield
  // []. NEVER a default refill - that is the A+ behaviour this must not share.
  return out;
}
