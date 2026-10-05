/**
 * Multi-role Dashboard model — A+ Stage 3 wave 3 (Phyllis demo Step 1b/6).
 *
 * Per CHORA `3-audience explainability` + ADR-143 per-user KG, Phyllis
 * holds ONE GCID with N tenant memberships and TWO roles on this CSPO
 * course after enrolling — Learner (default) AND Instructor (authored
 * her own derivative path).
 *
 * Role-driven feature visibility (NOT toggle) per Tier 4 D16: the role
 * pill is a *view* (filters what Phyllis sees), NOT an identity switch.
 *
 * Wired LIVE 2026-05-14 to the real BFF endpoint `GET /api/me/dashboard`
 * (chora-gateway → aggregator over chora-consumption + chora-delivery).
 * The BE aggregator was built to match THIS model — the first five
 * `DashboardSummary` fields plus `LearnerCourseSummary` /
 * `InstructorCourseSummary` are the wire shape (camelCase, as the BE
 * serialises them). The only additions are the 3 graceful-degradation
 * metadata fields (`partial` / `part_errors` / `known_gaps`, snake_case
 * as the BE emits them) which carry the honest "showing what we have"
 * state. Values are often empty/zero straight from the BE — that is the
 * real data state and the UI renders it honestly (fail-loud, no-debts
 * directive 2026-05-14). The hardcoded `PHYLLIS_DASHBOARD` fixture has
 * been DELETED — no stubs.
 */

export type LearnerRole = 'learner' | 'instructor';

/**
 * Ebbinghaus retention level per atom card — sourced from the
 * chora-consumption gRPC spaced-repetition envelope (ADR-143).
 * Mirror of `RetentionLevel` in `atom.models.ts`; duplicated here to
 * avoid a cross-feature import from a dashboard model file.
 */
export type RetentionState = 'high' | 'medium' | 'low' | 'unknown';

export interface LearnerCourseSummary {
  readonly courseId: string;
  readonly courseCode: string;
  readonly title: string;
  readonly instructorName: string;
  readonly progressPct: number;
  readonly remainingAtoms: number;
  readonly xpEarned: number;
  readonly memoryPct: number;
  readonly dayNumber: number;
  readonly dayTotal: number;
  /**
   * Ebbinghaus retention state for the last-played atom in this course.
   * Optional - absent when no AtomAttempt exists yet. Defaults to
   * `'unknown'` on the FE (explicit unknown signals data not yet
   * available; card is NEVER hidden).
   */
  readonly retention_state?: RetentionState;
}

/**
 * A single Familiar in the learner's roster strip.
 * Sourced from `GET /api/me/familiars` (N-Familiar per ADR-116 amendment).
 */
export interface FamiliarRosterItem {
  readonly familiar_id: string;
  readonly name: string;
  /** Species key used to select the species icon (fox/owl/dragon/cat/robot/phoenix). */
  readonly species: string;
  /** Numeric evolution tier (1–6). */
  readonly evolution_level: number;
  /** Growth stage label: egg / hatchling / fledgling / apprentice / adept / sage. */
  readonly stage_label: string;
  /**
   * Topic axis (math / history / coding / …) — the Familiar's specialty.
   * Optional — absent on legacy/degraded roster payloads. Mirrors
   * chora-consumption's `/v1/me/familiars` item `subject` key.
   */
  readonly subject?: string;
}

/**
 * Streak data sourced from `DailyDose` endpoint (`current_streak_days` +
 * `last_completion_at`). The BFF folds this into the dashboard summary.
 */
export interface StreakSummary {
  /** Days in the current consecutive streak. 0 means no active streak. */
  readonly current_streak_days: number;
  /** ISO-8601 timestamp of the last completed dose. Optional. */
  readonly last_completion_at?: string;
}

export interface InstructorCourseSummary {
  readonly courseId: string;
  readonly courseCode: string;
  readonly title: string;
  readonly studentsEnrolled: number;
  readonly atomsAuthored: number;
  readonly averageScorePct: number;
  readonly pendingReviews: number;
  readonly isLive: boolean;
}

export interface DashboardSummary {
  readonly gcidPillLabel: string;
  readonly userDisplayName: string;
  readonly currentStreakDays: number;
  readonly learnerCourses: readonly LearnerCourseSummary[];
  readonly instructorCourses: readonly InstructorCourseSummary[];
  /**
   * N-Familiar roster (ADR-116 amendment). Empty array when the learner
   * has no hatched Familiars (Mystery Egg only). Optional — absent in
   * legacy BFF responses; FE renders an empty strip.
   */
  readonly familiars?: readonly FamiliarRosterItem[];
  /**
   * Streak data from DailyDose service. Optional — absent when the BFF
   * upstream is degraded; FE falls back to `currentStreakDays`.
   */
  readonly streak?: StreakSummary;
  /**
   * BE graceful-degradation flag — `true` when one or more upstream
   * sources failed and the aggregator returned a partial 200. Optional:
   * a fully-healthy response may omit it. NEVER a hard-fail signal — the
   * response is still a 200, `partial` just means "showing what we have".
   */
  readonly partial?: boolean;
  /**
   * Per-field upstream-error map keyed by `DashboardSummary` field name
   * (e.g. `{ userDisplayName: 'upstream_4xx' }`). Snake_case as the BE
   * serialises it. Optional — omitted on a healthy response.
   */
  readonly part_errors?: Readonly<Record<string, string>>;
  /**
   * Known-gap map keyed by field name (e.g. `instructorCourses`) — a
   * field with no downstream source at all (distinct from a transient
   * `part_errors` failure). Snake_case as the BE serialises it.
   */
  readonly known_gaps?: Readonly<Record<string, string>>;
}

export function totalCourses(summary: DashboardSummary): number {
  return summary.learnerCourses.length + summary.instructorCourses.length;
}

/**
 * Maps a `RetentionState` to the CSS custom-property name for the
 * Ebbinghaus retention indicator dot. Fallback is `unknown`.
 */
export function retentionCssVar(state: RetentionState | undefined): string {
  switch (state) {
    case 'high':    return 'var(--chora-retention-high)';
    case 'medium':  return 'var(--chora-retention-medium)';
    case 'low':     return 'var(--chora-retention-low)';
    default:        return 'var(--chora-retention-unknown)';
  }
}

/**
 * Maps a `RetentionState` to an ARIA-friendly label key.
 */
export function retentionAriaKey(state: RetentionState | undefined): string {
  switch (state) {
    case 'high':   return 'aplus.dashboard.retention_high';
    case 'medium': return 'aplus.dashboard.retention_medium';
    case 'low':    return 'aplus.dashboard.retention_low';
    default:       return 'aplus.dashboard.retention_unknown';
  }
}

/**
 * Discriminated-union state for the dashboard load. Mirrors the
 * `AsyncState<T>` fail-loud pattern used across chora-web (see
 * `course-detail.model.ts`). `error` is an i18n key — never a raw BE
 * body. A `partial: true` body still resolves to `success` (it is a
 * 200) — the component surfaces a non-blocking inline notice instead.
 */
export type DashboardState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly summary: DashboardSummary }
  | { readonly status: 'error'; readonly error: string };
