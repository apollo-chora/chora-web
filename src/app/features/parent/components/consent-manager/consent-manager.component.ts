/**
 * ConsentManagerComponent — Manage consent grants for guardian-learner data sharing.
 *
 * Route: /parent/consent
 *
 * Features:
 *   - List of linked learners with consent status
 *   - Toggle consent per category (activity digests, progress alerts)
 *   - Grant / revoke guardian links
 *   - Consent audit log display
 *   - Loading, error, and empty states
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
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ParentService } from '../../services/parent.service';
import {
  GUARDIAN_LINK_STATUS_LABELS,
  GUARDIAN_RELATIONSHIP_LABELS,
  DIGEST_FREQUENCY_LABELS,
  ALL_DIGEST_FREQUENCIES,
  ALL_DELIVERY_CHANNELS,
  DELIVERY_CHANNEL_LABELS,
} from '../../models/parent.model';
import type {
  GuardianLink,
  DigestFrequency,
  DeliveryChannel,
} from '../../models/parent.model';

@Component({
  selector: 'chora-consent-manager',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './consent-manager.component.html',
  styleUrl: './consent-manager.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsentManagerComponent implements OnInit, OnDestroy {
  private readonly parentService = inject(ParentService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly linkState = this.parentService.linkState;
  readonly guardianLinks = this.parentService.guardianLinks;
  readonly activeLinks = this.parentService.activeLinks;
  readonly pendingLinks = this.parentService.pendingLinks;
  readonly preferenceState = this.parentService.preferenceState;
  readonly preference = this.parentService.preference;

  // --- Local state ---
  readonly selectedFrequency = signal<DigestFrequency>('weekly');
  readonly selectedChannels = signal<DeliveryChannel[]>(['email']);

  // --- Constants ---
  readonly statusLabels = GUARDIAN_LINK_STATUS_LABELS;
  readonly relationshipLabels = GUARDIAN_RELATIONSHIP_LABELS;
  readonly frequencyLabels = DIGEST_FREQUENCY_LABELS;
  readonly channelLabels = DELIVERY_CHANNEL_LABELS;
  readonly allFrequencies = ALL_DIGEST_FREQUENCIES;
  readonly allChannels = ALL_DELIVERY_CHANNELS;

  // --- Computed ---
  readonly totalLinks = computed(() => this.guardianLinks().length);

  readonly hasLinks = computed(() => this.guardianLinks().length > 0);

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.parentService.loadGuardianLinks().subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  revokeLink(link: GuardianLink): void {
    this.subscriptions.add(
      this.parentService.revokeGuardianLink(link.id).subscribe({
        next: () => {
          this.toast.show('parent.consent_revoked', 'success');
        },
        error: () => {
          this.toast.show('parent.consent_revoke_error', 'error');
        },
      }),
    );
  }

  onFrequencyChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as DigestFrequency;
    this.selectedFrequency.set(value);
  }

  toggleChannel(channel: DeliveryChannel): void {
    this.selectedChannels.update((prev) => {
      if (prev.includes(channel)) {
        return prev.filter((c) => c !== channel);
      }
      return [...prev, channel];
    });
  }

  savePreferences(): void {
    this.subscriptions.add(
      this.parentService.updateDigestPreferences({
        frequency: this.selectedFrequency(),
        channels: this.selectedChannels(),
      }).subscribe({
        next: (result) => {
          if (result) {
            this.toast.show('parent.preferences_saved', 'success');
          }
        },
        error: () => {
          this.toast.show('parent.preferences_save_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  isChannelSelected(channel: DeliveryChannel): boolean {
    return this.selectedChannels().includes(channel);
  }

  statusClass(status: string): string {
    return `consent-manager__status--${status}`;
  }

  formatDate(isoString: string | null): string {
    if (!isoString) return '-';
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }

  isActive(link: GuardianLink): boolean {
    return link.status === 'active';
  }

  trackByLinkId(_index: number, link: GuardianLink): string {
    return link.id;
  }

  trackByChannel(_index: number, channel: DeliveryChannel): string {
    return channel;
  }
}
