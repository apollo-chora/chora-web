import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { BillingService } from '../../services/billing.service';
import type { UsageState } from '../../models/billing.model';
import { UsageQuotaCardComponent } from '../usage-quota-card/usage-quota-card.component';

@Component({
  selector: 'chora-usage-dashboard',
  standalone: true,
  imports: [TranslatePipe, UsageQuotaCardComponent],
  templateUrl: './usage-dashboard.component.html',
  styleUrl: './usage-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageDashboardComponent implements OnInit, OnDestroy {
  private readonly billingService = inject(BillingService);
  private subscriptions = new Subscription();

  readonly selectedPeriod = signal<'current' | 'previous'>('current');

  readonly usageState = computed<UsageState>(() => this.billingService.usageState());

  readonly usageSummaries = computed(() => {
    const state = this.usageState();
    return state.status === 'success' ? state.summaries : [];
  });

  readonly hasOverages = computed(() =>
    this.usageSummaries().some((s) => s.current_usage >= s.limit),
  );

  readonly isLoading = computed(() => this.usageState().status === 'loading');
  readonly isError = computed(() => this.usageState().status === 'error');
  readonly isEmpty = computed(
    () => this.usageState().status === 'success' && this.usageSummaries().length === 0,
  );

  ngOnInit(): void {
    this.loadUsage();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadUsage(): void {
    this.subscriptions.add(this.billingService.loadUsage().subscribe());
  }

  onPeriodChange(period: 'current' | 'previous'): void {
    this.selectedPeriod.set(period);
    this.loadUsage();
  }
}
