import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { environment } from '../../../environments/environment';

/**
 * WS-10 (platform UX remediation) — STATIC build-config route gate.
 *
 * A factory returning a `CanMatch` guard for one top-level `area`. If `area` is
 * listed in `environment.gatedAreas` (orphaned / i18n-empty / half-built areas
 * the owner ruled must NOT be reachable until finished + translated), the guard
 * returns a `UrlTree` redirect to `/not-found`; otherwise it returns `true`.
 *
 * CanMatch (not CanActivate) is deliberate: a non-match means the route is never
 * selected AND its lazy `loadChildren` chunk is never fetched — the area is
 * genuinely non-routable (it falls through to the `**` → not-found wildcard),
 * not merely access-denied after loading.
 *
 * This is a build-time gate keyed on the deployed bundle's `gatedAreas` — it is
 * intentionally DISTINCT from the entitlement-based `FeatureFlagService`
 * (per-tenant add-ons). `gatedAreas` is empty in `environment.local.ts` so devs
 * can preview in-progress areas locally. Compose by appending to a group's guard
 * array; it does not replace any existing `canActivate`/`canMatch`.
 */
export const featureReadyGuard = (area: string): CanMatchFn => {
  return () => {
    const router = inject(Router);

    if (environment.gatedAreas.includes(area)) {
      return router.parseUrl('/not-found');
    }

    return true;
  };
};
