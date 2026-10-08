/**
 * Marketplace domain models for catalog, campaigns, revenue, and referrals.
 *
 * Source of truth: chora-contracts/openapi/payments-admin.yaml
 * Backend returns snake_case JSON — these interfaces match directly.
 */

// ---------------------------------------------------------------------------
// Enums / Literal Unions
// ---------------------------------------------------------------------------

export type CampaignStatus = 'draft' | 'active' | 'completed' | 'expired';

export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';

export type ReferralCreditStatus = 'pending' | 'credited' | 'expired';

// ---------------------------------------------------------------------------
// Marketplace Item (Add-on catalog detail)
// ---------------------------------------------------------------------------

export interface MarketplaceReview {
  id: string;
  reviewer_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface CompatibilityEntry {
  addon_id: string;
  addon_name: string;
  relationship: 'compatible' | 'required' | 'incompatible';
}

export interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  long_description: string;
  price_cents: number;
  currency: string;
  billing_interval: 'monthly' | 'yearly' | 'one_time';
  features: string[];
  screenshots: string[];
  reviews: MarketplaceReview[];
  average_rating: number;
  review_count: number;
  compatibility: CompatibilityEntry[];
  is_active: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Promotional Campaign
// ---------------------------------------------------------------------------

export interface CampaignTargetAudience {
  tenant_types: string[];
  regions: string[];
  min_usage_days: number;
}

export interface CampaignMetrics {
  impressions: number;
  conversions: number;
  spend_cents: number;
  conversion_rate: number;
}

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  budget_cents: number;
  spent_cents: number;
  currency: string;
  start_date: string;
  end_date: string;
  target_audience: CampaignTargetAudience;
  metrics: CampaignMetrics;
  created_at: string;
  created_by: string;
}

// ---------------------------------------------------------------------------
// Instructor Revenue
// ---------------------------------------------------------------------------

export interface InstructorRevenueSummary {
  total_earned_cents: number;
  pending_payout_cents: number;
  lifetime_cents: number;
  currency: string;
}

export interface RevenueShareBreakdown {
  category: string;
  amount_cents: number;
  percentage: number;
}

export interface PromoCodePerformance {
  code: string;
  uses: number;
  revenue_cents: number;
}

export interface PayoutEntry {
  id: string;
  amount_cents: number;
  currency: string;
  status: PayoutStatus;
  requested_at: string;
  paid_at: string | null;
}

export interface InstructorRevenue {
  summary: InstructorRevenueSummary;
  revenue_shares: RevenueShareBreakdown[];
  promo_performance: PromoCodePerformance[];
  payouts: PayoutEntry[];
}

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

export interface ReferralTier {
  name: string;
  referrals_required: number;
  reward_description: string;
  is_achieved: boolean;
}

export interface ReferralCredit {
  id: string;
  referred_initials: string;
  credit_cents: number;
  currency: string;
  status: ReferralCreditStatus;
  created_at: string;
}

export interface ReferralInfo {
  referral_code: string;
  referral_link: string;
  earned_credits_cents: number;
  currency: string;
  credits: ReferralCredit[];
  tiers: ReferralTier[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALL_CAMPAIGN_STATUSES: CampaignStatus[] = [
  'draft',
  'active',
  'completed',
  'expired',
];

export const ALL_PAYOUT_STATUSES: PayoutStatus[] = [
  'pending',
  'processing',
  'paid',
  'failed',
];

export const ALL_REFERRAL_CREDIT_STATUSES: ReferralCreditStatus[] = [
  'pending',
  'credited',
  'expired',
];

// ---------------------------------------------------------------------------
// Label Maps (i18n keys)
// ---------------------------------------------------------------------------

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'billing.campaign_status_draft',
  active: 'billing.campaign_status_active',
  completed: 'billing.campaign_status_completed',
  expired: 'billing.campaign_status_expired',
};

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  pending: 'billing.payout_status_pending',
  processing: 'billing.payout_status_processing',
  paid: 'billing.payout_status_paid',
  failed: 'billing.payout_status_failed',
};

export const REFERRAL_CREDIT_STATUS_LABELS: Record<ReferralCreditStatus, string> = {
  pending: 'billing.referral_credit_pending',
  credited: 'billing.referral_credit_credited',
  expired: 'billing.referral_credit_expired',
};

// ---------------------------------------------------------------------------
// Discriminated Union States
// ---------------------------------------------------------------------------

export type MarketplaceItemState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: MarketplaceItem }
  | { status: 'error'; error: { code: string; message: string } };

export type CampaignListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: Campaign[] }
  | { status: 'error'; error: { code: string; message: string } };

export type InstructorRevenueState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: InstructorRevenue }
  | { status: 'error'; error: { code: string; message: string } };

export type ReferralState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: ReferralInfo }
  | { status: 'error'; error: { code: string; message: string } };
