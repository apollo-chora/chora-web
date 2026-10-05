/**
 * Gamification models — Reward Store, Coin Economy, Knowledge Bounties.
 *
 * Aligns with chora-contracts/openapi/gamification.yaml schemas.
 * DigitalSkins are EARNED rewards — NEVER purchasable.
 *
 * @see PLAN.md §3.42 (Gamification)
 * @see docs/design/ux_engagement.md
 */

import { SkinRarity } from './familiar.model';
import type { FamiliarSkin } from './familiar.model';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type SkinTheme = 'seasonal' | 'achievement' | 'premium' | 'community';

export type CoinTransactionType = 'earned' | 'spent' | 'refunded';

export type BountyStatus = 'open' | 'in_progress' | 'completed' | 'expired' | 'cancelled';

export type SkinEarnedVia =
  | 'streak'
  | 'league_win'
  | 'topic_mastery'
  | 'featured_work'
  | 'instructor_award'
  | 'certification'
  | 'legendary_transfer';

export type EquipmentSlot =
  | 'profile_photo'
  | 'zoom_overlay'
  | 'zoom_background'
  | 'name_badge'
  | 'email_signature'
  | 'class_profile';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALL_SKIN_RARITIES: SkinRarity[] = [
  SkinRarity.Common,
  SkinRarity.Uncommon,
  SkinRarity.Rare,
  SkinRarity.Epic,
  SkinRarity.Legendary,
];

export const ALL_SKIN_THEMES: SkinTheme[] = [
  'seasonal',
  'achievement',
  'premium',
  'community',
];

export const RARITY_COLORS: Record<SkinRarity, string> = {
  [SkinRarity.Common]: '#9ca3af',
  [SkinRarity.Uncommon]: '#22c55e',
  [SkinRarity.Rare]: '#3b82f6',
  [SkinRarity.Epic]: '#a855f7',
  [SkinRarity.Legendary]: '#eab308',
};

export const RARITY_LABELS: Record<SkinRarity, string> = {
  [SkinRarity.Common]: 'choraverse.skin_gallery.rarity_common',
  [SkinRarity.Uncommon]: 'choraverse.skin_gallery.rarity_uncommon',
  [SkinRarity.Rare]: 'choraverse.skin_gallery.rarity_rare',
  [SkinRarity.Epic]: 'choraverse.skin_gallery.rarity_epic',
  [SkinRarity.Legendary]: 'choraverse.skin_gallery.rarity_legendary',
};

export const THEME_LABELS: Record<SkinTheme, string> = {
  seasonal: 'choraverse.skin_gallery.theme_seasonal',
  achievement: 'choraverse.skin_gallery.theme_achievement',
  premium: 'choraverse.skin_gallery.theme_premium',
  community: 'choraverse.skin_gallery.theme_community',
};

export const TRANSACTION_TYPE_LABELS: Record<CoinTransactionType, string> = {
  earned: 'choraverse.transactions.type_earned',
  spent: 'choraverse.transactions.type_spent',
  refunded: 'choraverse.transactions.type_refunded',
};

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface CoinAccount {
  id: string;
  gcid: string;
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  created_at: string;
  updated_at: string;
}

export interface CoinTransaction {
  id: string;
  coin_account_id: string;
  amount: number;
  transaction_type: CoinTransactionType;
  reason: string;
  reference_id: string | null;
  reference_type: string | null;
  created_at: string;
}

export interface SkinCatalogEntry extends FamiliarSkin {
  category: string;
  theme: SkinTheme;
  is_equipped: boolean;
  is_legendary: boolean;
  asset_url: string;
  earn_criteria: Record<string, unknown>;
  earned_via: SkinEarnedVia | null;
  earned_at: string | null;
}

export interface KnowledgeBounty {
  id: string;
  poster_gcid: string;
  title: string;
  description: string;
  coin_reward: number;
  reputation_requirement: number;
  status: BountyStatus;
  solver_gcid: string | null;
  created_at: string;
  completed_at: string | null;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// Discriminated Union States
// ---------------------------------------------------------------------------

export type CoinAccountState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; account: CoinAccount }
  | { status: 'error'; error: { code: string; message: string } };

export type CoinTransactionListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; transactions: CoinTransaction[] }
  | { status: 'error'; error: { code: string; message: string } };

export type SkinCatalogState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; skins: SkinCatalogEntry[] }
  | { status: 'error'; error: { code: string; message: string } };

export type BountyListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; bounties: KnowledgeBounty[] }
  | { status: 'error'; error: { code: string; message: string } };

export type EquipActionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success' }
  | { status: 'error'; error: { code: string; message: string } };
