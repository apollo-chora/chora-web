/**
 * GovernanceWarningBannerComponent — Tier 1 amber warning banner.
 *
 * Global shared component used in MainLayout to display governance warnings.
 *
 * Features:
 *   - Amber banner at top of page
 *   - Warning message with count ("Warning 2 of 3")
 *   - Acknowledge-to-dismiss button
 *   - Auto-shows when governance warning events received
 *   - Tracks warning count
 *   - Uses role="alert" and aria-live="polite"
 */
import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
} from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';
import type { WarningState } from '../../../features/admin/governance/models/escalation.model';

@Component({
  selector: 'chora-governance-warning-banner',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './governance-warning-banner.component.html',
  styleUrl: './governance-warning-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GovernanceWarningBannerComponent {
  /** Current warning state from the governance system */
  readonly warningState = input.required<WarningState>();

  /** Emits when the user acknowledges the warning */
  readonly acknowledged = output<void>();

  // --- Computed ---
  readonly isVisible = computed(() => {
    const state = this.warningState();
    return state.current_count > 0 && !state.acknowledged;
  });

  readonly warningCount = computed(() => this.warningState().current_count);
  readonly maxWarnings = computed(() => this.warningState().max_before_escalation);
  readonly message = computed(() => this.warningState().latest_message);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  acknowledge(): void {
    this.acknowledged.emit();
  }
}
