import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import type { XpSummaryData } from '../../models/engagement.models';

@Component({
  selector: 'chora-xp-widget',
  imports: [TranslatePipe],
  templateUrl: './xp-widget.component.html',
  styleUrl: './xp-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class XpWidgetComponent {
  readonly xp = input.required<XpSummaryData>();

  readonly progressPercent = computed(() => {
    const xp = this.xp();
    // total_xp and xp_to_next_level define progress within current level
    // xp_to_next_level is how much MORE XP is needed; combo_multiplier is current bonus
    const toNext = xp.xp_to_next_level;
    // Estimate XP earned in current level: a rough approach since the backend
    // doesn't expose xp_in_current_level directly. The level formula is quadratic
    // (level N requires N*100 cumulative), so we compute the threshold.
    return toNext > 0 ? Math.max(0, 100 - Math.round((toNext / ((xp.level + 1) * 100)) * 100)) : 100;
  });
}
