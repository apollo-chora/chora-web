import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ComboTier } from '../../models/atom.models';

@Component({
  selector: 'chora-combo-meter',
  imports: [TranslatePipe],
  template: `
    <div
      class="combo-meter"
      [class.combo-meter--active]="combo() > 1"
      [class.combo-meter--tier2]="combo() === 2"
      [class.combo-meter--tier3]="combo() === 3"
      [class.combo-meter--tier4]="combo() === 4"
      [attr.aria-label]="comboLabel()"
      role="status"
      aria-live="polite"
      data-testid="combo-meter">
      <span class="combo-meter__multiplier" data-testid="combo-multiplier">{{ combo() }}x</span>
      <span class="combo-meter__label">{{ 'atomic.daily-dose.combo' | translate }}</span>
    </div>
  `,
  styles: `
    :host { display: block; }

    .combo-meter {
      display: inline-flex; align-items: center; gap: var(--chora-space-xs);
      padding: var(--chora-space-xs) var(--chora-space-sm);
      border-radius: var(--chora-radius-full);
      background: var(--chora-color-surface-2);
      font-size: 14px; font-weight: 600;
      color: var(--chora-color-text-secondary);
      transition: background 0.3s, color 0.3s, transform 0.2s;

      &--active { color: var(--chora-color-reward); background: rgba(255, 152, 0, 0.1); }
      &--tier2 { background: rgba(255, 152, 0, 0.12); }
      &--tier3 { background: rgba(255, 152, 0, 0.18); }
      &--tier4 { background: rgba(255, 152, 0, 0.25); }

      &__multiplier { font-size: 18px; font-weight: 800; }
      &__label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .combo-meter { transition: none; }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComboMeterComponent {
  combo = input<ComboTier>(1);

  readonly comboLabel = computed(() => `Combo multiplier: ${this.combo()}x`);
}
