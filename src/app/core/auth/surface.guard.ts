import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RbacService } from '../services/rbac.service';
import { FeatureFlagService } from '../services/feature-flag.service';
import { TenantContextService } from './tenant-context.service';
import type { SurfaceKey } from '../../features/surfaces/surface-landing.component';
import {
  firstAccessibleSurfaceLanding,
  resolveVisibleSurfaces,
  type SurfaceFailMode,
} from '../../features/surfaces/surface-access';

/**
 * Empty-data fail-mode for the surface guard (CHO-1801, owner ruling
 * 2026-06-19 = FAIL-CLOSED).
 *
 * Set to `'aplus-baseline'`: the guard is strictly default-deny for the
 * sensitive surfaces (H+/O+/R+ admin/governance/delivery, and C+'s social
 * add-on via its composed `addOnGuard`), while a session that reaches the guard
 * with NO usable `surfaces[]` metadata can still land on A+ — the universal
 * authenticated-member home and the `/a/dashboard` root-redirect target — so it
 * is never bricked at the front door. This closes the URL-bar bypass (the H+/O+/
 * R+ shells no longer render for a non-entitled user) WITHOUT the legacy-session
 * self-DoS the owner flagged in handoff §5.
 *
 * To reach the owner's PURE fail-closed end-state (`'closed-none'` — deny A+ too
 * when surfaces are absent), flip this constant ONLY AFTER the BE guarantees
 * every membership emits a non-empty `surfaces[]` (the `chora-tenancy`
 * `RolesToSurfaces` baseline + a mint test); flipping it before that strands any
 * session lacking surface data.
 */
export const SURFACE_GUARD_EMPTY_MODE: SurfaceFailMode = 'aplus-baseline';

/**
 * Surface-route RBAC guard (CHO-1801 / ADR-181 + ADR-165). Activates the A+/
 * C+/H+/O+/R+ route GROUPS iff the active tenant's per-membership `surfaces[]`
 * includes `surface` — the SAME membership-axis predicate the surface rail uses
 * (`resolveVisibleSurfaces`) — OR the user is a `platform_operator`. Closes the
 * URL-bar bypass found in ADR-185 verification (CHO-1800): before this, typing
 * `/h/tenant` (etc.) rendered the surface shell + nav even when the rail
 * correctly hid it, violating CLAUDE.md §2 ("role-driven feature visibility, no
 * toggles") — an in-page "Access restricted" is reactive, not the mandate.
 *
 * - `platform_operator` god-mode (ADR-165): reaches EVERY surface regardless of
 *   per-tenant membership roles. Checked first + synchronously so an operator is
 *   never made to wait or be redirected. Mirrors `addOnGuard` / the rail, so the
 *   two navigation gates can never disagree (an operator is never stranded off a
 *   surface the rail shows it).
 * - Membership axis ONLY: this guard does NOT evaluate the C+ add-on entitlement
 *   (`cplus_social`) — that stays in the composed `addOnGuard('cplus_social')`
 *   on the `/c` mount. C+ = `[surfaceGuard('cplus'), addOnGuard('cplus_social')]`
 *   = membership AND entitlement (operator bypasses both), exactly the rail's
 *   composed `visibleSurfaceKeys ∋ cplus` AND `canAccessSurface(cplus)` rule.
 * - Denied → redirect to the first surface the user CAN reach (A+ home first),
 *   else `/unauthorized`. The redirect is fully synchronous (signal reads only;
 *   no flag-load wait) and loop-safe (the landing is always a granted surface).
 */
export const surfaceGuard = (surface: SurfaceKey): CanActivateFn => {
  return () => {
    const rbac = inject(RbacService);
    const flags = inject(FeatureFlagService);
    const tenantContext = inject(TenantContextService);
    const router = inject(Router);

    // Operator god-mode — synchronous allow, never redirected (ADR-165).
    if (rbac.hasRole('platform_operator')) {
      return true;
    }

    const visible = resolveVisibleSurfaces(
      tenantContext.currentTenant(),
      tenantContext.availableTenants(),
      { onEmpty: SURFACE_GUARD_EMPTY_MODE },
    );
    if (visible.has(surface)) {
      return true;
    }

    // Denied: send the user to a surface they actually hold (A+ home first),
    // or `/unauthorized` when they hold none.
    const landing = firstAccessibleSurfaceLanding(visible, flags, rbac);
    return router.createUrlTree([landing ?? '/unauthorized']);
  };
};
