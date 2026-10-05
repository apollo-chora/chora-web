import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type CplusStatCardAccent =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger';

export type CplusStatCardState = 'value' | 'pending';

/**
 * CplusStatCard — thin numeric callout (ADR-196).
 *
 * Replaces the polyglass `.stat-card::before` side-stripe with status shown
 * via a solid accent `data-accent` attribute + value colour (never a stripe,
 * never a gradient fill). Large numeric, 700 weight.
 */
@Component({
  selector: 'chora-cplus-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cplus-stat-card.component.html',
  styleUrl: './cplus-stat-card.component.scss',
})
export class CplusStatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input<string | undefined>(undefined);
  readonly accent = input<CplusStatCardAccent>('neutral');
  readonly state = input<CplusStatCardState>('value');

  readonly displayValue = computed<string>(() => {
    if (this.state() === 'pending') return '-';
    return String(this.value());
  });

  readonly ariaLabel = computed<string>(() => {
    const base = `${this.label()}: ${this.displayValue()}`;
    const h = this.hint();
    return h ? `${base}, ${h}` : base;
  });
}
