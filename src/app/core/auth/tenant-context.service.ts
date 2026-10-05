import { Injectable, signal, computed, inject, Injector } from '@angular/core';
import { Observable } from 'rxjs';

export interface TenantContext {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  /**
   * Per-membership metadata carried inline from the mint response after
   * the Stage-2 cutover (2026-05-14). Optional so legacy
   * `/api/v1/tenants` round-trip results remain assignable.
   */
  roles?: string[];
  surfaces?: string[];
  isDefault?: boolean;
}

/**
 * Minimal structural type for the slice of `AuthService` this service
 * needs. Declared locally to avoid a static import of `AuthService`,
 * which would create a DI + module cycle (AuthService already depends
 * on TenantContextService).
 */
interface MintCapableAuth {
  mintWithActiveTenant(tenantId: string): Observable<void>;
}

/**
 * localStorage key for the persisted active tenant id (replayed on cold
 * load so a third-party redirect — Stripe checkout return, OIDC callback,
 * hard refresh after a tenant switch — doesn't fall back to the BE's
 * default-ordering pick).
 *
 * NOT a credential: the id is a membership hint only. The mint endpoint
 * re-validates membership server-side (chora-gateway `isResolveMemberOf`)
 * and silently falls back to the default tenant if the caller is not a
 * member, so a tampered value cannot widen access.
 */
const ACTIVE_TENANT_STORAGE_KEY = 'chora_active_tenant_id';

@Injectable({ providedIn: 'root' })
export class TenantContextService {
  // Lazily resolved to break the AuthService <-> TenantContextService
  // dependency cycle. AuthService injects TenantContextService at
  // construction; TenantContextService only needs AuthService at the
  // moment `switchTenant` is invoked.
  private readonly injector = inject(Injector);

  private readonly _currentTenant = signal<TenantContext | null>(null);
  private readonly _availableTenants = signal<TenantContext[]>([]);

  readonly currentTenant = this._currentTenant.asReadonly();
  readonly availableTenants = this._availableTenants.asReadonly();
  readonly tenantId = computed(() => this._currentTenant()?.id ?? null);

  setCurrentTenant(tenant: TenantContext): void {
    this._currentTenant.set(tenant);
    // Persist so a cold load can replay the right active_tenant_id to the
    // mint request. Best-effort: a storage failure must never block the
    // in-memory switch.
    try {
      localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, tenant.id);
    } catch {
      // localStorage unavailable (private-mode quirk) — silently ignore;
      // the only consequence is the BE picks its default on the next mint.
    }
  }

  setAvailableTenants(tenants: TenantContext[]): void {
    this._availableTenants.set(tenants);
  }

  /**
   * Read-only accessor for the persisted active tenant id (null when
   * nothing has been stored or storage is unavailable). Retained for the
   * mint request's `active_tenant_id` hint; a cold load no longer
   * re-mints (no refresh tokens in this milestone), so the value is
   * informational until a re-authentication happens.
   */
  readPersistedActiveTenantId(): string | null {
    try {
      return localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  /** Clear the persisted id on logout so the next user lands fresh. */
  clearPersistedActiveTenantId(): void {
    try {
      localStorage.removeItem(ACTIVE_TENANT_STORAGE_KEY);
    } catch {
      // ignore — same rationale as set.
    }
  }

  /**
   * Switch the active tenant by re-minting a Chora session scoped to
   * `tenantId`. Delegates to `AuthService.mintWithActiveTenant`.
   *
   * NOT SUPPORTED in this milestone: the gateway mints from
   * username/password only (no tenant-switch route, no refresh token),
   * and the JWT's `tenant_id` claim is authoritative — the frontend must
   * not invent or override a tenant. The call fails loudly with an error
   * telling the user to sign out and sign in again.
   *
   * `AuthService` is resolved lazily via the injector to avoid a
   * construction-time circular dependency.
   */
  switchTenant(tenantId: string): Observable<void> {
    // Local require-style import path: resolve the token at call time.
    // The token is the AuthService class; importing it for `inject()`
    // here (inside the method body) does not create a module-load
    // cycle because it is only referenced lazily.

    const auth = this.injector.get<MintCapableAuth>(AUTH_SERVICE_TOKEN);
    return auth.mintWithActiveTenant(tenantId);
  }
}

// Re-export of the AuthService injection token resolved lazily. Imported
// at module scope but only *used* inside `switchTenant`, so Angular's DI
// graph sees no construction-time cycle.
import { AuthService as AUTH_SERVICE_TOKEN } from './auth.service';
