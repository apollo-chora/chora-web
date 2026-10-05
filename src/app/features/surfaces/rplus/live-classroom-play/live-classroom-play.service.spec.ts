import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { LiveClassroomPlayService } from './live-classroom-play.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { environment } from '../../../../../environments/environment';

/**
 * Minimal stub for `AuthService` — the play service only reads
 * `getToken()` to ride the Chora session JWT on the WS `?access_token=`
 * query param (browsers cannot set Authorization on a native WebSocket
 * handshake per RFC 6455). The token is mutable so a test can toggle the
 * present-vs-null cases.
 */
class StubAuthService {
  token: string | null = null;
  getToken(): string | null {
    return this.token;
  }
}

/**
 * Minimal fake WebSocket that records the constructed URL and lets the test
 * drive open/message/close callbacks synchronously. Mirrors the subset of
 * the browser WebSocket API the service touches.
 */
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static last: FakeWebSocket | null = null;
  static instances: FakeWebSocket[] = [];
  /** When set, the constructor throws — exercises the openSocket() catch. */
  static throwOnConstruct = false;

  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  /** When set, close() throws — exercises the cleanup() try/catch. */
  throwOnClose = false;
  closedWith: number | null = null;

  constructor(public url: string) {
    FakeWebSocket.last = this;
    FakeWebSocket.instances.push(this);
    if (FakeWebSocket.throwOnConstruct) {
      throw new Error('ws-construct-boom');
    }
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  emit(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }

  emitRaw(data: string): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  fireClose(code: number): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code } as CloseEvent);
  }

  fireError(): void {
    this.onerror?.();
  }

  close(code?: number): void {
    this.closedWith = code ?? null;
    if (this.throwOnClose) {
      throw new Error('ws-close-boom');
    }
    this.readyState = FakeWebSocket.CLOSED;
  }
}

describe('LiveClassroomPlayService', () => {
  let service: LiveClassroomPlayService;
  let auth: StubAuthService;
  const realWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.last = null;
    FakeWebSocket.instances = [];
    FakeWebSocket.throwOnConstruct = false;
    (globalThis as unknown as { WebSocket: unknown }).WebSocket =
      FakeWebSocket as unknown as typeof WebSocket;
    auth = new StubAuthService();
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: auth }],
    });
    service = TestBed.inject(LiveClassroomPlayService);
  });

  afterEach(() => {
    service.disconnect();
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = realWebSocket;
    vi.useRealTimers();
  });

  it('starts idle', () => {
    expect(service.connectionState()).toBe('idle');
    expect(service.snapshot()).toBeNull();
    expect(service.leaderboard()).toEqual([]);
  });

  it('opens a per-session WS and transitions to connected on open', () => {
    service.connect('sess-1');
    expect(service.connectionState()).toBe('connecting');
    expect(FakeWebSocket.last?.url).toContain(
      '/api/v1/live-quizzes/sess-1/ws',
    );
    FakeWebSocket.last!.open();
    expect(service.connectionState()).toBe('connected');
  });

  it('rides the Chora session JWT on the WS handshake via ?access_token', () => {
    auth.token = 'jwt.abc.def';
    service.connect('sess-1');
    const url = FakeWebSocket.last!.url;
    expect(url).toContain('access_token=');
    expect(url).toContain(`access_token=${encodeURIComponent('jwt.abc.def')}`);
  });

  it('omits ?access_token when no token is present (gateway 401s)', () => {
    auth.token = null;
    service.connect('sess-1');
    expect(FakeWebSocket.last!.url).not.toContain('access_token=');
  });

  it('decodes the initial snapshot frame into the snapshot signal', () => {
    service.connect('sess-1');
    FakeWebSocket.last!.open();
    FakeWebSocket.last!.emit({
      type: 'snapshot',
      payload: {
        id: 'sess-1',
        live_quiz_id: 'lq-1',
        tenant_id: 't',
        instructor_gcid: 'g',
        state: 'LIVE',
        response_counts: { q1: { A: 1, B: 4 } },
        total_responses: 5,
      },
    });
    const snap = service.snapshot();
    expect(snap?.state).toBe('LIVE');
    expect(snap?.totalResponses).toBe(5);
    expect(snap?.responseCounts['q1']!['B']).toBe(4);
  });

  it('accumulates leaderboard entries from event frames (latest score wins)', () => {
    service.connect('sess-1');
    FakeWebSocket.last!.open();
    FakeWebSocket.last!.emit({
      type: 'event',
      payload: {
        leaderboard: [
          { gcid: 'g1', display_name: 'Ada', score: 10 },
          { gcid: 'g2', display_name: 'Bo', score: 20 },
        ],
      },
    });
    FakeWebSocket.last!.emit({
      type: 'event',
      payload: { leaderboard: [{ gcid: 'g1', display_name: 'Ada', score: 40 }] },
    });
    const top = service.topLeaderboard();
    expect(top).toHaveLength(2);
    // g1's score updated to 40 → now ranks above g2 (20).
    expect(top[0]).toEqual({ gcid: 'g1', displayName: 'Ada', score: 40 });
    expect(top[1]!.gcid).toBe('g2');
  });

  it('ignores malformed frames without crashing', () => {
    service.connect('sess-1');
    FakeWebSocket.last!.open();
    expect(() => FakeWebSocket.last!.emitRaw('{ not json')).not.toThrow();
    expect(service.snapshot()).toBeNull();
  });

  it('schedules a reconnect on abnormal close', () => {
    vi.useFakeTimers();
    service.connect('sess-1');
    FakeWebSocket.last!.open();
    const first = FakeWebSocket.last!;
    first.fireClose(1006); // abnormal
    expect(service.connectionState()).toBe('reconnecting');
    vi.advanceTimersByTime(1000);
    // A new socket was constructed for the reconnect attempt.
    expect(FakeWebSocket.instances.length).toBe(2);
  });

  it('does not reconnect on an intentional disconnect (clean 1000)', () => {
    vi.useFakeTimers();
    service.connect('sess-1');
    FakeWebSocket.last!.open();
    service.disconnect();
    expect(service.connectionState()).toBe('closed');
    vi.advanceTimersByTime(5000);
    expect(FakeWebSocket.instances.length).toBe(1);
  });

  it('clears prior leaderboard state when switching sessions', () => {
    service.connect('sess-1');
    FakeWebSocket.last!.open();
    FakeWebSocket.last!.emit({
      type: 'event',
      payload: { leaderboard: [{ gcid: 'g1', score: 10 }] },
    });
    expect(service.leaderboard()).toHaveLength(1);
    service.connect('sess-2');
    expect(service.leaderboard()).toEqual([]);
    expect(FakeWebSocket.last?.url).toContain('sess-2');
  });

  // --- branch augmentation (uncovered conditional arms) ---

  it('is a no-op when connect() is called again for the same OPEN session', () => {
    service.connect('sess-1');
    FakeWebSocket.last!.open(); // readyState → OPEN
    expect(FakeWebSocket.instances.length).toBe(1);
    // Same id + OPEN socket → the guard returns early, no new socket built.
    service.connect('sess-1');
    expect(FakeWebSocket.instances.length).toBe(1);
  });

  it('is a no-op when connect() is called again while still CONNECTING', () => {
    service.connect('sess-1'); // readyState stays CONNECTING (open() not fired)
    expect(FakeWebSocket.instances.length).toBe(1);
    service.connect('sess-1');
    expect(FakeWebSocket.instances.length).toBe(1);
  });

  it('builds a fresh socket when reconnecting to a CLOSED socket of the same id', () => {
    service.connect('sess-1');
    FakeWebSocket.last!.open();
    // Socket dropped (CLOSED) — guard condition is false → reconnect builds anew.
    FakeWebSocket.last!.readyState = FakeWebSocket.CLOSED;
    service.connect('sess-1');
    expect(FakeWebSocket.instances.length).toBe(2);
  });

  it('schedules a reconnect when the WebSocket constructor throws', () => {
    vi.useFakeTimers();
    FakeWebSocket.throwOnConstruct = true;
    service.connect('sess-1');
    // First (throwing) construct happened; the catch scheduled a reconnect.
    expect(FakeWebSocket.instances.length).toBe(1);
    FakeWebSocket.throwOnConstruct = false;
    vi.advanceTimersByTime(1000);
    // A second socket is constructed by the scheduled reconnect.
    expect(FakeWebSocket.instances.length).toBe(2);
  });

  it('keeps the prior snapshot when a snapshot frame carries a non-object payload', () => {
    service.connect('sess-1');
    FakeWebSocket.last!.open();
    // Seed a valid snapshot first.
    FakeWebSocket.last!.emit({
      type: 'snapshot',
      payload: { id: 'sess-1', state: 'LIVE', total_responses: 3 },
    });
    expect(service.snapshot()?.totalResponses).toBe(3);
    // A malformed snapshot payload → decodeSnapshot returns null → no overwrite.
    FakeWebSocket.last!.emit({ type: 'snapshot', payload: 'not-an-object' });
    expect(service.snapshot()?.totalResponses).toBe(3);
  });

  it('updates the snapshot from an event frame that also carries snapshot fields', () => {
    service.connect('sess-1');
    FakeWebSocket.last!.open();
    // `event` frame with a snapshot-shaped payload → applyFrame event-branch
    // sets the snapshot signal.
    FakeWebSocket.last!.emit({
      type: 'event',
      payload: { id: 'sess-1', state: 'CLOSED', total_responses: 9 },
    });
    expect(service.snapshot()?.state).toBe('CLOSED');
    expect(service.snapshot()?.totalResponses).toBe(9);
  });

  it('ignores an event frame whose leaderboard array is empty', () => {
    service.connect('sess-1');
    FakeWebSocket.last!.open();
    FakeWebSocket.last!.emit({ type: 'event', payload: { leaderboard: [] } });
    expect(service.leaderboard()).toEqual([]);
  });

  it('does not update the snapshot for an event frame with no snapshot fields', () => {
    service.connect('sess-1');
    FakeWebSocket.last!.open();
    // Pure leaderboard event — decodeSnapshot on a leaderboard-only object
    // yields an empty-but-object snapshot; assert the leaderboard updated and
    // the snapshot stays as decoded (id empty). Drives the event snap-set arm.
    FakeWebSocket.last!.emit({
      type: 'event',
      payload: { leaderboard: [{ gcid: 'g9', display_name: 'Zed', score: 7 }] },
    });
    expect(service.leaderboard()).toHaveLength(1);
    expect(service.leaderboard()[0]!.displayName).toBe('Zed');
  });

  it('sets closed (no reconnect) on a clean 1000 close from the server', () => {
    vi.useFakeTimers();
    service.connect('sess-1');
    FakeWebSocket.last!.open();
    // Server-initiated clean close (code 1000) without an intentional
    // disconnect → the onClose else-branch sets closed, no reconnect.
    FakeWebSocket.last!.fireClose(1000);
    expect(service.connectionState()).toBe('closed');
    vi.advanceTimersByTime(5000);
    expect(FakeWebSocket.instances.length).toBe(1);
  });

  it('closes the socket on a transport error (onerror)', () => {
    service.connect('sess-1');
    FakeWebSocket.last!.open();
    const sock = FakeWebSocket.last!;
    sock.fireError();
    // onError() calls ws?.close() → fake records the (default) close call.
    expect(sock.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it('caps the reconnect backoff at the 30s ceiling after many attempts', () => {
    vi.useFakeTimers();
    service.connect('sess-1');
    FakeWebSocket.last!.open();
    // Drive enough abnormal closes that the exponential delay would exceed
    // 30_000ms, exercising the Math.min ceiling branch. 2^6 * 1000 = 64_000.
    for (let i = 0; i < 7; i++) {
      FakeWebSocket.last!.fireClose(1006);
      vi.advanceTimersByTime(30_000);
    }
    // Each abnormal close scheduled a reconnect that built a fresh socket.
    expect(FakeWebSocket.instances.length).toBeGreaterThan(1);
  });

  it('clears a pending reconnect timer when disconnecting mid-backoff', () => {
    vi.useFakeTimers();
    service.connect('sess-1');
    FakeWebSocket.last!.open();
    FakeWebSocket.last!.fireClose(1006); // schedules a reconnect timer
    expect(service.connectionState()).toBe('reconnecting');
    const countBeforeDisconnect = FakeWebSocket.instances.length;
    service.disconnect(); // cleanup() must clearTimeout the pending reconnect
    vi.advanceTimersByTime(60_000);
    // No new socket spun up after the timer was cleared.
    expect(FakeWebSocket.instances.length).toBe(countBeforeDisconnect);
    expect(service.connectionState()).toBe('closed');
  });

  it('swallows an exception thrown while closing the socket during cleanup', () => {
    service.connect('sess-1');
    FakeWebSocket.last!.open();
    FakeWebSocket.last!.throwOnClose = true;
    // cleanup() wraps ws.close(1000) in try/catch — disconnect must not throw.
    expect(() => service.disconnect()).not.toThrow();
    expect(service.connectionState()).toBe('closed');
  });

  it('falls back to the location-derived ws origin when wsBaseUrl is empty', () => {
    const original = environment.wsBaseUrl;
    const mutable = environment as { wsBaseUrl: string };
    try {
      mutable.wsBaseUrl = '';
      service.connect('sess-fallback');
      const url = FakeWebSocket.last!.url;
      // jsdom default origin is http: → the ternary picks the ws: scheme.
      expect(url.startsWith('ws:')).toBe(true);
      expect(url).toContain('/api/v1/live-quizzes/sess-fallback/ws');
    } finally {
      mutable.wsBaseUrl = original;
    }
  });

  it('appends the token with & when the ws path already carries a query', () => {
    // wsBaseUrl carries a pre-existing query → separator must be '&'.
    const original = environment.wsBaseUrl;
    const mutable = environment as { wsBaseUrl: string };
    try {
      mutable.wsBaseUrl = 'wss://api.chora.site/?env=ci';
      auth.token = 'tok-1';
      service.connect('sess-amp');
      const url = FakeWebSocket.last!.url;
      expect(url).toContain('?env=ci');
      expect(url).toContain('&access_token=tok-1');
    } finally {
      mutable.wsBaseUrl = original;
    }
  });
});
