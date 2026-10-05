/**
 * ModerationService — REST adapter for the content moderation dashboard.
 *
 * Source of truth: chora-contracts/openapi/governance.yaml
 * All HTTP calls go through BffClientService.
 */
import { Injectable } from '@angular/core';
// HttpParams will be re-imported when the live BFF call is wired (see TODO below).
import { Observable, of } from 'rxjs';
import type {
  FlaggedContentItem,
  FlaggedContentStatus,
  FlaggedContentType,
  FlaggedContentListResponse,
  ModerationActionRequest,
  ModerationAuditEntry,
  ModerationAuditResponse,
} from '../models/moderation.model';

@Injectable({ providedIn: 'root' })
export class ModerationService {

  // -------------------------------------------------------------------------
  // Flagged Content List
  // -------------------------------------------------------------------------

  /**
   * Fetch flagged content items with optional filters.
   * GET /api/v1/admin/moderation/flagged
   */
  getFlaggedContent(
    status?: FlaggedContentStatus | null,
    contentType?: FlaggedContentType | null,
    page = 1,
    pageSize = 20,
  ): Observable<FlaggedContentListResponse> {
    // TODO: Replace with real API call once backend is wired.
    // const params = new HttpParams()
    //   .set('page', page.toString())
    //   .set('page_size', pageSize.toString())
    //   .set('status', status ?? '')
    //   .set('content_type', contentType ?? '');
    // return this.bff.get<FlaggedContentListResponse>(`${MODERATION_PATH}/flagged`, params);
    void page;
    void pageSize;
    return of(buildMockFlaggedContentResponse(status, contentType));
  }

  // -------------------------------------------------------------------------
  // Moderation Actions
  // -------------------------------------------------------------------------

  /**
   * Submit a moderation action for a flagged content item.
   * POST /api/v1/admin/moderation/flagged/{id}/action
   */
  submitAction(
    flaggedContentId: string,
    action: ModerationActionRequest,
  ): Observable<FlaggedContentItem> {
    // TODO: Replace with real API call
    // return this.bff.post<FlaggedContentItem>(
    //   `${MODERATION_PATH}/flagged/${encodeURIComponent(flaggedContentId)}/action`,
    //   action,
    // );
    return of({
      ...MOCK_FLAGGED_ITEMS.find((i) => i.id === flaggedContentId)!,
      status: action.decision === 'approve' || action.decision === 'restore' ? 'dismissed' : 'resolved',
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as FlaggedContentItem);
  }

  // -------------------------------------------------------------------------
  // Audit Trail
  // -------------------------------------------------------------------------

  /**
   * Fetch moderation audit trail for a specific flagged content item.
   * GET /api/v1/admin/moderation/flagged/{id}/audit
   */
  getAuditTrail(flaggedContentId: string): Observable<ModerationAuditResponse> {
    // TODO: Replace with real API call
    // return this.bff.get<ModerationAuditResponse>(
    //   `${MODERATION_PATH}/flagged/${encodeURIComponent(flaggedContentId)}/audit`,
    // );
    return of({
      data: MOCK_AUDIT_ENTRIES.filter((e) => e.flagged_content_id === flaggedContentId),
      total: MOCK_AUDIT_ENTRIES.filter((e) => e.flagged_content_id === flaggedContentId).length,
    });
  }

  /**
   * Assign self as reviewer for a flagged content item.
   * POST /api/v1/admin/moderation/flagged/{id}/assign
   */
  assignToSelf(flaggedContentId: string): Observable<FlaggedContentItem> {
    // TODO: Replace with real API call
    // return this.bff.post<FlaggedContentItem>(
    //   `${MODERATION_PATH}/flagged/${encodeURIComponent(flaggedContentId)}/assign`,
    //   {},
    // );
    return of({
      ...MOCK_FLAGGED_ITEMS.find((i) => i.id === flaggedContentId)!,
      status: 'reviewing' as const,
      assigned_moderator_gcid: 'current-gcid',
      assigned_moderator_name: 'Current User',
      updated_at: new Date().toISOString(),
    });
  }
}

// ---------------------------------------------------------------------------
// Mock data (removed once real APIs are integrated)
// ---------------------------------------------------------------------------

const MOCK_FLAGGED_ITEMS: FlaggedContentItem[] = [
  {
    id: 'flag-001',
    tenant_id: 'tenant-001',
    content_id: 'atom-123',
    content_type: 'atom',
    content_title: 'Introduction to Algebra',
    content_excerpt: 'This atom contains potentially misleading mathematical proofs...',
    flagged_by_gcid: 'gcid-learner-001',
    flagged_by_display_name: 'Jane Student',
    flag_reason: 'Inaccurate content: the quadratic formula explanation is incorrect',
    status: 'pending',
    assigned_moderator_gcid: null,
    assigned_moderator_name: null,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
    resolved_at: null,
  },
  {
    id: 'flag-002',
    tenant_id: 'tenant-001',
    content_id: 'comment-456',
    content_type: 'comment',
    content_title: 'Discussion: Best practices for loops',
    content_excerpt: 'This comment contains inappropriate language directed at another learner...',
    flagged_by_gcid: 'gcid-learner-002',
    flagged_by_display_name: 'Alex Learner',
    flag_reason: 'Harassment: contains personal attacks',
    status: 'reviewing',
    assigned_moderator_gcid: 'gcid-mod-001',
    assigned_moderator_name: 'Moderator Kim',
    created_at: new Date(Date.now() - 7200000).toISOString(),
    updated_at: new Date(Date.now() - 1800000).toISOString(),
    resolved_at: null,
  },
  {
    id: 'flag-003',
    tenant_id: 'tenant-001',
    content_id: 'post-789',
    content_type: 'forum_post',
    content_title: 'Study group: Advanced Physics',
    content_excerpt: 'Post contains commercial spam links unrelated to learning...',
    flagged_by_gcid: 'gcid-learner-003',
    flagged_by_display_name: 'Chris Teacher',
    flag_reason: 'Spam: commercial links',
    status: 'resolved',
    assigned_moderator_gcid: 'gcid-mod-002',
    assigned_moderator_name: 'Moderator Lee',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 43200000).toISOString(),
    resolved_at: new Date(Date.now() - 43200000).toISOString(),
  },
  {
    id: 'flag-004',
    tenant_id: 'tenant-001',
    content_id: 'media-321',
    content_type: 'media',
    content_title: 'Uploaded diagram: Chapter 5',
    content_excerpt: 'Image appears to contain copyrighted material without attribution...',
    flagged_by_gcid: 'gcid-learner-004',
    flagged_by_display_name: 'Sam Editor',
    flag_reason: 'Copyright violation: unlicensed stock image',
    status: 'pending',
    assigned_moderator_gcid: null,
    assigned_moderator_name: null,
    created_at: new Date(Date.now() - 14400000).toISOString(),
    updated_at: new Date(Date.now() - 14400000).toISOString(),
    resolved_at: null,
  },
  {
    id: 'flag-005',
    tenant_id: 'tenant-001',
    content_id: 'profile-654',
    content_type: 'profile',
    content_title: 'User Profile: bad_actor_99',
    content_excerpt: 'Profile bio contains offensive content and external links to phishing sites...',
    flagged_by_gcid: 'gcid-learner-005',
    flagged_by_display_name: 'Pat Observer',
    flag_reason: 'Offensive content and phishing links in bio',
    status: 'dismissed',
    assigned_moderator_gcid: 'gcid-mod-001',
    assigned_moderator_name: 'Moderator Kim',
    created_at: new Date(Date.now() - 172800000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    resolved_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

const MOCK_AUDIT_ENTRIES: ModerationAuditEntry[] = [
  {
    id: 'audit-001',
    flagged_content_id: 'flag-003',
    action: 'remove',
    moderator_gcid: 'gcid-mod-002',
    moderator_name: 'Moderator Lee',
    reason: 'Confirmed spam: commercial links violate community guidelines',
    notes: 'User has been warned previously. Escalating to governance if repeated.',
    created_at: new Date(Date.now() - 43200000).toISOString(),
  },
  {
    id: 'audit-002',
    flagged_content_id: 'flag-005',
    action: 'approve',
    moderator_gcid: 'gcid-mod-001',
    moderator_name: 'Moderator Kim',
    reason: 'False positive: reviewed bio content, no violations found after update',
    notes: null,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

function buildMockFlaggedContentResponse(
  status?: FlaggedContentStatus | null,
  contentType?: FlaggedContentType | null,
): FlaggedContentListResponse {
  let filtered = [...MOCK_FLAGGED_ITEMS];

  if (status) {
    filtered = filtered.filter((item) => item.status === status);
  }
  if (contentType) {
    filtered = filtered.filter((item) => item.content_type === contentType);
  }

  return {
    data: filtered,
    total: filtered.length,
    page: 1,
    page_size: 20,
  };
}
