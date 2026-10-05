/**
 * ActivityDigestComponent — Detailed activity feed for a linked learner.
 *
 * Route: /parent/activity/:learnerId
 *
 * Features:
 *   - Weekly activity digest cards (atoms completed, XP, streak, score)
 *   - Highlight achievements per period
 *   - Digest preferences configuration (frequency + channels)
 *   - Empty state for no digests
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  input,
  computed,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ParentService } from '../../services/parent.service';
import {
  DIGEST_FREQUENCY_LABELS,
  DELIVERY_CHANNEL_LABELS,
  ALL_DIGEST_FREQUENCIES,
  ALL_DELIVERY_CHANNELS,
} from '../../models/parent.model';
import type { DigestFrequency, DeliveryChannel } from '../../models/parent.model';

@Component({
  selector: 'chora-activity-digest',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './activity-digest.component.html',
  styleUrl: './activity-digest.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityDigestComponent implements OnInit, OnDestroy {
  private readonly parentService = inject(ParentService);
  private readonly toast = inject(ToastService);

  // --- Route params ---
  readonly learnerId = input.required<string>();

  // --- State ---
  readonly digestState = this.parentService.digestState;
  readonly digests = this.parentService.digests;
  readonly preferenceState = this.parentService.preferenceState;
  readonly preference = this.parentService.preference;

  // --- Constants ---
  readonly frequencyLabels = DIGEST_FREQUENCY_LABELS;
  readonly channelLabels = DELIVERY_CHANNEL_LABELS;
  readonly allFrequencies = ALL_DIGEST_FREQUENCIES;
  readonly allChannels = ALL_DELIVERY_CHANNELS;

  // --- Computed ---
  readonly learnerDigests = computed(() =>
    this.digests().filter((d) => d.learner_gcid === this.learnerId()),
  );

  readonly hasDigests = computed(() => this.learnerDigests().length > 0);

  readonly latestDigest = computed(() => {
    const sorted = [...this.learnerDigests()].sort(
      (a, b) => new Date(b.period_end).getTime() - new Date(a.period_end).getTime(),
    );
    return sorted.length > 0 ? sorted[0] : null;
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.parentService.loadDigests().subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  updateFrequency(frequency: DigestFrequency): void {
    const current = this.preference();
    const channels = current ? current.channels : ['email' as DeliveryChannel];

    this.subscriptions.add(
      this.parentService.updateDigestPreferences({ frequency, channels }).subscribe({
        next: (result) => {
          if (result) {
            this.toast.show('parent.preferences_updated', 'success');
          }
        },
        error: () => {
          this.toast.show('parent.preferences_update_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }

  formatPeriod(start: string, end: string): string {
    return `${this.formatDate(start)} \u2013 ${this.formatDate(end)}`;
  }

  formatScore(pct: number): string {
    return `${pct.toFixed(1)}%`;
  }
}
