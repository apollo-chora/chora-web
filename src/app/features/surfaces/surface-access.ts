/**
 * Surface access rule — single source of truth shared by `add-on.guard.ts`
 * (route entry) and `SurfaceRailComponent` (rail visibility) so the two
 * navigation gates can NEVER disagree (nav-fe reconciliation, CHO-1717 /
 * ADR-181 + ADR-165).
 *
 * Unified rule: a user may access an add-on-gated surface IFF the active
 * tenant is entitled to the add-on OR the user holds the `platform_operator`
 * role. `platform_operator` transcends tenant add-on entitlements for
 * navigation (ADR-165 god-mode) — the rail must never strand it on a surface
 * the route guard would otherwise let it enter, and vice versa.
 */
import type { FeatureFlagService } from '../../core/services/feature-flag.service';
import type { RbacService } from '../../core/services/rbac.service';
import type { SurfaceKey } from './surface-landing.component';

/**
 * Surface-level add-on gates. A surface listed here is reachable only via
 * {@link canAccessSurface}; surfaces ABSENT from this map carry no
 * surface-level add-on gate (A+/H+/O+/R+ are always reachable).
 *
 * Currently the ONLY surface-level add-on gate is C+ → `cplus_social`
 * (`app.routes.ts` mounts `addOnGuard('cplus_social')` on `/c/*`). Add a new
 * entry here AND nowhere else when a future surface becomes add-on-gated, so
 * the rail and guard stay in lock-step.
 */
export const SURFACE_ADDON_GATE: Partial<Record<SurfaceKey, string>> = {
  cplus: 'cplus_social',
};

/**
 * The minimal contracts the rule reads — structurally satisfied by the real
 * `FeatureFlagService` / `RbacService`, while keeping the rule itself free of
 * Angular DI so it stays trivially unit-testable. `Pick` ties the shapes to
 * the concrete services so a signature drift is caught by the compiler.
 */
type AddOnEntitlementCheck = Pick<FeatureFlagService, 'isEnabled'>;
type OperatorRoleCheck = Pick<RbacService, 'hasRole'>;

/**
 * Unified add-on access rule: granted IFF the active tenant is entitled to
 * `code` OR the user is a `platform_operator`. Used directly by
 * `add-on.guard.ts` (which is keyed by add-on code) and indirectly by
 * {@link canAccessSurface}.
 */
export function canAccessAddOn(
  code: string,
  flags: AddOnEntitlementCheck,
  rbac: OperatorRoleCheck,
): boolean {
  return flags.isEnabled(code) || rbac.hasRole('platform_operator');
}

/**
 * Both role axes a nav entry can gate on. `Pick` ties the shape to the concrete
 * service so a signature drift is caught by the compiler rather than at runtime.
 */
type NavCapabilityCheck = Pick<RbacService, 'hasRole' | 'hasCapability'>;

/**
 * The ONE nav-entry visibility predicate, fail-closed on every axis it reads.
 *
 * Lifted verbatim out of `SidebarComponent.isVisible` when the A+ compass bar
 * arrived (C2), because two navigations filtering the same `NavItem`s through
 * two copies of a fail-closed rule is the shape where a sibling screen quietly
 * misses a fix applied to its twin. The sidebar and the compass both call this.
 *
 * Every axis is evaluated: passing one gate never short-circuits another. An
 * entry with no gate at all is visible.
 */
export function isNavItemVisible(
  item: NavItemGates,
  flags: AddOnEntitlementCheck,
  rbac: NavCapabilityCheck,
): boolean {
  // Fail-closed on role - operator-scoped entries (e.g. the Setup-Tenant
  // wizard, platform_operator only per section 4.7d / ADR-181) hide entirely
  // when the session JWT roles claim lacks the role.
  if (item.role && !rbac.hasRole(item.role)) {
    return false;
  }
  // Fail-closed on capability - admin-scoped and author-scoped entries hide
  // entirely when the JWT roles do not grant the cap.
  if (item.capability && !rbac.hasCapability(item.capability)) {
    return false;
  }
  if (!item.addOn) return true;
  return canAccessAddOn(item.addOn, flags, rbac);
}

/**
 * Roles that may see the CHORA surface rail at all (R39, owner ruling
 * 2026-09-02 after the pass 4 walk).
 *
 * The rail is cross-surface navigation, and cross-surface navigation is not
 * part of a learner's product. Learners and authors work inside A+, reach C+
 * through the hand-offs, the "your circle" card and the atom exit, and reach
 * their account through the avatar menu. Showing them a rail advertises four
 * doors they hold no membership for.
 *
 * `owner` and `tenant_admin` are included because they ARE the admin class
 * (`role-capabilities.ts` maps both to `TENANT_ADMIN_CAPS`); reading the
 * ruling's "admin" narrowly would hide the rail from the person who owns the
 * organisation, which is plainly not what it asks for.
 */
const SURFACE_RAIL_ROLES: readonly string[] = [
  'admin',
  'tenant_admin',
  'owner',
  'instructor',
  'auditor',
  'platform_operator',
  'proctor',
  'training_admin',
];

/**
 * Whether this session may see the CHORA surface rail at all (R39).
 *
 * Fail-CLOSED: a payload carrying no qualifying role yields no rail, so a
 * missing or unrecognised roles claim hides rather than reveals. ONE
 * definition, called by both the rail itself and by the shell layout, which
 * reclaims the left edge when it is false. A second copy in the layout would
 * be the shape where one of the two quietly stops matching the other.
 *
 * This runs BEFORE the B1 fail-closed-to-active-surface fallback: B1 decides
 * WHICH chips an eligible session sees, this decides whether there is a rail.
 */
export function canSeeSurfaceRail(rbac: Pick<RbacService, 'hasRole'>): boolean {
  return SURFACE_RAIL_ROLES.some((role) => rbac.hasRole(role));
}

/**
 * The gate-bearing subset of `NavItem`. Structural rather than an import so
 * this module stays free of a dependency on the nav registry that consumes it.
 */
export interface NavItemGates {
  readonly addOn?: string;
  readonly capability?: string;
  readonly role?: string;
}

/**
 * Whether a surface is reachable for the current session. Un-gated surfaces
 * are always reachable; add-on-gated surfaces defer to {@link canAccessAddOn}.
 */
export function canAccessSurface(
  surface: SurfaceKey,
  flags: AddOnEntitlementCheck,
  rbac: OperatorRoleCheck,
): boolean {
  const code = SURFACE_ADDON_GATE[surface];
  if (code === undefined) {
    return true;
  }
  return canAccessAddOn(code, flags, rbac);
}

// ─────────────────────────────────────────────────────────────────────────
// Membership-axis surface predicate (CHO-1801 — surface-route RBAC guard)
//
// The surface RAIL (`surface-rail.component.ts:88-136`) and the surface ROUTE
// GUARD (`core/auth/surface.guard.ts`) BOTH decide which CHORA surfaces a
// session may see from the per-membership `surfaces[]` array the BE mint issues
// (role-driven: `chora-tenancy RolesToSurfaces`; operator widened to all 5 via
// `widenSurfacesToFullRail`). They MUST agree on WHICH surfaces a membership
// unlocks, differing only in the empty-data fail-mode — so the candidate-
// resolution is centralised here as a single pure source of truth.
// ─────────────────────────────────────────────────────────────────────────

/** Canonical CHORA surface keys (A+/C+/H+/O+/R+), in the CLAUDE.md §2 order. */
export const ALL_SURFACE_KEYS: readonly SurfaceKey[] = [
  'aplus',
  'cplus',
  'hplus',
  'oplus',
  'rplus',
];

/**
 * Per-surface landing route: the first screen of each surface. The single
 * source of truth, imported by the surface rail (chip targets), the surface
 * guard (where a denied user is sent) and {@link resolveLandingRoute} (where a
 * session lands after login). The rail used to keep its own copy of this map;
 * that copy was deleted in C2 slice 3 rather than kept in lock-step, because a
 * constant duplicated across two files is a drift waiting for the next edit.
 *
 * A+ is `/a/home`, not `/a/dashboard`, since C2 slice 3 (ADR-240): the
 * learner's home is the surface's first screen. `/a/dashboard` survives intact
 * as a route and as a Home card destination (orchestrator ruling 2026-09-03,
 * ADR-240 D6); it simply stopped being the thing you are dropped onto.
 */
export const SURFACE_LANDING: Readonly<Record<SurfaceKey, string>> = {
  aplus: '/a/home',
  cplus: '/c/feed',
  hplus: '/h/tenant',
  oplus: '/o/dashboard',
  rplus: '/r/offerings',
};

/**
 * Where a session with NO surface it can enter lands: the surface-agnostic
 * home ADR-240 D1 built precisely so that such a session is never stranded.
 * `/home` is a Group-4 shell sibling and carries no `surfaceGuard`, so it can
 * never bounce the very session that had nowhere else to go.
 */
export const NO_SURFACE_LANDING = '/home';

/**
 * What the membership predicate yields when a session carries NO usable
 * `surfaces[]` metadata (no active surfaces, no matching membership, no union,
 * or only unrecognised tokens):
 *
 *  - `'open-all'`       → all 5 surfaces. The RAIL's historical behaviour — the
 *                         rail is pure navigation, so an empty rail on legacy
 *                         data would brick the shell for no security benefit.
 *  - `'aplus-baseline'` → ONLY A+. The surface GUARD's safe default: A+ is the
 *                         universal authenticated-member home (the `/a/dashboard`
 *                         root-redirect target), so denying it would brick the
 *                         app's entry point — while the sensitive surfaces
 *                         (H+/O+/R+ admin/governance/delivery, C+ social add-on)
 *                         stay strictly default-deny. This is least-privilege
 *                         with a safe floor, NOT a permissive fail-open.
 *  - `'closed-none'`    → NO surfaces. The owner's pure fail-closed end-state
 *                         (2026-06-19). Safe to switch the guard to ONLY once the
 *                         BE guarantees every membership emits a non-empty
 *                         `surfaces[]` (see `RolesToSurfaces` baseline) — before
 *                         that, this strands any session lacking surface data.
 */
export type SurfaceFailMode = 'open-all' | 'aplus-baseline' | 'closed-none';

/** Minimal structural view of a `TenantContext` the predicate reads. */
export interface SurfaceMembershipView {
  readonly id: string;
  readonly surfaces?: readonly string[];
}

function isSurfaceKey(value: string): value is SurfaceKey {
  return (ALL_SURFACE_KEYS as readonly string[]).includes(value);
}

function emptyFor(mode: SurfaceFailMode): ReadonlySet<SurfaceKey> {
  switch (mode) {
    case 'open-all':
      return new Set<SurfaceKey>(ALL_SURFACE_KEYS);
    case 'aplus-baseline':
      return new Set<SurfaceKey>(['aplus']);
    case 'closed-none':
      return new Set<SurfaceKey>();
  }
}

/**
 * Resolve the membership-axis visible surface set for a session, mirroring the
 * surface rail's `visibleSurfaceKeys` candidate-resolution EXACTLY (so rail and
 * guard never disagree on which surfaces a membership unlocks):
 *
 *  1. ACTIVE tenant context set → its membership `surfaces[]` (falling back to
 *     the matching `memberships` entry when the active context was seeded
 *     without surfaces, e.g. the bare-JWT seed).
 *  2. No active context → UNION of `surfaces[]` across memberships.
 *  3. No usable surface data anywhere → the {@link SurfaceFailMode}.
 *
 * Unknown surface tokens are dropped. This is the ADD-ON-agnostic membership
 * axis ONLY — compose with {@link canAccessSurface} / `addOnGuard` for the
 * entitlement axis (C+ → `cplus_social`).
 */
export function resolveVisibleSurfaces(
  active: SurfaceMembershipView | null,
  memberships: readonly SurfaceMembershipView[],
  opts: { onEmpty: SurfaceFailMode },
): ReadonlySet<SurfaceKey> {
  let candidate: readonly string[] | undefined;
  if (active) {
    candidate =
      active.surfaces ?? memberships.find((m) => m.id === active.id)?.surfaces;
  }
  if (candidate === undefined) {
    const union = memberships.flatMap((m) => m.surfaces ?? []);
    candidate = union.length > 0 ? union : undefined;
  }

  const known = (candidate ?? []).filter(isSurfaceKey);
  if (known.length === 0) {
    return emptyFor(opts.onEmpty);
  }
  return new Set<SurfaceKey>(known);
}

/**
 * The safe landing route for a user DENIED the surface they navigated to: the
 * first surface that is BOTH membership-visible AND add-on-accessible
 * (i.e. exactly what the rail would render), in a priority that prefers A+
 * (the universal home). Returns `null` when no surface is reachable (caller
 * redirects to `/unauthorized`).
 *
 * Composing `canAccessSurface` here is what keeps the redirect LOOP-SAFE: a
 * membership-visible-but-not-entitled C+ is skipped, so the guard never lands a
 * user on a surface its own `addOnGuard` would immediately bounce away from.
 */
export function firstAccessibleSurfaceLanding(
  visible: ReadonlySet<SurfaceKey>,
  flags: AddOnEntitlementCheck,
  rbac: OperatorRoleCheck,
): string | null {
  for (const key of LANDING_PRIORITY) {
    if (visible.has(key) && canAccessSurface(key, flags, rbac)) {
      return SURFACE_LANDING[key];
    }
  }
  return null;
}

/**
 * The ONE landing rule (C2 slice 3, ADR-240): where an authenticated session
 * belongs when nothing else has claimed it, expressed as the first surface it
 * both HOLDS and can ENTER, falling back to the never-strand door.
 *
 * Total by construction: every session gets a route, so no caller needs a
 * second opinion about the empty case, and none of them may invent one. Where
 * {@link firstAccessibleSurfaceLanding} answers "is there anywhere to send a
 * DENIED user" and reports `null` when there is not, this answers "where does
 * this session go" and always has an answer.
 */
export function resolveLandingRoute(
  visible: ReadonlySet<SurfaceKey>,
  flags: AddOnEntitlementCheck,
  rbac: OperatorRoleCheck,
): string {
  return firstAccessibleSurfaceLanding(visible, flags, rbac) ?? NO_SURFACE_LANDING;
}

/**
 * Redirect-landing priority: A+ first (the universal authenticated-member home),
 * then the remaining surfaces in CHORA order. Only affects WHICH home a denied
 * user is sent to, never WHETHER a surface is granted.
 */
const LANDING_PRIORITY: readonly SurfaceKey[] = [
  'aplus',
  'cplus',
  'hplus',
  'oplus',
  'rplus',
];
