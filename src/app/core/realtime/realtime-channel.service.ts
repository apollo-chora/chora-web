/**
 * RealtimeChannelService — the single learner-scoped SSE channel (ADR-183).
 *
 * Opens ONE EventSource to chora-realtime's multiplexed stream and demuxes the
 * {topic, payload} envelopes into per-topic streams. Replaces the per-domain
 * realtime stubs (the disabled notifications WebSocketService and the
 * BE-less familiar EventSource).
 *
 * Auth: EventSource cannot send an Authorization header, so we first mint a
 * short-lived one-time ticket (GET /api/v1/realtime/ticket via the BFF, which
 * IS Bearer-authed) and open the stream with `?ticket=`. On every reconnect we
 * mint a FRESH ticket (the previous one is expired/consumed) — this is the key
 * difference from native EventSource reconnect, which would re-hit the dead
 * ticket and 401-loop.
 *
 * Delivery is at-most-once and unordered; the GCLB caps the stream at 3600s and
 * pods drain on redeploy. So consumers MUST reconcile via their authoritative
 * GET on every (re)connect — subscribe to {@link reconnected} for that. The
 * stream is a latency optimiser over polling, never the source of truth.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';

import { environment } from '../../../environments/environment';
import { BffClientService } from '../services/bff-client.service';
import type {
  RealtimeConnectionState,
  RealtimeEnvelope,
  RealtimeFamiliarLeveledUp,
  RealtimeManaChanged,
  RealtimeNotificationCreated,
  RealtimeTicket,
} from './realtime-channel.model';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const TICKET_PATH = '/api/v1/realtime/ticket';
const STREAM_PATH = '/api/v1/realtime/stream';

// Topics the channel demuxes (the SSE `event:` name == topic). Listened to
// individually because chora-realtime emits named events; onmessage is also
// wired as a fallback for an unnamed-default wiring.
const TOPICS = [
  'mana.balance.changed',
  'familiar.leveled_up',
  'familiar.bonded',
  'familiar.retired',
  'familiar.skin_equipped',
  'notification.created',
  'notification.read',
  'payment.state.changed',
] as const;

@Injectable({ providedIn: 'root' })
export class RealtimeChannelService {
  private readonly bff = inject(BffClientService);

  private eventSource: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private intentionalClose = false;
  private hasConnectedOnce = false;

  private readonly _connectionState = signal<RealtimeConnectionState>('disconnected');
  readonly connectionState = this._connectionState.asReadonly();
  /** Convenience for poll-fallback gating + UI chips. */
  readonly connected = computed(() => this._connectionState() === 'connected');

  /**
   * Ticks (monotonically) after every successful (re)open EXCEPT the first.
   * Consumers treat a tick as "you may have missed events while
   * disconnected" and re-pull their authoritative GET. Mandatory given the
   * 3600s GCLB cap + mid-stream drops.
   */
  private readonly _reconnected = new Subject<void>();
  readonly reconnected$ = this._reconnected.asObservable();

  // Per-topic multicast streams + a generic firehose.
  private readonly _stream = new Subject<RealtimeEnvelope>();
  private readonly _mana = new Subject<RealtimeManaChanged>();
  private readonly _familiarLeveledUp = new Subject<RealtimeFamiliarLeveledUp>();
  private readonly _notificationCreated = new Subject<RealtimeNotificationCreated>();

  /** All envelopes, any topic (forward-compat for new consumers). */
  readonly stream$: Observable<RealtimeEnvelope> = this._stream.asObservable();
  readonly manaBalanceChanged$: Observable<RealtimeManaChanged> = this._mana.asObservable();
  readonly familiarLeveledUp$: Observable<RealtimeFamiliarLeveledUp> =
    this._familiarLeveledUp.asObservable();
  readonly notificationCreated$: Observable<RealtimeNotificationCreated> =
    this._notificationCreated.asObservable();

  /**
   * Open the channel. Idempotent — one EventSource per service instance.
   * Safe no-op where EventSource is unavailable (SSR / jsdom): the app
   * degrades to each consumer's poll/load fallback.
   */
  connect(): void {
    if (typeof EventSource === 'undefined') {
      this._connectionState.set('disconnected');
      return;
    }
    if (this.eventSource || this.reconnectTimer) return;
    this.intentionalClose = false;
    this.openConnection();
  }

  /** Tear down (app shutdown / dev console). */
  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    this.closeStream();
    this._connectionState.set('disconnected');
  }

  /** Dev / test seam — inject a synthetic envelope as if it arrived. */
  emit(envelope: RealtimeEnvelope): void {
    this.demux(envelope);
  }

  // ── internals ──────────────────────────────────────────────────────────

  private openConnection(): void {
    this.clearReconnectTimer();
    this._connectionState.set(this.hasConnectedOnce ? 'reconnecting' : 'connecting');
    // Mint a fresh ticket every (re)connect, then open the stream with it.
    this.bff.get<RealtimeTicket>(TICKET_PATH).subscribe({
      next: (res) => {
        if (this.intentionalClose) return;
        this.openStream(res.ticket);
      },
      error: () => this.scheduleReconnect(),
    });
  }

  private openStream(ticket: string): void {
    if (typeof EventSource === 'undefined') return;
    try {
      const url = `${environment.bffBaseUrl}${STREAM_PATH}?ticket=${encodeURIComponent(ticket)}`;
      const es = new EventSource(url, { withCredentials: true });
      this.eventSource = es;

      es.onopen = () => {
        this.reconnectAttempt = 0;
        this._connectionState.set('connected');
        if (this.hasConnectedOnce) {
          this._reconnected.next();
        }
        this.hasConnectedOnce = true;
      };

      const handler = (msg: MessageEvent<string>): void => {
        try {
          this.demux(JSON.parse(msg.data) as RealtimeEnvelope);
        } catch {
          // Ignore malformed payloads — the backend should never emit them.
        }
      };
      for (const topic of TOPICS) es.addEventListener(topic, handler);
      es.onmessage = handler; // unnamed-default fallback

      es.onerror = () => {
        // Native EventSource would auto-reconnect to the now-dead ticket and
        // 401-loop. Instead: close, then manually reconnect with a fresh
        // ticket and backoff.
        if (this.intentionalClose) return;
        this.closeStream();
        this.scheduleReconnect();
      };
    } catch {
      this.eventSource = null;
      this.scheduleReconnect();
    }
  }

  private demux(envelope: RealtimeEnvelope): void {
    this._stream.next(envelope);
    switch (envelope.topic) {
      case 'mana.balance.changed':
        this._mana.next(envelope.payload as RealtimeManaChanged);
        break;
      case 'familiar.leveled_up':
        this._familiarLeveledUp.next(envelope.payload as RealtimeFamiliarLeveledUp);
        break;
      case 'notification.created':
        this._notificationCreated.next(envelope.payload as RealtimeNotificationCreated);
        break;
      default:
        // Other topics ride stream$ only until a typed consumer exists.
        break;
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose || this.reconnectTimer) return;
    this._connectionState.set('reconnecting');
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt),
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openConnection();
    }, delay);
  }

  private closeStream(): void {
    if (this.eventSource) {
      this.eventSource.onopen = null;
      this.eventSource.onmessage = null;
      this.eventSource.onerror = null;
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
