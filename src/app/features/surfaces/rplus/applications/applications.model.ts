/**
 * Applications model — R+ Stage 3 wave 4 (M14 R+ buildout).
 *
 * Course Application review queue for the training-admin role.
 * Distinct from the LEARNER-side application surface (`/api/me/...`)
 * — this is the admin/instructor view of every applicant in the
 * tenant.
 *
 * State vocabulary anchors per `docs/architecture/adrs/adr-164-chora-payments-service.md`:
 *
 *   - SUBMITTED   — learner submitted the application form.
 *   - IN_REVIEW   — training-admin opened the review (alias for
 *                   the domain enum `under_review`).
 *   - OFFER_MADE  — admin extended an offer (price + funding lines).
 *   - ACCEPTED    — learner accepted the offer (post Stripe Checkout
 *                   minted by chora-payments via gRPC).
 *   - PAID        — Stripe webhook → chora-payments materialised
 *                   `payment_captured.v1` → chora-delivery
 *                   transitioned PAID via the events subscriber.
 *   - ENROLLED    — auto-enrolled into the course/class roster
 *                   post-PAID (terminal happy-path).
 *   - REJECTED    — admin rejected the application with a reason
 *                   (terminal).
 *   - WITHDRAWN   — learner withdrew the application with an
 *                   optional reason (terminal).
 *
 * The wire form is UPPER_SNAKE_CASE per the FE brief; the backend
 * domain `application.Status` enum uses lowercase snake_case
 * (`under_review` not `IN_REVIEW`). The service layer normalises in
 * both directions.
 */

/**
 * State filter values accepted by the admin queue.
 *
 * `ALL` is a UI-only sentinel — when the user picks "All states"
 * the service omits the `?state=` query param entirely (which
 * matches "no filter" on the backend).
 */
export type ApplicationStateFilter =
  | 'ALL'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'OFFER_MADE'
  | 'ACCEPTED'
  | 'PAID'
  | 'ENROLLED'
  | 'REJECTED'
  | 'WITHDRAWN';

/** Canonical wire-form Application status (excludes the UI-only ALL). */
export type ApplicationStatus = Exclude<ApplicationStateFilter, 'ALL'>;

/** Per-state badge variant used by the UI to render the chip. */
export type ApplicationStatusBadge =
  | 'badge-info'
  | 'badge-warning'
  | 'badge-success'
  | 'badge-neutral'
  | 'badge-danger';

/**
 * A single Course Application row in the admin review queue.
 *
 * The fields mirror the canonical applicationDTO emitted by
 * `services/chora-delivery/internal/adapter/http/applications.go`
 * applicationDTO + applicationDetailDTO (history is only present on
 * the detail call, omitted on the list).
 */
export interface ApplicationRow {
  /** UUIDv7 application id. */
  readonly id: string;
  /** Owning tenant id. */
  readonly tenantId: string;
  /** Course being applied for. */
  readonly courseId: string;
  /** Optional class id (when the learner picked a specific cohort). */
  readonly classId: string | null;
  /** Applicant's GCID. */
  readonly gcid: string;
  /** Canonical UPPER_SNAKE_CASE state. */
  readonly state: ApplicationStatus;
  /** ISO timestamp the application was first created. */
  readonly createdAt: string;
  /** ISO timestamp of the latest state transition. */
  readonly updatedAt: string;
  /** Optional offer expiry timestamp (set when state == OFFER_MADE). */
  readonly offerExpiresAt: string | null;
  /** Optional Stripe PaymentIntent / Checkout session id (set post-ACCEPTED). */
  readonly stripePaymentIntentId: string | null;
  /** Optional invoice number (set post-PAID). */
  readonly invoiceId: string | null;
  /** Reason captured on REJECTED transition. */
  readonly rejectedReason: string | null;
  /** Reason captured on WITHDRAWN transition. */
  readonly withdrawnReason: string | null;
}

/** Top-level shape the FE consumes for the queue view. */
export interface ApplicationQueue {
  /** Filter that produced this list (echoed for the UI dropdown). */
  readonly filter: ApplicationStateFilter;
  /** Total post-filter row count (FE displays this in the header). */
  readonly total: number;
  /** Page rows (ordered newest-first by the backend). */
  readonly applications: readonly ApplicationRow[];
}

/**
 * Resolve the badge variant for a status chip. Centralised so the
 * component template stays declarative.
 */
export function applicationStatusBadge(
  state: ApplicationStatus,
): ApplicationStatusBadge {
  switch (state) {
    case 'SUBMITTED':
    case 'IN_REVIEW':
      return 'badge-info';
    case 'OFFER_MADE':
      return 'badge-warning';
    case 'ACCEPTED':
    case 'PAID':
      return 'badge-success';
    case 'ENROLLED':
      return 'badge-success';
    case 'REJECTED':
      return 'badge-danger';
    case 'WITHDRAWN':
      return 'badge-neutral';
  }
}

/**
 * Normalise the backend's lowercase `status` field to the canonical
 * UPPER_SNAKE_CASE wire form the FE uses everywhere downstream.
 *
 * Unknown values fall back to SUBMITTED (loudest "needs attention"
 * default) and are also surfaced in console.warn so the FE noticed
 * before the user does — per feedback_no_stubs_real_wiring.
 */
export function normaliseApplicationStatus(raw: string): ApplicationStatus {
  switch (raw.trim().toLowerCase()) {
    case 'submitted':
      return 'SUBMITTED';
    case 'under_review':
    case 'in_review':
      return 'IN_REVIEW';
    case 'offer_made':
      return 'OFFER_MADE';
    case 'accepted':
      return 'ACCEPTED';
    case 'paid':
      return 'PAID';
    case 'enrolled':
      return 'ENROLLED';
    case 'rejected':
      return 'REJECTED';
    case 'withdrawn':
      return 'WITHDRAWN';
    default:
      // eslint-disable-next-line no-console
      console.warn(
        `[applications] unknown backend status "${raw}": falling back to SUBMITTED`,
      );
      return 'SUBMITTED';
  }
}

/**
 * Render-friendly label for the UI dropdown / chip. Kept here so
 * the component template stays free of switch statements.
 */
export function applicationStateLabel(state: ApplicationStateFilter): string {
  switch (state) {
    case 'ALL':
      return 'All states';
    case 'SUBMITTED':
      return 'Submitted';
    case 'IN_REVIEW':
      return 'In review';
    case 'OFFER_MADE':
      return 'Offer made';
    case 'ACCEPTED':
      return 'Accepted';
    case 'PAID':
      return 'Paid';
    case 'ENROLLED':
      return 'Enrolled';
    case 'REJECTED':
      return 'Rejected';
    case 'WITHDRAWN':
      return 'Withdrawn';
  }
}

/** Ordered list of selectable states for the FE filter dropdown. */
export const APPLICATION_STATE_OPTIONS: readonly ApplicationStateFilter[] = [
  'ALL',
  'SUBMITTED',
  'IN_REVIEW',
  'OFFER_MADE',
  'ACCEPTED',
  'PAID',
  'ENROLLED',
  'REJECTED',
  'WITHDRAWN',
];
