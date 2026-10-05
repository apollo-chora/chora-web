/**
 * Communication models — notification preferences, trigger rules, email templates.
 *
 * Source of truth: chora-contracts/openapi/communication.yaml
 */

// ---------------------------------------------------------------------------
// Enums / Literal Unions
// ---------------------------------------------------------------------------

export type NotificationChannel = 'in_app' | 'push' | 'email';

export type EventCategory =
  | 'engagement'
  | 'assessment'
  | 'social'
  | 'training'
  | 'gamification'
  | 'account'
  | 'system';

export type TriggerRuleStatus = 'active' | 'disabled';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface NotificationPreference {
  gcid: string;
  event_category: EventCategory;
  channel: NotificationChannel;
  enabled: boolean;
  is_locked?: boolean;
  is_critical?: boolean;
}

export interface TriggerRule {
  id: string;
  name: string;
  event_type: string;
  channel: NotificationChannel;
  template_id: string | null;
  status: TriggerRuleStatus;
  created_at: string;
  updated_at: string;
}

export interface TemplateVariable {
  name: string;
  description: string;
  example_value: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  variables: TemplateVariable[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Discriminated Union States
// ---------------------------------------------------------------------------

export type PreferenceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; preferences: NotificationPreference[] }
  | { status: 'error'; error: { code: string; message: string } };

export type TriggerRuleListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; rules: TriggerRule[] }
  | { status: 'error'; error: { code: string; message: string } };

export type EmailTemplateListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; templates: EmailTemplate[] }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALL_CHANNELS: NotificationChannel[] = ['in_app', 'push', 'email'];

export const ALL_EVENT_CATEGORIES: EventCategory[] = [
  'engagement',
  'assessment',
  'social',
  'training',
  'gamification',
  'account',
  'system',
];

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: 'admin.communication.channel_in_app',
  push: 'admin.communication.channel_push',
  email: 'admin.communication.channel_email',
};

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  engagement: 'admin.communication.category_engagement',
  assessment: 'admin.communication.category_assessment',
  social: 'admin.communication.category_social',
  training: 'admin.communication.category_training',
  gamification: 'admin.communication.category_gamification',
  account: 'admin.communication.category_account',
  system: 'admin.communication.category_system',
};
