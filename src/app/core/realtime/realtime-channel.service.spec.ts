import { expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { RealtimeChannelService } from './realtime-channel.service';
import type {
  RealtimeEnvelope,
  RealtimeFamiliarLeveledUp,
  RealtimeManaChanged,
  RealtimeNotificationCreated,
} from './realtime-channel.model';

interface FakeES {
  url: string;
  withCredentials: boolean;
  closed: boolean;
  listeners: Record<string, (m: { data: string }) => void>;
  onopen: (() => void) | null;
  onmessage: ((m: { data: string }) => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

const ticketReq = (http: HttpTestingController) =>
  http.expectOne((r) => r.url.includes('/api/v1/realtime/ticket'));

describe('RealtimeChannelService', () => {
  let svc: RealtimeChannelService;
  let http: HttpTestingController;
  let instances: FakeES[];
  let original: unknown;

  beforeEach(() => {
    instances = [];
    original = (globalThis as Record<string, unknown>)['EventSource'];
    class FakeEventSource {
      url: string;
      withCredentials: boolean;
      closed = false;
      listeners: Record<string, (m: { data: string }) => void> = {};
      onopen: (() => void) | null = null;
      onmessage: ((m: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(url: string, init?: { withCredentials?: boolean }) {
        this.url = url;
        this.withCredentials = init?.withCredentials ?? false;
        instances.push(this as unknown as FakeES);
      }
      addEventListener(t: string, h: (m: { data: string }) => void): void {
        this.listeners[t] = h;
      }
      close(): void {
        this.closed = true;
      }
    }
    (globalThis as Record<string, unknown>)['EventSource'] =
      FakeEventSource as unknown;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(RealtimeChannelService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>)['EventSource'] = original;
    http.verify();
  });

  // ── demux via the emit() seam (no live stream needed) ──────────────────
  it('routes mana.balance.changed to manaBalanceChanged$ and stream$', () => {
    const mana: RealtimeManaChanged[] = [];
    const all: RealtimeEnvelope[] = [];
    const s1 = svc.manaBalanceChanged$.subscribe((m) => mana.push(m));
    const s2 = svc.stream$.subscribe((e) => all.push(e));
    svc.emit({
      topic: 'mana.balance.changed',
      occurred_at: 't',
      payload: { reason: 'debit', ledger_seq: 7 },
    });
    expect(mana).toEqual([{ reason: 'debit', ledger_seq: 7 }]);
    expect(all).toHaveLength(1);
    s1.unsubscribe();
    s2.unsubscribe();
  });

  it('routes familiar.leveled_up + notification.created to their typed streams', () => {
    const fam: RealtimeFamiliarLeveledUp[] = [];
    const notif: RealtimeNotificationCreated[] = [];
    const s1 = svc.familiarLeveledUp$.subscribe((f) => fam.push(f));
    const s2 = svc.notificationCreated$.subscribe((n) => notif.push(n));
    svc.emit({
      topic: 'familiar.leveled_up',
      occurred_at: 't',
      payload: { familiar_id: 'f1', to_stage: 3 },
    });
    svc.emit({
      topic: 'notification.created',
      occurred_at: 't',
      payload: { notification_id: 'n1', kind: 'assessment' },
    });
    expect(fam).toEqual([{ familiar_id: 'f1', to_stage: 3 }]);
    expect(notif).toEqual([{ notification_id: 'n1', kind: 'assessment' }]);
    s1.unsubscribe();
    s2.unsubscribe();
  });

  it('an unknown/untyped topic rides stream$ only, no typed emission, no throw', () => {
    const all: RealtimeEnvelope[] = [];
    const mana: unknown[] = [];
    const s1 = svc.stream$.subscribe((e) => all.push(e));
    const s2 = svc.manaBalanceChanged$.subscribe((m) => mana.push(m));
    expect(() =>
      svc.emit({
        topic: 'familiar.retired',
        occurred_at: 't',
        payload: { familiar_id: 'f9' },
      }),
    ).not.toThrow();
    expect(all).toHaveLength(1);
    expect(mana).toEqual([]);
    s1.unsubscribe();
    s2.unsubscribe();
  });

  // ── connect / SSE wiring (FakeEventSource + ticket fetch) ──────────────
  it('connect() mints a ticket then opens ONE EventSource with ?ticket= + credentials', () => {
    svc.connect();
    ticketReq(http).flush({ ticket: 'tkt-1', expires_at: '2026-06-06T00:00:00Z' });
    expect(instances).toHaveLength(1);
    expect(instances[0].withCredentials).toBe(true);
    expect(instances[0].url).toContain('/api/v1/realtime/stream?ticket=tkt-1');
  });

  it('onopen flips to connected; a named-event message routes to the topic stream', () => {
    svc.connect();
    ticketReq(http).flush({ ticket: 'tkt-1', expires_at: 'x' });
    instances[0].onopen!();
    expect(svc.connectionState()).toBe('connected');
    expect(svc.connected()).toBe(true);

    const mana: RealtimeManaChanged[] = [];
    const sub = svc.manaBalanceChanged$.subscribe((m) => mana.push(m));
    instances[0].listeners['mana.balance.changed']!({
      data: JSON.stringify({
        topic: 'mana.balance.changed',
        occurred_at: 't',
        payload: { reason: 'credit', ledger_seq: 2 },
      }),
    });
    expect(mana).toEqual([{ reason: 'credit', ledger_seq: 2 }]);
    sub.unsubscribe();
  });

  it('swallows a malformed SSE payload without throwing or emitting', () => {
    svc.connect();
    ticketReq(http).flush({ ticket: 'tkt-1', expires_at: 'x' });
    instances[0].onopen!();
    const all: RealtimeEnvelope[] = [];
    const sub = svc.stream$.subscribe((e) => all.push(e));
    expect(() => instances[0].onmessage!({ data: 'not json {' })).not.toThrow();
    expect(all).toEqual([]);
    sub.unsubscribe();
  });

  it('reconnects with a FRESH ticket and ticks reconnected$ (not on the first open)', () => {
    vi.useFakeTimers();
    const ticks: number[] = [];
    const sub = svc.reconnected$.subscribe(() => ticks.push(1));
    try {
      svc.connect();
      ticketReq(http).flush({ ticket: 'tkt-1', expires_at: 'x' });
      instances[0].onopen!();
      expect(ticks).toHaveLength(0); // first open does NOT tick

      instances[0].onerror!();
      expect(svc.connectionState()).toBe('reconnecting');
      expect(instances[0].closed).toBe(true);

      vi.advanceTimersByTime(1000); // backoff fires → fresh ticket fetch
      ticketReq(http).flush({ ticket: 'tkt-2', expires_at: 'x' });
      expect(instances).toHaveLength(2);
      expect(instances[1].url).toContain('ticket=tkt-2');

      instances[1].onopen!();
      expect(ticks).toHaveLength(1); // reopen ticks → consumers reconcile
      expect(svc.connectionState()).toBe('connected');
    } finally {
      sub.unsubscribe();
      vi.useRealTimers();
    }
  });

  it('connect() is a no-op when EventSource is unavailable (jsdom/SSR)', () => {
    (globalThis as Record<string, unknown>)['EventSource'] = undefined;
    svc.connect();
    http.expectNone((r) => r.url.includes('/api/v1/realtime/ticket'));
    expect(svc.connectionState()).toBe('disconnected');
  });

  it('disconnect closes the live stream and sets disconnected', () => {
    svc.connect();
    ticketReq(http).flush({ ticket: 'tkt-1', expires_at: 'x' });
    instances[0].onopen!();
    svc.disconnect();
    expect(instances[0].closed).toBe(true);
    expect(svc.connectionState()).toBe('disconnected');
  });
});
