/**
 * Admin-facing TypeScript interfaces for TopicNode management.
 * Source of truth: chora-contracts/openapi/creation-admin.yaml §TopicNode
 */

// ---------------------------------------------------------------------------
// Domain Entity
// ---------------------------------------------------------------------------

/**
 * Wire projection — EXACTLY what GET /api/v1/topics[/{id}] returns per node
 * (chora-creation `topic_handler.go` `topicNodeDTO`). Flat on the wire; the tree
 * is assembled client-side from `parent_id`. `tenant_id` is deliberately NOT on
 * the wire (implicit in the caller's context), so it is absent here too.
 */
export interface TopicNodeDTO {
  readonly id: string;
  readonly parent_id: string | null;
  readonly name: string;
  readonly sort_order: number;
  readonly created_at: string;
  readonly updated_at: string;
}

/** Client-built tree node: a wire DTO plus the `children` assembled from the flat list. */
export interface TopicNode extends TopicNodeDTO {
  children: TopicNode[];
  /** Optional atom tally — NOT returned by the topic-tree endpoint; absent unless a richer projection supplies it. */
  atom_count?: number;
}

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

export interface CreateTopicRequest {
  name: string;
  parent_id?: string | null;
  sort_order?: number;
}

export interface UpdateTopicRequest {
  name?: string;
  sort_order?: number;
}

/**
 * Reparent request. The backend `POST /topics/{id}/move` reads the JSON key
 * `parent_id` (null / absent => promote to root) and is cycle-guarded server-side.
 * Move changes ONLY the parent — reordering (`sort_order`) goes through PUT
 * /topics/{id}, so it is intentionally NOT part of this payload.
 */
export interface MoveTopicRequest {
  parent_id: string | null;
}

// ---------------------------------------------------------------------------
// Discriminated Union State
// ---------------------------------------------------------------------------

export type TopicTreeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; topics: TopicNode[] }
  | { status: 'error'; error: { code: string; message: string } };
