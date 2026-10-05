import { CanActivateFn } from '@angular/router';

/**
 * Always allows navigation. Used on public routes where auth is optional.
 * Components in these routes inject AuthService directly to adapt UI
 * (e.g., showing "Dashboard" link vs "Sign Up" CTA).
 */
export const optionalAuthGuard: CanActivateFn = () => true;
