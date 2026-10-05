import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RbacService } from '../services/rbac.service';

export const roleGuard = (capability: string): CanActivateFn => {
  return () => {
    const rbac = inject(RbacService);
    const router = inject(Router);

    if (rbac.hasCapability(capability)) {
      return true;
    }

    return router.createUrlTree(['/unauthorized']);
  };
};
