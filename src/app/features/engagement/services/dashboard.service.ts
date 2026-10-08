import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';
import { GraphQLService } from '../../../core/services/graphql.service';
import { QUERY_MY_STREAK, QUERY_MY_XP, QUERY_MY_DAILY_DOSE } from '../../../core/graphql/queries';
import type { GqlStreakData, GqlXpSummary, GqlDailyDoseSession } from '../../../core/graphql/types';
import type {
  DashboardData,
  DashboardState,
  StreakData,
  XpSummaryData,
  ExamReadiness,
  ExamReadinessState,
  GoalChallenge,
  GoalListState,
  GoalActionState,
  LeaderboardData,
  LeaderboardPeriod,
  LeaderboardState,
} from '../models/engagement.models';

// ---------------------------------------------------------------------------
// GraphQL camelCase → domain snake_case mappers
// ---------------------------------------------------------------------------

function mapStreakData(gql: GqlStreakData): StreakData {
  return {
    current_days: gql.currentDays,
    status: gql.status as StreakData['status'],
    longest_streak: gql.longestStreak,
    last_activity_at: gql.lastActivityAt,
  };
}

function mapXpSummary(gql: GqlXpSummary): XpSummaryData {
  return {
    total_xp: gql.totalXp,
    level: gql.level,
    xp_to_next_level: gql.xpToNextLevel,
    combo_multiplier: gql.comboMultiplier,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly bff = inject(BffClientService);
  private readonly gql = inject(GraphQLService);
  private readonly leaderboardPath = '/api/v1/engagement/leaderboard';
  private readonly goalsPath = '/api/v1/engagement/goals';
  private readonly examReadinessPath = '/api/v1/engagement/exam-readiness';

  // --- State ---
  private readonly _dashboardState = signal<DashboardState>({ status: 'idle' });
  readonly dashboardState = this._dashboardState.asReadonly();

  private readonly _leaderboardState = signal<LeaderboardState>({ status: 'idle' });
  readonly leaderboardState = this._leaderboardState.asReadonly();

  private readonly _goalListState = signal<GoalListState>({ status: 'idle' });
  readonly goalListState = this._goalListState.asReadonly();

  private readonly _goalActionState = signal<GoalActionState>({ status: 'idle' });
  readonly goalActionState = this._goalActionState.asReadonly();

  private readonly _examReadinessState = signal<ExamReadinessState>({ status: 'idle' });
  readonly examReadiness = this._examReadinessState.asReadonly();

  // --- Computed from dashboard data ---
  readonly streak = computed(() => {
    const s = this._dashboardState();
    return s.status === 'success' ? s.data.streak : null;
  });

  readonly xp = computed(() => {
    const s = this._dashboardState();
    return s.status === 'success' ? s.data.xp : null;
  });

  readonly level = computed(() => {
    const s = this._dashboardState();
    return s.status === 'success' ? s.data.level : null;
  });

  readonly dailyDoseStatus = computed(() => {
    const s = this._dashboardState();
    return s.status === 'success' ? s.data.daily_dose_status : null;
  });

  readonly activeGoalsCount = computed(() => {
    const s = this._dashboardState();
    return s.status === 'success' ? s.data.active_goals_count : 0;
  });

  readonly pathProgress = computed(() => {
    const s = this._dashboardState();
    return s.status === 'success' ? s.data.path_progress : [];
  });

  readonly goals = computed(() => {
    const s = this._goalListState();
    return s.status === 'success' ? s.goals : [];
  });

  readonly activeGoals = computed(() =>
    this.goals().filter((g) => g.status === 'active'),
  );

  readonly leaderboard = computed(() => {
    const s = this._leaderboardState();
    return s.status === 'success' ? s.data : null;
  });

  // ---------------------------------------------------------------------------
  // Load dashboard via REST (fallback from GraphQL until gateway wires /graphql)
  // ---------------------------------------------------------------------------

  loadDashboard(): Observable<DashboardData | null> {
    this._dashboardState.set({ status: 'loading' });

    return this.bff.get<DashboardData>('/api/v1/engagement/dashboard').pipe(
      tap((dashboardData) => {
        if (dashboardData) {
          this._dashboardState.set({ status: 'success', data: dashboardData });
        }
      }),
      catchError((err: Error) => {
        this._dashboardState.set({
          status: 'error',
          error: { code: 'DASHBOARD_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Individual GraphQL queries for streak and XP (lighter-weight)
  // ---------------------------------------------------------------------------

  loadStreak(): Observable<StreakData | null> {
    return this.gql.query<{ myStreak: GqlStreakData }>(QUERY_MY_STREAK).pipe(
      map((data) => data?.myStreak ? mapStreakData(data.myStreak) : null),
      catchError(() => of(null)),
    );
  }

  loadXp(): Observable<XpSummaryData | null> {
    return this.gql.query<{ myXP: GqlXpSummary }>(QUERY_MY_XP).pipe(
      map((data) => data?.myXP ? mapXpSummary(data.myXP) : null),
      catchError(() => of(null)),
    );
  }

  loadDailyDose(): Observable<GqlDailyDoseSession | null> {
    return this.gql.query<{ dailyDose: GqlDailyDoseSession }>(QUERY_MY_DAILY_DOSE).pipe(
      map((data) => data?.dailyDose ?? null),
      catchError(() => of(null)),
    );
  }

  // ---------------------------------------------------------------------------
  // Leaderboard (REST — period switching is a param-based read)
  // ---------------------------------------------------------------------------

  loadLeaderboard(period: LeaderboardPeriod): Observable<LeaderboardData | null> {
    this._leaderboardState.set({ status: 'loading' });

    return this.bff.get<LeaderboardData>(
      `${this.leaderboardPath}?period=${period}`,
    ).pipe(
      tap((data) => {
        this._leaderboardState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._leaderboardState.set({
          status: 'error',
          error: { code: 'LEADERBOARD_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Goals (REST — separate endpoint for full list)
  // ---------------------------------------------------------------------------

  loadGoals(status?: string): Observable<GoalChallenge[] | null> {
    this._goalListState.set({ status: 'loading' });

    const params = status ? `?status=${status}` : '';
    return this.bff.get<{ data: GoalChallenge[]; page_info: { has_next: boolean } }>(
      `${this.goalsPath}${params}`,
    ).pipe(
      tap((res) => {
        this._goalListState.set({
          status: 'success',
          goals: res.data ?? [],
          page_info: res.page_info,
        });
      }),
      map((res) => res.data ?? []),
      catchError((err: Error) => {
        this._goalListState.set({
          status: 'error',
          error: { code: 'GOALS_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Goal actions (REST — mutations)
  // ---------------------------------------------------------------------------

  acceptGoal(goalId: string): Observable<boolean> {
    this._goalActionState.set({ status: 'submitting' });

    return this.bff.post<GoalChallenge>(
      `${this.goalsPath}/${goalId}/accept`,
      {},
    ).pipe(
      tap((updatedGoal) => {
        this._goalActionState.set({ status: 'success' });
        // Update goal in list state if loaded
        const current = this._goalListState();
        if (current.status === 'success') {
          const updatedGoals = current.goals.map((g) =>
            g.id === goalId ? updatedGoal : g,
          );
          this._goalListState.set({
            ...current,
            goals: updatedGoals,
          });
        }
      }),
      map(() => true),
      catchError((err: Error) => {
        this._goalActionState.set({
          status: 'error',
          error: { code: 'GOAL_ACCEPT_FAILED', message: err.message },
        });
        return of(false);
      }),
    );
  }

  declineGoal(goalId: string): Observable<boolean> {
    this._goalActionState.set({ status: 'submitting' });

    return this.bff.post<GoalChallenge>(
      `${this.goalsPath}/${goalId}/decline`,
      {},
    ).pipe(
      tap((updatedGoal) => {
        this._goalActionState.set({ status: 'success' });
        const current = this._goalListState();
        if (current.status === 'success') {
          const updatedGoals = current.goals.map((g) =>
            g.id === goalId ? updatedGoal : g,
          );
          this._goalListState.set({
            ...current,
            goals: updatedGoals,
          });
        }
      }),
      map(() => true),
      catchError((err: Error) => {
        this._goalActionState.set({
          status: 'error',
          error: { code: 'GOAL_DECLINE_FAILED', message: err.message },
        });
        return of(false);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Exam readiness (REST — separate endpoint)
  // ---------------------------------------------------------------------------

  loadExamReadiness(): Observable<ExamReadiness | null> {
    this._examReadinessState.set({ status: 'loading' });

    return this.bff.get<ExamReadiness>(this.examReadinessPath).pipe(
      tap((data) => {
        this._examReadinessState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._examReadinessState.set({
          status: 'error',
          error: { code: 'EXAM_READINESS_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // State reset
  // ---------------------------------------------------------------------------

  resetState(): void {
    this._dashboardState.set({ status: 'idle' });
    this._leaderboardState.set({ status: 'idle' });
    this._goalListState.set({ status: 'idle' });
    this._goalActionState.set({ status: 'idle' });
    this._examReadinessState.set({ status: 'idle' });
  }
}
