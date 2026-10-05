import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { BffClientService } from '../services/bff-client.service';
import { FeatureFlagService } from '../services/feature-flag.service';
import type { FeatureFlagsResponse } from '../services/feature-flags.model';
import { TenantContextService, TenantContext } from './tenant-context.service';
import { AuthTokenResponse, ResolveTenantMembership } from './auth.models';
import { capabilitiesForRoles } from './role-capabilities';

export interface AuthUser {
  gcid: string;
  tenantId: string;
  roles: string[];
  capabilities: string[];
  displayName: string;
  email: string;
}

interface JwtClaims {
  sub: string;
  gcid: string;
  email: string;
  display_name: string;
  tenant_id: string;
  roles: string[];
  /**
   * Human-readable summary of the active role set. Present in the
   * ChoraSession HS256 JWT after the Stage-2 cutover (2026-05-14).
   */
  role_summary?: string;
  exp: number;
}

/**
 * Wire shape of `GET /api/v1/tenants/me` (chora-gateway `GetMyTenantV1`
 * → chora-tenancy pg-backed `MeTenantHandler`, CHO-1692). Only the
 * fields the WP-6 branding hydration consumes are declared. NOTE:
 * `branding.logo_url` is a Go string upstream, so an UNSET logo arrives
 * as `""` — map empty to `null`, never render an empty img src.
 */
interface TenantMeResponse {
  id?: string;
  display_name?: string;
  slug?: string;
  branding?: {
    logo_url?: string | null;
    primary_color_hex?: string | null;
    custom_domain?: string | null;
  };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly bff = inject(BffClientService);
  private readonly router = inject(Router);
  private readonly tenantContext = inject(TenantContextService);
  private readonly featureFlags = inject(FeatureFlagService);

  private readonly _user = signal<AuthUser | null>(null);
  private readonly _token = signal<string | null>(null);

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly gcid = computed(() => this._user()?.gcid ?? null);

  setUser(user: AuthUser, token: string): void {
    this._user.set(user);
    this._token.set(token);
  }

  clearAuth(): void {
    this._user.set(null);
    this._token.set(null);
    // Drop the persisted active tenant id so the next signed-in user on this
    // browser doesn't inherit the previous user's pre-redirect tenant.
    this.tenantContext.clearPersistedActiveTenantId();
    // Same reason, one layer up: the add-on entitlements are the OUTGOING
    // tenant's, so holding them past the session hands the next sign-in on a
    // shared browser gates that tenant never bought, for the whole window
    // until its own `GET /api/feature-flags` returns. Cleared here rather than
    // in `logout()` because this is the single place a session is dropped:
    // both arms of `logout()` come through here, and so does the interceptor
    // when a refresh cannot mint.
    this.featureFlags.clear();
  }

  getToken(): string | null {
    return this._token();
  }

  /**
   * Refresh the cached profile (`displayName`, `email`) from the BE.
   * Useful when another caller (admin H+ Members editor) mutates the
   * user's display_name while the session JWT still carries the stale
   * value. Best-effort + non-blocking: a failed fetch leaves the cached
   * profile in place rather than throwing into the consumer.
   */
  refreshProfile(): void {
    if (!this._user()) return;
    this.bff
      .get<{ gcid: string; email: string; display_name: string }>('/api/me')
      .subscribe({
        next: (me) => {
          this._user.update((u) =>
            u ? { ...u, email: me.email, displayName: me.display_name } : u,
          );
        },
        error: () => {
          // Silent — keep the cached profile.
        },
      });
  }

  /**
   * Bootstrap auth on app start (and recover from a 401 via the
   * `authInterceptor`'s `handle401` path).
   *
   * The session JWT is held in memory only — the gateway mints no refresh
   * tokens in this milestone, so there is nothing to silently restore.
   * Always resolves `false`; callers fall through to the unauth path.
   */
  initialize(): Observable<boolean> {
    return this.silentRefresh();
  }

  /**
   * No-op in the username/password world: the Chora session exists only in
   * memory for the lifetime of the page load. There is no persisted
   * credential to re-mint from and no refresh token to exchange, so a
   * cold load (or a 401) always lands the user back on /login.
   */
  silentRefresh(): Observable<boolean> {
    return of(false);
  }

  handleAuthResponse(response: AuthTokenResponse): void {
    const claims = this.decodeJwtClaims(response.access_token);
    if (!claims) {
      return;
    }

    const roles = claims.roles ?? [];
    const user: AuthUser = {
      gcid: claims.gcid ?? claims.sub,
      email: claims.email,
      displayName: claims.display_name,
      tenantId: claims.tenant_id,
      roles,
      // Static role → capability mapping (`core/auth/role-capabilities.ts`)
      // until the BFF mint endpoint emits an explicit `capabilities[]`.
      // Source-of-truth for role names: chora-identity CanonicalRoles
      // (ADR-141 + ADR-165 adding PLATFORM_OPERATOR).
      capabilities: capabilitiesForRoles(roles),
    };

    this._user.set(user);
    this._token.set(response.access_token);

    if (claims.tenant_id) {
      this.tenantContext.setCurrentTenant({
        id: claims.tenant_id,
        name: '',
        slug: '',
        logoUrl: null,
      });
    }

    // Stage-2 cutover: the mint response now carries `memberships[]`
    // inline. When present, seed TenantContextService directly and skip
    // the legacy `/api/v1/tenants` round-trip. The round-trip remains a
    // fallback for legacy / refresh responses that omit `memberships`.
    if (response.memberships !== undefined) {
      const memberships = this.mapMembershipsToTenantContext(response.memberships);
      this.tenantContext.setAvailableTenants(memberships);
      // Re-seed the ACTIVE tenant from its membership so the context
      // carries the slug as a baseline name (not the blank-name JWT seed
      // above) even when the branding hydration below fails or has not
      // resolved yet (CHO-1709 WP-6).
      const activeMembership = memberships.find((m) => m.id === claims.tenant_id);
      if (activeMembership) {
        this.tenantContext.setCurrentTenant(activeMembership);
      }
    } else {
      this.loadAvailableTenants();
    }

    // CHO-1709 WP-6: mint memberships carry slug only — fetch the active
    // tenant's real display name + logo (non-blocking side-effect).
    if (claims.tenant_id) {
      this.hydrateActiveTenantBranding();
    }

    this.loadFeatureFlags();
  }

  /**
   * Re-mint a Chora session scoped to `tenantId`.
   *
   * NOT SUPPORTED in this milestone and fails loudly: the gateway's mint
   * endpoint takes username/password only (no tenant-switch route, no
   * refresh token), and the JWT's `tenant_id` claim is authoritative —
   * the frontend must not invent or override a tenant. Switching tenants
   * therefore requires signing out and signing in again; the
   * tenant-switcher UI hides itself when it cannot offer a real switch.
   */
  mintWithActiveTenant(tenantId: string): Observable<void> {
    return throwError(
      () =>
        new Error(
          `Tenant switch to ${tenantId} is not available: the gateway mints ` +
            'sessions from username/password only (no tenant-switch route, no ' +
            'refresh token). Sign out and sign in again to change tenants.',
        ),
    );
  }

  logout(): void {
    this.bff.post('/api/v1/auth/logout', {}).subscribe({
      complete: () => {
        this.clearAuth();
        this.router.navigate(['/login']);
      },
      error: () => {
        this.clearAuth();
        this.router.navigate(['/login']);
      },
    });
  }

  private mapMembershipsToTenantContext(
    memberships: ResolveTenantMembership[],
  ): TenantContext[] {
    return memberships.map((m) => ({
      id: m.tenant_id,
      // The mint `memberships[]` carries no human display name — only the
      // slug. Use the slug as the display name so every TenantContext
      // consumer (tenant-switcher, tenant-picker, select-tenant) renders
      // something rather than a blank. Replace with a real display name
      // if/when the mint response carries one.
      name: m.tenant_slug,
      slug: m.tenant_slug,
      logoUrl: null,
      roles: m.roles,
      surfaces: m.surfaces,
      isDefault: m.is_default,
    }));
  }

  private loadAvailableTenants(): void {
    this.bff
      .get<{ data: { id: string; name: string; subdomain: string; branding?: { logo_url?: string | null } }[] }>(
        '/api/v1/tenants',
      )
      .subscribe({
        next: (response) => {
          const tenants: TenantContext[] = (response.data ?? []).map((t) => ({
            id: t.id,
            name: t.name,
            slug: t.subdomain,
            logoUrl: t.branding?.logo_url ?? null,
          }));
          this.tenantContext.setAvailableTenants(tenants);
        },
        error: () => { /* silent: non-blocking side-effect */ },
      });
  }

  /**
   * Post-mint branding hydration (CHO-1709 WP-6): patch the ACTIVE
   * TenantContext's human-facing identity (display name + logo) from
   * `GET /api/v1/tenants/me`. The mint `memberships[]` carry slug only,
   * so without this round-trip the shell renders the literal slug as
   * the tenant name (§2-F) and never a logo.
   *
   * Best-effort + non-blocking: a failed hydration logs and keeps the
   * slug-named context — it must NEVER throw into the auth flow.
   */
  private hydrateActiveTenantBranding(): void {
    this.bff.get<TenantMeResponse>('/api/v1/tenants/me').subscribe({
      next: (me) => {
        const active = this.tenantContext.currentTenant();
        // Stale-response guard: a tenant switch may have re-seeded the
        // context while this request was in flight — only patch the
        // tenant this response describes.
        if (!active || (me.id !== undefined && me.id !== active.id)) {
          return;
        }
        const displayName = me.display_name?.trim();
        const logoUrl = me.branding?.logo_url?.trim();
        this.tenantContext.setCurrentTenant({
          ...active,
          name: displayName || active.slug || me.slug?.trim() || active.name,
          logoUrl: logoUrl || null,
        });
      },
      error: (err: unknown) => {
        // Non-blocking side-effect: keep the slug-named context.
        console.warn(
          '[auth] active-tenant branding hydration failed: keeping slug context',
          err,
        );
      },
    });
  }

  /**
   * Load the active tenant's `TenantEntitlement[]` (the feature-flag set)
   * and seed `FeatureFlagService`. Wired LIVE 2026-05-15 to
   *   GET /api/feature-flags
   * (A7 RESOLVED, BE round-10) — RLS-scoped to the JWT `tenant_id` claim,
   * so the FE never sends a tenant param. The legacy
   * `/api/v1/tenants/{tenantId}/feature-flags` path returned 404; replaced
   * here with the real flat route + the real `{items, total}` envelope.
   *
   * Errors are deliberately silent here (the call is a post-mint
   * side-effect that must not block sign-in); the fail-loud surface for
   * mis-loaded flags is each consumer of `FeatureFlagService.isEnabled` /
   * `hasEntitlement` returning `false` honestly.
   */
  private loadFeatureFlags(): void {
    const tenantId = this._user()?.tenantId;
    if (!tenantId) {
      // No tenant context → no entitlements to fetch, but resolve the loaded
      // gate so an (unexpected) guard awaiting flags doesn't hang.
      this.featureFlags.markLoaded();
      return;
    }

    // Reset the gate so add-on guards wait for THIS tenant's flags (covers
    // the post-mint + tenant-switch race that otherwise redirects an entitled
    // user before GET /api/feature-flags returns).
    this.featureFlags.beginLoad();
    this.bff.get<FeatureFlagsResponse>('/api/feature-flags').subscribe({
      next: (response) => {
        this.featureFlags.setEntitlements(response.items ?? []);
      },
      // Silent (non-blocking side-effect) but still resolve the loaded gate —
      // a failed fetch must not strand guards waiting forever.
      error: () => {
        this.featureFlags.markLoaded();
      },
    });
  }

  private decodeJwtClaims(token: string): JwtClaims | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }
      const payload = parts[1];
      const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      // `atob` yields one character per BYTE, so handing it to JSON.parse
      // reads the payload's UTF-8 bytes as Latin-1 characters and mangles
      // every name outside ASCII (Chinese, Tamil and Arabic are three of the
      // five shipped locales). Widen the bytes back out and decode them as
      // the UTF-8 they are.
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes)) as JwtClaims;
    } catch {
      return null;
    }
  }
}
