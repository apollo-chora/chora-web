/**
 * Support domain models for tickets, responses, FAQ, and satisfaction surveys.
 *
 * Source of truth: chora-contracts/openapi/support.yaml
 * Backend returns snake_case JSON — these interfaces match directly.
 */

// ---------------------------------------------------------------------------
// Enums / Literal Unions
// ---------------------------------------------------------------------------

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

export type TicketCategory = 'account' | 'billing' | 'content' | 'technical' | 'general';

// ---------------------------------------------------------------------------
// Ticket
// ---------------------------------------------------------------------------

export interface Ticket {
  id: string;
  tenant_id: string;
  creator_gcid: string;
  assigned_agent_gcid: string | null;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  tags: string[];
  escalation_count: number;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Ticket Detail (Ticket + responses + satisfaction)
// ---------------------------------------------------------------------------

export interface TicketDetail extends Ticket {
  responses: TicketResponse[];
  satisfaction: SatisfactionSurvey | null;
}

// ---------------------------------------------------------------------------
// Ticket Response (message in thread)
// ---------------------------------------------------------------------------

export interface TicketResponse {
  id: string;
  ticket_id: string;
  author_gcid: string;
  body: string;
  is_internal: boolean;
  attachments: TicketAttachment[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// Ticket Attachment
// ---------------------------------------------------------------------------

export interface TicketAttachment {
  id: string;
  filename: string;
  url: string;
  content_type: string;
  size_bytes: number;
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

export interface FaqArticle {
  id: string;
  tenant_id: string;
  category_id: string;
  question: string;
  answer: string;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface FaqCategory {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Satisfaction Survey
// ---------------------------------------------------------------------------

export interface SatisfactionSurvey {
  id: string;
  ticket_id: string;
  respondent_gcid: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// SLA Status (derived, not from API directly)
// ---------------------------------------------------------------------------

export interface SlaStatus {
  ticket_id: string;
  response_due_at: string;
  resolution_due_at: string;
  is_breached: boolean;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface PageInfo {
  next_cursor: string | null;
  has_next: boolean;
}

// ---------------------------------------------------------------------------
// Request Types
// ---------------------------------------------------------------------------

export interface CreateTicketRequest {
  subject: string;
  description?: string;
  priority?: TicketPriority;
  category: TicketCategory;
  tags?: string[];
}

export interface CreateResponseRequest {
  body: string;
  is_internal?: boolean;
}

export interface SubmitSatisfactionRequest {
  rating: number;
  comment?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALL_TICKET_STATUSES: TicketStatus[] = [
  'open',
  'in_progress',
  'resolved',
  'closed',
];

export const ALL_TICKET_PRIORITIES: TicketPriority[] = [
  'low',
  'medium',
  'high',
  'critical',
];

export const ALL_TICKET_CATEGORIES: TicketCategory[] = [
  'account',
  'billing',
  'content',
  'technical',
  'general',
];

// ---------------------------------------------------------------------------
// Label Maps (i18n keys)
// ---------------------------------------------------------------------------

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'support.status_open',
  in_progress: 'support.status_in_progress',
  resolved: 'support.status_resolved',
  closed: 'support.status_closed',
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'support.priority_low',
  medium: 'support.priority_medium',
  high: 'support.priority_high',
  critical: 'support.priority_critical',
};

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  account: 'support.category_account',
  billing: 'support.category_billing',
  content: 'support.category_content',
  technical: 'support.category_technical',
  general: 'support.category_general',
};

// ---------------------------------------------------------------------------
// Discriminated Union States
// ---------------------------------------------------------------------------

export type TicketListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; tickets: Ticket[]; page_info: PageInfo }
  | { status: 'error'; error: { code: string; message: string } };

export type TicketDetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; ticket: TicketDetail }
  | { status: 'error'; error: { code: string; message: string } };

export type FaqListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; articles: FaqArticle[]; page_info: PageInfo }
  | { status: 'error'; error: { code: string; message: string } };

export type FaqCategoryListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; categories: FaqCategory[] }
  | { status: 'error'; error: { code: string; message: string } };

export type SatisfactionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; survey: SatisfactionSurvey }
  | { status: 'error'; error: { code: string; message: string } };
