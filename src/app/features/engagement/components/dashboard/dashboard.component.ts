import {
  Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { DashboardService } from '../../services/dashboard.service';
import { StreakWidgetComponent } from '../streak-widget/streak-widget.component';
import { XpWidgetComponent } from '../xp-widget/xp-widget.component';
import { GoalWidgetComponent } from '../goal-widget/goal-widget.component';
import { LeaderboardWidgetComponent } from '../leaderboard-widget/leaderboard-widget.component';
import { PathProgressWidgetComponent } from '../path-progress-widget/path-progress-widget.component';
import { ExamSummaryWidgetComponent } from '../exam-summary-widget/exam-summary-widget.component';
import { RecommendationWidgetComponent } from '../recommendation-widget/recommendation-widget.component';
import { RetentionAlertComponent } from '../retention-alert/retention-alert.component';
import { NudgePreviewComponent } from '../nudge-preview/nudge-preview.component';
import { ExamCoachingWidgetComponent } from '../exam-coaching-widget/exam-coaching-widget.component';
import type { LeaderboardPeriod } from '../../models/engagement.models';

@Component({
  selector: 'chora-dashboard',
  imports: [
    TranslatePipe,
    StreakWidgetComponent,
    XpWidgetComponent,
    GoalWidgetComponent,
    LeaderboardWidgetComponent,
    PathProgressWidgetComponent,
    ExamSummaryWidgetComponent,
    RecommendationWidgetComponent,
    RetentionAlertComponent,
    NudgePreviewComponent,
    ExamCoachingWidgetComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly dashboardService = inject(DashboardService);
  private readonly router = inject(Router);

  readonly dashboardState = this.dashboardService.dashboardState;
  readonly streak = this.dashboardService.streak;
  readonly xp = this.dashboardService.xp;
  readonly dailyDoseStatus = this.dashboardService.dailyDoseStatus;
  readonly goals = this.dashboardService.goals;
  readonly pathProgress = this.dashboardService.pathProgress;
  readonly leaderboard = this.dashboardService.leaderboard;
  readonly examReadiness = this.dashboardService.examReadiness;

  ngOnInit(): void {
    this.dashboardService.loadDashboard().subscribe();
    this.dashboardService.loadGoals().subscribe();
    this.dashboardService.loadLeaderboard('weekly').subscribe();
    this.dashboardService.loadExamReadiness().subscribe();
  }

  ngOnDestroy(): void {
    this.dashboardService.resetState();
  }

  openDailyDose(): void {
    this.router.navigate(['/learning/daily-dose']);
  }

  onGoalAccepted(goalId: string): void {
    this.dashboardService.acceptGoal(goalId).subscribe();
  }

  onLeaderboardPeriodChanged(period: LeaderboardPeriod): void {
    this.dashboardService.loadLeaderboard(period).subscribe();
  }

  onPathSelected(pathId: string): void {
    this.router.navigate(['/learning'], { queryParams: { pathId } });
  }

  retry(): void {
    this.dashboardService.loadDashboard().subscribe();
  }
}
