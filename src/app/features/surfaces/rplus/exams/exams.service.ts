/**
 * ExamsService — real BFF wiring for SkillsFuture exam sittings.
 *
 * Calls GET /api/v1/exams on the chora-gateway BFF which proxies
 * verbatim to chora-delivery's exam_handler.go (Wave-2a, BE landed
 * commit c924152e). Empty BE response renders the table empty-state
 * (`@empty` branch in exams.component.html) — no fixture fallback
 * per feedback_no_stubs_real_wiring.
 *
 * Adapter rationale: the existing FE model `ExamSitting` is the wire
 * contract for the existing component + template. Mapping happens at
 * the service boundary (Option A — minimal surface area) so the
 * component / html / scss stay untouched.
 *
 * BE → FE field map (BackendExam → ExamSitting):
 *   sittingId           ← id
 *   certTitle           ← title
 *   dateIso             ← scheduled_at (YYYY-MM-DD slice)
 *   dateLabel           ← scheduled_at formatted "12 Jun 2026" (Intl)
 *   venue               ← proctor_method (BE has no venue field; on-site
 *                          strings — passed through verbatim)
 *   capacity            ← capacity
 *   registered          ← enrolled_count (BE-tracked; 0 when absent)
 *   status              ← state mapped to SittingStatus enum
 */
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  BackendCandidate,
  BackendCandidateList,
  BackendExam,
  BackendExamFormList,
  BackendExamsList,
  BackendIncident,
  BackendIncidentList,
  BackendInvigilator,
  BackendInvigilatorList,
  BackendExamResult,
  BackendExamResultList,
  BackendSitting,
  BackendSittingList,
  CreateSittingRequest,
  ExamCandidate,
  ExamDetail,
  ExamForm,
  ExamIncident,
  ExamInvigilator,
  ExamResultRecord,
  ExamSitting,
  ExamSittingList,
  ExamSittingRow,
  BackendKycReview,
  FileIncidentRequest,
  InvigilatorRank,
  KycReviewResult,
  RecordResultRequest,
  ScheduleSittingRequest,
  SittingActionKind,
  SittingStatus,
} from './exams.model';
import {
  formatDateLabel,
  mapBackendCandidate,
  mapBackendExamForm,
  mapBackendExamResult,
  mapBackendIncident,
  mapBackendInvigilator,
  mapBackendExamToDetail,
  mapBackendSitting,
  mapKycReview,
} from './exams.model';

@Injectable({ providedIn: 'root' })
export class ExamsService {
  private readonly bff = inject(BffClientService);

  getUpcomingSittings(): Observable<ExamSittingList> {
    return this.bff.get<BackendExamsList>('/api/v1/exams').pipe(
      map((resp) => {
        const items = resp.items ?? [];
        const sittings = items.map(mapBackendExamToSitting);
        return {
          totalSittings: sittings.length,
          sittings,
        } satisfies ExamSittingList;
      }),
    );
  }

  /**
   * Schedule (create) a new exam sitting. Real POST /api/v1/exams via the
   * chora-gateway BFF, which routes the path verbatim (method + body +
   * Content-Type byte-for-byte) to chora-delivery's
   * exam_handler.go::handleExamCreate. The handler builds an Exam aggregate
   * (exam.NewExam) and persists it; the response is the created examDTO,
   * mapped back to ExamSitting via the same adapter the list uses.
   *
   * The created sitting lands in DRAFT state (exam.NewExam seeds DRAFT; the
   * FSM advances to SCHEDULED via a follow-on Schedule transition the BE
   * exposes later) — mapStateToStatus folds DRAFT into the "Scheduled" badge.
   *
   * Tenant + GCID + RBAC (instructor / admin / training-admin) are enforced
   * inside the handler off the validated mesh claims the gateway stamps — no
   * tenant param travels on the wire. A 400/403/500 surfaces verbatim so the
   * component can render it loud (feedback_no_stubs_real_wiring).
   */
  schedule(req: ScheduleSittingRequest): Observable<ExamSitting> {
    return this.bff
      .post<BackendExam>('/api/v1/exams', {
        course_id: req.courseId,
        title: req.title,
        scheduled_at: req.scheduledAt,
        duration_minutes: req.durationMinutes,
        capacity: req.capacity,
        proctor_method: req.proctorMethod,
      })
      .pipe(map(mapBackendExamToSitting));
  }

  // ── Exam workspace (W4 drill-down over /api/v1/exams/{examID}/*) ──────────
  // All paths proxy verbatim through chora-gateway to chora-delivery. Errors
  // surface untouched (feedback_no_stubs_real_wiring) so the workspace renders
  // the real 4xx/5xx loudly.

  /** GET /api/v1/exams/{examID} — single exam detail (tenant-scoped 404). */
  getExam(examId: string): Observable<ExamDetail> {
    return this.bff
      .get<BackendExam>(`/api/v1/exams/${examId}`)
      .pipe(map(mapBackendExamToDetail));
  }

  /** GET /api/v1/exams/{examID}/candidates — allocated candidate roster. */
  listCandidates(examId: string): Observable<readonly ExamCandidate[]> {
    return this.bff
      .get<BackendCandidateList>(`/api/v1/exams/${examId}/candidates`)
      .pipe(map((resp) => (resp.items ?? []).map(mapBackendCandidate)));
  }

  /** POST /api/v1/exams/{examID}/candidates — allocate a learner GCID. */
  allocateCandidate(examId: string, gcid: string): Observable<ExamCandidate> {
    return this.bff
      .post<BackendCandidate>(`/api/v1/exams/${examId}/candidates`, { gcid })
      .pipe(map(mapBackendCandidate));
  }

  /**
   * POST /api/v1/exams/{examID}/candidates/{gcid}/verify — mark the candidate
   * ID_VERIFIED by resolving the Identity-owned verification claim (ADR-190 D2).
   */
  verifyCandidate(examId: string, gcid: string): Observable<ExamCandidate> {
    return this.bff
      .post<BackendCandidate>(`/api/v1/exams/${examId}/candidates/${gcid}/verify`, {})
      .pipe(map(mapBackendCandidate));
  }

  /**
   * POST /api/v1/exams/{examID}/candidates/{gcid}/admit — THE admission gate;
   * re-resolves the live VERIFIED claim then admits (200) or refuses (403).
   */
  admitCandidate(examId: string, gcid: string): Observable<ExamCandidate> {
    return this.bff
      .post<BackendCandidate>(`/api/v1/exams/${examId}/candidates/${gcid}/admit`, {})
      .pipe(map(mapBackendCandidate));
  }

  // ── Admin KYC review (manual-doc prerequisite — CHO-2103) ────────────────
  // Person-scoped (by {gcid}, NOT exam-scoped). Drives the Identity Verification
  // submitted→{verified|rejected} transition that a manual-doc learner needs
  // before verifyCandidate() can resolve their claim VERIFIED (ADR-190 D2).
  // Errors surface verbatim (feedback_no_stubs_real_wiring) — a 409
  // KYC_INVALID_TRANSITION is the common "nothing pending" case the workspace
  // renders as a benign notice rather than a scary error.

  /** POST /api/v1/admin/kyc/{gcid}/verify — staff completes a submitted manual-doc KYC. */
  verifyKyc(gcid: string): Observable<KycReviewResult> {
    return this.bff
      .post<BackendKycReview>(`/api/v1/admin/kyc/${gcid}/verify`, {})
      .pipe(map(mapKycReview));
  }

  /** POST /api/v1/admin/kyc/{gcid}/reject — staff rejects (retryable per policy). */
  rejectKyc(
    gcid: string,
    body: { code?: string; notes?: string; retryAllowed?: boolean },
  ): Observable<KycReviewResult> {
    return this.bff
      .post<BackendKycReview>(`/api/v1/admin/kyc/${gcid}/reject`, {
        code: body.code,
        notes: body.notes,
        retry_allowed: body.retryAllowed,
      })
      .pipe(map(mapKycReview));
  }

  /** GET /api/v1/exams/{examID}/forms — assembled, revision-pinned forms. */
  listForms(examId: string): Observable<readonly ExamForm[]> {
    return this.bff
      .get<BackendExamFormList>(`/api/v1/exams/${examId}/forms`)
      .pipe(map((resp) => (resp.items ?? []).map(mapBackendExamForm)));
  }

  // ── Sittings (Proctors tab) — all paths {examID}-nested ──────────────────

  /** GET /api/v1/exams/{examID}/sittings — scheduled sittings for the exam. */
  listSittings(examId: string): Observable<readonly ExamSittingRow[]> {
    return this.bff
      .get<BackendSittingList>(`/api/v1/exams/${examId}/sittings`)
      .pipe(map((resp) => (resp.items ?? []).map(mapBackendSitting)));
  }

  /** POST /api/v1/exams/{examID}/sittings — schedule a sitting (state SCHEDULED). */
  createSitting(examId: string, req: CreateSittingRequest): Observable<ExamSittingRow> {
    return this.bff
      .post<BackendSitting>(`/api/v1/exams/${examId}/sittings`, {
        starts_at: req.startsAt,
        ends_at: req.endsAt,
        capacity: req.capacity,
        exam_form_id: req.examFormId ?? '',
        room_id: req.roomId ?? '',
      })
      .pipe(map(mapBackendSitting));
  }

  /**
   * POST /api/v1/exams/{examID}/sittings/{sittingID}/{action} — FSM transition
   * (open|begin|close|cancel). No body; a 409 signals an illegal transition.
   */
  sittingAction(
    examId: string,
    sittingId: string,
    action: SittingActionKind,
  ): Observable<ExamSittingRow> {
    return this.bff
      .post<BackendSitting>(`/api/v1/exams/${examId}/sittings/${sittingId}/${action}`, {})
      .pipe(map(mapBackendSitting));
  }

  // ── Invigilators (per sitting) ───────────────────────────────────────────

  /** GET .../sittings/{sittingID}/invigilators — the sitting's invigilator roster. */
  listInvigilators(examId: string, sittingId: string): Observable<readonly ExamInvigilator[]> {
    return this.bff
      .get<BackendInvigilatorList>(`/api/v1/exams/${examId}/sittings/${sittingId}/invigilators`)
      .pipe(map((resp) => (resp.items ?? []).map(mapBackendInvigilator)));
  }

  /**
   * POST .../sittings/{sittingID}/invigilators — assign an invigilator. Field is
   * `invigilator_gcid` (+ `rank`); a second chief_invigilator → 409.
   */
  assignInvigilator(
    examId: string,
    sittingId: string,
    gcid: string,
    rank: InvigilatorRank,
  ): Observable<ExamInvigilator> {
    return this.bff
      .post<BackendInvigilator>(`/api/v1/exams/${examId}/sittings/${sittingId}/invigilators`, {
        invigilator_gcid: gcid,
        rank,
      })
      .pipe(map(mapBackendInvigilator));
  }

  /** DELETE .../sittings/{sittingID}/invigilators/{invigilatorID} — unassign. */
  removeInvigilator(
    examId: string,
    sittingId: string,
    invigilatorId: string,
  ): Observable<ExamInvigilator> {
    return this.bff
      .delete<BackendInvigilator>(
        `/api/v1/exams/${examId}/sittings/${sittingId}/invigilators/${invigilatorId}`,
      )
      .pipe(map(mapBackendInvigilator));
  }

  // ── Incidents (per sitting, append-only) ─────────────────────────────────

  /** GET .../sittings/{sittingID}/incidents — the sitting's incident audit trail. */
  listIncidents(examId: string, sittingId: string): Observable<readonly ExamIncident[]> {
    return this.bff
      .get<BackendIncidentList>(`/api/v1/exams/${examId}/sittings/${sittingId}/incidents`)
      .pipe(map((resp) => (resp.items ?? []).map(mapBackendIncident)));
  }

  /** POST .../sittings/{sittingID}/incidents — file an incident (field `kind`). */
  fileIncident(
    examId: string,
    sittingId: string,
    req: FileIncidentRequest,
  ): Observable<ExamIncident> {
    return this.bff
      .post<BackendIncident>(`/api/v1/exams/${examId}/sittings/${sittingId}/incidents`, {
        kind: req.kind,
        narrative: req.narrative,
        candidate_ref: req.candidateRef ?? '',
      })
      .pipe(map(mapBackendIncident));
  }

  // ── Results (record only — no list endpoint exists in this BC) ────────────

  /**
   * POST /api/v1/exams/{examID}/results — grade a candidate (raw_score → PASS/FAIL
   * against the form cut score). There is NO list endpoint (chora-delivery gap);
   * the tab records + shows the returned result only.
   */
  recordResult(examId: string, req: RecordResultRequest): Observable<ExamResultRecord> {
    return this.bff
      .post<BackendExamResult>(`/api/v1/exams/${examId}/results`, {
        form_id: req.formId,
        candidate_ref: req.candidateRef,
        raw_score: req.rawScore,
      })
      .pipe(map(mapBackendExamResult));
  }

  /** GET /api/v1/exams/{examID}/results — the results roster (CHO-2104). */
  listResults(examId: string): Observable<readonly ExamResultRecord[]> {
    return this.bff
      .get<BackendExamResultList>(`/api/v1/exams/${examId}/results`)
      .pipe(map((resp) => (resp.items ?? []).map(mapBackendExamResult)));
  }
}

function mapBackendExamToSitting(e: BackendExam): ExamSitting {
  const scheduledAt = (e.scheduled_at ?? '').trim();
  return {
    sittingId: e.id,
    certTitle: e.title,
    dateIso: sliceIsoDate(scheduledAt),
    dateLabel: formatDateLabel(scheduledAt),
    venue: e.proctor_method ?? '',
    capacity: e.capacity ?? 0,
    registered: e.enrolled_count ?? 0,
    status: mapStateToStatus(e.state ?? e.status ?? ''),
    // Spread rather than assign, so an ABSENT flag stays absent instead of
    // becoming an `undefined`-valued key or, worse, defaulting to false.
    ...(e.sf_eligible === undefined ? {} : { skillsFutureAligned: e.sf_eligible }),
  };
}

/**
 * Slice the date part of an RFC3339 timestamp. Returns '' for empty /
 * unparseable input — the FE template treats missing dateIso gracefully
 * (the visible cell consumes dateLabel only).
 */
function sliceIsoDate(input: string): string {
  if (!input) return '';
  const t = input.indexOf('T');
  return t > 0 ? input.slice(0, t) : input.slice(0, 10);
}

/**
 * Map BE exam state (DRAFT / SCHEDULED / OPEN / CLOSED / GRADED) to the
 * FE-presentable SittingStatus enum used by the existing template +
 * statusBadge helper.
 */
function mapStateToStatus(raw: string): SittingStatus {
  switch (raw.trim().toUpperCase()) {
    case 'OPEN':
      return 'Open for registration';
    case 'CLOSED':
    case 'GRADED':
      return 'Closed';
    case 'DRAFT':
    case 'SCHEDULED':
    case 'PUBLISHED':
    default:
      return 'Scheduled';
  }
}
