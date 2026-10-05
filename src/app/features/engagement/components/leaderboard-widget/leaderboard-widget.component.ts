import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import type { LeaderboardData, LeaderboardPeriod } from '../../models/engagement.models';

@Component({
  selector: 'chora-leaderboard-widget',
  imports: [TranslatePipe],
  templateUrl: './leaderboard-widget.component.html',
  styleUrl: './leaderboard-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeaderboardWidgetComponent {
  readonly leaderboard = input.required<LeaderboardData>();
  readonly periodChanged = output<LeaderboardPeriod>();

  readonly periods: LeaderboardPeriod[] = ['weekly', 'monthly', 'all_time'];

  onPeriodChange(period: LeaderboardPeriod): void {
    this.periodChanged.emit(period);
  }
}
