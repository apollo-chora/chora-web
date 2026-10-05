/**
 * Contract mirrors for the Contextual Transaction History read surface
 * (ADR-205 / CHO-1943). Field shapes mirror
 * `chora-contracts/openapi/transaction-history.yaml` (and the backing gRPC
 * `proto/services/tenancy/v1/transaction_history.proto`) — snake_case to
 * match the JSON wire.
 *
 * One shared model serves all three scopes (learner / tenant / master); the
 * shared `transaction-history` component is mounted per-surface with the
 * appropriate scope (A+ learner, H+ tenant/master).
 */

/** ADR-205 D1 explicit scope. Set per surface, never inferred from roles. */
export type TransactionScope = 'learner' | 'tenant' | 'master';

/** Unified row kind. */
export type TransactionKind = 'purchase' | 'mana_topup' | 'mana_spend_daily';

/** Normalised surface status across fiat purchases + mana movements. */
export type TransactionStatus =
  | 'captured'
  | 'refunded'
  | 'failed'
  | 'expired'
  | 'posted';

/** Keyset-compatible sort spec. */
export type TransactionSort =
  | 'occurred_at:desc'
  | 'occurred_at:asc'
  | 'amount:desc'
  | 'amount:asc';

/**
 * A row carries EITHER a fiat amount (currency + amount_minor) OR a mana
 * amount (mana_units), never both — the unused leg is zero/empty.
 */
export interface TransactionAmount {
  readonly currency?: string | null;
  readonly amount_minor: number;
  readonly mana_units: number;
}

/** One unified timeline row (the `transaction_ledger` projection shape). */
export interface TransactionLedgerItem {
  readonly ledger_id: string;
  readonly occurred_at: string;
  readonly tenant_id: string;
  readonly learner_gcid?: string | null;
  readonly kind: TransactionKind;
  readonly source_domain: string;
  readonly source_ref_id: string;
  readonly label: string;
  readonly amount: TransactionAmount;
  readonly status: TransactionStatus;
  readonly has_detail: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** One per-call mana-spend row under a mana_spend_daily parent. */
export interface TransactionDetailItem {
  readonly detail_id: string;
  readonly ledger_id: string;
  readonly tenant_id: string;
  readonly learner_gcid?: string | null;
  readonly occurred_at: string;
  readonly action_code: string;
  readonly mana_units: number;
  readonly model?: string | null;
  readonly trace_id?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ListTransactionsResponse {
  readonly items: readonly TransactionLedgerItem[];
  readonly next_page_token?: string | null;
  readonly has_more: boolean;
}

export interface TransactionDetailResponse {
  readonly parent: TransactionLedgerItem;
  readonly details: readonly TransactionDetailItem[];
  readonly next_page_token?: string | null;
  readonly has_more: boolean;
}

/** Server-computed KPIs over the filtered window (summary-first panel). */
export interface TransactionSummary {
  readonly total_count: number;
  readonly amount_minor_by_currency: Readonly<Record<string, number>>;
  readonly total_mana_topped_up: number;
  readonly total_mana_spent: number;
  readonly count_by_kind: Readonly<Record<string, number>>;
  readonly count_by_status: Readonly<Record<string, number>>;
  readonly window_from: string;
  readonly window_to: string;
}

/** Async export job handle (returned on 202 for large sets — see C4). */
export interface ExportJob {
  readonly job_id: string;
  readonly status: 'pending' | 'building' | 'ready' | 'failed';
  readonly format: 'csv' | 'json';
  readonly created_at: string;
  readonly download_url?: string | null;
  readonly expires_at?: string | null;
}

/** Terminal export-job statuses (no further polling once reached). */
export type ExportJobTerminalStatus = 'ready' | 'failed';

/**
 * Outcome of an export request. Small/filtered sets stream synchronously
 * (`sync` + Blob, downloaded immediately); large sets are accepted as an
 * async job (`async` + ExportJob, polled to `ready` for the signed link).
 * ADR-205 D5.6.
 */
export type ExportResult =
  | { readonly kind: 'sync'; readonly blob: Blob }
  | { readonly kind: 'async'; readonly job: ExportJob };

/** Stateful filter set bound to the filter bar. */
export interface TransactionFilters {
  readonly kind?: TransactionKind | '';
  readonly status?: TransactionStatus | 'all' | '';
  readonly from?: string;
  readonly to?: string;
  readonly sort?: TransactionSort;
  /**
   * MASTER scope only — narrow span-all to a franchisee SET (repeated
   * `managed_tenant_id` params; multiple values = OR). Empty/undefined = no
   * franchisee narrowing.
   */
  readonly managed_tenant_ids?: readonly string[];
  /**
   * TENANT / MASTER scope only — drill into a learner SET (repeated
   * `learner_gcid` params; multiple values = OR). Empty/undefined = no drill.
   */
  readonly learner_gcids?: readonly string[];
}

/** SSE live-tail event (one newly-projected / updated row). */
export interface TransactionEvent {
  readonly item: TransactionLedgerItem;
  readonly change_type: string;
  readonly observed_at?: string;
}
