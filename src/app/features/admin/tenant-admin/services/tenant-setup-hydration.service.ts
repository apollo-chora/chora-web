/**
 * TenantSetupHydrationService — Setup Wizard re-entry hydration
 * (CHO-1692 Phase D FE).
 *
 * Issues `GET /api/tenants/me` (tenant doc — branding +
 * `wizard_completed_at`) and `GET /api/v1/tenants/me/idp-providers`
 * (CHO-1692 BE) in parallel and stitches the responses into a single
 * `HydrationState` the wizard component consumes.
 *
 * Per chora-web/CLAUDE.md §3 (BFF-only): all HTTP goes through
 * BffClientService, never HttpClient directly, never fetch.
 *
 * Fault-tolerance contract — read carefully:
 *  - The Observable NEVER errors. Per-source failure (5xx / network /
 *    401) yields `null` for that slice + flips
 *    `sources.{tenant|idp}` to `'failed'`. Sibling slices continue.
 *  - This matters because the wizard's pre-fix Apply was always safe
 *    to retry idempotently — losing a hydration GET should fall back
 *    to "show defaults" (the pre-hydration UX), NOT crash the wizard.
 *
 * `client_secret` invariant:
 *  - The chora-identity GET endpoint omits `client_secret` from the
 *    wire (Secret Manager-resident). The hydrated `HydrationIdentity`
 *    type MIRRORS that omission — there is no field to copy into.
 *    Even if a future BE bug somehow surfaces the value, the
 *    structural copy below (only-named-field assignment) refuses to
 *    forward it. The service spec asserts this runtime invariant.
 *
 * IdP row selection:
 *  - The current wizard captures one provider_type at a time. When
 *    multiple rows are returned (e.g. the tenant has OIDC + singpass
 *    configured), the FIRST row from the contract envelope wins. The
 *    BE's `ListByTenant` doesn't currently order results
 *    deterministically; that's a follow-up if multi-row hydration
 *    becomes load-bearing (out of scope for CHO-1692 per the Jira's
 *    "Out of scope" section).
 */
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  HYDRATION_IDP_PROVIDERS_PATH,
  HYDRATION_TENANT_PATH,
  HydrationBranding,
  HydrationIdentity,
  HydrationState,
  MeIdpProviderRowWire,
  MeIdpProvidersHydrationWire,
  MeTenantHydrationWire,
} from '../models/tenant-setup-hydration.model';

interface TenantResult {
  readonly status: 'ok' | 'failed';
  readonly branding: HydrationBranding | null;
  readonly wizardCompletedAt: string | null;
}

interface IdpResult {
  readonly status: 'ok' | 'failed';
  readonly identity: HydrationIdentity | null;
}


@Injectable({ providedIn: 'root' })
export class TenantSetupHydrationService {
  private readonly bff = inject(BffClientService);

  /**
   * Run the parallel hydration GETs and return a single stitched
   * HydrationState. NEVER throws (per-source failure → null slice).
   */
  hydrate(): Observable<HydrationState> {
    return forkJoin({
      tenant: this.fetchTenant(),
      idp: this.fetchIdp(),
    }).pipe(
      map(({ tenant, idp }) => ({
        branding: tenant.branding,
        identity: idp.identity,
        wizardCompletedAt: tenant.wizardCompletedAt,
        sources: {
          tenant: tenant.status,
          idp: idp.status,
        },
      })),
    );
  }

  private fetchTenant(): Observable<TenantResult> {
    return this.bff.get<MeTenantHydrationWire>(HYDRATION_TENANT_PATH).pipe(
      map((wire): TenantResult => ({
        status: 'ok',
        branding: this.normalizeBranding(wire),
        wizardCompletedAt: wire.wizard_completed_at ?? null,
      })),
      catchError(() =>
        of<TenantResult>({
          status: 'failed',
          branding: null,
          wizardCompletedAt: null,
        }),
      ),
    );
  }

  private fetchIdp(): Observable<IdpResult> {
    return this.bff
      .get<MeIdpProvidersHydrationWire>(HYDRATION_IDP_PROVIDERS_PATH)
      .pipe(
        map((wire): IdpResult => ({
          status: 'ok',
          identity: this.normalizeIdentity(wire.items?.[0]),
        })),
        catchError(() =>
          of<IdpResult>({
            status: 'failed',
            identity: null,
          }),
        ),
      );
  }

  private normalizeBranding(
    wire: MeTenantHydrationWire,
  ): HydrationBranding | null {
    const b = wire.branding;
    if (!b) return null;
    const primary = b.primary_color_hex?.trim() ?? '';
    const logo = b.logo_url?.trim() ?? '';
    if (primary.length === 0 && logo.length === 0) return null;
    return {
      primary_color_hex: primary.length > 0 ? primary : null,
      logo_url: logo.length > 0 ? logo : null,
    };
  }

  private normalizeIdentity(
    row: MeIdpProviderRowWire | undefined,
  ): HydrationIdentity | null {
    if (!row) return null;
    if (row.provider_type === 'saml') {
      // The wizard's step 3 only accepts oidc + singpass today. A SAML
      // row on the BE means a different admin flow configured it; the
      // wizard cannot meaningfully hydrate SAML, so treat as no signal.
      return null;
    }
    return {
      provider_type: row.provider_type,
      client_id: row.client_id ?? '',
      discovery_url: row.discovery_url ?? '',
      singpass_enabled: row.singpass_enabled,
      client_secret_name: row.client_secret_name ?? null,
    };
  }
}
