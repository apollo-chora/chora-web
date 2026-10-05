/**
 * CampaignAdminComponent — Promotional campaign management with creation wizard.
 *
 * Route: /billing/campaigns (list) and /billing/campaigns/new (wizard)
 *
 * Features:
 *   - Campaign list table with status filter (draft/active/completed/expired)
 *   - Campaign creation wizard (3 steps: budget + dates, audience, review + launch)
 *   - Campaign detail with performance metrics (impressions, conversions, spend)
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  Campaign,
  CampaignListState,
  CampaignStatus,
  CampaignTargetAudience,
} from '../../models/marketplace.model';
import {
  ALL_CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
} from '../../models/marketplace.model';

type WizardStep = 'budget' | 'audience' | 'review';
type ViewMode = 'list' | 'wizard' | 'detail';

@Component({
  selector: 'chora-campaign-admin',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './campaign-admin.component.html',
  styleUrl: './campaign-admin.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CampaignAdminComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);
  private readonly toast = inject(ToastService);

  // --- State ---
  private readonly _state = signal<CampaignListState>({ status: 'idle' });
  readonly state = this._state.asReadonly();

  readonly campaigns = computed(() => {
    const s = this._state();
    return s.status === 'success' ? s.data : [];
  });

  readonly isLoading = computed(() => this._state().status === 'loading');
  readonly isError = computed(() => this._state().status === 'error');

  // --- View mode ---
  readonly viewMode = signal<ViewMode>('list');

  // --- Filters ---
  readonly filterStatus = signal<CampaignStatus | null>(null);
  readonly allStatuses = ALL_CAMPAIGN_STATUSES;
  readonly statusLabels = CAMPAIGN_STATUS_LABELS;

  readonly filteredCampaigns = computed(() => {
    const filter = this.filterStatus();
    if (!filter) return this.campaigns();
    return this.campaigns().filter((c) => c.status === filter);
  });

  // --- Wizard state ---
  readonly wizardStep = signal<WizardStep>('budget');
  readonly wizardSteps: WizardStep[] = ['budget', 'audience', 'review'];

  readonly wizardName = signal('');
  readonly wizardBudget = signal(0);
  readonly wizardCurrency = signal('usd');
  readonly wizardStartDate = signal('');
  readonly wizardEndDate = signal('');
  readonly wizardTenantTypes = signal('');
  readonly wizardRegions = signal('');
  readonly wizardMinUsageDays = signal(0);
  readonly wizardSubmitting = signal(false);

  readonly wizardStepIndex = computed(() =>
    this.wizardSteps.indexOf(this.wizardStep()),
  );

  // --- Detail view ---
  readonly selectedCampaign = signal<Campaign | null>(null);

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadCampaigns();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadCampaigns(): void {
    this._state.set({ status: 'loading' });
    this.subscriptions.add(
      this.bff.get<Campaign[]>('/api/v1/billing/campaigns').subscribe({
        next: (data) => this._state.set({ status: 'success', data }),
        error: (err: Error) =>
          this._state.set({
            status: 'error',
            error: { code: 'CAMPAIGNS_LOAD_FAILED', message: err.message },
          }),
      }),
    );
  }

  // -------------------------------------------------------------------------
  // View navigation
  // -------------------------------------------------------------------------

  showWizard(): void {
    this.resetWizard();
    this.viewMode.set('wizard');
  }

  showList(): void {
    this.viewMode.set('list');
    this.selectedCampaign.set(null);
  }

  showDetail(campaign: Campaign): void {
    this.selectedCampaign.set(campaign);
    this.viewMode.set('detail');
  }

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  onStatusFilter(value: string): void {
    this.filterStatus.set(value === '' ? null : (value as CampaignStatus));
  }

  // -------------------------------------------------------------------------
  // Wizard navigation
  // -------------------------------------------------------------------------

  nextStep(): void {
    const idx = this.wizardStepIndex();
    if (idx < this.wizardSteps.length - 1) {
      this.wizardStep.set(this.wizardSteps[idx + 1]);
    }
  }

  prevStep(): void {
    const idx = this.wizardStepIndex();
    if (idx > 0) {
      this.wizardStep.set(this.wizardSteps[idx - 1]);
    }
  }

  resetWizard(): void {
    this.wizardStep.set('budget');
    this.wizardName.set('');
    this.wizardBudget.set(0);
    this.wizardCurrency.set('usd');
    this.wizardStartDate.set('');
    this.wizardEndDate.set('');
    this.wizardTenantTypes.set('');
    this.wizardRegions.set('');
    this.wizardMinUsageDays.set(0);
    this.wizardSubmitting.set(false);
  }

  // -------------------------------------------------------------------------
  // Wizard submission
  // -------------------------------------------------------------------------

  launchCampaign(): void {
    this.wizardSubmitting.set(true);

    const audience: CampaignTargetAudience = {
      tenant_types: this.wizardTenantTypes()
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      regions: this.wizardRegions()
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      min_usage_days: this.wizardMinUsageDays(),
    };

    const payload = {
      name: this.wizardName(),
      budget_cents: this.wizardBudget() * 100,
      currency: this.wizardCurrency(),
      start_date: this.wizardStartDate(),
      end_date: this.wizardEndDate(),
      target_audience: audience,
    };

    this.subscriptions.add(
      this.bff.post<Campaign>('/api/v1/billing/campaigns', payload).subscribe({
        next: () => {
          this.wizardSubmitting.set(false);
          this.toast.show('billing.campaign_created', 'success');
          this.showList();
          this.loadCampaigns();
        },
        error: () => {
          this.wizardSubmitting.set(false);
          this.toast.show('billing.campaign_create_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  statusClass(status: string): string {
    return `campaign-admin__status--${status}`;
  }

  formatPrice(amountCents: number, currency: string): string {
    const amount = amountCents / 100;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).format(amount);
    } catch {
      return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
    }
  }

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }

  formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }
}
