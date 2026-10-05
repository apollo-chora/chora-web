import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { LivePollPlayService } from './live-poll-play.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { environment } from '../../../../../environments/environment';

/**
 * Minimal fake WebSocket that records the constructed URL and lets the test
 * drive open/message/close callbacks synchronously. Mirrors the subset of the
 * browser WebSocket API the service touches.
 */
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static last: FakeWebSocket | null = null;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.last = this;
    FakeWebSocket.instances.push(this);
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

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }
}

/** Stub AuthService exposing only the token the WS URL builder reads. */
class FakeAuthService {
  token: string | null = 'jwt-abc';
  getToken(): string | null {
    return this.token;
  }
}

describe('LivePollPlayService', () => {
  let service: LivePollPlayService;
  let httpMock: HttpTestingController;
  let auth: FakeAuthService;
  const realWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.last = null;
    FakeWebSocket.instances = [];
    (globalThis as unknown as { WebSocket: unknown }).WebSocket =
      FakeWebSocket as unknown as typeof WebSocket;
    auth = new FakeAuthService();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    service = TestBed.inject(LivePollPlayService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.disconnect();
    httpMock.verify();
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = realWebSocket;
    vi.useRealTimers();
  });

  it('starts idle', () => {
    expect(service.connectionState()).toBe('idle');
    expect(service.snapshot()).toBeNull();
    expect(service.hasVoted()).toBe(false);
    expect(service.tallyRows()).toEqual([]);
  });

  it('opens a per-poll WS and transitions to connected on open', () => {
    service.connect('poll-1');
    expect(service.connectionState()).toBe('connecting');
    expect(FakeWebSocket.last?.url).toContain('/api/v1/live-polls/poll-1/ws');
    FakeWebSocket.last!.open();
    expect(service.connectionState()).toBe('connected');
  });

  it('appends the auth token as an url-encoded access_token query param', () => {
    auth.token = 'tok en/+';
    service.connect('poll-1');
    expect(FakeWebSocket.last?.url).toContain(
      `access_token=${encodeURIComponent('tok en/+')}`,
    );
  });

  it('omits access_token when the learner has no token', () => {
    auth.token = null;
    service.connect('poll-1');
    expect(FakeWebSocket.last?.url).not.toContain('access_token=');
  });

  it('decodes the initial snapshot frame into the snapshot signal', () => {
    service.connect('poll-1');
    FakeWebSocket.last!.open();
    FakeWebSocket.last!.emit({
      type: 'snapshot',
      payload: {
        id: 'poll-1',
        tenant_id: 't',
        instructor_gcid: 'g',
        question: 'Best language?',
        state: 'OPEN',
        options: [
          { label: 'Go', vote_count: 4 },
          { label: 'Python', vote_count: 1 },
        ],
        total_votes: 5,
      },
    });
    const snap = service.snapshot();
    expect(snap?.state).toBe('OPEN');
    expect(snap?.totalVotes).toBe(5);
    expect(snap?.options[0]).toEqual({ label: 'Go', voteCount: 4 });
    expect(service.votingOpen()).toBe(true);
    expect(service.tallyRows()[0]).toEqual({
      label: 'Go',
      voteCount: 4,
      percent: 80,
    });
  });

  it('updates the tally from a vote_recorded event frame', () => {
    service.connect('poll-1');
    FakeWebSocket.last!.open();
    FakeWebSocket.last!.emit({
      type: 'event',
      payload: {
        id: 'poll-1',
        state: 'OPEN',
        question: 'Q?',
        options: [
          { label: 'Go', vote_count: 5 },
          { label: 'Python', vote_count: 5 },
        ],
        total_votes: 10,
      },
    });
    const rows = service.tallyRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.percent).toBe(50);
    expect(service.snapshot()?.totalVotes).toBe(10);
  });

  it('posts a vote to the BFF votes endpoint with option_label and flips hasVoted', () => {
    service.connect('poll-1');
    FakeWebSocket.last!.open();
    service.castVote('Go').subscribe();
    expect(service.hasVoted()).toBe(true);
    const req = httpMock.expectOne(
      (r) =>
        r.url.includes('/api/v1/live-polls/poll-1/votes') &&
        r.method === 'POST',
    );
    expect(req.request.body).toEqual({ option_label: 'Go' });
    req.flush({});
  });

  it('ignores malformed frames without crashing', () => {
    service.connect('poll-1');
    FakeWebSocket.last!.open();
    expect(() => FakeWebSocket.last!.emitRaw('{ not json')).not.toThrow();
    expect(service.snapshot()).toBeNull();
  });

  it('schedules a reconnect on abnormal close', () => {
    vi.useFakeTimers();
    service.connect('poll-1');
    FakeWebSocket.last!.open();
    FakeWebSocket.last!.fireClose(1006); // abnormal
    expect(service.connectionState()).toBe('reconnecting');
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances.length).toBe(2);
  });

  it('does not reconnect on an intentional disconnect (clean 1000)', () => {
    vi.useFakeTimers();
    service.connect('poll-1');
    FakeWebSocket.last!.open();
    service.disconnect();
    expect(service.connectionState()).toBe('closed');
    vi.advanceTimersByTime(5000);
    expect(FakeWebSocket.instances.length).toBe(1);
  });

  it('resets snapshot + hasVoted when switching polls', () => {
    service.connect('poll-1');
    FakeWebSocket.last!.open();
    FakeWebSocket.last!.emit({
      type: 'snapshot',
      payload: { id: 'poll-1', state: 'OPEN', options: [], total_votes: 0 },
    });
    service.castVote('X').subscribe();
    httpMock
      .expectOne((r) => r.url.includes('/votes') && r.method === 'POST')
      .flush({});
    expect(service.snapshot()).not.toBeNull();
    expect(service.hasVoted()).toBe(true);

    service.connect('poll-2');
    expect(service.snapshot()).toBeNull();
    expect(service.hasVoted()).toBe(false);
    expect(FakeWebSocket.last?.url).toContain('poll-2');
  });

  // --- AUGMENTED branch-coverage tests below ---

  it('is a no-op when reconnecting to the same poll while OPEN', () => {
    service.connect('poll-1');
    FakeWebSocket.last!.open(); // readyState -> OPEN
    expect(FakeWebSocket.instances.length).toBe(1);
    // Re-connecting the same id while OPEN hits the early-return guard.
    service.connect('poll-1');
    expect(FakeWebSocket.instances.length).toBe(1);
  });

  it('is a no-op when reconnecting to the same poll while still CONNECTING', () => {
    service.connect('poll-1');
    // No open() called — readyState stays CONNECTING.
    expect(FakeWebSocket.last!.readyState).toBe(FakeWebSocket.CONNECTING);
    service.connect('poll-1');
    expect(FakeWebSocket.instances.length).toBe(1);
  });

  it('reopens when re-connecting the same poll after the socket has CLOSED', () => {
    service.connect('poll-1');
    FakeWebSocket.last!.open();
    // Force the socket into a non-OPEN/non-CONNECTING state so the guard fails.
    FakeWebSocket.last!.readyState = FakeWebSocket.CLOSED;
    service.connect('poll-1');
    expect(FakeWebSocket.instances.length).toBe(2);
  });

  it('schedules a reconnect when the WebSocket constructor throws', () => {
    vi.useFakeTimers();
    const ThrowingWS = function () {
      throw new Error('boom');
    } as unknown as typeof WebSocket;
    (ThrowingWS as unknown as { CONNECTING: number }).CONNECTING =
      FakeWebSocket.CONNECTING;
    (ThrowingWS as unknown as { OPEN: number }).OPEN = FakeWebSocket.OPEN;
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = ThrowingWS;
    service.connect('poll-1');
    // Constructor threw -> caught -> scheduleReconnect armed (still 'connecting').
    expect(service.connectionState()).toBe('connecting');
    // Swap back to the working fake so the reconnect attempt builds a socket.
    (globalThis as unknown as { WebSocket: unknown }).WebSocket =
      FakeWebSocket as unknown as typeof WebSocket;
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances.length).toBe(1);
  });

  it('falls back to a location-derived ws base url when wsBaseUrl is empty', () => {
    const original = environment.wsBaseUrl;
    try {
      (environment as { wsBaseUrl: string }).wsBaseUrl = '';
      service.connect('poll-1');
      // jsdom location is http:// so the fallback chooses the ws: scheme.
      expect(FakeWebSocket.last?.url.startsWith('ws:')).toBe(true);
      expect(FakeWebSocket.last?.url).toContain('/api/v1/live-polls/poll-1/ws');
    } finally {
      (environment as { wsBaseUrl: string }).wsBaseUrl = original;
    }
  });

  it('closes without reconnecting on a clean close (code 1000) that is not intentional', () => {
    vi.useFakeTimers();
    service.connect('poll-1');
    FakeWebSocket.last!.open();
    // Server-initiated clean close — code === 1000 takes the else branch.
    FakeWebSocket.last!.fireClose(1000);
    expect(service.connectionState()).toBe('closed');
    vi.advanceTimersByTime(5000);
    expect(FakeWebSocket.instances.length).toBe(1);
  });

  it('does not reconnect on close after an intentional disconnect', () => {
    vi.useFakeTimers();
    service.connect('poll-1');
    const ws = FakeWebSocket.last!;
    ws.open();
    service.disconnect(); // sets intentionalClose + tears the socket down
    // Fire a (now-detached) abnormal close directly into the handler path.
    // After disconnect() the handler is unwired, so re-attach to exercise the
    // intentional-close short-circuit in scheduleReconnect explicitly.
    service.connect('poll-1');
    FakeWebSocket.last!.open();
    service.disconnect();
    FakeWebSocket.last!.fireClose(1006);
    expect(service.connectionState()).toBe('closed');
    vi.advanceTimersByTime(5000);
    // Two connects -> two sockets; no reconnection beyond them.
    expect(FakeWebSocket.instances.length).toBe(2);
  });

  it('closes the socket on a transport error', () => {
    service.connect('poll-1');
    const ws = FakeWebSocket.last!;
    ws.open();
    const closeSpy = vi.spyOn(ws, 'close');
    ws.onerror?.();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('keeps the prior snapshot when a frame payload is not a decodable object', () => {
    service.connect('poll-1');
    FakeWebSocket.last!.open();
    FakeWebSocket.last!.emit({
      type: 'snapshot',
      payload: { id: 'poll-1', state: 'OPEN', options: [], total_votes: 0 },
    });
    expect(service.snapshot()).not.toBeNull();
    // A frame whose payload is a primitive decodes to null -> snapshot unchanged.
    FakeWebSocket.last!.emit({ type: 'event', payload: 42 });
    expect(service.snapshot()?.id).toBe('poll-1');
  });

  it('caps the reconnect backoff at the maximum delay over repeated abnormal closes', () => {
    vi.useFakeTimers();
    service.connect('poll-1');
    // Drive several abnormal closes; each reconnect grows the backoff until it
    // is clamped to RECONNECT_MAX_MS (30s). Advancing 30s each cycle fires it.
    for (let i = 0; i < 6; i++) {
      FakeWebSocket.last!.open();
      FakeWebSocket.last!.fireClose(1006);
      expect(service.connectionState()).toBe('reconnecting');
      vi.advanceTimersByTime(30_000);
    }
    // 1 initial + 6 reconnect sockets.
    expect(FakeWebSocket.instances.length).toBe(7);
  });
});
