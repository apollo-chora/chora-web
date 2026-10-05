/**
 * FranchiseeEntitySearchPort — real `EntitySearchPort` adapter (CHO-1930 /
 * ADR-205) that advances chora-entity-picker B0 → B2 for the `franchisee`
 * entity kind. Fed into the transaction-history MASTER franchisee filter via
 * `[searchPortOverride]`.
 *
 * Backing route: `GET /api/v1/admin/transactions/franchisees` (MASTER /
 * PLATFORM_OPERATOR only) — the child-tenant name list served from the ledger
 * domain's own `tenants` registry (no cross-DB JOIN). Maps `{tenant_id,name}`
 * → EntityRef so the operator picks franchisees by NAME instead of pasting an
 * opaque tenant UUID.
 *
 * Fail-loud (no silent empty): search errors PROPAGATE so the picker renders its
 * error state; they are never swallowed into an empty page.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { type Observable, map, of } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  EntityFacets,
  EntityRef,
  EntitySearchPage,
  EntitySearchPort,
  EntityType,
} from '../../chora-entity-picker/entity-picker.model';

/** One franchisee row from the list endpoint. */
interface FranchiseeRow {
  readonly tenant_id: string;
  readonly name?: string | null;
}

/** `GET /api/v1/admin/transactions/franchisees` response shape. */
interface FranchiseeListResponse {
  readonly franchisees?: readonly FranchiseeRow[];
  readonly next_page_token?: string | null;
}

@Injectable({ providedIn: 'root' })
export class FranchiseeEntitySearchPort implements EntitySearchPort {
  private readonly bff = inject(BffClientService);

  readonly entityType: EntityType = 'franchisee';

  search(
    q: string,
    _facets: EntityFacets,
    cursor: string | null,
  ): Observable<EntitySearchPage> {
    let params = new HttpParams().set('q', q);
    if (cursor) {
      params = params.set('page_token', cursor);
    }
    return this.bff
      .get<FranchiseeListResponse>(
        '/api/v1/admin/transactions/franchisees',
        params,
      )
      .pipe(map((res) => this.toPage(res)));
  }

  /**
   * Best-effort hydration: no batch-by-id endpoint, so a pre-set id resolves to
   * itself as the label (fail-loud honest — never a fabricated name). Selected
   * chips already carry their name (parent owns `value`).
   */
  resolve(ids: readonly string[]): Observable<readonly EntityRef[]> {
    return of(ids.map((id) => ({ id, label: id })));
  }

  private toPage(res: FranchiseeListResponse): EntitySearchPage {
    const items: EntityRef[] = (res.franchisees ?? []).map((f) => ({
      id: f.tenant_id,
      label: (f.name ?? '').trim() || f.tenant_id,
    }));
    return { items, nextCursor: res.next_page_token ?? null };
  }
}
