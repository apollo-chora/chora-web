/**
 * Admin-facing TypeScript interfaces for EconomyConfig management.
 * Source of truth: chora-contracts/openapi/choraverse.yaml
 * Jira: CHO-357, CHO-358
 */

export type ConfigCategory =
  | 'fog_thresholds'
  | 'elo_settings'
  | 'duel_limits'
  | 'material_drop_rates'
  | 'lootbox_probabilities'
  | 'co_op_hp'
  | 'boss_difficulty'
  | 'login_rewards'
  | 'store_limits';

export const CONFIG_CATEGORY_LABELS: Record<ConfigCategory, string> = {
  fog_thresholds: 'Fog Settings',
  elo_settings: 'ELO & Duels',
  duel_limits: 'Duel Limits',
  material_drop_rates: 'Materials',
  lootbox_probabilities: 'Lootbox',
  co_op_hp: 'Co-Op & Bosses',
  boss_difficulty: 'Boss Difficulty',
  login_rewards: 'Login Rewards',
  store_limits: 'Store',
};

export const ALL_CONFIG_CATEGORIES: ConfigCategory[] = [
  'fog_thresholds',
  'elo_settings',
  'duel_limits',
  'material_drop_rates',
  'lootbox_probabilities',
  'co_op_hp',
  'boss_difficulty',
  'login_rewards',
  'store_limits',
];

export interface EconomyConfig {
  id: string;
  tenant_id: string | null;
  config_category: ConfigCategory;
  config_key: string;
  config_value: Record<string, unknown>;
  is_tenant_override: boolean;
  created_by_gcid: string;
  updated_by_gcid: string;
  created_at: string;
  updated_at: string;
}

export interface EconomyConfigHistory {
  id: string;
  economy_config_id: string;
  old_value: Record<string, unknown>;
  new_value: Record<string, unknown>;
  changed_by_gcid: string;
  change_reason: string;
  created_at: string;
}

export interface EconomyConfigUpdateRequest {
  config_value: Record<string, unknown>;
  reason: string;
}
