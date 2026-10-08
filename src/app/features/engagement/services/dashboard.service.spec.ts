import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { DashboardService } from './dashboard.service';
import { environment } from '../../../../environments/environment';

// ---------------------------------------------------------------------------
// Test data builders
// ---------------------------------------------------------------------------

/** REST dashboard response (snake_case wire format) */
function buildDashboardResponse() {
  return {
    streak: {
      current_days: 7,
      status: 'active',
      longest_streak: 14,
      last_activity_at: '2026-03-12T10:00:00Z',
    },
    xp: {
      total_xp: 1250,
      level: 5,
      xp_to_next_level: 600,
      combo_multiplier: 2,
    },
    level: 5,
    daily_dose_status: 'available',
    active_goals_count: 1,
    path_progress: [
      {
        path_id: 'path-001',
        path_title: 'Algebra Foundations',
        completion_pct: 60,
        steps_completed: 30,
        steps_total: 50,
      },
      {
        path_id: 'path-002',
        path_title: 'Physics 101',
        completion_pct: 25,
        steps_completed: 10,
        steps_total: 40,
      },
    ],
  };
}

function buildGoalsResponse() {
  return {
    data: [
      {
        id: 'goal-001',
        tenant_id: 'tenant-001',
        assignee_gcid: 'gcid-001',
        created_by: 'instructor-001',
        title: 'Master Algebra',
        description: 'Complete 20 atoms in Algebra',
        target_scope: { type: 'atom_count', topic_id: null, target_value: 20 },
        deadline: '2026-03-20T00:00:00Z',
        bounty_star_credits: 50,
        status: 'active',
        progress_pct: 60,
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-12T00:00:00Z',
      },
      {
        id: 'goal-002',
        tenant_id: 'tenant-001',
        assignee_gcid: 'gcid-001',
        created_by: 'instructor-001',
        title: 'Physics Retention',
        description: 'Achieve 80% retention in Physics',
        target_scope: { type: 'retention_pct', topic_id: 'topic-physics', target_value: 80 },
        deadline: '2026-03-15T00:00:00Z',
        bounty_star_credits: 100,
        status: 'completed',
        progress_pct: 100,
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-14T00:00:00Z',
      },
    ],
    page_info: { has_next: false },
  };
}

function buildLeaderboardResponse() {
  return {
    entries: [
      {
        rank: 1,
        gcid: 'gcid-alice',
        display_name: 'Alice',
        avatar_url: null,
        total_xp: 5000,
        level: 10,
        streak_days: 30,
      },
      {
        rank: 2,
        gcid: 'gcid-bob',
        display_name: 'Bob',
        avatar_url: null,
        total_xp: 4200,
        level: 9,
        streak_days: 14,
      },
    ],
    learner_rank: {
      rank: 5,
      gcid: 'gcid-me',
      display_name: 'Me',
      avatar_url: null,
      total_xp: 1250,
      level: 5,
      streak_days: 7,
    },
    period: 'weekly',
    scope: 'tenant',
    page_info: { has_next: false },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardService', () => {
  let service: DashboardService;
  let httpMock: HttpTestingController;
  const baseUrl = environment.bffBaseUrl;
  const dashboardUrl = `${baseUrl}/api/v1/engagement/dashboard`;
  const leaderboardUrl = `${baseUrl}/api/v1/engagement/leaderboard`;
  const goalsUrl = `${baseUrl}/api/v1/engagement/goals`;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        DashboardService,
      ],
    });
    service = TestBed.inject(DashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it('starts with idle state', () => {
    expect(service.dashboardState().status).toBe('idle');
    expect(service.streak()).toBeNull();
    expect(service.xp()).toBeNull();
    expect(service.goals()).toEqual([]);
    expect(service.leaderboard()).toBeNull();
  });

  // -----------------------------------------------------------------------
  // loadDashboard (via REST)
  // -----------------------------------------------------------------------

  it('sets loading state', () => {
    service.loadDashboard().subscribe();
    expect(service.dashboardState().status).toBe('loading');
    httpMock.expectOne(dashboardUrl).flush(buildDashboardResponse());
  });

  it('maps dashboard data on success', () => {
    service.loadDashboard().subscribe();
    httpMock.expectOne(dashboardUrl).flush(buildDashboardResponse());

    expect(service.dashboardState().status).toBe('success');
  });

  it('sends GET to /api/v1/engagement/dashboard', () => {
    service.loadDashboard().subscribe();

    const req = httpMock.expectOne(dashboardUrl);
    expect(req.request.method).toBe('GET');

    req.flush(buildDashboardResponse());
  });

  it('maps streak data correctly', () => {
    service.loadDashboard().subscribe();
    httpMock.expectOne(dashboardUrl).flush(buildDashboardResponse());

    const streak = service.streak();
    expect(streak?.current_days).toBe(7);
    expect(streak?.status).toBe('active');
    expect(streak?.longest_streak).toBe(14);
    expect(streak?.last_activity_at).toBe('2026-03-12T10:00:00Z');
  });

  it('maps XP summary correctly', () => {
    service.loadDashboard().subscribe();
    httpMock.expectOne(dashboardUrl).flush(buildDashboardResponse());

    const xp = service.xp();
    expect(xp?.total_xp).toBe(1250);
    expect(xp?.level).toBe(5);
    expect(xp?.xp_to_next_level).toBe(600);
    expect(xp?.combo_multiplier).toBe(2);
  });

  it('maps daily dose status correctly', () => {
    service.loadDashboard().subscribe();
    httpMock.expectOne(dashboardUrl).flush(buildDashboardResponse());

    expect(service.dailyDoseStatus()).toBe('available');
  });

  it('maps path progress correctly', () => {
    service.loadDashboard().subscribe();
    httpMock.expectOne(dashboardUrl).flush(buildDashboardResponse());

    const paths = service.pathProgress();
    expect(paths.length).toBe(2);
    expect(paths[0].path_title).toBe('Algebra Foundations');
    expect(paths[0].completion_pct).toBe(60);
    expect(paths[0].steps_completed).toBe(30);
    expect(paths[0].steps_total).toBe(50);
  });

  it('maps active goals count correctly', () => {
    service.loadDashboard().subscribe();
    httpMock.expectOne(dashboardUrl).flush(buildDashboardResponse());

    expect(service.activeGoalsCount()).toBe(1);
  });

  it('sets error state on failure', () => {
    service.loadDashboard().subscribe();
    httpMock.expectOne(dashboardUrl).error(new ProgressEvent('error'));

    expect(service.dashboardState().status).toBe('error');
  });

  // -----------------------------------------------------------------------
  // loadGoals (REST)
  // -----------------------------------------------------------------------

  it('loads goals from separate endpoint', () => {
    service.loadGoals().subscribe();

    httpMock.expectOne(goalsUrl).flush(buildGoalsResponse());

    expect(service.goals().length).toBe(2);
    expect(service.goals()[0].title).toBe('Master Algebra');
    expect(service.goals()[0].progress_pct).toBe(60);
    expect(service.goals()[0].bounty_star_credits).toBe(50);
    expect(service.goals()[0].target_scope.type).toBe('atom_count');
  });

  it('filters active goals', () => {
    service.loadGoals().subscribe();
    httpMock.expectOne(goalsUrl).flush(buildGoalsResponse());

    expect(service.activeGoals().length).toBe(1);
    expect(service.activeGoals()[0].id).toBe('goal-001');
  });

  it('loads goals with status filter', () => {
    service.loadGoals('active').subscribe();
    httpMock.expectOne(`${goalsUrl}?status=active`).flush({
      data: [buildGoalsResponse().data[0]],
      page_info: { has_next: false },
    });

    expect(service.goals().length).toBe(1);
  });

  // -----------------------------------------------------------------------
  // loadLeaderboard (REST — period switching)
  // -----------------------------------------------------------------------

  it('loads leaderboard by period', () => {
    service.loadLeaderboard('weekly').subscribe();
    expect(service.leaderboardState().status).toBe('loading');

    httpMock
      .expectOne(`${leaderboardUrl}?period=weekly`)
      .flush(buildLeaderboardResponse());

    expect(service.leaderboardState().status).toBe('success');
    const lb = service.leaderboard();
    expect(lb?.entries[0].display_name).toBe('Alice');
    expect(lb?.learner_rank?.rank).toBe(5);
    expect(lb?.period).toBe('weekly');
  });

  it('sets leaderboard error on failure', () => {
    service.loadLeaderboard('weekly').subscribe();
    httpMock
      .expectOne(`${leaderboardUrl}?period=weekly`)
      .error(new ProgressEvent('error'));

    expect(service.leaderboardState().status).toBe('error');
  });

  // -----------------------------------------------------------------------
  // acceptGoal (REST)
  // -----------------------------------------------------------------------

  it('accepts a goal and updates goal list state', () => {
    // Load goals first
    service.loadGoals().subscribe();
    httpMock.expectOne(goalsUrl).flush(buildGoalsResponse());

    // Accept goal-001
    const updatedGoal = { ...buildGoalsResponse().data[0], status: 'active' };
    service.acceptGoal('goal-001').subscribe((result) => {
      expect(result).toBe(true);
    });

    httpMock.expectOne(`${goalsUrl}/goal-001/accept`).flush(updatedGoal);

    expect(service.goalActionState().status).toBe('success');
  });

  it('sets goal action error on failure', () => {
    service.acceptGoal('goal-999').subscribe((result) => {
      expect(result).toBe(false);
    });

    httpMock.expectOne(`${goalsUrl}/goal-999/accept`).error(new ProgressEvent('error'));

    expect(service.goalActionState().status).toBe('error');
  });

  // -----------------------------------------------------------------------
  // declineGoal (REST)
  // -----------------------------------------------------------------------

  it('declines a goal', () => {
    service.loadGoals().subscribe();
    httpMock.expectOne(goalsUrl).flush(buildGoalsResponse());

    const declined = { ...buildGoalsResponse().data[0], status: 'declined' };
    service.declineGoal('goal-001').subscribe((result) => {
      expect(result).toBe(true);
    });

    httpMock.expectOne(`${goalsUrl}/goal-001/decline`).flush(declined);
    expect(service.goalActionState().status).toBe('success');
  });

  // -----------------------------------------------------------------------
  // State reset
  // -----------------------------------------------------------------------

  it('resetState returns to idle', () => {
    service.loadDashboard().subscribe();
    httpMock.expectOne(dashboardUrl).flush(buildDashboardResponse());

    service.resetState();

    expect(service.dashboardState().status).toBe('idle');
    expect(service.leaderboardState().status).toBe('idle');
    expect(service.goalActionState().status).toBe('idle');
    expect(service.streak()).toBeNull();
    expect(service.goals()).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Initial computed defaults (idle / no data)
  // -----------------------------------------------------------------------

  it('returns null/empty computed defaults while idle', () => {
    expect(service.level()).toBeNull();
    expect(service.dailyDoseStatus()).toBeNull();
    expect(service.activeGoalsCount()).toBe(0);
    expect(service.pathProgress()).toEqual([]);
    expect(service.activeGoals()).toEqual([]);
    expect(service.goalActionState().status).toBe('idle');
    expect(service.examReadiness().status).toBe('idle');
  });

  // -----------------------------------------------------------------------
  // loadDashboard — level computed + null-data branch
  // -----------------------------------------------------------------------

  it('maps level computed from dashboard data', () => {
    service.loadDashboard().subscribe();
    httpMock.expectOne(dashboardUrl).flush(buildDashboardResponse());

    expect(service.level()).toBe(5);
  });

  it('stays loading when dashboard response is null (no state set)', () => {
    service.loadDashboard().subscribe();
    httpMock.expectOne(dashboardUrl).flush(null);

    // tap guards on falsy data — state remains 'loading'
    expect(service.dashboardState().status).toBe('loading');
  });

  it('emits the dashboard data through the returned observable', () => {
    let emitted: unknown = undefined;
    service.loadDashboard().subscribe((d) => (emitted = d));
    httpMock.expectOne(dashboardUrl).flush(buildDashboardResponse());

    expect(emitted).not.toBeNull();
    expect((emitted as { level: number }).level).toBe(5);
  });

  it('emits null and records error message on dashboard 500', () => {
    let emitted: unknown = 'unset';
    service.loadDashboard().subscribe((d) => (emitted = d));
    httpMock
      .expectOne(dashboardUrl)
      .flush('boom', { status: 500, statusText: 'Server Error' });

    expect(emitted).toBeNull();
    const st = service.dashboardState();
    expect(st.status).toBe('error');
    if (st.status === 'error') {
      expect(st.error.code).toBe('DASHBOARD_LOAD_FAILED');
      expect(st.error.message.length).toBeGreaterThan(0);
    }
  });

  // -----------------------------------------------------------------------
  // loadStreak / loadXp / loadDailyDose (GraphQL via /api/v1/graphql POST)
  // -----------------------------------------------------------------------

  const graphqlUrl = `${baseUrl}/api/v1/graphql`;

  it('loadStreak posts GraphQL and maps camelCase → snake_case', () => {
    let result: unknown = 'unset';
    service.loadStreak().subscribe((r) => (result = r));

    const req = httpMock.expectOne(graphqlUrl);
    expect(req.request.method).toBe('POST');
    req.flush({
      data: {
        myStreak: {
          currentDays: 9,
          status: 'active',
          longestStreak: 21,
          lastActivityAt: '2026-03-12T10:00:00Z',
        },
      },
    });

    expect(result).toEqual({
      current_days: 9,
      status: 'active',
      longest_streak: 21,
      last_activity_at: '2026-03-12T10:00:00Z',
    });
  });

  it('loadStreak returns null when myStreak is absent', () => {
    let result: unknown = 'unset';
    service.loadStreak().subscribe((r) => (result = r));
    httpMock.expectOne(graphqlUrl).flush({ data: { myStreak: null } });

    expect(result).toBeNull();
  });

  it('loadStreak returns null on GraphQL error', () => {
    let result: unknown = 'unset';
    service.loadStreak().subscribe((r) => (result = r));
    httpMock
      .expectOne(graphqlUrl)
      .flush('err', { status: 500, statusText: 'Server Error' });

    expect(result).toBeNull();
  });

  it('loadXp posts GraphQL and maps XP summary', () => {
    let result: unknown = 'unset';
    service.loadXp().subscribe((r) => (result = r));
    httpMock.expectOne(graphqlUrl).flush({
      data: {
        myXP: {
          totalXp: 3300,
          level: 8,
          xpToNextLevel: 200,
          comboMultiplier: 3,
        },
      },
    });

    expect(result).toEqual({
      total_xp: 3300,
      level: 8,
      xp_to_next_level: 200,
      combo_multiplier: 3,
    });
  });

  it('loadXp returns null when myXP is absent', () => {
    let result: unknown = 'unset';
    service.loadXp().subscribe((r) => (result = r));
    httpMock.expectOne(graphqlUrl).flush({ data: { myXP: null } });

    expect(result).toBeNull();
  });

  it('loadXp returns null on GraphQL error', () => {
    let result: unknown = 'unset';
    service.loadXp().subscribe((r) => (result = r));
    httpMock
      .expectOne(graphqlUrl)
      .error(new ProgressEvent('error'));

    expect(result).toBeNull();
  });

  it('loadDailyDose returns the session payload', () => {
    let result: unknown = 'unset';
    service.loadDailyDose().subscribe((r) => (result = r));
    const session = {
      cards: [],
      combo: 2,
      xpEarned: 120,
      completedCount: 3,
    };
    httpMock.expectOne(graphqlUrl).flush({ data: { dailyDose: session } });

    expect(result).toEqual(session);
  });

  it('loadDailyDose returns null when dailyDose is absent', () => {
    let result: unknown = 'unset';
    service.loadDailyDose().subscribe((r) => (result = r));
    httpMock.expectOne(graphqlUrl).flush({ data: { dailyDose: null } });

    expect(result).toBeNull();
  });

  it('loadDailyDose returns null on GraphQL error', () => {
    let result: unknown = 'unset';
    service.loadDailyDose().subscribe((r) => (result = r));
    httpMock
      .expectOne(graphqlUrl)
      .error(new ProgressEvent('error'));

    expect(result).toBeNull();
  });

  // -----------------------------------------------------------------------
  // loadGoals — error path + null-data branch + emitted value
  // -----------------------------------------------------------------------

  it('emits the goals array through the returned observable', () => {
    let emitted: unknown = 'unset';
    service.loadGoals().subscribe((g) => (emitted = g));
    httpMock.expectOne(goalsUrl).flush(buildGoalsResponse());

    expect(Array.isArray(emitted)).toBe(true);
    expect((emitted as unknown[]).length).toBe(2);
  });

  it('defaults to empty goals when response has no data array', () => {
    service.loadGoals().subscribe();
    httpMock.expectOne(goalsUrl).flush({ page_info: { has_next: true } });

    expect(service.goals()).toEqual([]);
    const st = service.goalListState();
    expect(st.status).toBe('success');
  });

  it('sets goal list error on failure and emits null', () => {
    let emitted: unknown = 'unset';
    service.loadGoals().subscribe((g) => (emitted = g));
    httpMock.expectOne(goalsUrl).error(new ProgressEvent('error'));

    expect(emitted).toBeNull();
    const st = service.goalListState();
    expect(st.status).toBe('error');
    if (st.status === 'error') {
      expect(st.error.code).toBe('GOALS_LOAD_FAILED');
    }
    expect(service.goals()).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // loadLeaderboard — additional periods
  // -----------------------------------------------------------------------

  it('loads leaderboard for the all_time period', () => {
    service.loadLeaderboard('all_time').subscribe();
    httpMock
      .expectOne(`${leaderboardUrl}?period=all_time`)
      .flush({ ...buildLeaderboardResponse(), period: 'all_time' });

    const lb = service.leaderboard();
    expect(lb?.period).toBe('all_time');
    expect(lb?.entries.length).toBe(2);
  });

  // -----------------------------------------------------------------------
  // acceptGoal / declineGoal — no list loaded branch + decline error
  // -----------------------------------------------------------------------

  it('accepts a goal without touching list state when list is not loaded', () => {
    let result: unknown = 'unset';
    service.acceptGoal('goal-001').subscribe((r) => (result = r));
    httpMock
      .expectOne(`${goalsUrl}/goal-001/accept`)
      .flush(buildGoalsResponse().data[0]);

    expect(result).toBe(true);
    expect(service.goalActionState().status).toBe('success');
    // list never loaded → stays idle
    expect(service.goalListState().status).toBe('idle');
  });

  it('updates the matching goal in list state on accept', () => {
    service.loadGoals().subscribe();
    httpMock.expectOne(goalsUrl).flush(buildGoalsResponse());

    const updated = { ...buildGoalsResponse().data[0], title: 'Renamed Goal' };
    service.acceptGoal('goal-001').subscribe();
    httpMock.expectOne(`${goalsUrl}/goal-001/accept`).flush(updated);

    const replaced = service.goals().find((g) => g.id === 'goal-001');
    expect(replaced?.title).toBe('Renamed Goal');
    // the non-matching goal is left untouched
    expect(service.goals().find((g) => g.id === 'goal-002')?.title).toBe(
      'Physics Retention',
    );
  });

  it('sets submitting state synchronously on declineGoal', () => {
    service.declineGoal('goal-001').subscribe();
    expect(service.goalActionState().status).toBe('submitting');
    httpMock
      .expectOne(`${goalsUrl}/goal-001/decline`)
      .flush(buildGoalsResponse().data[0]);
  });

  it('sets goal action error and emits false on decline failure', () => {
    let result: unknown = 'unset';
    service.declineGoal('goal-001').subscribe((r) => (result = r));
    httpMock
      .expectOne(`${goalsUrl}/goal-001/decline`)
      .error(new ProgressEvent('error'));

    expect(result).toBe(false);
    const st = service.goalActionState();
    expect(st.status).toBe('error');
    if (st.status === 'error') {
      expect(st.error.code).toBe('GOAL_DECLINE_FAILED');
    }
  });

  it('declines a goal without list update when list is not loaded', () => {
    let result: unknown = 'unset';
    service.declineGoal('goal-001').subscribe((r) => (result = r));
    httpMock
      .expectOne(`${goalsUrl}/goal-001/decline`)
      .flush(buildGoalsResponse().data[0]);

    expect(result).toBe(true);
    expect(service.goalListState().status).toBe('idle');
  });

  // -----------------------------------------------------------------------
  // loadExamReadiness (REST)
  // -----------------------------------------------------------------------

  const examUrl = `${baseUrl}/api/v1/engagement/exam-readiness`;

  function buildExamReadinessResponse() {
    return {
      exam_title: 'WSQ Advanced Certificate',
      exam_date: '2026-04-01T09:00:00Z',
      overall_readiness: 72,
      pass_threshold: 60,
      predicted_score: 78,
      confidence_interval: { low: 70, high: 86 },
      topic_readiness: [
        {
          topic_id: 'topic-1',
          topic_name: 'Algebra',
          readiness: 80,
          atoms_reviewed: 40,
          atoms_total: 50,
          weak_areas: ['quadratics'],
        },
      ],
      revision_stats: {
        atoms_reviewed_today: 12,
        atoms_reviewed_week: 64,
        time_spent_today_ms: 3600000,
        time_spent_week_ms: 18000000,
        streak_days: 7,
        sessions_completed: 9,
      },
      familiar_message: 'You are nearly there!',
    };
  }

  it('sets loading then success and GETs exam-readiness', () => {
    service.loadExamReadiness().subscribe();
    expect(service.examReadiness().status).toBe('loading');

    const req = httpMock.expectOne(examUrl);
    expect(req.request.method).toBe('GET');
    req.flush(buildExamReadinessResponse());

    const st = service.examReadiness();
    expect(st.status).toBe('success');
    if (st.status === 'success') {
      expect(st.data.exam_title).toBe('WSQ Advanced Certificate');
      expect(st.data.overall_readiness).toBe(72);
      expect(st.data.topic_readiness[0].topic_name).toBe('Algebra');
    }
  });

  it('sets exam-readiness error on failure and emits null', () => {
    let emitted: unknown = 'unset';
    service.loadExamReadiness().subscribe((d) => (emitted = d));
    httpMock
      .expectOne(examUrl)
      .flush('boom', { status: 503, statusText: 'Unavailable' });

    expect(emitted).toBeNull();
    const st = service.examReadiness();
    expect(st.status).toBe('error');
    if (st.status === 'error') {
      expect(st.error.code).toBe('EXAM_READINESS_LOAD_FAILED');
    }
  });

  it('resetState also clears leaderboard, goal-list, and exam-readiness state', () => {
    service.loadLeaderboard('weekly').subscribe();
    httpMock
      .expectOne(`${leaderboardUrl}?period=weekly`)
      .flush(buildLeaderboardResponse());
    service.loadGoals().subscribe();
    httpMock.expectOne(goalsUrl).flush(buildGoalsResponse());
    service.loadExamReadiness().subscribe();
    httpMock.expectOne(examUrl).flush(buildExamReadinessResponse());

    service.resetState();

    expect(service.leaderboardState().status).toBe('idle');
    expect(service.goalListState().status).toBe('idle');
    expect(service.examReadiness().status).toBe('idle');
    expect(service.leaderboard()).toBeNull();
    expect(service.goals()).toEqual([]);
  });
});
