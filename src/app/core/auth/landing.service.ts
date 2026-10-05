import { Injectable, inject } from '@angular/core';
import { RbacService } from '../services/rbac.service';
import { FeatureFlagService } from '../services/feature-flag.service';
import { TenantContextService } from './tenant-context.service';
import {
  ALL_SURFACE_KEYS,
  resolveLandingRoute,
  resolveVisibleSurfaces,
  type SurfaceFailMode,
} from '../../features/surfaces/surface-access';
import type { SurfaceKey } from '../../features/surfaces/surface-landing.component';

/**
 * Empty-data fail-mode for the LANDING resolver, and deliberately NOT the same
 * one `surfaceGuard` uses (`SURFACE_GUARD_EMPTY_MODE = 'aplus-baseline'`).
 *
 * The two answer different questions and a future reader will be tempted to
 * "align" them, so the reason is recorded here rather than left to inference:
 *
 *  - The GUARD is asked "may this session ENTER A+?". Answering no when the
 *    session carries no `surfaces[]` would brick a legacy session at the front
 *    door, so it keeps the A+ baseline.
 *  - The RESOLVER is asked "where does this session BELONG?". A session whose
 *    mint granted it nothing does not belong on a surface; it belongs on the
 *    surface-agnostic `/home` that ADR-240 D1 built for exactly this case. It
 *    is not stranded there: it can still walk into A+, because the guard's
 *    baseline admits it.
 *
 * So `closed-none` here is not a stricter version of the guard's rule. It is
 * the honest reading of the same data for a different question, and it is what
 * makes the no-surface case reachable at all rather than a dead branch.
 */
export const LANDING_EMPTY_MODE: SurfaceFailMode = 'closed-none';

/**
 * The ONE post-login landing resolver (UX Track U C2 slice 3, ADR-240).
 *
 * Seven sites used to hard-code where an authenticated session lands: five on
 * `/a/dashboard`, two on the legacy `/dashboard`. Each was its own answer to
 * the same question, so a session holding no A+ membership was sent to a
 * surface its own `surfaceGuard` would immediately bounce, and `/home`, the
 * never-strand door, was reachable only by typing the URL. Every one of those
 * sites now asks this service instead.
 *
 * The rule: the first surface the session both HOLDS (membership axis) and can
 * ENTER (add-on axis), A+ first; `/home` when there is no such surface. The
 * `returnUrl` a user was deep-linked from still wins where a call site has one
 * to consume: this answers only the "nothing else claimed this session" case.
 */
@Injectable({ providedIn: 'root' })
export class LandingService {
  private readonly rbac = inject(RbacService);
  private readonly flags = inject(FeatureFlagService);
  private readonly tenantContext = inject(TenantContextService);

  /**
   * Where this session lands. Always returns a route: never null, never a
   * surface the session cannot enter, and never a route that redirects back
   * out (loop-safety comes from composing the add-on axis, exactly as
   * `firstAccessibleSurfaceLanding` does for the guard).
   *
   * Synchronous signal reads only, so a caller can navigate on the same tick
   * without waiting on a flag load.
   */
  landingRoute(): string {
    return resolveLandingRoute(this.visibleSurfaces(), this.flags, this.rbac);
  }

  /**
   * The membership-axis surface set, with the ADR-165 operator widening the
   * guard applies synchronously before anything else. Without this an operator
   * whose mint carried no `surfaces[]` would land on the no-surface door while
   * being the one principal every guard waves through, which reads as a bug in
   * whichever of the two you happen to be looking at.
   */
  private visibleSurfaces(): ReadonlySet<SurfaceKey> {
    if (this.rbac.hasRole('platform_operator')) {
      return new Set<SurfaceKey>(ALL_SURFACE_KEYS);
    }
    return resolveVisibleSurfaces(
      this.tenantContext.currentTenant(),
      this.tenantContext.availableTenants(),
      { onEmpty: LANDING_EMPTY_MODE },
    );
  }
}
