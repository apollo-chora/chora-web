/**
 * LivePollPlayService — R+ live-polling learner FE (Track 2).
 *
 * Manages a per-poll WebSocket to the chora-gateway BFF which proxies the WS
 * upgrade to chora-delivery's live-polling handler:
 *
 *   GET /api/v1/live-polls/{pollId}/ws?access_token=<jwt>
 *
 * The protocol is server-push only — the learner never sends votes on this
 * socket. Votes go via REST (`castVote`). The first frame is a `snapshot`;
 * subsequent `event` frames (poll_opened / poll_closed / vote_recorded) each
 * carry an updated snapshot which replaces the exposed state.
 *
 * State is exposed as signals (per chora-web/CLAUDE.md §3 — signals are the
 * primary state primitive). The component binds them with OnPush.
 *
 * Auth: the WS upgrade cannot carry an Authorization header from the browser,
 * so the Chora session JWT is appended as the `access_token` query param
 * (same contract as the live-classroom WS). The token is read from
 * `AuthService.getToken()`; when null (unauthenticated) it is simply omitted
 * and the BFF rejects the upgrade.
 *
 * Resilience: auto-reconnect with capped exponential backoff. Reconnect is
 * suppressed on an intentional `disconnect()` (component teardown). All
 * socket callbacks marshal back into the Angular zone so signal writes
 * trigger change detection.
 *
 * Per `feedback_no_inline_config` the base URL comes from `environment`
 * (sourced from Terraform at build time) — never hard-coded here.
 */
import {
  Injectable,
  NgZone,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/auth/auth.service';
import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  buildTallyRows,
  decodeSnapshot,
  isVotingOpen,
  livePollVotePath,
  livePollWsPath,
  type LivePollFrame,
  type LivePollSnapshot,
  type LivePollTallyRow,
} from './live-poll-play.model';

export type LivePollConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closed';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class LivePollPlayService implements OnDestroy {
  private readonly ngZone = inject(NgZone);
  private readonly auth = inject(AuthService);
  private readonly bff = inject(BffClientService);

  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private intentionalClose = false;
  private pollId = '';

  private readonly _connectionState = signal<LivePollConnectionState>('idle');
  readonly connectionState = this._connectionState.asReadonly();

  private readonly _snapshot = signal<LivePollSnapshot | null>(null);
  readonly snapshot = this._snapshot.asReadonly();

  /** True once the learner has cast a vote on the current poll (first-vote-wins). */
  private readonly _hasVoted = signal<boolean>(false);
  readonly hasVoted = this._hasVoted.asReadonly();

  /** Per-option tally rows derived from the latest snapshot. */
  readonly tallyRows = computed<readonly LivePollTallyRow[]>(() =>
    buildTallyRows(this._snapshot()),
  );

  /** Whether the poll is OPEN (accepting votes). */
  readonly votingOpen = computed<boolean>(() => isVotingOpen(this._snapshot()));

  /** Open the WS for a poll. No-op if already open for the same id. */
  connect(pollId: string): void {
    if (
      this.ws &&
      this.pollId === pollId &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    // Switching poll — tear down any prior socket + reset per-poll state.
    if (this.ws) this.cleanup();
    this.pollId = pollId;
    this.intentionalClose = false;
    this.reconnectAttempt = 0;
    this._snapshot.set(null);
    this._hasVoted.set(false);
    this.openSocket();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.cleanup();
    this._connectionState.set('closed');
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  /**
   * Cast the learner's vote for `optionLabel` via REST. First-vote-wins is
   * enforced server-side; the FE optimistically flips `hasVoted` so the
   * option buttons disable immediately. The updated tally arrives back over
   * the WS as a `vote_recorded` event (no need to read the POST body).
   *
   * Returns the BFF Observable so callers can subscribe for error handling;
   * `hasVoted` is set synchronously before the request fires.
   */
  castVote(optionLabel: string): Observable<unknown> {
    this._hasVoted.set(true);
    return this.bff.post<unknown>(livePollVotePath(this.pollId), {
      option_label: optionLabel,
    });
  }

  private openSocket(): void {
    this._connectionState.set(
      this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting',
    );
    const url = this.buildWsUrl(this.pollId);
    this.ngZone.runOutsideAngular(() => {
      try {
        this.ws = new WebSocket(url);
        this.ws.onopen = () => this.onOpen();
        this.ws.onmessage = (ev) => this.onMessage(ev);
        this.ws.onclose = (ev) => this.onClose(ev);
        this.ws.onerror = () => this.onError();
      } catch {
        this.scheduleReconnect();
      }
    });
  }

  private onOpen(): void {
    this.ngZone.run(() => {
      this._connectionState.set('connected');
      this.reconnectAttempt = 0;
    });
  }

  private onMessage(event: MessageEvent): void {
    let frame: LivePollFrame;
    try {
      frame = JSON.parse(event.data as string) as LivePollFrame;
    } catch {
      return; // ignore malformed frames (fail-soft)
    }
    this.ngZone.run(() => this.applyFrame(frame));
  }

  private applyFrame(frame: LivePollFrame): void {
    // Both `snapshot` and `event` frames carry a full snapshot payload; the
    // poll_opened / poll_closed / vote_recorded events each replay state.
    const snap = decodeSnapshot(frame.payload);
    if (snap) this._snapshot.set(snap);
  }

  private onClose(event: CloseEvent): void {
    if (!this.intentionalClose && event.code !== 1000) {
      this.ngZone.run(() => this._connectionState.set('reconnecting'));
      this.scheduleReconnect();
    } else {
      this.ngZone.run(() => this._connectionState.set('closed'));
    }
  }

  private onError(): void {
    this.ws?.close();
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose) return;
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt),
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => this.openSocket(), delay);
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try {
        this.ws.close(1000);
      } catch {
        // already closed
      }
      this.ws = null;
    }
  }

  /**
   * Build the wss:// URL for the per-poll WS fan-out, appending the Chora
   * session JWT as `access_token` (url-encoded) when present. The browser WS
   * API cannot send an Authorization header, so the BFF authenticates the
   * upgrade off this query param (same contract as Track 1).
   */
  private buildWsUrl(pollId: string): string {
    const base =
      environment.wsBaseUrl ||
      `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
    const path = livePollWsPath(pollId);
    const token = this.auth.getToken();
    const query =
      token !== null ? `?access_token=${encodeURIComponent(token)}` : '';
    return `${base}${path}${query}`;
  }
}
