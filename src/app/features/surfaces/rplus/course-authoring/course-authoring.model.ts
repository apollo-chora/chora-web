/**
 * Course Authoring — model types (CJ#2, ADR-155-adjacent).
 *
 * Mirrors `chora-contracts/openapi/delivery-courses.yaml`.
 *
 * Lifecycle:
 *   DRAFT             → AWAITING_REVIEW   via /publish (instructor)
 *   AWAITING_REVIEW   → PUBLISHED         via /release (training-admin)
 *   AWAITING_REVIEW   → DRAFT             via /reject  (training-admin)
 *   PUBLISHED         → ARCHIVED          out-of-scope v1
 *
 * Owning team: 2 (Delivery). Surfaces: A+ (author), R+ (review/release).
 */

export type CourseState = 'DRAFT' | 'AWAITING_REVIEW' | 'PUBLISHED' | 'ARCHIVED';

/** The certificate a completed course awards (CHO-1795). */
export type CertType =
  | 'COMPLETION'
  | 'COMPETENCY'
  | 'ACCREDITED'
  | 'MICRO_CREDENTIAL';

/** Cert definition block on a course (mirrors the backend CourseCertification). */
export interface CourseCertification {
  readonly enabled: boolean;
  readonly cert_type?: CertType;
  readonly passing_score_pct?: number;
  readonly require_all_content?: boolean;
}

export const CERT_TYPES: readonly CertType[] = [
  'COMPLETION',
  'COMPETENCY',
  'ACCREDITED',
  'MICRO_CREDENTIAL',
];

export interface Course {
  readonly id: string;
  readonly tenant_id: string;
  readonly title: string;
  readonly description?: string;
  readonly state: CourseState;
  readonly author_gcid: string;
  readonly learning_objectives?: readonly string[];
  readonly prerequisites?: readonly string[];
  readonly test_set_ids: readonly string[];
  readonly instructor_gcids?: readonly string[];
  readonly price_sgd_cents?: number;
  readonly sf_eligible?: boolean;
  readonly scheduled_open_at?: string;
  readonly review_notes?: string;
  readonly published_at?: string;
  readonly certification?: CourseCertification;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CourseList {
  readonly items: readonly Course[];
  readonly next_cursor?: string;
}

// ── Request payloads ────────────────────────────────────────────────────────

export interface CreateCourseRequest {
  readonly title: string;
  readonly description?: string;
  readonly learning_objectives?: readonly string[];
  readonly prerequisites?: readonly string[];
  readonly test_set_ids: readonly string[];
  readonly certification?: CourseCertification;
}

export interface UpdateCourseRequest {
  readonly title?: string;
  readonly description?: string;
  readonly learning_objectives?: readonly string[];
  readonly prerequisites?: readonly string[];
  readonly test_set_ids?: readonly string[];
  readonly certification?: CourseCertification;
}

export interface ReleaseCourseRequest {
  readonly price_sgd_cents: number;
  readonly sf_eligible: boolean;
  readonly instructor_gcids: readonly string[];
  readonly scheduled_open_at?: string;
}

export interface RejectCourseRequest {
  readonly review_notes: string;
}

// ── UI-only state shapes ────────────────────────────────────────────────────

export type CourseEditorLoadState =
  | { status: 'loading' }
  | { status: 'success'; course: Course }
  | { status: 'error'; error: string };

export type CourseListLoadState =
  | { status: 'loading' }
  | { status: 'success'; courses: readonly Course[]; nextCursor?: string }
  | { status: 'error'; error: string };

export type CourseActionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success' }
  | { status: 'error'; error: string };

// SGD cent display helpers
export const SGD_CENTS_MIN = 0;
export const SGD_CENTS_DEFAULT = 99900; // SGD 999.00: directive doc demo value
