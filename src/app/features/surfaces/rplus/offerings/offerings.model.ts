/**
 * Offering model — R+ Four-Mode refactor (W2.C universal finder).
 *
 * An `Offering` is a delivery instance of a course under ONE Delivery bounded
 * context, with a `delivery_type` FSM (graduate / short / async) per the R+
 * four-mode refactor (project memory `project_rplus_four_mode_refactor_2026_06_24`).
 * The finder consumes the LIVE search projection from W2.A:
 *   GET /api/v1/search/offerings (chora-gateway → chora-delivery)
 *
 * Wire types are snake_case (`BackendOffering*`); the FE model is camelCase
 * (`Offering`). Mapping happens at the service boundary (`offerings.service.ts`)
 * — the same idiom as `exams.service.ts`. Fail-loud: no fixture fallback.
 */

import type { ExamSitting, SittingStatus } from '../exams/exams.model';

/** Delivery mode FSM discriminant. BE contract: `graduate|short|async`. */
export type OfferingDeliveryType = 'graduate' | 'short' | 'async';

/**
 * FE-synthesized delivery_type discriminant for exam sittings folded into the
 * unified R+ delivery finder (R3 nav de-shadow). Exam is a SEPARATE bounded
 * context: this token is deliberately NOT a member of `OfferingDeliveryType`,
 * which is consumed exhaustively by the offering workspace tab matrix
 * (`offering-workspace.tabs.ts`, `Record<OfferingDeliveryType, …>`) where exam
 * tabs are intentionally absent. It exists only to (a) badge the folded rows
 * (`deliveryTypeLabelKey('exam')`) and (b) branch their rowLink to the exam
 * workspace (`/r/exams/:id`). Typed `string` so an
 * `Offering.deliveryType === EXAM_DELIVERY_TYPE` comparison type-checks without
 * a literal-overlap error, and so the boundary cast in `mapExamSittingToOffering`
 * (`… as OfferingDeliveryType`) mirrors `mapBackendOffering`.
 */
export const EXAM_DELIVERY_TYPE: string = 'exam';

/** Offering lifecycle state. BE contract: DRAFT→LAUNCHED→RUNNING→CONCLUDED→ARCHIVED. */
export type OfferingState =
  | 'DRAFT'
  | 'LAUNCHED'
  | 'RUNNING'
  | 'CONCLUDED'
  | 'ARCHIVED';

/**
 * FSM transition action exposed by the workspace (W2.D). Each maps to a
 * `PATCH /api/v1/offerings/:id/{action}` sub-route with NO request body:
 *   launch   DRAFT    → LAUNCHED
 *   start    LAUNCHED → RUNNING
 *   conclude RUNNING  → CONCLUDED
 *   archive  any      → ARCHIVED (soft-delete; idempotent server-side)
 */
export type OfferingTransition = 'launch' | 'start' | 'conclude' | 'archive';

/** FE (camelCase) offering summary projection rendered by the finder. */
export interface Offering {
  readonly id: string;
  readonly tenantId: string;
  /**
   * Primary (first) course — kept for back-compat with consumers that read a
   * single course (the workspace). Offering→course is one-to-many; prefer
   * `courseIds` for the full set.
   */
  readonly courseId: string;
  /** Full set of courses this offering delivers (≥1). */
  readonly courseIds: readonly string[];
  readonly deliveryType: OfferingDeliveryType;
  readonly label: string;
  readonly capacity: number;
  readonly state: OfferingState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly launchedAt: string | null;
  readonly concludedAt: string | null;
  readonly archivedAt: string | null;
}

/** Wire (snake_case) offering row from the search endpoint. */
export interface BackendOffering {
  readonly id: string;
  readonly tenant_id: string;
  readonly course_id: string;
  /** Full course set (1:N). Optional — search/legacy projections may omit it. */
  readonly course_ids?: readonly string[];
  readonly delivery_type: string;
  readonly label: string;
  readonly capacity?: number;
  readonly state: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly launched_at?: string | null;
  readonly concluded_at?: string | null;
  readonly archived_at?: string | null;
  readonly deleted_at?: string | null;
}

/** Wire facet value bucket. */
export interface BackendFacetValue {
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

/** Wire facet dimension. */
export interface BackendFacet {
  readonly field: string;
  readonly values: readonly BackendFacetValue[];
}

/** Wire search page. */
export interface BackendOfferingSearchPage {
  readonly items: readonly BackendOffering[];
  readonly facets: readonly BackendFacet[];
  readonly next_cursor: string | null;
  readonly total_estimate: number;
}

// ── i18n key builders (single source of truth for badge cells + facet chips) ──

/** i18n key for a delivery_type value (badge cell + facet chip share this). */
export function deliveryTypeLabelKey(value: string): string {
  return `rplus.offerings.delivery_type_value.${value}`;
}

/** i18n key for a state value (badge cell + facet chip share this). */
export function stateLabelKey(value: string): string {
  return `rplus.offerings.state_value.${value}`;
}

/**
 * Map a facet value to its i18n key for the known offering facet dimensions.
 * An unknown field degrades to the raw token (the TranslatePipe returns the key
 * unchanged), keeping the boundary fail-soft for display while staying loud at
 * the data layer.
 */
export function offeringFacetValueLabelKey(field: string, value: string): string {
  if (field === 'delivery_type') {
    return deliveryTypeLabelKey(value);
  }
  if (field === 'state') {
    return stateLabelKey(value);
  }
  return value;
}

// ── W3.A: offering assessments + test-set picker ───────────────────────────

/**
 * Assessment lifecycle state (chora-delivery Assessment aggregate). The full
 * FSM; the FE renders a badge per value (`offeringAssessmentStateLabelKey`).
 */
export type OfferingAssessmentState =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'OPEN'
  | 'CLOSED'
  | 'GRADING'
  | 'GRADED'
  | 'RELEASED'
  | 'ARCHIVED';

/** FE (camelCase) assessment row attached to an offering (W3.A). */
export interface OfferingAssessment {
  readonly id: string;
  readonly offeringId: string;
  readonly testSetId: string;
  readonly title: string;
  readonly state: OfferingAssessmentState;
  readonly questionCount: number;
  readonly totalPoints: number;
  readonly scheduledOpenAt: string | null;
  readonly scheduledCloseAt: string | null;
  readonly createdAt: string;
}

/** Wire (snake_case) assessment row from `GET /offerings/:id/assessments`. */
export interface BackendOfferingAssessment {
  readonly assessment_id: string;
  readonly offering_id: string;
  readonly test_set_id: string;
  readonly title: string;
  readonly state: string;
  readonly question_count?: number;
  readonly total_points?: number;
  readonly scheduled_open_at?: string | null;
  readonly scheduled_close_at?: string | null;
  readonly created_at: string;
}

/** Cursor-paginated assessment list response. */
export interface BackendOfferingAssessmentPage {
  readonly items?: readonly BackendOfferingAssessment[];
  readonly next_page_token?: string | null;
}

/** FE (camelCase) light projection of a PUBLISHED test-set for the picker. */
export interface TestSetSummary {
  readonly id: string;
  readonly title: string;
  readonly state: string;
  readonly questionCount: number;
  readonly totalPoints: number;
}

/**
 * Wire (snake_case) test-set row from `GET /test-sets`. The aggregate key is
 * `test_set_id` (NOT `id`) — confirmed against the R+ assessment-instantiation
 * picker DTO (`delivery-test-sets.yaml` `TestSet`).
 */
export interface BackendTestSet {
  readonly test_set_id: string;
  readonly title: string;
  readonly state: string;
  readonly question_count?: number;
  readonly total_points?: number;
}

/** Cursor-paginated test-set list response. */
export interface BackendTestSetPage {
  readonly items?: readonly BackendTestSet[];
  readonly next_page_token?: string | null;
}

/** i18n key for an assessment state value (badge cell). */
export function offeringAssessmentStateLabelKey(value: string): string {
  return `rplus.offerings.workspace.assessments.state.${value}`;
}

/**
 * Map one wire assessment row to the FE model. `state` is cast to its union:
 * an unexpected token still renders (its badge i18n key resolves to the raw
 * token) rather than throwing and blanking the panel on a single odd row.
 */
export function mapBackendOfferingAssessment(
  a: BackendOfferingAssessment,
): OfferingAssessment {
  return {
    id: a.assessment_id,
    offeringId: a.offering_id,
    testSetId: a.test_set_id,
    title: a.title,
    state: a.state as OfferingAssessmentState,
    questionCount: a.question_count ?? 0,
    totalPoints: a.total_points ?? 0,
    scheduledOpenAt: a.scheduled_open_at ?? null,
    scheduledCloseAt: a.scheduled_close_at ?? null,
    createdAt: a.created_at,
  };
}

// ── W2.D: offering curriculum (read-only attached-course outline) ──────────

/** One content-outline row in a course's curriculum (FE camelCase). */
export interface OfferingCurriculumItem {
  readonly itemId: string;
  /** Content kind: atom|video|youtube|document|live_classroom|assessment. */
  readonly kind: string;
  /**
   * The item's reference: a UUID (atom/assessment/live_classroom) or an
   * http(s) URL (video/youtube/document). Included by the BE from S1 so the
   * editor can render + re-author the outline; '' on legacy rows that omit it.
   */
  readonly ref: string;
  readonly title: string;
  readonly position: number;
}

/** One attached course + its ordered content outline (FE camelCase). */
export interface OfferingCurriculumCourse {
  readonly id: string;
  readonly title: string;
  readonly items: readonly OfferingCurriculumItem[];
}

/** Wire (snake_case) content-outline row from `GET /offerings/:id/curriculum`. */
export interface BackendCurriculumItem {
  readonly item_id: string;
  readonly kind: string;
  readonly ref?: string;
  readonly title: string;
  readonly position?: number;
}

/** Wire (snake_case) attached-course row. */
export interface BackendCurriculumCourse {
  readonly id: string;
  readonly title?: string;
  readonly items?: readonly BackendCurriculumItem[];
}

/** Wire envelope for the curriculum read. */
export interface BackendOfferingCurriculum {
  readonly courses?: readonly BackendCurriculumCourse[];
}

/** i18n key for a content-item kind badge. */
export function curriculumKindLabelKey(kind: string): string {
  return `rplus.offerings.workspace.curriculum.kind.${kind}`;
}

// ── R+ Phase-2 W7 (WS-A) — Module course-structure types ────────────────────

/** A module's completion-requirement kinds (BE contract). */
export type ModuleRequirementKind = 'all_items' | 'n_of_m' | 'specific_items';

/** The requirement kinds a fresh module can be switched to from the UI. */
export const OFFERING_MODULE_REQUIREMENT_KINDS: readonly ModuleRequirementKind[] = [
  'all_items',
  'n_of_m',
];

/** One content-item membership entry of a module (FE camelCase). */
export interface OfferingModuleItem {
  readonly itemId: string;
  readonly contentItemId: string;
  readonly position: number;
}

/** A module's completion rule (FE camelCase). */
export interface OfferingModuleRequirement {
  readonly kind: ModuleRequirementKind;
  readonly thresholdN: number;
  readonly requiredItemIds: readonly string[];
}

/**
 * A course-structure Module: an ordered group of content-item references within
 * a course, plus a completion Requirement. Groups the flat curriculum items S1
 * authors; a ModuleItem references a course_content item by its item id.
 */
export interface OfferingModule {
  readonly id: string;
  readonly courseId: string;
  readonly title: string;
  readonly position: number;
  readonly requirement: OfferingModuleRequirement;
  readonly items: readonly OfferingModuleItem[];
}

/** Wire (snake_case) module-item row. */
export interface BackendModuleItem {
  readonly item_id: string;
  readonly content_item_id: string;
  readonly position?: number;
}

/** Wire (snake_case) module requirement. */
export interface BackendModuleRequirement {
  readonly kind?: string;
  readonly threshold_n?: number;
  readonly required_item_ids?: readonly string[];
}

/** Wire (snake_case) module row from the module routes. */
export interface BackendModule {
  readonly id: string;
  readonly course_id: string;
  readonly title?: string;
  readonly position?: number;
  readonly requirement?: BackendModuleRequirement;
  readonly items?: readonly BackendModuleItem[];
}

/** Wire envelope for `GET /offerings/:id/modules?course_id=`. */
export interface BackendModuleList {
  readonly course_id?: string;
  readonly modules?: readonly BackendModule[];
}

/** Map a wire module (snake_case) to the FE camelCase model. */
export function mapBackendModule(m: BackendModule): OfferingModule {
  return {
    id: m.id,
    courseId: m.course_id,
    title: m.title ?? '',
    position: m.position ?? 0,
    requirement: {
      kind: (m.requirement?.kind as ModuleRequirementKind) ?? 'all_items',
      thresholdN: m.requirement?.threshold_n ?? 0,
      requiredItemIds: m.requirement?.required_item_ids ?? [],
    },
    items: (m.items ?? []).map((it) => ({
      itemId: it.item_id,
      contentItemId: it.content_item_id,
      position: it.position ?? 0,
    })),
  };
}

/** Map the wire module-list envelope to the FE model array. */
export function mapBackendModuleList(l: BackendModuleList): readonly OfferingModule[] {
  return (l.modules ?? []).map(mapBackendModule);
}

// ── R+ Phase-2 W7 (WS-A) — Module progress read (CHO-2074, instructor cohort) ──

/** One learner's completion of a module (FE camelCase). */
export interface OfferingModuleLearnerProgress {
  readonly gcid: string;
  readonly completedCount: number;
  readonly isComplete: boolean;
  readonly completedAt?: string;
}

/**
 * A module's cohort completion roll-up (instructor view of
 * `GET /offerings/:id/modules/progress`). `completeCount` is the number of
 * learners with is_complete=true (the "N"); `total` is the module's item count.
 */
export interface OfferingModuleProgress {
  readonly moduleId: string;
  readonly title: string;
  readonly position: number;
  readonly total: number;
  readonly requirement: OfferingModuleRequirement;
  readonly learners: readonly OfferingModuleLearnerProgress[];
  readonly completeCount: number;
}

/** Wire (snake_case) per-learner module progress row. */
export interface BackendModuleLearnerProgress {
  readonly gcid?: string;
  readonly completed_count?: number;
  readonly is_complete?: boolean;
  readonly completed_at?: string;
}

/** Wire (snake_case) per-module cohort progress row. */
export interface BackendModuleProgress {
  readonly module_id?: string;
  readonly title?: string;
  readonly position?: number;
  readonly total?: number;
  readonly requirement?: BackendModuleRequirement;
  readonly learners?: readonly BackendModuleLearnerProgress[];
}

/** Wire envelope for `GET /offerings/:id/modules/progress?course_id=`. */
export interface BackendModuleProgressList {
  readonly course_id?: string;
  readonly viewer_role?: string;
  readonly modules?: readonly BackendModuleProgress[];
}

/** Map a wire cohort-progress module to the FE model (computing completeCount). */
export function mapBackendModuleProgress(m: BackendModuleProgress): OfferingModuleProgress {
  const learners = (m.learners ?? []).map((l) => ({
    gcid: l.gcid ?? '',
    completedCount: l.completed_count ?? 0,
    isComplete: l.is_complete ?? false,
    completedAt: l.completed_at,
  }));
  return {
    moduleId: m.module_id ?? '',
    title: m.title ?? '',
    position: m.position ?? 0,
    total: m.total ?? 0,
    requirement: {
      kind: (m.requirement?.kind as ModuleRequirementKind) ?? 'all_items',
      thresholdN: m.requirement?.threshold_n ?? 0,
      requiredItemIds: m.requirement?.required_item_ids ?? [],
    },
    learners,
    completeCount: learners.filter((l) => l.isComplete).length,
  };
}

/** Map the wire progress-list envelope to the FE model array. */
export function mapBackendModuleProgressList(l: BackendModuleProgressList): readonly OfferingModuleProgress[] {
  return (l.modules ?? []).map(mapBackendModuleProgress);
}

/**
 * The 6 content-item kinds, in add-form order (single source of truth). BE
 * contract: `atom|video|youtube|document|live_classroom|assessment`.
 */
export const OFFERING_CURRICULUM_KINDS: readonly string[] = [
  'atom',
  'video',
  'youtube',
  'document',
  'live_classroom',
  'assessment',
];

/** Kinds whose `ref` is a UUID (the rest take an http(s) URL). */
const CURRICULUM_UUID_KINDS: ReadonlySet<string> = new Set<string>([
  'atom',
  'assessment',
  'live_classroom',
]);

/**
 * Whether a kind's `ref` is a UUID (atom/assessment/live_classroom) vs an
 * http(s) URL (video/youtube/document). Drives the editor's ref hint/placeholder;
 * the BE is the authority and 400s on a bad ref for the kind.
 */
export function curriculumKindRefIsUuid(kind: string): boolean {
  return CURRICULUM_UUID_KINDS.has(kind);
}

/** Map one wire content-outline row to the FE model (shared read + write). */
function mapCurriculumItem(it: BackendCurriculumItem): OfferingCurriculumItem {
  return {
    itemId: it.item_id,
    kind: it.kind,
    ref: it.ref ?? '',
    title: it.title,
    position: it.position ?? 0,
  };
}

/**
 * Map the wire curriculum envelope to the FE course list. Sparse rows degrade
 * defensively (missing title → empty string; missing items → empty array) so a
 * single odd row never blanks the panel — the read is fail-soft for display
 * while the service stays fail-loud on transport errors.
 */
export function mapBackendOfferingCurriculum(
  resp: BackendOfferingCurriculum,
): readonly OfferingCurriculumCourse[] {
  return (resp.courses ?? []).map((c) => ({
    id: c.id,
    title: c.title ?? '',
    items: (c.items ?? []).map(mapCurriculumItem),
  }));
}

// ── R+ Phase-2 S1: offering curriculum authoring (write) ───────────────────

/**
 * One attached course's freshly-mutated outline, returned by each curriculum
 * WRITE (add / reorder / remove). The BE returns just the affected course
 * (`{ course_id, items }`), NOT the whole `{ courses }` envelope — the editor
 * splices these items back into the matching course row without a re-GET.
 */
export interface OfferingCurriculumCourseOutline {
  readonly courseId: string;
  readonly items: readonly OfferingCurriculumItem[];
}

/** Wire (snake_case) single-course outline from a curriculum write endpoint. */
export interface BackendCurriculumCourseOutline {
  readonly course_id: string;
  readonly items?: readonly BackendCurriculumItem[];
}

/**
 * Map the wire single-course write response to the FE outline. Sparse items
 * degrade defensively (missing items → empty array) — fail-soft for display,
 * while the service stays fail-loud on transport errors.
 */
export function mapBackendCurriculumCourseOutline(
  resp: BackendCurriculumCourseOutline,
): OfferingCurriculumCourseOutline {
  return {
    courseId: resp.course_id,
    items: (resp.items ?? []).map(mapCurriculumItem),
  };
}

// ── W2.D: offering certification (read-only attached-course cert config) ────

/** One certification-config entry a course awards on completion (FE camelCase). */
export interface OfferingCertConfig {
  readonly enabled: boolean;
  /** Cert kind: COMPLETION|COMPETENCY|ACCREDITED|MICRO_CREDENTIAL (or '' if unset). */
  readonly certType: string;
  readonly passingScorePct: number;
  readonly requireAllContent: boolean;
}

/** One attached course + the cert config it awards (FE camelCase). */
export interface OfferingCertificationCourse {
  readonly id: string;
  readonly title: string;
  /** 0..N cert configs — empty when the course awards no certificate. */
  readonly certifications: readonly OfferingCertConfig[];
}

/** Wire (snake_case) cert-config row from `GET /offerings/:id/certification`. */
export interface BackendCertConfig {
  readonly enabled?: boolean;
  readonly cert_type?: string;
  readonly passing_score_pct?: number;
  readonly require_all_content?: boolean;
}

/** Wire (snake_case) attached-course row. */
export interface BackendCertificationCourse {
  readonly id: string;
  readonly title?: string;
  readonly certifications?: readonly BackendCertConfig[];
}

/** Wire envelope for the certification read. */
export interface BackendOfferingCertification {
  readonly courses?: readonly BackendCertificationCourse[];
  /** Present only when an offering-level completion policy has been set (S2). */
  readonly completion_policy?: BackendOfferingCompletionPolicy;
}

/** i18n key for a cert-type label badge (COMPLETION/COMPETENCY/…). */
export function certTypeLabelKey(certType: string): string {
  return `rplus.offerings.workspace.certification.type.${certType}`;
}

/**
 * Map the wire certification envelope to the FE course list. Sparse rows degrade
 * defensively (missing title → empty string; missing certifications → empty
 * array; missing cert fields → zero-values) so a single odd row never blanks the
 * panel — the read is fail-soft for display while the service stays fail-loud on
 * transport errors.
 */
export function mapBackendOfferingCertification(
  resp: BackendOfferingCertification,
): readonly OfferingCertificationCourse[] {
  return (resp.courses ?? []).map((c) => ({
    id: c.id,
    title: c.title ?? '',
    certifications: (c.certifications ?? []).map((cfg) => ({
      enabled: cfg.enabled ?? false,
      certType: cfg.cert_type ?? '',
      passingScorePct: cfg.passing_score_pct ?? 0,
      requireAllContent: cfg.require_all_content ?? false,
    })),
  }));
}

// ── R+ Phase-2 S2: offering-level completion policy (editable, CHO-2054) ────

/**
 * The editable, offering-level completion policy layered on top of the per-course
 * cert config (which stays read-only). "cert = policy on top" — this is the
 * delivery decision (does THIS offering award a certificate, at what score,
 * under what title). `updatedAt` is '' until the policy is first set. (FE camelCase.)
 */
export interface OfferingCompletionPolicy {
  readonly awardsCertificate: boolean;
  readonly passingScorePct: number;
  readonly certTitle: string;
  /** RFC3339 last-saved timestamp; '' when never set. */
  readonly updatedAt: string;
}

/** Wire (snake_case) completion-policy row from GET/PATCH `/certification`. */
export interface BackendOfferingCompletionPolicy {
  readonly awards_certificate?: boolean;
  readonly passing_score_pct?: number;
  readonly cert_title?: string;
  readonly updated_at?: string;
}

/**
 * Map the wire completion policy to the FE model. Sparse optional fields degrade
 * defensively (missing flag → false; missing score → 0; missing title/timestamp
 * → '') — fail-soft for display while the service stays fail-loud on transport
 * errors.
 */
export function mapBackendOfferingCompletionPolicy(
  p: BackendOfferingCompletionPolicy,
): OfferingCompletionPolicy {
  return {
    awardsCertificate: p.awards_certificate ?? false,
    passingScorePct: p.passing_score_pct ?? 0,
    certTitle: p.cert_title ?? '',
    updatedAt: p.updated_at ?? '',
  };
}

/**
 * The Certification tab's read projection: the read-only per-course cert config
 * PLUS the editable offering-level completion policy (`null` until first set).
 * The BE returns both in ONE `GET /certification` payload, so the FE surfaces
 * both from a single fetch (no second round-trip).
 */
export interface OfferingCertification {
  readonly courses: readonly OfferingCertificationCourse[];
  readonly completionPolicy: OfferingCompletionPolicy | null;
}

/**
 * Map the wire certification envelope to the FE projection (courses + optional
 * completion policy). The policy is `null` when the BE omits it (never set) — a
 * clean, honest absence rather than a fabricated default.
 */
export function mapBackendOfferingCertificationEnvelope(
  resp: BackendOfferingCertification,
): OfferingCertification {
  return {
    courses: mapBackendOfferingCertification(resp),
    completionPolicy: resp.completion_policy
      ? mapBackendOfferingCompletionPolicy(resp.completion_policy)
      : null,
  };
}

// ── R+ per-offering MANUAL certificate issuance ─────────────────────────────

/**
 * The 201 result of a MANUAL per-offering certificate issue (FE camelCase). The
 * WIRED auto-issue lane fires on assessment release; THIS is the admin's
 * explicit "issue now" action for one enrolled learner. The credential itself
 * is the durable Certification; this DTO just confirms which one was minted.
 */
export interface OfferingCertificateIssued {
  readonly certificationId: string;
  readonly courseId: string;
  readonly gcid: string;
}

/** Wire (snake_case) 201 body from `POST /offerings/:id/certification/issue`. */
export interface BackendOfferingCertificateIssued {
  readonly certification_id?: string;
  readonly course_id?: string;
  readonly gcid?: string;
}

/**
 * Map the wire issue result to the FE model. Sparse optional fields degrade
 * defensively to empty strings — fail-soft for display while the service stays
 * fail-loud on transport errors (a 409 duplicate propagates, never mapped here).
 */
export function mapBackendOfferingCertificateIssued(
  resp: BackendOfferingCertificateIssued,
): OfferingCertificateIssued {
  return {
    certificationId: resp.certification_id ?? '',
    courseId: resp.course_id ?? '',
    gcid: resp.gcid ?? '',
  };
}

// ── W7: offering sections (intra-cohort sub-groups of a graduate offering) ──

/** One intra-cohort Section a graduate offering is divided into (FE camelCase). */
export interface OfferingSection {
  readonly sectionId: string;
  readonly name: string;
  /** Opaque lead-instructor GCID (no FK); '' when unassigned. */
  readonly leadInstructorGcid: string;
  readonly room: string;
  /** ISO-8601 delivery-window dates (YYYY-MM-DD); '' when unset. */
  readonly startDate: string;
  readonly endDate: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Wire (snake_case) section row from `GET /offerings/:id/sections`. */
export interface BackendOfferingSection {
  readonly section_id: string;
  readonly name: string;
  readonly lead_instructor_gcid?: string;
  readonly room?: string;
  readonly start_date?: string;
  readonly end_date?: string;
  readonly created_at?: string;
  readonly updated_at?: string;
}

/** Wire envelope for the sections read. */
export interface BackendOfferingSections {
  readonly sections?: readonly BackendOfferingSection[];
}

/**
 * Map one wire section row to the FE model. Sparse optional fields degrade
 * defensively to empty strings so a single odd row never blanks the panel — the
 * read is fail-soft for display while the service stays fail-loud on transport
 * errors.
 */
export function mapBackendOfferingSection(s: BackendOfferingSection): OfferingSection {
  return {
    sectionId: s.section_id,
    name: s.name,
    leadInstructorGcid: s.lead_instructor_gcid ?? '',
    room: s.room ?? '',
    startDate: s.start_date ?? '',
    endDate: s.end_date ?? '',
    createdAt: s.created_at ?? '',
    updatedAt: s.updated_at ?? '',
  };
}

// ── W7: offering roster (read-only per-course learner roster) ───────────────

/** One learner row on an attached course's roster (FE camelCase). */
export interface OfferingRosterLearner {
  readonly gcid: string;
  /** Display name; falls back to the GCID while the identity projection is unwired. */
  readonly displayName: string;
  /** AtomAttempt progress proxy in [0,100]; 0 while the consumption projection is unwired. */
  readonly progressPct: number;
  /** RFC3339 enrolment timestamp. */
  readonly enrolledAt: string;
}

/** One attached course + its learner roster (FE camelCase). */
export interface OfferingRosterCourse {
  readonly id: string;
  readonly title: string;
  readonly learners: readonly OfferingRosterLearner[];
  readonly learnerCount: number;
}

/** The offering roster projection: per-course rosters + a distinct people count. */
export interface OfferingRoster {
  readonly courses: readonly OfferingRosterCourse[];
  /** Unique learners across all attached courses (a learner in two courses counts once). */
  readonly distinctLearnerCount: number;
}

/** Wire (snake_case) learner row from `GET /offerings/:id/roster`. */
export interface BackendRosterLearner {
  readonly gcid?: string;
  readonly display_name?: string;
  readonly progress_pct?: number;
  readonly enrolled_at?: string;
}

/** Wire (snake_case) attached-course roster row. */
export interface BackendRosterCourse {
  readonly id: string;
  readonly title?: string;
  readonly learners?: readonly BackendRosterLearner[];
  readonly learner_count?: number;
}

/** Wire envelope for the roster read. */
export interface BackendOfferingRoster {
  readonly courses?: readonly BackendRosterCourse[];
  readonly distinct_learner_count?: number;
}

/**
 * Map the wire roster envelope to the FE projection. Sparse rows degrade
 * defensively (missing title → ''; missing learners → []; missing counts →
 * derived/0) so a single odd row never blanks the panel — the read is fail-soft
 * for display while the service stays fail-loud on transport errors.
 */
export function mapBackendOfferingRoster(resp: BackendOfferingRoster): OfferingRoster {
  const courses = (resp.courses ?? []).map((c) => {
    const learners = (c.learners ?? []).map((l) => ({
      gcid: l.gcid ?? '',
      displayName: l.display_name ?? l.gcid ?? '',
      progressPct: l.progress_pct ?? 0,
      enrolledAt: l.enrolled_at ?? '',
    }));
    return {
      id: c.id,
      title: c.title ?? '',
      learners,
      learnerCount: c.learner_count ?? learners.length,
    };
  });
  return {
    courses,
    distinctLearnerCount: resp.distinct_learner_count ?? 0,
  };
}

// ── R+ Phase-2 S3: admin enrol a learner into an attached course (CHO-2053) ─

/** One enrolment freshly created by the admin-enrol action (FE camelCase). */
export interface OfferingEnrollment {
  readonly enrollmentId: string;
  readonly courseId: string;
  readonly gcid: string;
  /** Enrolment lifecycle status echoed by the BE (kept string-open for display). */
  readonly status: string;
  /** RFC3339 enrolment timestamp. */
  readonly enrolledAt: string;
}

/** Wire (snake_case) row from `POST /offerings/:id/roster` (201). */
export interface BackendOfferingEnrollment {
  readonly enrollment_id?: string;
  readonly course_id?: string;
  readonly gcid?: string;
  readonly status?: string;
  readonly enrolled_at?: string;
}

/**
 * Map the wire enrolment row to the FE model. Sparse optional fields degrade
 * defensively to empty strings — fail-soft for display while the service stays
 * fail-loud on transport errors.
 */
export function mapBackendOfferingEnrollment(
  e: BackendOfferingEnrollment,
): OfferingEnrollment {
  return {
    enrollmentId: e.enrollment_id ?? '',
    courseId: e.course_id ?? '',
    gcid: e.gcid ?? '',
    status: e.status ?? '',
    enrolledAt: e.enrolled_at ?? '',
  };
}

// ── Issue 4b: atomic bulk enrol (many learners in one all-or-nothing POST) ──

/** Request to bulk-enrol many learners (by GCID) into one attached course. */
export interface BulkEnrolLearnersRequest {
  readonly courseId: string;
  readonly gcids: readonly string[];
}

/** Result of an atomic bulk enrol (FE camelCase). */
export interface BulkEnrolResult {
  readonly courseId: string;
  /** Distinct gcids the BE accepted after de-dup. */
  readonly requestedCount: number;
  /** Newly enrolled (fresh or revived); excludes already-active learners. */
  readonly insertedCount: number;
  readonly enrollmentIds: readonly string[];
}

/** Wire (snake_case) result from `POST /offerings/:id/roster/bulk` (201). */
export interface BackendBulkEnrolResult {
  readonly course_id?: string;
  readonly requested_count?: number;
  readonly inserted_count?: number;
  readonly enrollment_ids?: readonly string[];
}

/** Map the wire bulk-enrol result to the FE model (fail-soft optionals). */
export function mapBackendBulkEnrolResult(
  r: BackendBulkEnrolResult,
): BulkEnrolResult {
  return {
    courseId: r.course_id ?? '',
    requestedCount: r.requested_count ?? 0,
    insertedCount: r.inserted_count ?? 0,
    enrollmentIds: r.enrollment_ids ?? [],
  };
}

// ── W7: offering analytics (read-only delivery-local roll-up, async tab) ────

/** One attached-course analytics row (FE camelCase). */
export interface OfferingAnalyticsCourse {
  readonly id: string;
  readonly title: string;
  readonly enrollments: number;
  /** Mean progress across ENROLLED learners; null when nobody is enrolled. */
  readonly avgProgressPct: number | null;
  /** Share of enrolled learners who finished; null when nobody is enrolled. */
  readonly completionRatePct: number | null;
  readonly completedLearners: number;
}

/** The offering analytics roll-up (FE camelCase). */
export interface OfferingAnalytics {
  readonly state: string;
  readonly capacity: number;
  readonly capacityUnbounded: boolean;
  /** null when unbounded (capacity 0); else round(distinct/capacity*100). */
  readonly capacityUtilisationPct: number | null;
  readonly totalEnrollments: number;
  readonly distinctLearners: number;
  readonly assessmentCount: number;
  /**
   * Mean progress across every enrolled learner in the offering, or null when
   * the offering has no enrolments. null is NOT 0 — "nobody has made progress"
   * and "there is nobody" are different facts, and the BE deliberately
   * distinguishes them (CHO-1827). Render null as "N/A", never as 0%.
   */
  readonly avgProgressPct: number | null;
  /** Share of enrolled learners who completed; null when nobody is enrolled. */
  readonly completionRatePct: number | null;
  readonly completedEnrollments: number;
  readonly launchedAt: string | null;
  readonly concludedAt: string | null;
  readonly courses: readonly OfferingAnalyticsCourse[];
}

/** Wire (snake_case) attached-course analytics row. */
export interface BackendAnalyticsCourse {
  readonly id: string;
  readonly title?: string;
  readonly enrollments?: number;
  readonly avg_progress_pct?: number | null;
  readonly completion_rate_pct?: number | null;
  readonly completed_learners?: number;
}

/** Wire (snake_case) envelope from `GET /offerings/:id/analytics`. */
export interface BackendOfferingAnalytics {
  readonly state?: string;
  readonly capacity?: number;
  readonly capacity_unbounded?: boolean;
  readonly capacity_utilisation_pct?: number | null;
  readonly total_enrollments?: number;
  readonly distinct_learners?: number;
  readonly assessment_count?: number;
  readonly avg_progress_pct?: number | null;
  readonly completion_rate_pct?: number | null;
  readonly completed_enrollments?: number;
  readonly launched_at?: string | null;
  readonly concluded_at?: string | null;
  readonly courses?: readonly BackendAnalyticsCourse[];
}

/**
 * Map the wire analytics envelope to the FE projection. Sparse fields degrade
 * defensively (missing counts → 0; missing utilisation → null; missing courses
 * → []) so a single odd field never blanks the panel — fail-soft for display
 * while the service stays fail-loud on transport errors.
 *
 * RATE fields are the exception to "missing → 0": avg_progress_pct and
 * completion_rate_pct degrade to null, because 0% is a CLAIM ("this cohort has
 * learned nothing") while null is the absence of one. The BE already refuses to
 * conflate the two (it returns null, not 0, for an offering with no enrolments);
 * `?? null` keeps that distinction intact through the mapper. Note `??` only
 * fires on null/undefined, so a genuine 0% still maps to 0.
 */
export function mapBackendOfferingAnalytics(resp: BackendOfferingAnalytics): OfferingAnalytics {
  return {
    state: resp.state ?? '',
    capacity: resp.capacity ?? 0,
    capacityUnbounded: resp.capacity_unbounded ?? (resp.capacity ?? 0) === 0,
    capacityUtilisationPct: resp.capacity_utilisation_pct ?? null,
    totalEnrollments: resp.total_enrollments ?? 0,
    distinctLearners: resp.distinct_learners ?? 0,
    assessmentCount: resp.assessment_count ?? 0,
    avgProgressPct: resp.avg_progress_pct ?? null,
    completionRatePct: resp.completion_rate_pct ?? null,
    completedEnrollments: resp.completed_enrollments ?? 0,
    launchedAt: resp.launched_at ?? null,
    concludedAt: resp.concluded_at ?? null,
    courses: (resp.courses ?? []).map((c) => ({
      id: c.id,
      title: c.title ?? '',
      enrollments: c.enrollments ?? 0,
      avgProgressPct: c.avg_progress_pct ?? null,
      completionRatePct: c.completion_rate_pct ?? null,
      completedLearners: c.completed_learners ?? 0,
    })),
  };
}

// ── CHO-1985: offering schedule (delivery sessions; list + create, short) ───

/** One scheduled delivery session of a short-course offering (FE camelCase). */
export interface OfferingSession {
  readonly id: string;
  readonly title: string;
  /**
   * Stable id of the booked Room (CHO-2191 ratified gate). '' when roomless.
   * A room is booked by room_id ONLY — the picker sends it; free text is 400.
   */
  readonly roomId: string;
  /** Display name of the booked Room (derived server-side from the Room). */
  readonly room: string;
  /** Opaque instructor GCID (no FK); '' when unassigned. */
  readonly instructorGcid: string;
  /** RFC3339 session window bounds. */
  readonly startsAt: string;
  readonly endsAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Wire (snake_case) session row from `GET /offerings/:id/schedule`. */
export interface BackendOfferingSession {
  readonly id: string;
  readonly title: string;
  readonly room_id?: string;
  readonly room?: string;
  readonly instructor_gcid?: string;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly created_at?: string;
  readonly updated_at?: string;
}

/** Wire envelope for the schedule read (`{ sessions: [...] }`, ordered by starts_at). */
export interface BackendOfferingSchedule {
  readonly sessions?: readonly BackendOfferingSession[];
}

/**
 * Map one wire session row to the FE model. Sparse optional fields degrade
 * defensively to empty strings so a single odd row never blanks the panel — the
 * read is fail-soft for display while the service stays fail-loud on transport
 * errors.
 */
export function mapBackendOfferingSession(s: BackendOfferingSession): OfferingSession {
  return {
    id: s.id,
    title: s.title,
    roomId: s.room_id ?? '',
    room: s.room ?? '',
    instructorGcid: s.instructor_gcid ?? '',
    startsAt: s.starts_at ?? '',
    endsAt: s.ends_at ?? '',
    createdAt: s.created_at ?? '',
    updatedAt: s.updated_at ?? '',
  };
}

// CHO-2191 rooms, CHO-2294: the room types now live in the rooms lane
// (../rooms/rooms.model) so the Schedule-tab picker and the Campus Operations
// rooms screen share ONE definition. Re-exported here so existing importers of
// offerings.model keep working unchanged.
export {
  mapBackendRoom,
  type BackendRoom,
  type BackendRoomsList,
  type CreateRoomRequest,
  type RoomOption,
} from '../rooms/rooms.model';

// ── CHO-1986: offering attendance (session-scoped records; mark + list) ─────

/** Attendance mark status (chora-delivery). The 4 sanctioned values. */
export type OfferingAttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

/** The 4 attendance statuses, in mark-form order (single source of truth). */
export const OFFERING_ATTENDANCE_STATUSES: readonly OfferingAttendanceStatus[] = [
  'present',
  'absent',
  'late',
  'excused',
];

/** One attendance record for a learner in one delivery session (FE camelCase). */
export interface OfferingAttendanceRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly gcid: string;
  /** One of OfferingAttendanceStatus (kept string-open for fail-soft display). */
  readonly status: string;
  /** How it was captured: `qr-scan` | `manual` (or '' when unset). */
  readonly source: string;
  readonly recordedAt: string;
}

/** Wire (snake_case) record row from `GET /offerings/:id/attendance/:sid` (CHO-2186). */
export interface BackendAttendanceRecord {
  readonly id: string;
  readonly session_id: string;
  readonly gcid: string;
  readonly status: string;
  readonly source?: string;
  readonly recorded_at?: string;
}

/** Wire envelope for the attendance read (`{ records: [...] }`). */
export interface BackendOfferingAttendance {
  readonly records?: readonly BackendAttendanceRecord[];
}

/** i18n key for an attendance-status label (badge cell + mark-form option). */
export function attendanceStatusLabelKey(status: string): string {
  return `rplus.offerings.workspace.attendance.status.${status}`;
}

/**
 * Map one wire attendance record to the FE model. Sparse optional fields degrade
 * defensively to empty strings so a single odd row never blanks the panel — the
 * read is fail-soft for display while the service stays fail-loud on transport
 * errors.
 */
export function mapBackendAttendanceRecord(
  r: BackendAttendanceRecord,
): OfferingAttendanceRecord {
  return {
    id: r.id,
    sessionId: r.session_id,
    gcid: r.gcid,
    status: r.status,
    source: r.source ?? '',
    recordedAt: r.recorded_at ?? '',
  };
}

// ── CHO-1987: offering publish / catalog handoff (read + action, async) ─────

/** One attached course + its catalog-visibility state (FE camelCase). */
export interface OfferingPublishCourse {
  readonly id: string;
  readonly title: string;
  /** Catalog visibility: `public` | `private` | `draft` (or '' when unset). */
  readonly visibility: string;
  readonly published: boolean;
}

/** The publish/catalog-handoff projection: the attached courses + a publish tally. */
export interface OfferingPublishState {
  readonly courses: readonly OfferingPublishCourse[];
  /** Courses transitioned to public by the last PATCH (0 for the initial GET). */
  readonly publishedCount: number;
}

/** Wire (snake_case) course row from `GET/PATCH /offerings/:id/publish`. */
export interface BackendPublishCourse {
  readonly id: string;
  readonly title?: string;
  readonly visibility?: string;
  readonly published?: boolean;
}

/** Wire envelope for the publish read + action (`{ courses, published_count? }`). */
export interface BackendOfferingPublish {
  readonly courses?: readonly BackendPublishCourse[];
  readonly published_count?: number;
}

/** i18n key for a catalog-visibility badge (public/private/draft). */
export function offeringPublishVisibilityLabelKey(visibility: string): string {
  return `rplus.offerings.workspace.publish.visibility.${visibility}`;
}

/**
 * Map the wire publish envelope to the FE projection. Sparse rows degrade
 * defensively (missing title → ''; missing visibility → ''; missing published →
 * false; missing count → 0) so a single odd row never blanks the panel — the
 * read is fail-soft for display while the service stays fail-loud on transport
 * errors.
 */
export function mapBackendOfferingPublish(
  resp: BackendOfferingPublish,
): OfferingPublishState {
  return {
    courses: (resp.courses ?? []).map((c) => ({
      id: c.id,
      title: c.title ?? '',
      visibility: c.visibility ?? '',
      published: c.published ?? false,
    })),
    publishedCount: resp.published_count ?? 0,
  };
}

// ── ADR-226: offering prerequisites (structured course→course DAG + notes) ──

/**
 * Prerequisite edge kind. BE contract: `hard_gate|advisory` (ADR-226 §1).
 * `hard_gate` = intended to block enrol/start once enforced (enforcement is
 * DEFERRED — ADR-226 §4); `advisory` = shown, never blocks.
 */
export type PrerequisiteKind = 'hard_gate' | 'advisory';

/** The 2 prerequisite kinds, in add-form order (single source of truth). */
export const OFFERING_PREREQUISITE_KINDS: readonly PrerequisiteKind[] = [
  'hard_gate',
  'advisory',
];

/**
 * One structured prerequisite edge on a course, with the resolved TARGET
 * course title (the BE best-effort resolves it; '' when unresolvable). FE
 * camelCase.
 */
export interface OfferingPrerequisiteEdge {
  readonly prerequisiteCourseId: string;
  readonly prerequisiteCourseTitle: string;
  readonly kind: PrerequisiteKind;
}

/** Wire (snake_case) edge row shared by the read + both write endpoints. */
export interface BackendPrerequisiteEdge {
  readonly prerequisite_course_id: string;
  readonly prerequisite_course_title?: string;
  readonly kind: string;
}

/**
 * One attached course + its structured prerequisite edges + its free-text
 * `PrerequisiteNotes` (non-lossy legacy field, ADR-226 §1; author-supplied,
 * never validated against the catalogue). FE camelCase.
 */
export interface OfferingPrerequisiteCourse {
  readonly id: string;
  readonly title: string;
  readonly prerequisiteNotes: readonly string[];
  readonly prerequisites: readonly OfferingPrerequisiteEdge[];
}

/** Wire (snake_case) attached-course row from `GET /offerings/:id/prerequisites`. */
export interface BackendPrerequisiteCourse {
  readonly course_id: string;
  readonly title?: string;
  readonly prerequisite_notes?: readonly string[];
  readonly prerequisites?: readonly BackendPrerequisiteEdge[];
}

/** Wire envelope for the prerequisites read. */
export interface BackendOfferingPrerequisites {
  readonly courses?: readonly BackendPrerequisiteCourse[];
}

/** i18n key for a prerequisite-kind badge (hard_gate/advisory). */
export function prerequisiteKindLabelKey(kind: string): string {
  return `rplus.offerings.workspace.prerequisites.kind.${kind}`;
}

/** Map one wire edge row to the FE model (shared read + write). */
function mapPrerequisiteEdge(e: BackendPrerequisiteEdge): OfferingPrerequisiteEdge {
  return {
    prerequisiteCourseId: e.prerequisite_course_id,
    prerequisiteCourseTitle: e.prerequisite_course_title ?? '',
    kind: e.kind as PrerequisiteKind,
  };
}

/**
 * Map the wire prerequisites envelope to the FE course list. Sparse rows
 * degrade defensively (missing title → ''; missing notes/edges → []) so a
 * single odd row never blanks the panel — the read is fail-soft for display
 * while the service stays fail-loud on transport errors.
 */
export function mapBackendOfferingPrerequisites(
  resp: BackendOfferingPrerequisites,
): readonly OfferingPrerequisiteCourse[] {
  return (resp.courses ?? []).map((c) => ({
    id: c.course_id,
    title: c.title ?? '',
    prerequisiteNotes: c.prerequisite_notes ?? [],
    prerequisites: (c.prerequisites ?? []).map(mapPrerequisiteEdge),
  }));
}

/**
 * One attached course's freshly-mutated edge list, returned by each
 * prerequisite WRITE (add / remove). The BE returns just the affected course
 * (`{ course_id, prerequisites }`), NOT the whole `{ courses }` envelope —
 * mirrors {@link OfferingCurriculumCourseOutline} — the editor splices these
 * edges back into the matching course row without a re-GET.
 */
export interface OfferingPrerequisiteCourseEdges {
  readonly courseId: string;
  readonly prerequisites: readonly OfferingPrerequisiteEdge[];
}

/** Wire (snake_case) single-course edge list from a prerequisite write endpoint. */
export interface BackendPrerequisiteCourseEdges {
  readonly course_id: string;
  readonly prerequisites?: readonly BackendPrerequisiteEdge[];
}

/**
 * Map the wire single-course write response to the FE edge list. Sparse
 * edges degrade defensively (missing edges → []) — fail-soft for display,
 * while the service stays fail-loud on transport errors.
 */
export function mapBackendPrerequisiteCourseEdges(
  resp: BackendPrerequisiteCourseEdges,
): OfferingPrerequisiteCourseEdges {
  return {
    courseId: resp.course_id,
    prerequisites: (resp.prerequisites ?? []).map(mapPrerequisiteEdge),
  };
}

/** Map one wire test-set row to the picker summary projection. */
export function mapBackendTestSet(t: BackendTestSet): TestSetSummary {
  return {
    id: t.test_set_id,
    title: t.title,
    state: t.state,
    questionCount: t.question_count ?? 0,
    totalPoints: t.total_points ?? 0,
  };
}

/**
 * Map one wire row to the FE model. `delivery_type` / `state` are cast to their
 * unions: the W2.A contract constrains them, and an unexpected token still
 * renders (its badge i18n key simply resolves to the raw token) rather than
 * throwing and blanking the whole page on a single odd row.
 */
export function mapBackendOffering(o: BackendOffering): Offering {
  return {
    id: o.id,
    tenantId: o.tenant_id,
    courseId: o.course_id,
    // Prefer the explicit list; fall back to the primary id so search/legacy
    // rows (which omit `course_ids`) still yield a non-empty set.
    courseIds:
      o.course_ids && o.course_ids.length > 0
        ? o.course_ids
        : o.course_id
          ? [o.course_id]
          : [],
    deliveryType: o.delivery_type as OfferingDeliveryType,
    label: o.label,
    capacity: o.capacity ?? 0,
    state: o.state as OfferingState,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    launchedAt: o.launched_at ?? null,
    concludedAt: o.concluded_at ?? null,
    archivedAt: o.archived_at ?? null,
  };
}

// ── R3 exam-fold: adapt an exam sitting into an Offering-shaped finder row ────

/**
 * Project an exam `SittingStatus` onto the closest `OfferingState` so a folded
 * exam row renders a real state badge (its i18n key exists) inside the offering
 * finder. Lossy by design — exams are a foreign BC and the precise sitting
 * status lives in the exam workspace; the finder only needs a coarse lifecycle
 * badge. Total over the (closed) SittingStatus union — no default arm.
 */
function mapSittingStatusToOfferingState(status: SittingStatus): OfferingState {
  switch (status) {
    case 'In session':
      return 'RUNNING';
    case 'Closed':
      return 'CONCLUDED';
    case 'Scheduled':
    case 'Open for registration':
    case 'Full':
      return 'LAUNCHED';
  }
}

/**
 * Adapt an `ExamSitting` (exam BC) to an `Offering`-shaped finder row for the
 * unified R+ delivery finder (R3 nav de-shadow). Mirrors the `mapBackendOffering`
 * boundary idiom: the `delivery_type` is cast to `OfferingDeliveryType` because
 * the synthesized `exam` token is intentionally not a member of that union (see
 * `EXAM_DELIVERY_TYPE`). Foreign-BC-absent fields (tenant / course ids, offering
 * lifecycle timestamps) take empty / neutral defaults — the row is read-only in
 * the finder and routes to the exam workspace, never the offering workspace.
 */
export function mapExamSittingToOffering(s: ExamSitting): Offering {
  return {
    id: s.sittingId,
    tenantId: '',
    courseId: '',
    courseIds: [],
    deliveryType: EXAM_DELIVERY_TYPE as OfferingDeliveryType,
    label: s.certTitle,
    capacity: s.capacity,
    state: mapSittingStatusToOfferingState(s.status),
    createdAt: s.dateIso,
    updatedAt: s.dateIso,
    launchedAt: null,
    concludedAt: null,
    archivedAt: null,
  };
}

// ── W6: offering transcript (per-offering gradebook join; chora-consumption
//     StudentTranscript read model, `GET /transcript/by-assessments`) ────────

/**
 * One transcript entry for a single learner + a single offering assessment
 * (FE camelCase). `sourceRef` is the assessment_id — the join key back to
 * `OfferingAssessment.id`. `title` is now populated: chora_delivery's
 * `submission.graded.v1` carries `assessment_title` (field 13), which
 * chora-consumption persists into `student_transcript_entries.title`. The
 * per-offering panel still renders the DELIVERY assessment title via its own
 * client-side join (its source of truth for that column), so it does not depend
 * on this row's `title`. Score fields stay nullable: an entry can exist
 * (submitted, awaiting grading) before it has a score — the panel treats a null
 * `scorePercent` the same as "no entry" (blank "—" cell), never fabricating a 0%.
 */
export interface TranscriptEntry {
  readonly entryId: string;
  readonly gcid: string;
  readonly kind: string;
  readonly sourceRef: string;
  readonly title: string;
  readonly scoreEarned: number | null;
  readonly scorePossible: number | null;
  readonly scorePercent: number | null;
  readonly passed: boolean;
  readonly courseId: string | null;
  readonly occurredAt: string;
}

/** Wire (snake_case) transcript entry row from `GET /transcript/by-assessments`. */
export interface BackendTranscriptEntry {
  readonly entry_id: string;
  readonly gcid: string;
  readonly kind: string;
  readonly source_ref: string;
  readonly title?: string;
  readonly score_earned?: number | null;
  readonly score_possible?: number | null;
  readonly score_percent?: number | null;
  readonly passed?: boolean | null;
  readonly course_id?: string | null;
  readonly occurred_at: string;
}

/** Wire envelope for `GET /transcript/by-assessments`. */
export interface BackendTranscriptByAssessments {
  readonly items?: readonly BackendTranscriptEntry[];
}

/**
 * Map one wire transcript entry to the FE model. `passed` degrades to
 * `false` when absent/null (an ungraded row is never shown as a false pass —
 * the panel only renders a pass/fail chip once `scorePercent` is non-null
 * anyway); sparse `title`/`course_id` degrade to `''`/`null`. Fail-soft for
 * display; the service stays fail-loud on transport errors.
 */
export function mapBackendTranscriptEntry(e: BackendTranscriptEntry): TranscriptEntry {
  return {
    entryId: e.entry_id,
    gcid: e.gcid,
    kind: e.kind,
    sourceRef: e.source_ref,
    title: e.title ?? '',
    scoreEarned: e.score_earned ?? null,
    scorePossible: e.score_possible ?? null,
    scorePercent: e.score_percent ?? null,
    passed: e.passed ?? false,
    courseId: e.course_id ?? null,
    occurredAt: e.occurred_at,
  };
}
