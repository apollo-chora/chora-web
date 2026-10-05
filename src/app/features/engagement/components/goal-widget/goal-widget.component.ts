import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import type { GoalChallenge } from '../../models/engagement.models';

@Component({
  selector: 'chora-goal-widget',
  imports: [TranslatePipe],
  templateUrl: './goal-widget.component.html',
  styleUrl: './goal-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoalWidgetComponent {
  readonly goals = input.required<GoalChallenge[]>();
  readonly goalAccepted = output<string>();

  readonly activeGoals = computed(() =>
    this.goals().filter((g) => g.status === 'active')
  );

  progressPercent(goal: GoalChallenge): number {
    return Math.round(goal.progress_pct);
  }

  onAccept(goalId: string): void {
    this.goalAccepted.emit(goalId);
  }
}
