/**
 * BootstrapTenantService — H+ Setup-Tenant Phase 4 MVP (CHO-1642).
 *
 * Single-method service that wraps `POST /api/v1/tenants/bootstrap`
 * (chora-gateway BFF; aggregator forwards to chora-tenancy per
 * CHO-1632). Surfaces a discriminated `BootstrapTenantResult` so the
 * form component stays out of HTTP minutiae and switches on `kind`.
 *
 * Per chora-web/CLAUDE.md §3 (BFF-only): goes through BffClientService,
 * never HttpClient directly, never fetch.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { BffClientService } from '../../../core/services/bff-client.service';
import { errorMessageOf, httpErrorView } from '../../../core/interceptors/api-error.model';
import {
  BOOTSTRAP_TENANT_PATH,
  BootstrapTenantResponse,
  BootstrapTenantResult,
} from './bootstrap-tenant.model';

@Injectable({ providedIn: 'root' })
export class BootstrapTenantService {
  private readonly bff = inject(BffClientService);

  /**
   * Bootstrap a tenant for the calling user (GCID taken from the JWT
   * by the BFF — NEVER from the body). Returns a discriminated union
   * so the caller can switch instead of catching.
   *
   * `name` is trimmed before sending; the BFF + chora-tenancy domain
   * layer enforce the 3-256 char rule per OpenAPI v1.3.0.
   */
  bootstrap(rawName: string): Observable<BootstrapTenantResult> {
    const name = rawName.trim();
    return this.bff
      .post<BootstrapTenantResponse>(BOOTSTRAP_TENANT_PATH, { name })
      .pipe(
        map((response): BootstrapTenantResult => ({ kind: 'success', response })),
        catchError((err: unknown) => of(this.classify(err))),
      );
  }

  private classify(err: unknown): BootstrapTenantResult {
    // httpErrorView, not `instanceof HttpErrorResponse`: the global
    // errorInterceptor rethrows every failure as ApiError, so the instanceof
    // matched only in specs and these switches were unreachable in the app.
    const view = httpErrorView(err);
    if (!view) {
      return { kind: 'network-error' };
    }
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
      case 403:
        return { kind: 'unauthenticated' };
      case 409:
        return { kind: 'already-member' };
      case 400:
      case 422: {
        // Surface the upstream message when present so the form can
        // render a useful inline error. The BFF envelope is
        // `{ error: { code, message } }` per chora-gateway's
        // v2WriteError helper; we defensively fall back when it isn't.
        const message = errorMessageOf(view) ?? 'Tenant name is invalid.';
        return { kind: 'invalid-name', message };
      }
      default:
        if (view.status >= 500 && view.status < 600) {
          return { kind: 'server-error' };
        }
        return { kind: 'server-error' };
    }
  }
}
