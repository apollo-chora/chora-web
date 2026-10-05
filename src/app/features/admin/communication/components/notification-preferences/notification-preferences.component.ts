/**
 * NotificationPreferencesComponent — Toggle grid for notification channel preferences.
 *
 * Rows = event categories, columns = channels (in_app, push, email).
 * Each cell is a toggle switch. Quiet hours section at bottom.
 * Reused for BOTH admin and learner settings views.
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
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { CommunicationService } from '../../services/communication.service';
import type {
  NotificationPreference,
  NotificationChannel,
  EventCategory,
} from '../../models/communication.model';
import {
  ALL_CHANNELS,
  ALL_EVENT_CATEGORIES,
  CHANNEL_LABELS,
  EVENT_CATEGORY_LABELS,
} from '../../models/communication.model';

@Component({
  selector: 'chora-notification-preferences',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './notification-preferences.component.html',
  styleUrl: './notification-preferences.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationPreferencesComponent implements OnInit, OnDestroy {
  private readonly communicationService = inject(CommunicationService);
  private readonly toast = inject(ToastService);

  // Device push opt-in was removed with the FCM/Firebase extraction: the
  // browser-level push registration lived entirely inside the Firebase
  // Messaging SDK and the gateway publishes no push-subscription routes.

  // --- State ---
  readonly loading = signal(false);
  readonly preferences = signal<NotificationPreference[]>([]);
  readonly quietHoursStart = signal('22:00');
  readonly quietHoursEnd = signal('07:00');
  readonly quietHoursTimezone = signal(Intl.DateTimeFormat().resolvedOptions().timeZone);

  // --- Constants ---
  readonly allChannels = ALL_CHANNELS;
  readonly allCategories = ALL_EVENT_CATEGORIES;
  readonly channelLabels = CHANNEL_LABELS;
  readonly categoryLabels = EVENT_CATEGORY_LABELS;

  // --- Computed ---
  readonly isEmpty = computed(
    () => !this.loading() && this.preferences().length === 0,
  );

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadPreferences();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadPreferences(): void {
    this.loading.set(true);

    this.subscriptions.add(
      this.communicationService.loadPreferences().subscribe({
        next: (prefs) => {
          if (prefs) {
            this.preferences.set(prefs);
          }
          this.loading.set(false);
        },
        error: () => {
          this.toast.show('admin.communication.preferences_load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  isEnabled(category: EventCategory, channel: NotificationChannel): boolean {
    const pref = this.preferences().find(
      (p) => p.event_category === category && p.channel === channel,
    );
    return pref?.enabled ?? true;
  }

  isLocked(category: EventCategory, channel: NotificationChannel): boolean {
    const pref = this.preferences().find(
      (p) => p.event_category === category && p.channel === channel,
    );
    return pref?.is_locked ?? false;
  }

  isCritical(category: EventCategory, channel: NotificationChannel): boolean {
    const pref = this.preferences().find(
      (p) => p.event_category === category && p.channel === channel,
    );
    return pref?.is_critical ?? false;
  }

  onToggle(category: EventCategory, channel: NotificationChannel): void {
    if (this.isLocked(category, channel) || this.isCritical(category, channel)) return;
    const currentEnabled = this.isEnabled(category, channel);
    const pref: NotificationPreference = {
      gcid: '',
      event_category: category,
      channel,
      enabled: !currentEnabled,
    };

    // Optimistic update
    const current = this.preferences();
    const existingIndex = current.findIndex(
      (p) => p.event_category === category && p.channel === channel,
    );

    if (existingIndex >= 0) {
      const updated = [...current];
      updated[existingIndex] = { ...updated[existingIndex], enabled: !currentEnabled };
      this.preferences.set(updated);
    } else {
      this.preferences.set([...current, pref]);
    }

    this.subscriptions.add(
      this.communicationService.updatePreference(pref).subscribe({
        next: (result) => {
          if (!result) {
            // Revert on failure
            this.loadPreferences();
            this.toast.show('admin.communication.preference_update_error', 'error');
          }
        },
        error: () => {
          this.loadPreferences();
          this.toast.show('admin.communication.preference_update_error', 'error');
        },
      }),
    );
  }

  onQuietHoursStartChange(value: string): void {
    this.quietHoursStart.set(value);
  }

  onQuietHoursEndChange(value: string): void {
    this.quietHoursEnd.set(value);
  }

  onTimezoneChange(value: string): void {
    this.quietHoursTimezone.set(value);
  }

  toggleId(category: EventCategory, channel: NotificationChannel): string {
    return `pref-${category}-${channel}`;
  }
}
