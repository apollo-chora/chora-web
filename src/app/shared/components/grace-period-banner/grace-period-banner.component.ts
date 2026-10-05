/**
 * GracePeriodBannerComponent — Reusable banner that displays a countdown
 * for pending-deletion accounts or tenants with a cancel action.
 *
 * Usage:
 *   <chora-grace-period-banner
 *     [type]="'account'"
 *     [deadline]="deletionDeadline()"
 *     [onCancel]="handleCancel" />
 */
import {
  Component,
  ChangeDetectionStrategy,
  input,
  computed,
  OnDestroy,
  signal,
} from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';

export type GracePeriodType = 'account' | 'tenant';

@Component({
  selector: 'chora-grace-period-banner',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './grace-period-banner.component.html',
  styleUrl: './grace-period-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GracePeriodBannerComponent implements OnDestroy {
  readonly type = input.required<GracePeriodType>();
  readonly deadline = input.required<Date>();
  readonly onCancel = input.required<() => void>();

  private readonly now = signal(new Date());
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Update every minute for countdown
    this.intervalId = setInterval(() => {
      this.now.set(new Date());
    }, 60_000);
  }

  ngOnDestroy(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
    }
  }

  readonly daysRemaining = computed(() => {
    const diff = this.deadline().getTime() - this.now().getTime();
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  });

  readonly isExpired = computed(() => this.daysRemaining() <= 0);

  readonly bannerMessageKey = computed(() => {
    const t = this.type();
    if (this.isExpired()) {
      return t === 'account'
        ? 'grace_period.account_expired'
        : 'grace_period.tenant_expired';
    }
    return t === 'account'
      ? 'grace_period.account_pending'
      : 'grace_period.tenant_pending';
  });

  readonly urgencyClass = computed(() => {
    const days = this.daysRemaining();
    if (days <= 3) return 'grace-period-banner--critical';
    if (days <= 7) return 'grace-period-banner--urgent';
    return 'grace-period-banner--warning';
  });

  handleCancel(): void {
    this.onCancel()();
  }
}
