import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { TransactionRealtimeService } from './transaction-realtime.service';
import { type TransactionEvent } from './transaction-history.model';

/** Controllable EventSource stand-in (jsdom ships none). */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly url: string;
  readonly withCredentials: boolean;
  private named: Record<string, (e: MessageEvent<string>) => void> = {};
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = !!init?.withCredentials;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent<string>) => void): void {
    this.named[type] = fn;
  }
  close(): void {
    this.closed = true;
  }
  fireNamed(data: string): void {
    this.named['transaction_upsert']?.({ data } as MessageEvent<string>);
  }
  fireDefault(data: string): void {
    this.onmessage?.({ data } as MessageEvent<string>);
  }
}

const sampleEvent: TransactionEvent = {
  item: {
    ledger_id: 'led_1',
    occurred_at: '2026-06-29T00:00:00Z',
    tenant_id: 't1',
    kind: 'purchase',
    source_domain: 'payments',
    source_ref_id: 'pur_1',
    label: 'X',
    amount: { currency: 'sgd', amount_minor: 100, mana_units: 0 },
    status: 'captured',
    has_detail: false,
  },
  change_type: 'upsert',
};

describe('TransactionRealtimeService', () => {
  let service: TransactionRealtimeService;
  const originalES = (globalThis as { EventSource?: unknown }).EventSource;

  beforeEach(() => {
    FakeEventSource.instances = [];
    (globalThis as { EventSource?: unknown }).EventSource =
      FakeEventSource as unknown;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    service = TestBed.inject(TransactionRealtimeService);
  });

  afterEach(() => {
    (globalThis as { EventSource?: unknown }).EventSource = originalES;
  });

  it('opens a single credentialed SSE connection on first subscribe', () => {
    service.stream$.subscribe();
    service.stream$.subscribe();
    expect(FakeEventSource.instances.length).toBe(1);
    expect(FakeEventSource.instances[0].withCredentials).toBe(true);
    expect(FakeEventSource.instances[0].url).toContain(
      '/api/v1/admin/transactions/stream',
    );
  });

  it('delivers a named transaction_upsert event to subscribers', () => {
    const seen: TransactionEvent[] = [];
    service.stream$.subscribe((e) => seen.push(e));
    FakeEventSource.instances[0].fireNamed(JSON.stringify(sampleEvent));
    expect(seen).toHaveLength(1);
    expect(seen[0].item.ledger_id).toBe('led_1');
  });

  it('delivers a default-channel message too', () => {
    const seen: TransactionEvent[] = [];
    service.stream$.subscribe((e) => seen.push(e));
    FakeEventSource.instances[0].fireDefault(JSON.stringify(sampleEvent));
    expect(seen).toHaveLength(1);
  });

  it('ignores malformed payloads without throwing', () => {
    const seen: TransactionEvent[] = [];
    service.stream$.subscribe((e) => seen.push(e));
    expect(() =>
      FakeEventSource.instances[0].fireDefault('{not json'),
    ).not.toThrow();
    expect(seen).toHaveLength(0);
  });

  it('emit() pushes synthetic events to subscribers', () => {
    const seen: TransactionEvent[] = [];
    service.stream$.subscribe((e) => seen.push(e));
    service.emit(sampleEvent);
    expect(seen).toHaveLength(1);
  });

  it('disconnect() closes the socket; a fresh subscription reconnects', () => {
    const sub = service.stream$.subscribe();
    const first = FakeEventSource.instances[0];
    service.disconnect();
    expect(first.closed).toBe(true);
    // share() keeps the source hot while a subscriber remains — drop it so
    // the next subscribe re-runs ensureConnected and opens a new socket.
    sub.unsubscribe();
    service.stream$.subscribe();
    expect(FakeEventSource.instances.length).toBe(2);
  });

  it('degrades silently when EventSource is unavailable', () => {
    (globalThis as { EventSource?: unknown }).EventSource = undefined;
    const seen: TransactionEvent[] = [];
    expect(() => service.stream$.subscribe((e) => seen.push(e))).not.toThrow();
    service.emit(sampleEvent); // emit still works without a connection
    expect(seen).toHaveLength(1);
  });
});
