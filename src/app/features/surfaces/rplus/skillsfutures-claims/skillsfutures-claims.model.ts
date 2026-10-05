/**
 * SkillsFutures Claims model — R+ /r/skillsfutures-claims surface
 * (M15c R+ Stage C-lite wave-2b).
 *
 * Maps the chora-delivery GET /api/v1/skillsfutures-claims wire shape into
 * the typed FE model the R+ Claims screen renders. Backend response shape
 * (per services/chora-delivery/internal/adapter/http/skillsfutures_handler.go
 * ::skillsFuturesClaimDTO):
 *
 *   {
 *     items: [
 *       {
 *         id: string,
 *         tenant_id: string,
 *         gcid: string,
 *         course_id: string,
 *         nric_hash: string,                       // never raw NRIC
 *         requested_amount_sgd_cents: number,
 *         approved_amount_sgd_cents: number,       // 0 until APPROVED
 *         state: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISBURSED',
 *         submitted_at: ISO8601,
 *         decided_at?: ISO8601,                    // present once decided
 *         decided_by_gcid?: string,                // present once decided
 *         rejection_reason?: string,               // present iff REJECTED
 *       }, ...
 *     ]
 *   }
 *
 * Domain anchors:
 *   - `SkillsFutures` — Singapore-government training-funding scheme (SSG)
 *   - `SkillsFuturesClaim` aggregate root — see services/chora-delivery/
 *     internal/domain/skillsfutures/claim.go
 *   - PII: NRIC is NEVER raw on the wire — sha256 hash only. The R+ admin
 *     row renders a truncated `nric_hash` prefix for audit reference only.
 */

export type SkillsFuturesClaimState =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'DISBURSED';

export const SKILLSFUTURES_CLAIM_STATES: readonly SkillsFuturesClaimState[] = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'DISBURSED',
];

export interface SkillsFuturesClaim {
  /** Claim UUIDv7 — opaque stable id. */
  readonly id: string;
  /** Owning tenant id (always = current tenant — RLS-enforced). */
  readonly tenantId: string;
  /** Learner GCID — the SG-citizen claimant. */
  readonly gcid: string;
  /** Source course id the funding applies to. */
  readonly courseId: string;
  /** SHA-256 hex hash of the Singapore NRIC (S-prefix); NEVER raw. */
  readonly nricHash: string;
  /** Learner-requested SSG draw amount in SGD cents. */
  readonly requestedAmountSGDCents: number;
  /** Training-admin authorised amount in SGD cents (0 until APPROVED). */
  readonly approvedAmountSGDCents: number;
  /** Lifecycle FSM state. */
  readonly state: SkillsFuturesClaimState;
  /** RFC-3339 submission timestamp. */
  readonly submittedAt: string;
  /** RFC-3339 decision timestamp (present once admin approves/rejects). */
  readonly decidedAt: string | null;
  /** Training-admin GCID that decided (present once decided). */
  readonly decidedByGCID: string | null;
  /** Free-text reason (present iff REJECTED). */
  readonly rejectionReason: string | null;
}

export interface SkillsFuturesClaimList {
  /** Tenant display name (header pill — pulled from TenantContextService). */
  readonly tenantName: string;
  /** Total count for the badge. */
  readonly totalClaims: number;
  /** Claim rows for the list, sorted by id (UUIDv7 ⇒ creation-time order). */
  readonly items: readonly SkillsFuturesClaim[];
}

export type StateBadgeVariant =
  | 'badge-warning' // PENDING (awaiting decision)
  | 'badge-success' // APPROVED
  | 'badge-neutral' // REJECTED
  | 'badge-info'; // DISBURSED

/**
 * Returns the polyglass badge variant class for the given claim state.
 *   - PENDING   → badge-warning (awaiting decision)
 *   - APPROVED  → badge-success (decision in claimant's favour)
 *   - REJECTED  → badge-neutral (closed without payout)
 *   - DISBURSED → badge-info    (SSG payout settled)
 */
export function stateBadgeVariant(
  state: SkillsFuturesClaimState,
): StateBadgeVariant {
  switch (state) {
    case 'PENDING':
      return 'badge-warning';
    case 'APPROVED':
      return 'badge-success';
    case 'REJECTED':
      return 'badge-neutral';
    case 'DISBURSED':
      return 'badge-info';
  }
}

/**
 * Formats a SGD-cents amount as a SGD currency string (`$1,234.56`).
 * Centralised here so the component never inlines locale formatting.
 */
export function formatSGD(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

/**
 * Truncates the long sha256 hash for at-a-glance audit display. Returns
 * the first 12 chars after the `sha256:` prefix, then an ellipsis. Never
 * exposes the full hash on the dense list view (per privacy minimisation).
 */
export function shortNricHash(hash: string): string {
  const colonAt = hash.indexOf(':');
  const body = colonAt >= 0 ? hash.slice(colonAt + 1) : hash;
  if (body.length <= 12) return body;
  return `${body.slice(0, 12)}…`;
}
