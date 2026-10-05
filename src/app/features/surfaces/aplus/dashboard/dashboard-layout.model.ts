/**
 * DashboardLayout model - the A+-specific value objects + reconcile guard for
 * the "My Knowledge" dashboard-as-hub redesign (SP2.1).
 *
 * The persistence BACKBONE (local-first render, debounced save, LWW reconcile,
 * the typed honest-failure port, syncState, retry classification) was promoted
 * to the surface-agnostic `core/services/preference-layout/` in Track B H1
 * (ADR-240 D3). This module now owns only what is A+-specific: the WrapperKey
 * vocabulary, DEFAULT_ORDER, and the total-over-the-set `reconcileOrder` guard.
 * The shared value + port types are re-exported here as WrapperKey-specialised
 * aliases so existing A+ imports are unchanged.
 *
 * Per ADR-240 D3 the A+ `reconcileOrder` (total over its known set, refills an
 * empty candidate with DEFAULT_ORDER) is NOT shared with the future /home
 * reconcile (a curated subset where empty is a legitimate empty home); the
 * backbone takes the reconcile injected, and A+ keeps `reconcileOrder` here.
 *
 * Wrapper keys are STABLE persisted strings, NEVER rename them (a rename
 * silently orphans every learner's stored order). Adding/removing a wrapper is
 * handled by `reconcileOrder`, not by editing history.
 */
import type {
  LayoutFailure,
  LayoutFailureKind,
  LayoutSyncState,
  PreferenceFetchResult,
  PreferenceLayout,
  PreferenceLayoutPort,
  PreferenceSaveResult,
} from '../../../../core/services/preference-layout/preference-layout.model';

// Re-export the shared honest-failure + sync types so A+ consumers keep a single
// import site. These are surface-agnostic and owned by the core backbone.
export type { LayoutFailure, LayoutFailureKind, LayoutSyncState };

/**
 * The draggable wrapper groups on the dashboard. Stable persisted keys:
 *   - `map`        renders MapPreviewCard      (default position 0, map-dominant)
 *   - `cast`       renders CastCard            (default position 1)
 *   - `courses`    renders ContinueLearningCard(default position 2)
 *   - `study`      renders StudyListsCard       (default position 3)
 *   - `transcript` renders TranscriptCard       (default position 4, outcomes last)
 *
 * `study` sits immediately after `courses` on purpose. Both wrappers render
 * LearningPaths and differ ONLY by provenance (ADR-233 `source_type`: 'course'
 * vs 'collection'), someone else's curriculum, then your own curation. `study`
 * landed with CHO-2226 and `transcript` with CHO-2237 (outcomes anchor the tail).
 */
export type WrapperKey = 'map' | 'cast' | 'courses' | 'study' | 'transcript';

/** Canonical default order, map-dominant. Also the reconcile fallback. */
export const DEFAULT_ORDER: readonly WrapperKey[] = [
  'map',
  'cast',
  'courses',
  'study',
  'transcript',
];

/**
 * The persisted unit (A+ specialisation of the generic PreferenceLayout).
 * `updatedAt` (ISO-8601) is the Last-Write-Wins conflict key.
 */
export type DashboardLayout = PreferenceLayout<WrapperKey>;

/** found (`layout`), genuinely absent (`layout: null`), or I broke (`ok: false`). */
export type LayoutFetchResult = PreferenceFetchResult<WrapperKey>;

/** saved, or I broke. */
export type LayoutSaveResult = PreferenceSaveResult;

/** Port seam (WrapperKey specialisation, HTTP adapter provided by the service). */
export type DashboardLayoutPort = PreferenceLayoutPort<WrapperKey>;

/**
 * Sanitise a candidate order against the currently-registered wrapper keys.
 * Idempotent, non-mutating. Applied on every local read + every server-merge so
 * a persisted order always survives a wrapper being added or removed:
 *   1. drop candidate keys not in `knownKeys` (a wrapper was removed);
 *   2. append any `knownKeys` missing from the candidate, in DEFAULT_ORDER
 *      relative order (a wrapper was added);
 *   3. dedupe (first occurrence wins);
 *   4. empty / invalid candidate maps to DEFAULT_ORDER.
 *
 * This guard is TOTAL over its known set (it always refills to a full order),
 * which is exactly right for A+ and exactly wrong for the /home pin subset:
 * ADR-240 D3 keeps them as two functions over the one shared backbone.
 */
export function reconcileOrder(
  candidate: readonly WrapperKey[] | null | undefined,
  knownKeys: readonly WrapperKey[] = DEFAULT_ORDER,
): WrapperKey[] {
  const known = new Set<WrapperKey>(knownKeys);
  const raw: readonly WrapperKey[] = Array.isArray(candidate) ? candidate : [];
  const seen = new Set<WrapperKey>();
  const out: WrapperKey[] = [];

  // 1 + 3: keep known candidate keys, first occurrence wins.
  for (const key of raw) {
    if (known.has(key) && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  // 2: append missing known keys, DEFAULT_ORDER order first...
  for (const key of DEFAULT_ORDER) {
    if (known.has(key) && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  // ...then any known key not covered by DEFAULT_ORDER (future wrappers).
  for (const key of knownKeys) {
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }

  // 4: nothing survived (empty/all-unknown candidate + empty known set).
  return out.length > 0 ? out : [...DEFAULT_ORDER];
}
