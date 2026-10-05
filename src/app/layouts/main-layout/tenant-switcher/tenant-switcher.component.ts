import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  ElementRef,
  HostListener,
} from '@angular/core';
import { Router } from '@angular/router';
import { TenantContextService, TenantContext } from '../../../core/auth/tenant-context.service';
import { FeatureFlagService } from '../../../core/services/feature-flag.service';
import { RbacService } from '../../../core/services/rbac.service';
import { ToastService } from '../../../shared/components/toast/toast.service';
import {
  firstAccessibleSurfaceLanding,
  resolveVisibleSurfaces,
} from '../../../features/surfaces/surface-access';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';

/**
 * TenantSwitcherComponent — nav-bar dropdown for switching the active
 * tenant.
 *
 * `switchTenant` delegates to `TenantContextService.switchTenant` →
 * `AuthService.mintWithActiveTenant`. In this milestone that path is
 * DISABLED: the gateway mints from username/password only (no
 * tenant-switch route, no refresh token) and the JWT's `tenant_id`
 * claim is authoritative, so the frontend must not invent or override a
 * tenant. A switch attempt fails loudly and tells the user to sign out
 * and sign in again — the dropdown never silently no-ops.
 */
@Component({
  selector: 'chora-tenant-switcher',
  imports: [TranslatePipe],
  templateUrl: './tenant-switcher.component.html',
  styleUrl: './tenant-switcher.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantSwitcherComponent {
  private readonly tenantContext = inject(TenantContextService);
  private readonly router = inject(Router);
  private readonly flags = inject(FeatureFlagService);
  private readonly rbac = inject(RbacService);
  private readonly toast = inject(ToastService);
  private readonly elementRef = inject(ElementRef);

  readonly currentTenant = this.tenantContext.currentTenant;
  readonly availableTenants = this.tenantContext.availableTenants;
  readonly isOpen = signal(false);
  readonly isSwitching = signal(false);
  readonly activeIndex = signal(-1);
  readonly brokenLogos = signal<Set<string>>(new Set());

  /**
   * Active-tenant identity for the always-visible trigger (CHO-1709
   * WP-6). `activeName` is the hydrated display name (slug baseline
   * pre-hydration; '' pre-mint → name span not rendered).
   * `activeLogoUrl` renders only when the hydrated TenantContext
   * carries a logoUrl AND the image has not errored — otherwise the
   * generic domain glyph + name keep the block legible.
   */
  readonly activeName = computed(() => this.currentTenant()?.name ?? '');
  readonly activeLogoUrl = computed(() => {
    const tenant = this.currentTenant();
    return tenant?.logoUrl && !this.brokenLogos().has(tenant.id)
      ? tenant.logoUrl
      : null;
  });

  onLogoError(tenantId: string): void {
    this.brokenLogos.update(s => { const next = new Set(s); next.add(tenantId); return next; });
  }

  /** Broken active-tenant logo → fall back to icon + name in the trigger. */
  onActiveLogoError(): void {
    const tenant = this.currentTenant();
    if (tenant) {
      this.onLogoError(tenant.id);
    }
  }

  hasValidLogo(tenant: TenantContext): boolean {
    return !!tenant.logoUrl && !this.brokenLogos().has(tenant.id);
  }

  /**
   * Displayed roles per tenant row = per-membership `roles[]` from the mint
   * response, plus `platform_operator` when the session JWT carries it
   * (ADR-165 god-mode applies across every tenant, so the badge is shown on
   * every row when present). Empty/missing input collapses to []. The
   * session-level operator badge is appended last and de-duplicated.
   */
  displayRoles(tenant: TenantContext): readonly string[] {
    const base = tenant.roles ?? [];
    const isOperator = this.rbac.hasRole('platform_operator');
    if (!isOperator || base.includes('platform_operator')) {
      return base;
    }
    return [...base, 'platform_operator'];
  }

  toggle(): void {
    this.isOpen.update((open) => !open);
    if (this.isOpen()) {
      this.activeIndex.set(-1);
    }
  }

  close(): void {
    this.isOpen.set(false);
    this.activeIndex.set(-1);
  }

  /**
   * Switch the active tenant. Selecting the already-current tenant is a
   * no-op (just closes the dropdown). The re-mint path is disabled in
   * this milestone (see the class doc), so a real switch attempt fails
   * loudly: the dropdown stays open and a toast tells the user to sign
   * out and sign in again.
   */
  switchTenant(tenant: TenantContext): void {
    if (tenant.id === this.currentTenant()?.id) {
      this.close();
      return;
    }

    this.isSwitching.set(true);
    this.tenantContext.switchTenant(tenant.id).subscribe({
      next: () => {
        this.isSwitching.set(false);
        this.close();
        this.navigateToLanding();
      },
      error: () => {
        this.isSwitching.set(false);
        this.toast.show('tenant_switcher.switch_unavailable', 'info');
      },
    });
  }

  /**
   * Navigate to the first accessible surface landing for the freshly-
   * minted tenant context. Mirrors the surface guard's redirect rule
   * (`firstAccessibleSurfaceLanding`) so the rail, the guard, and this
   * post-switch navigation all agree on the destination. Silently no-ops
   * when no surface is reachable (the surface guard will land the user
   * on `/unauthorized` on their next route activation).
   */
  private navigateToLanding(): void {
    const visible = resolveVisibleSurfaces(
      this.currentTenant(),
      this.availableTenants(),
      { onEmpty: 'open-all' },
    );
    const landing = firstAccessibleSurfaceLanding(visible, this.flags, this.rbac);
    if (landing) {
      this.router.navigateByUrl(landing);
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    const tenants = this.availableTenants();
    if (!this.isOpen() || tenants.length === 0) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.activeIndex.update((i) => Math.min(i + 1, tenants.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex.update((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        event.preventDefault();
        if (this.activeIndex() >= 0 && this.activeIndex() < tenants.length) {
          this.switchTenant(tenants[this.activeIndex()]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.close();
    }
  }
}
