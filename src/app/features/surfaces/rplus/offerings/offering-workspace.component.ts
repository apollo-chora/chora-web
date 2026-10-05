/**
 * OfferingWorkspaceComponent — the `/r/offerings/:id` workspace (R+ W2.D).
 *
 * Opening one offering from the finder yields this workspace. Per ADR-141 the
 * UI is INTEGRATIVE — there is NO mode toggle:
 *   - the tab SET is OBJECT-DERIVED from `offering.deliveryType`
 *     (`offeringTabs`, plan §4) — the user never switches delivery mode here;
 *   - the Overview lifecycle buttons are DERIVED from `offering.state`
 *     (`offeringActions`, the W1/W2.B FSM);
 *   - those buttons are role-gated by VISIBILITY (hidden for non-admins, not
 *     merely disabled) via `canManage`.
 *
 * P0 renders Overview real; every other tab is present-per-delivery_type but
 * shows an honest "coming soon" empty-state (the tab set is real; the content
 * lands later). Data is real BFF wiring (`OfferingsService`) — fail-loud, no
 * fixtures, no fabricated success (feedback_no_stubs_real_wiring): a failed
 * fetch shows a loud error (with retry, or a back-to-finder link on 404), and
 * a 409 transition shows a non-destructive conflict + reload affordance.
 *
 * `:id` is bound via `withComponentInputBinding()` (app.config.ts §8); the
 * active tab is the `?tab=` query param (default `overview`), URL-synced so the
 * view is shareable / back-safe.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../core/services/translate.service';
import { RbacService } from '../../../../core/services/rbac.service';
import { httpErrorView, isApiError } from '../../../../core/interceptors/api-error.model';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { OfferingsService } from './offerings.service';
import { ChoraEntityPickerComponent } from '../../../../shared/components/chora-entity-picker/entity-picker.component';
import { MemberMultiselectComponent } from '../../../../shared/components/member-multiselect/member-multiselect.component';
import type {
  EntityFacets,
  EntityRef,
  EntitySearchPort,
  EntityType,
} from '../../../../shared/components/chora-entity-picker/entity-picker.model';
import { AtomEntitySearchPort } from './adapters/atom-entity-search.port';
import { TestSetEntitySearchPort } from './adapters/test-set-entity-search.port';
import { LiveQuizEntitySearchPort } from './adapters/live-quiz-entity-search.port';
import { MemberEntitySearchPort } from '../../../../shared/components/transaction-history/adapters/member-entity-search.port';
import { CourseEntitySearchPort } from './adapters/course-entity-search.port';
import {
  attendanceStatusLabelKey,
  certTypeLabelKey,
  curriculumKindLabelKey,
  curriculumKindRefIsUuid,
  deliveryTypeLabelKey,
  offeringAssessmentStateLabelKey,
  offeringPublishVisibilityLabelKey,
  prerequisiteKindLabelKey,
  stateLabelKey,
  OFFERING_ATTENDANCE_STATUSES,
  OFFERING_CURRICULUM_KINDS,
  OFFERING_MODULE_REQUIREMENT_KINDS,
  OFFERING_PREREQUISITE_KINDS,
  type Offering,
  type OfferingAssessment,
  type OfferingAttendanceRecord,
  type OfferingCertificationCourse,
  type OfferingCompletionPolicy,
  type OfferingCurriculumCourse,
  type OfferingCurriculumCourseOutline,
  type OfferingCurriculumItem,
  type OfferingModule,
  type OfferingModuleProgress,
  type ModuleRequirementKind,
  type OfferingAnalytics,
  type OfferingAnalyticsCourse,
  type OfferingPrerequisiteCourse,
  type OfferingPrerequisiteCourseEdges,
  type OfferingPrerequisiteEdge,
  type OfferingPublishCourse,
  type OfferingRoster,
  type OfferingRosterCourse,
  type OfferingRosterLearner,
  type OfferingSection,
  type OfferingSession,
  type RoomOption,
  type OfferingTransition,
  type PrerequisiteKind,
  type TestSetSummary,
  type TranscriptEntry,
} from './offerings.model';
import {
  offeringTabs,
  type OfferingTab,
  type OfferingTabId,
} from './offering-workspace.tabs';
import {
  offeringActions,
  offeringConflictKey,
  type OfferingAction,
} from './offering-workspace.fsm';

/** Discriminated load state for the workspace detail fetch. */
type WorkspaceLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly offering: Offering }
  | { readonly status: 'error'; readonly errorKey: string; readonly notFound: boolean };

/** Discriminated load state for the Assessments panel list (W3.A). */
type AssessmentsLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly items: readonly OfferingAssessment[] }
  | { readonly status: 'error'; readonly errorKey: string };

/** Discriminated load state for the attach-picker test-set list (W3.A). */
type TestSetsLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly items: readonly TestSetSummary[] }
  | { readonly status: 'error'; readonly errorKey: string };

/** Discriminated load state for the Curriculum panel list (W2.D). */
type CurriculumLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly courses: readonly OfferingCurriculumCourse[] }
  | { readonly status: 'error'; readonly errorKey: string };

/** Discriminated load state for the Certification panel (W2.D + S2 policy). */
type CertificationLoadState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly courses: readonly OfferingCertificationCourse[];
      /** Editable offering-level completion policy; null until first set (S2). */
      readonly completionPolicy: OfferingCompletionPolicy | null;
    }
  | { readonly status: 'error'; readonly errorKey: string };

/** Discriminated load state for the Roster panel (W7). */
type RosterLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly roster: OfferingRoster }
  | { readonly status: 'error'; readonly errorKey: string };

/** Discriminated load state for the Analytics panel (W7, async). */
type AnalyticsLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly analytics: OfferingAnalytics }
  | { readonly status: 'error'; readonly errorKey: string };

/** Discriminated load state for the Sections panel list (W7). */
type SectionsLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly items: readonly OfferingSection[] }
  | { readonly status: 'error'; readonly errorKey: string };

/** Discriminated load state for the Schedule panel session list (CHO-1985). */
type ScheduleLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly sessions: readonly OfferingSession[] }
  | { readonly status: 'error'; readonly errorKey: string };

/** Discriminated load state for the Attendance panel record list (CHO-1986). */
type AttendanceLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly records: readonly OfferingAttendanceRecord[] }
  | { readonly status: 'error'; readonly errorKey: string };

/** Discriminated load state for the Publish panel course list (CHO-1987). */
type PublishLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly courses: readonly OfferingPublishCourse[] }
  | { readonly status: 'error'; readonly errorKey: string };

/** Discriminated load state for the Prerequisites panel list (ADR-226). */
type PrerequisitesLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly courses: readonly OfferingPrerequisiteCourse[] }
  | { readonly status: 'error'; readonly errorKey: string };

/**
 * Discriminated load state for the Transcript panel's own gradebook-join GET
 * (W6) — the panel ALSO reuses the Assessments + Roster load states above for
 * its other two data sources; this one is exclusively for the new
 * `GET /transcript/by-assessments` call.
 */
type TranscriptLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly items: readonly TranscriptEntry[] }
  | { readonly status: 'error'; readonly errorKey: string };

/** Roles that may manage an offering — mirrors the backend hasOfferingAdminRole. */
const OFFERING_ADMIN_ROLES = ['instructor', 'admin', 'training_admin', 'tenant_admin'] as const;

@Component({
  selector: 'chora-rplus-offering-workspace',
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
    TranslatePipe,
    ChoraEntityPickerComponent,
    MemberMultiselectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './offering-workspace.component.html',
  styleUrl: './offering-workspace.component.scss',
})
export class OfferingWorkspaceComponent {
  private readonly service = inject(OfferingsService);
  private readonly atomSearch = inject(AtomEntitySearchPort);
  private readonly testSetSearch = inject(TestSetEntitySearchPort);
  private readonly liveQuizSearch = inject(LiveQuizEntitySearchPort);
  /** People picker (roster/attendance/sections/schedule, CHO-18 workstream C).
   *  `protected` (not `private`) — bound directly in the template via
   *  `[searchPortOverride]`, mirroring how `instructorFacet` is bound below. */
  protected readonly memberSearch = inject(MemberEntitySearchPort);
  /** Facet override for the two instructor-role pickers (sections lead / schedule
   *  instructor) — the member port defaults to `role=learner`; this scopes the
   *  search to `tenant_memberships.role = 'instructor'` instead. Stable field
   *  reference (not an inline literal) so the picker's `[facets]` input never
   *  churns across change-detection cycles. */
  protected readonly instructorFacet: EntityFacets = { role: 'instructor' };
  private readonly courseSearch = inject(CourseEntitySearchPort);
  private readonly rbac = inject(RbacService);
  private readonly translate = inject(TranslateService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /** `:id` path param (withComponentInputBinding). */
  readonly id = input.required<string>();

  /**
   * Active-tab `?tab=` query param (withComponentInputBinding). The input name
   * must equal the query-param key (`tab`); `activeTabId` normalises it against
   * the derived set.
   */
  readonly tab = input<string | undefined>(undefined);

  /** Tab button refs for roving-tabindex focus management. */
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');

  private readonly loadStateSignal = signal<WorkspaceLoadState>({ status: 'loading' });
  private readonly pendingActionSignal = signal<OfferingTransition | null>(null);
  private readonly conflictActionSignal = signal<OfferingTransition | null>(null);
  private readonly actionErrorSignal = signal<boolean>(false);
  /**
   * Raw BE `{error}` text for a failed lifecycle action (S5). Surfaced loudly so
   * the launch-readiness 422 ("offering has no curriculum content …") renders
   * verbatim near the Launch control rather than a generic message; '' → the
   * generic action-error key.
   */
  private readonly actionErrorDetailSignal = signal<string>('');

  // ── Assessments panel state (W3.A) ─────────────────────────────────────
  private readonly assessmentsStateSignal = signal<AssessmentsLoadState>({ status: 'loading' });
  /** Offering id the list was last (re)loaded for — guards the lazy effect. */
  private readonly assessmentsLoadedForId = signal<string | null>(null);
  private readonly pickerOpenSignal = signal<boolean>(false);
  private readonly testSetsStateSignal = signal<TestSetsLoadState>({ status: 'loading' });
  private readonly testSetsLoadedSignal = signal<boolean>(false);
  /** test_set_id currently being attached (per-row busy + re-entrancy guard). */
  private readonly attachingIdSignal = signal<string | null>(null);
  private readonly attachErrorSignal = signal<boolean>(false);
  private readonly attachSucceededSignal = signal<boolean>(false);
  /** assessment id currently being removed (per-row busy + re-entrancy guard). */
  private readonly removingIdSignal = signal<string | null>(null);
  private readonly removeErrorSignal = signal<boolean>(false);

  // ── Curriculum panel state (W2.D) ──────────────────────────────────────
  private readonly curriculumStateSignal = signal<CurriculumLoadState>({ status: 'loading' });
  /** Offering id the curriculum was last (re)loaded for — guards the lazy effect. */
  private readonly curriculumLoadedForId = signal<string | null>(null);

  /**
   * Per-course "used by N offerings" blast-radius counts (courseId → count,
   * count INCLUDES this offering). Fetched lazily on curriculum load; a course
   * absent from the map has no known count yet (or its count call failed) → the
   * template shows no badge for it (fail-soft).
   */
  private readonly courseUsageSignal = signal<ReadonlyMap<string, number>>(
    new Map<string, number>(),
  );

  // ── R+ Phase-2 W7 (WS-A) — Module structure state ──────────────────────────
  /** courseId → its loaded modules (structure order). Absent ⇒ not yet loaded. */
  private readonly moduleStateSignal = signal<ReadonlyMap<string, readonly OfferingModule[]>>(
    new Map<string, readonly OfferingModule[]>(),
  );
  /**
   * moduleId → its cohort completion roll-up (CHO-2074). Lazily fetched alongside
   * the module structure; absent ⇒ progress not yet loaded (no badge). Keyed by
   * module id (globally unique) so the template can look it up per module card.
   */
  private readonly moduleProgressSignal = signal<ReadonlyMap<string, OfferingModuleProgress>>(
    new Map<string, OfferingModuleProgress>(),
  );
  /** Course id whose "New module" inline form is open (null = none, one at a time). */
  private readonly moduleCreateCourseIdSignal = signal<string | null>(null);
  /** New-module title field. */
  private readonly moduleCreateTitleSignal = signal<string>('');
  /** Last module-op error detail ('' = none) — a shared fail-loud banner. */
  private readonly moduleErrorSignal = signal<string>('');
  /** A module op is in flight (guards double-submit + disables actions). */
  private readonly moduleBusySignal = signal<boolean>(false);
  /** moduleId → the curriculum item id currently chosen in its add-item picker. */
  private readonly moduleAddSelectionSignal = signal<ReadonlyMap<string, string>>(
    new Map<string, string>(),
  );

  // ── Curriculum EDITOR state (R+ Phase-2 S1, CHO-2050) ───────────────────
  /** Course id whose inline add-item form is open (null = none; one at a time). */
  private readonly curriculumAddCourseIdSignal = signal<string | null>(null);
  /** Add-item form fields (signal-driven; kind defaults to the first kind). */
  private readonly curriculumKindSignal = signal<string>(OFFERING_CURRICULUM_KINDS[0]);
  private readonly curriculumRefSignal = signal<string>('');
  private readonly curriculumTitleSignal = signal<string>('');
  /** Entity-picker selection for the ref (atom/assessment kinds) — drives the
   *  picker `value` so the chosen name stays shown; null = nothing picked. */
  private readonly curriculumRefPickedSignal = signal<EntityRef | null>(null);
  private readonly addingItemSignal = signal<boolean>(false);
  private readonly curriculumAddErrorSignal = signal<boolean>(false);
  /** Raw BE `{error}` text for a failed add (surfaced loudly); '' → generic key. */
  private readonly curriculumAddErrorDetailSignal = signal<string>('');
  private readonly curriculumAddSucceededSignal = signal<boolean>(false);
  /** item_id currently being removed (per-row busy + re-entrancy guard). */
  private readonly removingItemIdSignal = signal<string | null>(null);
  private readonly curriculumRemoveErrorSignal = signal<boolean>(false);
  /** item_id currently being reordered (per-row busy + re-entrancy guard). */
  private readonly reorderingItemIdSignal = signal<string | null>(null);
  private readonly curriculumReorderErrorSignal = signal<boolean>(false);

  // ── Certification panel state (W2.D) ───────────────────────────────────
  private readonly certificationStateSignal = signal<CertificationLoadState>({ status: 'loading' });
  /** Offering id the certification config was last (re)loaded for — guards the lazy effect. */
  private readonly certificationLoadedForId = signal<string | null>(null);

  // ── Completion-policy EDITOR state (R+ Phase-2 S2, CHO-2054) ────────────
  /** Whether the inline completion-policy form is open (manager-only affordance). */
  private readonly policyFormOpenSignal = signal<boolean>(false);
  /** Form fields (signal-driven; NO FormsModule). Score is a string from the input. */
  private readonly policyAwardsSignal = signal<boolean>(false);
  private readonly policyScoreSignal = signal<string>('');
  private readonly policyTitleSignal = signal<string>('');
  private readonly savingPolicySignal = signal<boolean>(false);
  private readonly policySaveErrorSignal = signal<boolean>(false);
  /** Raw BE `{error}` for a failed save (e.g. score out of [0,100]); '' → generic key. */
  private readonly policySaveErrorDetailSignal = signal<string>('');
  private readonly policySaveSucceededSignal = signal<boolean>(false);

  // ── Manual per-learner cert issuance (Certification tab) ────────────────
  // The WIRED lane auto-issues on assessment release; THIS is the admin's
  // explicit "issue now" action for one enrolled learner. It reuses the roster
  // (shared with the Roster tab — see the certification effect) for the enrolled
  // learner list. Per-row state is keyed by the roster row (`courseId|gcid`), so
  // the same learner enrolled on two courses issues independently.
  /** Row key whose inline two-step confirm is open; null → none (one at a time). */
  private readonly confirmingIssueSignal = signal<string | null>(null);
  /** Row key whose issue POST is in-flight; null → none (per-row busy guard). */
  private readonly issuingCertSignal = signal<string | null>(null);
  /** Per-row terminal outcome (row key → success | already-issued (409) | error). */
  private readonly certIssueOutcomeSignal = signal<
    ReadonlyMap<string, 'success' | 'already' | 'error'>
  >(new Map<string, 'success' | 'already' | 'error'>());
  /** Raw BE `{error}`/`{message}` for the last non-409 failed issue ('' → generic key). */
  private readonly certIssueErrorDetailSignal = signal<string>('');

  // ── Roster panel state (W7) ────────────────────────────────────────────
  private readonly rosterStateSignal = signal<RosterLoadState>({ status: 'loading' });
  /** Offering id the roster was last (re)loaded for — guards the lazy effect. */
  private readonly rosterLoadedForId = signal<string | null>(null);

  // ── Enrol-learner EDITOR state (R+ Phase-2 S3, CHO-2053) ────────────────
  /** Whether the inline enrol form is open (manager-only affordance). */
  private readonly enrolFormOpenSignal = signal<boolean>(false);
  /** Target course + learner GCID (signal-driven form). */
  private readonly enrolCourseIdSignal = signal<string>('');
  /** GCIDs ticked in the member-multiselect checklist (issue 4b bulk enrol). */
  private readonly enrolSelectedGcidsSignal = signal<readonly string[]>([]);
  private readonly enrolingSignal = signal<boolean>(false);
  private readonly enrolErrorSignal = signal<boolean>(false);
  /** Raw BE `{error}` for a failed enrol (409 capacity / 400 unattached); '' → generic key. */
  private readonly enrolErrorDetailSignal = signal<string>('');
  private readonly enrolSucceededSignal = signal<boolean>(false);

  // ── Unenrol-learner state (R+ Phase-2 WS-B) ────────────────────────────
  // Keyed by the roster ROW (`courseId|gcid`) — the same learner can sit on
  // more than one attached course, so per-gcid keying would flip both rows.
  /** Row key whose inline two-step confirm is open; null → none. */
  private readonly confirmingUnenrolSignal = signal<string | null>(null);
  /** Row key whose unenrol POST is in-flight; null → none (per-row busy guard). */
  private readonly removingLearnerSignal = signal<string | null>(null);
  /** Row key whose last unenrol attempt errored; scopes the inline error. */
  private readonly unenrolErrorKeySignal = signal<string | null>(null);
  /** Raw BE `{message}` for a failed unenrol (404 not-found / 400 unattached); '' → generic key. */
  private readonly unenrolErrorDetailSignal = signal<string>('');
  /** Panel-level success note after a learner is removed (the row itself is gone). */
  private readonly unenrolSucceededSignal = signal<boolean>(false);

  // ── Analytics panel state (W7, async) ──────────────────────────────────
  private readonly analyticsStateSignal = signal<AnalyticsLoadState>({ status: 'loading' });
  /** Offering id the analytics were last (re)loaded for — guards the lazy effect. */
  private readonly analyticsLoadedForId = signal<string | null>(null);

  // ── Sections panel state (W7) ──────────────────────────────────────────
  private readonly sectionsStateSignal = signal<SectionsLoadState>({ status: 'loading' });
  /** Offering id the sections were last (re)loaded for — guards the lazy effect. */
  private readonly sectionsLoadedForId = signal<string | null>(null);
  /** Whether the inline create-section form is open (manager-only affordance). */
  private readonly sectionFormOpenSignal = signal<boolean>(false);
  /** Required-name field — drives the submit-disabled state (signal-driven form). */
  private readonly sectionNameSignal = signal<string>('');
  /** Entity-picker selection for the optional lead instructor (name-search, no raw-UUID paste). */
  private readonly sectionLeadPickedSignal = signal<EntityRef | null>(null);
  private readonly creatingSectionSignal = signal<boolean>(false);
  private readonly sectionCreateErrorSignal = signal<boolean>(false);
  private readonly sectionCreateSucceededSignal = signal<boolean>(false);

  // ── Section EDIT state (R+ Phase-2 S4, CHO-2051) ───────────────────────
  /** section_id whose inline edit form is open (null = none; one at a time). */
  private readonly editingSectionIdSignal = signal<string | null>(null);
  /** Required-name field for the edit form — drives the submit-disabled state. */
  private readonly editSectionNameSignal = signal<string>('');
  /** Entity-picker selection for the edit form's lead instructor (one at a time,
   *  same singleton discipline as `editSectionNameSignal`). */
  private readonly editSectionLeadPickedSignal = signal<EntityRef | null>(null);
  private readonly updatingSectionSignal = signal<boolean>(false);
  private readonly sectionUpdateErrorSignal = signal<boolean>(false);
  /** Raw BE `{error}` for a failed edit (e.g. blank name); '' → generic key. */
  private readonly sectionUpdateErrorDetailSignal = signal<string>('');
  private readonly sectionUpdateSucceededSignal = signal<boolean>(false);

  // ── Schedule panel state (CHO-1985; sessions list + create, short) ─────
  private readonly scheduleStateSignal = signal<ScheduleLoadState>({ status: 'loading' });
  /** Offering id the schedule was last (re)loaded for — guards the lazy effect. */
  private readonly scheduleLoadedForId = signal<string | null>(null);
  /** Whether the inline add-session form is open (manager-only affordance). */
  private readonly sessionFormOpenSignal = signal<boolean>(false);
  /** Required title + window fields — drive the submit-disabled state (signal-driven form). */
  private readonly sessionTitleSignal = signal<string>('');
  /** `datetime-local` values (converted to ISO in the create method). */
  private readonly sessionStartsAtSignal = signal<string>('');
  private readonly sessionEndsAtSignal = signal<string>('');
  /** Entity-picker selection for the optional instructor (name-search, no raw-UUID paste). */
  private readonly sessionInstructorPickedSignal = signal<EntityRef | null>(null);
  private readonly creatingSessionSignal = signal<boolean>(false);
  private readonly sessionCreateErrorSignal = signal<boolean>(false);
  /** Typed BE error code of the last failed create (room_required / room_not_found
   *  / room_over_capacity / room_double_booked, or '' for a generic failure). */
  private readonly sessionCreateErrorCodeSignal = signal<string>('');
  private readonly sessionCreateSucceededSignal = signal<boolean>(false);

  // ── Rooms (CHO-2191; the schedule picker source + inline create) ────────
  /** Picker source: null until first load, [] when the tenant has no rooms. */
  private readonly roomsSignal = signal<readonly RoomOption[] | null>(null);
  private readonly roomsLoadingSignal = signal<boolean>(false);
  private readonly roomsErrorSignal = signal<boolean>(false);
  /** Picked room_id for the new session ('' = roomless / none picked yet). */
  private readonly sessionRoomIdSignal = signal<string>('');
  /** Inline create-room form (name + capacity; signal-driven, no FormsModule). */
  private readonly roomFormOpenSignal = signal<boolean>(false);
  private readonly roomNameSignal = signal<string>('');
  private readonly roomCapacitySignal = signal<string>('');
  private readonly creatingRoomSignal = signal<boolean>(false);
  private readonly roomCreateErrorSignal = signal<boolean>(false);

  // ── Attendance panel state (CHO-1986; session-scoped mark + list, short) ─
  /** Session list (reuses the schedule read) that populates the session selector. */
  private readonly attendanceSessionsStateSignal = signal<ScheduleLoadState>({ status: 'loading' });
  /** Offering id the session selector was last (re)loaded for — guards the lazy effect. */
  private readonly attendanceSessionsLoadedForId = signal<string | null>(null);
  /** Currently-selected session id ('' = none picked yet; no records GET until set). */
  private readonly selectedSessionIdSignal = signal<string>('');
  private readonly attendanceStateSignal = signal<AttendanceLoadState>({ status: 'loading' });
  /** Session id the record list was last loaded for (per-session re-entrancy guard). */
  private readonly attendanceLoadedForSession = signal<string | null>(null);
  /** Mark-form fields (signal-driven form; source is fixed `manual`). */
  private readonly markGcidSignal = signal<string>('');
  /** Entity-picker selection backing `markGcidSignal` (name-search, no raw-UUID paste). */
  private readonly markGcidPickedSignal = signal<EntityRef | null>(null);
  private readonly markStatusSignal = signal<string>('present');
  private readonly markingSignal = signal<boolean>(false);
  private readonly markErrorSignal = signal<boolean>(false);
  private readonly markSucceededSignal = signal<boolean>(false);

  // ── Publish panel state (CHO-1987; catalog handoff read + action, async) ─
  private readonly publishStateSignal = signal<PublishLoadState>({ status: 'loading' });
  /** Offering id the publish state was last (re)loaded for — guards the lazy effect. */
  private readonly publishLoadedForId = signal<string | null>(null);
  private readonly publishingSignal = signal<boolean>(false);
  /** PATCH (publish action) error — distinct from the GET load error. */
  private readonly publishActionErrorSignal = signal<boolean>(false);
  private readonly publishSucceededSignal = signal<boolean>(false);
  /** Courses transitioned to public by the last successful publish (for the note). */
  private readonly publishedCountSignal = signal<number>(0);

  // ── Prerequisites panel state (ADR-226; structured course DAG + notes) ──
  private readonly prerequisitesStateSignal = signal<PrerequisitesLoadState>({
    status: 'loading',
  });
  /** Offering id the prerequisites were last (re)loaded for — guards the lazy effect. */
  private readonly prerequisitesLoadedForId = signal<string | null>(null);

  // ── Prerequisite EDITOR state (ADR-226 add/remove) ──────────────────────
  /** Course id whose inline add-edge form is open (null = none; one at a time). */
  private readonly prerequisiteAddCourseIdSignal = signal<string | null>(null);
  /** Add-form fields (signal-driven; kind defaults to the first kind). */
  private readonly prerequisiteTargetCourseIdSignal = signal<string>('');
  /** Entity-picker selection for the TARGET course — drives the picker
   *  `value` so the chosen name stays shown; null = nothing picked. */
  private readonly prerequisiteTargetPickedSignal = signal<EntityRef | null>(null);
  private readonly prerequisiteKindSignal = signal<PrerequisiteKind>(
    OFFERING_PREREQUISITE_KINDS[0],
  );
  private readonly addingPrerequisiteSignal = signal<boolean>(false);
  private readonly prerequisiteAddErrorSignal = signal<boolean>(false);
  /** Raw BE `{message}` for a failed add (surfaced loudly); '' → generic key. */
  private readonly prerequisiteAddErrorDetailSignal = signal<string>('');
  private readonly prerequisiteAddSucceededSignal = signal<boolean>(false);
  /** `courseId|prerequisiteCourseId` edge key currently being removed (per-row busy guard). */
  private readonly removingPrerequisiteKeySignal = signal<string | null>(null);
  private readonly prerequisiteRemoveErrorSignal = signal<boolean>(false);

  // ── Transcript panel state (W6; per-offering gradebook join) ────────────
  /** The transcript-entries GET's own load state (assessments + roster are
   *  reused from their own state above — not duplicated here). */
  private readonly transcriptStateSignal = signal<TranscriptLoadState>({ status: 'loading' });
  /** Offering id the transcript entries were last (re)loaded for — guards the lazy effect. */
  private readonly transcriptLoadedForId = signal<string | null>(null);

  // ── Load state projections ─────────────────────────────────────────────
  readonly offering = computed<Offering | null>(() => {
    const s = this.loadStateSignal();
    return s.status === 'success' ? s.offering : null;
  });
  readonly isLoading = computed<boolean>(() => this.loadStateSignal().status === 'loading');
  readonly isError = computed<boolean>(() => this.loadStateSignal().status === 'error');
  readonly isNotFound = computed<boolean>(() => {
    const s = this.loadStateSignal();
    return s.status === 'error' && s.notFound;
  });
  readonly errorKey = computed<string>(() => {
    const s = this.loadStateSignal();
    return s.status === 'error' ? s.errorKey : '';
  });

  // ── Object-derived tab shell ───────────────────────────────────────────
  readonly tabList = computed<readonly OfferingTab[]>(() => {
    const o = this.offering();
    return o ? offeringTabs(o.deliveryType) : [];
  });

  /** The active tab id, normalised against the derived set (default overview). */
  readonly activeTabId = computed<OfferingTabId>(() => {
    const tabs = this.tabList();
    const param = this.tab();
    const match = tabs.find((t) => t.id === param);
    return match?.id ?? tabs[0]?.id ?? 'overview';
  });
  readonly activeTab = computed<OfferingTab | null>(
    () => this.tabList().find((t) => t.id === this.activeTabId()) ?? null,
  );
  readonly isOverviewActive = computed<boolean>(() => this.activeTabId() === 'overview');

  // ── State-derived lifecycle actions (role-gated by visibility) ─────────
  readonly canManage = computed<boolean>(() =>
    OFFERING_ADMIN_ROLES.some((role) => this.rbac.hasRole(role)),
  );
  readonly actions = computed<readonly OfferingAction[]>(() => {
    const o = this.offering();
    return o ? offeringActions(o.state) : [];
  });
  readonly pendingAction = computed<OfferingTransition | null>(() => this.pendingActionSignal());
  readonly isActionInFlight = computed<boolean>(() => this.pendingActionSignal() !== null);
  readonly hasActionError = computed<boolean>(() => this.actionErrorSignal());
  /** Raw BE message for a failed lifecycle action ('' → generic key) — S5. */
  readonly actionErrorDetail = computed<string>(() => this.actionErrorDetailSignal());
  readonly conflictKey = computed<string>(() => {
    const ca = this.conflictActionSignal();
    return ca ? offeringConflictKey(ca) : '';
  });

  // ── Overview badge helpers ─────────────────────────────────────────────
  readonly deliveryTypeKey = computed<string>(() => {
    const o = this.offering();
    return o ? deliveryTypeLabelKey(o.deliveryType) : '';
  });
  readonly stateKey = computed<string>(() => {
    const o = this.offering();
    return o ? stateLabelKey(o.state) : '';
  });
  /** Design-system badge variant for the lifecycle state chip. */
  readonly stateBadgeClass = computed<string>(() => {
    switch (this.offering()?.state) {
      case 'LAUNCHED':
      case 'CONCLUDED':
        return 'badge-info';
      case 'RUNNING':
        return 'badge-success';
      default: // DRAFT, ARCHIVED, none
        return 'badge-neutral';
    }
  });

  // ── Assessments panel projections (W3.A) ───────────────────────────────
  readonly isAssessmentsActive = computed<boolean>(() => this.activeTabId() === 'assessments');
  readonly assessmentsLoading = computed<boolean>(
    () => this.assessmentsStateSignal().status === 'loading',
  );
  readonly assessmentsError = computed<boolean>(
    () => this.assessmentsStateSignal().status === 'error',
  );
  readonly assessmentsErrorKey = computed<string>(() => {
    const s = this.assessmentsStateSignal();
    return s.status === 'error' ? s.errorKey : '';
  });
  readonly assessments = computed<readonly OfferingAssessment[]>(() => {
    const s = this.assessmentsStateSignal();
    return s.status === 'success' ? s.items : [];
  });
  readonly hasAssessments = computed<boolean>(() => this.assessments().length > 0);

  readonly isPickerOpen = computed<boolean>(() => this.pickerOpenSignal());
  readonly testSetsLoading = computed<boolean>(
    () => this.testSetsStateSignal().status === 'loading',
  );
  readonly testSetsError = computed<boolean>(
    () => this.testSetsStateSignal().status === 'error',
  );
  /**
   * Candidate test-sets for the attach picker. The service already filters to
   * PUBLISHED; here we also drop any test-set already attached to this offering
   * (matched by test_set_id) so the picker only ever offers NEW attachments and
   * an all-attached offering correctly falls through to the picker empty-state.
   * This is also what makes it visible that MORE than one assessment can be
   * attached (CHO-2123 / ADR-232): each attach shrinks the candidate list,
   * it never caps the offering at a single assessment.
   */
  readonly testSets = computed<readonly TestSetSummary[]>(() => {
    const s = this.testSetsStateSignal();
    const published = s.status === 'success' ? s.items : [];
    const attached = new Set(this.assessments().map((a) => a.testSetId));
    return published.filter((ts) => !attached.has(ts.id));
  });
  readonly hasTestSets = computed<boolean>(() => this.testSets().length > 0);
  readonly attachError = computed<boolean>(() => this.attachErrorSignal());
  readonly attachSucceeded = computed<boolean>(() => this.attachSucceededSignal());
  readonly removeError = computed<boolean>(() => this.removeErrorSignal());

  // ── Curriculum panel projections (W2.D) ────────────────────────────────
  readonly isCurriculumActive = computed<boolean>(() => this.activeTabId() === 'curriculum');
  readonly curriculumLoading = computed<boolean>(
    () => this.curriculumStateSignal().status === 'loading',
  );
  readonly curriculumError = computed<boolean>(
    () => this.curriculumStateSignal().status === 'error',
  );
  readonly curriculum = computed<readonly OfferingCurriculumCourse[]>(() => {
    const s = this.curriculumStateSignal();
    return s.status === 'success' ? s.courses : [];
  });
  readonly hasCurriculum = computed<boolean>(() => this.curriculum().length > 0);

  /**
   * The known "used by N offerings" blast-radius count for an attached course,
   * or null when it is not yet known (count still in flight) or its count call
   * failed — either way the template renders NO badge (fail-soft).
   */
  usageCountForCourse(courseId: string): number | null {
    return this.courseUsageSignal().get(courseId) ?? null;
  }

  /**
   * Resolved "Used by N offerings" label (ICU plural) for a course's count.
   * Resolved in-component because this app's ngx-translate ships no ICU compiler
   * (the translate pipe only substitutes `{{token}}`) — mirrors the
   * assessment-monitor precedent (see resolveUsagePlural). '' when the count is
   * not yet known (the badge is `@if`-guarded, so this is never shown blank).
   */
  usageLabelForCourse(courseId: string): string {
    const n = this.courseUsageSignal().get(courseId);
    if (n === undefined) {
      return '';
    }
    return resolveUsagePlural(
      this.translate.instant('rplus.offerings.workspace.curriculum.used_by_offerings'),
      n,
    );
  }

  // ── Curriculum EDITOR projections (R+ Phase-2 S1) ──────────────────────
  /** The 6 content-item kinds for the add-form `<select>`. */
  readonly curriculumKinds = OFFERING_CURRICULUM_KINDS;
  readonly curriculumKind = computed<string>(() => this.curriculumKindSignal());
  /** Whether the current kind's `ref` is a UUID (drives the hint/placeholder). */
  readonly curriculumRefIsUuid = computed<boolean>(() =>
    curriculumKindRefIsUuid(this.curriculumKindSignal()),
  );

  /**
   * For UUID-ref kinds we can search by name, the entity-picker's `entityType`
   * (atom → atom, assessment → the reusable TestSet the BE stores as the ref,
   * live_classroom → the reusable LiveQuiz template — CHO-2134);
   * `null` → keep the plain text field (URL kinds). Kills raw-UUID paste.
   */
  readonly curriculumRefPickerType = computed<EntityType | null>(() => {
    switch (this.curriculumKindSignal()) {
      case 'atom':
        return 'atom';
      case 'assessment':
        return 'testset';
      case 'live_classroom':
        return 'live_quiz';
      default:
        return null;
    }
  });

  /** The search adapter matching the picker type (single [searchPortOverride] source). */
  readonly curriculumRefSearchPort = computed<EntitySearchPort | null>(() => {
    switch (this.curriculumRefPickerType()) {
      case 'atom':
        return this.atomSearch;
      case 'testset':
        return this.testSetSearch;
      case 'live_quiz':
        return this.liveQuizSearch;
      default:
        return null;
    }
  });

  /** Selected entity as the picker's `value` (keeps the picked name shown). */
  readonly curriculumRefPicked = computed<readonly EntityRef[]>(() => {
    const picked = this.curriculumRefPickedSignal();
    return picked ? [picked] : [];
  });
  readonly isAddingItem = computed<boolean>(() => this.addingItemSignal());
  readonly curriculumAddError = computed<boolean>(() => this.curriculumAddErrorSignal());
  /** Raw BE message for a failed add ('' when there is no specific detail). */
  readonly curriculumAddErrorDetail = computed<string>(() =>
    this.curriculumAddErrorDetailSignal(),
  );
  readonly curriculumAddSucceeded = computed<boolean>(() => this.curriculumAddSucceededSignal());
  readonly curriculumRemoveError = computed<boolean>(() => this.curriculumRemoveErrorSignal());
  readonly curriculumReorderError = computed<boolean>(() => this.curriculumReorderErrorSignal());
  /** Submit is enabled once both required fields (ref + title) are trim-non-empty. */
  readonly canAddCurriculumItem = computed<boolean>(
    () =>
      this.curriculumRefSignal().trim().length > 0 &&
      this.curriculumTitleSignal().trim().length > 0,
  );
  /** True while ANY reorder is in flight (disables every up/down button). */
  readonly isReorderInFlight = computed<boolean>(() => this.reorderingItemIdSignal() !== null);

  // ── Certification panel projections (W2.D) ─────────────────────────────
  readonly isCertificationActive = computed<boolean>(
    () => this.activeTabId() === 'certification',
  );
  readonly certificationLoading = computed<boolean>(
    () => this.certificationStateSignal().status === 'loading',
  );
  readonly certificationError = computed<boolean>(
    () => this.certificationStateSignal().status === 'error',
  );
  readonly certification = computed<readonly OfferingCertificationCourse[]>(() => {
    const s = this.certificationStateSignal();
    return s.status === 'success' ? s.courses : [];
  });
  readonly hasCertification = computed<boolean>(() => this.certification().length > 0);

  // ── Completion-policy EDITOR projections (R+ Phase-2 S2) ───────────────
  /** The saved offering-level completion policy (null until first set). */
  readonly completionPolicy = computed<OfferingCompletionPolicy | null>(() => {
    const s = this.certificationStateSignal();
    return s.status === 'success' ? s.completionPolicy : null;
  });
  readonly hasCompletionPolicy = computed<boolean>(() => this.completionPolicy() !== null);
  readonly isPolicyFormOpen = computed<boolean>(() => this.policyFormOpenSignal());
  readonly policyAwards = computed<boolean>(() => this.policyAwardsSignal());
  readonly policyScore = computed<string>(() => this.policyScoreSignal());
  readonly policyTitle = computed<string>(() => this.policyTitleSignal());
  readonly isSavingPolicy = computed<boolean>(() => this.savingPolicySignal());
  readonly policySaveError = computed<boolean>(() => this.policySaveErrorSignal());
  readonly policySaveErrorDetail = computed<string>(() => this.policySaveErrorDetailSignal());
  readonly policySaveSucceeded = computed<boolean>(() => this.policySaveSucceededSignal());
  /**
   * Save is enabled once the passing score is a valid integer in [0,100]. When
   * "awards a certificate" is off the score is still validated (the BE always
   * validates the range) but the form remains submittable at 0.
   */
  readonly canSavePolicy = computed<boolean>(() => {
    const raw = this.policyScoreSignal().trim();
    if (raw.length === 0) {
      return false;
    }
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 100;
  });

  // ── Manual cert issuance projections (Certification tab) ────────────────
  /** BE `{error}`/`{message}` for the last failed issue ('' → generic i18n key). */
  readonly certIssueErrorDetail = computed<string>(() => this.certIssueErrorDetailSignal());
  /** True when this learner row's inline confirm is open. */
  isConfirmingCertIssue(courseId: string, gcid: string): boolean {
    return this.confirmingIssueSignal() === rosterRowKey(courseId, gcid);
  }
  /** True while this learner row's issue POST is in-flight (disables its buttons). */
  isIssuingCert(courseId: string, gcid: string): boolean {
    return this.issuingCertSignal() === rosterRowKey(courseId, gcid);
  }
  /** True once this learner row's issue succeeded (201). */
  certIssueSucceeded(courseId: string, gcid: string): boolean {
    return this.certIssueOutcomeSignal().get(rosterRowKey(courseId, gcid)) === 'success';
  }
  /** True when this learner row's issue returned 409 (already holds a certificate). */
  certAlreadyIssued(courseId: string, gcid: string): boolean {
    return this.certIssueOutcomeSignal().get(rosterRowKey(courseId, gcid)) === 'already';
  }
  /** True when this learner row's last issue attempt errored (non-409). */
  hasCertIssueError(courseId: string, gcid: string): boolean {
    return this.certIssueOutcomeSignal().get(rosterRowKey(courseId, gcid)) === 'error';
  }

  // ── Roster panel projections (W7) ──────────────────────────────────────
  readonly isRosterActive = computed<boolean>(() => this.activeTabId() === 'roster');
  readonly rosterLoading = computed<boolean>(
    () => this.rosterStateSignal().status === 'loading',
  );
  readonly rosterError = computed<boolean>(() => this.rosterStateSignal().status === 'error');
  readonly rosterCourses = computed<readonly OfferingRosterCourse[]>(() => {
    const s = this.rosterStateSignal();
    return s.status === 'success' ? s.roster.courses : [];
  });
  /** Distinct learners across all attached courses (0 until the roster loads). */
  readonly rosterDistinctCount = computed<number>(() => {
    const s = this.rosterStateSignal();
    return s.status === 'success' ? s.roster.distinctLearnerCount : 0;
  });
  readonly hasRoster = computed<boolean>(() => this.rosterCourses().length > 0);

  // ── Enrol-learner EDITOR projections (R+ Phase-2 S3) ───────────────────
  readonly isEnrolFormOpen = computed<boolean>(() => this.enrolFormOpenSignal());
  readonly enrolCourseId = computed<string>(() => this.enrolCourseIdSignal());
  /** GCIDs ticked in the enrol checklist. */
  readonly enrolSelectedGcids = computed<readonly string[]>(
    () => this.enrolSelectedGcidsSignal(),
  );
  /** How many learners are ticked (drives the submit label + gate). */
  readonly enrolSelectedCount = computed<number>(
    () => this.enrolSelectedGcidsSignal().length,
  );
  readonly isEnroling = computed<boolean>(() => this.enrolingSignal());
  readonly enrolError = computed<boolean>(() => this.enrolErrorSignal());
  readonly enrolErrorDetail = computed<string>(() => this.enrolErrorDetailSignal());
  readonly enrolSucceeded = computed<boolean>(() => this.enrolSucceededSignal());
  /** Enrol is enabled once a course is chosen AND at least one learner is ticked. */
  readonly canEnrol = computed<boolean>(
    () =>
      this.enrolCourseIdSignal().length > 0 &&
      this.enrolSelectedGcidsSignal().length > 0,
  );

  // ── Unenrol-learner projections (R+ Phase-2 WS-B) ──────────────────────
  /** BE `{message}` for the last failed unenrol ('' → generic i18n key). */
  readonly unenrolErrorDetail = computed<string>(() => this.unenrolErrorDetailSignal());
  /** Panel-level "learner removed" note (the row itself has already gone). */
  readonly unenrolSucceeded = computed<boolean>(() => this.unenrolSucceededSignal());
  /** True when this learner row's inline confirm is open. */
  isConfirmingUnenrol(courseId: string, gcid: string): boolean {
    return this.confirmingUnenrolSignal() === rosterRowKey(courseId, gcid);
  }
  /** True while this learner row's unenrol POST is in-flight (disables its buttons). */
  isRemovingLearner(courseId: string, gcid: string): boolean {
    return this.removingLearnerSignal() === rosterRowKey(courseId, gcid);
  }
  /** True when this learner row's last unenrol attempt errored (scopes the inline error). */
  hasUnenrolError(courseId: string, gcid: string): boolean {
    return this.unenrolErrorKeySignal() === rosterRowKey(courseId, gcid);
  }

  // ── Analytics panel projections (W7, async) ────────────────────────────
  readonly isAnalyticsActive = computed<boolean>(() => this.activeTabId() === 'analytics');
  readonly analyticsLoading = computed<boolean>(
    () => this.analyticsStateSignal().status === 'loading',
  );
  readonly analyticsError = computed<boolean>(
    () => this.analyticsStateSignal().status === 'error',
  );
  readonly analytics = computed<OfferingAnalytics | null>(() => {
    const s = this.analyticsStateSignal();
    return s.status === 'success' ? s.analytics : null;
  });
  readonly analyticsCourses = computed<readonly OfferingAnalyticsCourse[]>(
    () => this.analytics()?.courses ?? [],
  );

  // ── Sections panel projections (W7) ────────────────────────────────────
  readonly isSectionsActive = computed<boolean>(() => this.activeTabId() === 'sections');
  readonly sectionsLoading = computed<boolean>(
    () => this.sectionsStateSignal().status === 'loading',
  );
  readonly sectionsError = computed<boolean>(() => this.sectionsStateSignal().status === 'error');
  readonly sectionsErrorKey = computed<string>(() => {
    const s = this.sectionsStateSignal();
    return s.status === 'error' ? s.errorKey : '';
  });
  readonly sections = computed<readonly OfferingSection[]>(() => {
    const s = this.sectionsStateSignal();
    return s.status === 'success' ? s.items : [];
  });
  readonly hasSections = computed<boolean>(() => this.sections().length > 0);
  readonly isSectionFormOpen = computed<boolean>(() => this.sectionFormOpenSignal());
  readonly isCreatingSection = computed<boolean>(() => this.creatingSectionSignal());
  /** Submit is enabled only once the required name is trim-non-empty. */
  readonly canCreateSection = computed<boolean>(
    () => this.sectionNameSignal().trim().length > 0,
  );
  /** Selected lead instructor as the picker's `value` (keeps the picked name shown). */
  readonly sectionLeadPicked = computed<readonly EntityRef[]>(() => {
    const picked = this.sectionLeadPickedSignal();
    return picked ? [picked] : [];
  });
  readonly sectionCreateError = computed<boolean>(() => this.sectionCreateErrorSignal());
  readonly sectionCreateSucceeded = computed<boolean>(() => this.sectionCreateSucceededSignal());

  // ── Section EDIT projections (R+ Phase-2 S4) ───────────────────────────
  readonly isUpdatingSection = computed<boolean>(() => this.updatingSectionSignal());
  readonly sectionUpdateError = computed<boolean>(() => this.sectionUpdateErrorSignal());
  readonly sectionUpdateErrorDetail = computed<string>(() => this.sectionUpdateErrorDetailSignal());
  readonly sectionUpdateSucceeded = computed<boolean>(() => this.sectionUpdateSucceededSignal());
  /** Controlled value for the edit-name field (prefilled from the section). */
  readonly editSectionName = computed<string>(() => this.editSectionNameSignal());
  /** Selected edit-form lead instructor as the picker's `value` (prefilled from the section). */
  readonly editSectionLeadPicked = computed<readonly EntityRef[]>(() => {
    const picked = this.editSectionLeadPickedSignal();
    return picked ? [picked] : [];
  });
  /** Submit is enabled only once the required edited name is trim-non-empty. */
  readonly canUpdateSection = computed<boolean>(
    () => this.editSectionNameSignal().trim().length > 0,
  );

  // ── Schedule panel projections (CHO-1985) ──────────────────────────────
  readonly isScheduleActive = computed<boolean>(() => this.activeTabId() === 'schedule');
  readonly scheduleLoading = computed<boolean>(
    () => this.scheduleStateSignal().status === 'loading',
  );
  readonly scheduleError = computed<boolean>(() => this.scheduleStateSignal().status === 'error');
  readonly sessions = computed<readonly OfferingSession[]>(() => {
    const s = this.scheduleStateSignal();
    return s.status === 'success' ? s.sessions : [];
  });
  readonly hasSessions = computed<boolean>(() => this.sessions().length > 0);
  readonly isSessionFormOpen = computed<boolean>(() => this.sessionFormOpenSignal());
  readonly isCreatingSession = computed<boolean>(() => this.creatingSessionSignal());
  /**
   * Submit is enabled only once the required title is trim-non-empty AND both
   * window bounds are present AND end is strictly after start (the same guard
   * the create method re-applies before POST).
   */
  readonly canCreateSession = computed<boolean>(() => {
    const title = this.sessionTitleSignal().trim();
    const starts = this.sessionStartsAtSignal();
    const ends = this.sessionEndsAtSignal();
    if (title.length === 0 || starts.length === 0 || ends.length === 0) {
      return false;
    }
    const s = new Date(starts).getTime();
    const e = new Date(ends).getTime();
    return !Number.isNaN(s) && !Number.isNaN(e) && e > s;
  });
  /** Selected instructor as the picker's `value` (keeps the picked name shown). */
  readonly sessionInstructorPicked = computed<readonly EntityRef[]>(() => {
    const picked = this.sessionInstructorPickedSignal();
    return picked ? [picked] : [];
  });
  readonly sessionCreateError = computed<boolean>(() => this.sessionCreateErrorSignal());
  readonly sessionCreateSucceeded = computed<boolean>(() => this.sessionCreateSucceededSignal());
  /**
   * i18n key for the create-session error banner — maps the typed BE code
   * (CHO-2191 room gate) to a specific, actionable message; falls back to the
   * generic key for any other failure.
   */
  readonly sessionCreateErrorKey = computed<string>(() => {
    switch (this.sessionCreateErrorCodeSignal()) {
      case 'room_required':
        return 'rplus.offerings.workspace.schedule.error_room_required';
      case 'room_not_found':
        return 'rplus.offerings.workspace.schedule.error_room_not_found';
      case 'room_over_capacity':
        return 'rplus.offerings.workspace.schedule.error_room_over_capacity';
      case 'room_double_booked':
        return 'rplus.offerings.workspace.schedule.error_room_double_booked';
      default:
        return 'rplus.offerings.workspace.schedule.create_error';
    }
  });

  // ── Rooms (CHO-2191) — picker source + inline create ────────────────────
  readonly rooms = computed<readonly RoomOption[]>(() => this.roomsSignal() ?? []);
  readonly roomsLoading = computed<boolean>(() => this.roomsLoadingSignal());
  readonly roomsError = computed<boolean>(() => this.roomsErrorSignal());
  readonly hasRooms = computed<boolean>(() => this.rooms().length > 0);
  /** True once a rooms fetch has resolved (guards the premature "no rooms" hint). */
  readonly roomsLoaded = computed<boolean>(() => this.roomsSignal() !== null);
  readonly sessionRoomId = computed<string>(() => this.sessionRoomIdSignal());
  readonly isRoomFormOpen = computed<boolean>(() => this.roomFormOpenSignal());
  readonly isCreatingRoom = computed<boolean>(() => this.creatingRoomSignal());
  readonly roomCreateError = computed<boolean>(() => this.roomCreateErrorSignal());
  /** Submit enabled once name is trim-non-empty AND capacity is a positive number. */
  readonly canCreateRoom = computed<boolean>(() => {
    const name = this.roomNameSignal().trim();
    const cap = Number(this.roomCapacitySignal());
    return name.length > 0 && Number.isFinite(cap) && cap > 0;
  });

  // ── Attendance panel projections (CHO-1986) ────────────────────────────
  readonly isAttendanceActive = computed<boolean>(() => this.activeTabId() === 'attendance');
  /** The 4 sanctioned attendance statuses (for the mark-form `<select>`). */
  readonly attendanceStatuses = OFFERING_ATTENDANCE_STATUSES;
  readonly attendanceSessionsLoading = computed<boolean>(
    () => this.attendanceSessionsStateSignal().status === 'loading',
  );
  readonly attendanceSessionsError = computed<boolean>(
    () => this.attendanceSessionsStateSignal().status === 'error',
  );
  readonly attendanceSessions = computed<readonly OfferingSession[]>(() => {
    const s = this.attendanceSessionsStateSignal();
    return s.status === 'success' ? s.sessions : [];
  });
  readonly hasAttendanceSessions = computed<boolean>(() => this.attendanceSessions().length > 0);
  readonly selectedSessionId = computed<string>(() => this.selectedSessionIdSignal());
  readonly hasSelectedSession = computed<boolean>(
    () => this.selectedSessionIdSignal().length > 0,
  );
  readonly attendanceLoading = computed<boolean>(
    () => this.attendanceStateSignal().status === 'loading',
  );
  readonly attendanceError = computed<boolean>(
    () => this.attendanceStateSignal().status === 'error',
  );
  readonly attendanceRecords = computed<readonly OfferingAttendanceRecord[]>(() => {
    const s = this.attendanceStateSignal();
    return s.status === 'success' ? s.records : [];
  });
  readonly hasAttendanceRecords = computed<boolean>(() => this.attendanceRecords().length > 0);
  /** Selected learner as the picker's `value` (keeps the picked name shown). */
  readonly markGcidPicked = computed<readonly EntityRef[]>(() => {
    const picked = this.markGcidPickedSignal();
    return picked ? [picked] : [];
  });
  readonly markStatus = computed<string>(() => this.markStatusSignal());
  readonly isMarking = computed<boolean>(() => this.markingSignal());
  readonly markError = computed<boolean>(() => this.markErrorSignal());
  readonly markSucceeded = computed<boolean>(() => this.markSucceededSignal());
  /** Mark is enabled once a session is picked AND the gcid field is trim-non-empty. */
  readonly canMarkAttendance = computed<boolean>(
    () => this.hasSelectedSession() && this.markGcidSignal().trim().length > 0,
  );

  // ── Publish panel projections (CHO-1987) ───────────────────────────────
  readonly isPublishActive = computed<boolean>(() => this.activeTabId() === 'publish');
  readonly publishLoading = computed<boolean>(
    () => this.publishStateSignal().status === 'loading',
  );
  /** GET load error (distinct from the PATCH action error). */
  readonly publishError = computed<boolean>(() => this.publishStateSignal().status === 'error');
  readonly publishCourses = computed<readonly OfferingPublishCourse[]>(() => {
    const s = this.publishStateSignal();
    return s.status === 'success' ? s.courses : [];
  });
  readonly hasPublishCourses = computed<boolean>(() => this.publishCourses().length > 0);
  readonly isPublishing = computed<boolean>(() => this.publishingSignal());
  readonly publishActionError = computed<boolean>(() => this.publishActionErrorSignal());
  readonly publishSucceeded = computed<boolean>(() => this.publishSucceededSignal());
  readonly publishedCount = computed<number>(() => this.publishedCountSignal());

  // ── Prerequisites panel projections (ADR-226) ──────────────────────────
  readonly isPrerequisitesActive = computed<boolean>(
    () => this.activeTabId() === 'prerequisites',
  );
  readonly prerequisitesLoading = computed<boolean>(
    () => this.prerequisitesStateSignal().status === 'loading',
  );
  readonly prerequisitesError = computed<boolean>(
    () => this.prerequisitesStateSignal().status === 'error',
  );
  readonly prerequisitesErrorKey = computed<string>(() => {
    const s = this.prerequisitesStateSignal();
    return s.status === 'error' ? s.errorKey : '';
  });
  readonly prerequisiteCourses = computed<readonly OfferingPrerequisiteCourse[]>(() => {
    const s = this.prerequisitesStateSignal();
    return s.status === 'success' ? s.courses : [];
  });
  readonly hasPrerequisiteCourses = computed<boolean>(() => this.prerequisiteCourses().length > 0);

  // ── Prerequisite EDITOR projections (ADR-226) ──────────────────────────
  /** The 2 edge kinds for the add-form `<select>`. */
  readonly prerequisiteKinds = OFFERING_PREREQUISITE_KINDS;
  readonly prerequisiteKind = computed<PrerequisiteKind>(() => this.prerequisiteKindSignal());
  readonly prerequisiteTargetCourseId = computed<string>(() =>
    this.prerequisiteTargetCourseIdSignal(),
  );
  /** Course name-search adapter for the prerequisite TARGET picker (fixed
   *  entity type — unlike the curriculum ref picker there's no per-kind
   *  switch here, so a plain field is enough). */
  readonly prerequisiteTargetSearchPort: EntitySearchPort = this.courseSearch;
  /** Selected course as the picker's `value` (keeps the picked name shown). */
  readonly prerequisiteTargetPicked = computed<readonly EntityRef[]>(() => {
    const picked = this.prerequisiteTargetPickedSignal();
    return picked ? [picked] : [];
  });
  readonly isAddingPrerequisite = computed<boolean>(() => this.addingPrerequisiteSignal());
  readonly prerequisiteAddError = computed<boolean>(() => this.prerequisiteAddErrorSignal());
  /** Raw BE message for a failed add ('' when there is no specific detail). */
  readonly prerequisiteAddErrorDetail = computed<string>(() =>
    this.prerequisiteAddErrorDetailSignal(),
  );
  readonly prerequisiteAddSucceeded = computed<boolean>(() =>
    this.prerequisiteAddSucceededSignal(),
  );
  readonly prerequisiteRemoveError = computed<boolean>(() => this.prerequisiteRemoveErrorSignal());
  /** Submit is enabled once a target course has been chosen (kind always has a default). */
  readonly canAddPrerequisite = computed<boolean>(
    () => this.prerequisiteTargetCourseIdSignal().length > 0,
  );
  /** Whether the inline add-edge form is open for a specific attached course. */
  isPrerequisiteAddOpen(courseId: string): boolean {
    return this.prerequisiteAddCourseIdSignal() === courseId;
  }
  /** True while the given edge is mid-remove (per-row busy state). */
  isRemovingPrerequisite(courseId: string, prerequisiteCourseId: string): boolean {
    return (
      this.removingPrerequisiteKeySignal() === prerequisiteEdgeKey(courseId, prerequisiteCourseId)
    );
  }

  // ── Transcript panel projections (W6) ──────────────────────────────────
  readonly isTranscriptActive = computed<boolean>(() => this.activeTabId() === 'transcript');

  /**
   * Distinct roster learners across all attached courses, first-seen order —
   * REUSES the roster load (`rosterCourses`) rather than a second fetch; a
   * learner enrolled on two attached courses appears once (mirrors
   * `rosterDistinctCount`'s semantics, just materialised as a row list).
   */
  readonly transcriptLearners = computed<readonly OfferingRosterLearner[]>(() => {
    const seen = new Set<string>();
    const out: OfferingRosterLearner[] = [];
    for (const course of this.rosterCourses()) {
      for (const learner of course.learners) {
        if (!seen.has(learner.gcid)) {
          seen.add(learner.gcid);
          out.push(learner);
        }
      }
    }
    return out;
  });
  readonly hasTranscriptLearners = computed<boolean>(() => this.transcriptLearners().length > 0);

  // Phase 1: the (reused) Assessments load — the join needs assessment ids
  // up front, so this phase gates everything else in the panel.
  readonly transcriptAssessmentsLoading = computed<boolean>(() => this.assessmentsLoading());
  readonly transcriptAssessmentsError = computed<boolean>(() => this.assessmentsError());

  // Phase 2: the (reused) Roster load + the new transcript-entries GET, both
  // fired only once phase 1 resolves successfully (see the constructor effects).
  readonly transcriptEntriesLoading = computed<boolean>(
    () => this.rosterLoading() || this.transcriptStateSignal().status === 'loading',
  );
  readonly transcriptEntriesError = computed<boolean>(
    () => this.rosterError() || this.transcriptStateSignal().status === 'error',
  );
  /** Whichever of roster/transcript actually errored provides the message. */
  readonly transcriptEntriesErrorKey = computed<string>(() => {
    if (this.rosterError()) {
      return 'rplus.offerings.workspace.roster.error';
    }
    const s = this.transcriptStateSignal();
    return s.status === 'error' ? s.errorKey : '';
  });
  readonly transcriptEntries = computed<readonly TranscriptEntry[]>(() => {
    const s = this.transcriptStateSignal();
    return s.status === 'success' ? s.items : [];
  });
  /**
   * `assessmentId|gcid` → its GRADED entry only — a null `scorePercent`
   * (submitted, awaiting grading) is deliberately EXCLUDED here so it renders
   * identically to "no entry at all" (the same blank "—" cell), never a
   * fabricated 0%.
   */
  private readonly transcriptByCell = computed<ReadonlyMap<string, TranscriptEntry>>(() => {
    const map = new Map<string, TranscriptEntry>();
    for (const entry of this.transcriptEntries()) {
      if (entry.scorePercent !== null) {
        map.set(transcriptCellKey(entry.sourceRef, entry.gcid), entry);
      }
    }
    return map;
  });
  /** The graded entry for one matrix cell (assessment × learner), or `null` — the template renders "—". */
  transcriptCell(assessmentId: string, gcid: string): TranscriptEntry | null {
    return this.transcriptByCell().get(transcriptCellKey(assessmentId, gcid)) ?? null;
  }
  /**
   * A learner's overall average across THEIR graded cells only (never a
   * fabricated 0 for an ungraded assessment); `null` when they have no graded
   * cells yet — the template renders "—".
   */
  transcriptLearnerOverall(gcid: string): number | null {
    const scores: number[] = [];
    for (const a of this.assessments()) {
      const entry = this.transcriptCell(a.id, gcid);
      if (entry && entry.scorePercent !== null) {
        scores.push(entry.scorePercent);
      }
    }
    return scores.length > 0 ? Math.round(scores.reduce((sum, n) => sum + n, 0) / scores.length) : null;
  }
  /**
   * The cohort average for one assessment COLUMN, across every roster
   * learner who has a graded cell for it; `null` when nobody has been graded
   * yet — the template renders "—".
   */
  transcriptCohortAverage(assessmentId: string): number | null {
    const scores: number[] = [];
    for (const learner of this.transcriptLearners()) {
      const entry = this.transcriptCell(assessmentId, learner.gcid);
      if (entry && entry.scorePercent !== null) {
        scores.push(entry.scorePercent);
      }
    }
    return scores.length > 0 ? Math.round(scores.reduce((sum, n) => sum + n, 0) / scores.length) : null;
  }

  constructor() {
    // Re-fetch whenever the :id route param changes (initial nav included).
    effect(() => {
      const id = this.id();
      this.loadOffering(id);
    });
    // Lazily load the Assessments panel the first time it becomes active for an
    // offering (object-derived; the panel is only present for graduate/short).
    // `untracked` keeps the guard read out of the effect's dependency set.
    effect(() => {
      const active = this.activeTabId() === 'assessments';
      const o = this.offering();
      if (active && o) {
        untracked(() => {
          if (this.assessmentsLoadedForId() !== o.id) {
            this.loadAssessments(o.id);
          }
        });
      }
    });
    // Lazily load the Curriculum panel the first time it becomes active for an
    // offering (object-derived; present for graduate). Same `untracked` guard
    // idiom as the assessments lazy load.
    effect(() => {
      const active = this.activeTabId() === 'curriculum';
      const o = this.offering();
      if (active && o) {
        untracked(() => {
          if (this.curriculumLoadedForId() !== o.id) {
            this.loadCurriculum(o.id);
          }
        });
      }
    });
    // Lazily load the Certification panel the first time it becomes active for an
    // offering (object-derived; present for graduate/short). Same `untracked`
    // guard idiom as the curriculum lazy load.
    effect(() => {
      const active = this.activeTabId() === 'certification';
      const o = this.offering();
      if (active && o) {
        untracked(() => {
          if (this.certificationLoadedForId() !== o.id) {
            this.loadCertification(o.id);
          }
          // The manual per-learner "Issue certificate" action (manager-only)
          // needs the enrolled roster (learner gcids). The roster is otherwise
          // lazy to the Roster tab, so load it here too — but ONLY for a
          // manager: the roster GET is instructor-gated server-side (a learner
          // would 403), and only a manager sees the Issue affordance. The
          // shared `rosterLoadedForId` guard means a later Roster-tab visit
          // reuses this fetch rather than re-issuing it.
          if (this.canManage() && this.rosterLoadedForId() !== o.id) {
            this.loadRoster(o.id);
          }
        });
      }
    });
    // Lazily load the Sections panel the first time it becomes active for an
    // offering (object-derived; present for graduate only). Same `untracked`
    // guard idiom as the certification lazy load.
    effect(() => {
      const active = this.activeTabId() === 'sections';
      const o = this.offering();
      if (active && o) {
        untracked(() => {
          if (this.sectionsLoadedForId() !== o.id) {
            this.loadSections(o.id);
          }
        });
      }
    });
    // Lazily load the Roster panel the first time it becomes active for an
    // offering (object-derived; present for graduate + short). Same `untracked`
    // guard idiom as the certification lazy load.
    effect(() => {
      const active = this.activeTabId() === 'roster';
      const o = this.offering();
      if (active && o) {
        untracked(() => {
          if (this.rosterLoadedForId() !== o.id) {
            this.loadRoster(o.id);
          }
        });
      }
    });
    // Lazily load the Analytics panel the first time it becomes active for an
    // offering (object-derived; present for async). Same `untracked` guard.
    effect(() => {
      const active = this.activeTabId() === 'analytics';
      const o = this.offering();
      if (active && o) {
        untracked(() => {
          if (this.analyticsLoadedForId() !== o.id) {
            this.loadAnalytics(o.id);
          }
        });
      }
    });
    // Lazily load the Schedule panel the first time it becomes active for an
    // offering (object-derived; present for short). Same `untracked` guard.
    effect(() => {
      const active = this.activeTabId() === 'schedule';
      const o = this.offering();
      if (active && o) {
        untracked(() => {
          if (this.scheduleLoadedForId() !== o.id) {
            this.loadSchedule(o.id);
          }
        });
      }
    });
    // Lazily load the Attendance panel's SESSION SELECTOR the first time it
    // becomes active (object-derived; present for short). Records only load once
    // a session is picked. Same `untracked` guard idiom as the schedule load.
    effect(() => {
      const active = this.activeTabId() === 'attendance';
      const o = this.offering();
      if (active && o) {
        untracked(() => {
          if (this.attendanceSessionsLoadedForId() !== o.id) {
            this.loadAttendanceSessions(o.id);
          }
        });
      }
    });
    // Lazily load the Publish panel the first time it becomes active for an
    // offering (object-derived; present for async). Same `untracked` guard.
    effect(() => {
      const active = this.activeTabId() === 'publish';
      const o = this.offering();
      if (active && o) {
        untracked(() => {
          if (this.publishLoadedForId() !== o.id) {
            this.loadPublish(o.id);
          }
        });
      }
    });
    // Lazily load the Prerequisites panel the first time it becomes active for
    // an offering (object-derived; present for ALL THREE delivery types — the
    // DAG is course-level, not delivery-gated, unlike curriculum). Same
    // `untracked` guard idiom as the other lazy loads.
    effect(() => {
      const active = this.activeTabId() === 'prerequisites';
      const o = this.offering();
      if (active && o) {
        untracked(() => {
          if (this.prerequisitesLoadedForId() !== o.id) {
            this.loadPrerequisites(o.id);
          }
        });
      }
    });
    // Transcript panel (W6) — phase 1: ensure the REUSED Assessments + Roster
    // reads have both been fetched once the Transcript tab becomes active for
    // an offering (object-derived; present for graduate). Same `untracked`
    // guard idiom as every other lazy load; each guard is independent so a
    // visit to the Assessments or Roster tab first is never re-fetched here.
    effect(() => {
      const active = this.activeTabId() === 'transcript';
      const o = this.offering();
      if (active && o) {
        untracked(() => {
          if (this.assessmentsLoadedForId() !== o.id) {
            this.loadAssessments(o.id);
          }
          if (this.rosterLoadedForId() !== o.id) {
            this.loadRoster(o.id);
          }
        });
      }
    });
    // Transcript panel (W6) — phase 2: once the Assessments read resolves
    // successfully, fetch the transcript entries for those assessment ids
    // (the join needs the ids up front, so this is a SEPARATE effect, tracked
    // on the assessments state rather than gated behind the same guard as
    // phase 1). `getTranscriptByAssessments([])` short-circuits at the
    // service layer (no HTTP call) when the offering has no assessments yet.
    effect(() => {
      const active = this.activeTabId() === 'transcript';
      const o = this.offering();
      const assessmentsState = this.assessmentsStateSignal();
      if (active && o && assessmentsState.status === 'success') {
        untracked(() => {
          if (this.transcriptLoadedForId() !== o.id) {
            const ids = assessmentsState.items.map((a) => a.id);
            this.loadTranscript(o.id, ids);
          }
        });
      }
    });
  }

  /** Retry the failing detail fetch with the current :id. */
  retry(): void {
    this.loadOffering(this.id());
  }

  /** Reload after a 409 conflict so the buttons re-derive from fresh state. */
  reloadAfterConflict(): void {
    this.conflictActionSignal.set(null);
    this.loadOffering(this.id());
  }

  /** Whether a given action button should show its busy/in-flight label. */
  isPending(action: OfferingTransition): boolean {
    return this.pendingActionSignal() === action;
  }

  /**
   * Switch the active tab by writing the `?tab=` query param (URL-synced,
   * merge + replaceUrl — the path + other params are preserved, history stays
   * clean). The `tabParam` input re-binds, so `activeTabId` re-derives.
   */
  selectTab(id: OfferingTabId): void {
    if (id === this.activeTabId()) {
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /**
   * Roving-tabindex keyboard nav for the tablist (WAI-ARIA automatic
   * activation): ←/→ move + activate the adjacent tab (wrapping), Home/End
   * jump to first/last. Focus follows the newly active tab.
   */
  onTabKeydown(event: KeyboardEvent): void {
    const tabs = this.tabList();
    const count = tabs.length;
    if (count === 0) {
      return;
    }
    const current = tabs.findIndex((t) => t.id === this.activeTabId());
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (current + 1) % count;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (current - 1 + count) % count;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.selectTab(tabs[next].id);
    this.focusTab(next);
  }

  /**
   * Run a lifecycle action. `archive` (destructive soft-delete) is confirm-
   * gated; the others fire immediately. Re-entrancy is guarded by the pending
   * signal.
   */
  async runAction(action: OfferingTransition): Promise<void> {
    if (this.pendingActionSignal() !== null) {
      return;
    }
    if (action === 'archive') {
      const ok = await this.confirmDialog.confirm({
        title: 'rplus.offerings.workspace.archive_confirm.title',
        message: 'rplus.offerings.workspace.archive_confirm.body',
        confirmText: 'rplus.offerings.workspace.archive_confirm.ok',
        cancelText: 'rplus.offerings.workspace.archive_confirm.cancel',
        variant: 'danger',
      });
      if (!ok) {
        return;
      }
    }
    this.applyTransition(action);
  }

  private applyTransition(action: OfferingTransition): void {
    this.pendingActionSignal.set(action);
    this.conflictActionSignal.set(null);
    this.actionErrorSignal.set(false);
    this.actionErrorDetailSignal.set('');
    this.service
      .transition(this.id(), action)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (offering) => {
          this.pendingActionSignal.set(null);
          this.loadStateSignal.set({ status: 'success', offering });
        },
        error: (err: unknown) => {
          this.pendingActionSignal.set(null);
          if (statusOf(err) === 409) {
            this.conflictActionSignal.set(action);
          } else {
            // Fail-loud: surface the BE `{error}` verbatim when present (the
            // launch-readiness 422 carries the "add content …" reason); '' → the
            // generic action-error copy.
            this.actionErrorDetailSignal.set(errorDetailOf(err));
            this.actionErrorSignal.set(true);
          }
        },
      });
  }

  // ── Assessments panel actions (W3.A) ───────────────────────────────────

  /** i18n key for an assessment-state badge cell. */
  assessmentStateLabelKey(state: string): string {
    return offeringAssessmentStateLabelKey(state);
  }

  /** Design-system badge variant for an assessment-state chip. */
  assessmentStateBadgeClass(state: string): string {
    switch (state) {
      case 'OPEN':
      case 'RELEASED':
        return 'badge-success';
      case 'SCHEDULED':
      case 'GRADING':
      case 'GRADED':
        return 'badge-info';
      default: // DRAFT, CLOSED, ARCHIVED, unknown
        return 'badge-neutral';
    }
  }

  /** Retry the failed assessments list fetch for the current offering. */
  retryAssessments(): void {
    const o = this.offering();
    if (o) {
      this.loadAssessments(o.id);
    }
  }

  /** Retry the failed curriculum fetch for the current offering. */
  retryCurriculum(): void {
    const o = this.offering();
    if (o) {
      this.loadCurriculum(o.id);
    }
  }

  /** i18n key for a content-item kind badge (atom/video/youtube/…). */
  curriculumKindLabelKey(kind: string): string {
    return curriculumKindLabelKey(kind);
  }

  /** Whether an item's `ref` is an opaque UUID (atom/assessment/live_classroom)
   *  — hidden in the list (the title is the label) vs a URL, shown verbatim. */
  itemRefIsUuid(kind: string): boolean {
    return curriculumKindRefIsUuid(kind);
  }

  // ── Curriculum EDITOR actions (R+ Phase-2 S1, CHO-2050) ────────────────

  /** Whether the inline add-item form is open for a specific attached course. */
  isCurriculumAddOpen(courseId: string): boolean {
    return this.curriculumAddCourseIdSignal() === courseId;
  }

  /** True while the given item is mid-remove (per-row busy state). */
  isRemovingItem(itemId: string): boolean {
    return this.removingItemIdSignal() === itemId;
  }

  /**
   * Open the inline add-item form for one attached course (manager-only). Only
   * one form is open at a time; opening resets the fields + any prior add
   * error/success so a re-open starts clean.
   */
  openCurriculumAddForm(courseId: string): void {
    this.curriculumAddErrorSignal.set(false);
    this.curriculumAddErrorDetailSignal.set('');
    this.curriculumAddSucceededSignal.set(false);
    this.curriculumKindSignal.set(OFFERING_CURRICULUM_KINDS[0]);
    this.curriculumRefSignal.set('');
    this.curriculumTitleSignal.set('');
    this.curriculumRefPickedSignal.set(null);
    this.curriculumAddCourseIdSignal.set(courseId);
  }

  /** Close the add-item form without adding. */
  closeCurriculumAddForm(): void {
    this.curriculumAddCourseIdSignal.set(null);
    this.curriculumRefSignal.set('');
    this.curriculumTitleSignal.set('');
  }

  /** Bind the kind `<select>` (drives the ref hint + placeholder). */
  onCurriculumKindChange(event: Event): void {
    this.curriculumKindSignal.set((event.target as HTMLSelectElement).value);
    // The ref TYPE changes with the kind — clear any prior pick/paste so a
    // stale ref can't be submitted under the new kind.
    this.curriculumRefSignal.set('');
    this.curriculumRefPickedSignal.set(null);
  }

  /** Bind the required ref field (signal-driven, OnPush-friendly). */
  onCurriculumRefInput(event: Event): void {
    this.curriculumRefSignal.set((event.target as HTMLInputElement).value);
  }

  /** Entity-picker selection → the ref id (name-based; kills raw-UUID paste). */
  onCurriculumRefPicked(ref: EntityRef): void {
    this.curriculumRefPickedSignal.set(ref);
    this.curriculumRefSignal.set(ref.id);
  }

  /** Bind the required title field (signal-driven, OnPush-friendly). */
  onCurriculumTitleInput(event: Event): void {
    this.curriculumTitleSignal.set((event.target as HTMLInputElement).value);
  }

  /**
   * Native form-submit handler for the add-item form. Signal-driven (NO
   * FormsModule) — binds `(submit)` and must `preventDefault()`. The kind / ref
   * / title come from signals; `courseId` is the course whose form is open.
   */
  onCurriculumAddSubmit(event: Event, courseId: string): void {
    event.preventDefault();
    this.addCurriculumItem(courseId);
  }

  private addCurriculumItem(courseId: string): void {
    const o = this.offering();
    const kind = this.curriculumKindSignal();
    const ref = this.curriculumRefSignal().trim();
    const title = this.curriculumTitleSignal().trim();
    if (!o || ref.length === 0 || title.length === 0 || this.addingItemSignal()) {
      return;
    }
    this.addingItemSignal.set(true);
    this.curriculumAddErrorSignal.set(false);
    this.curriculumAddErrorDetailSignal.set('');
    this.curriculumAddSucceededSignal.set(false);
    this.service
      .addCurriculumItem(o.id, { courseId, kind, ref, title })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (outline) => {
          this.addingItemSignal.set(false);
          this.applyCourseOutline(outline); // re-render from the returned items
          this.curriculumAddCourseIdSignal.set(null); // close the form
          this.curriculumRefSignal.set('');
          this.curriculumTitleSignal.set('');
          this.curriculumAddSucceededSignal.set(true);
        },
        error: (err: unknown) => {
          this.addingItemSignal.set(false);
          // Fail-loud: surface the BE `{error}` message when present. The form
          // stays open with the draft intact so the author can fix + retry.
          this.curriculumAddErrorDetailSignal.set(errorDetailOf(err));
          this.curriculumAddErrorSignal.set(true);
        },
      });
  }

  /**
   * Remove one content item from a course's outline. Destructive, so
   * confirm-gated; re-entrancy is guarded by the removing signal. On success the
   * course re-renders from the returned outline.
   */
  async removeCurriculumItem(
    course: OfferingCurriculumCourse,
    item: OfferingCurriculumItem,
  ): Promise<void> {
    if (this.removingItemIdSignal() !== null) {
      return;
    }
    const ok = await this.confirmDialog.confirm({
      title: 'rplus.offerings.workspace.curriculum.remove_confirm.title',
      message: 'rplus.offerings.workspace.curriculum.remove_confirm.body',
      confirmText: 'rplus.offerings.workspace.curriculum.remove_confirm.ok',
      cancelText: 'rplus.offerings.workspace.curriculum.remove_confirm.cancel',
      variant: 'danger',
    });
    if (!ok) {
      return;
    }
    const o = this.offering();
    if (!o) {
      return;
    }
    this.removingItemIdSignal.set(item.itemId);
    this.curriculumRemoveErrorSignal.set(false);
    this.curriculumAddSucceededSignal.set(false);
    this.service
      .removeCurriculumItem(o.id, { courseId: course.id, itemId: item.itemId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (outline) => {
          this.removingItemIdSignal.set(null);
          this.applyCourseOutline(outline);
        },
        error: () => {
          this.removingItemIdSignal.set(null);
          this.curriculumRemoveErrorSignal.set(true);
        },
      });
  }

  /** Move a content item one slot earlier (reorder via the full id order). */
  moveCurriculumItemUp(course: OfferingCurriculumCourse, index: number): void {
    this.reorderCurriculum(course, index, index - 1);
  }

  /** Move a content item one slot later (reorder via the full id order). */
  moveCurriculumItemDown(course: OfferingCurriculumCourse, index: number): void {
    this.reorderCurriculum(course, index, index + 1);
  }

  /**
   * Reorder a course's outline by swapping two adjacent items and POSTing the
   * full permutation of item ids. Bounds-guarded + re-entrancy-guarded; on
   * success the course re-renders from the returned outline.
   */
  private reorderCurriculum(
    course: OfferingCurriculumCourse,
    from: number,
    to: number,
  ): void {
    const o = this.offering();
    const ids = course.items.map((it) => it.itemId);
    if (
      !o ||
      this.reorderingItemIdSignal() !== null ||
      from < 0 ||
      to < 0 ||
      from >= ids.length ||
      to >= ids.length
    ) {
      return;
    }
    const moving = ids[from];
    [ids[from], ids[to]] = [ids[to], ids[from]]; // adjacent swap → full order
    this.reorderingItemIdSignal.set(moving);
    this.curriculumReorderErrorSignal.set(false);
    this.curriculumAddSucceededSignal.set(false);
    this.service
      .reorderCurriculum(o.id, { courseId: course.id, orderedItemIds: ids })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (outline) => {
          this.reorderingItemIdSignal.set(null);
          this.applyCourseOutline(outline);
        },
        error: () => {
          this.reorderingItemIdSignal.set(null);
          this.curriculumReorderErrorSignal.set(true);
        },
      });
  }

  /**
   * Splice one course's freshly-mutated outline back into the loaded curriculum
   * state — the write endpoints return only the affected course (no re-GET), so
   * the other attached courses are left untouched.
   */
  private applyCourseOutline(outline: OfferingCurriculumCourseOutline): void {
    const s = this.curriculumStateSignal();
    if (s.status !== 'success') {
      return;
    }
    const courses = s.courses.map((c) =>
      c.id === outline.courseId ? { ...c, items: outline.items } : c,
    );
    this.curriculumStateSignal.set({ status: 'success', courses });
  }

  /** Retry the failed certification-config fetch for the current offering. */
  retryCertification(): void {
    const o = this.offering();
    if (o) {
      this.loadCertification(o.id);
    }
  }

  // ── Manual per-learner cert issuance actions (Certification tab) ────────

  /**
   * Reveal the inline two-step confirm for one learner row (manager-only) —
   * mirrors the roster unenrol control. Only one confirm is open at a time.
   */
  startCertIssue(courseId: string, gcid: string): void {
    this.confirmingIssueSignal.set(rosterRowKey(courseId, gcid));
  }

  /** Dismiss the inline confirm without issuing (no POST). */
  cancelCertIssue(): void {
    this.confirmingIssueSignal.set(null);
  }

  /**
   * Confirm + fire the MANUAL issue POST for one learner row. On 201 the row
   * flips to a per-row success note; a 409 is a FRIENDLY "already holds a
   * certificate" info state (the desired end-state is reached — the learner IS
   * certified — so it is not an error); any other failure surfaces the BE
   * `{error}` inline (fail-loud, never a silent no-op). Re-entrancy is guarded by
   * the in-flight signal.
   */
  issueCertificate(courseId: string, gcid: string): void {
    const o = this.offering();
    if (!o || courseId.length === 0 || gcid.length === 0 || this.issuingCertSignal() !== null) {
      return;
    }
    const key = rosterRowKey(courseId, gcid);
    this.issuingCertSignal.set(key);
    this.confirmingIssueSignal.set(null);
    this.certIssueErrorDetailSignal.set('');
    this.setCertIssueOutcome(key, null); // clear any prior outcome for this row
    this.service
      .issueCertificate(o.id, { learnerGcid: gcid, courseId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.issuingCertSignal.set(null);
          this.setCertIssueOutcome(key, 'success');
        },
        error: (err: unknown) => {
          this.issuingCertSignal.set(null);
          // 409 = the learner ALREADY holds a certificate for this course — the
          // end-state is reached, so surface it as a friendly info note, NOT a
          // loud error (mirrors the WIRED lane treating a duplicate as expected).
          if (httpErrorView(err)?.status === 409) {
            this.setCertIssueOutcome(key, 'already');
            return;
          }
          this.certIssueErrorDetailSignal.set(errorDetailOf(err));
          this.setCertIssueOutcome(key, 'error');
        },
      });
  }

  /** Splice one row's issue outcome into the per-row map (null clears the row). */
  private setCertIssueOutcome(
    key: string,
    outcome: 'success' | 'already' | 'error' | null,
  ): void {
    const next = new Map(this.certIssueOutcomeSignal());
    if (outcome === null) {
      next.delete(key);
    } else {
      next.set(key, outcome);
    }
    this.certIssueOutcomeSignal.set(next);
  }

  // ── Completion-policy EDITOR actions (R+ Phase-2 S2, CHO-2054) ──────────

  /**
   * Open the inline completion-policy form (manager-only). Prefills from the
   * saved policy when present (edit), else sensible defaults (create); resets any
   * prior save error/success so a re-open starts clean.
   */
  openPolicyForm(): void {
    const p = this.completionPolicy();
    this.policyAwardsSignal.set(p?.awardsCertificate ?? false);
    this.policyScoreSignal.set(p ? String(p.passingScorePct) : '');
    this.policyTitleSignal.set(p?.certTitle ?? '');
    this.policySaveErrorSignal.set(false);
    this.policySaveErrorDetailSignal.set('');
    this.policySaveSucceededSignal.set(false);
    this.policyFormOpenSignal.set(true);
  }

  /** Close the completion-policy form without saving. */
  closePolicyForm(): void {
    this.policyFormOpenSignal.set(false);
  }

  /** Bind the "awards a certificate" checkbox (signal-driven, OnPush-friendly). */
  onPolicyAwardsChange(event: Event): void {
    this.policyAwardsSignal.set((event.target as HTMLInputElement).checked);
  }

  /** Bind the passing-score number field (kept as a string; validated in canSavePolicy). */
  onPolicyScoreInput(event: Event): void {
    this.policyScoreSignal.set((event.target as HTMLInputElement).value);
  }

  /** Bind the cert-title text field. */
  onPolicyTitleInput(event: Event): void {
    this.policyTitleSignal.set((event.target as HTMLInputElement).value);
  }

  /** Native form-submit handler for the policy form (signal-driven; preventDefault). */
  onPolicySubmit(event: Event): void {
    event.preventDefault();
    this.saveCompletionPolicy();
  }

  private saveCompletionPolicy(): void {
    const o = this.offering();
    if (!o || !this.canSavePolicy() || this.savingPolicySignal()) {
      return;
    }
    const passingScorePct = Number(this.policyScoreSignal().trim());
    this.savingPolicySignal.set(true);
    this.policySaveErrorSignal.set(false);
    this.policySaveErrorDetailSignal.set('');
    this.policySaveSucceededSignal.set(false);
    this.service
      .setCompletionPolicy(o.id, {
        awardsCertificate: this.policyAwardsSignal(),
        passingScorePct,
        certTitle: this.policyTitleSignal().trim(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (policy) => {
          this.savingPolicySignal.set(false);
          this.applyCompletionPolicy(policy); // splice the saved policy into state
          this.policyFormOpenSignal.set(false);
          this.policySaveSucceededSignal.set(true);
        },
        error: (err: unknown) => {
          this.savingPolicySignal.set(false);
          // Fail-loud: surface the BE `{error}` (e.g. score out of range). The
          // form stays open with the input intact so the admin can fix + retry.
          this.policySaveErrorDetailSignal.set(errorDetailOf(err));
          this.policySaveErrorSignal.set(true);
        },
      });
  }

  /** Splice the freshly-saved completion policy into the loaded certification state. */
  private applyCompletionPolicy(policy: OfferingCompletionPolicy): void {
    const s = this.certificationStateSignal();
    if (s.status !== 'success') {
      return;
    }
    this.certificationStateSignal.set({
      status: 'success',
      courses: s.courses,
      completionPolicy: policy,
    });
  }

  /** Retry the failed roster fetch for the current offering. */
  retryRoster(): void {
    const o = this.offering();
    if (o) {
      this.loadRoster(o.id);
    }
  }

  // ── Enrol-learner EDITOR actions (R+ Phase-2 S3, CHO-2053) ─────────────

  /**
   * Open the inline enrol form (manager-only). Defaults the course select to the
   * first attached course (the roster GET already lists them); resets any prior
   * enrol error/success so a re-open starts clean.
   */
  openEnrolForm(): void {
    const first = this.rosterCourses()[0]?.id ?? '';
    this.enrolCourseIdSignal.set(first);
    this.enrolSelectedGcidsSignal.set([]);
    this.enrolErrorSignal.set(false);
    this.enrolErrorDetailSignal.set('');
    this.enrolSucceededSignal.set(false);
    this.enrolFormOpenSignal.set(true);
  }

  /** Close the enrol form without enrolling. */
  closeEnrolForm(): void {
    this.enrolFormOpenSignal.set(false);
    this.enrolSelectedGcidsSignal.set([]);
  }

  /** Bind the course `<select>` (signal-driven, OnPush-friendly). */
  onEnrolCourseChange(event: Event): void {
    this.enrolCourseIdSignal.set((event.target as HTMLSelectElement).value);
  }

  /** Checklist selection -> the ticked GCIDs (issue 4b bulk enrol). */
  onEnrolSelectionChange(gcids: readonly string[]): void {
    this.enrolSelectedGcidsSignal.set(gcids);
  }

  /** Native form-submit handler for the enrol form (signal-driven; preventDefault). */
  onEnrolSubmit(event: Event): void {
    event.preventDefault();
    this.bulkEnrolLearners();
  }

  private bulkEnrolLearners(): void {
    const o = this.offering();
    const courseId = this.enrolCourseIdSignal();
    const gcids = this.enrolSelectedGcidsSignal();
    if (!o || courseId.length === 0 || gcids.length === 0 || this.enrolingSignal()) {
      return;
    }
    this.enrolingSignal.set(true);
    this.enrolErrorSignal.set(false);
    this.enrolErrorDetailSignal.set('');
    this.enrolSucceededSignal.set(false);
    this.service
      .bulkEnrolLearners(o.id, { courseId, gcids })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enrolingSignal.set(false);
          this.enrolSelectedGcidsSignal.set([]);
          this.enrolSucceededSignal.set(true);
          // Close the form so the checklist child unmounts (a fresh, un-ticked
          // list on the next open); the success note lives outside the form.
          this.enrolFormOpenSignal.set(false);
          // Silent re-GET: swap in the fresh roster WITHOUT the loading skeleton.
          this.loadRoster(o.id, true);
        },
        error: (err: unknown) => {
          this.enrolingSignal.set(false);
          // Fail-loud: surface the BE `{error}` (409 capacity / 400 unattached).
          // The form stays open with the selection intact to retry.
          this.enrolErrorDetailSignal.set(errorDetailOf(err));
          this.enrolErrorSignal.set(true);
        },
      });
  }

  // ── Unenrol-learner actions (R+ Phase-2 WS-B) ──────────────────────────

  /**
   * Reveal the inline two-step confirm for one learner row (manager-only). Only
   * one confirm is open at a time; opening a new one clears any prior error +
   * the panel-level success note so the affordance starts clean.
   */
  startUnenrol(courseId: string, gcid: string): void {
    this.confirmingUnenrolSignal.set(rosterRowKey(courseId, gcid));
    this.unenrolErrorKeySignal.set(null);
    this.unenrolErrorDetailSignal.set('');
    this.unenrolSucceededSignal.set(false);
  }

  /** Dismiss the inline confirm without removing (no POST). */
  cancelUnenrol(): void {
    this.confirmingUnenrolSignal.set(null);
    this.unenrolErrorKeySignal.set(null);
    this.unenrolErrorDetailSignal.set('');
  }

  /**
   * Confirm + fire the unenrol POST for one learner row. The confirm view stays
   * open (buttons disabled) while in-flight. On 204 the row's learner is gone,
   * so a silent re-GET swaps the fresh roster in WITHOUT the loading skeleton
   * and a panel-level success note confirms the removal. A failure surfaces the
   * BE `{message}` inline and leaves the roster untouched (fail-loud, never a
   * silent no-op).
   */
  unenrolLearner(courseId: string, gcid: string): void {
    const o = this.offering();
    if (!o || courseId.length === 0 || gcid.length === 0 || this.removingLearnerSignal() !== null) {
      return;
    }
    const key = rosterRowKey(courseId, gcid);
    this.removingLearnerSignal.set(key);
    this.unenrolErrorKeySignal.set(null);
    this.unenrolErrorDetailSignal.set('');
    this.service
      .removeLearner(o.id, { courseId, gcid })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.removingLearnerSignal.set(null);
          this.confirmingUnenrolSignal.set(null);
          this.unenrolSucceededSignal.set(true);
          this.loadRoster(o.id, true);
        },
        error: (err: unknown) => {
          this.removingLearnerSignal.set(null);
          // Keep the confirm open (buttons re-enabled) so the user can retry.
          this.unenrolErrorKeySignal.set(key);
          this.unenrolErrorDetailSignal.set(errorDetailOf(err));
        },
      });
  }

  /** Retry the failed analytics fetch for the current offering. */
  retryAnalytics(): void {
    const o = this.offering();
    if (o) {
      this.loadAnalytics(o.id);
    }
  }

  /** i18n key for a cert-type badge (COMPLETION/COMPETENCY/…). */
  certTypeLabelKey(certType: string): string {
    return certTypeLabelKey(certType);
  }

  /** Open the attach picker (manager-only affordance) + lazily load test-sets. */
  openPicker(): void {
    this.attachErrorSignal.set(false);
    this.attachSucceededSignal.set(false);
    this.pickerOpenSignal.set(true);
    if (!this.testSetsLoadedSignal()) {
      this.loadTestSets();
    }
  }

  /** Close the attach picker without attaching. */
  closePicker(): void {
    this.pickerOpenSignal.set(false);
  }

  /** Retry the failed test-set fetch inside the picker. */
  retryTestSets(): void {
    this.loadTestSets();
  }

  /** True while the given test-set is mid-attach (per-row busy state). */
  isAttaching(testSetId: string): boolean {
    return this.attachingIdSignal() === testSetId;
  }

  /** Attach the chosen PUBLISHED test-set to this offering. */
  selectTestSet(testSetId: string): void {
    this.attachTestSet(testSetId);
  }

  /** True while the given assessment is mid-remove (per-row busy state). */
  isRemoving(assessmentId: string): boolean {
    return this.removingIdSignal() === assessmentId;
  }

  /**
   * Remove (detach → archive) an assessment. Destructive, so confirm-gated;
   * re-entrancy is guarded by the removing signal.
   */
  async removeAssessment(assessment: OfferingAssessment): Promise<void> {
    if (this.removingIdSignal() !== null) {
      return;
    }
    const ok = await this.confirmDialog.confirm({
      title: 'rplus.offerings.workspace.assessments.remove_confirm.title',
      message: 'rplus.offerings.workspace.assessments.remove_confirm.body',
      confirmText: 'rplus.offerings.workspace.assessments.remove_confirm.ok',
      cancelText: 'rplus.offerings.workspace.assessments.remove_confirm.cancel',
      variant: 'danger',
    });
    if (!ok) {
      return;
    }
    this.detach(assessment);
  }

  private loadAssessments(offeringId: string): void {
    this.assessmentsLoadedForId.set(offeringId);
    this.assessmentsStateSignal.set({ status: 'loading' });
    this.removeErrorSignal.set(false);
    this.service
      .listOfferingAssessments(offeringId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => this.assessmentsStateSignal.set({ status: 'success', items }),
        error: () =>
          this.assessmentsStateSignal.set({
            status: 'error',
            errorKey: 'rplus.offerings.workspace.assessments.error',
          }),
      });
  }

  private loadCurriculum(offeringId: string): void {
    this.curriculumLoadedForId.set(offeringId);
    this.curriculumStateSignal.set({ status: 'loading' });
    // A fresh (re)load resets any open editor form + transient write state.
    this.curriculumAddCourseIdSignal.set(null);
    this.curriculumRefSignal.set('');
    this.curriculumTitleSignal.set('');
    this.curriculumAddErrorSignal.set(false);
    this.curriculumAddErrorDetailSignal.set('');
    this.curriculumAddSucceededSignal.set(false);
    this.curriculumRemoveErrorSignal.set(false);
    this.curriculumReorderErrorSignal.set(false);
    // Blast-radius counts + module structure are re-fetched per course each (re)load.
    this.courseUsageSignal.set(new Map<string, number>());
    this.moduleStateSignal.set(new Map<string, readonly OfferingModule[]>());
    this.moduleCreateCourseIdSignal.set(null);
    this.moduleCreateTitleSignal.set('');
    this.moduleErrorSignal.set('');
    this.moduleAddSelectionSignal.set(new Map<string, string>());
    this.service
      .getOfferingCurriculum(offeringId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (courses) => {
          this.curriculumStateSignal.set({ status: 'success', courses });
          // Lazily fetch each attached course's "used by N offerings" count —
          // non-blocking + resilient; a failure degrades that course to no badge.
          this.loadCourseUsageCounts(courses);
          // Lazily fetch each attached course's module structure (same resilience).
          this.loadModulesForCourses(offeringId, courses);
        },
        error: () =>
          this.curriculumStateSignal.set({
            status: 'error',
            errorKey: 'rplus.offerings.workspace.curriculum.error',
          }),
      });
  }

  /**
   * Fetch each attached course's "used by N offerings" blast-radius count
   * (lazy + resilient). Every call is independent: results stream into
   * `courseUsageSignal` as they resolve so the curriculum render never blocks,
   * and a failed count degrades that one course to NO badge (never breaks the
   * panel) — fail-loud at the transport, fail-soft at the edge.
   */
  private loadCourseUsageCounts(courses: readonly OfferingCurriculumCourse[]): void {
    for (const course of courses) {
      const courseId = course.id;
      if (!courseId) {
        continue;
      }
      this.service
        .countOfferingsForCourse(courseId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (count) => {
            const next = new Map<string, number>(this.courseUsageSignal());
            next.set(courseId, count);
            this.courseUsageSignal.set(next);
          },
          error: () => {
            /* Resilient: a failed count degrades to no badge (no panel break). */
          },
        });
    }
  }

  // ── R+ Phase-2 W7 (WS-A) — Module structure (lazy load + write ops) ─────────

  /**
   * Fetch each attached course's module structure (lazy + resilient). Results
   * stream into moduleStateSignal so the curriculum render never blocks, and a
   * failed load leaves that one course without a structure section (fail-soft).
   */
  private loadModulesForCourses(
    offeringId: string,
    courses: readonly OfferingCurriculumCourse[],
  ): void {
    for (const course of courses) {
      const courseId = course.id;
      if (!courseId) {
        continue;
      }
      this.service
        .listModules(offeringId, courseId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (modules) => this.patchModules(courseId, modules),
          error: () => {
            /* Resilient: a failed module load leaves the course structure-less. */
          },
        });
      // Cohort completion roll-up (CHO-2074), lazy + resilient: a failed progress
      // read simply leaves the module cards badge-less (never breaks the panel).
      this.service
        .getModuleProgress(offeringId, courseId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (rows) => this.patchModuleProgress(rows),
          error: () => {
            /* Resilient: no progress → no completion badge (no panel break). */
          },
        });
    }
  }

  /** Merge a course's per-module cohort progress rows into the state map (by module id). */
  private patchModuleProgress(rows: readonly OfferingModuleProgress[]): void {
    const next = new Map<string, OfferingModuleProgress>(this.moduleProgressSignal());
    for (const row of rows) {
      if (row.moduleId) {
        next.set(row.moduleId, row);
      }
    }
    this.moduleProgressSignal.set(next);
  }

  /**
   * Cohort completion label for a module card ("N learner(s) complete"), or null
   * when progress has not loaded for it yet. Pluralised in-component via
   * resolveUsagePlural (this app's ngx-translate has no ICU compiler).
   */
  moduleCompletionLabel(moduleId: string): string | null {
    const p = this.moduleProgressSignal().get(moduleId);
    if (!p) {
      return null;
    }
    return resolveUsagePlural(
      this.translate.instant('rplus.offerings.workspace.modules.complete_count'),
      p.completeCount,
    );
  }

  /** Replace a course's modules in the state map (immutable write). */
  private patchModules(courseId: string, modules: readonly OfferingModule[]): void {
    const next = new Map<string, readonly OfferingModule[]>(this.moduleStateSignal());
    next.set(courseId, modules);
    this.moduleStateSignal.set(next);
  }

  /** Splice a single mutated module back into its course's list (create/add/req). */
  private upsertModule(m: OfferingModule): void {
    const existing = this.moduleStateSignal().get(m.courseId) ?? [];
    const idx = existing.findIndex((x) => x.id === m.id);
    const merged = idx === -1 ? [...existing, m] : existing.map((x) => (x.id === m.id ? m : x));
    this.patchModules(
      m.courseId,
      [...merged].sort((a, b) => a.position - b.position),
    );
  }

  /** Drop a soft-deleted module from its course's list. */
  private dropModule(courseId: string, moduleId: string): void {
    const existing = this.moduleStateSignal().get(courseId) ?? [];
    this.patchModules(
      courseId,
      existing.filter((m) => m.id !== moduleId),
    );
  }

  /** Surface a module-op error (BE detail preferred; generic fallback) + clear busy. */
  private setModuleError(err: unknown): void {
    this.moduleErrorSignal.set(
      errorDetailOf(err) || this.translate.instant('rplus.offerings.workspace.modules.error'),
    );
    this.moduleBusySignal.set(false);
  }

  // Public template surface -----------------------------------------------------

  /** The loaded modules for a course (empty when none / not yet loaded). */
  modulesForCourse(courseId: string): readonly OfferingModule[] {
    return this.moduleStateSignal().get(courseId) ?? [];
  }
  /** Whether the "New module" inline form is open for this course. */
  isModuleCreateOpen(courseId: string): boolean {
    return this.moduleCreateCourseIdSignal() === courseId;
  }
  moduleCreateTitle(): string {
    return this.moduleCreateTitleSignal();
  }
  moduleError(): string {
    return this.moduleErrorSignal();
  }
  moduleBusy(): boolean {
    return this.moduleBusySignal();
  }
  /** The curriculum item id chosen in a module's add-item picker ('' = none). */
  moduleAddSelection(moduleId: string): string {
    return this.moduleAddSelectionSignal().get(moduleId) ?? '';
  }
  onModuleAddSelect(moduleId: string, e: Event): void {
    const v = (e.target as HTMLSelectElement).value;
    const next = new Map<string, string>(this.moduleAddSelectionSignal());
    next.set(moduleId, v);
    this.moduleAddSelectionSignal.set(next);
  }
  private clearModuleAddSelection(moduleId: string): void {
    const next = new Map<string, string>(this.moduleAddSelectionSignal());
    next.delete(moduleId);
    this.moduleAddSelectionSignal.set(next);
  }

  /** The display title of a module member, resolved from the course's flat items. */
  moduleItemLabel(course: OfferingCurriculumCourse, contentItemId: string): string {
    const it = course.items.find((x) => x.itemId === contentItemId);
    return it?.title || contentItemId;
  }

  /** The course's flat items not yet grouped into this module (add-item options). */
  moduleAvailableItems(
    course: OfferingCurriculumCourse,
    m: OfferingModule,
  ): readonly OfferingCurriculumItem[] {
    const grouped = new Set(m.items.map((it) => it.contentItemId));
    return course.items.filter((it) => it.itemId && !grouped.has(it.itemId));
  }

  /** The requirement kinds selectable from the UI. */
  readonly moduleRequirementKinds = OFFERING_MODULE_REQUIREMENT_KINDS;

  openModuleCreate(courseId: string): void {
    this.moduleErrorSignal.set('');
    this.moduleCreateTitleSignal.set('');
    this.moduleCreateCourseIdSignal.set(courseId);
  }
  cancelModuleCreate(): void {
    this.moduleCreateCourseIdSignal.set(null);
    this.moduleCreateTitleSignal.set('');
  }
  onModuleCreateTitleInput(e: Event): void {
    this.moduleCreateTitleSignal.set((e.target as HTMLInputElement).value);
  }

  /** i18n key summarising a module's completion requirement (param `n` = threshold). */
  moduleRequirementLabelKey(m: OfferingModule): string {
    return `rplus.offerings.workspace.modules.req_${m.requirement.kind}_label`;
  }

  submitModuleCreate(courseId: string): void {
    const title = this.moduleCreateTitleSignal().trim();
    if (!title || this.moduleBusySignal()) {
      return;
    }
    this.moduleBusySignal.set(true);
    this.moduleErrorSignal.set('');
    this.service
      .createModule(this.id(), { courseId, title })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (m) => {
          this.upsertModule(m);
          this.cancelModuleCreate();
          this.moduleBusySignal.set(false);
        },
        error: (err) => this.setModuleError(err),
      });
  }

  addModuleItem(courseId: string, moduleId: string, contentItemId: string): void {
    if (!contentItemId || this.moduleBusySignal()) {
      return;
    }
    this.moduleBusySignal.set(true);
    this.moduleErrorSignal.set('');
    this.service
      .addModuleItem(this.id(), { courseId, moduleId, contentItemId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (m) => {
          this.upsertModule(m);
          this.clearModuleAddSelection(moduleId);
          this.moduleBusySignal.set(false);
        },
        error: (err) => this.setModuleError(err),
      });
  }

  removeModuleItem(courseId: string, moduleId: string, itemId: string): void {
    if (this.moduleBusySignal()) {
      return;
    }
    this.moduleBusySignal.set(true);
    this.moduleErrorSignal.set('');
    this.service
      .removeModuleItem(this.id(), { courseId, moduleId, itemId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (m) => {
          this.upsertModule(m);
          this.moduleBusySignal.set(false);
        },
        error: (err) => this.setModuleError(err),
      });
  }

  setModuleRequirement(
    courseId: string,
    moduleId: string,
    kind: ModuleRequirementKind,
    thresholdN: number,
  ): void {
    if (this.moduleBusySignal()) {
      return;
    }
    this.moduleBusySignal.set(true);
    this.moduleErrorSignal.set('');
    this.service
      .setModuleRequirement(this.id(), {
        courseId,
        moduleId,
        kind,
        thresholdN: kind === 'n_of_m' ? thresholdN : 0,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (m) => {
          this.upsertModule(m);
          this.moduleBusySignal.set(false);
        },
        error: (err) => this.setModuleError(err),
      });
  }

  removeModule(courseId: string, moduleId: string): void {
    if (this.moduleBusySignal()) {
      return;
    }
    this.moduleBusySignal.set(true);
    this.moduleErrorSignal.set('');
    this.service
      .removeModule(this.id(), { courseId, moduleId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.dropModule(courseId, moduleId);
          this.moduleBusySignal.set(false);
        },
        error: (err) => this.setModuleError(err),
      });
  }

  private loadCertification(offeringId: string): void {
    this.certificationLoadedForId.set(offeringId);
    this.certificationStateSignal.set({ status: 'loading' });
    // A fresh (re)load resets any open policy editor + transient write state.
    this.policyFormOpenSignal.set(false);
    this.policySaveErrorSignal.set(false);
    this.policySaveErrorDetailSignal.set('');
    this.policySaveSucceededSignal.set(false);
    // …and any open manual-issue confirm / per-row outcome.
    this.confirmingIssueSignal.set(null);
    this.issuingCertSignal.set(null);
    this.certIssueErrorDetailSignal.set('');
    this.certIssueOutcomeSignal.set(new Map<string, 'success' | 'already' | 'error'>());
    this.service
      .getOfferingCertification(offeringId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (env) =>
          this.certificationStateSignal.set({
            status: 'success',
            courses: env.courses,
            completionPolicy: env.completionPolicy,
          }),
        error: () =>
          this.certificationStateSignal.set({
            status: 'error',
            errorKey: 'rplus.offerings.workspace.certification.error',
          }),
      });
  }

  /**
   * Load the roster. `silent` (used by the post-enrol refresh) swaps the fresh
   * roster in WITHOUT flipping to the loading skeleton, so the enrol form + its
   * success note (which live in the hasRoster branch) survive the refresh; a
   * silent-refresh error leaves the current roster in place (the enrol already
   * succeeded — never blow the panel away over a follow-up read).
   */
  private loadRoster(offeringId: string, silent = false): void {
    this.rosterLoadedForId.set(offeringId);
    if (!silent) {
      this.rosterStateSignal.set({ status: 'loading' });
    }
    this.service
      .getOfferingRoster(offeringId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (roster) => this.rosterStateSignal.set({ status: 'success', roster }),
        error: () => {
          if (!silent) {
            this.rosterStateSignal.set({
              status: 'error',
              errorKey: 'rplus.offerings.workspace.roster.error',
            });
          }
        },
      });
  }

  // ── Transcript panel actions (W6) ───────────────────────────────────────

  /**
   * Retry the failed reads for the Transcript panel's SECOND phase (roster
   * and/or the transcript-entries GET itself) — phase 1 (assessments) reuses
   * `retryAssessments()` directly from the template, since it is the exact
   * same load as the Assessments tab. Re-fires only whichever of the two
   * actually errored; a transcript-itself retry re-derives the assessment ids
   * from the (already-successful) assessments list rather than re-fetching it.
   */
  retryTranscript(): void {
    const o = this.offering();
    if (!o) {
      return;
    }
    if (this.rosterStateSignal().status === 'error') {
      this.loadRoster(o.id);
    }
    if (this.transcriptStateSignal().status === 'error') {
      const ids = this.assessments().map((a) => a.id);
      this.loadTranscript(o.id, ids);
    }
  }

  /**
   * Fetch the transcript entries for the offering's assessments (W6 gradebook
   * join) — called once the (reused) Assessments read has resolved
   * successfully, since the join needs the assessment ids up front. Errors
   * propagate to a generic error state (mirrors every other list read in this
   * workspace) — the BE also role-gates this endpoint server-side
   * (admin/instructor), so a non-qualifying caller surfaces the same loud
   * error + retry rather than a silently-empty gradebook.
   */
  private loadTranscript(offeringId: string, assessmentIds: readonly string[]): void {
    this.transcriptLoadedForId.set(offeringId);
    this.transcriptStateSignal.set({ status: 'loading' });
    this.service
      .getTranscriptByAssessments(assessmentIds)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => this.transcriptStateSignal.set({ status: 'success', items }),
        error: () =>
          this.transcriptStateSignal.set({
            status: 'error',
            errorKey: 'rplus.offerings.workspace.transcript.error',
          }),
      });
  }

  private loadAnalytics(offeringId: string): void {
    this.analyticsLoadedForId.set(offeringId);
    this.analyticsStateSignal.set({ status: 'loading' });
    this.service
      .getOfferingAnalytics(offeringId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (analytics) => this.analyticsStateSignal.set({ status: 'success', analytics }),
        error: () =>
          this.analyticsStateSignal.set({
            status: 'error',
            errorKey: 'rplus.offerings.workspace.analytics.error',
          }),
      });
  }

  // ── Sections panel actions (W7) ────────────────────────────────────────

  /** Retry the failed sections list fetch for the current offering. */
  retrySections(): void {
    const o = this.offering();
    if (o) {
      this.loadSections(o.id);
    }
  }

  /** Open the inline create-section form (manager-only affordance). */
  openSectionForm(): void {
    this.sectionCreateErrorSignal.set(false);
    this.sectionCreateSucceededSignal.set(false);
    this.sectionNameSignal.set('');
    this.sectionLeadPickedSignal.set(null);
    this.sectionFormOpenSignal.set(true);
  }

  /** Close the create-section form without creating. */
  closeSectionForm(): void {
    this.sectionFormOpenSignal.set(false);
    this.sectionNameSignal.set('');
    this.sectionLeadPickedSignal.set(null);
  }

  /** Bind the required-name field (signal-driven form, OnPush-friendly). */
  onSectionNameInput(event: Event): void {
    this.sectionNameSignal.set((event.target as HTMLInputElement).value);
  }

  /** Entity-picker selection → the optional lead instructor (kills raw-UUID paste). */
  onSectionLeadPicked(ref: EntityRef): void {
    this.sectionLeadPickedSignal.set(ref);
  }

  /**
   * Native form-submit handler. The form is signal-driven (NO FormsModule), so
   * it binds `(submit)` and must `preventDefault()` to stop the browser
   * navigating. The required name + the picked lead instructor come from
   * signals; the remaining optional fields are passed in from the template's
   * reference variables.
   */
  onSectionSubmit(event: Event, room: string, startDate: string, endDate: string): void {
    event.preventDefault();
    this.createSection(room, startDate, endDate);
  }

  private createSection(room: string, startDate: string, endDate: string): void {
    const o = this.offering();
    const name = this.sectionNameSignal().trim();
    if (!o || name.length === 0 || this.creatingSectionSignal()) {
      return;
    }
    const lead = this.sectionLeadPickedSignal()?.id ?? '';
    this.creatingSectionSignal.set(true);
    this.sectionCreateErrorSignal.set(false);
    this.sectionCreateSucceededSignal.set(false);
    this.service
      .createOfferingSection(o.id, {
        name,
        leadInstructorGcid: lead.trim(),
        room: room.trim(),
        startDate: startDate.trim(),
        endDate: endDate.trim(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.creatingSectionSignal.set(false);
          this.sectionFormOpenSignal.set(false);
          this.sectionNameSignal.set('');
          this.sectionLeadPickedSignal.set(null);
          this.sectionCreateSucceededSignal.set(true);
          this.loadSections(o.id); // refresh the list with the new row
        },
        error: () => {
          this.creatingSectionSignal.set(false);
          this.sectionCreateErrorSignal.set(true); // form stays open to fix + retry
        },
      });
  }

  // ── Section EDIT actions (R+ Phase-2 S4, CHO-2051) ─────────────────────

  /** Whether the inline edit form is open for a specific section. */
  isSectionEditOpen(sectionId: string): boolean {
    return this.editingSectionIdSignal() === sectionId;
  }

  /**
   * Open the inline edit form for one section (manager-only). Only one edit form
   * is open at a time; opening prefills the required name + resets any prior
   * update error/success. Closes the create form so the two never overlap.
   */
  openSectionEditForm(section: OfferingSection): void {
    this.sectionFormOpenSignal.set(false);
    this.sectionUpdateErrorSignal.set(false);
    this.sectionUpdateErrorDetailSignal.set('');
    this.sectionUpdateSucceededSignal.set(false);
    this.editSectionNameSignal.set(section.name);
    // Prefill the picker from the section's current lead (id-as-label fallback —
    // fail-loud honest, never a fabricated name; the next search or the port's
    // best-effort `resolve()` may hydrate a real name).
    this.editSectionLeadPickedSignal.set(
      section.leadInstructorGcid
        ? { id: section.leadInstructorGcid, label: section.leadInstructorGcid }
        : null,
    );
    this.editingSectionIdSignal.set(section.sectionId);
  }

  /** Close the edit form without saving. */
  closeSectionEditForm(): void {
    this.editingSectionIdSignal.set(null);
    this.editSectionNameSignal.set('');
    this.editSectionLeadPickedSignal.set(null);
  }

  /** Bind the required edited-name field (signal-driven form, OnPush-friendly). */
  onEditSectionNameInput(event: Event): void {
    this.editSectionNameSignal.set((event.target as HTMLInputElement).value);
  }

  /** Entity-picker selection → the edit form's lead instructor (kills raw-UUID paste). */
  onEditSectionLeadPicked(ref: EntityRef): void {
    this.editSectionLeadPickedSignal.set(ref);
  }

  /**
   * Native form-submit handler for the edit form. The required name + the
   * picked lead instructor come from signals; the remaining optional fields
   * come from the template's reference variables.
   */
  onSectionEditSubmit(
    event: Event,
    section: OfferingSection,
    room: string,
    startDate: string,
    endDate: string,
  ): void {
    event.preventDefault();
    this.updateSection(section, room, startDate, endDate);
  }

  private updateSection(
    section: OfferingSection,
    room: string,
    startDate: string,
    endDate: string,
  ): void {
    const o = this.offering();
    const name = this.editSectionNameSignal().trim();
    if (!o || name.length === 0 || this.updatingSectionSignal()) {
      return;
    }
    const lead = this.editSectionLeadPickedSignal()?.id ?? '';
    // Build a minimal patch: send only the fields that differ from the loaded
    // section (the BE leaves omitted fields unchanged; sending only changes
    // avoids clobbering a concurrently-edited field).
    const patch: {
      name?: string;
      leadInstructorGcid?: string;
      room?: string;
      startDate?: string;
      endDate?: string;
    } = {};
    if (name !== section.name) {
      patch.name = name;
    }
    if (lead.trim() !== section.leadInstructorGcid) {
      patch.leadInstructorGcid = lead.trim();
    }
    if (room.trim() !== section.room) {
      patch.room = room.trim();
    }
    if (startDate !== section.startDate) {
      patch.startDate = startDate;
    }
    if (endDate !== section.endDate) {
      patch.endDate = endDate;
    }
    this.updatingSectionSignal.set(true);
    this.sectionUpdateErrorSignal.set(false);
    this.sectionUpdateErrorDetailSignal.set('');
    this.sectionUpdateSucceededSignal.set(false);
    this.service
      .updateSection(o.id, section.sectionId, patch)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.updatingSectionSignal.set(false);
          this.applySectionUpdate(updated); // splice the row in-place (no re-GET)
          this.editingSectionIdSignal.set(null);
          this.editSectionNameSignal.set('');
          this.editSectionLeadPickedSignal.set(null);
          this.sectionUpdateSucceededSignal.set(true);
        },
        error: (err: unknown) => {
          this.updatingSectionSignal.set(false);
          // Fail-loud: surface the BE `{error}` (e.g. blank name). The form stays
          // open with the edits intact so the admin can fix + retry.
          this.sectionUpdateErrorDetailSignal.set(errorDetailOf(err));
          this.sectionUpdateErrorSignal.set(true);
        },
      });
  }

  /** Splice one freshly-updated section back into the loaded sections state. */
  private applySectionUpdate(updated: OfferingSection): void {
    const s = this.sectionsStateSignal();
    if (s.status !== 'success') {
      return;
    }
    const items = s.items.map((sec) =>
      sec.sectionId === updated.sectionId ? updated : sec,
    );
    this.sectionsStateSignal.set({ status: 'success', items });
  }

  private loadSections(offeringId: string): void {
    this.sectionsLoadedForId.set(offeringId);
    this.sectionsStateSignal.set({ status: 'loading' });
    // A fresh (re)load resets any open edit form + transient write state.
    this.editingSectionIdSignal.set(null);
    this.editSectionNameSignal.set('');
    this.sectionUpdateErrorSignal.set(false);
    this.sectionUpdateErrorDetailSignal.set('');
    this.sectionUpdateSucceededSignal.set(false);
    this.service
      .getOfferingSections(offeringId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => this.sectionsStateSignal.set({ status: 'success', items }),
        error: () =>
          this.sectionsStateSignal.set({
            status: 'error',
            errorKey: 'rplus.offerings.workspace.sections.error',
          }),
      });
  }

  // ── Schedule panel actions (CHO-1985) ──────────────────────────────────

  /** Retry the failed schedule list fetch for the current offering. */
  retrySchedule(): void {
    const o = this.offering();
    if (o) {
      this.loadSchedule(o.id);
    }
  }

  /** Open the inline add-session form (manager-only affordance). */
  openSessionForm(): void {
    this.sessionCreateErrorSignal.set(false);
    this.sessionCreateErrorCodeSignal.set('');
    this.sessionCreateSucceededSignal.set(false);
    this.sessionTitleSignal.set('');
    this.sessionStartsAtSignal.set('');
    this.sessionEndsAtSignal.set('');
    this.sessionInstructorPickedSignal.set(null);
    this.sessionRoomIdSignal.set('');
    this.sessionFormOpenSignal.set(true);
    this.loadRooms(); // CHO-2191: populate the room picker for this create
  }

  /** Close the add-session form without creating. */
  closeSessionForm(): void {
    this.sessionFormOpenSignal.set(false);
    this.sessionTitleSignal.set('');
    this.sessionStartsAtSignal.set('');
    this.sessionEndsAtSignal.set('');
    this.sessionInstructorPickedSignal.set(null);
    this.sessionRoomIdSignal.set('');
  }

  /** Bind the required-title field (signal-driven form, OnPush-friendly). */
  onSessionTitleInput(event: Event): void {
    this.sessionTitleSignal.set((event.target as HTMLInputElement).value);
  }

  /** Bind the start-window `datetime-local` field. */
  onSessionStartsAtInput(event: Event): void {
    this.sessionStartsAtSignal.set((event.target as HTMLInputElement).value);
  }

  /** Bind the end-window `datetime-local` field. */
  onSessionEndsAtInput(event: Event): void {
    this.sessionEndsAtSignal.set((event.target as HTMLInputElement).value);
  }

  /** Entity-picker selection → the optional instructor (kills raw-UUID paste). */
  onSessionInstructorPicked(ref: EntityRef): void {
    this.sessionInstructorPickedSignal.set(ref);
  }

  /**
   * Native form-submit handler for the add-session form. Signal-driven (NO
   * FormsModule), so it binds `(submit)` and must `preventDefault()`. Required
   * title + window, the picked room_id and the picked instructor all come from
   * signals (CHO-2191: a room is booked by room_id from the picker, never free
   * text).
   */
  onSessionSubmit(event: Event): void {
    event.preventDefault();
    this.createSession();
  }

  private createSession(): void {
    const o = this.offering();
    const title = this.sessionTitleSignal().trim();
    const startsLocal = this.sessionStartsAtSignal();
    const endsLocal = this.sessionEndsAtSignal();
    const instructor = this.sessionInstructorPickedSignal()?.id ?? '';
    const roomId = this.sessionRoomIdSignal();
    if (!o || title.length === 0 || this.creatingSessionSignal()) {
      return;
    }
    // Guard both window bounds present + a strictly-positive window before POST
    // (mirrors `canCreateSession`; the datetime-local values convert to ISO).
    if (startsLocal.length === 0 || endsLocal.length === 0) {
      return;
    }
    const startsAt = new Date(startsLocal);
    const endsAt = new Date(endsLocal);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt.getTime() <= startsAt.getTime()
    ) {
      return;
    }
    this.creatingSessionSignal.set(true);
    this.sessionCreateErrorSignal.set(false);
    this.sessionCreateErrorCodeSignal.set('');
    this.sessionCreateSucceededSignal.set(false);
    this.service
      .createOfferingSession(o.id, {
        title,
        roomId: roomId.trim(),
        instructorGcid: instructor.trim(),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.creatingSessionSignal.set(false);
          this.sessionFormOpenSignal.set(false);
          this.sessionTitleSignal.set('');
          this.sessionStartsAtSignal.set('');
          this.sessionEndsAtSignal.set('');
          this.sessionInstructorPickedSignal.set(null);
          this.sessionRoomIdSignal.set('');
          this.sessionCreateSucceededSignal.set(true);
          this.loadSchedule(o.id); // refresh the list with the new row
        },
        error: (err: unknown) => {
          this.creatingSessionSignal.set(false);
          // CHO-2191: surface the specific room-gate reason (409/400 typed code).
          this.sessionCreateErrorCodeSignal.set(errorCodeOf(err));
          this.sessionCreateErrorSignal.set(true); // form stays open to fix + retry
        },
      });
  }

  // ── Rooms (CHO-2191) — picker + inline create ──────────────────────────

  /** Bind the room `<select>` change → the picked room_id ('' = roomless). */
  onSessionRoomPicked(event: Event): void {
    this.sessionRoomIdSignal.set((event.target as HTMLSelectElement).value);
  }

  /** Load the tenant's rooms for the picker (fail-loud; no silent empty). */
  private loadRooms(): void {
    this.roomsLoadingSignal.set(true);
    this.roomsErrorSignal.set(false);
    this.service
      .listRooms()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rooms) => {
          this.roomsSignal.set(rooms);
          this.roomsLoadingSignal.set(false);
        },
        error: () => {
          this.roomsErrorSignal.set(true);
          this.roomsLoadingSignal.set(false);
        },
      });
  }

  /** Retry the failed rooms fetch. */
  retryRooms(): void {
    this.loadRooms();
  }

  /** Open / close the inline create-room form. */
  openRoomForm(): void {
    this.roomFormOpenSignal.set(true);
    this.roomCreateErrorSignal.set(false);
  }
  closeRoomForm(): void {
    this.roomFormOpenSignal.set(false);
    this.roomNameSignal.set('');
    this.roomCapacitySignal.set('');
    this.roomCreateErrorSignal.set(false);
  }
  onRoomNameInput(event: Event): void {
    this.roomNameSignal.set((event.target as HTMLInputElement).value);
  }
  onRoomCapacityInput(event: Event): void {
    this.roomCapacitySignal.set((event.target as HTMLInputElement).value);
  }
  onRoomSubmit(event: Event): void {
    event.preventDefault();
    this.createRoom();
  }

  /**
   * Create a Room, then append it to the picker and auto-select it for the
   * session being scheduled (so the admin flows create → schedule without a
   * refetch). Fail-loud: the form stays open on error.
   */
  private createRoom(): void {
    const name = this.roomNameSignal().trim();
    const capacity = Number(this.roomCapacitySignal());
    if (name.length === 0 || !Number.isFinite(capacity) || capacity <= 0 || this.creatingRoomSignal()) {
      return;
    }
    this.creatingRoomSignal.set(true);
    this.roomCreateErrorSignal.set(false);
    this.service
      .createRoom({ name, capacity })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (room) => {
          this.creatingRoomSignal.set(false);
          this.roomFormOpenSignal.set(false);
          this.roomNameSignal.set('');
          this.roomCapacitySignal.set('');
          this.roomsSignal.set([...(this.roomsSignal() ?? []), room]);
          this.sessionRoomIdSignal.set(room.id); // auto-select the new room
        },
        error: () => {
          this.creatingRoomSignal.set(false);
          this.roomCreateErrorSignal.set(true);
        },
      });
  }

  private loadSchedule(offeringId: string): void {
    this.scheduleLoadedForId.set(offeringId);
    this.scheduleStateSignal.set({ status: 'loading' });
    this.service
      .getOfferingSchedule(offeringId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sessions) => this.scheduleStateSignal.set({ status: 'success', sessions }),
        error: () =>
          this.scheduleStateSignal.set({
            status: 'error',
            errorKey: 'rplus.offerings.workspace.schedule.error',
          }),
      });
  }

  // ── Attendance panel actions (CHO-1986) ────────────────────────────────

  /** i18n key for an attendance-status badge / option. */
  attendanceStatusLabelKey(status: string): string {
    return attendanceStatusLabelKey(status);
  }

  /** i18n key for an attendance-source label (manual / qr-scan). */
  attendanceSourceLabelKey(source: string): string {
    return `rplus.offerings.workspace.attendance.source.${source}`;
  }

  /** Design-system badge variant for an attendance-status chip. */
  attendanceStatusBadgeClass(status: string): string {
    switch (status) {
      case 'present':
        return 'badge-success';
      case 'late':
        return 'badge-info';
      default: // absent, excused, unknown
        return 'badge-neutral';
    }
  }

  /** Retry the failed session-selector fetch for the current offering. */
  retryAttendanceSessions(): void {
    const o = this.offering();
    if (o) {
      this.loadAttendanceSessions(o.id);
    }
  }

  /** Retry the failed record fetch for the currently-selected session. */
  retryAttendance(): void {
    const sessionId = this.selectedSessionIdSignal();
    if (sessionId.length > 0) {
      this.loadAttendance(sessionId);
    }
  }

  /**
   * Session `<select>` change: set the selection + (when non-empty) GET that
   * session's records. No GET fires for the placeholder ('') option.
   */
  onSessionSelect(event: Event): void {
    const sessionId = (event.target as HTMLSelectElement).value;
    this.selectedSessionIdSignal.set(sessionId);
    this.markSucceededSignal.set(false);
    this.markErrorSignal.set(false);
    if (sessionId.length > 0) {
      this.loadAttendance(sessionId);
    }
  }

  /** Entity-picker selection → the mark-form GCID (name-based; kills raw-UUID paste). */
  onMarkGcidPicked(ref: EntityRef): void {
    this.markGcidPickedSignal.set(ref);
    this.markGcidSignal.set(ref.id);
  }

  /** Bind the mark-form status `<select>`. */
  onMarkStatusChange(event: Event): void {
    this.markStatusSignal.set((event.target as HTMLSelectElement).value);
  }

  /**
   * Native form-submit handler for the mark form. Signal-driven (NO FormsModule)
   * — binds `(submit)` and must `preventDefault()`.
   */
  onMarkSubmit(event: Event): void {
    event.preventDefault();
    this.mark();
  }

  private mark(): void {
    const o = this.offering();
    const sessionId = this.selectedSessionIdSignal();
    const gcid = this.markGcidSignal().trim();
    const status = this.markStatusSignal();
    if (!o || sessionId.length === 0 || gcid.length === 0 || this.markingSignal()) {
      return;
    }
    this.markingSignal.set(true);
    this.markErrorSignal.set(false);
    this.markSucceededSignal.set(false);
    this.service
      .markAttendance(o.id, { sessionId, gcid, status })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.markingSignal.set(false);
          this.markGcidSignal.set(''); // clear for the next mark
          this.markGcidPickedSignal.set(null);
          this.markSucceededSignal.set(true);
          this.loadAttendance(sessionId); // refresh the session's records
        },
        error: () => {
          this.markingSignal.set(false);
          this.markErrorSignal.set(true);
        },
      });
  }

  private loadAttendanceSessions(offeringId: string): void {
    this.attendanceSessionsLoadedForId.set(offeringId);
    this.attendanceSessionsStateSignal.set({ status: 'loading' });
    // A fresh session list resets any prior selection + record view.
    this.selectedSessionIdSignal.set('');
    this.attendanceLoadedForSession.set(null);
    this.markSucceededSignal.set(false);
    this.markErrorSignal.set(false);
    this.service
      .getOfferingSchedule(offeringId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sessions) =>
          this.attendanceSessionsStateSignal.set({ status: 'success', sessions }),
        error: () =>
          this.attendanceSessionsStateSignal.set({
            status: 'error',
            errorKey: 'rplus.offerings.workspace.attendance.sessions_error',
          }),
      });
  }

  private loadAttendance(sessionId: string): void {
    const o = this.offering();
    if (!o) {
      return;
    }
    this.attendanceLoadedForSession.set(sessionId);
    this.attendanceStateSignal.set({ status: 'loading' });
    this.service
      .getOfferingAttendance(o.id, sessionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (records) => this.attendanceStateSignal.set({ status: 'success', records }),
        error: () =>
          this.attendanceStateSignal.set({
            status: 'error',
            errorKey: 'rplus.offerings.workspace.attendance.error',
          }),
      });
  }

  // ── Publish panel actions (CHO-1987) ───────────────────────────────────

  /** i18n key for a catalog-visibility badge (public/private/draft). */
  publishVisibilityLabelKey(visibility: string): string {
    return offeringPublishVisibilityLabelKey(visibility);
  }

  /** Design-system badge variant for a catalog-visibility chip. */
  publishVisibilityBadgeClass(visibility: string): string {
    switch (visibility) {
      case 'public':
        return 'badge-success';
      case 'private':
        return 'badge-info';
      default: // draft, unknown
        return 'badge-neutral';
    }
  }

  /** Retry the failed publish-state fetch for the current offering. */
  retryPublish(): void {
    const o = this.offering();
    if (o) {
      this.loadPublish(o.id);
    }
  }

  /** Publish all attached courses to the catalogue (admin-only affordance). */
  publishToCatalogue(): void {
    this.publish();
  }

  private publish(): void {
    const o = this.offering();
    if (!o || this.publishingSignal()) {
      return;
    }
    this.publishingSignal.set(true);
    this.publishActionErrorSignal.set(false);
    this.publishSucceededSignal.set(false);
    this.service
      .publishOffering(o.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (state) => {
          this.publishingSignal.set(false);
          // Re-render off the fresh (now-public) courses + surface the tally.
          this.publishStateSignal.set({ status: 'success', courses: state.courses });
          this.publishedCountSignal.set(state.publishedCount);
          this.publishSucceededSignal.set(true);
        },
        error: () => {
          this.publishingSignal.set(false);
          this.publishActionErrorSignal.set(true); // list stays; a retry affordance shows
        },
      });
  }

  private loadPublish(offeringId: string): void {
    this.publishLoadedForId.set(offeringId);
    this.publishStateSignal.set({ status: 'loading' });
    this.publishActionErrorSignal.set(false);
    this.publishSucceededSignal.set(false);
    this.service
      .getOfferingPublish(offeringId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (state) => this.publishStateSignal.set({ status: 'success', courses: state.courses }),
        error: () =>
          this.publishStateSignal.set({
            status: 'error',
            errorKey: 'rplus.offerings.workspace.publish.error',
          }),
      });
  }

  // ── Prerequisites panel actions (ADR-226) ──────────────────────────────

  /** i18n key for a prerequisite-kind badge (hard_gate/advisory). */
  prerequisiteKindLabelKey(kind: string): string {
    return prerequisiteKindLabelKey(kind);
  }

  /** Design-system badge variant for a prerequisite-kind chip. */
  prerequisiteKindBadgeClass(kind: string): string {
    return kind === 'hard_gate' ? 'badge-warning' : 'badge-neutral';
  }

  /** Retry the failed prerequisites fetch for the current offering. */
  retryPrerequisites(): void {
    const o = this.offering();
    if (o) {
      this.loadPrerequisites(o.id);
    }
  }

  /**
   * Open the inline add-prerequisite form for one attached course
   * (manager-only). Only one form is open at a time; opening resets the
   * fields + any prior add error/success so a re-open starts clean. The
   * TARGET course now comes from the name-search picker (no eager catalogue
   * GET) — mirrors the curriculum ref-picker discipline.
   */
  openPrerequisiteAddForm(courseId: string): void {
    this.prerequisiteAddErrorSignal.set(false);
    this.prerequisiteAddErrorDetailSignal.set('');
    this.prerequisiteAddSucceededSignal.set(false);
    this.prerequisiteKindSignal.set(OFFERING_PREREQUISITE_KINDS[0]);
    this.prerequisiteTargetCourseIdSignal.set('');
    this.prerequisiteTargetPickedSignal.set(null);
    this.prerequisiteAddCourseIdSignal.set(courseId);
  }

  /** Close the add-prerequisite form without adding. */
  closePrerequisiteAddForm(): void {
    this.prerequisiteAddCourseIdSignal.set(null);
    this.prerequisiteTargetCourseIdSignal.set('');
    this.prerequisiteTargetPickedSignal.set(null);
  }

  /** Entity-picker selection → the TARGET course id (name-based; kills the
   *  single-page course dropdown). */
  onPrerequisiteTargetPicked(ref: EntityRef): void {
    this.prerequisiteTargetPickedSignal.set(ref);
    this.prerequisiteTargetCourseIdSignal.set(ref.id);
  }

  /** Bind the kind `<select>` (hard_gate|advisory). */
  onPrerequisiteKindChange(event: Event): void {
    this.prerequisiteKindSignal.set((event.target as HTMLSelectElement).value as PrerequisiteKind);
  }

  /**
   * Native form-submit handler for the add-prerequisite form. Signal-driven
   * (NO FormsModule) — binds `(submit)` and must `preventDefault()`.
   */
  onPrerequisiteAddSubmit(event: Event, courseId: string): void {
    event.preventDefault();
    this.addPrerequisiteEdge(courseId);
  }

  /**
   * Remove one prerequisite edge from a course (ADR-226). Destructive, so
   * confirm-gated; re-entrancy is guarded by the removing signal. On success
   * the course re-renders from the returned edge list.
   */
  async removePrerequisiteEdge(
    course: OfferingPrerequisiteCourse,
    edge: OfferingPrerequisiteEdge,
  ): Promise<void> {
    if (this.removingPrerequisiteKeySignal() !== null) {
      return;
    }
    const ok = await this.confirmDialog.confirm({
      title: 'rplus.offerings.workspace.prerequisites.remove_confirm.title',
      message: 'rplus.offerings.workspace.prerequisites.remove_confirm.body',
      confirmText: 'rplus.offerings.workspace.prerequisites.remove_confirm.ok',
      cancelText: 'rplus.offerings.workspace.prerequisites.remove_confirm.cancel',
      variant: 'danger',
    });
    if (!ok) {
      return;
    }
    const o = this.offering();
    if (!o) {
      return;
    }
    const key = prerequisiteEdgeKey(course.id, edge.prerequisiteCourseId);
    this.removingPrerequisiteKeySignal.set(key);
    this.prerequisiteRemoveErrorSignal.set(false);
    this.prerequisiteAddSucceededSignal.set(false);
    this.service
      .removePrerequisite(o.id, {
        courseId: course.id,
        prerequisiteCourseId: edge.prerequisiteCourseId,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (edges) => {
          this.removingPrerequisiteKeySignal.set(null);
          this.applyPrerequisiteEdges(edges);
        },
        error: () => {
          this.removingPrerequisiteKeySignal.set(null);
          this.prerequisiteRemoveErrorSignal.set(true);
        },
      });
  }

  private addPrerequisiteEdge(courseId: string): void {
    const o = this.offering();
    const prerequisiteCourseId = this.prerequisiteTargetCourseIdSignal();
    const kind = this.prerequisiteKindSignal();
    if (!o || prerequisiteCourseId.length === 0 || this.addingPrerequisiteSignal()) {
      return;
    }
    this.addingPrerequisiteSignal.set(true);
    this.prerequisiteAddErrorSignal.set(false);
    this.prerequisiteAddErrorDetailSignal.set('');
    this.prerequisiteAddSucceededSignal.set(false);
    this.service
      .addPrerequisite(o.id, { courseId, prerequisiteCourseId, kind })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (edges) => {
          this.addingPrerequisiteSignal.set(false);
          this.applyPrerequisiteEdges(edges);
          this.prerequisiteAddCourseIdSignal.set(null); // close the form
          this.prerequisiteTargetCourseIdSignal.set('');
          this.prerequisiteTargetPickedSignal.set(null);
          this.prerequisiteAddSucceededSignal.set(true);
        },
        error: (err: unknown) => {
          this.addingPrerequisiteSignal.set(false);
          // Fail-loud: surface the BE 422 graph refusal (self-edge / cycle /
          // per-course cap / unknown course) or 400 verbatim. The form stays
          // open with the draft intact so the author can fix + retry.
          this.prerequisiteAddErrorDetailSignal.set(errorDetailOf(err));
          this.prerequisiteAddErrorSignal.set(true);
        },
      });
  }

  /**
   * Splice one course's freshly-mutated edge list back into the loaded
   * prerequisites state — the write endpoints return only the affected course
   * (no re-GET), so the other attached courses are left untouched.
   */
  private applyPrerequisiteEdges(edges: OfferingPrerequisiteCourseEdges): void {
    const s = this.prerequisitesStateSignal();
    if (s.status !== 'success') {
      return;
    }
    const courses = s.courses.map((c) =>
      c.id === edges.courseId ? { ...c, prerequisites: edges.prerequisites } : c,
    );
    this.prerequisitesStateSignal.set({ status: 'success', courses });
  }

  private loadPrerequisites(offeringId: string): void {
    this.prerequisitesLoadedForId.set(offeringId);
    this.prerequisitesStateSignal.set({ status: 'loading' });
    // A fresh (re)load resets any open editor form + transient write state.
    this.prerequisiteAddCourseIdSignal.set(null);
    this.prerequisiteTargetCourseIdSignal.set('');
    this.prerequisiteTargetPickedSignal.set(null);
    this.prerequisiteAddErrorSignal.set(false);
    this.prerequisiteAddErrorDetailSignal.set('');
    this.prerequisiteAddSucceededSignal.set(false);
    this.prerequisiteRemoveErrorSignal.set(false);
    this.service
      .listPrerequisites(offeringId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (courses) => this.prerequisitesStateSignal.set({ status: 'success', courses }),
        error: () =>
          this.prerequisitesStateSignal.set({
            status: 'error',
            errorKey: 'rplus.offerings.workspace.prerequisites.error',
          }),
      });
  }

  private loadTestSets(): void {
    this.testSetsLoadedSignal.set(true);
    this.testSetsStateSignal.set({ status: 'loading' });
    this.service
      .listPublishedTestSets()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => this.testSetsStateSignal.set({ status: 'success', items }),
        error: () =>
          this.testSetsStateSignal.set({
            status: 'error',
            errorKey: 'rplus.offerings.workspace.assessments.picker_error',
          }),
      });
  }

  private attachTestSet(testSetId: string): void {
    const o = this.offering();
    if (!o || this.attachingIdSignal() !== null) {
      return;
    }
    this.attachingIdSignal.set(testSetId);
    this.attachErrorSignal.set(false);
    this.attachSucceededSignal.set(false);
    this.service
      .attachAssessment(o.id, { testSetId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.attachingIdSignal.set(null);
          this.pickerOpenSignal.set(false);
          this.attachSucceededSignal.set(true);
          this.loadAssessments(o.id); // refresh the list with the new row
        },
        error: () => {
          this.attachingIdSignal.set(null);
          this.attachErrorSignal.set(true);
        },
      });
  }

  private detach(assessment: OfferingAssessment): void {
    if (this.removingIdSignal() !== null) {
      return;
    }
    const o = this.offering();
    this.removingIdSignal.set(assessment.id);
    this.removeErrorSignal.set(false);
    this.attachSucceededSignal.set(false);
    this.service
      .detachAssessment(assessment.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.removingIdSignal.set(null);
          if (o) {
            this.loadAssessments(o.id); // refresh after the soft-delete
          }
        },
        error: () => {
          this.removingIdSignal.set(null);
          this.removeErrorSignal.set(true);
        },
      });
  }

  private focusTab(index: number): void {
    this.tabButtons()[index]?.nativeElement.focus();
  }

  private loadOffering(id: string): void {
    this.loadStateSignal.set({ status: 'loading' });
    this.pendingActionSignal.set(null);
    this.conflictActionSignal.set(null);
    this.actionErrorSignal.set(false);
    this.actionErrorDetailSignal.set('');
    this.service
      .getOffering(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (offering) => this.loadStateSignal.set({ status: 'success', offering }),
        error: (err: unknown) => {
          const status = statusOf(err);
          this.loadStateSignal.set({
            status: 'error',
            errorKey: errorKeyForStatus(status),
            notFound: status === 404,
          });
        },
      });
  }
}

/** Pull the numeric HTTP status off an unknown error, or -1 when absent. */
function statusOf(err: unknown): number {
  const status = (err as { status?: number } | null)?.status;
  return typeof status === 'number' ? status : -1;
}

/**
 * Pull the human-readable detail off an error for a fail-loud banner, handling
 * BOTH shapes Chora observes: a raw `HttpErrorResponse` (interceptor-less specs,
 * body on `.error`) and the runtime `ApiError` re-thrown by `errorInterceptor`
 * (raw body on `.body`, NOT `.error`). Reading `.error` directly silently
 * returned '' in production for every S-slice detail banner while the specs
 * passed — the launch-gate 422 walk-caught this (same trap as L1 CHO-1705).
 * `httpErrorView` normalises both to `{status, body}`. The delivery envelope is
 * `{error: <HTTP status text>, message: <human detail>}` (writeError), so the
 * actionable reason lives in `message`; prefer it, fall back to `error` for any
 * flat `{error: <detail>}` shape. Returns '' when absent — the caller then falls
 * back to a generic i18n key.
 */
export function errorDetailOf(err: unknown): string {
  const body = httpErrorView(err)?.body;
  if (body !== null && typeof body === 'object') {
    for (const field of ['message', 'error'] as const) {
      if (field in body) {
        const val = (body as Record<string, unknown>)[field];
        if (typeof val === 'string' && val.length > 0) {
          return val;
        }
      }
    }
  }
  return '';
}

/**
 * Pull the TYPED error CODE off a delivery error. The CHO-2191 room gate uses
 * the discriminated `{error: {code, message}}` envelope (writeErrorCode) — so
 * the machine-readable code the banner keys on lives at `body.error.code`, NOT
 * the flat `{error, message}` shape `errorDetailOf` reads. Prefers the runtime
 * `ApiError.code` (the errorInterceptor parses the envelope), then the nested
 * `body.error.code` (interceptor-less HttpTestingController specs). Returns ''
 * when absent — the caller falls back to the generic error key.
 */
export function errorCodeOf(err: unknown): string {
  if (isApiError(err) && typeof err.code === 'string' && err.code.length > 0) {
    return err.code;
  }
  const body = httpErrorView(err)?.body;
  if (body !== null && typeof body === 'object' && 'error' in body) {
    const inner = (body as Record<string, unknown>)['error'];
    if (inner !== null && typeof inner === 'object' && 'code' in inner) {
      const code = (inner as Record<string, unknown>)['code'];
      if (typeof code === 'string' && code.length > 0) {
        return code;
      }
    }
  }
  return '';
}

/**
 * Minimal ICU plural resolver for the curriculum blast-radius badge —
 * `{count, plural, one {# …} other {# …}}` (CLDR `one`/`other` keywords; `#`
 * = the count). This app's ngx-translate build ships no MessageFormat compiler
 * (the translate pipe only substitutes `{{token}}`), so — mirroring the
 * assessment-monitor precedent — the plural is resolved here. A non-ICU
 * template (e.g. translations not yet loaded in a unit test → the raw key
 * returns) still surfaces the count so the number is never lost.
 */
export function resolveUsagePlural(template: string, count: number): string {
  const icu = template.match(/^\{count,\s*plural,\s*(.*)\}$/s);
  if (!icu) {
    if (template.includes('#')) {
      return template.replace(/#/g, String(count));
    }
    if (template.includes('{count}')) {
      return template.replace(/\{count\}/g, String(count));
    }
    return String(count);
  }
  const branches: { readonly selector: string; readonly text: string }[] = [];
  const branchRe = /(=\d+|one|other)\s*\{([^{}]*)\}/g;
  let bm: RegExpExecArray | null;
  while ((bm = branchRe.exec(icu[1])) !== null) {
    branches.push({ selector: bm[1], text: bm[2] });
  }
  const exact = branches.find((b) => b.selector === `=${count}`);
  const one = count === 1 ? branches.find((b) => b.selector === 'one') : undefined;
  const other = branches.find((b) => b.selector === 'other');
  const chosen = (exact ?? one ?? other)?.text ?? template;
  return chosen.replace(/#/g, String(count)).replace(/\{count\}/g, String(count));
}

/**
 * Stable per-row key for the roster's unenrol state. A learner (gcid) can be
 * enrolled on more than one attached course in the same offering, so the state
 * is scoped to the `courseId|gcid` pair — keying by gcid alone would flip every
 * row that learner appears on.
 */
export function rosterRowKey(courseId: string, gcid: string): string {
  return `${courseId}|${gcid}`;
}

/**
 * Stable per-row key for a prerequisite edge's remove-busy state (ADR-226).
 * Scoped to the `courseId|prerequisiteCourseId` pair — the same target course
 * could in principle be a prerequisite of more than one attached course.
 */
export function prerequisiteEdgeKey(courseId: string, prerequisiteCourseId: string): string {
  return `${courseId}|${prerequisiteCourseId}`;
}

/**
 * Stable per-cell key for the Transcript gradebook matrix (W6) — scoped to
 * the `assessmentId|gcid` pair (one cell = one learner's result on one
 * offering assessment).
 */
export function transcriptCellKey(assessmentId: string, gcid: string): string {
  return `${assessmentId}|${gcid}`;
}

/** Map an HTTP status to the workspace error i18n key. */
function errorKeyForStatus(status: number): string {
  if (status === 404) {
    return 'rplus.offerings.workspace.error_not_found';
  }
  if (status === 401 || status === 403) {
    return 'rplus.offerings.workspace.error_unauthorised';
  }
  if (status >= 500) {
    return 'rplus.offerings.workspace.error_upstream';
  }
  return 'rplus.offerings.workspace.error_generic';
}
