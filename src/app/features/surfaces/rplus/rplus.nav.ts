/**
 * R+ (Rhythm+) surface nav config — Stage 3 wave 3 + ADR-155 Phase X.
 *
 * Owns: Content Delivery — training admin, scheduling, rostering, classroom, exam.
 * Surface accent: amber (`#b45309` primary / `#ea580c` secondary).
 * Tagline: "pacing, cadence, heartbeat".
 *
 * Wave 1 wired `roster` only; wave 2 backfilled catalog / scheduling /
 * classroom / exams. Wave 3 added the cross-cohort Rostering Dashboard
 * (`/r/rostering`) — Mr. Chen's portfolio-level entry point.
 * Phase X (ADR-155) adds the Assessments list — instructor-side
 * instantiation entry point + monitor index.
 *
 * Drill-down screens (`/r/catalog/:courseId` course-detail admin +
 * `/r/classroom/quiz-builder` Live Quiz Builder + `/r/assessments/new`
 * instantiation form + `/r/assessments/:id/monitor` monitor detail)
 * intentionally do NOT add sidebar items — reached from the parent
 * list / catalog entry.
 *
 * ADR-239 D3 (CHO-2234), per-role R+ visibility: every non-exam,
 * non-authoring entry carries `capability: 'delivery:ops'` (the R+
 * training-ops set, granted to instructor / the paired training_admin
 * label / the tenant-admin family / platform_operator). `/r/exams` stays
 * capability-free: Exam Administration is the whole surface population's
 * business, and it is ALL an exam-ops-only PROCTOR session may see
 * (CHO-2200 role-matrix, no tab leak). The 2 authoring entries keep their
 * stricter `assessment:author` gate. Route-level twin: rplus-ops.guard.ts.
 *
 * R1 de-shadow (CHO-2243): the flat 18-item list is regrouped into 6
 * lifecycle bands via `group`. The array order IS the render order — items
 * sit in contiguous band runs (deliver → schedule → live → assess →
 * records → admin) so the sidebar groups them without a sort. No item,
 * route, or capability changed here: single-persona ruling, zero per-item
 * role variance. Bookings temporarily parks in ADMIN until R2 folds it into
 * the offering workspace Roster+Attendance. SidebarComponent owns the band
 * labels + which band is collapsible (ADMIN).
 */
import type { NavItem } from '../surface-nav';

export const RPLUS_NAV: readonly NavItem[] = [
  // ── DELIVER — the offerings + catalog the instructor runs ───────────────
  // R0 (CHO-2240): the single-cohort Class Roster demo is retired from the R+
  // surface; /r/roster redirects to the Offerings finder. Real roster views
  // live in the offering workspace Roster tab and /r/rosters/:courseId.
  // W2.C — Offerings universal finder (delivery instances; grad/short/async).
  // Offerings leads the band as the R+ landing.
  {
    labelKey: 'rplus.nav.offerings',
    icon: 'graduation-cap',
    route: '/r/offerings',
    capability: 'delivery:ops',
    group: 'deliver',
  },
  {
    labelKey: 'rplus.nav.catalog',
    icon: 'grid',
    route: '/r/catalog',
    capability: 'delivery:ops',
    group: 'deliver',
  },
  // R2b (CHO-2250): the standalone Course Review queue left the sidebar. Review
  // is now a PER-COURSE action on the course-detail-admin page (Release/Reject
  // render when a course is AWAITING_REVIEW), reached from the Catalog row's
  // Review CTA; /r/courses/review redirects to /r/catalog. The release/reject
  // endpoints were already per-course + training-admin-gated (no BE change).
  // R4 (CHO-2269): the cross-cohort Rostering dashboard (`/r/rostering`) left
  // the sidebar too. Its portfolio summary is absorbed into the Offerings
  // finder header (the R+ landing); `/r/rostering` redirects to `/r/offerings`.
  // ── SCHEDULE — the cross-offering week view (kept top-level, R0 rename) ──
  {
    labelKey: 'rplus.nav.scheduling',
    icon: 'calendar',
    route: '/r/scheduling',
    capability: 'delivery:ops',
    group: 'schedule',
  },
  // ── LIVE — the running classroom ────────────────────────────────────────
  {
    labelKey: 'rplus.nav.classroom',
    icon: 'broadcast',
    route: '/r/classroom',
    capability: 'delivery:ops',
    group: 'live',
  },
  // ── ASSESS — assessments, exams, and the authoring tools ────────────────
  {
    labelKey: 'rplus.nav.assessments',
    icon: 'clipboard-check',
    route: '/r/assessments',
    capability: 'delivery:ops',
    group: 'assess',
  },
  // Exam Administration is deliberately capability-FREE (ADR-239 D3): visible
  // to every session the surface admits, and the ONLY entry an exam-ops
  // PROCTOR session sees. The ADR-191 content embargo stays the content
  // authority regardless of navigation.
  {
    labelKey: 'rplus.nav.exams',
    icon: 'file-lines',
    route: '/r/exams',
    group: 'assess',
  },
  // R2a (CHO-2248): the two authoring TOOLS — AI Assessment Authoring
  // (/r/assessment-authoring) and Question Banks (/r/question-banks) — left
  // the sidebar. Their canonical home is the offering workspace Assessments
  // tab, which already renders both as actions (assemble-from-bank +
  // author-fresh, offering-workspace.component.html, gated on canManage). The
  // routes stay (the workspace links to them) behind the assessment:author
  // roleGuard; only the redundant top-level doors are removed. With them gone,
  // no sidebar item carries assessment:author anymore.
  // ── RECORDS — the certification registry ────────────────────────────────
  {
    labelKey: 'rplus.nav.certifications',
    icon: 'certificate',
    route: '/r/certifications',
    capability: 'delivery:ops',
    group: 'records',
  },
  // ── ADMIN — the training-admin tail (collapsible). Bookings parks here
  //    until R2 folds it into the offering workspace Roster+Attendance. ────
  {
    labelKey: 'rplus.nav.applicationsAdmin',
    icon: 'inbox',
    route: '/r/applications-admin',
    capability: 'delivery:ops',
    group: 'admin',
  },
  {
    labelKey: 'rplus.nav.skillsfutures_claims',
    icon: 'shield-halved',
    route: '/r/skillsfutures-claims',
    capability: 'delivery:ops',
    group: 'admin',
  },
  {
    labelKey: 'rplus.nav.wbl',
    icon: 'briefcase',
    route: '/r/wbl',
    capability: 'delivery:ops',
    group: 'admin',
  },
  {
    labelKey: 'rplus.nav.project_groups',
    icon: 'people-group',
    route: '/r/project-groups',
    capability: 'delivery:ops',
    group: 'admin',
  },
  {
    labelKey: 'rplus.nav.campusops',
    icon: 'building',
    route: '/r/campusops',
    capability: 'delivery:ops',
    group: 'admin',
  },
  {
    labelKey: 'rplus.nav.surveys',
    icon: 'clipboard-question',
    route: '/r/surveys',
    capability: 'delivery:ops',
    group: 'admin',
  },
  {
    labelKey: 'rplus.nav.bookings',
    icon: 'calendar-check',
    route: '/r/bookings',
    capability: 'delivery:ops',
    group: 'admin',
  },
];
