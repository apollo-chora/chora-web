/**
 * TransactionRealtimeService — server-pushed live tail of newly-projected
 * transaction-ledger rows via EventSource (SSE). The shared
 * transaction-history component subscribes at TENANT / MASTER scope to update
 * visible rows in place (ADR-205 / CHO-1935 op `streamAdminTransactionEvents`).
 *
 * Endpoint: `GET /api/v1/admin/transactions/stream` (chora-gateway BFF) per
 * `chora-contracts/openapi/transaction-history.yaml`. Each `data:` line is a
 * JSON-encoded `TransactionEvent`. Same realtime pattern as the retired
 * payments-admin SSE service (removed at the ADR-205/CHO-1947 cutover):
 * idempotent connection, share() multicast, silent error recovery so a
 * subscriber falls back on its initial HTTP page-load.
 *
 * Live data requires the BFF SSE proxy (Wave B / B4); until then the stream
 * is silent. The `emit()` seam lets specs + the dev console push synthetic
 * events for rehearsal.
 */
import { Injectable } from '@angular/core';
import { Observable, Subject, share } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { type TransactionEvent } from './transaction-history.model';

@Injectable({ providedIn: 'root' })
export class TransactionRealtimeService {
  private readonly subject = new Subject<TransactionEvent>();
  private eventSource: EventSource | null = null;
  private connected = false;

  /** Subscribe to the realtime stream. Idempotent: one SSE connection per
   *  service instance regardless of subscriber count. */
  readonly stream$: Observable<TransactionEvent> =
    new Observable<TransactionEvent>((subscriber) => {
      this.ensureConnected();
      const sub = this.subject.subscribe(subscriber);
      return () => sub.unsubscribe();
    }).pipe(share());

  private ensureConnected(): void {
    if (this.connected || typeof EventSource === 'undefined') return;
    this.connected = true;
    try {
      this.eventSource = new EventSource(
        `${environment.bffBaseUrl}/api/v1/admin/transactions/stream`,
        { withCredentials: true },
      );
      // The BFF emits `event: transaction_upsert` per the openapi description
      // block; subscribe to the named event AND the unnamed default channel
      // so the FE works against both wirings.
      const handler = (msg: MessageEvent<string>): void => {
        try {
          const event = JSON.parse(msg.data) as TransactionEvent;
          this.subject.next(event);
        } catch {
          // Ignore malformed payloads — backend should never emit them.
        }
      };
      this.eventSource.addEventListener('transaction_upsert', handler);
      this.eventSource.onmessage = handler;
      this.eventSource.onerror = () => {
        // EventSource auto-reconnects; nothing for us to do.
      };
    } catch {
      // No EventSource (SSR / very old browsers / publisher missing) — the
      // service silently downgrades to no-events.
      this.connected = false;
    }
  }

  /** Test / dev seam — inject a synthetic event into the stream. */
  emit(event: TransactionEvent): void {
    this.subject.next(event);
  }

  /** Tear down the SSE connection (call from OnDestroy). */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connected = false;
  }
}
