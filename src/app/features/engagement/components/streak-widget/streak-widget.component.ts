import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import type { StreakData } from '../../models/engagement.models';

@Component({
  selector: 'chora-streak-widget',
  imports: [TranslatePipe],
  templateUrl: './streak-widget.component.html',
  styleUrl: './streak-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StreakWidgetComponent {
  readonly streak = input.required<StreakData>();

  readonly flameClass = computed(() => {
    const status = this.streak().status;
    return `streak-widget__flame--${status}`;
  });

  readonly statusLabel = computed(() => {
    const s = this.streak();
    return `${s.current_days}-day streak, ${s.status}`;
  });
}
