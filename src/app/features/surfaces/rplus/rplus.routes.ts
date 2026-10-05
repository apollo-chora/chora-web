/**
 * R+ (Rhythm+) surface routes — Stage 3 waves 1 + 2 + 3.
 *
 * Owns: Content Delivery (training admin / scheduling / rostering /
 * classroom / exam / certification). Wave 1 shipped the class-roster
 * screen (Phyllis demo Step 10) plus 4 stub routes. Wave 2 replaced
 * those stubs with real lazy-loaded components. Wave 3 adds 3 more
 * screens (drill-downs + a composer):
 *   - /r/catalog/:courseId → CourseDetailAdminComponent (drill-down)
 *   - /r/classroom/quiz-builder → QuizBuilderComponent (composer)
 *
 * R4 (CHO-2269): the Rostering Dashboard is retired: its portfolio summary is
 * absorbed into the Offerings finder header, and /r/rostering redirects to
 * /r/offerings (the R+ landing).
 */
import { Routes } from '@angular/router';

import { roleGuard } from '../../../core/auth/role.guard';

export const RPLUS_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'offerings',
  },
  // R0 (CHO-2240): the single-cohort Class Roster demo is retired; /r/roster
  // redirects to the Offerings finder (the R+ landing). Real roster views live
  // in the offering workspace Roster tab and /r/rosters/:courseId.
  {
    path: 'roster',
    pathMatch: 'full',
    redirectTo: 'offerings',
  },
  // R4 (CHO-2269): the Rostering portfolio dashboard is absorbed into the
  // Offerings finder header (the R+ landing), so its standalone route redirects
  // to the landing. The RosteringComponent + its service/model are deleted;
  // the honest portfolio read now lives in offerings/instructor-portfolio.*.
  {
    path: 'rostering',
    pathMatch: 'full',
    redirectTo: 'offerings',
  },
  // W2.C (R+ Four-Mode refactor) — Offerings universal finder over the live
  // /api/v1/search/offerings endpoint (W2.A). Surface-gated like catalog/exams
  // (the search READ needs no extra role). Rows link to /r/offerings/:id (the
  // W2.D workspace, route lands later).
  {
    path: 'offerings',
    loadComponent: () =>
      import('./offerings/offerings-finder.component').then(
        (m) => m.OfferingsFinderComponent,
      ),
    data: { title: 'R+ | Offerings' },
  },
  // W2.D — offering create flow + workspace. ORDER NOTE: the static
  // `offerings/new` segment MUST precede `offerings/:id` so it isn't matched
  // as an :id param (mirrors the `assessments/new` ordering above).
  {
    path: 'offerings/new',
    loadComponent: () =>
      import('./offerings/offering-create.component').then(
        (m) => m.OfferingCreateComponent,
      ),
    data: { title: 'R+ | New Offering' },
  },
  {
    path: 'offerings/:id',
    loadComponent: () =>
      import('./offerings/offering-workspace.component').then(
        (m) => m.OfferingWorkspaceComponent,
      ),
    data: { title: 'R+ | Offering Workspace' },
  },
  {
    path: 'catalog',
    loadComponent: () =>
      import('./catalog/catalog.component').then((m) => m.CatalogComponent),
    data: { title: 'R+ | Course Catalog: MTM Tenant' },
  },
  // ── CJ#2 course authoring — relocated from A+ ────────────────────────
  // Course create/maintain is R+'s: chora_delivery owns the Course aggregate
  // (architecture.md) and ADR-232 rejected the option that would have put
  // teaching roles on the A+ learner surface. A+ keeps only the learner's
  // journey (catalog / detail / enrol / learn). No ADR ever placed authoring
  // on A+; it arrived via docs/m13/e2e-fe-coord-directive-2026-05-16.md, a
  // demo E2E directive outside the precedence chain.
  //
  // ORDER: the static `new` segment MUST precede `catalog/:courseId`, else the
  // param route swallows it and loads CourseDetailAdmin.
  //
  // Gated on `course:author`, which core/auth/role-capabilities.ts grants to
  // admin roles ONLY — not `instructor`, not `author` — per the owner's ruling
  // that course create/maintain is an admin act. Capabilities are derived
  // client-side from the JWT roles (auth.service.ts → capabilitiesForRoles), so
  // no tenancy change was needed to mint it. `training_admin` holds it too: it
  // now has an entry in role-capabilities.ts, where before it had none and so
  // held ZERO capabilities, which would have fail-closed every guard here.
  {
    path: 'catalog/new',
    loadComponent: () =>
      import('./course-authoring/course-authoring.component').then(
        (m) => m.CourseAuthoringComponent,
      ),
    canActivate: [roleGuard('course:author')],
    data: { title: 'R+ | Author Course' },
  },
  // Course edit (DRAFT only). Same component; edit mode derives from the
  // `:courseId` param. Static `edit` suffix, so it must also precede the bare
  // `catalog/:courseId` detail route.
  {
    path: 'catalog/:courseId/edit',
    loadComponent: () =>
      import('./course-authoring/course-authoring.component').then(
        (m) => m.CourseAuthoringComponent,
      ),
    canActivate: [roleGuard('course:author')],
    data: { title: 'R+ | Edit Course' },
  },
  {
    path: 'catalog/:courseId',
    loadComponent: () =>
      import('./course-detail-admin/course-detail-admin.component').then(
        (m) => m.CourseDetailAdminComponent,
      ),
    data: { title: 'R+ | Course Detail Admin' },
  },
  {
    path: 'scheduling',
    loadComponent: () =>
      import('./scheduling/scheduling.component').then(
        (m) => m.SchedulingComponent,
      ),
    data: { title: 'R+ | Class Scheduling: Week View' },
  },
  {
    path: 'classroom',
    loadComponent: () =>
      import('./classroom/classroom.component').then(
        (m) => m.ClassroomComponent,
      ),
    data: { title: 'R+ | Live Classroom: Presenter Mode' },
  },
  {
    path: 'classroom/quiz-builder',
    loadComponent: () =>
      import('./quiz-builder/quiz-builder.component').then(
        (m) => m.QuizBuilderComponent,
      ),
    data: { title: 'R+ | Live Quiz Builder' },
  },
  // CHO-1824 P5 — R+ AI-assist assessment authoring. Reuses the shared
  // Content-Creation composer; gated by the teaching/admin `assessment:author`
  // capability (on top of the surface-level surfaceGuard('rplus') in app.routes).
  {
    path: 'assessment-authoring',
    loadComponent: () =>
      import('./assessment-authoring/assessment-authoring.component').then(
        (m) => m.RPlusAssessmentAuthoringComponent,
      ),
    canActivate: [roleGuard('assessment:author')],
    data: { title: 'R+ | AI-Assist Assessment Authoring' },
  },
  // R+ QuestionBank management — reusable question pools + TestSet assembly.
  // An authoring tool; gated to the teaching/admin `assessment:author`
  // capability (matches the sidebar nav entry). The list `question-banks`
  // segment precedes the `:id` detail so it isn't matched as a param.
  {
    path: 'question-banks',
    loadComponent: () =>
      import('./question-banks/question-bank-list.component').then(
        (m) => m.QuestionBankListComponent,
      ),
    canActivate: [roleGuard('assessment:author')],
    data: { title: 'R+ | Question Banks' },
  },
  {
    path: 'question-banks/:id',
    loadComponent: () =>
      import('./question-banks/question-bank-detail.component').then(
        (m) => m.QuestionBankDetailComponent,
      ),
    canActivate: [roleGuard('assessment:author')],
    data: { title: 'R+ | Question Bank' },
  },
  // L5 — learner answer view. Reads `?session_id=` (the instructor's shared
  // session). Renders the open question + options and submits the choice
  // against the chora-delivery session model (POST .../responses).
  {
    path: 'classroom/answer',
    loadComponent: () =>
      import('./classroom/learner-answer.component').then(
        (m) => m.LearnerAnswerComponent,
      ),
    data: { title: 'R+ | Live Classroom: Answer' },
  },
  // ADR-168 Task #9 — Live Classroom live play view (WS-driven tally +
  // leaderboard). Reached from the classroom presenter once a session is
  // LIVE; sessionId bound via withComponentInputBinding.
  {
    path: 'classroom/play/:sessionId',
    loadComponent: () =>
      import('./live-classroom-play/live-classroom-play.component').then(
        (m) => m.LiveClassroomPlayComponent,
      ),
    data: { title: 'R+ | Live Classroom: Play' },
  },
  // ADR-168 live-poll learner play view (WS-driven tally). Drill-down —
  // no sidebar entry; reached contextually (instructor-launched). pollId
  // bound via withComponentInputBinding.
  {
    path: 'poll/:pollId',
    loadComponent: () =>
      import('./live-poll-play/live-poll-play.component').then(
        (m) => m.LivePollPlayComponent,
      ),
    data: { title: 'R+ | Live Poll: Play' },
  },
  {
    path: 'exams',
    loadComponent: () =>
      import('./exams/exams.component').then((m) => m.ExamsComponent),
    data: { title: 'R+ | Exam Administration: SkillsFuture' },
  },
  // W4 Exam BC drill-down — the exam workspace (Overview/Form/Candidates/…).
  // Reached from the exams list row. No `exams/new` static segment exists
  // (creation is the inline schedule form on the list), so no ordering guard
  // is needed vs the list route above.
  {
    path: 'exams/:id',
    loadComponent: () =>
      import('./exams/exam-workspace.component').then(
        (m) => m.ExamWorkspaceComponent,
      ),
    data: { title: 'R+ | Exam Workspace' },
  },
  {
    path: 'certifications',
    loadComponent: () =>
      import('./certifications/certifications.component').then(
        (m) => m.CertificationsComponent,
      ),
    data: { title: 'R+ | Issued Certifications' },
  },
  {
    path: 'campusops',
    loadComponent: () =>
      import('./campusops/campusops.component').then(
        (m) => m.CampusopsComponent,
      ),
    data: { title: 'R+ | Campus Operations' },
  },
  // CHO-2294: the rooms screen the campus card's Rooms button points at. It is
  // TENANT-scoped, not per-campus: GET /api/v1/rooms has no campus filter and
  // pre-existing rooms carry a blank campus_id, so a per-campus route would
  // render empty for every campus. No nav entry: this is a drill-down from
  // Campus Operations, like catalog/:courseId is from Catalog.
  {
    path: 'campusops/rooms',
    loadComponent: () =>
      import('./rooms/rooms.component').then((m) => m.RoomsComponent),
    data: { title: 'R+ | Rooms' },
  },
  {
    path: 'wbl',
    loadComponent: () =>
      import('./wbl/wbl.component').then((m) => m.WblComponent),
    data: { title: 'R+ | Work-Based Learning Placements' },
  },
  {
    path: 'applications-admin',
    loadComponent: () =>
      import('./applications/applications.component').then(
        (m) => m.ApplicationsComponent,
      ),
    data: { title: 'R+ | Course Applications Review' },
  },
  {
    path: 'project-groups',
    loadComponent: () =>
      import('./project-groups/project-groups.component').then(
        (m) => m.ProjectGroupsComponent,
      ),
    data: { title: 'R+ | Project Groups' },
  },
  {
    path: 'skillsfutures-claims',
    loadComponent: () =>
      import('./skillsfutures-claims/skillsfutures-claims.component').then(
        (m) => m.SkillsFuturesClaimsComponent,
      ),
    data: { title: 'R+ | SkillsFutures Claims: SSG Funding Review' },
  },
  // Drill-down — no sidebar entry; reached from /r/catalog/:courseId or
  // /r/rostering portfolio dashboard.
  {
    path: 'rosters/:courseId',
    loadComponent: () =>
      import('./roster-by-course/roster-by-course.component').then(
        (m) => m.RosterByCourseComponent,
      ),
    data: { title: 'R+ | Course Roster' },
  },
  // Wave-5 λ surveys — new top-level surface.
  {
    path: 'surveys',
    loadComponent: () =>
      import('./surveys/surveys.component').then((m) => m.SurveysComponent),
    data: { title: 'R+ | Feedback Surveys' },
  },
  // R+ Phase-1 (CHO-1580) — class bookings, new top-level surface.
  {
    path: 'bookings',
    loadComponent: () =>
      import('./bookings/bookings.component').then((m) => m.BookingsComponent),
    data: { title: 'R+ | Class Bookings' },
  },
  // Wave-5 ν detail drill-downs (no sidebar entries) — each reached from
  // the parent list screen's row CTA.
  {
    path: 'wbl/:id',
    loadComponent: () =>
      import('./wbl-detail/wbl-detail.component').then(
        (m) => m.WblDetailComponent,
      ),
    data: { title: 'R+ | WBL Placement Detail' },
  },
  {
    path: 'applications-admin/:id',
    loadComponent: () =>
      import(
        './applications-admin-detail/applications-admin-detail.component'
      ).then((m) => m.ApplicationsAdminDetailComponent),
    data: { title: 'R+ | Course Application Detail' },
  },
  {
    path: 'skillsfutures-claims/:id',
    loadComponent: () =>
      import(
        './skillsfutures-claim-detail/skillsfutures-claim-detail.component'
      ).then((m) => m.SkillsFuturesClaimDetailComponent),
    data: { title: 'R+ | SkillsFutures Claim Detail' },
  },
  {
    path: 'project-groups/:id',
    loadComponent: () =>
      import(
        './project-group-detail/project-group-detail.component'
      ).then((m) => m.ProjectGroupDetailComponent),
    data: { title: 'R+ | Project Group Detail' },
  },

  // ── ADR-155 Phase X — Assessment lifecycle (instantiation + monitor) ─
  // ORDER NOTE: `assessments/new` MUST precede `assessments/:id/monitor`
  // so the static `new` segment isn't matched as a :assessmentId param.
  {
    path: 'assessments/new',
    loadComponent: () =>
      import(
        './assessments/assessment-instantiation/assessment-instantiation.component'
      ).then((m) => m.AssessmentInstantiationComponent),
    data: { title: 'R+ | Assessment Instantiation' },
  },
  {
    path: 'assessments',
    loadComponent: () =>
      import(
        './assessment-monitor/assessment-list/assessment-list.component'
      ).then((m) => m.AssessmentListComponent),
    data: { title: 'R+ | Assessments' },
  },
  {
    path: 'assessments/:assessmentId/monitor',
    loadComponent: () =>
      import(
        './assessment-monitor/assessment-monitor/assessment-monitor.component'
      ).then((m) => m.AssessmentMonitorComponent),
    data: { title: 'R+ | Assessment Monitor' },
  },
  // ── ADR-172 — Instructor HITL grading queue ──────────────────────────
  // Drill-down from the assessment monitor's "Grading queue" CTA. Distinct
  // trailing `/grading-queue` segment keeps it unambiguous against the
  // `/monitor` route above; both precede the `**` wildcard.
  {
    path: 'assessments/:assessmentId/grading-queue',
    loadComponent: () =>
      import('./grading-queue/grading-queue.component').then(
        (m) => m.GradingQueueComponent,
      ),
    data: { title: 'R+ | Grading Queue' },
  },

  // ── CJ#2 — Course review is now a PER-COURSE action (R2b, CHO-2250) ──
  // The standalone review queue is retired; review (Release/Reject) lives on
  // the course-detail-admin page when a course is AWAITING_REVIEW, reached from
  // the Catalog row's Review CTA. Redirect the old queue path to the Catalog so
  // stale bookmarks land somewhere useful (the admin flips to the Awaiting
  // Review filter there). The CourseReviewComponent is deleted.
  {
    path: 'courses/review',
    pathMatch: 'full',
    redirectTo: 'catalog',
  },

  // ── CHO-1612 — Heterogeneous course curriculum editor ─────────────────
  // Reached from the course-detail-admin via a "Manage curriculum" CTA.
  // No sidebar nav entry — drill-down from /r/catalog/:courseId.
  // ORDER NOTE: Must come after `catalog/:courseId` so the literal
  // `content` segment doesn't conflict with the parameterised route.
  {
    path: 'catalog/:courseId/content',
    loadComponent: () =>
      import('./course-content-editor/course-content-editor.component').then(
        (m) => m.CourseContentEditorComponent,
      ),
    data: { title: 'R+ | Course Curriculum Editor' },
  },
];
