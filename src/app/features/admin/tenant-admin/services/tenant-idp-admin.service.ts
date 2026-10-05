/**
 * TenantIdpAdminService — H+ IdP Federation admin surface
 * (CHO-1694 Wave 4).
 *
 * Three methods wrapping the chora-identity BFF endpoints:
 *  - `list()`   → GET /api/v1/tenants/me/idp-providers
 *  - `upsert()` → POST /api/v1/tenants/me/idp-providers
 *  - `delete()` → DELETE /api/v1/tenants/me/idp-providers/{providerType}
 *
 * Each method returns a discriminated `IdpListResult` /
 * `IdpUpsertResult` / `IdpDeleteResult` so the `IdpFederationComponent`
 * stays out of HTTP minutiae and switches on `kind`.
 *
 * Per chora-web/CLAUDE.md §3 (BFF-only): all HTTP goes through
 * BffClientService, never HttpClient directly, never fetch.
 *
 * `client_secret` invariant: sent on upsert as `writeOnly` per the
 * OpenAPI contract; never present on the upsert response. The
 * `IdpProviderRow` type structurally omits the field so a hypothetical
 * future BE regression can't smuggle plaintext back through the
 * service.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  httpErrorView,
  type HttpErrorView,
} from '../../../../core/interceptors/api-error.model';
import {
  IDP_PROVIDERS_BASE_PATH,
  IdpDeleteResult,
  IdpListResult,
  IdpProviderListResponse,
  IdpProviderRow,
  IdpProviderUpsertPayload,
  IdpUpsertResult,
  ProviderType,
  idpProviderDeletePath,
} from '../models/tenant-idp-admin.model';

@Injectable({ providedIn: 'root' })
export class TenantIdpAdminService {
  private readonly bff = inject(BffClientService);

  list(): Observable<IdpListResult> {
    return this.bff
      .get<IdpProviderListResponse>(IDP_PROVIDERS_BASE_PATH)
      .pipe(
        map(
          (response): IdpListResult => ({
            kind: 'success',
            rows: response.items ?? [],
          }),
        ),
        catchError((err: unknown) => of(this.classifyList(err))),
      );
  }

  upsert(payload: IdpProviderUpsertPayload): Observable<IdpUpsertResult> {
    return this.bff
      .post<IdpProviderRow>(IDP_PROVIDERS_BASE_PATH, payload)
      .pipe(
        map(
          (row): IdpUpsertResult => ({ kind: 'success', row }),
        ),
        catchError((err: unknown) => of(this.classifyUpsert(err))),
      );
  }

  delete(providerType: ProviderType): Observable<IdpDeleteResult> {
    return this.bff
      .delete<void>(idpProviderDeletePath(providerType))
      .pipe(
        map((): IdpDeleteResult => ({ kind: 'success' })),
        catchError((err: unknown) => of(this.classifyDelete(err))),
      );
  }

  // ---------------------------------------------------------------------------
  // Error classification — discriminated results match the BE contract.
  // ---------------------------------------------------------------------------

  private classifyList(err: unknown): IdpListResult {
    // httpErrorView, not `instanceof HttpErrorResponse`: the global
    // errorInterceptor rethrows every failure as ApiError, so the instanceof
    // matched only in specs and these switches were unreachable in the app.
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
      case 403:
        return { kind: 'unauthenticated' };
      default:
        return { kind: 'server-error' };
    }
  }

  private classifyUpsert(err: unknown): IdpUpsertResult {
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    const upstreamMessage = this.extractMessage(view);
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
      case 403:
        return { kind: 'unauthenticated' };
      case 400:
      case 422:
        return {
          kind: 'invalid',
          message: upstreamMessage ?? 'IdP configuration failed validation.',
        };
      case 502: {
        const code = this.extractCode(view);
        if (code === 'secret_manager_failed') {
          return {
            kind: 'secret-manager-failed',
            message: upstreamMessage ?? 'Secret Manager write failed.',
          };
        }
        return { kind: 'server-error' };
      }
      default:
        return { kind: 'server-error' };
    }
  }

  private classifyDelete(err: unknown): IdpDeleteResult {
    const view = httpErrorView(err);
    if (!view) return { kind: 'network-error' };
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
      case 403:
        return { kind: 'unauthenticated' };
      case 404:
        return { kind: 'not-found' };
      case 400:
        return {
          kind: 'invalid',
          message:
            this.extractMessage(view) ?? 'Invalid provider_type segment.',
        };
      default:
        return { kind: 'server-error' };
    }
  }

  private extractMessage(view: HttpErrorView): string | undefined {
    const body = view.body as Record<string, unknown> | undefined;
    if (!body) return undefined;
    const direct = body['message'];
    if (typeof direct === 'string') return direct;
    const nested = (body['error'] as Record<string, unknown> | undefined)?.[
      'message'
    ];
    if (typeof nested === 'string') return nested;
    return undefined;
  }

  private extractCode(view: HttpErrorView): string | undefined {
    const body = view.body as Record<string, unknown> | undefined;
    if (!body) return undefined;
    const direct = body['code'];
    if (typeof direct === 'string') return direct;
    const nested = (body['error'] as Record<string, unknown> | undefined)?.[
      'code'
    ];
    if (typeof nested === 'string') return nested;
    return undefined;
  }
}
