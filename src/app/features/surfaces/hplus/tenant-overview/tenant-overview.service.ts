/**
 * TenantOverviewService — H+ tenant-overview provider (Phyllis demo Step 2).
 *
 * Wired LIVE 2026-05-15 (A7 RESOLVED, BE round-10, `chora-tenancy:7b006fee`):
 * calls the real BFF route `GET /api/tenants/{id}` → chora-tenancy. The
 * tenant id comes from the ChoraSession HS256 JWT (`tenant_id` claim) via
 * `AuthService.user().tenantId` — never trusted from a route param.
 *
 * Exposes a signal-backed `AsyncState` discriminated union (`state`:
 * loading / success / error) so the component renders a fail-loud banner
 * instead of hanging on the loading branch when the BFF returns 5xx, plus
 * a convenience `tenant` selector. `load()` is idempotent — re-call it for
 * the retry CTA. No mock fallback — the wave-1 hardcoded `tenant` object
 * has been deleted (no-stubs / no-debts directive 2026-05-14).
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, map, of, take } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  TenantOverview,
  TenantOverviewState,
} from './tenant-overview.model';

@Injectable({ providedIn: 'root' })
export class TenantOverviewService {
  private readonly bff = inject(BffClientService);

  private readonly _state = signal<TenantOverviewState>({ status: 'loading' });
  readonly state = this._state.asReadonly();

  /** Convenience selector: the tenant when success, else `null`. */
  readonly tenant = computed<TenantOverview | null>(() => {
    const s = this._state();
    return s.status === 'success' ? s.tenant : null;
  });

  /**
   * Fetch the tenant overview and publish to `state`. Called by the
   * component constructor + by the retry CTA. Safe to call repeatedly.
   */
  load(tenantId: string): void {
    this._state.set({ status: 'loading' });
    this.bff
      .get<TenantOverview>('/api/tenants/' + encodeURIComponent(tenantId))
      .pipe(
        take(1),
        map(
          (tenant): TenantOverviewState => ({
            status: 'success',
            tenant,
          }),
        ),
        catchError((err: unknown) =>
          of<TenantOverviewState>({
            status: 'error',
            error: this.errorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._state.set(s));
  }

  private errorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 404) return 'hplus.tenant.error_not_found';
      if (e.status >= 500) return 'hplus.tenant.error_upstream';
      if (e.status === 401 || e.status === 403) {
        return 'hplus.tenant.error_unauthorised';
      }
    }
    return 'hplus.tenant.error_generic';
  }
}
