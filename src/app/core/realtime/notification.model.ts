/**
 * Learner-facing notification models.
 *
 * Source of truth: chora-contracts/openapi/notifications-admin.yaml
 */

export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';

export type NotificationCategory =
  | 'engagement'
  | 'assessment'
  | 'social'
  | 'training'
  | 'gamification'
  | 'account'
  | 'system';

export type NotificationActionType =
  | 'accept'
  | 'decline'
  | 'approve'
  | 'reject'
  | 'claim'
  | 'escalate';

export type NotificationStatus = 'pending' | 'delivered' | 'read' | 'expired';

export interface NotificationDelivery {
  id: string;
  gcid: string;
  title: string;
  body: string;
  priority: NotificationPriority;
  category: NotificationCategory;
  status: NotificationStatus;
  is_read: boolean;
  is_pinned: boolean;
  action_type: NotificationActionType | null;
  action_payload: Record<string, unknown> | null;
  action_responded: boolean;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

export type NotificationFilterTab = 'all' | 'unread' | 'actionable' | 'mentions';

export interface NotificationListParams {
  cursor?: string;
  limit?: number;
  is_read?: boolean;
  priority?: NotificationPriority;
  category?: NotificationCategory;
}

export interface PaginatedNotifications {
  items: NotificationDelivery[];
  next_cursor: string | null;
  total_unread: number;
}
