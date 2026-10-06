/**
 * H+ Billing — invoice list + Stripe Customer Portal session models.
 *
 * Wire-format mirrors CHO-1774 BE:
 *   - GET  /api/v1/admin/tenants/me/invoices
 *   - POST /api/v1/admin/tenants/me/billing-portal
 *
 * The CHO-1774 description field is the synthesised "{addon_code}:{tier_code}"
 * label the FE i18n resolves to a human string.
 */

export const ADMIN_TENANTS_ME_INVOICES_PATH =
  '/api/v1/admin/tenants/me/invoices';

export const ADMIN_TENANTS_ME_BILLING_PORTAL_PATH =
  '/api/v1/admin/tenants/me/billing-portal';

/** Stripe Invoice status (mirrors Stripe's lifecycle). */
export type InvoiceStatus =
  | 'paid'
  | 'open'
  | 'void'
  | 'uncollectible'
  | 'draft';

/** One row in the invoice table. */
export interface InvoiceRow {
  readonly stripe_invoice_id: string;
  readonly number: string;
  /** ISO 8601 UTC (period_start). */
  readonly period_start: string;
  /** ISO 8601 UTC. */
  readonly period_end: string;
  readonly status: InvoiceStatus;
  readonly total_cents: number;
  readonly currency: string;
  readonly hosted_invoice_url: string;
  readonly invoice_pdf_url: string;
  /**
   * Synthesised "{addon_code}:{tier_code}" — FE i18n resolves to a human
   * label (e.g. "Training Management Suite — Starter"). Empty when the
   * invoice's subscription_id doesn't match any TAP row (data drift edge).
   */
  readonly description: string;
}

export interface ListInvoicesResponse {
  readonly items: readonly InvoiceRow[];
  readonly next_cursor: string | null;
}

export interface ListInvoicesQuery {
  readonly limit?: number;
  readonly startingAfter?: string;
}

export type ListInvoicesResult =
  | {
      readonly kind: 'success';
      readonly items: readonly InvoiceRow[];
      readonly nextCursor: string | null;
    }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };

export interface CreatePortalSessionRequest {
  readonly return_url: string;
}

export interface PortalSessionResponse {
  readonly url: string;
}

export type CreatePortalSessionResult =
  | { readonly kind: 'success'; readonly url: string }
  | { readonly kind: 'no-stripe-customer' }
  | { readonly kind: 'validation-error' }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'server-error' }
  | { readonly kind: 'network-error' };
