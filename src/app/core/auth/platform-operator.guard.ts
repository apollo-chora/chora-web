import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RbacService } from '../services/rbac.service';

/**
 * Platform-operator route guard (auth-hardening Phase A §4.7d,
 * CHO-1717 / ADR-181 + ADR-165).
 *
 * Allows activation only when the session JWT `roles[]` includes
 * `platform_operator` — compared case-insensitively via
 * `RbacService.hasRole`, since the mint may forward the lowercase
 * membership form or the canonical `PLATFORM_OPERATOR`. Used by the H+
 * Setup-Tenant wizard route (private tenant creation is operator-only
 * per the locked Phase-A ruling #5). Non-operators are redirected to
 * `/unauthorized`, matching `roleGuard`'s fail-closed behaviour.
 */
export const platformOperatorGuard: CanActivateFn = () => {
  const rbac = inject(RbacService);
  const router = inject(Router);

  if (rbac.hasRole('platform_operator')) {
    return true;
  }

  return router.createUrlTree(['/unauthorized']);
};
