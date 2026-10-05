/**
 * Typed envelopes for the learner-scoped realtime SSE channel served by
 * chora-realtime (ADR-183). Mirrors `chora-contracts/openapi/realtime.yaml`.
 *
 * One EventSource multiplexes every learner-facing live signal; each frame is
 * a {@link RealtimeEnvelope} whose `topic` selects the payload shape below.
 */

/** Connection lifecycle, surfaced for UI indicators + poll-fallback gating. */
export type RealtimeConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

/** Topics carried on the channel (v1). The SSE `event:` name == `topic`. */
export type RealtimeTopic =
  | 'mana.balance.changed'
  | 'familiar.leveled_up'
  | 'familiar.bonded'
  | 'familiar.retired'
  | 'familiar.skin_equipped'
  | 'notification.created'
  | 'notification.read'
  | 'payment.state.changed';

/** The FE-facing SSE frame. `payload` shape is topic-specific (see below). */
export interface RealtimeEnvelope<T = unknown> {
  readonly topic: string;
  readonly occurred_at: string;
  readonly payload: T;
}

/** GET /api/v1/realtime/ticket response. */
export interface RealtimeTicket {
  readonly ticket: string;
  readonly expires_at: string;
}

/**
 * `mana.balance.changed` — SIGNAL ONLY. Carries no balance (delivery is
 * at-most-once / unordered); the consumer re-fetches GET /api/v1/me/mana.
 * `ledger_seq` lets a consumer ignore a stale signal that lands after a
 * newer reconcile.
 */
export interface RealtimeManaChanged {
  readonly reason: 'credit' | 'debit' | 'refund';
  readonly ledger_seq: number;
}

export interface RealtimeFamiliarLeveledUp {
  readonly familiar_id: string;
  readonly from_stage?: number;
  readonly to_stage: number;
}

export interface RealtimeNotificationCreated {
  readonly notification_id: string;
  readonly kind?: string;
  readonly title?: string;
}

export interface RealtimePaymentStateChanged {
  readonly purchase_id: string;
  readonly aggregate_type: string;
  readonly state: 'captured' | 'refunded' | 'failed' | 'expired';
}
