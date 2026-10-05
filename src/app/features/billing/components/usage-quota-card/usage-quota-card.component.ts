import {
  Component,
  ChangeDetectionStrategy,
  input,
  computed,
} from '@angular/core';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

@Component({
  selector: 'chora-usage-quota-card',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './usage-quota-card.component.html',
  styleUrl: './usage-quota-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageQuotaCardComponent {
  readonly resourceType = input.required<string>();
  readonly currentUsage = input.required<number>();
  readonly limit = input.required<number>();
  readonly unit = input.required<string>();

  readonly percentUsed = computed(() => {
    const lim = this.limit();
    if (lim <= 0) return 0;
    return Math.round((this.currentUsage() / lim) * 100);
  });

  readonly isWarning = computed(() => this.percentUsed() >= 80 && this.percentUsed() < 95);
  readonly isCritical = computed(() => this.percentUsed() >= 95);
  readonly isOverage = computed(() => this.percentUsed() >= 100);
  readonly progressWidth = computed(() => Math.min(this.percentUsed(), 100));

  formatUsage(): string {
    return `${this.currentUsage()} / ${this.limit()} ${this.unit()}`;
  }
}
