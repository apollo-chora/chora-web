import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * CplusEmptyState — honest empty-state for the C+ surface (ADR-196).
 *
 * Solid surface, centered icon + heading + helper + CTA slot. Used by the
 * feed/duels/leaderboards pages when there is genuinely nothing to show —
 * never as a placeholder for unwired features.
 */
@Component({
  selector: 'chora-cplus-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cplus-empty-state.component.html',
  styleUrl: './cplus-empty-state.component.scss',
})
export class CplusEmptyStateComponent {
  readonly heading = input.required<string>();
  readonly helper = input<string | undefined>(undefined);
  /** Optional icon name (rendered as a data attribute for the SCSS). */
  readonly icon = input<string | undefined>(undefined);
}
