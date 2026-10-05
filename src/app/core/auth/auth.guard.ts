import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { ReturnUrlService } from '../services/return-url.service';
import { TenantContextService } from './tenant-context.service';

/**
 * Auth guard — blocks unauthenticated users.
 *
 * The session JWT lives in memory only (the gateway mints no refresh
 * tokens in this milestone), so a cold load is always unauthenticated:
 * `silentRefresh()` resolves `false` and the guard sends the user to
 * `/login` with a returnUrl.
 *
 * Tenant routing for authenticated users (precedence order):
 *  1. Zero tenant memberships (empty `tenantId`) → `/welcome/no-organisation`,
 *     a named refusal. `/login` would loop because re-auth still yields no
 *     membership. Post ADR-182 this state is a fault, not onboarding.
 *  2. More than one membership with no tenant selected yet
 *     (`currentTenant() === null`) → `/select-tenant` — first-login
 *     tenant chooser. This is a redirect-once effect: once a tenant is
 *     selected (`currentTenant()` set) the guard allows through.
 *  3. Exactly one membership, or a tenant already selected → allow.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const returnUrl = inject(ReturnUrlService);
  const tenantContext = inject(TenantContextService);

  // Fast path: already authenticated in-memory.
  if (auth.isAuthenticated()) {
    return resolveAuthedUser(auth, router, tenantContext);
  }

  // Not yet authenticated in-memory. Attempt a silent re-mint before
  // deciding — a no-op today (no persisted credential, no refresh token),
  // kept so the guard keeps working if the milestone ever adds one.
  await firstValueFrom(auth.silentRefresh());

  if (auth.isAuthenticated()) {
    return resolveAuthedUser(auth, router, tenantContext);
  }

  returnUrl.capture(state.url);
  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};

/**
 * For an authenticated user, resolve the tenant routing precedence:
 * no-tenant onboarding > first-login tenant picker > allow.
 */
function resolveAuthedUser(
  auth: AuthService,
  router: Router,
  tenantContext: TenantContextService,
): boolean | UrlTree {
  // 1. No tenant membership at all. Highest precedence, and since ADR-182 a
  //    FAULT rather than an onboarding state: resolve_handler.go 3b auto-enrols
  //    a zero-membership GCID into chora-master and re-lists, so an empty list
  //    means the enrol or the tenancy read failed upstream. The old
  //    destination was a join-by-code form whose only outcome was 409
  //    already-member, which told the user nothing about the real failure.
  const tenantId = auth.user()?.tenantId;
  if (!tenantId) {
    return router.createUrlTree(['/welcome/no-organisation']);
  }

  // 2. Multiple memberships and none selected yet — first-login picker.
  if (
    tenantContext.availableTenants().length > 1 &&
    tenantContext.currentTenant() === null
  ) {
    return router.createUrlTree(['/select-tenant']);
  }

  // 3. Single membership, or a tenant already selected — allow through.
  return true;
}
