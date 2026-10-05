/**
 * EscalationTrackerComponent — Admin view for governance restriction escalation.
 *
 * Route: /admin/governance/escalation
 *
 * Features:
 *   - Warning count progress bar (e.g., "2/3 before Tier 2")
 *   - Auto-escalation threshold display per tier
 *   - Escalation history table (date, from_tier, to_tier, reason)
 *   - De-escalation controls for admin
 *   - Visual indicators showing proximity to next tier
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
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { BffClientService } from '../../../../../core/services/bff-client.service';
import type {
  EscalationState,
  EscalationTrackerState,
  EscalationEntry,
  EscalationThreshold,
  GovernanceTier,
} from '../../models/escalation.model';
import { GOVERNANCE_TIER_LABELS } from '../../models/escalation.model';

@Component({
  selector: 'chora-escalation-tracker',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './escalation-tracker.component.html',
  styleUrl: './escalation-tracker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EscalationTrackerComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // --- State ---
  private readonly _state = signal<EscalationTrackerState>({ status: 'idle' });
  readonly state = this._state.asReadonly();

  readonly escalation = computed(() => {
    const s = this._state();
    return s.status === 'success' ? s.data : null;
  });

  readonly isLoading = computed(() => this._state().status === 'loading');
  readonly isError = computed(() => this._state().status === 'error');

  // --- Derived ---
  readonly currentTier = computed(() => this.escalation()?.current_tier ?? 'tier_1');
  readonly warningCount = computed(() => this.escalation()?.warning_count ?? 0);
  readonly thresholds = computed<EscalationThreshold[]>(
    () => this.escalation()?.thresholds ?? [],
  );
  readonly history = computed<EscalationEntry[]>(
    () => this.escalation()?.history ?? [],
  );

  readonly nextThreshold = computed(() => {
    const current = this.currentTier();
    const allThresholds = this.thresholds();
    const tierOrder: GovernanceTier[] = ['tier_1', 'tier_2', 'tier_3', 'tier_4'];
    const currentIdx = tierOrder.indexOf(current);
    if (currentIdx < 0 || currentIdx >= tierOrder.length - 1) return null;
    return allThresholds.find((t) => t.tier === tierOrder[currentIdx + 1]) ?? null;
  });

  readonly progressPercent = computed(() => {
    const next = this.nextThreshold();
    if (!next || next.warnings_required === 0) return 100;
    return Math.min((this.warningCount() / next.warnings_required) * 100, 100);
  });

  readonly deEscalating = signal(false);

  // --- Constants ---
  readonly tierLabels = GOVERNANCE_TIER_LABELS;

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadEscalation();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadEscalation(): void {
    this._state.set({ status: 'loading' });
    this.subscriptions.add(
      this.bff
        .get<EscalationState>('/api/v1/governance/escalation')
        .subscribe({
          next: (data) => this._state.set({ status: 'success', data }),
          error: (err: Error) =>
            this._state.set({
              status: 'error',
              error: { code: 'ESCALATION_LOAD_FAILED', message: err.message },
            }),
        }),
    );
  }

  // -------------------------------------------------------------------------
  // De-escalation
  // -------------------------------------------------------------------------

  async deEscalate(): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'admin.governance.de_escalate_title',
      message: 'admin.governance.de_escalate_message',
      confirmText: 'admin.governance.de_escalate_confirm',
      variant: 'info',
    });

    if (!confirmed) return;

    this.deEscalating.set(true);
    this.subscriptions.add(
      this.bff
        .post<void>('/api/v1/governance/escalation/de-escalate', {})
        .subscribe({
          next: () => {
            this.deEscalating.set(false);
            this.toast.show('admin.governance.de_escalated', 'success');
            this.loadEscalation();
          },
          error: () => {
            this.deEscalating.set(false);
            this.toast.show('admin.governance.de_escalate_error', 'error');
          },
        }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  tierClass(tier: string): string {
    return `escalation-tracker__tier--${tier}`;
  }

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }

  isCurrentTier(tier: GovernanceTier): boolean {
    return this.currentTier() === tier;
  }
}
