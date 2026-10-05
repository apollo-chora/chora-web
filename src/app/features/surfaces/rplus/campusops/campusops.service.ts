/**
 * CampusopsService — R+ M15a Campus Operations provider (real BFF wiring).
 *
 * Per chora-web/CLAUDE.md §3 all HTTP goes through BffClientService.
 * Calls `GET /v1/campus` (list) and `POST /v1/campus` (create) on
 * chora-gateway, which proxies both verbatim to chora-delivery's
 * campusRootHandler (see
 * services/chora-delivery/internal/adapter/http/campus_list_handler.go
 * — GET → campusListHandler; POST → campusHandler in v1_handlers.go).
 * The downstream scopes/filters by the current tenant via the validated
 * mesh claims the gateway stamps (X-Tenant-Id); the FE always operates
 * on the calling tenant's campuses only.
 *
 * Backend list response shape: { items: BackendCampus[] }. Each row (and
 * the create 201 body) carries the canonical `campusDTO` fields (id /
 * tenant_id / name / address_l1 / address_l2 / city / country /
 * created_at / updated_at + optional deleted_at — soft-deleted rows are
 * never emitted by the list handler).
 *
 * Create payload (v1CreateCampusReq) is snake_case: { name, address_l1,
 * address_l2, city, country }. Domain validation (chora-delivery
 * campusops.NewCampus) requires `name` (non-empty) + `country` (valid
 * ISO 3166-1 alpha-2, e.g. `SG`); `address_l1` / `address_l2` / `city`
 * are optional. `tenant_id` is taken from the mesh claim, NOT the body.
 * Validation failures surface as 400 and are rendered loud by the
 * component (never swallowed).
 *
 * Per feedback_no_stubs_real_wiring this service NEVER substitutes a
 * mock; an empty backend response renders an empty-state in the
 * component template, and a failed create fails loud.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import type { Campus, CampusList } from './campusops.model';
import { composeDisplayAddress } from './campusops.model';

interface BackendCampus {
  readonly id: string;
  readonly tenant_id: string;
  readonly name: string;
  readonly address_l1?: string;
  readonly address_l2?: string;
  readonly city?: string;
  readonly country: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at?: string;
}

interface BackendCampusesList {
  readonly items: readonly BackendCampus[];
}

/**
 * Create-campus request (camelCase FE shape). Mapped to the snake_case
 * `v1CreateCampusReq` wire payload by {@link CampusopsService.create}.
 *
 * `name` + `country` are domain-required (chora-delivery NewCampus);
 * `addressLine1` / `addressLine2` / `city` are optional. `tenantId` is
 * NOT part of the request — it is stamped server-side from the mesh
 * claim (X-Tenant-Id) so the caller can never spoof it.
 */
export interface CreateCampusRequest {
  readonly name: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly city: string;
  /** ISO 3166-1 alpha-2 (e.g. `SG`). */
  readonly country: string;
}

@Injectable({ providedIn: 'root' })
export class CampusopsService {
  private readonly bff = inject(BffClientService);
  private readonly tenants = inject(TenantContextService);

  /**
   * Fetch the campus list for the current tenant.
   *
   * The downstream chora-delivery handler scopes by the mesh-claim
   * X-Tenant-Id header — no explicit query param is sent. Empty list
   * → empty-state render in the component.
   */
  getCampuses(): Observable<CampusList> {
    return this.bff.get<BackendCampusesList>('/v1/campus').pipe(
      map((resp) => ({
        tenantName: this.tenants.currentTenant()?.name ?? 'Current tenant',
        totalCampuses: resp.items.length,
        campuses: resp.items.map(mapBackendCampus),
      })),
    );
  }

  /**
   * Create a campus for the current tenant. Real POST /v1/campus →
   * chora-delivery campusHandler, which validates + persists and returns
   * the 201 `campusDTO` body. The body is mapped to the FE Campus model
   * so the caller can fold the freshly-created row into the UI if needed
   * (the component refetches the canonical list via reloadKey instead of
   * trusting an optimistic local insert).
   *
   * snake↔camel mapped on the wire: name / address_l1 / address_l2 /
   * city / country. No tenant_id is sent — the server stamps it from the
   * validated mesh claim. A backend 400 (missing name / invalid country)
   * propagates unmodified so the component renders it loud.
   */
  create(req: CreateCampusRequest): Observable<Campus> {
    return this.bff
      .post<BackendCampus>('/v1/campus', {
        name: req.name,
        address_l1: req.addressLine1,
        address_l2: req.addressLine2,
        city: req.city,
        country: req.country,
      })
      .pipe(map(mapBackendCampus));
  }
}

function mapBackendCampus(c: BackendCampus): Campus {
  const addressL1 = c.address_l1 ?? '';
  const addressL2 = c.address_l2 ?? '';
  const city = c.city ?? '';
  return {
    campusId: c.id,
    tenantId: c.tenant_id,
    name: c.name,
    addressLine1: addressL1,
    addressLine2: addressL2,
    city,
    country: c.country,
    displayAddress: composeDisplayAddress(addressL1, city, c.country),
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}
