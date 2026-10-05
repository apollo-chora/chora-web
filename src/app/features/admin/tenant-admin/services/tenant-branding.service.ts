/**
 * TenantBrandingService — tenant branding FE service.
 *
 * Two responsibilities, one service (shared by the Setup Wizard step 1
 * and the H+ Branding & Configuration page — do NOT fork a duplicate):
 *
 *   - `updateBranding` (CHO-1655 Phase A): wraps
 *     `PATCH /api/v1/tenants/me/branding` (chora-gateway BFF →
 *     chora-tenancy phyllis.UpdateMeBranding).
 *   - `hydrateBranding` (CHO-1709 WP-5): wraps
 *     `GET /api/v1/tenants/me` (CHO-1692 read path: gateway
 *     GetMyTenantV1 → chora-tenancy MeTenantHandler, pg-backed) and
 *     narrows the v1TenantDTO to a branding snapshot.
 *
 * Both surface discriminated results so components stay out of HTTP
 * minutiae and switch on `kind`. Error variants carry the upstream API
 * `code` from the shared `{"error":{"code","message"}}` envelope
 * (chora-tenancy v2WriteError + chora-gateway errResp) when present —
 * the H+ branding page renders it in its error banner.
 *
 * Per chora-web/CLAUDE.md §3 (BFF-only): goes through BffClientService,
 * never HttpClient directly, never fetch.
 *
 * Mirrors the bootstrap-tenant.service.ts pattern from CHO-1642 Phase 4
 * — that's the established shape for wizard-style flows that need
 * discriminated outcomes the component can render directly.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  errorCodeOf,
  errorMessageOf,
  httpErrorView,
  NO_ACTIVE_TENANT_CODE,
} from '../../../../core/interceptors/api-error.model';
import {
  BrandingHydrateResult,
  BrandingResponse,
  BrandingUpdatePayload,
  BrandingUpdateResult,
  MeTenantWire,
  TENANT_BRANDING_PATH,
  TENANT_ME_PATH,
  TenantBrandingSnapshot,
} from '../models/tenant-branding.model';

@Injectable({ providedIn: 'root' })
export class TenantBrandingService {
  private readonly bff = inject(BffClientService);

  /**
   * Update branding for the calling user's active tenant. tenant_id is
   * taken from the JWT by the BFF — never from the body. Empty / undef
   * fields are stripped before sending so the chora-tenancy handler's
   * PATCH-merge semantics preserve unspecified fields.
   */
  updateBranding(input: BrandingUpdatePayload): Observable<BrandingUpdateResult> {
    // Build a mutable record so empty / undefined fields can be stripped
    // before sending. chora-tenancy's PATCH-merge skips missing keys
    // (preserves prior values), so omit anything the caller didn't set.
    const body: Record<string, string> = {};
    if (input.primary_color_hex && input.primary_color_hex.length > 0) {
      body['primary_color_hex'] = input.primary_color_hex;
    }
    if (input.logo_url && input.logo_url.length > 0) {
      body['logo_url'] = input.logo_url;
    }
    if (input.custom_domain && input.custom_domain.length > 0) {
      body['custom_domain'] = input.custom_domain;
    }
    return this.bff.patch<BrandingResponse>(TENANT_BRANDING_PATH, body).pipe(
      map((response): BrandingUpdateResult => ({ kind: 'success', response })),
      catchError((err: unknown) => of(this.classify(err))),
    );
  }

  /**
   * Hydrate the calling tenant's branding from the pg-backed
   * GET /api/v1/tenants/me (CHO-1692). Returns the persisted snapshot
   * (string fields normalised to '' when absent) or a classified error
   * — never throws.
   */
  hydrateBranding(): Observable<BrandingHydrateResult> {
    return this.bff.get<MeTenantWire>(TENANT_ME_PATH).pipe(
      map(
        (wire): BrandingHydrateResult => ({
          kind: 'success',
          snapshot: this.toSnapshot(wire),
        }),
      ),
      catchError((err: unknown) => of(this.classifyHydrate(err))),
    );
  }

  private toSnapshot(wire: MeTenantWire): TenantBrandingSnapshot {
    return {
      displayName: wire.display_name ?? '',
      primaryColorHex: wire.branding?.primary_color_hex ?? '',
      logoUrl: wire.branding?.logo_url ?? '',
      customDomain: wire.branding?.custom_domain ?? '',
      wizardCompletedAt: wire.wizard_completed_at ?? null,
    };
  }

  private classify(err: unknown): BrandingUpdateResult {
    // httpErrorView, not `instanceof HttpErrorResponse`: the global
    // errorInterceptor rethrows every failure as ApiError, so the instanceof
    // matched only in specs and this whole switch was unreachable in the app.
    const view = httpErrorView(err);
    if (!view) {
      return { kind: 'network-error' };
    }
    const code = errorCodeOf(view);
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 401:
      case 403:
        return { kind: 'unauthenticated', code };
      case 409:
        if (code === NO_ACTIVE_TENANT_CODE) {
          return { kind: 'no-active-tenant', code };
        }
        return { kind: 'server-error', code };
      case 404:
        return { kind: 'tenant-not-found', code };
      case 400:
      case 422: {
        const message =
          errorMessageOf(view) ?? 'Branding update failed validation.';
        return { kind: 'invalid', message, code };
      }
      default:
        // 5xx + anything else falls through to server-error so the
        // wizard surfaces a uniform "try again" toast.
        return { kind: 'server-error', code };
    }
  }

  private classifyHydrate(err: unknown): BrandingHydrateResult {
    const view = httpErrorView(err);
    if (!view) {
      return { kind: 'network-error' };
    }
    const code = errorCodeOf(view);
    switch (view.status) {
      case 0:
        return { kind: 'network-error' };
      case 400:
      case 401:
      case 403:
        // 400 here is the gateway's GATEWAY_TENANT_NOT_RESOLVED (JWT
        // without tenant context) — remedy is re-auth, not a form fix.
        return { kind: 'unauthenticated', code };
      case 404:
        return { kind: 'tenant-not-found', code };
      default:
        return { kind: 'server-error', code };
    }
  }

  /**
   * Pull the upstream API code from the shared error envelope
   * `{"error":{"code","message"}}`. Undefined when the body carries no
   * envelope (e.g. a bare proxy 5xx) — consumers fall back per-kind.
   */
}
