/**
 * Study surface types — response shape for
 *   GET /api/v1/me/learning-paths
 *
 * Transcribed field-for-field from the BE struct `mePathSummary` in
 *   services/chora-consumption/internal/adapter/http/me_handlers.go
 * (`source_type` / `source_id` landed in commit `c56292633`). NOT inferred from
 * the route name — the sibling `?course_id=` branch of this same route returns a
 * DIFFERENT shape (see course-learn.model.ts `CourseLearnResponse`), and
 * CHO-2169 already cost a live bug by mis-modelling a field on this handler.
 *
 * ── What this wire does NOT carry ────────────────────────────────────────────
 * 🔴 There is NO `traversal_mode` field. The domain has one (ADR-233 D3:
 * linear | spaced) and the `learning_path.bootstrapped.v1` EVENT publishes it,
 * but the READ projection above does not. So `source_type === 'collection'` is
 * the FE's ONLY signal that a path is spaced. Do not add a `traversal_mode`
 * field here hoping to gate on it: it would be permanently `undefined`, and
 * `undefined !== 'spaced'` is TRUE — every spaced-path guard written that way
 * fails OPEN.
 */

/**
 * ADR-233 D2 provenance. All three values are live on the wire: the column is
 * NOT NULL and DEFAULTS to 'ad_hoc', and migration 0093's backfill only stamped
 * 'course' where a course_id already existed.
 *
 * 🔴 A study list is `source_type === 'collection'`. It is NEVER `!== 'course'`
 * — the negative form sweeps every legacy ad_hoc path in as a study list.
 */
export type MeLearningPathSourceType = 'course' | 'collection' | 'ad_hoc';

/**
 * One item of `GET /api/v1/me/learning-paths`, and the whole body of
 * `GET /api/v1/me/learning-paths/{id}`.
 */
export interface MeLearningPath {
  readonly path_id: string;
  /** The delivery BINDING (an enrollment reference), not provenance. */
  readonly course_id?: string;
  readonly enrollment_id?: string;
  /** `omitempty` — absent on a pre-migration row, so possibly undefined. */
  readonly source_type?: MeLearningPathSourceType;
  /** course_id | collection_id | absent (ad_hoc). `omitempty`. */
  readonly source_id?: string;
  readonly title: string;
  readonly atom_ids: readonly string[];
  /**
   * 🔴 INERT on a study list. `current_index` is a LINEAR cursor; a spaced path
   * is scheduled off `sm2_states`, and `Advance()` REFUSES on it
   * (ErrSpacedPathNoCursor), so this stays 0 forever no matter how much the
   * learner studies. Never render it for a study list.
   */
  readonly current_index: number;
  /** len(atom_ids) — real, and the only count that means anything here. */
  readonly total_atoms: number;
  /**
   * 🔴 INERT on a study list. Computed BE-side as `current_index / total_atoms`,
   * and current_index is frozen at 0 ⇒ permanently 0.0. Rendering it would tell
   * a learner who has studied for weeks that they are at 0%.
   */
  readonly progress_percent: number;
  /**
   * 🔴 INERT on a study list. `completed_at != nil` BE-side, and only Advance()
   * stamps it — which refuses here ⇒ permanently false.
   */
  readonly completed: boolean;
}

/**
 * List envelope. `{"items": [...]}` — there is NO `total` on this route (unlike
 * `GET /api/v1/me/collections`, which does carry one).
 */
export interface MeLearningPathListResponse {
  readonly items: readonly MeLearningPath[];
}

/** AsyncState for the Study Lists tab. */
export type StudyListState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly items: readonly MeLearningPath[] }
  | { readonly status: 'error'; readonly error: string };
