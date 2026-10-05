import type {
  DashboardSummary,
  LearnerCourseSummary,
  InstructorCourseSummary,
  FamiliarRosterItem,
  StreakSummary,
} from '../../features/surfaces/aplus/dashboard/dashboard.model';

/**
 * Test data builders for the A+ multi-role dashboard DTOs — the wire
 * shape returned by
 *   GET https://api.chora.site/api/me/dashboard
 * (chora-gateway aggregator over chora-consumption + chora-delivery).
 *
 * Per `chora-web/CLAUDE.md` §6 — never inline object literals in specs.
 *
 * The defaults reflect the REAL data state probed live 2026-05-14: the
 * demo persona's data is not fully seeded, so `userDisplayName` is `''`,
 * `currentStreakDays` is `0`, and both course arrays are empty. The BE
 * confirmed the SHAPES are real and stable — values fill in as the
 * persona data seeds. Specs that need populated values pass explicit
 * overrides; they never fake them silently.
 */

/** A single learner-role course summary (sub-interface of the wire shape). */
export function buildLearnerCourseSummary(
  overrides: Partial<LearnerCourseSummary> = {},
): LearnerCourseSummary {
  return {
    courseId: '05000000-0000-7000-8000-0000000c5301',
    courseCode: '',
    title: '',
    instructorName: '',
    progressPct: 0,
    remainingAtoms: 0,
    xpEarned: 0,
    memoryPct: 0,
    dayNumber: 0,
    dayTotal: 0,
    // WS-5: retention_state absent by default (unknown = no data yet)
    ...overrides,
  };
}

/** A single Familiar roster item for the dashboard strip (WS-5). */
export function buildFamiliarRosterItem(
  overrides: Partial<FamiliarRosterItem> = {},
): FamiliarRosterItem {
  return {
    familiar_id: '05000000-0000-7000-8000-0000000f0001',
    name: 'Eira',
    species: 'fox',
    evolution_level: 2,
    stage_label: 'hatchling',
    ...overrides,
  };
}

/** A streak summary for WS-5 streak indicator tests. */
export function buildStreakSummary(
  overrides: Partial<StreakSummary> = {},
): StreakSummary {
  return {
    current_streak_days: 7,
    last_completion_at: '2026-05-26T08:00:00Z',
    ...overrides,
  };
}

/** A single instructor-role course summary (sub-interface of the wire shape). */
export function buildInstructorCourseSummary(
  overrides: Partial<InstructorCourseSummary> = {},
): InstructorCourseSummary {
  return {
    courseId: '05000000-0000-7000-8000-0000000c5401',
    courseCode: '',
    title: '',
    studentsEnrolled: 0,
    atomsAuthored: 0,
    averageScorePct: 0,
    pendingReviews: 0,
    isLive: false,
    ...overrides,
  };
}

/**
 * The full `GET /api/me/dashboard` body. Defaults mirror the real probed
 * response: empty display name, zero streak, empty course arrays. The 3
 * graceful-degradation fields (`partial` / `part_errors` / `known_gaps`)
 * are omitted by default — pass them explicitly to exercise the partial
 * path.
 *
 * WS-5: `familiars` and `streak` are also absent by default (mirrors
 * legacy BE responses that pre-date N-Familiar + streak aggregation).
 */
export function buildDashboardSummary(
  overrides: Partial<DashboardSummary> = {},
): DashboardSummary {
  return {
    gcidPillLabel: 'ONE IDENTITY · GCID active',
    userDisplayName: '',
    currentStreakDays: 0,
    learnerCourses: [],
    instructorCourses: [],
    ...overrides,
  };
}
