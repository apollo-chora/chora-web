import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { RbacService } from '../services/rbac.service';

/**
 * ADR-239 D3 (CHO-2234): per-role route narrowing inside R+.
 *
 * Mounted as `canActivateChild` on the `/r` route group, AFTER
 * `surfaceGuard('rplus')` has admitted the session to the surface. The exam
 * route family stays reachable by the whole R+ surface population (Exam
 * Administration is every R+ inhabitant's business, and the exam-ops-only
 * PROCTOR persona has nothing else); every other child route requires the
 * `delivery:ops` capability (granted to instructor, the paired
 * training_admin label, the tenant-admin family and platform_operator via
 * ROLE_CAPABILITIES). Fail-closed: unmet, or a child with no route config,
 * redirects to /unauthorized, matching roleGuard's contract.
 *
 * This closes the URL-bar variant of the CHO-2200 "no tab leak" row for an
 * exam-ops-only session, the same way CHO-1801 closed the surface-shell
 * leak at the surface boundary. It deliberately does NOT replace the
 * per-route `roleGuard('assessment:author')` / `roleGuard('course:author')`
 * gates on the authoring routes: guards compose, and the authoring gates
 * stay the stricter authority on their routes.
 *
 * The ADR-191 content embargo (RESTRICTIVE RLS + 403 at the content
 * boundary) is untouched: this guard is navigation hygiene, not content
 * security.
 */

/**
 * Route-config paths under `/r` reachable WITHOUT `delivery:ops`.
 * Matched against `ActivatedRouteSnapshot.routeConfig.path` (the exact
 * config string, never a URL regex). Extend ONLY alongside ADR-239 (a new
 * exam-family child route added in W4 belongs here; anything else does not).
 */
export const RPLUS_OPS_EXEMPT_PATHS: ReadonlySet<string> = new Set(['exams', 'exams/:id']);

export const rplusOpsGuard: CanActivateChildFn = (childRoute) => {
  const rbac = inject(RbacService);
  const router = inject(Router);

  const path = childRoute.routeConfig?.path;
  if (path !== undefined && RPLUS_OPS_EXEMPT_PATHS.has(path)) {
    return true;
  }
  if (rbac.hasCapability('delivery:ops')) {
    return true;
  }
  return router.createUrlTree(['/unauthorized']);
};
