/**
 * EventBusMonitorComponent — Real-time Pub/Sub event stream viewer.
 *
 * Route: /admin/developer/event-bus
 *
 * Features:
 *   - Live event stream display (topic, event_type, timestamp, payload preview)
 *   - Connect/disconnect toggle
 *   - Filter by topic
 *   - Expandable payload JSON viewer
 *   - Role-gated: super_admin only
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { DeveloperService } from '../../services/developer.service';
import type { EventBusMessage } from '../../models/developer.model';
import { MAX_PAYLOAD_PREVIEW_LENGTH } from '../../models/developer.model';

@Component({
  selector: 'chora-event-bus-monitor',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './event-bus-monitor.component.html',
  styleUrl: './event-bus-monitor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventBusMonitorComponent implements OnDestroy {
  private readonly developerService = inject(DeveloperService);

  // --- State ---
  readonly topicFilter = signal<string | null>(null);
  readonly expandedEventIndex = signal<number | null>(null);
  readonly paused = signal(false);

  // --- Delegated signals from service ---
  readonly connectionState = this.developerService.eventBusConnectionState;
  readonly messages = this.developerService.eventBusMessages;

  // --- Computed ---
  readonly filteredMessages = computed(() => {
    const msgs = this.messages();
    const topic = this.topicFilter();
    if (!topic) return msgs;
    return msgs.filter((m) => m.topic === topic);
  });

  readonly uniqueTopics = computed(() => {
    const topics = new Set(this.messages().map((m) => m.topic));
    return Array.from(topics).sort();
  });

  readonly messageCount = computed(() => this.messages().length);
  readonly isConnected = computed(() => this.connectionState() === 'connected');
  readonly isConnecting = computed(() => this.connectionState() === 'connecting');

  ngOnDestroy(): void {
    this.developerService.disconnectEventBus();
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  toggleConnection(): void {
    if (this.isConnected()) {
      this.developerService.disconnectEventBus();
    } else {
      this.developerService.connectEventBus();
    }
  }

  togglePause(): void {
    this.paused.update((p) => !p);
  }

  clearMessages(): void {
    this.developerService.disconnectEventBus();
    this.expandedEventIndex.set(null);
  }

  onTopicFilter(topic: string | null): void {
    this.topicFilter.set(topic);
  }

  toggleExpand(index: number): void {
    this.expandedEventIndex.update((current) =>
      current === index ? null : index,
    );
  }

  isExpanded(index: number): boolean {
    return this.expandedEventIndex() === index;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  formatTimestamp(isoString: string): string {
    try {
      return new Date(isoString).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
      } as Intl.DateTimeFormatOptions);
    } catch {
      return isoString;
    }
  }

  payloadPreview(payload: Record<string, unknown>): string {
    const json = JSON.stringify(payload);
    if (json.length <= MAX_PAYLOAD_PREVIEW_LENGTH) return json;
    return json.substring(0, MAX_PAYLOAD_PREVIEW_LENGTH) + '...';
  }

  payloadFull(payload: Record<string, unknown>): string {
    return JSON.stringify(payload, null, 2);
  }

  topicShortName(topic: string): string {
    const parts = topic.split('.');
    return parts[parts.length - 1] ?? topic;
  }

  connectionLabel(): string {
    switch (this.connectionState()) {
      case 'connected':
        return 'admin.developer.disconnect';
      case 'connecting':
        return 'admin.developer.connecting';
      default:
        return 'admin.developer.connect';
    }
  }

  trackByIndex(index: number, _item: EventBusMessage): number {
    return index;
  }
}
