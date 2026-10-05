/**
 * H+ Tenant Overview — Phyllis demo Step 2 landing.
 *
 * Wired LIVE 2026-05-15 to `GET /api/tenants/{id}` via TenantOverviewService.
 * Mr. Chen (MTM Singapore tenant admin) lands here after login. Renders the
 * REAL chora-tenancy DTO honestly: display_name, status, tenant id (GCID-pill
 * shape), branding_config.tagline, branding_config.primary_color (applied as
 * an accent CSS variable on the host), self_hosted, parent_tenant_id (when
 * non-empty), and the created_at/updated_at metadata strip.
 *
 * The wave-1 hardcoded sections (`members count`, `Tenant Add-Ons`, IdP
 * federation rows, billing snapshot, Go-Live CTA) have been DELETED — none
 * of those fields are returned by `/api/tenants/{id}`, and the no-stubs /
 * no-debts directive (2026-05-14) forbids inventing them. Each of those
 * concerns has its own dedicated H+ sub-route (`/h/members`, `/h/addons`,
 * `/h/idp`, `/h/billing`); the tenant landing surfaces them as a navigation
 * tile grid, not as fake data.
 *
 * The tenant id comes from `AuthService.user().tenantId` (the ChoraSession
 * HS256 JWT `tenant_id` claim) — never trusted from a route param. The
 * page itself does NOT carry a `:tenantId` route segment.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../../core/auth/auth.service';
import { RbacService } from '../../../../core/services/rbac.service';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TenantOverviewService } from './tenant-overview.service';
import type { TenantOverview } from './tenant-overview.model';

@Component({
  selector: 'chora-h-tenant-overview',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tenant-overview.component.html',
  styleUrl: './tenant-overview.component.scss',
})
export class TenantOverviewComponent {
  private readonly auth = inject(AuthService);
  private readonly rbac = inject(RbacService);
  private readonly tenantService = inject(TenantOverviewService);

  /**
   * Setup-Tenant wizard tile visibility — PLATFORM_OPERATOR only
   * (auth-hardening Phase A §4.7d, CHO-1717 / ADR-181 ruling #5).
   * Case-insensitive role-claim check; re-evaluates on session change
   * because `hasRole` reads the `user()` signal inside this computed.
   */
  readonly canSeeSetupWizard = computed<boolean>(() =>
    this.rbac.hasRole('platform_operator'),
  );

  /** Fail-loud discriminated state from the service (loading/success/error). */
  readonly state = this.tenantService.state;
  readonly isLoading = computed<boolean>(
    () => this.state().status === 'loading',
  );
  readonly isError = computed<boolean>(() => this.state().status === 'error');
  readonly errorKey = computed<string>(() => {
    const s = this.state();
    return s.status === 'error' ? s.error : '';
  });

  /** Success-state tenant (or `null`). */
  readonly tenant = this.tenantService.tenant;

  /** Whether the tenant is in the `active` lifecycle state. */
  readonly isActive = computed<boolean>(
    () => this.tenant()?.status === 'active',
  );

  /** Two-letter logo monogram derived from `display_name`. */
  readonly initials = computed<string>(() => {
    const name = this.tenant()?.display_name ?? '';
    return monogramFromName(name);
  });

  /**
   * The tenant id from the ChoraSession JWT — the authoritative source of
   * truth for which tenant this admin landed on. Re-runs the load if the
   * JWT changes (e.g. tenant switch via TenantContextService).
   */
  constructor() {
    effect(() => {
      const tenantId = this.auth.user()?.tenantId ?? '';
      if (tenantId) {
        this.tenantService.load(tenantId);
      }
    });
  }

  /** Retry CTA — re-fires the tenant-overview BFF call. */
  retry(): void {
    const tenantId = this.auth.user()?.tenantId ?? '';
    if (tenantId) {
      this.tenantService.load(tenantId);
    }
  }

  // ── Display helpers (host-style binding from real DTO) ───────────────
  /** Inline-style accent override sourced from `branding_config.primary_color`. */
  accentStyle(t: TenantOverview | null): Record<string, string> {
    const colour = t?.branding_config.primary_color ?? '';
    if (!colour) return {};
    return { '--chora-tenant-accent': colour };
  }
}

function monogramFromName(name: string): string {
  if (!name) return '?';
  const words = name
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 3);
  if (words.length === 0) return '?';
  return words
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 3);
}
