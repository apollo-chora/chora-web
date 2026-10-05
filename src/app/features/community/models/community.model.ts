/**
 * Community domain models for atom submissions, peer reviews, curation,
 * voting, comments, and contributor profiles.
 *
 * Source of truth: chora-contracts/openapi/community.yaml
 * Backend returns snake_case JSON — these interfaces match directly.
 */

// ---------------------------------------------------------------------------
// Enums / Literal Unions
// ---------------------------------------------------------------------------

export type AtomType = 'factoid' | 'concept' | 'procedure' | 'principle';

export type CommunityAtomStatus =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'revision_requested';

export type PeerReviewStatus = 'assigned' | 'approved' | 'rejected' | 'revision_requested';

export type ReviewDecision = 'approve' | 'reject' | 'revise';

export type CurationItemStatus = 'pending' | 'approved' | 'rejected';

export type VoteDirection = 'up' | 'down';

export type ContributorLevel = 'novice' | 'contributor' | 'reviewer' | 'curator' | 'expert';

// ---------------------------------------------------------------------------
// Community Atom
// ---------------------------------------------------------------------------

export interface CommunityAtom {
  id: string;
  tenant_id: string;
  contributor_gcid: string;
  title: string;
  content: string;
  atom_type: AtomType;
  status: CommunityAtomStatus;
  tags: string[];
  vote_score: number;
  promoted_atom_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface SubmitCommunityAtomRequest {
  title: string;
  content: string;
  atom_type: AtomType;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Peer Review
// ---------------------------------------------------------------------------

export interface PeerReview {
  id: string;
  tenant_id: string;
  community_atom_id: string;
  reviewer_gcid: string;
  status: PeerReviewStatus;
  feedback: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssignPeerReviewRequest {
  community_atom_id: string;
  reviewer_gcid: string;
}

export interface SubmitReviewDecisionRequest {
  decision: ReviewDecision;
  feedback?: string;
}

// ---------------------------------------------------------------------------
// Curation
// ---------------------------------------------------------------------------

export interface CurationQueueItem {
  id: string;
  tenant_id: string;
  community_atom_id: string;
  status: CurationItemStatus;
  peer_review_count: number;
  approve_count: number;
  reject_count: number;
  created_at: string;
}

export interface CurationDecisionRequest {
  approved: boolean;
  reason?: string;
}

export interface CurationDecision {
  id: string;
  tenant_id: string;
  curation_queue_id: string;
  moderator_gcid: string;
  approved: boolean;
  reason: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------------

export interface AtomVote {
  id: string;
  tenant_id: string;
  community_atom_id: string;
  voter_gcid: string;
  direction: VoteDirection;
  created_at: string;
}

export interface VoteRequest {
  direction: VoteDirection;
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export interface AtomComment {
  id: string;
  tenant_id: string;
  community_atom_id: string;
  author_gcid: string;
  body: string;
  parent_comment_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddCommentRequest {
  body: string;
  parent_comment_id?: string;
}

// ---------------------------------------------------------------------------
// Contributor Profile
// ---------------------------------------------------------------------------

export interface ContributorProfile {
  id: string;
  tenant_id: string;
  gcid: string;
  display_name: string;
  reputation_score: number;
  atoms_submitted: number;
  atoms_approved: number;
  reviews_completed: number;
  level: ContributorLevel;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALL_ATOM_TYPES: AtomType[] = [
  'factoid',
  'concept',
  'procedure',
  'principle',
];

export const ALL_COMMUNITY_ATOM_STATUSES: CommunityAtomStatus[] = [
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'revision_requested',
];

export const ALL_PEER_REVIEW_STATUSES: PeerReviewStatus[] = [
  'assigned',
  'approved',
  'rejected',
  'revision_requested',
];

export const ALL_CURATION_ITEM_STATUSES: CurationItemStatus[] = [
  'pending',
  'approved',
  'rejected',
];

export const ALL_VOTE_DIRECTIONS: VoteDirection[] = ['up', 'down'];

export const ALL_CONTRIBUTOR_LEVELS: ContributorLevel[] = [
  'novice',
  'contributor',
  'reviewer',
  'curator',
  'expert',
];

// ---------------------------------------------------------------------------
// Label Maps (i18n keys)
// ---------------------------------------------------------------------------

export const ATOM_TYPE_LABELS: Record<AtomType, string> = {
  factoid: 'community.atom_type_factoid',
  concept: 'community.atom_type_concept',
  procedure: 'community.atom_type_procedure',
  principle: 'community.atom_type_principle',
};

export const COMMUNITY_ATOM_STATUS_LABELS: Record<CommunityAtomStatus, string> = {
  submitted: 'community.status_submitted',
  under_review: 'community.status_under_review',
  approved: 'community.status_approved',
  rejected: 'community.status_rejected',
  revision_requested: 'community.status_revision_requested',
};

export const PEER_REVIEW_STATUS_LABELS: Record<PeerReviewStatus, string> = {
  assigned: 'community.review_status_assigned',
  approved: 'community.review_status_approved',
  rejected: 'community.review_status_rejected',
  revision_requested: 'community.review_status_revision_requested',
};

export const CURATION_ITEM_STATUS_LABELS: Record<CurationItemStatus, string> = {
  pending: 'community.curation_status_pending',
  approved: 'community.curation_status_approved',
  rejected: 'community.curation_status_rejected',
};

export const CONTRIBUTOR_LEVEL_LABELS: Record<ContributorLevel, string> = {
  novice: 'community.level_novice',
  contributor: 'community.level_contributor',
  reviewer: 'community.level_reviewer',
  curator: 'community.level_curator',
  expert: 'community.level_expert',
};

// ---------------------------------------------------------------------------
// Discriminated Union States
// ---------------------------------------------------------------------------

export type CommunityAtomListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; atoms: CommunityAtom[] }
  | { status: 'error'; error: { code: string; message: string } };

export type PeerReviewListState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; reviews: PeerReview[] }
  | { status: 'error'; error: { code: string; message: string } };

export type CurationQueueState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; items: CurationQueueItem[] }
  | { status: 'error'; error: { code: string; message: string } };

export type ContributorProfileState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; profile: ContributorProfile }
  | { status: 'error'; error: { code: string; message: string } };
