import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ChoraStatCardAccent =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger';

export type ChoraStatCardState = 'value' | 'pending';

@Component({
  selector: 'chora-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chora-stat-card.component.html',
  styleUrl: './chora-stat-card.component.scss',
})
export class ChoraStatCardComponent {
  label = input.required<string>();
  value = input.required<string | number>();
  hint = input<string | undefined>(undefined);
  accent = input<ChoraStatCardAccent>('neutral');
  state = input<ChoraStatCardState>('value');
  valueTestid = input<string | undefined>(undefined);

  readonly displayValue = computed<string>(() => {
    if (this.state() === 'pending') return '–';
    return String(this.value());
  });

  readonly ariaLabel = computed<string>(() => {
    const base = `${this.label()}: ${this.displayValue()}`;
    const h = this.hint();
    return h ? `${base}, ${h}` : base;
  });
}
