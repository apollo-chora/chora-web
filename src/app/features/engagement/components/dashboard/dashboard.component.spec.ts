import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { DashboardComponent } from './dashboard.component';
import { DashboardService } from '../../services/dashboard.service';
import type {
  DashboardState, DashboardData, DailyDoseStatus, StreakData, XpSummaryData,
  GoalChallenge, GoalListState, GoalActionState, PathProgress,
  LeaderboardData, LeaderboardState,
} from '../../models/engagement.models';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function buildDashboardData(): DashboardData {
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
    ],
  };
}

function buildGoals(): GoalChallenge[] {
  return [
    {
      id: 'goal-001',
      tenant_id: 'tenant-001',
      assignee_gcid: 'gcid-001',
      created_by: 'instructor-001',
      title: 'Master Algebra',
      description: 'Complete 20 atoms',
      target_scope: { type: 'atom_count', topic_id: null, target_value: 20 },
      deadline: '2026-03-20T00:00:00Z',
      bounty_star_credits: 50,
      status: 'active',
      progress_pct: 60,
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-12T00:00:00Z',
    },
  ];
}

function buildLeaderboard(): LeaderboardData {
  return {
    entries: [
      { rank: 1, gcid: 'gcid-alice', display_name: 'Alice', avatar_url: null, total_xp: 5000, level: 10, streak_days: 30 },
      { rank: 2, gcid: 'gcid-bob', display_name: 'Bob', avatar_url: null, total_xp: 4200, level: 9, streak_days: 14 },
    ],
    learner_rank: { rank: 5, gcid: 'gcid-me', display_name: 'Me', avatar_url: null, total_xp: 1250, level: 5, streak_days: 7 },
    period: 'weekly',
    scope: 'tenant',
    page_info: { has_next: false },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let component: DashboardComponent;
  let element: HTMLElement;

  const data = buildDashboardData();
  const goals = buildGoals();
  const leaderboard = buildLeaderboard();

  const mockDashboardState = signal<DashboardState>({ status: 'idle' });
  const streakSignal = signal<StreakData | null>(null);
  const xpSignal = signal<XpSummaryData | null>(null);
  const dailyDoseStatusSignal = signal<DailyDoseStatus | null>(null);
  const activeGoalsCountSignal = signal(0);
  const pathProgressSignal = signal<PathProgress[]>([]);
  const goalsSignal = signal<GoalChallenge[]>([]);
  const activeGoalsSignal = signal<GoalChallenge[]>([]);
  const leaderboardSignal = signal<LeaderboardData | null>(null);
  const leaderboardStateSignal = signal<LeaderboardState>({ status: 'idle' });
  const goalListStateSignal = signal<GoalListState>({ status: 'idle' });
  const goalActionStateSignal = signal<GoalActionState>({ status: 'idle' });
  const levelSignal = signal<number | null>(null);

  const examReadinessSignal = signal<{ status: string }>({ status: 'idle' });

  const mockService = {
    dashboardState: mockDashboardState.asReadonly(),
    streak: streakSignal.asReadonly(),
    xp: xpSignal.asReadonly(),
    level: levelSignal.asReadonly(),
    dailyDoseStatus: dailyDoseStatusSignal.asReadonly(),
    activeGoalsCount: activeGoalsCountSignal.asReadonly(),
    pathProgress: pathProgressSignal.asReadonly(),
    goals: goalsSignal.asReadonly(),
    activeGoals: activeGoalsSignal.asReadonly(),
    leaderboard: leaderboardSignal.asReadonly(),
    leaderboardState: leaderboardStateSignal.asReadonly(),
    goalListState: goalListStateSignal.asReadonly(),
    goalActionState: goalActionStateSignal.asReadonly(),
    examReadiness: examReadinessSignal.asReadonly(),
    loadDashboard: vi.fn().mockReturnValue(of(data)),
    loadGoals: vi.fn().mockReturnValue(of(goals)),
    loadLeaderboard: vi.fn().mockReturnValue(of(leaderboard)),
    loadExamReadiness: vi.fn().mockReturnValue(of(null)),
    acceptGoal: vi.fn().mockReturnValue(of(true)),
    declineGoal: vi.fn().mockReturnValue(of(true)),
    resetState: vi.fn(),
  };

  const mockRouter = { navigate: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDashboardState.set({ status: 'success', data });
    streakSignal.set(data.streak);
    xpSignal.set(data.xp);
    levelSignal.set(data.level);
    dailyDoseStatusSignal.set(data.daily_dose_status);
    activeGoalsCountSignal.set(data.active_goals_count);
    pathProgressSignal.set(data.path_progress);
    goalsSignal.set(goals);
    activeGoalsSignal.set(goals.filter((g) => g.status === 'active'));
    leaderboardSignal.set(leaderboard);

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: DashboardService, useValue: mockService },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  it('loads dashboard, goals, and leaderboard on init', () => {
    expect(mockService.loadDashboard).toHaveBeenCalled();
    expect(mockService.loadGoals).toHaveBeenCalled();
    expect(mockService.loadLeaderboard).toHaveBeenCalledWith('weekly');
  });

  it('renders dashboard container', () => {
    expect(element.querySelector('[data-testid="dashboard"]')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  it('shows loading state', () => {
    mockDashboardState.set({ status: 'loading' });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="dashboard-loading"]')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  it('shows error state with retry', () => {
    mockDashboardState.set({ status: 'error', error: { code: 'ERR', message: 'Failed' } });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="dashboard-error"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="dashboard-retry"]')).toBeTruthy();
  });

  it('retries on error button click', () => {
    mockDashboardState.set({ status: 'error', error: { code: 'ERR', message: 'Failed' } });
    fixture.detectChanges();
    mockService.loadDashboard.mockClear();

    (element.querySelector('[data-testid="dashboard-retry"]') as HTMLElement).click();
    expect(mockService.loadDashboard).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Success state — widget grid
  // -----------------------------------------------------------------------

  it('renders widget grid on success', () => {
    expect(element.querySelector('[data-testid="dashboard-grid"]')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // DailyDose widget
  // -----------------------------------------------------------------------

  it('renders DailyDose widget', () => {
    expect(element.querySelector('[data-testid="dashboard-dose-widget"]')).toBeTruthy();
  });

  it('shows start button when dose available', () => {
    expect(element.querySelector('[data-testid="dose-start-btn"]')).toBeTruthy();
  });

  it('navigates to daily dose on start', () => {
    (element.querySelector('[data-testid="dose-start-btn"]') as HTMLElement).click();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/learning/daily-dose']);
  });

  it('shows completed message when dose completed', () => {
    dailyDoseStatusSignal.set('completed');
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="dose-completed"]')).toBeTruthy();
  });

  it('shows empty dose message when not configured', () => {
    dailyDoseStatusSignal.set('not_configured');
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="dose-empty"]')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Streak widget
  // -----------------------------------------------------------------------

  it('renders streak widget', () => {
    expect(element.querySelector('[data-testid="streak-widget"]')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // XP widget
  // -----------------------------------------------------------------------

  it('renders XP widget', () => {
    expect(element.querySelector('[data-testid="xp-widget"]')).toBeTruthy();
  });

  it('shows level', () => {
    expect(element.querySelector('[data-testid="xp-level"]')?.textContent).toContain('5');
  });

  it('shows total XP', () => {
    expect(element.querySelector('[data-testid="xp-total"]')?.textContent).toContain('1250');
  });

  // -----------------------------------------------------------------------
  // Goal widget
  // -----------------------------------------------------------------------

  it('renders goal widget', () => {
    expect(element.querySelector('[data-testid="goal-widget"]')).toBeTruthy();
  });

  it('renders goal cards', () => {
    const cards = element.querySelectorAll('[data-testid="goal-card"]');
    expect(cards.length).toBe(1);
  });

  it('shows goal title', () => {
    expect(element.querySelector('[data-testid="goal-title"]')?.textContent).toContain('Master Algebra');
  });

  it('shows goal bounty', () => {
    expect(element.querySelector('[data-testid="goal-bounty"]')?.textContent).toContain('50');
  });

  // -----------------------------------------------------------------------
  // Path progress widget
  // -----------------------------------------------------------------------

  it('renders path progress widget', () => {
    expect(element.querySelector('[data-testid="path-progress-widget"]')).toBeTruthy();
  });

  it('renders path cards', () => {
    const cards = element.querySelectorAll('[data-testid="path-card"]');
    expect(cards.length).toBe(1);
  });

  it('shows path name and percent', () => {
    expect(element.querySelector('[data-testid="path-name"]')?.textContent).toContain('Algebra Foundations');
    expect(element.querySelector('[data-testid="path-percent"]')?.textContent).toContain('60');
  });

  it('navigates on path click', () => {
    (element.querySelector('[data-testid="path-card"]') as HTMLElement).click();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/learning'], { queryParams: { pathId: 'path-001' } });
  });

  // -----------------------------------------------------------------------
  // Leaderboard widget
  // -----------------------------------------------------------------------

  it('renders leaderboard widget', () => {
    expect(element.querySelector('[data-testid="leaderboard-widget"]')).toBeTruthy();
  });

  it('shows leaderboard entries', () => {
    const rows = element.querySelectorAll('[data-testid="leaderboard-row"]');
    expect(rows.length).toBe(2);
  });

  it('shows user rank', () => {
    expect(element.querySelector('[data-testid="leaderboard-user-rank"]')?.textContent).toContain('5');
  });

  it('shows period toggle buttons', () => {
    const btns = element.querySelectorAll('[data-testid="leaderboard-period-btn"]');
    expect(btns.length).toBe(3);
  });

  it('changes period on button click', () => {
    const btns = element.querySelectorAll('[data-testid="leaderboard-period-btn"]');
    (btns[1] as HTMLElement).click();
    expect(mockService.loadLeaderboard).toHaveBeenCalledWith('monthly');
  });

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  it('resets state on destroy', () => {
    component.ngOnDestroy();
    expect(mockService.resetState).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Accessibility
  // -----------------------------------------------------------------------

  it('has main role with aria-label', () => {
    const container = element.querySelector('[data-testid="dashboard"]');
    expect(container?.getAttribute('role')).toBe('main');
    expect(container?.getAttribute('aria-label')).toBe('Learner Dashboard');
  });

  it('xp widget has region role', () => {
    const widget = element.querySelector('[data-testid="xp-widget"]');
    expect(widget?.getAttribute('role')).toBe('region');
  });

  it('leaderboard has table role', () => {
    const table = element.querySelector('[data-testid="leaderboard-table"]');
    expect(table?.getAttribute('role')).toBe('table');
  });
});
