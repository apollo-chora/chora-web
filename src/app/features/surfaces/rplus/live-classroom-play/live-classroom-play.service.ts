/**
 * LiveClassroomPlayService — R+ Live Classroom expansion (ADR-168 Task #9).
 *
 * Manages a per-session WebSocket to the chora-gateway BFF which proxies the
 * WS upgrade to chora-delivery's live_quiz_ws_handler.go:
 *
 *   GET /api/v1/live-quizzes/{sessionId}/ws
 *
 * The protocol is server-push only — the FE never sends quiz mutations on
 * this socket (learner submissions are REST). The first frame is a
 * `snapshot`; subsequent `event` frames replay updated distributions +
 * (when the BE carries them) leaderboard entries.
 *
 * State is exposed as signals (per chora-web/CLAUDE.md §3 — signals are the
 * primary state primitive). The component binds them with OnPush.
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
import { environment } from '../../../../../environments/environment';
import { AuthService } from '../../../../core/auth/auth.service';
import {
  decodeLeaderboard,
  decodeSnapshot,
  isSnapshotFrame,
  liveQuizWsPath,
  topNLeaderboard,
  type LivePlayFrame,
  type LivePlayLeaderboardEntry,
  type LivePlaySnapshot,
} from './live-classroom-play.model';

export type LivePlayConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'closed';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class LiveClassroomPlayService implements OnDestroy {
  private readonly ngZone = inject(NgZone);
  private readonly auth = inject(AuthService);

  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private intentionalClose = false;
  private sessionId = '';

  /** Accumulated per-GCID leaderboard, keyed by gcid (latest score wins). */
  private leaderboardMap = new Map<string, LivePlayLeaderboardEntry>();

  private readonly _connectionState = signal<LivePlayConnectionState>('idle');
  readonly connectionState = this._connectionState.asReadonly();

  private readonly _snapshot = signal<LivePlaySnapshot | null>(null);
  readonly snapshot = this._snapshot.asReadonly();

  private readonly _leaderboard = signal<readonly LivePlayLeaderboardEntry[]>(
    [],
  );
  readonly leaderboard = this._leaderboard.asReadonly();

  /** Top-10 view of the accumulated leaderboard (score-desc). */
  readonly topLeaderboard = computed(() =>
    topNLeaderboard(this._leaderboard(), 10),
  );

  /** Open the WS for a session. No-op if already open for the same id. */
  connect(sessionId: string): void {
    if (
      this.ws &&
      this.sessionId === sessionId &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    // Switching session — tear down any prior socket cleanly first.
    if (this.ws) this.cleanup();
    this.sessionId = sessionId;
    this.intentionalClose = false;
    this.leaderboardMap.clear();
    this._leaderboard.set([]);
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

  private openSocket(): void {
    this._connectionState.set(
      this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting',
    );
    const url = this.buildWsUrl(this.sessionId);
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
    let frame: LivePlayFrame;
    try {
      frame = JSON.parse(event.data as string) as LivePlayFrame;
    } catch {
      return; // ignore malformed frames (fail-soft)
    }
    this.ngZone.run(() => this.applyFrame(frame));
  }

  private applyFrame(frame: LivePlayFrame): void {
    if (isSnapshotFrame(frame)) {
      const snap = decodeSnapshot(frame.payload);
      if (snap) this._snapshot.set(snap);
      return;
    }
    // `event` frame: may carry an updated snapshot AND/OR leaderboard.
    const snap = decodeSnapshot(frame.payload);
    if (snap) this._snapshot.set(snap);
    const entries = decodeLeaderboard(frame.payload);
    if (entries.length > 0) {
      for (const e of entries) this.leaderboardMap.set(e.gcid, e);
      this._leaderboard.set([...this.leaderboardMap.values()]);
    }
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

  private buildWsUrl(sessionId: string): string {
    const base =
      environment.wsBaseUrl ||
      `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
    const url = `${base}${liveQuizWsPath(sessionId)}`;
    // Browsers cannot set Authorization on a native WebSocket handshake
    // (RFC 6455), so the Chora session JWT rides in the `?access_token=`
    // query param — the chora-gateway gate reads it for WS upgrades
    // (contract shipped in CHO-1616). When no token is present we leave the
    // param off and let the gateway 401 the upgrade rather than crash.
    const token = this.auth.getToken();
    if (!token) {
      return url;
    }
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}access_token=${encodeURIComponent(token)}`;
  }
}
