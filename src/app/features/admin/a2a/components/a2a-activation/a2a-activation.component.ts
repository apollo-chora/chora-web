/**
 * A2AActivationComponent — A2A Gateway add-on activation for tenant admins.
 *
 * Provides toggle for the A2A Gateway add-on, feature description,
 * pricing display, and partner allow-list configuration.
 *
 * @see docs/design/ux_a2a_protocol.md (Add-on activation flow)
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
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { A2AService } from '../../services/a2a.service';
import {
  PartnerStatus,
  PARTNER_STATUS_LABELS,
} from '../../models/a2a.model';
import { BffClientService } from '../../../../../core/services/bff-client.service';

type AllowListMode = 'all_verified' | 'select_specific';

interface A2AAddOnConfig {
  enabled: boolean;
  allowListMode: AllowListMode;
  selectedPartnerIds: string[];
}

@Component({
  selector: 'chora-a2a-activation',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './a2a-activation.component.html',
  styleUrl: './a2a-activation.component.scss',
})
export class A2AActivationComponent implements OnInit, OnDestroy {
  private readonly a2aService = inject(A2AService);
  private readonly bff = inject(BffClientService);
  private subscriptions = new Subscription();

  /** Add-on configuration state */
  readonly config = signal<A2AAddOnConfig>({
    enabled: false,
    allowListMode: 'all_verified',
    selectedPartnerIds: [],
  });

  /** Available verified partners for multi-select */
  readonly verifiedPartners = computed(() =>
    this.a2aService.partners().filter((p) => p.status === PartnerStatus.Verified),
  );

  /** Whether the config is being saved */
  readonly isSaving = signal(false);

  /** Whether the add-on is active */
  readonly isEnabled = computed(() => this.config().enabled);

  /** Current allow-list mode */
  readonly allowListMode = computed(() => this.config().allowListMode);

  /** Selected partner IDs */
  readonly selectedPartnerIds = computed(() => this.config().selectedPartnerIds);

  /** Partner status label keys for display */
  readonly partnerStatusLabels = PARTNER_STATUS_LABELS;

  ngOnInit(): void {
    this.subscriptions.add(
      this.a2aService.getPartners().subscribe(),
    );
    this.subscriptions.add(
      this.bff.get<A2AAddOnConfig>('/api/v1/a2a/config').subscribe({
        next: (cfg) => {
          if (cfg) {
            this.config.set(cfg);
          }
        },
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  toggleAddOn(): void {
    this.config.update((c) => ({ ...c, enabled: !c.enabled }));
    this.saveConfig();
  }

  setAllowListMode(mode: AllowListMode): void {
    this.config.update((c) => ({
      ...c,
      allowListMode: mode,
      selectedPartnerIds: mode === 'all_verified' ? [] : c.selectedPartnerIds,
    }));
    this.saveConfig();
  }

  togglePartnerSelection(partnerId: string): void {
    this.config.update((c) => {
      const ids = c.selectedPartnerIds.includes(partnerId)
        ? c.selectedPartnerIds.filter((id) => id !== partnerId)
        : [...c.selectedPartnerIds, partnerId];
      return { ...c, selectedPartnerIds: ids };
    });
  }

  isPartnerSelected(partnerId: string): boolean {
    return this.selectedPartnerIds().includes(partnerId);
  }

  savePartnerSelection(): void {
    this.saveConfig();
  }

  statusBadgeClass(status: PartnerStatus): string {
    return `a2a-activation__badge--${status}`;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private saveConfig(): void {
    this.isSaving.set(true);
    this.subscriptions.add(
      this.bff.put<A2AAddOnConfig>('/api/v1/a2a/config', this.config()).subscribe({
        next: () => this.isSaving.set(false),
        error: () => this.isSaving.set(false),
      }),
    );
  }
}
