import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { of } from 'rxjs';
import { map, timeout } from 'rxjs/operators';
import { FeatureFlagService } from '../services/feature-flag.service';
import { RbacService } from '../services/rbac.service';
import { canAccessAddOn } from '../../features/surfaces/surface-access';

/**
 * Fail-closed ceiling on how long a non-operator guard waits for the post-mint
 * `GET /api/feature-flags` to resolve before redirecting. The fetch is a
 * non-blocking side-effect; if it never settles (dropped request, BFF stall)
 * the guard must not hang the navigation forever — after this budget it
 * re-evaluates against the (still empty) set, which fails closed to `/`.
 */
export const ADDON_GUARD_FLAGS_TIMEOUT_MS = 8000;

/**
 * Add-on entitlement route guard. Grants entry under the unified surface
 * access rule (shared with `SurfaceRailComponent` via `canAccessAddOn`, so
 * the rail and the route can never disagree): the active tenant is entitled
 * to `code` OR the user holds the `platform_operator` role.
 *
 * `platform_operator` transcends tenant add-on entitlements for navigation
 * (ADR-165 god-mode) — without this bypass an operator clicking an
 * add-on-gated surface (C+ → `cplus_social`) would be silently redirected to
 * `/`. Non-operators in a non-entitled tenant keep the redirect to `/`.
 *
 * Decision shape (ONBOARD-F2 read-seam — the post-mint flags GET is a
 * non-blocking side-effect, so the guard can fire BEFORE it returns and
 * wrongly redirect an entitled non-operator against an empty set):
 *   - Operator OR already-entitled → decide `true` SYNCHRONOUSLY. An operator
 *     must never be made to wait, even when flags never load.
 *   - Non-operator with flags still loading → return an `Observable` that does
 *     NOT emit until `flags.whenLoaded$` resolves, then RE-EVALUATES the rule
 *     against the freshly-loaded set (entitled → `true`; empty →
 *     `createUrlTree(['/'])`). An already-loaded set replays immediately, so a
 *     non-operator in a non-entitled tenant still redirects without delay.
 *   - Flags-load exceeds {@link ADDON_GUARD_FLAGS_TIMEOUT_MS} → fail closed:
 *     re-evaluate against the empty set, which redirects a non-operator to `/`.
 */
export const addOnGuard = (code: string): CanActivateFn => {
  return () => {
    const flags = inject(FeatureFlagService);
    const rbac = inject(RbacService);
    const router = inject(Router);

    // Operator or already-entitled → synchronous allow (no wait for flags).
    if (canAccessAddOn(code, flags, rbac)) {
      return true;
    }

    // Non-operator, decision pending: defer until the entitlement set resolves
    // (whenLoaded$ replays immediately for an already-loaded set), then decide.
    // A fail-closed timeout falls through to the same empty-set re-evaluation.
    return flags.whenLoaded$.pipe(
      timeout({ first: ADDON_GUARD_FLAGS_TIMEOUT_MS, with: () => of(true as const) }),
      map(() => (canAccessAddOn(code, flags, rbac) ? true : router.createUrlTree(['/']))),
    );
  };
};
