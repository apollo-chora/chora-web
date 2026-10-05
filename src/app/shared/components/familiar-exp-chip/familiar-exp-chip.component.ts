/**
 * FamiliarExpChipComponent — small "+N Familiar EXP" peripheral chip.
 *
 * Drops alongside the existing user-facing XP chip on atom-play (and
 * anywhere else where an event awards Familiar EXP). NOT dominant —
 * the chip is intentionally smaller + softer than the user XP chip so
 * the Familiar reward feels like a quiet "your companion grew too."
 *
 * Inputs:
 *  - expDelta: how many Familiar EXP to display
 *  - capped:   true when the daily cap was hit (visual deemphasis)
 */
import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';

import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'chora-familiar-exp-chip',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="familiar-exp-chip"
      [class.is-capped]="capped()"
      [attr.aria-label]="('familiar.exp_chip_aria' | translate) + ' +' + expDelta()"
      data-testid="familiar-exp-chip">
      <i class="fa-solid fa-feather-pointed" aria-hidden="true"></i>
      <span>
        +{{ expDelta() }} {{ 'familiar.exp_chip_label' | translate }}
      </span>
    </span>
  `,
  styles: [`
    :host { display: inline-flex; }

    .familiar-exp-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.18rem 0.6rem;
      border-radius: 999px;
      background: rgba(124, 58, 237, 0.10);
      color: #7c3aed;
      border: 1px solid rgba(124, 58, 237, 0.28);
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: 0.02em;
      font-family: 'Courier New', monospace;
      font-variant-numeric: tabular-nums;

      i { font-size: 9px; }
    }

    .familiar-exp-chip.is-capped {
      opacity: 0.55;
    }
  `],
})
export class FamiliarExpChipComponent {
  readonly expDelta = input<number>(0);
  readonly capped = input<boolean>(false);
}
