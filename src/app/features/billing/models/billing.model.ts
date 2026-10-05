/**
 * Billing domain models for subscription management, invoices, promo codes, and usage.
 *
 * Source of truth: chora-contracts/openapi/billing.yaml
 * Backend returns snake_case JSON — these interfaces match directly.
 */

// ---------------------------------------------------------------------------
// Enums / Literal Unions
// ---------------------------------------------------------------------------

export type BillingInterval = 'monthly' | 'yearly';

export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'trialing';

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

export type PaymentStatus = 'succeeded' | 'pending' | 'failed';

export type DiscountType = 'percentage' | 'fixed_amount';

// ---------------------------------------------------------------------------
// Subscription Plan
// ---------------------------------------------------------------------------

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  billing_interval: BillingInterval;
  features: string[];
}

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

export interface Subscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  plan_name: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------

export interface Invoice {
  id: string;
  tenant_id: string;
  subscription_id: string;
  amount_cents: number;
  currency: string;
  status: InvoiceStatus;
  invoice_number: string;
  period_start: string;
  period_end: string;
  pdf_url: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

export interface Payment {
  id: string;
  invoice_id: string;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  payment_method: string;
  paid_at: string | null;
}

// ---------------------------------------------------------------------------
// Promo Code
// ---------------------------------------------------------------------------

export interface PromoCode {
  id: string;
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  max_redemptions: number;
  current_redemptions: number;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  created_by: string;
}

// ---------------------------------------------------------------------------
// Usage Summary
// ---------------------------------------------------------------------------

export interface UsageSummary {
  resource_type: string;
  current_usage: number;
  limit: number;
  unit: string;
  period_start: string;
  period_end: string;
  overage_rate_cents: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALL_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  'active',
  'past_due',
  'cancelled',
  'trialing',
];

export const ALL_INVOICE_STATUSES: InvoiceStatus[] = [
  'draft',
  'open',
  'paid',
  'void',
  'uncollectible',
];

export const ALL_PAYMENT_STATUSES: PaymentStatus[] = [
  'succeeded',
  'pending',
  'failed',
];

export const ALL_DISCOUNT_TYPES: DiscountType[] = [
  'percentage',
  'fixed_amount',
];

// ---------------------------------------------------------------------------
// Label Maps (i18n keys)
// ---------------------------------------------------------------------------

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'billing.status_active',
  past_due: 'billing.status_past_due',
  cancelled: 'billing.status_cancelled',
  trialing: 'billing.status_trialing',
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'billing.invoice_status_draft',
  open: 'billing.invoice_status_open',
  paid: 'billing.invoice_status_paid',
  void: 'billing.invoice_status_void',
  uncollectible: 'billing.invoice_status_uncollectible',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  succeeded: 'billing.payment_status_succeeded',
  pending: 'billing.payment_status_pending',
  failed: 'billing.payment_status_failed',
};

// ---------------------------------------------------------------------------
// Discriminated Union States
// ---------------------------------------------------------------------------

export type SubscriptionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: Subscription }
  | { status: 'error'; error: { code: string; message: string } };

export type InvoiceListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; invoices: Invoice[] }
  | { status: 'error'; error: { code: string; message: string } };

export type PromoCodeListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; promo_codes: PromoCode[] }
  | { status: 'error'; error: { code: string; message: string } };

export type UsageState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; summaries: UsageSummary[] }
  | { status: 'error'; error: { code: string; message: string } };
