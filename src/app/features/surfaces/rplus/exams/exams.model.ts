/**
 * Exams model — R+ Stage 3 wave 2.
 *
 * SkillsFuture-aligned exam-sitting admin. Each `ExamSitting` is an
 * instance of an `AssessmentSession` configured for proctored cert
 * delivery.
 *
 * Domain vocabulary anchors:
 *   - `AssessmentSession` — the exam container (Content Consumption)
 *   - `Certification` — issued from Content Delivery on pass
 *   - `SkillsFutures` — Singapore government cert subsidy programme
 *     (registered through the Content Delivery aggregate)
 */

export type SittingStatus =
  | 'Scheduled'
  | 'Open for registration'
  | 'Full'
  | 'In session'
  | 'Closed';

/**
 * One upcoming exam sitting, as the R+ list renders it.
 *
 * R6 D1: `certCode`, `proctor` and `skillsFutureAligned` were REMOVED rather
 * than blanked. The exam wire (`exam_handler.go:210-229`) carries no cert
 * short-code and no proctor, the only invigilator read serves a GCID and a rank
 * with no name, and the SkillsFuture flag lives on `Course.SFEligible` with no
 * read joining it to an exam. They were mapped to '', '' and a hardcoded true,
 * so the badge painted on every sitting in every tenant. A metric is served or
 * absent, never faked.
 */
export interface ExamSitting {
  /** Stable sitting id (e.g., `cspo-2026-jun12`). */
  readonly sittingId: string;
  /** Course / cert title (e.g., `Certified Scrum Product Owner`). */
  readonly certTitle: string;
  /** Exam date ISO string. */
  readonly dateIso: string;
  /** Display label for the date (e.g., `12 Jun 2026`). */
  readonly dateLabel: string;
  /** Venue display name. */
  readonly venue: string;
  /** Maximum number of candidates the venue accepts. */
  readonly capacity: number;
  /** Registered candidate count. */
  readonly registered: number;
  /**
   * SkillsFuture funding, as SERVED by the exam list. `undefined` means the
   * backend could not resolve the exam's course, which is not the same as
   * false. Nothing may default it: the original defect was a hardcoded `true`
   * that painted the badge on every sitting in every tenant.
   */
  readonly skillsFutureAligned?: boolean;
  /** Sitting status badge. */
  readonly status: SittingStatus;
}

export interface ExamSittingList {
  /** Total upcoming sittings shown. */
  readonly totalSittings: number;
  /** Sitting rows ordered by date asc. */
  readonly sittings: readonly ExamSitting[];
}

/**
 * ProctorMethod — the canonical PROCTOR_METHOD_* vocabulary chora-delivery's
 * exam aggregate accepts (exam.go ProctorMethod.IsValid). The schedule form
 * binds this typed enum so a non-canonical value can never reach the wire
 * (the BE rejects anything else with a 400). An empty proctor_method is also
 * accepted by the BE (defaults to AUTO_AI) but the form always sends an
 * explicit value.
 */
export type ProctorMethod =
  | 'PROCTOR_METHOD_AUTO_AI'
  | 'PROCTOR_METHOD_HUMAN_LIVE'
  | 'PROCTOR_METHOD_HUMAN_RECORDED';

/** Ordered proctor-method options for the schedule-sitting form select. */
export const PROCTOR_METHOD_OPTIONS: readonly ProctorMethod[] = [
  'PROCTOR_METHOD_AUTO_AI',
  'PROCTOR_METHOD_HUMAN_LIVE',
  'PROCTOR_METHOD_HUMAN_RECORDED',
];

/**
 * ScheduleSittingRequest — the FE-typed create payload the component collects
 * from the inline form. ExamsService maps it to the snake-case createExamReq
 * the BE decodes. `scheduledAt` is a full RFC3339 timestamp (the component
 * widens the form's datetime-local value before invoking schedule()).
 */
export interface ScheduleSittingRequest {
  /** Source course id the sitting certifies (BE: course_id, required). */
  readonly courseId: string;
  /** Sitting title (BE: title, required). */
  readonly title: string;
  /** RFC3339 sitting timestamp (BE: scheduled_at). */
  readonly scheduledAt: string;
  /** Exam duration in minutes (BE: duration_minutes, must be > 0). */
  readonly durationMinutes: number;
  /** Venue capacity / max candidates (BE: capacity, must be > 0). */
  readonly capacity: number;
  /** Proctoring approach (BE: proctor_method, canonical PROCTOR_METHOD_*). */
  readonly proctorMethod: ProctorMethod;
}

/**
 * BackendExam — wire shape returned by GET /api/v1/exams (and /:id) via
 * the chora-gateway BFF, which proxies verbatim to chora-delivery's
 * exam_handler.go examDTO. The FE adapts this to ExamSitting in
 * exams.service.ts — kept internal to the exams feature.
 *
 * NOTE the canonical field name on the wire is `state` (not `status`)
 * per the deployed BE per ground-in-deployed-reality. `status` is
 * accepted as a fallback for forward-compatibility with any future
 * rename.
 */
export interface BackendExam {
  readonly id: string;
  readonly tenant_id?: string;
  readonly course_id?: string;
  readonly title: string;
  readonly scheduled_at?: string;
  readonly duration_minutes?: number;
  readonly capacity?: number;
  readonly enrolled_count?: number;
  readonly proctor_method?: string;
  readonly state?: string;
  /** Forward-compat alias for `state` — accepted but not emitted by BE today. */
  readonly status?: string;
  readonly created_at?: string;
  readonly updated_at?: string;
  /**
   * SkillsFuture eligibility, joined from the exam's course (27ba3e6be).
   *
   * OPTIONAL on purpose: the list OMITS it when the course cannot be resolved,
   * so `undefined` means "not known" and must never be read as "not funded".
   */
  readonly sf_eligible?: boolean;
}

export interface BackendExamsList {
  readonly items: readonly BackendExam[];
}

export function statusBadge(status: SittingStatus): string {
  switch (status) {
    case 'Open for registration':
      return 'badge-success';
    case 'Scheduled':
      return 'badge-info';
    case 'Full':
      return 'badge-warning';
    case 'In session':
      return 'badge-info';
    case 'Closed':
      return 'badge-neutral';
  }
}

export function capacityPercent(registered: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.round((registered / capacity) * 100);
}

/**
 * Returns the i18n key suffix for a proctor-method option label. The
 * template prefixes it with `rplus.exams.form.proctor.` and pipes it
 * through TranslatePipe so the human-readable label stays in en.json
 * (no hardcoded English in the template per chora-web CLAUDE.md §12).
 */
export function proctorMethodKey(method: ProctorMethod): string {
  switch (method) {
    case 'PROCTOR_METHOD_AUTO_AI':
      return 'auto_ai';
    case 'PROCTOR_METHOD_HUMAN_LIVE':
      return 'human_live';
    case 'PROCTOR_METHOD_HUMAN_RECORDED':
      return 'human_recorded';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Exam Workspace (W4 Exam BC drill-down) — models for GET /api/v1/exams/{id}
// and its /candidates + /forms sub-resources. camelCase FE shapes mapped from
// the snake_case wire at the service boundary (mirrors offerings.model.ts).
// ═══════════════════════════════════════════════════════════════════════════

/** Exam lifecycle FSM state (chora-delivery exam.Exam.State). */
export type ExamState = 'DRAFT' | 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'GRADED';

/**
 * Format an RFC3339 timestamp as "12 Jun 2026" (en-GB, no comma). Returns ''
 * on empty / invalid input. Shared by the sittings-list adapter + the exam
 * detail mapper (single source of truth — the service imports this).
 */
export function formatDateLabel(input: string): string {
  if (!input) return '';
  const ms = Date.parse(input);
  if (Number.isNaN(ms)) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(ms));
}

/** FE detail shape for a single exam (workspace header + overview tab). */
export interface ExamDetail {
  readonly examId: string;
  readonly title: string;
  readonly courseId: string;
  readonly scheduledAtIso: string;
  readonly scheduledLabel: string;
  readonly durationMinutes: number;
  readonly capacity: number;
  readonly enrolledCount: number;
  readonly state: ExamState;
  readonly proctorMethod: string;
}

/** Map a BackendExam (GET /api/v1/exams/{id}) to the FE detail shape. */
export function mapBackendExamToDetail(e: BackendExam): ExamDetail {
  const scheduledAt = (e.scheduled_at ?? '').trim();
  return {
    examId: e.id,
    title: e.title,
    courseId: e.course_id ?? '',
    scheduledAtIso: scheduledAt,
    scheduledLabel: formatDateLabel(scheduledAt),
    durationMinutes: e.duration_minutes ?? 0,
    capacity: e.capacity ?? 0,
    enrolledCount: e.enrolled_count ?? 0,
    state: normalizeExamState(e.state ?? e.status ?? ''),
    proctorMethod: e.proctor_method ?? '',
  };
}

function normalizeExamState(raw: string): ExamState {
  switch (raw.trim().toUpperCase()) {
    case 'SCHEDULED':
      return 'SCHEDULED';
    case 'OPEN':
      return 'OPEN';
    case 'CLOSED':
      return 'CLOSED';
    case 'GRADED':
      return 'GRADED';
    case 'DRAFT':
    default:
      return 'DRAFT';
  }
}

// ── Candidates ─────────────────────────────────────────────────────────────

/** Candidate allocation-lifecycle FSM state (chora-delivery exam.CandidateState). */
export type CandidateState =
  | 'ALLOCATED'
  | 'ID_VERIFIED'
  | 'ADMITTED'
  | 'REJECTED'
  | 'WITHDRAWN';

/** Identity-owned verification claim status projected onto the candidate. */
export type CandidateVerificationStatus = 'UNVERIFIED' | 'VERIFIED';

/** Wire shape of a candidate row (chora-delivery candidateDTO). */
export interface BackendCandidate {
  readonly id: string;
  readonly tenant_id?: string;
  readonly exam_id?: string;
  readonly gcid: string;
  readonly state: string;
  readonly verification_status?: string;
  readonly created_at?: string;
  readonly updated_at?: string;
}

export interface BackendCandidateList {
  readonly items: readonly BackendCandidate[];
}

/** FE candidate shape (candidates tab). */
export interface ExamCandidate {
  readonly candidateId: string;
  readonly gcid: string;
  readonly state: CandidateState;
  readonly verificationStatus: CandidateVerificationStatus;
  readonly createdAtIso: string;
}

/** Map a BackendCandidate to the FE shape, normalising the two enums. */
export function mapBackendCandidate(c: BackendCandidate): ExamCandidate {
  return {
    candidateId: c.id,
    gcid: c.gcid,
    state: normalizeCandidateState(c.state),
    verificationStatus:
      (c.verification_status ?? '').trim().toUpperCase() === 'VERIFIED'
        ? 'VERIFIED'
        : 'UNVERIFIED',
    createdAtIso: c.created_at ?? '',
  };
}

function normalizeCandidateState(raw: string): CandidateState {
  switch (raw.trim().toUpperCase()) {
    case 'ID_VERIFIED':
      return 'ID_VERIFIED';
    case 'ADMITTED':
      return 'ADMITTED';
    case 'REJECTED':
      return 'REJECTED';
    case 'WITHDRAWN':
      return 'WITHDRAWN';
    case 'ALLOCATED':
    default:
      return 'ALLOCATED';
  }
}

// ── Admin KYC review (manual-doc prerequisite — CHO-2103 FE) ─────────────────
// A manual-doc learner's KYC reaches `submitted` with no automated verifier
// (only Singpass auto-verifies), so a staff member must complete it before the
// exam candidate's Identity claim can ever resolve VERIFIED (ADR-190 D2). These
// admin actions drive the Identity `Verification` submitted→{verified|rejected}
// transition. Person-scoped (by gcid), NOT exam-scoped — distinct from the
// exam-BC `verifyCandidate` claim-resolve. chora-identity returns a FLAT body.

/** Terminal status of an admin KYC review action. */
export type KycReviewStatus = 'verified' | 'rejected';

/** Wire shape of POST /api/v1/admin/kyc/{gcid}/{verify|reject} (chora-identity, flat). */
export interface BackendKycReview {
  readonly verification_id: string;
  readonly gcid: string;
  readonly status: string;
  readonly method?: string;
  readonly rejection_code?: string;
  readonly retry_allowed?: boolean;
}

/** FE shape of a KYC review result. */
export interface KycReviewResult {
  readonly verificationId: string;
  readonly gcid: string;
  readonly status: KycReviewStatus;
  readonly method: string;
  readonly rejectionCode: string;
  readonly retryAllowed: boolean;
}

/** Map a BackendKycReview (flat identity body) to the FE shape. */
export function mapKycReview(r: BackendKycReview): KycReviewResult {
  return {
    verificationId: r.verification_id ?? '',
    gcid: r.gcid ?? '',
    status: (r.status ?? '').trim().toLowerCase() === 'rejected' ? 'rejected' : 'verified',
    method: (r.method ?? '').trim(),
    rejectionCode: (r.rejection_code ?? '').trim(),
    retryAllowed: r.retry_allowed ?? false,
  };
}

// ── Forms / items ──────────────────────────────────────────────────────────

/** Wire shape of one assembled form item (examFormDTO.items[]). */
export interface BackendExamFormItem {
  readonly item_id: string;
  readonly atom_revision_id: string;
  readonly position: number;
}

/** Wire shape of a cut score (examFormDTO.cut_score). */
export interface BackendCutScore {
  readonly mode?: string;
  readonly max_score?: number;
  readonly raw_mark?: number;
  readonly percent?: number;
  readonly pass_mark?: number;
}

/** Wire shape of an assembled exam form (examFormDTO). */
export interface BackendExamForm {
  readonly id: string;
  readonly exam_id?: string;
  readonly item_bank_id?: string;
  readonly state?: string;
  readonly items?: readonly BackendExamFormItem[];
  readonly cut_score?: BackendCutScore;
  readonly created_at?: string;
}

export interface BackendExamFormList {
  readonly items: readonly BackendExamForm[];
}

export interface ExamFormItem {
  readonly itemId: string;
  readonly atomRevisionId: string;
  readonly position: number;
}

export interface CutScore {
  readonly mode: string;
  readonly maxScore: number;
  readonly passMark: number;
  readonly percent: number | null;
}

/** FE assembled-form shape (form/items tab). */
export interface ExamForm {
  readonly formId: string;
  readonly itemBankId: string;
  readonly state: string;
  readonly itemCount: number;
  readonly items: readonly ExamFormItem[];
  readonly cutScore: CutScore | null;
}

// ── Sittings (Proctors tab) ─────────────────────────────────────────────────

/** Exam-sitting lifecycle FSM state (chora-delivery ExamSittingState). */
export type SittingState = 'SCHEDULED' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED' | 'CANCELLED';

/** The four sitting transitions (POST .../sittings/{id}/{action}). */
export type SittingActionKind = 'open' | 'begin' | 'close' | 'cancel';

/** Wire shape of a sitting (chora-delivery sittingDTO). */
export interface BackendSitting {
  readonly id: string;
  readonly tenant_id?: string;
  readonly exam_id?: string;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly capacity: number;
  readonly state: string;
  readonly exam_form_id?: string;
  readonly room_id?: string;
  readonly created_at?: string;
  readonly updated_at?: string;
}

export interface BackendSittingList {
  readonly items: readonly BackendSitting[];
}

/** FE sitting shape (Proctors tab). */
export interface ExamSittingRow {
  readonly sittingId: string;
  readonly startsAtIso: string;
  readonly startsLabel: string;
  readonly endsAtIso: string;
  readonly capacity: number;
  readonly state: SittingState;
  readonly examFormId: string;
  readonly roomId: string;
}

/** FE-typed create-sitting payload (starts/ends RFC3339; capacity > 0). */
export interface CreateSittingRequest {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly capacity: number;
  readonly examFormId?: string;
  readonly roomId?: string;
}

export function mapBackendSitting(s: BackendSitting): ExamSittingRow {
  const starts = (s.starts_at ?? '').trim();
  return {
    sittingId: s.id,
    startsAtIso: starts,
    startsLabel: formatDateLabel(starts),
    endsAtIso: (s.ends_at ?? '').trim(),
    capacity: s.capacity ?? 0,
    state: normalizeSittingState(s.state),
    examFormId: s.exam_form_id ?? '',
    roomId: s.room_id ?? '',
  };
}

function normalizeSittingState(raw: string): SittingState {
  switch (raw.trim().toUpperCase()) {
    case 'OPEN':
      return 'OPEN';
    case 'IN_PROGRESS':
      return 'IN_PROGRESS';
    case 'CLOSED':
      return 'CLOSED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'SCHEDULED':
    default:
      return 'SCHEDULED';
  }
}

/** The actions permitted from a given sitting state (drives per-row buttons). */
export function sittingActionsFor(state: SittingState): readonly SittingActionKind[] {
  switch (state) {
    case 'SCHEDULED':
      return ['open', 'cancel'];
    case 'OPEN':
      return ['begin', 'close', 'cancel'];
    case 'IN_PROGRESS':
      return ['close'];
    default:
      return []; // CLOSED / CANCELLED are terminal
  }
}

// ── Invigilators (Proctors tab, per sitting) ────────────────────────────────

/** Per-sitting invigilator authority level (lowercase_snake — do not uppercase). */
export type InvigilatorRank =
  | 'chief_invigilator'
  | 'invigilator'
  | 'technical_support'
  | 'observer';

export const INVIGILATOR_RANKS: readonly InvigilatorRank[] = [
  'chief_invigilator',
  'invigilator',
  'technical_support',
  'observer',
];

export interface BackendInvigilator {
  readonly id: string;
  readonly tenant_id?: string;
  readonly sitting_id?: string;
  readonly invigilator_gcid: string;
  readonly rank: string;
  readonly assigned_at?: string;
}

export interface BackendInvigilatorList {
  readonly items: readonly BackendInvigilator[];
}

export interface ExamInvigilator {
  readonly invigilatorId: string;
  readonly invigilatorGcid: string;
  readonly rank: InvigilatorRank;
}

export function mapBackendInvigilator(i: BackendInvigilator): ExamInvigilator {
  const rank = (i.rank ?? '').trim().toLowerCase();
  return {
    invigilatorId: i.id,
    invigilatorGcid: i.invigilator_gcid,
    rank: (INVIGILATOR_RANKS as readonly string[]).includes(rank)
      ? (rank as InvigilatorRank)
      : 'invigilator',
  };
}

// ── Incidents (Incidents tab, per sitting) ──────────────────────────────────

/** Incident kind (lowercase_snake; 9 values — no severity concept in this BC). */
export type IncidentKind =
  | 'identity_mismatch'
  | 'unauthorized_material'
  | 'communication_attempt'
  | 'device_violation'
  | 'behavior_disruption'
  | 'technical_failure'
  | 'medical_emergency'
  | 'fire_alarm'
  | 'other';

export const INCIDENT_KINDS: readonly IncidentKind[] = [
  'identity_mismatch',
  'unauthorized_material',
  'communication_attempt',
  'device_violation',
  'behavior_disruption',
  'technical_failure',
  'medical_emergency',
  'fire_alarm',
  'other',
];

export interface BackendIncident {
  readonly id: string;
  readonly sitting_id?: string;
  readonly reported_by_gcid: string;
  readonly kind: string;
  readonly narrative: string;
  readonly occurred_at?: string;
  readonly created_at?: string;
  readonly candidate_ref?: string;
}

export interface BackendIncidentList {
  readonly items: readonly BackendIncident[];
}

export interface ExamIncident {
  readonly incidentId: string;
  readonly reportedByGcid: string;
  readonly kind: string;
  readonly narrative: string;
  readonly occurredAtIso: string;
  readonly candidateRef: string;
}

/** FE-typed file-incident payload (kind + narrative required). */
export interface FileIncidentRequest {
  readonly kind: IncidentKind;
  readonly narrative: string;
  readonly candidateRef?: string;
}

export function mapBackendIncident(i: BackendIncident): ExamIncident {
  return {
    incidentId: i.id,
    reportedByGcid: i.reported_by_gcid ?? '',
    kind: (i.kind ?? '').trim(),
    narrative: i.narrative ?? '',
    occurredAtIso: (i.occurred_at ?? i.created_at ?? '').trim(),
    candidateRef: i.candidate_ref ?? '',
  };
}

// ── Results (Results tab) ───────────────────────────────────────────────────

/** Graded outcome (uppercase). */
export type ExamOutcome = 'PASS' | 'FAIL';

export interface BackendExamResult {
  readonly id: string;
  readonly exam_id?: string;
  readonly exam_form_id?: string;
  readonly candidate_ref: string;
  readonly raw_score: number;
  readonly max_score: number;
  /** Present on the record (POST) response; OMITTED from the GET-list roster (not persisted per result). */
  readonly pass_mark?: number;
  readonly outcome: string;
  readonly scored_at?: string;
}

export interface BackendExamResultList {
  readonly items: readonly BackendExamResult[];
}

export interface ExamResultRecord {
  readonly resultId: string;
  readonly candidateRef: string;
  readonly rawScore: number;
  readonly maxScore: number;
  readonly passMark: number;
  readonly outcome: ExamOutcome;
  readonly scoredAtIso: string;
}

/** FE-typed record-result payload (POST .../results; no list endpoint exists). */
export interface RecordResultRequest {
  readonly formId: string;
  readonly candidateRef: string;
  readonly rawScore: number;
}

export function mapBackendExamResult(r: BackendExamResult): ExamResultRecord {
  return {
    resultId: r.id,
    candidateRef: r.candidate_ref ?? '',
    rawScore: r.raw_score ?? 0,
    maxScore: r.max_score ?? 0,
    passMark: r.pass_mark ?? 0,
    outcome: (r.outcome ?? '').trim().toUpperCase() === 'PASS' ? 'PASS' : 'FAIL',
    scoredAtIso: (r.scored_at ?? '').trim(),
  };
}

/** Map a BackendExamForm to the FE shape (revision-pinned, order-stable). */
export function mapBackendExamForm(f: BackendExamForm): ExamForm {
  const items = (f.items ?? [])
    .map((it) => ({
      itemId: it.item_id,
      atomRevisionId: it.atom_revision_id,
      position: it.position,
    }))
    .sort((a, b) => a.position - b.position);
  const cut = f.cut_score;
  return {
    formId: f.id,
    itemBankId: f.item_bank_id ?? '',
    state: f.state ?? '',
    itemCount: items.length,
    items,
    cutScore: cut
      ? {
          mode: cut.mode ?? '',
          maxScore: cut.max_score ?? 0,
          passMark: cut.pass_mark ?? 0,
          percent: cut.percent ?? null,
        }
      : null,
  };
}
