/**
 * TypeScript interfaces for the Engagement domain.
 * Source of truth: chora-engagement/internal/domain/models.go
 *
 * BFF endpoint: GET /api/v1/engagement/dashboard
 * Backend returns snake_case JSON — these interfaces match directly.
 */

// ---------------------------------------------------------------------------
// Streak (domain.StreakSummary)
// ---------------------------------------------------------------------------

export type StreakStatus = 'active' | 'at_risk' | 'broken';

export interface StreakData {
  current_days: number;
  status: StreakStatus;
  longest_streak: number;
  last_activity_at: string;
}

// ---------------------------------------------------------------------------
// XP & Level (domain.XPSummary)
// ---------------------------------------------------------------------------

export interface XpSummaryData {
  total_xp: number;
  level: number;
  xp_to_next_level: number;
  combo_multiplier: number;
}

// ---------------------------------------------------------------------------
// Goal Challenges (domain.GoalChallenge)
// ---------------------------------------------------------------------------

export type GoalStatus = 'pending' | 'active' | 'completed' | 'expired' | 'declined';

export interface GoalTargetScope {
  type: 'atom_count' | 'retention_pct' | 'path_completion';
  topic_id: string | null;
  target_value: number;
}

export interface GoalChallenge {
  id: string;
  tenant_id: string;
  assignee_gcid: string;
  created_by: string;
  title: string;
  description: string;
  target_scope: GoalTargetScope;
  deadline: string;
  bounty_star_credits: number;
  status: GoalStatus;
  progress_pct: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Leaderboard (domain.LeaderboardEntry)
// ---------------------------------------------------------------------------

export type LeaderboardPeriod = 'weekly' | 'monthly' | 'all_time';

export interface LeaderboardEntry {
  rank: number;
  gcid: string;
  display_name: string;
  avatar_url: string | null;
  total_xp: number;
  level: number;
  streak_days: number;
}

export interface LeaderboardData {
  entries: LeaderboardEntry[];
  learner_rank: LeaderboardEntry | null;
  period: LeaderboardPeriod;
  scope: string;
  page_info: { has_next: boolean };
}

// ---------------------------------------------------------------------------
// Path Progress (domain.PathProgressSummary)
// ---------------------------------------------------------------------------

export interface PathProgress {
  path_id: string;
  path_title: string;
  completion_pct: number;
  steps_completed: number;
  steps_total: number;
}

// ---------------------------------------------------------------------------
// DailyDose Status
// ---------------------------------------------------------------------------

export type DailyDoseStatus = 'available' | 'completed' | 'not_configured';

// ---------------------------------------------------------------------------
// Dashboard Aggregate (matches domain.DashboardResponse)
// ---------------------------------------------------------------------------

export interface DashboardData {
  streak: StreakData;
  xp: XpSummaryData;
  level: number;
  daily_dose_status: DailyDoseStatus;
  active_goals_count: number;
  path_progress: PathProgress[];
}

// ---------------------------------------------------------------------------
// Discriminated Union State
// ---------------------------------------------------------------------------

export type DashboardState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: DashboardData }
  | { status: 'error'; error: { code: string; message: string } };

export type LeaderboardState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: LeaderboardData }
  | { status: 'error'; error: { code: string; message: string } };

export type GoalListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; goals: GoalChallenge[]; page_info: { has_next: boolean } }
  | { status: 'error'; error: { code: string; message: string } };

export type GoalActionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success' }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Exam Readiness (Phase 14.6.5, CHO-1121)
// ---------------------------------------------------------------------------

export interface ExamReadiness {
  exam_title: string;
  exam_date: string;             // ISO-8601
  overall_readiness: number;     // 0-100 percentage
  pass_threshold: number;        // 0-100
  predicted_score: number;       // 0-100
  confidence_interval: { low: number; high: number };
  topic_readiness: TopicReadiness[];
  revision_stats: RevisionStats;
  familiar_message: string;      // encouragement/urgency from Familiar
}

export interface TopicReadiness {
  topic_id: string;
  topic_name: string;
  readiness: number;             // 0-100
  atoms_reviewed: number;
  atoms_total: number;
  weak_areas: string[];
}

export interface RevisionStats {
  atoms_reviewed_today: number;
  atoms_reviewed_week: number;
  time_spent_today_ms: number;
  time_spent_week_ms: number;
  streak_days: number;
  sessions_completed: number;
}

export type ExamReadinessState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: ExamReadiness }
  | { status: 'error'; error: { code: string; message: string } };
