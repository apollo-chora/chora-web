/**
 * Static role → capabilities mapping used to seed
 * `AuthUser.capabilities` from the canonical JWT `roles` claim until the
 * backend mint endpoint emits an explicit `capabilities` array.
 *
 * Source of truth (backend):
 *   - `services/chora-identity/internal/domain/identity/membership.go`
 *     CanonicalRoles (per ADR-141 + ADR-165 extension 2026-05-26 adding
 *     PLATFORM_OPERATOR as the 9th canonical role + RLS-bypass principal).
 *
 * Frontend contract: `core/services/rbac.service.ts` reads the resulting
 * capability list; functional guards (`core/auth/role.guard.ts`) consume
 * it via `hasCapability(...)`.
 *
 * RULE: role string MUST match the JWT `roles[]` element EXACTLY
 * (uppercase / underscore per ADR-141). The JWT mint boundary in
 * chora-identity rejects lowercase variants, so the FE only ever sees
 * the canonical form.
 *
 * IMPORTANT: keep this map ADDITIVE — new capabilities should be added
 * to every relevant role rather than introducing aliases. A capability
 * present in the map for role R is granted to every JWT that lists R.
 */
/**
 * Full own-tenant admin scope.
 *
 * Shared by every case-variant below (TENANT_ADMIN / ADMIN / admin /
 * tenant_admin / owner / OWNER) so the variants CANNOT drift apart. Two
 * hand-maintained copies of one list is what produced the bug this const
 * fixes: `tenant_admin` was badged on the A+ dashboard while holding zero
 * capabilities, because only the uppercase twin was ever added.
 */
const TENANT_ADMIN_CAPS: readonly string[] = [
  'tenant:manage',
  'tenant:view_payments',
  // CHO-1824 P5.1: R+ assessment authoring (AI-assist batch authoring on the
  // R+ surface). Teaching/admin capability; gates the assessment-authoring route.
  'assessment:author',
  // Course create/maintain, gating the R+ course-authoring routes.
  //
  // ADMIN-ONLY BY OWNER RULING (2026-07-16): "for course, A+ is for the learner
  // to browse; R+ is where the ADMIN creates/maintains courses." This is the
  // whole reason the capability exists as something separate from
  // `assessment:author`, which is deliberately WIDER (instructor holds it).
  //
  // DO NOT widen this to `instructor` or `author`. An instructor teaches a
  // course; an author writes the content inside it. Neither owns the Course
  // aggregate (chora_delivery owns it, per architecture.md + ADR-232, which
  // rejected putting teaching roles on the A+ learner surface). If a request
  // arrives to let instructors author courses, it needs an owner ruling that
  // reverses the above, not a quiet edit here.
  'course:author',
  // ADR-239 D3 (CHO-2234): R+ training-operations navigation set. Gates the
  // 16 non-exam, non-authoring R+ nav items + the /r child routes
  // (rplus-ops.guard.ts) so an exam-ops-only PROCTOR session sees ONLY Exam
  // Administration. Admin-family sessions that reach R+ (multi-role, or
  // platform_operator god-mode via the PLATFORM_OPERATOR_CAPS spread) keep
  // their current visibility.
  'delivery:ops',
];

/**
 * Read-only audit scope. Explicitly NO refund / mutation caps: an auditor sees
 * the H+ Transaction History page but cannot click "Issue refund". Shared by
 * the `auditor` / `AUDITOR` case twins so they cannot drift.
 */
const AUDITOR_CAPS: readonly string[] = [
  'tenant:view_payments',
];

/**
 * Platform-wide (cross-tenant) scope per ADR-165. Same capability surface as a
 * tenant admin; the cross-tenant reach is enforced server-side, not by an extra
 * FE capability. Shared by the `PLATFORM_OPERATOR` / `platform_operator` case
 * twins so they cannot drift.
 */
const PLATFORM_OPERATOR_CAPS: readonly string[] = [...TENANT_ADMIN_CAPS];

export const ROLE_CAPABILITIES: Readonly<Record<string, readonly string[]>> = {
  // ── Tenant-scoped admin roles ───────────────────────────────────
  TENANT_ADMIN: TENANT_ADMIN_CAPS,
  // ADMIN = legacy uppercase canonical for DB enum `admin` per
  // services/chora-identity/internal/domain/identity/membership.go
  // (CanonicalRoleAdmin). Same capability surface as TENANT_ADMIN —
  // both indicate full own-tenant scope.
  ADMIN: TENANT_ADMIN_CAPS,
  // Lowercase variants — chora-tenancy.members.role enum is
  // {learner, instructor, admin, auditor} (lowercase per
  // services/chora-tenancy/migrations/0001_initial.sql). The
  // chora-identity → chora-gateway mint flow forwards roles verbatim
  // (no uppercase normalisation in current code paths despite
  // ADR-141 aspirational note above). Until the mint boundary
  // canonicalises, accept both forms — this is fail-open + matches
  // the actual JWT shape on deployed reality.
  admin: TENANT_ADMIN_CAPS,
  // `tenant_admin` lowercase: a JWT-extension label carrying full own-tenant
  // admin scope. It is NO LONGER an A+ dashboard badge (CHO-2340 badges only the
  // tenant-membership roles), but a JWT carrying it must still resolve to
  // capabilities so guards admit it, not silently hold nothing.
  tenant_admin: TENANT_ADMIN_CAPS,
  auditor: AUDITOR_CAPS,
  instructor: [
    // No tenant:view_payments — instructor is per-tenant teaching only.
    // CHO-1824 P5.1 — may AI-author assessment questions on R+.
    'assessment:author',
    // ADR-239 D3: the R+ training-ops nav set. Instructor is the R+ surface's
    // resident persona (roleSurfaceMap: instructor -> rplus) and must keep
    // every base nav item it renders today once the items gain the
    // delivery:ops gate.
    'delivery:ops',
    // Deliberately NO course:author. See the ruling on TENANT_ADMIN_CAPS.
  ],
  // An author authors CONTENT (atoms, questions), which is what
  // `assessment:author` gates. No tenant scope: authoring is not administering.
  // Deliberately NO course:author (a course is the admin's, not the author's).
  author: [
    'assessment:author',
  ],
  // `training_admin` = the R+ delivery/course admin (a derived session label).
  // Not an A+ dashboard badge (CHO-2340 badges membership roles only), but its
  // capabilities must still resolve for the R+ routes it gates.
  // Authoring scope only: every R+ route gates on assessment:author, and course
  // create/maintain is this role's core job. Deliberately NO tenant:view_payments:
  // the only route gating on it is the H+ Transaction History page, which is
  // tenant billing, not training delivery. Least privilege: no route asks for it.
  training_admin: [
    'assessment:author',
    'course:author',
    // ADR-239 D1+D3: training_admin is a derived session label paired onto an
    // instructor membership (gateway mint expandTrainingAdmin, CHO-1870/WS1),
    // so it co-occurs with instructor's own delivery:ops grant; carried here
    // too so the label's capability set stands on its own and survives a
    // future standalone-role split (ADR-239 Alternative C) without a leak.
    'delivery:ops',
  ],
  // H+ Setup-Tenant Phase 1 bootstrap writes lowercase `owner` to
  // chora_tenancy.members.role (see
  // services/chora-tenancy/internal/domain/bootstrap/bootstrap.go +
  // verified at runtime via local Postgres on 2026-06-05). The mint
  // flow forwards verbatim, so the JWT carries `owner` lowercase too.
  // Without this entry the wizard at /admin/* redirects to /unauthorized
  // immediately after bootstrap — same uppercase/lowercase fail-open
  // pattern the surrounding admin/auditor/instructor entries follow.
  owner: TENANT_ADMIN_CAPS,
  OWNER: TENANT_ADMIN_CAPS,
  AUDITOR: AUDITOR_CAPS,

  // ── Platform-wide (cross-tenant) roles per ADR-165 ──────────────
  // RLS-bypass principal, gated server-side; the FE never asserts the
  // bypass itself, only renders the cross-tenant column / filter.
  // Both case forms share one list. The lowercase `platform_operator` is a
  // JWT-extension role (not an A+ dashboard badge post-CHO-2340); it must still
  // resolve to capabilities so the FE renders its cross-tenant view.
  PLATFORM_OPERATOR: PLATFORM_OPERATOR_CAPS,
  platform_operator: PLATFORM_OPERATOR_CAPS,

  // ── Exam invigilation (add-on-gated, content-embargoed) per ADR-191 ──
  // PROCTOR is a tenant-scoped JWT-extension role (like TENANT_ADMIN) so it is
  // keyed UPPERCASE — the JWT carries the canonical form for JWT-extension
  // roles (only the DB-enum roles learner/instructor/admin/auditor/owner arrive
  // lowercase). LOGISTICS caps ONLY: a proctor checks candidates in, opens /
  // closes the sitting, views the roster, and files incidents — but is embargoed
  // from exam CONTENT. Deliberately NO `assessment:author` and NO content-read
  // capability ("sees the people, not the paper", ADR-191 D1). The embargo is
  // additionally enforced server-side: a RESTRICTIVE RLS policy on
  // learning_atoms / atom_revisions in chora_creation (mig 0028) + a 403
  // EXAM_CONTENT_EMBARGO_VIOLATION at the content boundary (ADR-191 D3).
  PROCTOR: [
    'exam:sitting_check_in',
    'exam:sitting_open',
    'exam:sitting_close',
    'exam:roster_view',
    'exam:incident_file',
  ],
};

/**
 * Compute the deduped, sorted capability list for a set of roles.
 * Unknown roles silently contribute nothing (fail-closed).
 */
export function capabilitiesForRoles(roles: readonly string[]): string[] {
  const out = new Set<string>();
  for (const r of roles ?? []) {
    const caps = ROLE_CAPABILITIES[r];
    if (caps) {
      for (const c of caps) out.add(c);
    }
  }
  return Array.from(out).sort();
}
