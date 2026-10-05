/**
 * Daily-Dose per-KG preferences (CHO-2045 / ADR-224). The store is SPARSE — the
 * default is that every map feeds the dose, so the BFF returns only the EXCLUDED
 * map ids. The roster UI composes those with the maps Atlas to render a full
 * include/exclude switch per map.
 */

/** GET /api/v1/me/dose-preferences — the sparse excluded-map-id set. */
export interface DosePreferencesResponse {
  readonly excludedMapIds: readonly string[];
}

/** PUT /api/v1/me/dose-preferences body — set one map's include/exclude state. */
export interface DosePreferenceUpdate {
  readonly mapId: string;
  readonly included: boolean;
}

/** Roster filter tabs. */
export type DoseFilter = 'all' | 'in' | 'out';

/** One composed roster row: a map + whether it currently feeds the dose. */
export interface DosePrefRow {
  readonly goalId: string;
  /** The map's display title, or an i18n key for an untitled map. */
  readonly title: string;
  readonly included: boolean;
}
