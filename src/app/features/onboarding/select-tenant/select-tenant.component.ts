/**
 * SelectTenantComponent — first-login tenant chooser.
 *
 * Route: /select-tenant (under AuthLayout — NOT behind authGuard; the
 * authGuard itself redirects here when a user has >1 membership and no
 * tenant selected yet).
 *
 * Renders the shared `TenantPickerComponent` bound to
 * `TenantContextService.availableTenants()`. On selection it re-mints a
 * Chora session scoped to the chosen tenant via
 * `TenantContextService.switchTenant` (→ `AuthService.mintWithActiveTenant`
 * → `POST /api/v1/auth/session/mint` with `active_tenant_id`) and, on
 * success, navigates to wherever the landing resolver sends this session.
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TenantContextService } from '../../../core/auth/tenant-context.service';
import { LandingService } from '../../../core/auth/landing.service';
import { TenantPickerComponent } from '../../../shared/components/tenant-picker/tenant-picker.component';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

// The `AUTHED_HOME_ROUTE = '/a/dashboard'` constant was DELETED here (C2
// slice 3, ADR-240). Its doc comment claimed to match the root redirect in
// `app.routes.ts`, and the moment that redirect started asking the landing
// resolver the claim became false: a tenant just switched INTO may not even
// carry A+. This screen now asks the same resolver every other landing site
// asks, which is the only way the claim can stay true without being rechecked
// by hand. This site was NOT in the ADR-240 census of seven; it was found by
// following the constant's own comment.

@Component({
  selector: 'chora-select-tenant',
  standalone: true,
  imports: [TenantPickerComponent, TranslatePipe],
  templateUrl: './select-tenant.component.html',
  styleUrl: './select-tenant.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectTenantComponent {
  private readonly tenantContext = inject(TenantContextService);
  private readonly router = inject(Router);
  private readonly landing = inject(LandingService);

  /** Memberships resolved at mint-time — bound straight to the picker. */
  readonly memberships = this.tenantContext.availableTenants;

  /** True while a re-mint round-trip is in flight. */
  readonly switching = signal(false);

  /** True when the last re-mint attempt failed. */
  readonly errored = signal(false);

  /**
   * Handle a tenant selection: re-mint scoped to `tenantId`, then
   * navigate to the resolved landing on success or surface an inline error
   * on failure.
   */
  onSelect(tenantId: string): void {
    this.errored.set(false);
    this.switching.set(true);
    this.tenantContext.switchTenant(tenantId).subscribe({
      next: () => {
        this.switching.set(false);
        this.router.navigate([this.landing.landingRoute()]);
      },
      error: () => {
        this.switching.set(false);
        this.errored.set(true);
      },
    });
  }
}
