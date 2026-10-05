/**
 * Applications Admin Detail model — R+ Wave-5 drill-down.
 *
 * Surfaces the chora-delivery `applicationDetailDTO()` shape — the same
 * row payload as the queue list (ApplicationRow) extended with the
 * append-only state-transition `history[]` and optional `funding_lines`.
 *
 * Backend ref:
 *   services/chora-delivery/internal/adapter/http/applications.go
 *   :: applicationDetailDTO
 *
 * The list-side `ApplicationRow` is re-exported as the base type — a
 * detail row is `ApplicationRow` ∪ `{ history; fundingLines? }`.
 *
 * The admin-side endpoint `/api/v1/applications/{id}` is GET-only per
 * `applications_admin_handler.go::handleApplicationsAdminDetail` —
 * Approve / Reject / Offer transitions live on the learner-side
 * surface (`/v1/me/applications/{id}/*`) so this detail screen renders
 * READ-ONLY (no per-row action CTAs are wired here).
 */
import type { ApplicationRow } from '../applications/applications.model';

export type {
  ApplicationRow,
  ApplicationStatus,
  ApplicationStatusBadge,
} from '../applications/applications.model';

export {
  applicationStatusBadge,
  normaliseApplicationStatus,
} from '../applications/applications.model';

/**
 * Append-only history row mirroring the wire shape emitted by
 * `applicationDetailDTO()` (history[].{from,to,at,reason?}).
 *
 * `from` may be empty on the genesis transition (the application's
 * first SUBMITTED entry has no antecedent state).
 */
export interface ApplicationHistoryEntry {
  /** Lowercase domain status the application transitioned FROM. */
  readonly from: string;
  /** Lowercase domain status the application transitioned TO. */
  readonly to: string;
  /** RFC3339Nano transition timestamp. */
  readonly at: string;
  /** Optional human-supplied reason (set on REJECT / WITHDRAW). */
  readonly reason: string | null;
}

/**
 * Composed funding-line entry surfaced when the wire body carries the
 * optional `funding_lines` slice (set on accepted/paid offers in the
 * ADR-164 chora-payments handshake).
 */
export interface ApplicationFundingLine {
  /** Free-text source label (e.g., "SkillsFutures Credit", "Self-pay"). */
  readonly source: string;
  /** Funding amount in SGD cents. */
  readonly amountSgdCents: number;
  /** Optional reference id (e.g., SSG claim id). */
  readonly reference: string | null;
}

/**
 * Detail row consumed by the FE — adds history + funding lines on top
 * of the canonical ApplicationRow.
 */
export interface ApplicationDetail extends ApplicationRow {
  /** Append-only state-transition log, oldest-first. */
  readonly history: readonly ApplicationHistoryEntry[];
  /** Optional offer funding-line breakdown (present post-OFFER_MADE). */
  readonly fundingLines: readonly ApplicationFundingLine[];
}
