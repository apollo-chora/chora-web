/**
 * OfferingsService — real BFF wiring for the R+ offerings surface.
 *
 * Calls the chora-gateway BFF (W1 detail + W2.A search + W2.B transitions, all
 * deployed + verified), which proxies to chora-delivery's offering handlers.
 * Mapping (snake_case wire → camelCase FE, and facet value labels → i18n keys)
 * happens here at the service boundary. Fail-loud: HTTP errors propagate
 * untouched so components render their error state (no fixture, no silent empty
 * list, no fabricated success) per feedback_no_stubs_real_wiring.
 *
 * Endpoints:
 *   - search      GET   /api/v1/search/offerings          (finder, W2.A)
 *   - getOffering GET   /api/v1/offerings/:id             (workspace detail, W1)
 *   - transition  PATCH /api/v1/offerings/:id/{action}    (FSM, W2.B; NO body)
 *   - create      POST  /api/v1/offerings                 (W1)
 *   - listCourses GET   /api/v1/courses?state=PUBLISHED   (create select)
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { type Observable, map, of } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import { RoomsService } from '../rooms/rooms.service';
import { queryToHttpParams } from '../../../../shared/components/chora-collection-view/collection-query.util';
import type {
  CollectionFacet,
  CollectionPage,
  CollectionQuery,
} from '../../../../shared/components/chora-collection-view/collection-view.model';
import {
  mapBackendAttendanceRecord,
  mapBackendCurriculumCourseOutline,
  mapBackendOffering,
  mapBackendOfferingAssessment,
  mapBackendOfferingCertificateIssued,
  mapBackendOfferingCertificationEnvelope,
  mapBackendOfferingCompletionPolicy,
  mapBackendOfferingCurriculum,
  mapBackendModule,
  mapBackendModuleList,
  mapBackendModuleProgressList,
  mapBackendOfferingAnalytics,
  mapBackendOfferingEnrollment,
  mapBackendBulkEnrolResult,
  type BulkEnrolLearnersRequest,
  type BulkEnrolResult,
  type BackendBulkEnrolResult,
  mapBackendOfferingPrerequisites,
  mapBackendOfferingPublish,
  mapBackendOfferingRoster,
  mapBackendOfferingSection,
  mapBackendOfferingSession,
  mapBackendPrerequisiteCourseEdges,
  mapBackendTestSet,
  mapBackendTranscriptEntry,
  offeringFacetValueLabelKey,
  type BackendAttendanceRecord,
  type BackendCurriculumCourseOutline,
  type BackendOffering,
  type BackendOfferingAssessment,
  type BackendOfferingAssessmentPage,
  type BackendOfferingAttendance,
  type BackendOfferingCertificateIssued,
  type BackendOfferingCertification,
  type BackendOfferingCompletionPolicy,
  type BackendOfferingCurriculum,
  type BackendModule,
  type BackendModuleList,
  type BackendModuleProgressList,
  type BackendOfferingAnalytics,
  type BackendOfferingEnrollment,
  type BackendOfferingPrerequisites,
  type BackendOfferingPublish,
  type BackendOfferingRoster,
  type BackendOfferingSchedule,
  type BackendOfferingSection,
  type BackendOfferingSections,
  type BackendOfferingSession,
  type CreateRoomRequest,
  type RoomOption,
  type BackendOfferingSearchPage,
  type BackendPrerequisiteCourseEdges,
  type BackendTestSetPage,
  type BackendTranscriptByAssessments,
  type Offering,
  type OfferingAssessment,
  type OfferingAttendanceRecord,
  type OfferingCertificateIssued,
  type OfferingCertification,
  type OfferingCompletionPolicy,
  type OfferingCurriculumCourse,
  type OfferingCurriculumCourseOutline,
  type OfferingModule,
  type OfferingModuleProgress,
  type ModuleRequirementKind,
  type OfferingDeliveryType,
  type OfferingAnalytics,
  type OfferingEnrollment,
  type OfferingPrerequisiteCourse,
  type OfferingPrerequisiteCourseEdges,
  type OfferingPublishState,
  type OfferingRoster,
  type OfferingSection,
  type OfferingSession,
  type OfferingTransition,
  type PrerequisiteKind,
  type TestSetSummary,
  type TranscriptEntry,
} from './offerings.model';

/** Request body for `createOffering` (camelCase FE → snake_case wire). */
export interface CreateOfferingRequest {
  /** Courses this offering delivers (1:N). At least one. */
  readonly courseIds: readonly string[];
  readonly deliveryType: OfferingDeliveryType;
  readonly label: string;
  /** Maximum seats; 0 = unbounded (BE contract). */
  readonly capacity: number;
}

/** Minimal course option for the create-offering `<select>`. */
export interface OfferingCourseOption {
  readonly id: string;
  readonly label: string;
}

/**
 * Request to attach a PUBLISHED test-set to an offering as an Assessment
 * (camelCase FE → snake_case wire). Only `testSetId` is required; the optional
 * scheduling/title/attempt fields drop out of the wire body when blank so the
 * BE receives a cleanly-typed payload (no empty-string serialisations).
 */
export interface AttachAssessmentRequest {
  readonly testSetId: string;
  readonly titleOverride?: string;
  readonly scheduledOpenAt?: string;
  readonly scheduledCloseAt?: string;
  readonly maxAttempts?: number;
}

/**
 * Request to create an intra-cohort Section on a graduate offering (camelCase FE
 * → snake_case wire). Only `name` is required; blank optional fields drop out of
 * the wire body so the BE receives a cleanly-typed payload.
 */
export interface CreateSectionRequest {
  readonly name: string;
  readonly leadInstructorGcid?: string;
  readonly room?: string;
  readonly startDate?: string;
  readonly endDate?: string;
}

/**
 * Request to schedule a delivery Session on a short-course offering (camelCase
 * FE → snake_case wire). `title` + `startsAt` < `endsAt` are required; blank
 * `roomId` / `instructorGcid` drop out of the wire body. A room is booked by
 * `roomId` ONLY (CHO-2191 ratified gate) — the picker sends it; the BE 400s a
 * free-text room with no id. Timestamps are already RFC3339 (the component
 * converts the `datetime-local` value via `toISOString`).
 */
export interface CreateSessionRequest {
  readonly title: string;
  readonly roomId?: string;
  readonly instructorGcid?: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

/**
 * Request to create a bookable Room (CHO-2191 SP1 BE; camelCase FE → snake_case
 * wire). `name` + `capacity` (> 0) required; `campusId`/`branchId` optional and
 * dropped when blank. 201 → the created room.
 */

/**
 * Request to mark attendance for a learner in a delivery session (camelCase FE
 * → snake_case wire). `source` is fixed `manual` (the QR-scan path posts its own
 * `qr-scan` source elsewhere). Idempotent by (session, gcid) server-side.
 */
export interface MarkAttendanceRequest {
  readonly sessionId: string;
  readonly gcid: string;
  readonly status: string;
}

/**
 * Request to add a course→course prerequisite edge to an ATTACHED course
 * (camelCase FE → snake_case wire; ADR-226). All three fields are required —
 * the BE 422s a graph refusal (self-edge / cycle / per-course cap / unknown
 * target course) and 400s malformed input or an unattached `course_id`.
 */
export interface AddPrerequisiteRequest {
  readonly courseId: string;
  readonly prerequisiteCourseId: string;
  readonly kind: PrerequisiteKind;
}

/**
 * Request to remove a course→course prerequisite edge (soft-delete; camelCase
 * FE → snake_case wire; ADR-226).
 */
export interface RemovePrerequisiteRequest {
  readonly courseId: string;
  readonly prerequisiteCourseId: string;
}

/**
 * Request to add one typed content item to an ATTACHED course's outline
 * (camelCase FE → snake_case wire; R+ Phase-2 S1). All four fields are required
 * on the wire — the BE validates the `ref` shape for the `kind` and 400s on a
 * bad/duplicate/over-cap item, or when `course_id` is not attached.
 */
export interface AddCurriculumItemRequest {
  readonly courseId: string;
  /** atom|video|youtube|document|live_classroom|assessment. */
  readonly kind: string;
  /** UUID (atom/assessment/live_classroom) or http(s) URL (video/youtube/document). */
  readonly ref: string;
  readonly title: string;
}

/**
 * Request to reorder an attached course's outline (full permutation of its
 * item ids, camelCase FE → snake_case wire; R+ Phase-2 S1).
 */
export interface ReorderCurriculumRequest {
  readonly courseId: string;
  readonly orderedItemIds: readonly string[];
}

/**
 * Request to remove one item from an attached course's outline (camelCase FE →
 * snake_case wire; R+ Phase-2 S1).
 */
export interface RemoveCurriculumItemRequest {
  readonly courseId: string;
  readonly itemId: string;
}

/** Request to create a module in an attached course (R+ Phase-2 W7). */
export interface CreateModuleRequest {
  readonly courseId: string;
  readonly title: string;
}

/** Request to add a content item (by its curriculum item id) to a module. */
export interface AddModuleItemRequest {
  readonly courseId: string;
  readonly moduleId: string;
  readonly contentItemId: string;
}

/** Request to remove one item from a module. */
export interface RemoveModuleItemRequest {
  readonly courseId: string;
  readonly moduleId: string;
  readonly itemId: string;
}

/** Request to set a module's completion requirement (all_items or n_of_m). */
export interface SetModuleRequirementRequest {
  readonly courseId: string;
  readonly moduleId: string;
  readonly kind: ModuleRequirementKind;
  /** Only meaningful for `n_of_m`; 0 for `all_items`. */
  readonly thresholdN: number;
  readonly requiredItemIds?: readonly string[];
}

/** Request to soft-delete a module. */
export interface RemoveModuleRequest {
  readonly courseId: string;
  readonly moduleId: string;
}

/**
 * Request to set the offering-level completion policy (R+ Phase-2 S2, camelCase
 * FE → snake_case wire). All three fields are always sent — the BE 400s when
 * `passingScorePct` is outside [0,100].
 */
export interface SetCompletionPolicyRequest {
  readonly awardsCertificate: boolean;
  /** Passing score in [0,100]. */
  readonly passingScorePct: number;
  readonly certTitle: string;
}

/**
 * Request to admin-enrol one learner (by GCID) into one of the offering's
 * attached courses (R+ Phase-2 S3, camelCase FE → snake_case wire). Both fields
 * are required — the BE 400s on a missing gcid or an unattached course and 409s
 * when the offering is at capacity.
 */
export interface EnrolLearnerRequest {
  readonly courseId: string;
  readonly gcid: string;
}

/**
 * Request to MANUALLY issue a certificate to one enrolled learner (camelCase FE
 * → snake_case wire). `learnerGcid` is required; `courseId` is optional — when
 * omitted the BE anchors the cert on the offering's primary course, and when
 * provided it MUST be one of the offering's attached courses (the BE 400s
 * otherwise). Blank `courseId` drops from the wire body.
 */
export interface IssueCertificateRequest {
  readonly learnerGcid: string;
  readonly courseId?: string;
}

/**
 * Request to edit an existing section's delivery logistics (R+ Phase-2 S4,
 * camelCase FE → snake_case wire). Every field is optional — only the provided
 * (defined) fields are sent, and the BE leaves omitted fields unchanged. A blank
 * name 400s; a missing section 404s.
 */
export interface UpdateSectionRequest {
  readonly name?: string;
  readonly leadInstructorGcid?: string;
  readonly room?: string;
  readonly startDate?: string;
  readonly endDate?: string;
}

/** Backend course row (subset) from `GET /api/v1/courses`. */
interface BackendCourseRow {
  readonly id: string;
  readonly title: string;
}
interface BackendCoursesList {
  readonly items?: readonly BackendCourseRow[];
}

@Injectable({ providedIn: 'root' })
export class OfferingsService {
  private readonly bff = inject(BffClientService);
  // CHO-2294: the single owner of the durable room lane.
  private readonly rooms = inject(RoomsService);

  /** Search offerings for one page of the current query. */
  search(query: CollectionQuery): Observable<CollectionPage<Offering>> {
    return this.bff
      .get<BackendOfferingSearchPage>('/api/v1/search/offerings', queryToHttpParams(query))
      .pipe(map(mapSearchPage));
  }

  /**
   * Fetch one offering by id (workspace detail). The BE 404s for an unknown,
   * cross-tenant, or soft-deleted offering — the error propagates so the
   * workspace renders its not-found state (no fabricated placeholder).
   */
  getOffering(id: string): Observable<Offering> {
    return this.bff
      .get<BackendOffering>(`/api/v1/offerings/${encodeURIComponent(id)}`)
      .pipe(map(mapBackendOffering));
  }

  /**
   * Read the offering's attached-course curriculum outline (W2.D Curriculum
   * tab) — for each attached course, its title + ordered content outline. The
   * BE returns `{ courses: [{ id, title, items:[...] }] }`; mapping (snake→camel)
   * happens at this boundary. Read-only GET; errors propagate so the panel
   * renders its loud error state (no fixture, no silent empty list). A course
   * with no curriculum yet maps to an empty `items` array (not an error).
   */
  getOfferingCurriculum(offeringId: string): Observable<readonly OfferingCurriculumCourse[]> {
    return this.bff
      .get<BackendOfferingCurriculum>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/curriculum`,
      )
      .pipe(map(mapBackendOfferingCurriculum));
  }

  /**
   * Add one typed content item to an ATTACHED course's outline (R+ Phase-2 S1).
   * POST-only (edge-safe). 201 → the affected course's freshly-mutated outline
   * (`{ course_id, items }` — NOT the whole envelope), which the editor splices
   * back into the matching course row. The BE 400s on a bad kind/ref, a
   * duplicate, an over-cap outline, or when `course_id` is not attached; 403 for
   * a non-admin; 404 for a missing offering — all propagate fail-loud.
   */
  addCurriculumItem(
    offeringId: string,
    req: AddCurriculumItemRequest,
  ): Observable<OfferingCurriculumCourseOutline> {
    return this.bff
      .post<BackendCurriculumCourseOutline>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/curriculum`,
        {
          course_id: req.courseId,
          kind: req.kind,
          ref: req.ref,
          title: req.title,
        },
      )
      .pipe(map(mapBackendCurriculumCourseOutline));
  }

  /**
   * Reorder an attached course's outline to a full permutation of its item ids
   * (R+ Phase-2 S1). 200 → the reordered course outline. The BE 400s on an
   * incomplete/foreign permutation or an unattached course; errors propagate
   * fail-loud so the editor can surface + re-render from the fresh state.
   */
  reorderCurriculum(
    offeringId: string,
    req: ReorderCurriculumRequest,
  ): Observable<OfferingCurriculumCourseOutline> {
    return this.bff
      .post<BackendCurriculumCourseOutline>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/curriculum/reorder`,
        {
          course_id: req.courseId,
          ordered_item_ids: req.orderedItemIds,
        },
      )
      .pipe(map(mapBackendCurriculumCourseOutline));
  }

  /**
   * Remove one item from an attached course's outline (R+ Phase-2 S1). 200 →
   * the remaining course outline. The BE 404s on an unknown item and 400s on an
   * unattached course — both propagate fail-loud.
   */
  removeCurriculumItem(
    offeringId: string,
    req: RemoveCurriculumItemRequest,
  ): Observable<OfferingCurriculumCourseOutline> {
    return this.bff
      .post<BackendCurriculumCourseOutline>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/curriculum/remove`,
        {
          course_id: req.courseId,
          item_id: req.itemId,
        },
      )
      .pipe(map(mapBackendCurriculumCourseOutline));
  }

  // ── R+ Phase-2 W7 (WS-A) — Module course-structure (validated proxy) ──────

  /**
   * List an attached course's modules (R+ Phase-2 W7). GET → the course's
   * active modules in structure order, each with its ordered items + rule. The
   * BE 400s on an unattached/missing course_id, 404 on a missing offering.
   */
  listModules(offeringId: string, courseId: string): Observable<readonly OfferingModule[]> {
    return this.bff
      .get<BackendModuleList>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/modules`,
        new HttpParams().set('course_id', courseId),
      )
      .pipe(map(mapBackendModuleList));
  }

  /**
   * Read per-module completion for an attached course (R+ Phase-2 W7, CHO-2074).
   * As an instructor/admin this returns the cohort roll-up — each module carries
   * `learners[]` with is_complete. Fed by the event-driven StudentModuleProgress
   * projection; a course with no completions returns modules with empty learners.
   */
  getModuleProgress(offeringId: string, courseId: string): Observable<readonly OfferingModuleProgress[]> {
    return this.bff
      .get<BackendModuleProgressList>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/modules/progress`,
        new HttpParams().set('course_id', courseId),
      )
      .pipe(map(mapBackendModuleProgressList));
  }

  /**
   * Create a module in an attached course (R+ Phase-2 W7). 201 → the new module.
   * The BE 400s on an unattached course / blank title, 409 when the course is
   * bundled by a LAUNCHED/RUNNING offering (edit-lock) — all propagate fail-loud.
   */
  createModule(offeringId: string, req: CreateModuleRequest): Observable<OfferingModule> {
    return this.bff
      .post<BackendModule>(`/api/v1/offerings/${encodeURIComponent(offeringId)}/modules`, {
        course_id: req.courseId,
        title: req.title,
      })
      .pipe(map(mapBackendModule));
  }

  /**
   * Add a content item (referenced by its curriculum item id) to a module
   * (R+ Phase-2 W7). 200 → the updated module. The BE 404s on a missing/foreign
   * module, 409 on a duplicate/edit-lock — all propagate fail-loud.
   */
  addModuleItem(offeringId: string, req: AddModuleItemRequest): Observable<OfferingModule> {
    return this.bff
      .post<BackendModule>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/modules/add-item`,
        {
          course_id: req.courseId,
          module_id: req.moduleId,
          content_item_id: req.contentItemId,
        },
      )
      .pipe(map(mapBackendModule));
  }

  /** Remove one item from a module (R+ Phase-2 W7). 200 → the updated module. */
  removeModuleItem(offeringId: string, req: RemoveModuleItemRequest): Observable<OfferingModule> {
    return this.bff
      .post<BackendModule>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/modules/remove-item`,
        {
          course_id: req.courseId,
          module_id: req.moduleId,
          item_id: req.itemId,
        },
      )
      .pipe(map(mapBackendModule));
  }

  /**
   * Set a module's completion requirement (R+ Phase-2 W7). 200 → the updated
   * module. The BE 422s when the rule is invalid for the current item set (e.g.
   * an n_of_m threshold above the item count) — propagates fail-loud.
   */
  setModuleRequirement(
    offeringId: string,
    req: SetModuleRequirementRequest,
  ): Observable<OfferingModule> {
    return this.bff
      .post<BackendModule>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/modules/set-requirement`,
        {
          course_id: req.courseId,
          module_id: req.moduleId,
          kind: req.kind,
          threshold_n: req.thresholdN,
          required_item_ids: req.requiredItemIds ?? [],
        },
      )
      .pipe(map(mapBackendModule));
  }

  /** Soft-delete a module (R+ Phase-2 W7). 200 → the delete ack (mapped to void). */
  removeModule(offeringId: string, req: RemoveModuleRequest): Observable<void> {
    return this.bff
      .post<unknown>(`/api/v1/offerings/${encodeURIComponent(offeringId)}/modules/remove`, {
        course_id: req.courseId,
        module_id: req.moduleId,
      })
      .pipe(map(() => undefined));
  }

  /**
   * Read the certification CONFIG of the offering's attached courses (W2.D
   * Certification tab) — for each attached course, the certificate it awards on
   * completion (cert type, passing score, content requirement). The BE returns
   * `{ courses: [{ id, title, certifications:[...] }] }`; mapping (snake→camel)
   * happens at this boundary. This is config (what the course awards), NOT
   * issuance — no learner credential, transcript, or completion status. Read-only
   * GET; errors propagate so the panel renders its loud error state (no fixture,
   * no silent empty list). A course awarding no certificate maps to an empty
   * `certifications` array (not an error).
   */
  getOfferingCertification(offeringId: string): Observable<OfferingCertification> {
    return this.bff
      .get<BackendOfferingCertification>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/certification`,
      )
      .pipe(map(mapBackendOfferingCertificationEnvelope));
  }

  /**
   * Set the editable offering-level completion policy (R+ Phase-2 S2). PATCH-only
   * (edge-safe). The per-course cert config stays read-only; this is the delivery
   * decision ("cert = policy on top"). 200 → the saved policy (with `updated_at`).
   * The BE 400s when the passing score is outside [0,100], 403s for a non-admin,
   * and 404s for a missing offering — all propagate fail-loud so the panel can
   * surface the BE `{error}` message and preserve the author's input.
   */
  setCompletionPolicy(
    offeringId: string,
    req: SetCompletionPolicyRequest,
  ): Observable<OfferingCompletionPolicy> {
    return this.bff
      .patch<BackendOfferingCompletionPolicy>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/certification`,
        {
          awards_certificate: req.awardsCertificate,
          passing_score_pct: req.passingScorePct,
          cert_title: req.certTitle,
        },
      )
      .pipe(map(mapBackendOfferingCompletionPolicy));
  }

  /**
   * Read the offering ROSTER (W7 Roster tab) — for each attached course, the
   * learners enrolled in it, plus a distinct-people count across the offering.
   * The BE returns `{ courses: [{ id, title, learners:[...], learner_count }],
   * distinct_learner_count }`; mapping (snake→camel) happens at this boundary.
   * display_name falls back to the GCID and progress_pct to 0 while the upstream
   * identity/consumption projections are unwired (fail-visible, not fabricated).
   * Read-only GET; errors propagate so the panel renders its loud error state
   * (no fixture, no silent empty list). A course with no enrolments maps to an
   * empty `learners` array (not an error).
   */
  getOfferingRoster(offeringId: string): Observable<OfferingRoster> {
    return this.bff
      .get<BackendOfferingRoster>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/roster`,
      )
      .pipe(map(mapBackendOfferingRoster));
  }

  /**
   * Admin-enrol one learner (by GCID) into one of the offering's attached courses
   * (R+ Phase-2 S3). POST-only (edge-safe). 201 → the created enrolment. The BE
   * 400s on a missing gcid / unattached course, 409s "offering is at capacity",
   * 403s for a non-admin, and 404s for a missing offering — all propagate
   * fail-loud so the panel surfaces the BE `{error}` and preserves the input.
   */
  enrolLearner(
    offeringId: string,
    req: EnrolLearnerRequest,
  ): Observable<OfferingEnrollment> {
    return this.bff
      .post<BackendOfferingEnrollment>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/roster`,
        {
          course_id: req.courseId,
          gcid: req.gcid,
        },
      )
      .pipe(map(mapBackendOfferingEnrollment));
  }

  /**
   * Atomically bulk-enrol many learners (by GCID) into ONE attached course
   * (issue 4b). POST-only (edge-safe). 201 -> the batch result
   * {requestedCount, insertedCount, enrollmentIds}. All-or-nothing on the BE
   * (transactional outbox): a mid-batch failure enrols no one. Idempotent:
   * already-active learners are skipped (not re-counted). The BE 400s an
   * unattached course / empty gcids, 403s a non-admin, 404s a missing offering,
   * 409s "batch exceeds capacity" - all propagate fail-loud so the panel
   * surfaces the BE {error} and preserves the selection.
   */
  bulkEnrolLearners(
    offeringId: string,
    req: BulkEnrolLearnersRequest,
  ): Observable<BulkEnrolResult> {
    return this.bff
      .post<BackendBulkEnrolResult>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/roster/bulk`,
        { course_id: req.courseId, gcids: [...req.gcids] },
      )
      .pipe(map(mapBackendBulkEnrolResult));
  }

  /**
   * Admin-unenrol one learner (by GCID) from one of the offering's attached
   * courses (R+ Phase-2 WS-B) — the cancel sibling of {@link enrolLearner}.
   * POST-only (edge-safe); the wire body mirrors the enrol shape
   * (`{course_id, gcid}`). 204 → void. The BE 400s on a missing gcid /
   * unattached course, 404s for a missing offering OR a missing enrolment, and
   * 403s for a non-admin — all propagate fail-loud so the panel surfaces the BE
   * `{error}` and leaves the roster intact.
   */
  removeLearner(offeringId: string, req: EnrolLearnerRequest): Observable<void> {
    return this.bff
      .post<void>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/roster/remove`,
        {
          course_id: req.courseId,
          gcid: req.gcid,
        },
      )
      .pipe(map(() => undefined));
  }

  /**
   * MANUALLY issue a certificate to one enrolled learner (the Certification
   * tab's per-learner action). POST-only (edge-safe; the offerings glob already
   * covers the sibling GET/PATCH /certification). This is the admin lane of the
   * WIRED auto-issue engine — it mints a real Certification credential and emits
   * certification.issued.v1. 201 → the minted cert's `{certificationId, courseId,
   * gcid}`. The BE 400s a missing gcid / a `courseId` not attached to the
   * offering, 403s a non-admin, 404s a missing offering, and 409s when the
   * learner ALREADY holds a certificate for that course — all propagate
   * fail-loud so the panel can surface a friendly per-row state (409 is treated
   * as a "already holds a certificate" info state, not an error, at the call site).
   * Blank `courseId` drops from the wire body (BE defaults to the primary course).
   */
  issueCertificate(
    offeringId: string,
    req: IssueCertificateRequest,
  ): Observable<OfferingCertificateIssued> {
    const body: Record<string, unknown> = { learner_gcid: req.learnerGcid };
    if (req.courseId !== undefined && req.courseId.length > 0) {
      body['course_id'] = req.courseId;
    }
    return this.bff
      .post<BackendOfferingCertificateIssued>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/certification/issue`,
        body,
      )
      .pipe(map(mapBackendOfferingCertificateIssued));
  }

  /**
   * Read the offering ANALYTICS roll-up (W7 Analytics tab, async self-paced
   * offerings) — enrolment counts (total + distinct people), capacity
   * utilisation, assessment count, lifecycle state, and a per-course breakdown.
   * All delivery-local; the BE returns `{ state, capacity, capacity_unbounded,
   * capacity_utilisation_pct, total_enrollments, distinct_learners,
   * assessment_count, launched_at, concluded_at, courses:[...] }`; mapping
   * (snake→camel) happens at this boundary. completion/pass-rate + avg progress
   * are deferred (the panel says so) — never faked. Read-only GET; errors
   * propagate so the panel renders its loud error state.
   */
  getOfferingAnalytics(offeringId: string): Observable<OfferingAnalytics> {
    return this.bff
      .get<BackendOfferingAnalytics>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/analytics`,
      )
      .pipe(map(mapBackendOfferingAnalytics));
  }

  /**
   * Apply an FSM transition (launch/start/conclude/archive). The BE sub-route
   * takes NO request body; an empty object is sent to satisfy the PATCH adapter
   * without any wire payload. Returns the updated offering. A 409 (illegal for
   * the current state) propagates so the caller can render a non-destructive
   * conflict + reload affordance.
   */
  transition(id: string, action: OfferingTransition): Observable<Offering> {
    return this.bff
      .patch<BackendOffering>(`/api/v1/offerings/${encodeURIComponent(id)}/${action}`, {})
      .pipe(map(mapBackendOffering));
  }

  /**
   * Create a DRAFT offering. Tenant + author are stamped server-side off the
   * validated mesh claims (not sent on the wire). 201 → the new offering; 400
   * (validation) / 403 (non-admin) propagate for loud surfacing.
   */
  createOffering(req: CreateOfferingRequest): Observable<Offering> {
    return this.bff
      .post<BackendOffering>('/api/v1/offerings', {
        course_ids: req.courseIds,
        delivery_type: req.deliveryType,
        label: req.label,
        capacity: req.capacity,
      })
      .pipe(map(mapBackendOffering));
  }

  /**
   * List PUBLISHED courses for the create-offering select. Mirrors the catalog
   * call (`GET /api/v1/courses?state=PUBLISHED&page_size=50`) which requires a
   * `state` param. PUBLISHED is the deliverable set — an admin builds an
   * offering over a course that is ready to deliver. Returns a minimal
   * `{id,label}[]`; an empty list renders an honest empty-state in the form.
   */
  listCourses(): Observable<readonly OfferingCourseOption[]> {
    const params = new HttpParams().set('state', 'PUBLISHED').set('page_size', '50');
    return this.bff
      .get<BackendCoursesList>('/api/v1/courses', params)
      .pipe(map((resp) => (resp.items ?? []).map((c) => ({ id: c.id, label: c.title }))));
  }

  /**
   * Count how many offerings bundle a given course — the "blast radius" of
   * editing that course (a course shared across N offerings means one edit
   * touches all N). Uses the offering FINDER (`GET /api/v1/search/offerings`)
   * with the `course_id` facet — the plain `GET /api/v1/offerings` list is
   * ListByTenant (no course filter, no total) and would over-count. `limit=1`
   * keeps the page to a single row since only `total_estimate` is read (that
   * estimate INCLUDES the current offering). Defaults to 0 when the field is
   * absent. HTTP errors propagate so the caller can degrade to no badge —
   * fail-loud at the transport, fail-soft at the call site.
   */
  countOfferingsForCourse(courseId: string): Observable<number> {
    const params = new HttpParams().set('course_id', courseId).set('limit', '1');
    return this.bff
      .get<{ readonly total_estimate?: number }>('/api/v1/search/offerings', params)
      .pipe(map((resp) => resp.total_estimate ?? 0));
  }

  // ── W3.A: offering assessments (list / attach / detach) + test-set picker ──

  /**
   * List the assessments attached to one offering (the Assessments panel). The
   * BE returns `{ items, next_page_token }`; the panel renders a single page
   * (assessment counts per offering are small), so the page token is not yet
   * surfaced — the mapped items are returned directly. Errors propagate so the
   * panel renders its loud error state (no fixture, no silent empty list).
   */
  listOfferingAssessments(offeringId: string): Observable<readonly OfferingAssessment[]> {
    return this.bff
      .get<BackendOfferingAssessmentPage>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/assessments`,
      )
      .pipe(map((resp) => (resp.items ?? []).map(mapBackendOfferingAssessment)));
  }

  /**
   * Attach a PUBLISHED test-set to an offering as a new Assessment. 201 → the
   * created assessment. The BE 404s when the offering is missing and 400s when
   * the test-set is missing / not PUBLISHED — both propagate for loud surfacing.
   */
  attachAssessment(
    offeringId: string,
    req: AttachAssessmentRequest,
  ): Observable<OfferingAssessment> {
    const body: Record<string, unknown> = { test_set_id: req.testSetId };
    if (req.titleOverride !== undefined && req.titleOverride.length > 0) {
      body['title_override'] = req.titleOverride;
    }
    if (req.scheduledOpenAt !== undefined && req.scheduledOpenAt.length > 0) {
      body['scheduled_open_at'] = req.scheduledOpenAt;
    }
    if (req.scheduledCloseAt !== undefined && req.scheduledCloseAt.length > 0) {
      body['scheduled_close_at'] = req.scheduledCloseAt;
    }
    if (req.maxAttempts !== undefined) {
      body['max_attempts'] = req.maxAttempts;
    }
    return this.bff
      .post<BackendOfferingAssessment>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/assessments`,
        body,
      )
      .pipe(map(mapBackendOfferingAssessment));
  }

  /**
   * Detach an assessment from its offering by archiving it (soft-delete; the
   * EXISTING `POST /assessments/:id/archive` route). NEVER hard-delete. The
   * route takes no body; a 200 resolves and any error propagates fail-loud.
   */
  detachAssessment(assessmentId: string): Observable<void> {
    return this.bff
      .post<void>(`/api/v1/assessments/${encodeURIComponent(assessmentId)}/archive`, {})
      .pipe(map(() => undefined));
  }

  /**
   * List the caller-tenant's PUBLISHED test-sets for the attach picker. Passes
   * `state=PUBLISHED` to the BE AND filters client-side (defence in depth — the
   * picker must NEVER offer a DRAFT/ARCHIVED set, which the BE would reject on
   * attach). Returns a light `{id,title,state,questionCount,totalPoints}[]`.
   */
  listPublishedTestSets(): Observable<readonly TestSetSummary[]> {
    const params = new HttpParams().set('state', 'PUBLISHED');
    return this.bff
      .get<BackendTestSetPage>('/api/v1/test-sets', params)
      .pipe(
        map((resp) =>
          (resp.items ?? [])
            .filter((t) => t.state === 'PUBLISHED')
            .map(mapBackendTestSet),
        ),
      );
  }

  // ── W7: offering sections (intra-cohort sub-groups; list / create) ─────────

  /**
   * List the intra-cohort sections of a graduate offering (the Sections panel).
   * The BE returns `{ sections: [...] }`; mapping (snake→camel) happens at this
   * boundary. Errors propagate so the panel renders its loud error state (no
   * fixture, no silent empty list). An offering with no sections maps to an
   * empty array (not an error).
   */
  getOfferingSections(offeringId: string): Observable<readonly OfferingSection[]> {
    return this.bff
      .get<BackendOfferingSections>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/sections`,
      )
      .pipe(map((resp) => (resp.sections ?? []).map(mapBackendOfferingSection)));
  }

  /**
   * Create an intra-cohort Section on a graduate offering. 201 → the created
   * section. The BE 404s when the offering is missing, 409s when the offering is
   * not a graduate cohort, and 400s on a blank name — all propagate fail-loud.
   * Blank optional fields are omitted from the wire body.
   */
  createOfferingSection(
    offeringId: string,
    req: CreateSectionRequest,
  ): Observable<OfferingSection> {
    const body: Record<string, unknown> = { name: req.name };
    if (req.leadInstructorGcid !== undefined && req.leadInstructorGcid.length > 0) {
      body['lead_instructor_gcid'] = req.leadInstructorGcid;
    }
    if (req.room !== undefined && req.room.length > 0) {
      body['room'] = req.room;
    }
    if (req.startDate !== undefined && req.startDate.length > 0) {
      body['start_date'] = req.startDate;
    }
    if (req.endDate !== undefined && req.endDate.length > 0) {
      body['end_date'] = req.endDate;
    }
    return this.bff
      .post<BackendOfferingSection>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/sections`,
        body,
      )
      .pipe(map(mapBackendOfferingSection));
  }

  /**
   * Edit an existing section's delivery logistics (R+ Phase-2 S4). PATCH-only
   * (edge-safe). Only the CHANGED (defined) fields are sent — the BE leaves
   * omitted fields unchanged. 200 → the updated section (which the panel splices
   * back over that row, no re-GET). The BE 404s for a missing offering/section
   * and 400s on a blank name — both propagate fail-loud so the panel surfaces the
   * BE `{error}` and preserves the edits.
   */
  updateSection(
    offeringId: string,
    sectionId: string,
    patch: UpdateSectionRequest,
  ): Observable<OfferingSection> {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) {
      body['name'] = patch.name;
    }
    if (patch.leadInstructorGcid !== undefined) {
      body['lead_instructor_gcid'] = patch.leadInstructorGcid;
    }
    if (patch.room !== undefined) {
      body['room'] = patch.room;
    }
    if (patch.startDate !== undefined) {
      body['start_date'] = patch.startDate;
    }
    if (patch.endDate !== undefined) {
      body['end_date'] = patch.endDate;
    }
    return this.bff
      .patch<BackendOfferingSection>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/sections/${encodeURIComponent(
          sectionId,
        )}`,
        body,
      )
      .pipe(map(mapBackendOfferingSection));
  }

  // ── CHO-1985: offering schedule (delivery sessions; list + create) ─────────

  /**
   * List the scheduled delivery sessions of a short-course offering (the
   * Schedule panel). The BE returns `{ sessions: [...] }` ordered by starts_at;
   * mapping (snake→camel) happens at this boundary. Errors propagate so the
   * panel renders its loud error state (no fixture, no silent empty list). An
   * offering with no sessions maps to an empty array (not an error).
   */
  getOfferingSchedule(offeringId: string): Observable<readonly OfferingSession[]> {
    return this.bff
      .get<BackendOfferingSchedule>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/schedule`,
      )
      .pipe(map((resp) => (resp.sessions ?? []).map(mapBackendOfferingSession)));
  }

  /**
   * Schedule a delivery Session on a short-course offering. 201 → the created
   * session. The BE 404s when the offering is missing and 400s on a blank title
   * or an invalid window (ends ≤ starts). CHO-2191: a room is booked by `roomId`
   * — the BE 400s `room_required` if a free-text room comes with no id,
   * `room_not_found` for an unknown id, 409 `room_over_capacity` when the
   * offering budget exceeds the room, and 409 `room_double_booked` on an
   * overlapping same-room window. Blank `roomId`/`instructorGcid` are omitted
   * (a roomless session is allowed). All propagate fail-loud.
   */
  createOfferingSession(
    offeringId: string,
    req: CreateSessionRequest,
  ): Observable<OfferingSession> {
    const body: Record<string, unknown> = {
      title: req.title,
      starts_at: req.startsAt,
      ends_at: req.endsAt,
    };
    if (req.roomId !== undefined && req.roomId.length > 0) {
      body['room_id'] = req.roomId;
    }
    if (req.instructorGcid !== undefined && req.instructorGcid.length > 0) {
      body['instructor_gcid'] = req.instructorGcid;
    }
    return this.bff
      .post<BackendOfferingSession>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/schedule`,
        body,
      )
      .pipe(map(mapBackendOfferingSession));
  }

  // ── CHO-2191 rooms, CHO-2294: DELEGATED to RoomsService ────────────────────
  // These two methods used to own the HTTP for /api/v1/rooms. They now forward
  // to RoomsService so the Schedule-tab picker and the Campus Operations rooms
  // screen are provably the same list rather than two copies that can drift.
  // Kept on this service so existing workspace call sites need no change.

  /** List this tenant's bookable rooms (the schedule picker source). */
  listRooms(): Observable<readonly RoomOption[]> {
    return this.rooms.listRooms();
  }

  /** Create a bookable Room. Blank campus/branch ids never reach the wire. */
  createRoom(req: CreateRoomRequest): Observable<RoomOption> {
    return this.rooms.createRoom(req);
  }

  // ── CHO-1986: offering attendance (session-scoped records; mark + list) ────

  /**
   * List the attendance records for ONE delivery session (the Attendance panel).
   * The BE returns `{ records: [...] }`; mapping (snake→camel) happens at this
   * boundary. Errors propagate so the panel renders its loud error state (no
   * fixture, no silent empty list). A session with no marks maps to an empty
   * array (not an error).
   *
   * CHO-2186 — the session id travels as a PATH SEGMENT and MUST NOT become a
   * query param again. Cloud Armor rule 1008 → OWASP CRS 943110 ("Session
   * Fixation: SessionID Parameter Name with Off-Domain Referrer") denies any
   * request whose ARGS carry a name containing `session_id` when the Referer is
   * off-domain. Both halves hold permanently here: R+ runs on rplus.chora.site
   * and calls api.chora.site, so the Referer is ALWAYS cross-subdomain. The
   * query form was edge-denied 100% of the time — this panel had NEVER loaded in
   * production, while the POST kept writing marks (body args are not inspected).
   * Renaming the param does not escape the rule: CRS matches the substring.
   */
  getOfferingAttendance(
    offeringId: string,
    sessionId: string,
  ): Observable<readonly OfferingAttendanceRecord[]> {
    return this.bff
      .get<BackendOfferingAttendance>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/attendance/${encodeURIComponent(sessionId)}`,
      )
      .pipe(map((resp) => (resp.records ?? []).map(mapBackendAttendanceRecord)));
  }

  /**
   * Mark attendance for a learner in a session (`source: manual`). 200/201 → the
   * record (idempotent by session+gcid server-side, so a re-mark upserts). The
   * BE 400s on an invalid status and 403s for a non-admin — both propagate
   * fail-loud.
   */
  markAttendance(
    offeringId: string,
    req: MarkAttendanceRequest,
  ): Observable<OfferingAttendanceRecord> {
    return this.bff
      .post<BackendAttendanceRecord>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/attendance`,
        {
          session_id: req.sessionId,
          gcid: req.gcid,
          status: req.status,
          source: 'manual',
        },
      )
      .pipe(map(mapBackendAttendanceRecord));
  }

  // ── CHO-1987: offering publish / catalog handoff (read + action) ───────────

  /**
   * Read the catalog-visibility state of an async offering's attached courses
   * (the Publish panel) — for each course, its visibility + published flag. The
   * BE returns `{ courses: [...] }`; mapping (snake→camel) happens at this
   * boundary. Read-only GET; errors propagate so the panel renders its loud
   * error state (no fixture, no silent empty list).
   */
  getOfferingPublish(offeringId: string): Observable<OfferingPublishState> {
    return this.bff
      .get<BackendOfferingPublish>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/publish`,
      )
      .pipe(map(mapBackendOfferingPublish));
  }

  /**
   * Publish the offering's attached courses to the catalogue (transition each to
   * public). The BE sub-route takes NO request body; an empty object is sent to
   * satisfy the PATCH adapter. Returns the updated courses + `published_count`
   * (0 when they were all already public — the action is an idempotent no-op).
   * Errors propagate fail-loud so the panel can render a retry affordance.
   */
  publishOffering(offeringId: string): Observable<OfferingPublishState> {
    return this.bff
      .patch<BackendOfferingPublish>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/publish`,
        {},
      )
      .pipe(map(mapBackendOfferingPublish));
  }

  // ── ADR-226: offering prerequisites (structured course→course DAG) ────────

  /**
   * Read the offering's attached-course prerequisite DAG (the Prerequisites
   * tab) — for each attached course, its structured course→course edges
   * (cycle-checked, cap-enforced, resolved target titles server-side) PLUS its
   * free-text `PrerequisiteNotes`. The BE returns `{ courses: [{ course_id,
   * title, prerequisite_notes, prerequisites:[...] }] }`; mapping (snake→camel)
   * happens at this boundary. Read-only GET; errors propagate so the panel
   * renders its loud error state (no fixture, no silent empty list). A course
   * with no edges yet maps to an empty `prerequisites` array (not an error).
   */
  listPrerequisites(offeringId: string): Observable<readonly OfferingPrerequisiteCourse[]> {
    return this.bff
      .get<BackendOfferingPrerequisites>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/prerequisites`,
      )
      .pipe(map(mapBackendOfferingPrerequisites));
  }

  /**
   * Add a course→course prerequisite edge to an ATTACHED course (ADR-226).
   * POST-only (edge-safe). 200 → the affected course's freshly-mutated edge
   * list (`{ course_id, prerequisites }` — NOT the whole envelope), which the
   * editor splices back into the matching course row (no re-GET). The
   * prerequisite TARGET is validated against the FULL tenant catalogue (not
   * just this offering's attached courses) — the BE 422s a graph refusal
   * (self-edge / cycle / per-course cap / unknown course) and 400s malformed
   * input or an unattached `course_id`; both propagate fail-loud.
   */
  addPrerequisite(
    offeringId: string,
    req: AddPrerequisiteRequest,
  ): Observable<OfferingPrerequisiteCourseEdges> {
    return this.bff
      .post<BackendPrerequisiteCourseEdges>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/prerequisites`,
        {
          course_id: req.courseId,
          prerequisite_course_id: req.prerequisiteCourseId,
          kind: req.kind,
        },
      )
      .pipe(map(mapBackendPrerequisiteCourseEdges));
  }

  /**
   * Remove a course→course prerequisite edge (soft-delete; ADR-226). POST-only
   * (edge-safe). 200 → the remaining edge list for the affected course. The BE
   * 400s on malformed input or an unattached `course_id` — propagates
   * fail-loud so the panel surfaces the BE `{error}`/`{message}` and leaves
   * the edge list intact.
   */
  removePrerequisite(
    offeringId: string,
    req: RemovePrerequisiteRequest,
  ): Observable<OfferingPrerequisiteCourseEdges> {
    return this.bff
      .post<BackendPrerequisiteCourseEdges>(
        `/api/v1/offerings/${encodeURIComponent(offeringId)}/prerequisites/remove`,
        {
          course_id: req.courseId,
          prerequisite_course_id: req.prerequisiteCourseId,
        },
      )
      .pipe(map(mapBackendPrerequisiteCourseEdges));
  }

  // ── W6: offering transcript (per-offering gradebook join) ──────────────────

  /**
   * Read per-learner transcript results for a set of offering assessments
   * (the Transcript tab gradebook, W6) — chora-consumption `StudentTranscript`
   * read model, joined client-side by the panel against the offering's
   * assessments (title) + roster (display name). The transcript row now carries
   * its own `title` too (`submission.graded.v1` field 13 `assessment_title`,
   * persisted in `student_transcript_entries.title`), but the panel keeps using
   * the offering's assessment title as its source of truth for that column. The
   * BE returns `{ items:[...] }` spanning EVERY learner in the tenant for the given
   * assessment ids (role-gated server-side to admin/instructor); mapping
   * (snake→camel) happens at this boundary. `assessmentIds=[]` short-circuits
   * to an empty result with NO HTTP call — nothing to ask for when the
   * offering has no assessments yet (the panel already renders its own "no
   * assessments" empty-state from that empty list). Read-only GET; errors
   * propagate so the panel renders its loud error state (no fixture, no
   * silent empty list).
   */
  getTranscriptByAssessments(
    assessmentIds: readonly string[],
  ): Observable<readonly TranscriptEntry[]> {
    if (assessmentIds.length === 0) {
      return of([]);
    }
    const params = new HttpParams().set('assessment_ids', assessmentIds.join(','));
    return this.bff
      .get<BackendTranscriptByAssessments>('/api/v1/transcript/by-assessments', params)
      .pipe(map((resp) => (resp.items ?? []).map(mapBackendTranscriptEntry)));
  }
}

function mapSearchPage(resp: BackendOfferingSearchPage): CollectionPage<Offering> {
  return {
    items: (resp.items ?? []).map(mapBackendOffering),
    facets: (resp.facets ?? []).map(mapFacet),
    nextCursor: resp.next_cursor ?? null,
    totalEstimate: resp.total_estimate ?? 0,
  };
}

function mapFacet(facet: BackendOfferingSearchPage['facets'][number]): CollectionFacet {
  return {
    field: facet.field,
    values: (facet.values ?? []).map((value) => ({
      value: value.value,
      // Display label is an i18n KEY at the FE boundary (the renderer pipes it
      // through TranslatePipe); shared with the table badge cells.
      label: offeringFacetValueLabelKey(facet.field, value.value),
      count: value.count,
    })),
  };
}
